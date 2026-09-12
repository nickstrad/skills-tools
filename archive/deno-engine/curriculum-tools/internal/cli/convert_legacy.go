// The one-time legacy converter: ConvertLegacy reads a course's legacy lessons.json catalog and
// writes the equivalent courses/<id>/lessons/NN-<slug>.md files using the course package's grammar
// writer (internal/course.FormatLessonFile). newConvertLegacyCmd wraps it as a hidden subcommand of
// the tutor tree, using the root the CLI already resolved (--root, $TUTOR_ROOT or the launcher's
// checkout). It is expected to be removed once every course has migrated (see plan.md WP1.2).
package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"skills-tools/tutor/internal/course"
)

// decodeLessonsStrict decodes a legacy lessons.json array into []course.Lesson, rejecting unknown
// fields and any trailing data after the JSON array. This is a local, unexported stand-in for the
// shared internal/fsutil.DecodeStrict helper another work package is adding concurrently; it is
// not imported here to avoid a cross-package dependency during that overlap.
func decodeLessonsStrict(data []byte) ([]course.Lesson, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var lessons []course.Lesson
	if err := dec.Decode(&lessons); err != nil {
		return nil, err
	}
	var trailing json.RawMessage
	if err := dec.Decode(&trailing); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("unexpected trailing data after the JSON array")
		}
		return nil, err
	}
	return lessons, nil
}

// ConvertLegacy reads courses/<id>/lessons.json (the legacy JSON catalog, ordinals in
// prerequisites) and writes one Markdown lesson file per entry into courses/<id>/lessons/,
// mapping each prerequisite ordinal to its slug for the file grammar. It refuses to run if the
// lessons directory already exists, so it is safe to call at most once per course. It returns the
// number of files written.
func ConvertLegacy(root, id string) (int, error) {
	dir, err := course.Dir(root, id)
	if err != nil {
		return 0, err
	}
	lessonsDir, err := course.LessonsDir(root, id)
	if err != nil {
		return 0, err
	}
	if _, err := os.Stat(lessonsDir); err == nil {
		return 0, fmt.Errorf("%s already exists; refusing to overwrite", lessonsDir)
	} else if !os.IsNotExist(err) {
		return 0, err
	}

	c, err := course.LoadCourse(root, id)
	if err != nil {
		return 0, err
	}

	legacyFile := filepath.Join(dir, "lessons.json")
	data, err := os.ReadFile(legacyFile)
	if err != nil {
		return 0, err
	}
	lessons, err := decodeLessonsStrict(data)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", legacyFile, err)
	}

	slugByOrdinal := make(map[int]string, len(lessons))
	for _, l := range lessons {
		slugByOrdinal[l.Ordinal] = l.Slug
	}

	if err := os.MkdirAll(lessonsDir, 0o755); err != nil {
		return 0, err
	}
	for _, l := range lessons {
		prereqSlugs := make([]string, 0, len(l.Prerequisites))
		for _, ord := range l.Prerequisites {
			slug, ok := slugByOrdinal[ord]
			if !ok {
				return 0, fmt.Errorf("%s: lesson %d (%s): unknown prerequisite ordinal %d", legacyFile, l.Ordinal, l.Slug, ord)
			}
			prereqSlugs = append(prereqSlugs, slug)
		}
		path := filepath.Join(lessonsDir, course.FileName(l.Ordinal, l.Slug))
		if err := os.WriteFile(path, course.FormatLessonFile(c, l, prereqSlugs), 0o644); err != nil {
			return 0, err
		}
	}
	return len(lessons), nil
}

// newConvertLegacyCmd is the hidden "tutor convert-legacy <course>" command, built fresh for one
// invocation against the already-resolved curriculum root.
func newConvertLegacyCmd(root string, stdout io.Writer) *cobra.Command {
	return &cobra.Command{
		Use:    "convert-legacy <course>",
		Short:  "Convert a legacy lessons.json catalog to Markdown lesson files (one-time, hidden)",
		Hidden: true,
		Args:   exactArgs(1, "tutor convert-legacy <course>"),
		RunE: func(_ *cobra.Command, args []string) error {
			id := args[0]
			n, err := ConvertLegacy(root, id)
			if err != nil {
				return err
			}
			lessonsDir, err := course.LessonsDir(root, id)
			if err != nil {
				return err
			}
			fmt.Fprintf(stdout, "Converted %d lessons of %s into %s\n", n, id, lessonsDir)
			return nil
		},
	}
}
