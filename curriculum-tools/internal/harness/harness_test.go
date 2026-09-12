package harness_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"skills-tools/tutor/internal/course"
	"skills-tools/tutor/internal/harness"
	"skills-tools/tutor/internal/testutil"
)

var shellRepl = course.Repl{
	Mode:    "shell",
	Command: []string{"bash", "--noprofile", "--norc"},
	// Shell mode supplies a status-aware marker; this field remains required for tool-mode courses.
	Echo: "unused {marker}",
	Quit: "exit",
}

func shellLesson(code string) course.Lesson {
	l := testutil.Lesson(1)
	l.Slug = "shell-test"
	l.Setup = ""
	l.Code = code
	l.RunIn = "shell"
	return l
}

func validate(t *testing.T, code string, timeout time.Duration, repl course.Repl) (harness.Result, []string, string) {
	t.Helper()
	lab := t.TempDir()
	var logs []string
	r, err := harness.Validate([]course.Lesson{shellLesson(code)}, harness.Options{
		Repl:    repl,
		Env:     map[string]string{"LAB": lab},
		Timeout: timeout,
		Log:     func(line string) { logs = append(logs, line) },
	})
	if err != nil {
		t.Fatal(err)
	}
	return r, logs, lab
}

func contains(logs []string, needle string) bool {
	for _, l := range logs {
		if strings.Contains(l, needle) {
			return true
		}
	}
	return false
}

func TestSplitSteps(t *testing.T) {
	steps := harness.SplitSteps("first\n-- Session B (blocks until A writes)\nwait\n# session c\nthree\n// Session A\nback")
	if len(steps) != 4 || steps[0].Session != "A" || steps[0].Text != "first\n" ||
		steps[1].Session != "B" || !steps[1].Blocks || steps[2].Session != "C" || steps[2].Blocks || steps[3].Text != "back\n" {
		t.Fatalf("%#v", steps)
	}
	if got := harness.SplitSteps("\n\n"); got != nil {
		t.Fatalf("blank code produced steps: %#v", got)
	}
}

func TestShellModeExecutesALessonAndPreservesTheBashSession(t *testing.T) {
	r, logs, lab := validate(t, `printf 'ok' > "$LAB/result"`+"\n"+`printf 'observed=%s' "$(cat "$LAB/result")"`, 500*time.Millisecond, shellRepl)
	data, _ := os.ReadFile(filepath.Join(lab, "result"))
	if r.Failures != 0 || string(data) != "ok" || !contains(logs, "observed=ok") {
		t.Fatalf("%+v %q %v", r, data, logs)
	}
}

func TestNonzeroBashStatusFailsValidation(t *testing.T) {
	r, logs, _ := validate(t, `test -f "$LAB/missing"`, 500*time.Millisecond, shellRepl)
	if r.Failures != 1 || !contains(logs, "status 1") {
		t.Fatalf("%+v %v", r, logs)
	}
}

func TestTwoPersistentSessionsCoordinateThroughTheFilesystem(t *testing.T) {
	r, logs, _ := validate(t, "-- Session A\nprintf 'from-A' > \"$LAB/shared\"\n-- Session B\ncat \"$LAB/shared\"", 500*time.Millisecond, shellRepl)
	if r.Failures != 0 || !contains(logs, "from-A") {
		t.Fatalf("%+v %v", r, logs)
	}
}

func TestBlockingSessionIsReleasedByAnotherSession(t *testing.T) {
	r, logs, _ := validate(t, "-- Session B (blocks until A writes)\nwhile [ ! -f \"$LAB/release\" ]; do sleep 0.01; done\nprintf unblocked\n-- Session A\ntouch \"$LAB/release\"", 500*time.Millisecond, shellRepl)
	if r.Failures != 0 || !contains(logs, "unblocked") {
		t.Fatalf("%+v %v", r, logs)
	}
}

func TestUnreleasedBlockingStepFailsValidation(t *testing.T) {
	r, logs, _ := validate(t, "-- Session A (blocks but is never released)\nsleep 0.2\n-- Session B\nprintf 'other-session-finished'", 20*time.Millisecond, shellRepl)
	if r.Failures != 1 || !contains(logs, "did not complete") {
		t.Fatalf("%+v %v", r, logs)
	}
}

func TestStepExceedingTimeoutFailsValidation(t *testing.T) {
	r, logs, _ := validate(t, "sleep 0.2", 20*time.Millisecond, shellRepl)
	if r.Failures != 1 || !contains(logs, "timed out after 20 ms") {
		t.Fatalf("%+v %v", r, logs)
	}
}

func TestToolModeCoursesSkipShellLessonsUnlessAFallbackIsGiven(t *testing.T) {
	toolRepl := shellRepl
	toolRepl.Mode = ""
	lab := t.TempDir()
	var logs []string
	r, err := harness.Validate([]course.Lesson{shellLesson(`touch "$LAB/should-not-exist"`)}, harness.Options{
		Repl: toolRepl, Env: map[string]string{"LAB": lab}, Log: func(l string) { logs = append(logs, l) },
	})
	if err != nil || r.Failures != 0 || !contains(logs, "run manually") {
		t.Fatalf("%v %+v %v", err, r, logs)
	}
	if _, err := os.Stat(filepath.Join(lab, "should-not-exist")); err == nil {
		t.Fatal("legacy shell lesson unexpectedly ran")
	}
	fallback := shellRepl
	r, err = harness.Validate([]course.Lesson{shellLesson(`touch "$LAB/exists"`)}, harness.Options{
		Repl: toolRepl, ShellFallback: &fallback, Env: map[string]string{"LAB": lab}, Log: func(string) {},
	})
	if err != nil || r.Failures != 0 {
		t.Fatalf("%v %+v", err, r)
	}
	if _, err := os.Stat(filepath.Join(lab, "exists")); err != nil {
		t.Fatal("fallback shell lesson did not run")
	}
}

func TestSelectorsRangeSetupAndPerLessonHook(t *testing.T) {
	lessons := []course.Lesson{shellLesson("printf one"), shellLesson("printf two"), shellLesson("printf three")}
	for i := range lessons {
		lessons[i].Ordinal = i + 1
		lessons[i].Slug = []string{"one", "two", "three"}[i]
	}
	lessons[1].Setup = `printf 'setup=%s' "$PWD"`
	var logs []string
	var cleaned []string
	r, err := harness.Validate(lessons, harness.Options{
		Repl: shellRepl, Select: []string{"two", "3"}, To: 2,
		Log: func(l string) { logs = append(logs, l) },
		PerLesson: func(l course.Lesson) (map[string]string, string, func(), error) {
			dir := filepath.Join(t.TempDir(), l.Slug)
			os.MkdirAll(dir, 0o755)
			return map[string]string{"LESSON": l.Slug}, dir, func() { cleaned = append(cleaned, l.Slug) }, nil
		},
	})
	if err != nil || r.Selected != 1 || r.Failures != 0 {
		t.Fatalf("%v %+v", err, r)
	}
	if !contains(logs, "=== #2 two [shell, 1 session(s)] ===") || !contains(logs, "  -- setup --") || !contains(logs, "setup=") || !contains(logs, "/two") || contains(logs, "three") {
		t.Fatalf("%v", logs)
	}
	if len(cleaned) != 1 || cleaned[0] != "two" {
		t.Fatalf("cleanup %v", cleaned)
	}
	if got := harness.Summary(r); got != "\n1/1 lessons completed without timeout" {
		t.Fatalf("%q", got)
	}
}
