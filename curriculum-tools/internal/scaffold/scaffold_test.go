package scaffold_test

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"skills-tools/tutor/internal/course"
	"skills-tools/tutor/internal/scaffold"
	"skills-tools/tutor/internal/testutil"
)

// newRepo builds a temp repository with curriculum-tools/templates/course copied from the real
// template tree and curriculum-tools/courses/ present. It returns a Fixture whose Repo/Root
// fields point at the new tree so testutil's plan-writing helpers can be reused.
func newRepo(t *testing.T) *testutil.Fixture {
	t.Helper()
	repo := t.TempDir()
	root := filepath.Join(repo, "curriculum-tools")
	mustNil(t, os.MkdirAll(filepath.Join(root, "courses"), 0o755))
	mustNil(t, os.MkdirAll(filepath.Join(repo, "future-courses"), 0o755))
	copyTemplateDir(t, root)
	return &testutil.Fixture{Repo: repo, Root: root}
}

// copyTemplateDir copies the repository's real templates/course into <root>/templates/course.
func copyTemplateDir(t *testing.T, root string) {
	t.Helper()
	// This test file lives at curriculum-tools/internal/scaffold/scaffold_test.go; the real
	// template tree is two levels up at curriculum-tools/templates/course.
	src := filepath.Join("..", "..", "templates", "course")
	dst := filepath.Join(root, "templates", "course")
	mustNil(t, os.MkdirAll(dst, 0o755))
	err := filepath.WalkDir(src, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		out := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(out, 0o755)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(out, data, 0o644)
	})
	mustNil(t, err)
}

func mustNil(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func TestCourseEmptyShellLinkedToPlannedRoute(t *testing.T) {
	f := newRepo(t)
	f.WriteFuturePlan(t, "demo", "Demo Course", "demo", []string{
		"First mechanism / first-mechanism",
		"Second mechanism / second-mechanism",
	})

	written, err := scaffold.Course(f.Root, scaffold.Vars{
		ID:          "demo",
		Name:        "Demo Course",
		Tool:        "demo-tool",
		Description: "A \"temporary\" course\nwith a line",
		MinVersion:  "1",
	})
	mustNil(t, err)

	wantWritten := []string{"course.json", "lessons/.gitkeep", "PLAN.md"}
	if len(written) != len(wantWritten) {
		t.Fatalf("written = %v, want %v", written, wantWritten)
	}
	for i, w := range wantWritten {
		if written[i] != w {
			t.Fatalf("written[%d] = %q, want %q (full: %v)", i, written[i], w, written)
		}
	}

	courseDir := filepath.Join(f.Root, "courses", "demo")

	// course.json has no repl key and round-trips the quoted, multi-line description as valid
	// JSON.
	raw, err := os.ReadFile(filepath.Join(courseDir, "course.json"))
	mustNil(t, err)
	var generic map[string]json.RawMessage
	if err := json.Unmarshal(raw, &generic); err != nil {
		t.Fatalf("course.json is not valid JSON: %v\n%s", err, raw)
	}
	if _, ok := generic["repl"]; ok {
		t.Fatalf("scaffold invented a REPL configuration: %s", raw)
	}
	var metadata course.Course
	mustNil(t, json.Unmarshal(raw, &metadata))
	wantDescription := "A \"temporary\" course\nwith a line"
	if metadata.Description != wantDescription {
		t.Fatalf("description = %q, want %q", metadata.Description, wantDescription)
	}
	if metadata.ID != "demo" || metadata.Name != "Demo Course" || metadata.Tool != "demo-tool" || metadata.MinVersion != "1" {
		t.Fatalf("unexpected metadata: %+v", metadata)
	}

	// lessons/ contains only .gitkeep.
	entries, err := os.ReadDir(filepath.Join(courseDir, "lessons"))
	mustNil(t, err)
	if len(entries) != 1 || entries[0].Name() != ".gitkeep" {
		var names []string
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Fatalf("lessons/ contains %v, want only .gitkeep", names)
	}

	// PLAN.md is a symlink that resolves to the located plan.
	info, err := os.Lstat(filepath.Join(courseDir, "PLAN.md"))
	mustNil(t, err)
	if info.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("PLAN.md is not a symlink")
	}
	planText, err := os.ReadFile(filepath.Join(courseDir, "PLAN.md"))
	mustNil(t, err)
	if !strings.Contains(string(planText), "first-mechanism") {
		t.Fatalf("PLAN.md does not contain the canonical route: %s", planText)
	}

	// No progress.sqlite was created.
	if _, err := os.Stat(filepath.Join(courseDir, "progress.sqlite")); !os.IsNotExist(err) {
		t.Fatalf("scaffold allocated learner progress: %v", err)
	}

	// The empty scaffold fails LoadLessons with "at least one lesson".
	if _, err := course.LoadLessons(f.Root, "demo"); err == nil || !strings.Contains(err.Error(), "at least one lesson") {
		t.Fatalf("LoadLessons on empty scaffold = %v, want an error containing \"at least one lesson\"", err)
	}
}

func TestCourseDuplicateFutureIdentitiesFailBeforeAnyFileIsWritten(t *testing.T) {
	f := newRepo(t)

	existingDir := filepath.Join(f.Root, "courses", "duplicate")
	mustNil(t, os.MkdirAll(existingDir, 0o755))
	mustNil(t, os.WriteFile(filepath.Join(existingDir, "course.json"),
		[]byte(`{"id":"duplicate","name":"Duplicate","description":"","tool":"x","minVersion":"1","revision":1}`), 0o644))
	planPath := filepath.Join(existingDir, "PLAN.md")
	const originalPlan = "# Duplicate\n"
	mustNil(t, os.WriteFile(planPath, []byte(originalPlan), 0o644))

	f.WriteFuturePlan(t, "one", "Duplicate", "duplicate", []string{"Step one / step-one"})
	f.WriteFuturePlan(t, "two", "Duplicate", "duplicate", []string{"Step one / step-one"})

	written, err := scaffold.Course(f.Root, scaffold.Vars{
		ID: "duplicate", Name: "Duplicate", Tool: "x", Description: "x", MinVersion: "1",
	})
	if err == nil || !strings.Contains(err.Error(), "Multiple future-course plans declare duplicate") {
		t.Fatalf("err = %v, want an error containing \"Multiple future-course plans declare duplicate\"", err)
	}
	if written != nil {
		t.Fatalf("written = %v, want nil (no files written)", written)
	}

	after, err := os.ReadFile(planPath)
	mustNil(t, err)
	if string(after) != originalPlan {
		t.Fatalf("existing PLAN.md changed: %q", after)
	}

	entries, err := os.ReadDir(existingDir)
	mustNil(t, err)
	names := map[string]bool{}
	for _, e := range entries {
		names[e.Name()] = true
	}
	if len(names) != 2 || !names["course.json"] || !names["PLAN.md"] {
		t.Fatalf("courses/duplicate now contains %v, want only course.json and PLAN.md", names)
	}
}

func TestCourseRefusesExistingDirectory(t *testing.T) {
	f := newRepo(t)
	existingDir := filepath.Join(f.Root, "courses", "existing")
	mustNil(t, os.MkdirAll(existingDir, 0o755))
	mustNil(t, os.WriteFile(filepath.Join(existingDir, "course.json"), []byte(`{}`), 0o644))

	written, err := scaffold.Course(f.Root, scaffold.Vars{
		ID: "existing", Name: "Existing", Tool: "x", Description: "x", MinVersion: "1",
	})
	wantMsg := "course existing already exists at " + existingDir
	if err == nil || err.Error() != wantMsg {
		t.Fatalf("err = %v, want %q", err, wantMsg)
	}
	if written != nil {
		t.Fatalf("written = %v, want nil", written)
	}

	// Nothing else was written into the existing directory.
	entries, err := os.ReadDir(existingDir)
	mustNil(t, err)
	if len(entries) != 1 || entries[0].Name() != "course.json" {
		var names []string
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Fatalf("courses/existing now contains %v, want only course.json", names)
	}
}

func TestReportFormat(t *testing.T) {
	got := scaffold.Report("demo", []string{"course.json", "lessons/.gitkeep", "PLAN.md"})
	want := "Created course demo:\n" +
		"  course.json\n" +
		"  lessons/.gitkeep\n" +
		"  PLAN.md\n" +
		"\n" +
		"Next: add lessons/01-<slug>.md, then tutor demo check && tutor demo init"
	if got != want {
		t.Fatalf("Report =\n%q\nwant\n%q", got, want)
	}
}
