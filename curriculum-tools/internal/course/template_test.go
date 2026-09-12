package course_test

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"skills-tools/tutor/internal/course"
)

// templateCourse mirrors templates/course/course.json with its placeholders substituted, matching
// the "example" course id the template test lays out under a temp root.
var templateCourse = course.Course{
	ID:          "example",
	Name:        "Example Course",
	Description: "Example course description.",
	Tool:        "bash",
	MinVersion:  "1",
	Revision:    1,
}

// copyTemplateCourse copies templates/course into <root>/courses/example, substituting the
// course.json placeholders so it parses as a valid course named "example".
func copyTemplateCourse(t *testing.T, root string) {
	t.Helper()
	templatesDir, err := filepath.Abs(filepath.Join("..", "..", "templates", "course"))
	if err != nil {
		t.Fatal(err)
	}
	courseDir := filepath.Join(root, "courses", "example")
	if err := os.MkdirAll(filepath.Join(courseDir, "lessons"), 0o755); err != nil {
		t.Fatal(err)
	}

	raw, err := os.ReadFile(filepath.Join(templatesDir, "course.json"))
	if err != nil {
		t.Fatal(err)
	}
	replacer := strings.NewReplacer(
		"{{id}}", templateCourse.ID,
		"{{name}}", templateCourse.Name,
		"{{tool}}", templateCourse.Tool,
		"{{description}}", templateCourse.Description,
		"{{minVersion}}", templateCourse.MinVersion,
	)
	substituted := replacer.Replace(string(raw))
	if err := os.WriteFile(filepath.Join(courseDir, "course.json"), []byte(substituted), 0o644); err != nil {
		t.Fatal(err)
	}

	lessonData, err := os.ReadFile(filepath.Join(templatesDir, "lessons", "01-example.md"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(courseDir, "lessons", "01-example.md"), lessonData, 0o644); err != nil {
		t.Fatal(err)
	}
}

// TestTemplateCourseLoads verifies that templates/course/, with its course.json placeholders
// substituted, is a valid course whose single example lesson has non-empty Setup, Caution and
// Challenge (so it demonstrates every optional and required section).
func TestTemplateCourseLoads(t *testing.T) {
	root := t.TempDir()
	copyTemplateCourse(t, root)

	c, err := course.LoadCourse(root, "example")
	if err != nil {
		t.Fatalf("LoadCourse: %v", err)
	}
	if c.ID != "example" {
		t.Fatalf("course id = %q, want %q", c.ID, "example")
	}

	lessons, err := course.LoadLessons(root, "example")
	if err != nil {
		t.Fatalf("LoadLessons: %v", err)
	}
	if len(lessons) != 1 {
		t.Fatalf("len(lessons) = %d, want 1", len(lessons))
	}
	l := lessons[0]
	if l.Slug != "example" {
		t.Fatalf("lesson slug = %q, want %q", l.Slug, "example")
	}
	if strings.TrimSpace(l.Setup) == "" {
		t.Fatal("example lesson Setup is empty; template must show the optional Setup section")
	}
	if strings.TrimSpace(l.Caution) == "" {
		t.Fatal("example lesson Caution is empty; template must show the optional Caution section")
	}
	if strings.TrimSpace(l.Challenge) == "" {
		t.Fatal("example lesson Challenge is empty; template must show the optional variation section")
	}
}

// TestTemplateLessonFormatIsCanonical verifies that FormatLessonFile reproduces
// templates/course/lessons/01-example.md byte-for-byte, so the template file is itself the
// canonical rendering of its own Lesson (no hand-drift from the grammar in §3.1).
func TestTemplateLessonFormatIsCanonical(t *testing.T) {
	root := t.TempDir()
	copyTemplateCourse(t, root)

	c, err := course.LoadCourse(root, "example")
	if err != nil {
		t.Fatalf("LoadCourse: %v", err)
	}
	lessons, err := course.LoadLessons(root, "example")
	if err != nil {
		t.Fatalf("LoadLessons: %v", err)
	}
	if len(lessons) != 1 {
		t.Fatalf("len(lessons) = %d, want 1", len(lessons))
	}

	templatesDir, err := filepath.Abs(filepath.Join("..", "..", "templates", "course"))
	if err != nil {
		t.Fatal(err)
	}
	want, err := os.ReadFile(filepath.Join(templatesDir, "lessons", "01-example.md"))
	if err != nil {
		t.Fatal(err)
	}

	got := course.FormatLessonFile(c, lessons[0], nil)
	if !bytes.Equal(got, want) {
		t.Fatalf("FormatLessonFile does not reproduce the template lesson byte-for-byte\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}
