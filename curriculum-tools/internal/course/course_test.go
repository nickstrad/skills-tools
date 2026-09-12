package course_test

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"skills-tools/tutor/internal/course"
	"skills-tools/tutor/internal/testutil"
)

var demo = course.Course{ID: "demo", Name: "Demo", Description: "", Tool: "psql", MinVersion: "16", Revision: 1}

func roundTrip(t *testing.T, c course.Course, l course.Lesson, prereqs []string) course.Lesson {
	t.Helper()
	data := course.FormatLessonFile(c, l, prereqs)
	got, gotPrereqs, err := course.ParseLessonFile("test.md", data)
	if err != nil {
		t.Fatalf("parse: %v\n%s", err, data)
	}
	got.Ordinal = l.Ordinal
	got.Prerequisites = l.Prerequisites
	if !reflect.DeepEqual(got, l) {
		t.Fatalf("round trip changed the lesson\nwant %#v\ngot  %#v\nfile:\n%s", l, got, data)
	}
	if len(prereqs) > 0 && !reflect.DeepEqual(gotPrereqs, prereqs) {
		t.Fatalf("prerequisites %v != %v", gotPrereqs, prereqs)
	}
	return got
}

func TestRoundTripCoversEveryField(t *testing.T) {
	l := testutil.Lesson(6) // even: setup + challenge; multiple of 3: caution, 2 sessions
	l.Tags = []string{"mvcc", "locking"}
	l.Caution = "Line one  \nhard break above.\n\n    indented text\n\nlast."
	l.Overview = "Nested fences:\n\n````md\n```sql\nSELECT 1;\n```\n````\n\nand `inline` code.\n\n### Heading three\n\n- bullet"
	l.SyntaxBreakdown = "A fence containing a heading line:\n\n```text\n## Not a section\n```\nafter"
	l.Code = "SELECT 1;\n\n\nSELECT 2; -- three newlines above"
	l.Setup = "CREATE TABLE t(x int);"
	l.ExpectedResult = "x\n---\n1"
	l.SystemsLens = "lens"
	l.Challenge = "vary it"
	roundTrip(t, demo, l, []string{"lesson-05", "lesson-02"})
	minimal := testutil.Lesson(1)
	minimal.Tags = []string{}
	minimal.Setup, minimal.Challenge, minimal.Caution = "", "", ""
	data := course.FormatLessonFile(demo, minimal, nil)
	for _, absent := range []string{"## Setup", "## Caution", "## Optional variation", "prerequisites:"} {
		if strings.Contains(string(data), absent) {
			t.Errorf("minimal lesson should not contain %q:\n%s", absent, data)
		}
	}
	if !strings.Contains(string(data), "\ntags: \n") {
		t.Errorf("empty tags line missing:\n%s", data)
	}
	roundTrip(t, demo, minimal, nil)
}

func TestRunBodyWithBackticksUsesLongerFence(t *testing.T) {
	l := testutil.Lesson(1)
	l.RunIn = "shell"
	l.Code = "cat <<'EOF'\n````\n```\nEOF"
	data := course.FormatLessonFile(demo, l, nil)
	if !strings.Contains(string(data), "\n## Run\n`````sh\n") || !strings.HasSuffix(string(data), "EOF\n`````\n\n## Expected result\n"+l.ExpectedResult+"\n\n## Systems lens\n"+l.SystemsLens+"\n") {
		t.Fatalf("writer did not use a five-backtick fence:\n%s", data)
	}
	roundTrip(t, demo, l, nil)
}

func TestCodeLanguage(t *testing.T) {
	for _, tc := range []struct{ tool, runIn, want string }{
		{"psql", "tool", "sql"}, {"sqlite3", "tool", "sql"}, {"duckdb", "tool", "sql"},
		{"bash", "tool", "bash"}, {"psql", "shell", "sh"}, {"psql", "mixed", "text"},
	} {
		if got := course.CodeLanguage(course.Course{Tool: tc.tool}, tc.runIn); got != tc.want {
			t.Errorf("%s/%s: %q", tc.tool, tc.runIn, got)
		}
	}
}

func TestParseErrors(t *testing.T) {
	base := string(course.FormatLessonFile(demo, testutil.Lesson(2), []string{"lesson-01"}))
	cases := map[string]struct {
		mutate func(string) string
		want   string
	}{
		"crlf":          {func(s string) string { return strings.ReplaceAll(s, "\n", "\r\n") }, "carriage returns"},
		"no title":      {func(s string) string { return strings.Replace(s, "# Lesson 2 title", "Lesson 2 title", 1) }, "line 1 must be"},
		"unknown key":   {func(s string) string { return strings.Replace(s, "slug:", "id:", 1) }, `unknown header key "id"`},
		"duplicate key": {func(s string) string { return strings.Replace(s, "safety:", "slug: x\nsafety:", 1) }, `duplicate header key "slug"`},
		"missing key":   {func(s string) string { return strings.Replace(s, "revision: 1\n", "", 1) }, `missing header key "revision"`},
		"bad int":       {func(s string) string { return strings.Replace(s, "minutes: 5", "minutes: five", 1) }, `"minutes"`},
		"header no colon": {func(s string) string {
			return strings.Replace(s, "difficulty: intermediate", "difficulty intermediate", 1)
		}, "not 'key: value'"},
		"duplicate section": {func(s string) string { return s + "\n## Overview\nagain\n" }, `duplicate section "Overview"`},
		"unknown section":   {func(s string) string { return s + "\n## Notes\nx\n" }, `unknown section "Notes"`},
		"missing section":   {func(s string) string { return strings.Replace(s, "## Systems lens", "## Optional variation", 1) }, `duplicate section "Optional variation"`},
		"missing required":  {func(s string) string { i := strings.Index(s, "\n## Systems lens"); return s[:i] + "\n" }, `missing required section "Systems lens"`},
		"text before":       {func(s string) string { return strings.Replace(s, "\n## Overview", "\nstray\n## Overview", 1) }, "text before the first section"},
		"run not fenced":    {func(s string) string { return strings.Replace(s, "## Run\n```sh\n", "## Run\n", 1) }, "unclosed code fence"},
		"run tilde":         {func(s string) string { return strings.Replace(s, "## Run\n```sh\n", "## Run\n~~~sh\n", 1) }, "unclosed code fence"},
		"run extra text":    {func(s string) string { return strings.Replace(s, "## Setup\n```sh\n", "## Setup\nlead\n```sql\n", 1) }, "must start with a backtick fence"},
		"unclosed fence":    {func(s string) string { return strings.Replace(s, "## Expected result", "## Expected result\n```", 1) }, "unclosed code fence"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			_, _, err := course.ParseLessonFile("x.md", []byte(tc.mutate(base)))
			if err == nil || !strings.Contains(err.Error(), tc.want) || !strings.HasPrefix(err.Error(), "x.md: ") {
				t.Fatalf("want error containing %q, got %v", tc.want, err)
			}
		})
	}
}

func TestLoadLessonsResolvesPrerequisitesAndValidates(t *testing.T) {
	f := testutil.NewCourse(t, 4)
	lessons, err := course.LoadLessons(f.Root, "demo")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(lessons, f.Lessons) {
		t.Fatalf("loaded lessons differ\n%#v\n%#v", lessons, f.Lessons)
	}
	files, _ := course.LessonFiles(f.Root, "demo")
	if len(files) != 4 || files[0] != "01-lesson-01.md" {
		t.Fatalf("files %v", files)
	}
	if n, err := course.LessonFiles(f.Root, "absent"); n != nil || err != nil {
		t.Fatalf("missing dir: %v %v", n, err)
	}
	if _, err := course.LoadLessons(f.Root, "absent"); err == nil {
		t.Fatal("missing lessons dir accepted")
	}
}

func TestLoadLessonsErrors(t *testing.T) {
	cases := map[string]struct {
		setup func(t *testing.T, f *testutil.Fixture)
		want  string
	}{
		"forward prerequisite": {func(t *testing.T, f *testutil.Fixture) {
			l := f.Lessons[0]
			f.WriteLesson(t, l, []string{"lesson-02"})
		}, "requires later lesson"},
		"unknown prerequisite": {func(t *testing.T, f *testutil.Fixture) {
			f.WriteLesson(t, f.Lessons[1], []string{"nope"})
		}, "requires unknown lesson"},
		"ordinal gap": {func(t *testing.T, f *testutil.Fixture) {
			l := f.Lessons[2]
			os.Remove(filepath.Join(f.CourseDir(), "lessons", course.FileName(3, l.Slug)))
			l.Ordinal = 4
			l.Slug = "lesson-04b"
			f.WriteLesson(t, l, nil)
		}, "consecutive ordinals"},
		"filename slug mismatch": {func(t *testing.T, f *testutil.Fixture) {
			l := f.Lessons[2]
			l.Slug = "other"
			os.WriteFile(filepath.Join(f.CourseDir(), "lessons", "03-lesson-03.md"), course.FormatLessonFile(f.Course, l, []string{"lesson-02"}), 0o644)
		}, "does not match the file name"},
		"bad slug": {func(t *testing.T, f *testutil.Fixture) {
			l := f.Lessons[2]
			l.Slug = "Bad_Slug"
			os.Remove(filepath.Join(f.CourseDir(), "lessons", "03-lesson-03.md"))
			os.WriteFile(filepath.Join(f.CourseDir(), "lessons", "03-Bad_Slug.md"), course.FormatLessonFile(f.Course, l, nil), 0o644)
		}, "has a bad slug"},
		"unpadded ordinal": {func(t *testing.T, f *testutil.Fixture) {
			os.Rename(filepath.Join(f.CourseDir(), "lessons", "03-lesson-03.md"), filepath.Join(f.CourseDir(), "lessons", "3-lesson-03.md"))
		}, "zero-padded"},
		"duplicate tag": {func(t *testing.T, f *testutil.Fixture) {
			l := f.Lessons[0]
			l.Tags = []string{"a", "a"}
			f.WriteLesson(t, l, nil)
		}, "repeats a tag"},
		"bad difficulty": {func(t *testing.T, f *testutil.Fixture) {
			l := f.Lessons[0]
			l.Difficulty = "hard"
			f.WriteLesson(t, l, nil)
		}, "bad difficulty"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			f := testutil.NewCourse(t, 3)
			tc.setup(t, f)
			_, err := course.LoadLessons(f.Root, "demo")
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("want %q, got %v", tc.want, err)
			}
		})
	}
}

func TestValidate(t *testing.T) {
	if err := course.Validate(nil); err == nil || !strings.Contains(err.Error(), "at least one lesson") {
		t.Fatal(err)
	}
	ls := []course.Lesson{testutil.Lesson(1), testutil.Lesson(2)}
	if err := course.Validate(ls); err != nil {
		t.Fatal(err)
	}
	ls[1].Prerequisites = []int{2}
	if err := course.Validate(ls); err == nil || !strings.Contains(err.Error(), "invalid prerequisite") {
		t.Fatal(err)
	}
	ls[1].Prerequisites = []int{1, 1}
	if err := course.Validate(ls); err == nil || !strings.Contains(err.Error(), "repeats a prerequisite") {
		t.Fatal(err)
	}
	ls[1].Prerequisites = []int{1}
	ls[1].Sessions = 5
	if err := course.Validate(ls); err == nil || !strings.Contains(err.Error(), "bad sessions") {
		t.Fatal(err)
	}
}

func TestLoadCourseAndList(t *testing.T) {
	f := testutil.NewCourse(t, 1)
	c, err := course.LoadCourse(f.Root, "demo")
	if err != nil || c.Name != "Demo Course" || c.Repl == nil || c.Repl.Mode != "shell" {
		t.Fatalf("%v %#v", err, c)
	}
	if _, err := course.LoadCourse(f.Root, "Bad Id"); err == nil || !strings.Contains(err.Error(), "invalid course id") {
		t.Fatal(err)
	}
	other := filepath.Join(f.Root, "courses", "other")
	os.MkdirAll(other, 0o755)
	os.WriteFile(filepath.Join(other, "course.json"), []byte(`{"id":"mismatch","name":"x","description":"","tool":"x","minVersion":"1","revision":1}`), 0o644)
	if _, err := course.LoadCourse(f.Root, "other"); err == nil || !strings.Contains(err.Error(), "declares id mismatch, expected other") {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(other, "course.json"), []byte(`{"id":"other","name":"x","description":"","tool":"x","minVersion":"1","revision":1,"extra":true}`), 0o644)
	if _, err := course.LoadCourse(f.Root, "other"); err == nil || !strings.Contains(err.Error(), "extra") {
		t.Fatal(err)
	}
	os.MkdirAll(filepath.Join(f.Root, "courses", "junk"), 0o755)
	list, err := course.ListCourses(f.Root)
	if err != nil || len(list) != 1 || list[0].ID != "demo" {
		t.Fatalf("%v %v", err, list)
	}
	if list, err := course.ListCourses(t.TempDir()); err != nil || list != nil {
		t.Fatalf("empty root: %v %v", err, list)
	}
}
