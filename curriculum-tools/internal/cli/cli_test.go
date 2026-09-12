package cli

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"skills-tools/tutor/internal/testutil"
)

func TestNormalizeArgs(t *testing.T) {
	cases := []struct {
		name    string
		args    []string
		want    []string
		wantErr string
	}{
		{name: "number then lesson", args: []string{"c", "3", "lesson"}, want: []string{"c", "lesson", "3"}},
		{name: "number then done", args: []string{"c", "3", "done"}, want: []string{"c", "done", "3"}},
		{name: "number then skip with literal note", args: []string{"c", "--note", "done", "3", "skip"}, want: []string{"c", "--note", "done", "skip", "3"}},
		{name: "verb first skip", args: []string{"c", "skip", "3"}, want: []string{"c", "skip", "3"}},
		{name: "extra skip positional", args: []string{"c", "3", "skip", "extra"}, wantErr: "use tutor <course> NUMBER lesson|done|skip"},
		{name: "number then route", args: []string{"c", "3", "route"}, wantErr: "use tutor <course> NUMBER lesson|done|skip"},
		{name: "verb then number is unchanged", args: []string{"c", "lesson", "3"}, want: []string{"c", "lesson", "3"}},
		{name: "number with no verb", args: []string{"c", "3"}, wantErr: "use tutor <course> NUMBER lesson|done|skip"},
		{name: "valued flag before the number", args: []string{"c", "--db", "x", "3", "lesson"}, want: []string{"c", "--db", "x", "lesson", "3"}},
		{name: "flags interleaved and trailing", args: []string{"c", "3", "--plain", "done", "--note", "hi"}, want: []string{"c", "done", "--plain", "3", "--note", "hi"}},
		{name: "inline flag value", args: []string{"c", "--db=x", "3", "done"}, want: []string{"c", "--db=x", "done", "3"}},
		{name: "topic cannot be combined with a number", args: []string{"c", "3", "lesson", "--topic", "t"}, wantErr: "--topic selects the next lesson and cannot be combined with NUMBER"},
		{name: "flag value that looks like a verb is not positional", args: []string{"c", "--note", "lesson", "list"}, want: []string{"c", "--note", "lesson", "list"}},
		{name: "no course at all", args: []string{"courses"}, want: []string{"courses"}},
		{name: "valued flag without a value", args: []string{"c", "list", "--db"}, wantErr: "--db requires a value"},
		{name: "course verb number-like value", args: []string{"c", "list", "--limit", "3"}, want: []string{"c", "list", "--limit", "3"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizeArgs(tc.args)
			if tc.wantErr != "" {
				if err == nil {
					t.Fatalf("NormalizeArgs(%q) = %q, want error %q", tc.args, got, tc.wantErr)
				}
				if err.Error() != tc.wantErr {
					t.Fatalf("NormalizeArgs(%q) error = %q, want %q", tc.args, err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("NormalizeArgs(%q): %v", tc.args, err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("NormalizeArgs(%q) = %q, want %q", tc.args, got, tc.want)
			}
		})
	}
}

// fixture is one Execute test environment: a temp repository holding the "demo" fixture course
// (nine authored lessons plus a tenth planned row), a plan-only "future-demo" course, and a
// progress database path outside the course directory.
type fixture struct {
	f  *testutil.Fixture
	db string
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	f := testutil.NewCourse(t, 9)
	f.WritePlan(t, "Planned lesson / planned-lesson")
	f.WriteFuturePlan(t, "future-demo", "Future Demo", "future-demo", []string{"One / one", "Two / two"})
	// TUTOR_ROOT must never leak into a test: every run passes --root explicitly.
	t.Setenv("TUTOR_ROOT", f.Root)
	return &fixture{f: f, db: filepath.Join(t.TempDir(), "progress.sqlite")}
}

// expand substitutes the per-run temporary paths into an expected string.
func (x *fixture) expand(s string) string {
	s = strings.ReplaceAll(s, "{db}", x.db)
	s = strings.ReplaceAll(s, "{root}", x.f.Root)
	s = strings.ReplaceAll(s, "{repo}", x.f.Repo)
	return s
}

// run executes one command line against the fixture root and returns stdout, stderr and the code.
func (x *fixture) run(args ...string) (string, string, int) {
	var out, errOut bytes.Buffer
	code := Execute(append([]string{"--root", x.f.Root}, args...), &out, &errOut)
	return out.String(), errOut.String(), code
}

// step is one row of the Execute table. Steps run in order: the write verbs depend on the ones
// before them, which is also what makes the progress-dependent expectations exact.
type step struct {
	name string
	args []string
	out  string
	err  string
	code int
}

func (x *fixture) check(t *testing.T, s step) {
	t.Helper()
	out, errOut, code := x.run(s.args...)
	if code != s.code {
		t.Errorf("exit = %d, want %d (stderr %q)", code, s.code, errOut)
	}
	if want := x.expand(s.out); out != want {
		t.Errorf("stdout =\n%q\nwant\n%q", out, want)
	}
	if want := x.expand(s.err); errOut != want {
		t.Errorf("stderr =\n%q\nwant\n%q", errOut, want)
	}
}

func TestExecute(t *testing.T) {
	x := newFixture(t)

	// The route of an uninitialized course must work and must not create the database.
	if _, err := os.Stat(x.db); !os.IsNotExist(err) {
		t.Fatalf("fixture database exists before the first command: %v", err)
	}

	steps := []step{
		{
			name: "usage",
			args: []string{},
			out:  usageText() + "\n",
		},
		{
			name: "courses",
			args: []string{"courses"},
			out: "demo — Demo Course [current] · 9/10 available\n" +
				"  tutor demo route\n\n" +
				"future-demo — Future Demo [proposed] · 0/2 available\n" +
				"  tutor future-demo route\n",
		},
		{
			name: "courses --json",
			args: []string{"courses", "--json"},
			out: `[
  {
    "id": "demo",
    "name": "Demo Course",
    "description": "A fixture course",
    "tool": "bash",
    "status": "current",
    "implemented": true,
    "planned": false,
    "authored": 9,
    "available": 9,
    "total": 10,
    "planPath": "{root}/courses/demo/PLAN.md"
  },
  {
    "id": "future-demo",
    "name": "Future Demo",
    "description": "",
    "status": "proposed",
    "implemented": false,
    "planned": true,
    "authored": 0,
    "available": 0,
    "total": 2,
    "planPath": "{repo}/future-courses/future-demo/course.md"
  }
]
`,
		},
		{
			name: "route before init",
			args: []string{"demo", "route", "--db", "{db}"},
			out: "# Demo Course — 10 lessons, 0 done\n\n" +
				"[done] marks completion of the current lesson revision; [skipped] lessons are excluded from next selection. Planned lessons are not yet available.\n\n" +
				"1. Lesson 1 title — available\n2. Lesson 2 title — available\n3. Lesson 3 title — available\n" +
				"4. Lesson 4 title — available\n5. Lesson 5 title — available\n6. Lesson 6 title — available\n" +
				"7. Lesson 7 title — available\n8. Lesson 8 title — available\n9. Lesson 9 title — available\n" +
				"10. Planned lesson — planned\n",
		},
		{
			name: "lesson before init",
			args: []string{"demo", "lesson", "--db", "{db}"},
			err:  "Error: progress database is not initialized; run 'tutor <course> init'\n",
			code: 1,
		},
		{
			name: "done before init",
			args: []string{"demo", "3", "done", "--db", "{db}"},
			err:  "Error: progress database is not initialized; run 'tutor <course> init'\n",
			code: 1,
		},
		{
			name: "init",
			args: []string{"demo", "init", "--db", "{db}"},
			out:  "Initialized 9 Demo Course lessons in {db}\n",
		},
		{
			name: "done with a note",
			args: []string{"demo", "3", "done", "--db", "{db}", "--note", "went fine"},
			out:  "Lesson 3 marked done.\n",
		},
		{
			name: "route after done shows [done]",
			args: []string{"demo", "route", "--db", "{db}"},
			out: "# Demo Course — 10 lessons, 1 done\n\n" +
				"[done] marks completion of the current lesson revision; [skipped] lessons are excluded from next selection. Planned lessons are not yet available.\n\n" +
				"1. Lesson 1 title — available\n2. Lesson 2 title — available\n3. [done] Lesson 3 title — available\n" +
				"4. Lesson 4 title — available\n5. Lesson 5 title — available\n6. Lesson 6 title — available\n" +
				"7. Lesson 7 title — available\n8. Lesson 8 title — available\n9. Lesson 9 title — available\n" +
				"10. Planned lesson — planned\n",
		},
		{
			name: "lesson --json carries the progress status and note",
			args: []string{"demo", "lesson", "3", "--json", "--db", "{db}"},
			out: `{
  "ordinal": 3,
  "slug": "lesson-03",
  "title": "Lesson 3 title",
  "category": "core",
  "difficulty": "beginner",
  "tags": [
    "demo",
    "topic-3"
  ],
  "status": "done",
  "sessions": 2,
  "runIn": "shell",
  "safetyLevel": "read-only",
  "minVersion": "5.1",
  "estimatedMinutes": 5,
  "overview": "Overview of lesson 3.",
  "syntaxBreakdown": "### In plain terms\n\nA sample breakdown.\n\n` + "```" + `text\nclient --> server\n` + "```" + `",
  "caution": "Writes to the lab directory only.",
  "code": "-- Session A\nprintf 'from-A' > \"$LAB/shared\"\n-- Session B\ncat \"$LAB/shared\"",
  "expectedResult": "lesson 3 ok",
  "systemsLens": "One idea made concrete.",
  "notes": "went fine"
}
`,
		},
		{
			name: "skip",
			args: []string{"demo", "skip", "5", "--db", "{db}"},
			out:  "Lesson 5 marked skipped.\n",
		},
		{
			name: "undone",
			args: []string{"demo", "undone", "3", "--db", "{db}"},
			out:  "Lesson 3 marked todo.\n",
		},
		{
			name: "note joins the remaining arguments",
			args: []string{"demo", "note", "6", "hello", "there", "--db", "{db}"},
			out:  "Note saved for lesson 6.\n",
		},
		{
			name: "list",
			args: []string{"demo", "list", "--db", "{db}"},
			out: "  1  todo    [intro] Lesson 1 title  {demo,topic-1}\n" +
				"  2  todo    [intro] Lesson 2 title  {demo,topic-2}\n" +
				"  3  todo    [core] Lesson 3 title (2 sessions)  {demo,topic-3}\n" +
				"  4  todo    [core] Lesson 4 title  {demo,topic-1}\n" +
				"  5  skipped [core] Lesson 5 title  {demo,topic-2}\n" +
				"  6  todo    [core] Lesson 6 title (2 sessions)  {demo,topic-3}\n" +
				"  7  todo    [core] Lesson 7 title  {demo,topic-1}\n" +
				"  8  todo    [core] Lesson 8 title  {demo,topic-2}\n" +
				"  9  todo    [core] Lesson 9 title (2 sessions)  {demo,topic-3}\n",
		},
		{
			name: "list --done is empty after undone",
			args: []string{"demo", "list", "--done", "--db", "{db}"},
			out:  "No lessons found.\n",
		},
		{
			name: "list rejects two status filters",
			args: []string{"demo", "list", "--todo", "--done", "--db", "{db}"},
			err:  "Error: choose one of --todo, --done\n",
			code: 1,
		},
		{
			name: "topics",
			args: []string{"demo", "topics", "--db", "{db}"},
			out: "demo                          0/9   done  lessons 1,2,3,4,5,6,7,8,9\n" +
				"topic-1                       0/3   done  lessons 1,4,7\n" +
				"topic-2                       0/3   done  lessons 2,5,8\n" +
				"topic-3                       0/3   done  lessons 3,6,9\n",
		},
		{
			name: "modules",
			args: []string{"demo", "modules", "--db", "{db}"},
			out:  "  1-2   intro                      0/2 done  ~10 min\n  3-9   core                       0/7 done  ~35 min\n",
		},
		{
			name: "status",
			args: []string{"demo", "status", "--db", "{db}"},
			out:  "Demo Course: 0/9 done; 8 remaining; 1 skipped; 0 stale.\n",
		},
		{
			name: "status --json",
			args: []string{"demo", "status", "--json", "--db", "{db}"},
			out:  "{\n  \"course\": \"demo\",\n  \"total\": 9,\n  \"done\": 0,\n  \"todo\": 8,\n  \"skipped\": 1,\n  \"stale\": 0\n}\n",
		},
		{
			name: "search",
			args: []string{"demo", "search", "lesson", "9", "--db", "{db}"},
			out:  "  9  [core] Lesson 9 title\n",
		},
		{
			name: "search with no match",
			args: []string{"demo", "search", "nothinghere", "--db", "{db}"},
			out:  "No lessons found.\n",
		},
		{
			name: "next --topic with no match",
			args: []string{"demo", "next", "--topic", "nosuchthing", "--db", "{db}"},
			out:  "No lessons match topic 'nosuchthing'. Run 'tutor demo topics' to see the vocabulary, or 'search'.\n",
		},
		{
			name: "next --topic --json with no match",
			args: []string{"demo", "next", "--topic", "nosuchthing", "--json", "--db", "{db}"},
			out:  "{\n  \"topic\": \"nosuchthing\",\n  \"matched\": 0\n}\n",
		},
		{
			name: "unknown course lists the courses",
			args: []string{"bogus", "route"},
			err: "Error: unknown course 'bogus'\n\n" +
				"demo — Demo Course [current] · 9/10 available\n" +
				"  tutor demo route\n\n" +
				"future-demo — Future Demo [proposed] · 0/2 available\n" +
				"  tutor future-demo route\n",
			code: 2,
		},
		{
			name: "planned course route",
			args: []string{"future-demo", "route"},
			out: "# Future Demo — 2 lessons, 0 done\n\n" +
				"[done] marks completion of the current lesson revision; [skipped] lessons are excluded from next selection. Planned lessons are not yet available.\n\n" +
				"1. One — planned\n2. Two — planned\n",
		},
		{
			name: "planned course rejects every other verb",
			args: []string{"future-demo", "lesson"},
			err:  "Error: course 'future-demo' is planned, not implemented; only route is available\n",
			code: 2,
		},
		{
			name: "--ansi and --plain conflict",
			args: []string{"demo", "lesson", "--ansi", "--plain", "--db", "{db}"},
			err:  "Error: --ansi and --plain cannot be used together\n",
			code: 2,
		},
		{
			name: "--json is rejected by done",
			args: []string{"demo", "3", "done", "--json", "--db", "{db}"},
			err:  "Error: --json is not supported by done\n",
			code: 2,
		},
		{
			name: "--json is rejected by init",
			args: []string{"demo", "init", "--json", "--db", "{db}"},
			err:  "Error: --json is not supported by init\n",
			code: 2,
		},
		{
			name: "missing lesson",
			args: []string{"demo", "lesson", "99", "--db", "{db}"},
			err:  "Error: lesson 99 not found\n",
			code: 2,
		},
		{
			name: "number without a verb",
			args: []string{"demo", "3"},
			err:  "Error: use tutor <course> NUMBER lesson|done|skip\n\n" + usageText() + "\n",
			code: 2,
		},
		{
			name: "number with an unsupported verb",
			args: []string{"demo", "3", "route"},
			err:  "Error: use tutor <course> NUMBER lesson|done|skip\n\n" + usageText() + "\n",
			code: 2,
		},
		{
			name: "unknown flag is a usage error",
			args: []string{"demo", "list", "--bogus", "--db", "{db}"},
			err:  "Error: unknown flag: --bogus\n",
			code: 2,
		},
		{
			name: "unknown verb",
			args: []string{"demo", "bogusverb"},
			err:  "Error: unknown command 'bogusverb' for course demo\n",
			code: 2,
		},
		{
			name: "check",
			args: []string{"demo", "check"},
			out:  "demo: 9 lessons OK\n",
		},
		{
			name: "version",
			args: []string{"version"},
			out:  "tutor dev\n",
		},
	}

	for _, s := range steps {
		s := s
		args := make([]string, len(s.args))
		for i, a := range s.args {
			args[i] = x.expand(a)
		}
		s.args = args
		t.Run(s.name, func(t *testing.T) { x.check(t, s) })
	}

	t.Run("course with no verb prints its help", func(t *testing.T) {
		out, errOut, code := x.run("demo")
		if code != 0 || errOut != "" {
			t.Fatalf("exit = %d, stderr = %q", code, errOut)
		}
		for _, want := range []string{
			"demo — Demo Course [current] · 9/10 lessons available",
			"tutor demo route [--json]",
			"tutor demo [N] lesson [--ansi|--plain]",
			"tutor demo N done [--note TEXT]",
			"Displaying a lesson never marks it done.",
		} {
			if !strings.Contains(out, want) {
				t.Errorf("course help does not contain %q:\n%s", want, out)
			}
		}
	})
}

// TestExecuteLessonSpellingsAndFooter covers the two spellings of the lesson verb and the --db
// hint in the lesson footer, which is the only part of the rendered Markdown the CLI contributes.
func TestExecuteLessonSpellingsAndFooter(t *testing.T) {
	x := newFixture(t)
	if _, _, code := x.run("demo", "init", "--db", x.db); code != 0 {
		t.Fatalf("init: exit %d", code)
	}

	numberFirst, _, code := x.run("demo", "3", "lesson", "--plain", "--db", x.db)
	if code != 0 {
		t.Fatalf("3 lesson: exit %d", code)
	}
	verbFirst, _, code := x.run("demo", "lesson", "3", "--plain", "--db", x.db)
	if code != 0 {
		t.Fatalf("lesson 3: exit %d", code)
	}
	if numberFirst != verbFirst {
		t.Errorf("`3 lesson --plain` and `lesson 3 --plain` differ:\n%q\n%q", numberFirst, verbFirst)
	}
	wantFooter := "When you consider it complete: `tutor demo 3 done --db '" + x.db + "'`.\n"
	if !strings.HasSuffix(numberFirst, wantFooter) {
		t.Errorf("footer with --db: got\n%q\nwant suffix\n%q", numberFirst, wantFooter)
	}

	// Without --db the default database under the course directory is used, and the footer omits
	// the flag entirely.
	if _, _, code := x.run("demo", "init"); code != 0 {
		t.Fatalf("default init: exit %d", code)
	}
	plain, _, code := x.run("demo", "3", "lesson", "--plain")
	if code != 0 {
		t.Fatalf("default lesson: exit %d", code)
	}
	if want := "When you consider it complete: `tutor demo 3 done`.\n"; !strings.HasSuffix(plain, want) {
		t.Errorf("footer without --db: got\n%q\nwant suffix\n%q", plain, want)
	}
	if !strings.HasPrefix(plain, "# Lesson 3: Lesson 3 title\n") {
		t.Errorf("lesson did not start with its title line:\n%s", plain)
	}
}

// TestExecuteAnsiStyling checks that --ansi styles the lesson Markdown while the default (a
// non-terminal writer) does not.
func TestExecuteAnsiStyling(t *testing.T) {
	x := newFixture(t)
	if _, _, code := x.run("demo", "init", "--db", x.db); code != 0 {
		t.Fatalf("init: exit %d", code)
	}
	styled, _, _ := x.run("demo", "lesson", "1", "--ansi", "--db", x.db)
	if !strings.Contains(styled, "\x1b[") {
		t.Errorf("--ansi produced no escape sequences:\n%q", styled)
	}
	plain, _, _ := x.run("demo", "lesson", "1", "--db", x.db)
	if strings.Contains(plain, "\x1b[") {
		t.Errorf("default output to a buffer was styled:\n%q", plain)
	}
}

// TestExecuteReadOnlyGuarantee is the guarantee the learner depends on: displaying anything never
// changes the progress database, and `route` on a course with no database creates no file.
func TestExecuteReadOnlyGuarantee(t *testing.T) {
	x := newFixture(t)

	if _, _, code := x.run("demo", "route", "--db", x.db); code != 0 {
		t.Fatalf("route before init: exit %d", code)
	}
	for _, suffix := range []string{"", "-wal", "-shm"} {
		if _, err := os.Stat(x.db + suffix); !os.IsNotExist(err) {
			t.Fatalf("route created %s: %v", x.db+suffix, err)
		}
	}
	// A failed write verb must not create one either.
	if _, _, code := x.run("demo", "3", "done", "--db", x.db); code != 1 {
		t.Fatalf("done before init: exit %d, want 1", code)
	}
	if _, err := os.Stat(x.db); !os.IsNotExist(err) {
		t.Fatalf("done created the database before init")
	}

	if _, _, code := x.run("demo", "init", "--db", x.db); code != 0 {
		t.Fatalf("init: exit %d", code)
	}
	if _, _, code := x.run("demo", "3", "done", "--db", x.db, "--note", "kept"); code != 0 {
		t.Fatalf("done: exit %d", code)
	}

	before := hashFile(t, x.db)
	readOnly := [][]string{
		{"demo", "route", "--db", x.db},
		{"demo", "3", "lesson", "--plain", "--db", x.db},
		{"demo", "lesson", "--plain", "--db", x.db},
		{"demo", "next", "--db", x.db},
		{"demo", "list", "--db", x.db},
		{"demo", "status", "--db", x.db},
		{"demo", "search", "lesson", "--db", x.db},
		{"demo", "topics", "--db", x.db},
		{"demo", "modules", "--db", x.db},
		{"demo", "check"},
		{"courses"},
	}
	for _, args := range readOnly {
		if _, errOut, code := x.run(args...); code != 0 {
			t.Fatalf("%v: exit %d, stderr %q", args, code, errOut)
		}
		if after := hashFile(t, x.db); after != before {
			t.Fatalf("%v modified the progress database (%s -> %s)", args, before, after)
		}
	}
}

func hashFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// TestExecuteRootResolution covers the three ways the curriculum root is found and the failure
// when none of them applies.
func TestExecuteRootResolution(t *testing.T) {
	f := testutil.NewCourse(t, 2)

	t.Run("TUTOR_ROOT", func(t *testing.T) {
		t.Setenv("TUTOR_ROOT", f.Root)
		var out, errOut bytes.Buffer
		if code := Execute([]string{"courses"}, &out, &errOut); code != 0 {
			t.Fatalf("exit = %d, stderr %q", code, errOut.String())
		}
		if !strings.HasPrefix(out.String(), "demo — Demo Course") {
			t.Errorf("stdout = %q", out.String())
		}
	})

	t.Run("--root wins over the environment", func(t *testing.T) {
		t.Setenv("TUTOR_ROOT", t.TempDir())
		var out, errOut bytes.Buffer
		if code := Execute([]string{"--root", f.Root, "courses"}, &out, &errOut); code != 0 {
			t.Fatalf("exit = %d, stderr %q", code, errOut.String())
		}
		if !strings.HasPrefix(out.String(), "demo — Demo Course") {
			t.Errorf("stdout = %q", out.String())
		}
	})

	t.Run("no root at all", func(t *testing.T) {
		t.Setenv("TUTOR_ROOT", "")
		// The test binary lives in a temporary build directory whose grandparent has no courses/.
		var out, errOut bytes.Buffer
		code := Execute([]string{"courses"}, &out, &errOut)
		if code != 2 {
			t.Fatalf("exit = %d, want 2", code)
		}
		if want := "Error: tutor: cannot locate curriculum-tools; set TUTOR_ROOT\n"; errOut.String() != want {
			t.Fatalf("stderr = %q, want %q", errOut.String(), want)
		}
	})
}

// TestExecuteStalePlanAbortsCheckAndInit covers the guard that keeps a drifted catalog from
// silently replacing lesson rows: both `check` and `init` validate the canonical plan first.
func TestExecuteStalePlanAbortsCheckAndInit(t *testing.T) {
	x := newFixture(t)
	if _, _, code := x.run("demo", "init", "--db", x.db); code != 0 {
		t.Fatalf("init: exit %d", code)
	}
	before := hashFile(t, x.db)

	// The plan now names a different stable slug at position 3 than the catalog authored there.
	entries := []string{}
	for _, l := range x.f.Lessons {
		if l.Ordinal == 3 {
			entries = append(entries, l.Title+" / renamed-lesson")
			continue
		}
		entries = append(entries, l.Title+" / "+l.Slug)
	}
	plan := testutil.CanonicalPlan(x.f.Course.Name, x.f.Course.ID, entries)
	if err := os.WriteFile(filepath.Join(x.f.CourseDir(), "PLAN.md"), []byte(plan), 0o644); err != nil {
		t.Fatal(err)
	}

	wantErr := "Error: Route/catalog mismatch at lesson 3: plan has 'renamed-lesson', catalog has 'lesson-03' (update the canonical plan or preserve the stable identity)\n"
	for _, args := range [][]string{{"demo", "check"}, {"demo", "init", "--db", x.db}} {
		out, errOut, code := x.run(args...)
		if code != 1 {
			t.Errorf("%v: exit = %d, want 1", args, code)
		}
		if out != "" {
			t.Errorf("%v: stdout = %q, want empty", args, out)
		}
		if errOut != wantErr {
			t.Errorf("%v: stderr = %q, want %q", args, errOut, wantErr)
		}
	}
	if after := hashFile(t, x.db); after != before {
		t.Errorf("a refused init modified the progress database")
	}
}
