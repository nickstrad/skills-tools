package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"skills-tools/tutor/internal/route"
	"skills-tools/tutor/internal/testutil"
)

func TestValidateRunsPassingAndFailingLessons(t *testing.T) {
	f := testutil.NewCourse(t, 2)
	f.WritePlan(t)
	failed := f.Lessons[1]
	failed.Code = "false"
	f.WriteLesson(t, failed, []string{f.Lessons[0].Slug})
	cc := &courseCtx{
		root: f.Root,
		disc: route.CourseDiscovery{ID: "demo"},
	}
	var out bytes.Buffer
	cc.out = &out
	cmd := newValidateCmd(cc)
	cmd.SetArgs([]string{"--timeout", "1000"})
	err := cmd.Execute()
	var exit *exitError
	if !errors.As(err, &exit) || exit.code != 1 {
		t.Fatalf("validate error = %v, want exit 1", err)
	}
	if !strings.Contains(out.String(), "1/2 lessons completed without timeout") {
		t.Fatalf("validate output omitted summary:\n%s", out.String())
	}
	if !strings.Contains(out.String(), "exited with status 1") {
		t.Fatalf("validate output omitted failing status:\n%s", out.String())
	}
}

func TestValidateRejectsUnknownSelector(t *testing.T) {
	f := testutil.NewCourse(t, 1)
	f.WritePlan(t)
	cc := &courseCtx{root: f.Root, disc: route.CourseDiscovery{ID: "demo"}}
	var out bytes.Buffer
	cc.out = &out
	cmd := newValidateCmd(cc)
	cmd.SetArgs([]string{"missing-lesson"})
	err := cmd.Execute()
	if err == nil || err.Error() != "Unknown lesson selector: missing-lesson" {
		t.Fatalf("validate error = %v, want unknown selector", err)
	}
}

func TestValidateIsolatedEvidenceIsRemovedUnlessKept(t *testing.T) {
	f := testutil.NewCourse(t, 1)
	f.WritePlan(t)
	cc := &courseCtx{root: f.Root, disc: route.CourseDiscovery{ID: "demo"}}
	var out bytes.Buffer
	cc.out = &out
	cmd := newValidateCmd(cc)
	cmd.SetArgs([]string{"--isolated", "--timeout", "1000"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	line := strings.TrimSpace(strings.Split(out.String(), "\n")[0])
	path := strings.TrimPrefix(line, "Evidence: ")
	if path == line || path == "" {
		t.Fatalf("missing evidence path in output:\n%s", out.String())
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("evidence path still exists: %s (%v)", path, err)
	}
}

func TestValidateIsolatedExportsPrivateSQLiteLabAndKeepsEvidence(t *testing.T) {
	f := testutil.NewCourse(t, 1)
	f.WritePlan(t)
	lesson := f.Lessons[0]
	lesson.Code = `test "$SQLITE_LAB" = "$PWD/sqlite-lab"
test "$TUTOR_SQLITE_DB" = "$SQLITE_LAB/lab.db"
printf ok > "$TUTOR_SQLITE_DB.marker"`
	f.WriteLesson(t, lesson, nil)
	cc := &courseCtx{root: f.Root, disc: route.CourseDiscovery{ID: "demo"}}
	var out bytes.Buffer
	cc.out = &out
	cmd := newValidateCmd(cc)
	cmd.SetArgs([]string{"--isolated", "--keep", "--timeout", "1000"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	line := strings.TrimSpace(strings.Split(out.String(), "\n")[0])
	evidence := strings.TrimPrefix(line, "Evidence: ")
	if evidence == line || evidence == "" {
		t.Fatalf("missing evidence path in output:\n%s", out.String())
	}
	t.Cleanup(func() { os.RemoveAll(evidence) })
	marker := filepath.Join(evidence, lesson.Slug, "sqlite-lab", "lab.db.marker")
	data, err := os.ReadFile(marker)
	if err != nil {
		t.Fatalf("isolated lesson did not leave evidence at %s: %v", marker, err)
	}
	if string(data) != "ok" {
		t.Fatalf("evidence = %q, want ok", data)
	}
}

func TestValidateRequiresReplAndIsolatedKeep(t *testing.T) {
	t.Run("missing repl", func(t *testing.T) {
		f := testutil.NewCourse(t, 1)
		f.WritePlan(t)
		f.Course.Repl = nil
		data, err := json.MarshalIndent(f.Course, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(f.CourseDir(), "course.json"), append(data, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		cc := &courseCtx{root: f.Root, disc: route.CourseDiscovery{ID: "demo"}, out: &bytes.Buffer{}}
		err = newValidateCmd(cc).Execute()
		if err == nil || err.Error() != `courses/demo/course.json has no "repl" block` {
			t.Fatalf("validate error = %v, want missing repl error", err)
		}
	})
	t.Run("keep without isolation", func(t *testing.T) {
		f := testutil.NewCourse(t, 1)
		f.WritePlan(t)
		cc := &courseCtx{root: f.Root, disc: route.CourseDiscovery{ID: "demo"}, out: &bytes.Buffer{}}
		cmd := newValidateCmd(cc)
		cmd.SetArgs([]string{"--keep"})
		err := cmd.Execute()
		if err == nil || err.Error() != "--keep requires --isolated" {
			t.Fatalf("validate error = %v, want --keep usage error", err)
		}
	})
}
