// Package scaffold creates a new course skeleton under courses/<id>/ from templates/course/.
//
// It ports the Deno scaffoldCourse (src/new_course.ts) behavior: validate the id, resolve any
// planned route before writing anything (so a duplicate future identity leaves no partial
// course behind), refuse an existing course directory, copy the template tree with placeholder
// substitution, and symlink a located plan as PLAN.md. Unlike the Deno version the scaffold never
// copies an example lesson into a real course: it ships an empty lessons/ directory with a
// .gitkeep placeholder instead.
package scaffold

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"skills-tools/tutor/internal/course"
	"skills-tools/tutor/internal/route"
)

// Vars are the placeholder values substituted into templates/course/.
type Vars struct {
	ID          string
	Name        string
	Tool        string
	Description string
	MinVersion  string
}

var placeholderRE = regexp.MustCompile(`\{\{(\w+)\}\}`)

// exampleLesson is the one template file that must never be copied into a real course: the
// scaffold ships an empty lessons/ directory instead.
const exampleLesson = "lessons/01-example.md"

// Course scaffolds courses/<id>/ from templates/course/ under root (the curriculum-tools
// directory). It returns the paths written, relative to the course directory, in the order they
// were written: template files (course.json first, by template layout), then lessons/.gitkeep,
// then PLAN.md when a plan was located.
func Course(root string, v Vars) ([]string, error) {
	if !course.ValidSlug(v.ID) {
		return nil, fmt.Errorf("invalid course id: %s", v.ID)
	}
	// Resolve the plan before creating any scaffold file so duplicate future identities leave no
	// partial course behind.
	plan, err := route.LocatePlan(root, v.ID)
	if err != nil {
		return nil, err
	}
	if plan != nil && plan.Future {
		if _, err := route.ReadPlan(root, v.ID); err != nil {
			return nil, err
		}
	}

	target := filepath.Join(root, "courses", v.ID)
	if _, statErr := os.Stat(target); statErr == nil {
		return nil, fmt.Errorf("course %s already exists at %s", v.ID, target)
	} else if !os.IsNotExist(statErr) {
		return nil, statErr
	}

	identities, err := route.DiscoverIdentities(root)
	if err != nil {
		return nil, err
	}
	// A matching planned ID may be implemented; existing public commands and aliases may not
	// be reused as the physical identity of a different course.
	var remaining []route.CourseDiscovery
	for _, c := range identities {
		if c.Implemented && (c.ID == v.ID || c.StorageID() == v.ID) {
			return nil, fmt.Errorf("course %s already exists as %s", v.ID, c.ID)
		}
		if c.Planned && c.ID == v.ID {
			continue
		}
		remaining = append(remaining, c)
	}
	if err := route.ValidateNames(append(remaining, route.CourseDiscovery{ID: v.ID})); err != nil {
		return nil, err
	}

	values := map[string]string{
		"id":          v.ID,
		"name":        v.Name,
		"tool":        v.Tool,
		"description": v.Description,
		"minVersion":  v.MinVersion,
	}

	templateDir := filepath.Join(root, "templates", "course")
	var written []string
	walkErr := filepath.WalkDir(templateDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(templateDir, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if rel == exampleLesson {
			// Do not copy the example lesson into a real course.
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		text, err := substitute(rel, string(data), values)
		if err != nil {
			return err
		}
		outPath := filepath.Join(target, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(outPath, []byte(text), 0o644); err != nil {
			return err
		}
		written = append(written, rel)
		return nil
	})
	if walkErr != nil {
		return nil, walkErr
	}

	// The scaffold is an empty shell: ship lessons/ as an empty directory (git does not track
	// empty directories, so add a .gitkeep placeholder).
	lessonsDir := filepath.Join(target, "lessons")
	if err := os.MkdirAll(lessonsDir, 0o755); err != nil {
		return nil, err
	}
	if err := os.WriteFile(filepath.Join(lessonsDir, ".gitkeep"), nil, 0o644); err != nil {
		return nil, err
	}
	written = append(written, "lessons/.gitkeep")

	if plan != nil {
		// Keep the agreed Markdown route canonical. A relative symlink keeps the scaffold
		// portable when the repository is moved and lets route/build share the same source of
		// truth.
		link := filepath.Join(target, "PLAN.md")
		relPlan, err := filepath.Rel(target, plan.Path)
		if err != nil {
			return nil, err
		}
		if err := os.Symlink(relPlan, link); err != nil {
			return nil, err
		}
		written = append(written, "PLAN.md")
	}

	return written, nil
}

// substitute replaces every {{key}} placeholder in text with its value. Values are substituted
// as plain text everywhere except inside course.json, which is a JSON template: there, a value
// is JSON-escaped (via json.Marshal, HTML escaping disabled to match Deno's JSON.stringify) so
// descriptions or names containing quotes, backslashes or newlines still round-trip as valid
// JSON. An unknown key is an error naming the template and the key.
func substitute(rel, text string, values map[string]string) (string, error) {
	var firstErr error
	out := placeholderRE.ReplaceAllStringFunc(text, func(m string) string {
		if firstErr != nil {
			return m
		}
		key := placeholderRE.FindStringSubmatch(m)[1]
		value, ok := values[key]
		if !ok {
			firstErr = fmt.Errorf("template %s uses unknown {{%s}}", rel, key)
			return m
		}
		if rel == "course.json" {
			encoded, err := jsonString(value)
			if err != nil {
				firstErr = err
				return m
			}
			return encoded
		}
		return value
	})
	if firstErr != nil {
		return "", firstErr
	}
	return out, nil
}

// jsonString returns value JSON-encoded as a string literal, with the surrounding quotes
// stripped (so it can be substituted inside an existing "..." in a JSON template). HTML escaping
// is disabled to match Deno's JSON.stringify.
func jsonString(value string) (string, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(value); err != nil {
		return "", err
	}
	s := strings.TrimSuffix(buf.String(), "\n")
	return s[1 : len(s)-1], nil
}

// NextHint is the guidance line printed after a successful scaffold.
func NextHint(id string) string {
	return fmt.Sprintf("Next: add lessons/01-<slug>.md, then tutor %s check && tutor %s init", id, id)
}

// Report assembles the message printed after Course succeeds: the written paths followed by a
// blank line and NextHint. It does not end with a trailing newline; the caller prints it with a
// function that adds one (e.g. fmt.Fprintln).
func Report(id string, written []string) string {
	lines := make([]string, 0, len(written)+1)
	lines = append(lines, fmt.Sprintf("Created course %s:", id))
	for _, w := range written {
		lines = append(lines, "  "+w)
	}
	return strings.Join(lines, "\n") + "\n\n" + NextHint(id)
}
