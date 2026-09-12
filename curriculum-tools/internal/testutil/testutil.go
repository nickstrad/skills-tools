// Package testutil builds fixture courses for tests. It never touches a real course directory.
package testutil

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"skills-tools/tutor/internal/course"
)

// Fixture is a temporary repository layout: Repo/curriculum-tools (Root) and Repo/future-courses.
type Fixture struct {
	Repo    string
	Root    string
	Course  course.Course
	Lessons []course.Lesson
	Prereqs map[int][]string // ordinal -> prerequisite slugs
}

// Lesson returns a deterministic sample lesson for an ordinal; slug lesson-NN.
func Lesson(ordinal int) course.Lesson {
	l := course.Lesson{
		Ordinal:          ordinal,
		Slug:             fmt.Sprintf("lesson-%02d", ordinal),
		Title:            fmt.Sprintf("Lesson %d title", ordinal),
		Category:         "core",
		Difficulty:       "beginner",
		Tags:             []string{"demo", fmt.Sprintf("topic-%d", (ordinal-1)%3+1)},
		Prerequisites:    []int{},
		Overview:         fmt.Sprintf("Overview of lesson %d.", ordinal),
		SyntaxBreakdown:  "### In plain terms\n\nA sample breakdown.\n\n```text\nclient --> server\n```",
		Code:             fmt.Sprintf("printf 'lesson %d ok\\n'", ordinal),
		ExpectedResult:   fmt.Sprintf("lesson %d ok", ordinal),
		SystemsLens:      "One idea made concrete.",
		SafetyLevel:      "read-only",
		RunIn:            "shell",
		Sessions:         1,
		MinVersion:       "5.1",
		EstimatedMinutes: 5,
		Revision:         1,
	}
	if ordinal <= 2 {
		l.Category = "intro"
	}
	if ordinal%2 == 0 {
		l.Difficulty = "intermediate"
		l.Setup = "mkdir -p \"$LAB\""
		l.Challenge = "Predict what changes with two sessions."
	}
	if ordinal%3 == 0 {
		l.Sessions = 2
		l.Caution = "Writes to the lab directory only."
		l.Code = "-- Session A\nprintf 'from-A' > \"$LAB/shared\"\n-- Session B\ncat \"$LAB/shared\""
	}
	if ordinal > 1 {
		l.Prerequisites = []int{ordinal - 1}
	}
	return l
}

// NewCourse writes a Bash-mode fixture course "demo" with n sample lessons into a temp repo.
func NewCourse(t testing.TB, n int) *Fixture {
	t.Helper()
	c := course.Course{
		ID: "demo", Name: "Demo Course", Description: "A fixture course", Tool: "bash",
		MinVersion: "5.1", Revision: 1,
		Repl: &course.Repl{Command: []string{"bash", "--noprofile", "--norc"}, Echo: "unused {marker}", Quit: "exit", Mode: "shell"},
	}
	lessons := make([]course.Lesson, 0, n)
	for i := 1; i <= n; i++ {
		lessons = append(lessons, Lesson(i))
	}
	return WriteCourse(t, c, lessons)
}

// WriteCourse writes course.json and one lesson file per lesson into a fresh temp repo.
// Prerequisite ordinals are translated to slugs using the given lessons.
func WriteCourse(t testing.TB, c course.Course, lessons []course.Lesson) *Fixture {
	t.Helper()
	repo := t.TempDir()
	f := &Fixture{Repo: repo, Root: filepath.Join(repo, "curriculum-tools"), Course: c, Lessons: lessons, Prereqs: map[int][]string{}}
	dir := filepath.Join(f.Root, "courses", c.ID)
	must(t, os.MkdirAll(filepath.Join(dir, "lessons"), 0o755))
	must(t, os.MkdirAll(filepath.Join(repo, "future-courses"), 0o755))
	data, err := json.MarshalIndent(c, "", "  ")
	must(t, err)
	must(t, os.WriteFile(filepath.Join(dir, "course.json"), append(data, '\n'), 0o644))
	slugByOrdinal := map[int]string{}
	for _, l := range lessons {
		slugByOrdinal[l.Ordinal] = l.Slug
	}
	for _, l := range lessons {
		var prereqs []string
		for _, p := range l.Prerequisites {
			prereqs = append(prereqs, slugByOrdinal[p])
		}
		f.Prereqs[l.Ordinal] = prereqs
		f.WriteLesson(t, l, prereqs)
	}
	return f
}

// WriteLesson (re)writes one lesson file in the fixture course.
func (f *Fixture) WriteLesson(t testing.TB, l course.Lesson, prereqSlugs []string) {
	t.Helper()
	path := filepath.Join(f.Root, "courses", f.Course.ID, "lessons", course.FileName(l.Ordinal, l.Slug))
	must(t, os.WriteFile(path, course.FormatLessonFile(f.Course, l, prereqSlugs), 0o644))
}

// CourseDir returns the fixture course directory.
func (f *Fixture) CourseDir() string { return filepath.Join(f.Root, "courses", f.Course.ID) }

// CanonicalPlan renders a Markdown plan with a canonical route table. Entries are "Title / slug".
func CanonicalPlan(name, id string, entries []string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\nCourse ID: `%s`\n\nStatus: proposed\n\n## Canonical route\n\n| # | Lesson / stable slug | Outcome |\n| --- | --- | --- |\n", name, id)
	for i, e := range entries {
		title, slug, _ := strings.Cut(e, " / ")
		fmt.Fprintf(&b, "| %d | %s / `%s` | Observe it |\n", i+1, title, slug)
	}
	return b.String()
}

// WritePlan writes courses/<id>/PLAN.md with a canonical route made of the fixture lessons plus
// any extra "Title / slug" entries (planned, not authored).
func (f *Fixture) WritePlan(t testing.TB, extra ...string) string {
	t.Helper()
	var entries []string
	for _, l := range f.Lessons {
		entries = append(entries, l.Title+" / "+l.Slug)
	}
	entries = append(entries, extra...)
	path := filepath.Join(f.CourseDir(), "PLAN.md")
	must(t, os.WriteFile(path, []byte(CanonicalPlan(f.Course.Name, f.Course.ID, entries)), 0o644))
	return path
}

// WriteFuturePlan writes Repo/future-courses/<folder>/course.md for a plan-only course.
func (f *Fixture) WriteFuturePlan(t testing.TB, folder, name, id string, entries []string) string {
	t.Helper()
	dir := filepath.Join(f.Repo, "future-courses", folder)
	must(t, os.MkdirAll(dir, 0o755))
	path := filepath.Join(dir, "course.md")
	must(t, os.WriteFile(path, []byte(CanonicalPlan(name, id, entries)), 0o644))
	return path
}

func must(t testing.TB, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
