// Package course loads course metadata and lesson files.
//
// A course lives in <root>/courses/<id>/ with a course.json and one Markdown file per lesson in
// lessons/NN-<slug>.md. The lesson file grammar is documented in curriculum-tools/docs/AUTHORING.md
// and implemented by ParseLessonFile / FormatLessonFile, which round-trip byte-for-byte.
package course

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
)

// Repl describes the interactive process the validation harness drives for a course.
type Repl struct {
	Command []string          `json:"command"`
	Echo    string            `json:"echo"`
	Quit    string            `json:"quit"`
	Mode    string            `json:"mode,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
}

// Course is the metadata stored in courses/<id>/course.json.
type Course struct {
	ID          string `json:"id"`
	CommandName string `json:"commandName,omitempty"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Status      string `json:"status,omitempty"`
	Tool        string `json:"tool"`
	MinVersion  string `json:"minVersion"`
	Revision    int    `json:"revision"`
	Repl        *Repl  `json:"repl,omitempty"`
}

// PublicName is the invocable command name; ID remains the on-disk and progress identity.
func (c Course) PublicName() string {
	if c.CommandName != "" {
		return c.CommandName
	}
	return c.ID
}

// Lesson is one hands-on lesson. Prerequisites are ordinals of earlier lessons.
type Lesson struct {
	Ordinal          int      `json:"ordinal"`
	Slug             string   `json:"slug"`
	Title            string   `json:"title"`
	Category         string   `json:"category"`
	Difficulty       string   `json:"difficulty"`
	Tags             []string `json:"tags"`
	Prerequisites    []int    `json:"prerequisites"`
	Overview         string   `json:"overview"`
	SyntaxBreakdown  string   `json:"syntaxBreakdown"`
	Setup            string   `json:"setup,omitempty"`
	Code             string   `json:"code"`
	ExpectedResult   string   `json:"expectedResult"`
	SystemsLens      string   `json:"systemsLens"`
	Challenge        string   `json:"challenge,omitempty"`
	Caution          string   `json:"caution,omitempty"`
	SafetyLevel      string   `json:"safetyLevel"`
	RunIn            string   `json:"runIn"`
	Sessions         int      `json:"sessions"`
	MinVersion       string   `json:"minVersion"`
	EstimatedMinutes int      `json:"estimatedMinutes"`
	Revision         int      `json:"revision"`
}

var slugRE = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// ValidSlug reports whether s is lowercase kebab-case.
func ValidSlug(s string) bool { return slugRE.MatchString(s) }

// Dir returns <root>/courses/<id> after validating the identifier.
func Dir(root, id string) (string, error) {
	if !ValidSlug(id) {
		return "", fmt.Errorf("invalid course id: %s", id)
	}
	return filepath.Join(root, "courses", id), nil
}

// LessonsDir returns the lesson file directory of a course.
func LessonsDir(root, id string) (string, error) {
	dir, err := Dir(root, id)
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "lessons"), nil
}

// LoadCourse reads and validates courses/<id>/course.json.
func LoadCourse(root, id string) (Course, error) {
	dir, err := Dir(root, id)
	if err != nil {
		return Course{}, err
	}
	file := filepath.Join(dir, "course.json")
	data, err := os.ReadFile(file)
	if err != nil {
		return Course{}, err
	}
	var c Course
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&c); err != nil {
		return Course{}, fmt.Errorf("%s: %w", file, err)
	}
	if c.ID != id {
		return Course{}, fmt.Errorf("%s declares id %s, expected %s", file, c.ID, id)
	}
	if c.CommandName != "" && !ValidSlug(c.CommandName) {
		return Course{}, fmt.Errorf("%s: invalid commandName %q", file, c.CommandName)
	}
	if c.Name == "" || c.Tool == "" {
		return Course{}, fmt.Errorf("%s: name and tool are required", file)
	}
	return c, nil
}

// ListCourses returns every directory under <root>/courses with a valid course.json, sorted by id.
// Directories without a valid course.json are skipped silently.
func ListCourses(root string) ([]Course, error) {
	entries, err := os.ReadDir(filepath.Join(root, "courses"))
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var courses []Course
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		c, err := LoadCourse(root, e.Name())
		if err != nil {
			continue
		}
		courses = append(courses, c)
	}
	sort.Slice(courses, func(i, j int) bool { return courses[i].ID < courses[j].ID })
	return courses, nil
}
