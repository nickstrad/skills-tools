package render

import (
	"bytes"
	"embed"
	"encoding/json"
	"reflect"
	"testing"

	"skills-tools/tutor/internal/course"
	"skills-tools/tutor/internal/route"
)

//go:embed testdata
var testdataFS embed.FS

func readTestdata(t *testing.T, name string) []byte {
	t.Helper()
	data, err := testdataFS.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("read testdata/%s: %v", name, err)
	}
	return data
}

// postgresEssentials is the course.json of curriculum-tools/courses/postgres-essentials, copied
// as a literal so this test does not depend on that course's files, which other work packages
// may be editing concurrently.
func postgresEssentials() course.Course {
	return course.Course{
		ID:          "postgres-essentials",
		Name:        "PostgreSQL Essentials",
		Description: "40 focused PostgreSQL systems lessons after the completed storage foundation",
		Tool:        "psql",
		MinVersion:  "16",
		Revision:    1,
		Repl: &course.Repl{
			Command: []string{"psql", "-X", "-q", "-v", "ON_ERROR_STOP=0", "-P", "pager=off"},
			Echo:    `\echo {marker}`,
			Quit:    `\q`,
			Env: map[string]string{
				"PGHOST": "/tmp", "PGPORT": "5440", "PGUSER": "postgres", "PGDATABASE": "lab",
			},
		},
	}
}

// lessonRecordJSON is used only to decode a golden lesson-NN.json into a course.Lesson (the JSON
// carries a few fields, like status, that course.Lesson does not).
type lessonRecordJSON struct {
	Ordinal          int      `json:"ordinal"`
	Slug             string   `json:"slug"`
	Title            string   `json:"title"`
	Category         string   `json:"category"`
	Difficulty       string   `json:"difficulty"`
	Tags             []string `json:"tags"`
	Status           string   `json:"status"`
	Sessions         int      `json:"sessions"`
	RunIn            string   `json:"runIn"`
	SafetyLevel      string   `json:"safetyLevel"`
	MinVersion       string   `json:"minVersion"`
	EstimatedMinutes int      `json:"estimatedMinutes"`
	Overview         string   `json:"overview"`
	SyntaxBreakdown  string   `json:"syntaxBreakdown"`
	Caution          string   `json:"caution"`
	Setup            string   `json:"setup"`
	Code             string   `json:"code"`
	ExpectedResult   string   `json:"expectedResult"`
	SystemsLens      string   `json:"systemsLens"`
	Challenge        string   `json:"challenge"`
	Notes            string   `json:"notes"`
}

func (r lessonRecordJSON) toLesson() course.Lesson {
	return course.Lesson{
		Ordinal:          r.Ordinal,
		Slug:             r.Slug,
		Title:            r.Title,
		Category:         r.Category,
		Difficulty:       r.Difficulty,
		Tags:             r.Tags,
		Overview:         r.Overview,
		SyntaxBreakdown:  r.SyntaxBreakdown,
		Caution:          r.Caution,
		Setup:            r.Setup,
		Code:             r.Code,
		ExpectedResult:   r.ExpectedResult,
		SystemsLens:      r.SystemsLens,
		Challenge:        r.Challenge,
		SafetyLevel:      r.SafetyLevel,
		RunIn:            r.RunIn,
		Sessions:         r.Sessions,
		MinVersion:       r.MinVersion,
		EstimatedMinutes: r.EstimatedMinutes,
	}
}

const goldenDBFlag = "/root/tutor-migration/golden/postgres-essentials/db-init/progress.sqlite"

func loadGoldenLesson(t *testing.T) (course.Lesson, lessonRecordJSON) {
	t.Helper()
	data := readTestdata(t, "lesson-08.json")
	var rec lessonRecordJSON
	if err := json.Unmarshal(data, &rec); err != nil {
		t.Fatalf("unmarshal lesson-08.json: %v", err)
	}
	return rec.toLesson(), rec
}

func TestRenderLessonGolden(t *testing.T) {
	lesson, rec := loadGoldenLesson(t)
	c := postgresEssentials()
	got := RenderLesson(c, lesson, rec.Notes, goldenDBFlag)
	want := string(bytes.TrimRight(readTestdata(t, "lesson-08.md"), "\n"))
	if got != want {
		t.Fatalf("RenderLesson mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestLessonJSONGolden(t *testing.T) {
	lesson, rec := loadGoldenLesson(t)
	got, err := LessonJSON(lesson, rec.Status, rec.Notes)
	if err != nil {
		t.Fatalf("LessonJSON: %v", err)
	}
	want := bytes.TrimRight(readTestdata(t, "lesson-08.json"), "\n")

	// Raw byte comparison: key order, spacing and escaping must match exactly.
	if !bytes.Equal(got, want) {
		t.Fatalf("LessonJSON raw mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
	// Round-trip comparison as a second, order-independent check.
	var gotVal, wantVal map[string]any
	if err := json.Unmarshal(got, &gotVal); err != nil {
		t.Fatalf("unmarshal got: %v", err)
	}
	if err := json.Unmarshal(want, &wantVal); err != nil {
		t.Fatalf("unmarshal want: %v", err)
	}
	if !reflect.DeepEqual(gotVal, wantVal) {
		t.Fatalf("LessonJSON round-trip mismatch\ngot:  %#v\nwant: %#v", gotVal, wantVal)
	}
}

func TestRenderLessonDBFlagQuoting(t *testing.T) {
	lesson, rec := loadGoldenLesson(t)
	c := postgresEssentials()

	if got := RenderLesson(c, lesson, rec.Notes, ""); got == "" {
		t.Fatal("expected non-empty output")
	} else if want := "When you consider it complete: `tutor postgres-essentials 8 done`."; got[len(got)-len(want):] != want {
		t.Fatalf("no-flag footer = %q, want suffix %q", got, want)
	}

	withQuote := RenderLesson(c, lesson, rec.Notes, "/tmp/a'b/progress.sqlite")
	want := "When you consider it complete: `tutor postgres-essentials 8 done --db '/tmp/a'\\''b/progress.sqlite'`."
	if got := withQuote[len(withQuote)-len(want):]; got != want {
		t.Fatalf("quoted footer = %q, want %q", got, want)
	}
}

func TestRenderRouteGolden(t *testing.T) {
	var r route.Route
	if err := json.Unmarshal(readTestdata(t, "route.json"), &r); err != nil {
		t.Fatalf("unmarshal route.json: %v", err)
	}
	got := RenderRoute(r)
	want := string(bytes.TrimRight(readTestdata(t, "route.txt"), "\n"))
	if got != want {
		t.Fatalf("RenderRoute mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestCoursesGolden(t *testing.T) {
	var list []route.CourseDiscovery
	if err := json.Unmarshal(readTestdata(t, "courses.json"), &list); err != nil {
		t.Fatalf("unmarshal courses.json: %v", err)
	}
	got := Courses(list)
	want := string(bytes.TrimRight(readTestdata(t, "courses.txt"), "\n"))
	if got != want {
		t.Fatalf("Courses mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}

	gotJSON, err := JSON(list)
	if err != nil {
		t.Fatalf("JSON(list): %v", err)
	}
	wantJSON := bytes.TrimRight(readTestdata(t, "courses.json"), "\n")
	if !bytes.Equal(gotJSON, wantJSON) {
		t.Fatalf("JSON(courses) raw mismatch\n--- got ---\n%s\n--- want ---\n%s", gotJSON, wantJSON)
	}
}

func TestTopicsGolden(t *testing.T) {
	var topics []Topic
	if err := json.Unmarshal(readTestdata(t, "topics.json"), &topics); err != nil {
		t.Fatalf("unmarshal topics.json: %v", err)
	}
	got := Topics(topics)
	want := string(bytes.TrimRight(readTestdata(t, "topics.txt"), "\n"))
	if got != want {
		t.Fatalf("Topics mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}

	gotJSON, err := JSON(topics)
	if err != nil {
		t.Fatalf("JSON(topics): %v", err)
	}
	wantJSON := bytes.TrimRight(readTestdata(t, "topics.json"), "\n")
	if !bytes.Equal(gotJSON, wantJSON) {
		t.Fatalf("JSON(topics) raw mismatch\n--- got ---\n%s\n--- want ---\n%s", gotJSON, wantJSON)
	}
}

func TestModulesGolden(t *testing.T) {
	var modules []Module
	if err := json.Unmarshal(readTestdata(t, "modules.json"), &modules); err != nil {
		t.Fatalf("unmarshal modules.json: %v", err)
	}
	got := Modules(modules)
	want := string(bytes.TrimRight(readTestdata(t, "modules.txt"), "\n"))
	if got != want {
		t.Fatalf("Modules mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}

	gotJSON, err := JSON(modules)
	if err != nil {
		t.Fatalf("JSON(modules): %v", err)
	}
	wantJSON := bytes.TrimRight(readTestdata(t, "modules.json"), "\n")
	if !bytes.Equal(gotJSON, wantJSON) {
		t.Fatalf("JSON(modules) raw mismatch\n--- got ---\n%s\n--- want ---\n%s", gotJSON, wantJSON)
	}
}

func TestStatusGolden(t *testing.T) {
	var s Status
	if err := json.Unmarshal(readTestdata(t, "status.json"), &s); err != nil {
		t.Fatalf("unmarshal status.json: %v", err)
	}
	got := StatusLine("PostgreSQL Essentials", s)
	want := string(bytes.TrimRight(readTestdata(t, "status.txt"), "\n"))
	if got != want {
		t.Fatalf("StatusLine mismatch\ngot:  %q\nwant: %q", got, want)
	}

	gotJSON, err := JSON(s)
	if err != nil {
		t.Fatalf("JSON(status): %v", err)
	}
	wantJSON := bytes.TrimRight(readTestdata(t, "status.json"), "\n")
	if !bytes.Equal(gotJSON, wantJSON) {
		t.Fatalf("JSON(status) raw mismatch\n--- got ---\n%s\n--- want ---\n%s", gotJSON, wantJSON)
	}
}

// listItemJSON is the compact projection of list-all.json used to build ListItem/SearchItem
// fixtures (ordinal, status, category, title, sessions, tags); see testdata/list-items.json.
type listItemJSON struct {
	Ordinal  int      `json:"ordinal"`
	Status   string   `json:"status"`
	Category string   `json:"category"`
	Title    string   `json:"title"`
	Sessions int      `json:"sessions"`
	Tags     []string `json:"tags"`
}

func loadListItems(t *testing.T) []listItemJSON {
	t.Helper()
	var items []listItemJSON
	if err := json.Unmarshal(readTestdata(t, "list-items.json"), &items); err != nil {
		t.Fatalf("unmarshal list-items.json: %v", err)
	}
	return items
}

func TestListGolden(t *testing.T) {
	raw := loadListItems(t)
	items := make([]ListItem, len(raw))
	for i, r := range raw {
		items[i] = ListItem{
			Ordinal: r.Ordinal, Status: r.Status, Category: r.Category, Title: r.Title,
			Sessions: r.Sessions, Tags: r.Tags,
		}
	}
	got := List(items)
	want := string(bytes.TrimRight(readTestdata(t, "list.txt"), "\n"))
	if got != want {
		t.Fatalf("List mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestListEmpty(t *testing.T) {
	if got, want := List(nil), "No lessons found."; got != want {
		t.Fatalf("List(nil) = %q, want %q", got, want)
	}
}

func TestListStale(t *testing.T) {
	items := []ListItem{{Ordinal: 1, Status: "done", Stale: true, Category: "c", Title: "t"}}
	got := List(items)
	want := "  1  stale   [c] t"
	if got != want {
		t.Fatalf("List(stale) = %q, want %q", got, want)
	}
}

// TestSearchGolden filters the same list-items fixture down to the ordinals the Deno engine's
// `search vacuum` returned (golden/postgres-essentials/search-vacuum.txt), then checks the line
// format against that golden file.
func TestSearchGolden(t *testing.T) {
	raw := loadListItems(t)
	byOrdinal := map[int]listItemJSON{}
	for _, r := range raw {
		byOrdinal[r.Ordinal] = r
	}
	matched := []int{3, 4, 17, 20}
	items := make([]SearchItem, 0, len(matched))
	for _, ord := range matched {
		r, ok := byOrdinal[ord]
		if !ok {
			t.Fatalf("fixture missing ordinal %d", ord)
		}
		items = append(items, SearchItem{Ordinal: r.Ordinal, Category: r.Category, Title: r.Title})
	}
	got := Search(items)
	want := string(bytes.TrimRight(readTestdata(t, "search-vacuum.txt"), "\n"))
	if got != want {
		t.Fatalf("Search mismatch\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestSearchEmpty(t *testing.T) {
	if got, want := Search(nil), "No lessons found."; got != want {
		t.Fatalf("Search(nil) = %q, want %q", got, want)
	}
}

func TestTopicsEmpty(t *testing.T) {
	if got, want := Topics(nil), "No topics tagged yet."; got != want {
		t.Fatalf("Topics(nil) = %q, want %q", got, want)
	}
}

func TestModulesEmpty(t *testing.T) {
	if got, want := Modules(nil), ""; got != want {
		t.Fatalf("Modules(nil) = %q, want %q", got, want)
	}
}

func TestCoursesEmpty(t *testing.T) {
	if got, want := Courses(nil), "No courses found."; got != want {
		t.Fatalf("Courses(nil) = %q, want %q", got, want)
	}
}

// TestJSONEmptySlice checks that JSON emits [] rather than null for a nil slice, since callers
// (the CLI's list/search --json and this package's Topics/Modules/Courses JSON forms) must never
// print "null" for an empty result.
func TestJSONEmptySlice(t *testing.T) {
	var topics []Topic
	got, err := JSON(topics)
	if err != nil {
		t.Fatalf("JSON(nil topics): %v", err)
	}
	if string(got) != "[]" {
		t.Fatalf("JSON(nil []Topic) = %q, want %q", got, "[]")
	}
}

func TestBuildLessonRecordNormalizesNilTags(t *testing.T) {
	l := course.Lesson{Ordinal: 1, Slug: "x", Title: "t"}
	rec := BuildLessonRecord(l, "todo", "")
	if rec.Tags == nil {
		t.Fatal("BuildLessonRecord left Tags nil")
	}
	data, err := JSON(rec)
	if err != nil {
		t.Fatalf("JSON(rec): %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	tags, ok := decoded["tags"].([]any)
	if !ok {
		t.Fatalf("tags field missing or wrong type in %s", data)
	}
	if len(tags) != 0 {
		t.Fatalf("expected empty tags array, got %v", tags)
	}
}
