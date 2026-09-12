package cli

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"skills-tools/tutor/internal/course"
	"skills-tools/tutor/internal/progress"
	"skills-tools/tutor/internal/route"
	"skills-tools/tutor/internal/testutil"
)

type legacyCourseSpec struct {
	stored string
	public string
	name   string
}

var legacyCourseSpecs = []legacyCourseSpec{
	{stored: "postgres", public: "postgres-legacy", name: "PostgreSQL (Legacy)"},
	{stored: "sqlite", public: "sqlite-legacy", name: "SQLite (Legacy)"},
	{stored: "linux", public: "linux-legacy", name: "Linux (Legacy)"},
}

type legacyFlowFixture struct {
	repo    string
	root    string
	db      string
	courses map[string]course.Course
	lessons map[string][]course.Lesson
}

func newLegacyFlowFixture(t *testing.T) *legacyFlowFixture {
	t.Helper()
	repo := filepath.Join(t.TempDir(), "alternate repo with 'quote'")
	root := filepath.Join(repo, "curriculum tools")
	if err := os.MkdirAll(filepath.Join(repo, "future-courses"), 0o755); err != nil {
		t.Fatal(err)
	}
	x := &legacyFlowFixture{
		repo:    repo,
		root:    root,
		db:      filepath.Join(t.TempDir(), "shared history with 'quote'.sqlite"),
		courses: map[string]course.Course{},
		lessons: map[string][]course.Lesson{},
	}
	for _, spec := range legacyCourseSpecs {
		x.writeCourse(t, spec.stored, spec.public, spec.name, 3)
	}
	x.writeCourse(t, "grpc", "", "gRPC", 2)
	planDir := filepath.Join(repo, "future-courses", "planned-demo")
	if err := os.MkdirAll(planDir, 0o755); err != nil {
		t.Fatal(err)
	}
	plan := testutil.CanonicalPlan("Planned Demo", "planned-demo", []string{
		"First planned lesson / first-planned-lesson",
		"Second planned lesson / second-planned-lesson",
	})
	if err := os.WriteFile(filepath.Join(planDir, "course.md"), []byte(plan), 0o644); err != nil {
		t.Fatal(err)
	}

	t.Setenv("TUTOR_ROOT", filepath.Join(t.TempDir(), "wrong tutor root"))
	return x
}

func (x *legacyFlowFixture) writeCourse(t *testing.T, stored, public, name string, count int) {
	t.Helper()
	c := course.Course{
		ID: stored, CommandName: public, Name: name, Description: "Temporary legacy-flow fixture",
		Tool: "bash", Status: "reference", MinVersion: "5.1", Revision: 1,
		Repl: &course.Repl{
			Command: []string{"bash", "--noprofile", "--norc"},
			Quit:    "exit",
			Mode:    "shell",
		},
	}
	lessons := make([]course.Lesson, 0, count)
	for ordinal := 1; ordinal <= count; ordinal++ {
		lesson := testutil.Lesson(ordinal)
		lesson.Title = fmt.Sprintf("%s lesson %d", name, ordinal)
		lesson.Setup = ""
		lesson.Code = fmt.Sprintf("printf '%s lesson %d ok\\n'", stored, ordinal)
		lesson.ExpectedResult = fmt.Sprintf("%s lesson %d ok", stored, ordinal)
		lesson.Sessions = 1
		lessons = append(lessons, lesson)
	}
	x.courses[stored] = c
	x.lessons[stored] = lessons
	x.rewriteCourse(t, stored)
}

func (x *legacyFlowFixture) rewriteCourse(t *testing.T, stored string) {
	t.Helper()
	c := x.courses[stored]
	lessons := x.lessons[stored]
	dir := filepath.Join(x.root, "courses", stored)
	if err := os.MkdirAll(filepath.Join(dir, "lessons"), 0o755); err != nil {
		t.Fatal(err)
	}
	metadata, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "course.json"), append(metadata, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}
	entries := make([]string, 0, len(lessons))
	for i, lesson := range lessons {
		var prerequisites []string
		if i > 0 {
			prerequisites = []string{lessons[i-1].Slug}
		}
		path := filepath.Join(dir, "lessons", course.FileName(lesson.Ordinal, lesson.Slug))
		if err := os.WriteFile(path, course.FormatLessonFile(c, lesson, prerequisites), 0o644); err != nil {
			t.Fatal(err)
		}
		entries = append(entries, lesson.Title+" / "+lesson.Slug)
	}
	plan := testutil.CanonicalPlan(c.Name, c.ID, entries)
	if err := os.WriteFile(filepath.Join(dir, "PLAN.md"), []byte(plan), 0o644); err != nil {
		t.Fatal(err)
	}
}

func (x *legacyFlowFixture) run(args ...string) (string, string, int) {
	var stdout, stderr bytes.Buffer
	code := Execute(append([]string{"--root", x.root}, args...), &stdout, &stderr)
	return stdout.String(), stderr.String(), code
}

func (x *legacyFlowFixture) runOK(t *testing.T, args ...string) string {
	t.Helper()
	stdout, stderr, code := x.run(args...)
	if code != 0 || stderr != "" {
		t.Fatalf("tutor %s: exit=%d stdout=%q stderr=%q", strings.Join(args, " "), code, stdout, stderr)
	}
	return stdout
}

func assertLegacyDBAbsent(t *testing.T, path string) {
	t.Helper()
	for _, candidate := range []string{path, path + "-wal", path + "-shm", path + "-journal"} {
		if _, err := os.Stat(candidate); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("read-only command created %s: %v", candidate, err)
		}
	}
}

func TestLegacyFlowDiscoveryHelpAndMissingDatabaseArePublicAndReadOnly(t *testing.T) {
	x := newLegacyFlowFixture(t)
	assertLegacyDBAbsent(t, x.db)

	discovered, err := route.DiscoverCourses(x.root)
	if err != nil {
		t.Fatal(err)
	}
	wantIDs := []string{"grpc", "linux-legacy", "planned-demo", "postgres-legacy", "sqlite-legacy"}
	gotIDs := make([]string, 0, len(discovered))
	for _, d := range discovered {
		gotIDs = append(gotIDs, d.ID)
		switch d.ID {
		case "planned-demo":
			if !d.Planned || d.Implemented || d.Authored != 0 || d.Available != 0 || d.Total != 2 {
				t.Fatalf("planned discovery counts = %+v", d)
			}
		default:
			if !d.Implemented || d.Planned || d.Authored != len(x.lessons[d.StorageID()]) ||
				d.Available != len(x.lessons[d.StorageID()]) || d.Total != len(x.lessons[d.StorageID()]) {
				t.Fatalf("implemented discovery counts = %+v", d)
			}
		}
	}
	if !reflect.DeepEqual(gotIDs, wantIDs) {
		t.Fatalf("discovered IDs = %q, want %q", gotIDs, wantIDs)
	}

	identities, err := route.DiscoverIdentities(x.root)
	if err != nil {
		t.Fatal(err)
	}
	if len(identities) != len(wantIDs) {
		t.Fatalf("identity discovery returned %d courses, want %d", len(identities), len(wantIDs))
	}
	for _, d := range identities {
		if d.Authored != 0 || d.Available != 0 || d.Total != 0 {
			t.Fatalf("identity-only discovery loaded catalog counts: %+v", d)
		}
	}

	coursesJSON := x.runOK(t, "courses", "--json")
	var listed []route.CourseDiscovery
	if err := json.Unmarshal([]byte(coursesJSON), &listed); err != nil {
		t.Fatalf("courses output is not JSON: %v\n%s", err, coursesJSON)
	}
	listedIDs := make([]string, 0, len(listed))
	for _, d := range listed {
		listedIDs = append(listedIDs, d.ID)
	}
	if !reflect.DeepEqual(listedIDs, wantIDs) {
		t.Fatalf("courses listed %q, want one canonical entry each: %q", listedIDs, wantIDs)
	}

	for _, spec := range legacyCourseSpecs {
		publicHelp := x.runOK(t, spec.public)
		aliasHelp := x.runOK(t, spec.stored)
		if publicHelp != aliasHelp || !strings.Contains(aliasHelp, "tutor "+spec.public+" route") {
			t.Fatalf("%s alias help did not advertise canonical command:\n%s", spec.stored, aliasHelp)
		}
		for _, spelling := range []string{spec.public, spec.stored} {
			routeJSON := x.runOK(t, spelling, "route", "--json", "--db", x.db)
			if !strings.Contains(routeJSON, `"id": "`+spec.public+`"`) {
				t.Fatalf("%s route did not publish %s:\n%s", spelling, spec.public, routeJSON)
			}
			stdout, stderr, code := x.run(spelling, "1", "lesson", "--db", x.db)
			if code != 1 || stdout != "" || stderr != "Error: progress database is not initialized; run 'tutor <course> init'\n" {
				t.Fatalf("%s missing-db lesson: exit=%d stdout=%q stderr=%q", spelling, code, stdout, stderr)
			}
			assertLegacyDBAbsent(t, x.db)
		}
	}

	planned := x.runOK(t, "planned-demo", "route", "--json", "--db", x.db)
	if !strings.Contains(planned, `"id": "planned-demo"`) || !strings.Contains(planned, `"available": false`) {
		t.Fatalf("planned route output = %s", planned)
	}
	stdout, stderr, code := x.run("planned-demo", "lesson", "--db", x.db)
	if code != 2 || stdout != "" || !strings.Contains(stderr, "planned, not implemented") {
		t.Fatalf("planned lesson: exit=%d stdout=%q stderr=%q", code, stdout, stderr)
	}
	assertLegacyDBAbsent(t, x.db)
}

type legacyLessonState struct {
	ID                int64
	CourseID          string
	Slug              string
	Revision          int
	Active            int
	Status            string
	CompletedRevision sql.NullInt64
	Notes             string
	Attempts          int
}

func legacyLesson(t *testing.T, db *sql.DB, stored, slug string) legacyLessonState {
	t.Helper()
	var state legacyLessonState
	err := db.QueryRow(`SELECT l.id,l.course_id,l.slug,l.revision,l.active,
		COALESCE(p.status,''),p.completed_revision,COALESCE(p.notes,''),
		(SELECT count(*) FROM attempts a WHERE a.lesson_id=l.id)
		FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id
		WHERE l.course_id=? AND l.slug=?`, stored, slug).Scan(
		&state.ID, &state.CourseID, &state.Slug, &state.Revision, &state.Active,
		&state.Status, &state.CompletedRevision, &state.Notes, &state.Attempts,
	)
	if err != nil {
		t.Fatal(err)
	}
	return state
}

func legacyCourseSnapshot(t *testing.T, db *sql.DB, stored string) []string {
	t.Helper()
	rows, err := db.Query(`SELECT l.id,l.course_id,l.ordinal,l.slug,l.revision,l.active,
		COALESCE(p.status,''),COALESCE(p.completed_revision,-1),COALESCE(p.completed_at,''),COALESCE(p.notes,''),
		COALESCE(a.id,-1),COALESCE(a.outcome,''),COALESCE(a.lesson_revision,-1),COALESCE(a.notes,'')
		FROM lessons l
		LEFT JOIN progress p ON p.lesson_id=l.id
		LEFT JOIN attempts a ON a.lesson_id=l.id
		WHERE l.course_id=? ORDER BY l.id,a.id`, stored)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var snapshot []string
	for rows.Next() {
		var id, ordinal, revision, active, completedRevision, attemptID, attemptRevision int64
		var courseID, slug, status, completedAt, notes, outcome, attemptNotes string
		if err := rows.Scan(&id, &courseID, &ordinal, &slug, &revision, &active, &status,
			&completedRevision, &completedAt, &notes, &attemptID, &outcome, &attemptRevision, &attemptNotes); err != nil {
			t.Fatal(err)
		}
		snapshot = append(snapshot, fmt.Sprint(id, "|", courseID, "|", ordinal, "|", slug, "|", revision,
			"|", active, "|", status, "|", completedRevision, "|", completedAt, "|", notes,
			"|", attemptID, "|", outcome, "|", attemptRevision, "|", attemptNotes))
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return snapshot
}

func TestLegacyFlowAliasesPreserveOneStoredHistory(t *testing.T) {
	x := newLegacyFlowFixture(t)
	quotedNote := `kept "double quote", 'single quote', and $literal`
	skipNote := `skipped from old alias: "later"`

	x.runOK(t, "grpc", "init", "--db", x.db)
	x.runOK(t, "grpc", "1", "done", "--db", x.db, "--note", "unrelated history")

	for _, spec := range legacyCourseSpecs {
		want := fmt.Sprintf("Initialized 3 %s lessons in %s\n", spec.name, x.db)
		if got := x.runOK(t, spec.public, "init", "--db", x.db); got != want {
			t.Fatalf("%s init = %q, want %q", spec.public, got, want)
		}

		publicLesson := x.runOK(t, spec.public, "1", "lesson", "--plain", "--db", x.db)
		aliasLesson := x.runOK(t, spec.stored, "1", "lesson", "--plain", "--db", x.db)
		if publicLesson != aliasLesson || !strings.Contains(aliasLesson, "`tutor "+spec.public+" 1 done") {
			t.Fatalf("%s lesson aliases diverged or exposed stored name", spec.stored)
		}

		x.runOK(t, spec.public, "1", "done", "--db", x.db, "--note", "done from public")
		x.runOK(t, spec.stored, "1", "done", "--db", x.db)
		x.runOK(t, spec.public, "done", "1", "--db", x.db)
		x.runOK(t, spec.stored, "done", "1", "--db", x.db)
		x.runOK(t, spec.stored, "skip", "2", "--db", x.db, "--note", skipNote)
		x.runOK(t, spec.public, "skip", "2", "--db", x.db)
		x.runOK(t, spec.public, "2", "skip", "--db", x.db)
		x.runOK(t, spec.stored, "2", "skip", "--db", x.db)
		x.runOK(t, spec.stored, "note", "1", quotedNote, "--db", x.db)

		lessonJSON := x.runOK(t, spec.public, "lesson", "1", "--json", "--db", x.db)
		if !strings.Contains(lessonJSON, `"status": "done"`) ||
			!strings.Contains(lessonJSON, `"notes": `+fmt.Sprintf("%q", quotedNote)) {
			t.Fatalf("%s did not see alias-written status/note:\n%s", spec.public, lessonJSON)
		}
	}

	// Give the PostgreSQL fixture a stale completion and a retired lesson before the second init.
	x.runOK(t, "postgres", "done", "3", "--db", x.db, "--note", "retired history")
	postgresLessons := x.lessons["postgres"]
	retiredPath := filepath.Join(x.root, "courses", "postgres", "lessons",
		course.FileName(postgresLessons[2].Ordinal, postgresLessons[2].Slug))
	if err := os.Remove(retiredPath); err != nil {
		t.Fatal(err)
	}
	postgresLessons = postgresLessons[:2]
	postgresLessons[0].Revision = 2
	x.lessons["postgres"] = postgresLessons
	x.rewriteCourse(t, "postgres")

	db, err := progress.OpenReadOnly(x.db)
	if err != nil {
		t.Fatal(err)
	}
	grpcBefore := legacyCourseSnapshot(t, db, "grpc")
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	for _, spec := range legacyCourseSpecs {
		wantCount := len(x.lessons[spec.stored])
		want := fmt.Sprintf("Initialized %d %s lessons in %s\n", wantCount, spec.name, x.db)
		if got := x.runOK(t, spec.stored, "init", "--db", x.db); got != want {
			t.Fatalf("second init through %s = %q, want %q", spec.stored, got, want)
		}
	}

	db, err = progress.OpenReadOnly(x.db)
	if err != nil {
		t.Fatal(err)
	}
	if grpcAfter := legacyCourseSnapshot(t, db, "grpc"); !reflect.DeepEqual(grpcAfter, grpcBefore) {
		t.Fatalf("legacy refresh changed unrelated course\nbefore: %q\nafter:  %q", grpcBefore, grpcAfter)
	}
	var suffixedRows int
	if err := db.QueryRow(`SELECT count(*) FROM lessons WHERE course_id IN ('postgres-legacy','sqlite-legacy','linux-legacy')`).Scan(&suffixedRows); err != nil {
		t.Fatal(err)
	}
	if suffixedRows != 0 {
		t.Fatalf("public names created %d suffixed lesson rows", suffixedRows)
	}
	for _, spec := range legacyCourseSpecs {
		first := legacyLesson(t, db, spec.stored, "lesson-01")
		if first.CourseID != spec.stored || first.Status != "done" || first.Notes != quotedNote || first.Attempts != 4 {
			t.Fatalf("%s first lesson history = %+v", spec.stored, first)
		}
		second := legacyLesson(t, db, spec.stored, "lesson-02")
		if second.Status != "skipped" || second.Notes != skipNote || second.Attempts != 4 || second.CompletedRevision.Valid {
			t.Fatalf("%s second lesson history = %+v", spec.stored, second)
		}
	}
	stale := legacyLesson(t, db, "postgres", "lesson-01")
	if stale.Revision != 2 || !stale.CompletedRevision.Valid || stale.CompletedRevision.Int64 != 1 {
		t.Fatalf("stale PostgreSQL completion was not retained: %+v", stale)
	}
	retired := legacyLesson(t, db, "postgres", "lesson-03")
	if retired.Active != 0 || retired.Status != "done" || retired.Notes != "retired history" || retired.Attempts != 1 {
		t.Fatalf("retired PostgreSQL history was not retained: %+v", retired)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	for _, spec := range legacyCourseSpecs {
		for _, spelling := range []string{spec.public, spec.stored} {
			check := x.runOK(t, spelling, "check")
			if check != fmt.Sprintf("%s: %d lessons OK\n", spec.public, len(x.lessons[spec.stored])) {
				t.Fatalf("%s check = %q", spelling, check)
			}
			validation := x.runOK(t, spelling, "validate", "--from", "1", "--to", "1", "--timeout", "2000", "1")
			if !strings.Contains(validation, "1/1 lessons completed without timeout") {
				t.Fatalf("%s validate did not run owned fixture:\n%s", spelling, validation)
			}
		}
	}

	beforeVerify, err := os.ReadFile(x.db)
	if err != nil {
		t.Fatal(err)
	}
	for _, spec := range legacyCourseSpecs {
		for _, spelling := range []string{spec.public, spec.stored} {
			reportJSON := x.runOK(t, spelling, "progress", "verify", "--db", x.db)
			var report progressVerifyReport
			if err := json.Unmarshal([]byte(reportJSON), &report); err != nil {
				t.Fatalf("%s progress verify output: %v\n%s", spelling, err, reportJSON)
			}
			if !report.ProgressUnchanged || !report.AttemptsUnchanged || !report.IdentitiesPreserved {
				t.Fatalf("%s progress verify report = %+v", spelling, report)
			}
		}
	}
	afterVerify, err := os.ReadFile(x.db)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(afterVerify, beforeVerify) {
		t.Fatal("progress verify through a public name or alias changed the source database")
	}

	for _, spec := range legacyCourseSpecs {
		statusJSON := x.runOK(t, spec.stored, "status", "--json", "--db", x.db)
		if !strings.Contains(statusJSON, `"course": "`+spec.public+`"`) {
			t.Fatalf("alias status did not advertise %s:\n%s", spec.public, statusJSON)
		}
	}
	postgresRoute := x.runOK(t, "postgres", "route", "--json", "--db", x.db)
	if !strings.Contains(postgresRoute, `"id": "postgres-legacy"`) ||
		!strings.Contains(postgresRoute, `"stale": true`) ||
		!strings.Contains(postgresRoute, `"skipped": true`) {
		t.Fatalf("alias route omitted public identity or stale state:\n%s", postgresRoute)
	}
	stdout, stderr, code := x.run("postgres", "done", "--db", x.db)
	if code != 2 || stdout != "" || stderr != "Error: usage: tutor postgres-legacy N done [--note TEXT]\n" {
		t.Fatalf("alias error path: exit=%d stdout=%q stderr=%q", code, stdout, stderr)
	}
}

func TestLegacyFlowRejectsCollisionsAndMalformedMetadataBeforeWrites(t *testing.T) {
	t.Run("public name collides with another stored alias", func(t *testing.T) {
		x := newLegacyFlowFixture(t)
		metadata := x.courses["sqlite"]
		metadata.CommandName = "postgres"
		x.courses["sqlite"] = metadata
		x.rewriteCourse(t, "sqlite")

		if _, err := route.DiscoverIdentities(x.root); err == nil || !strings.Contains(err.Error(), "collides") {
			t.Fatalf("identity discovery collision error = %v", err)
		}
		stdout, stderr, code := x.run("postgres-legacy", "init", "--db", x.db)
		if code != 2 || stdout != "" || !strings.Contains(stderr, "collides") {
			t.Fatalf("collision command: exit=%d stdout=%q stderr=%q", code, stdout, stderr)
		}
		assertLegacyDBAbsent(t, x.db)
	})

	t.Run("future name collides with a public name", func(t *testing.T) {
		x := newLegacyFlowFixture(t)
		planDir := filepath.Join(x.repo, "future-courses", "collision")
		if err := os.MkdirAll(planDir, 0o755); err != nil {
			t.Fatal(err)
		}
		plan := testutil.CanonicalPlan("Collision", "linux-legacy", []string{"One / one"})
		if err := os.WriteFile(filepath.Join(planDir, "course.md"), []byte(plan), 0o644); err != nil {
			t.Fatal(err)
		}
		stdout, stderr, code := x.run("linux-legacy", "init", "--db", x.db)
		if code != 2 || stdout != "" || !strings.Contains(stderr, "collides") {
			t.Fatalf("planned collision: exit=%d stdout=%q stderr=%q", code, stdout, stderr)
		}
		assertLegacyDBAbsent(t, x.db)
	})

	t.Run("malformed metadata", func(t *testing.T) {
		x := newLegacyFlowFixture(t)
		path := filepath.Join(x.root, "courses", "postgres", "course.json")
		if err := os.WriteFile(path, []byte("{ malformed\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := route.DiscoverIdentities(x.root); err == nil || !strings.Contains(err.Error(), "course.json") {
			t.Fatalf("malformed identity discovery error = %v", err)
		}
		stdout, stderr, code := x.run("postgres-legacy", "init", "--db", x.db)
		if code != 2 || stdout != "" || !strings.Contains(stderr, "course.json") {
			t.Fatalf("malformed metadata command: exit=%d stdout=%q stderr=%q", code, stdout, stderr)
		}
		assertLegacyDBAbsent(t, x.db)
	})
}

func TestLegacyFlowDegradedDiscoveryKeepsRenamedMaintenanceReachable(t *testing.T) {
	x := newLegacyFlowFixture(t)
	badPlan := testutil.CanonicalPlan("PostgreSQL (Legacy)", "postgres", []string{
		"Wrong identity / wrong-identity",
		"PostgreSQL lesson 2 / lesson-02",
		"PostgreSQL lesson 3 / lesson-03",
	})
	planPath := filepath.Join(x.root, "courses", "postgres", "PLAN.md")
	if err := os.WriteFile(planPath, []byte(badPlan), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := route.DiscoverCourses(x.root); err == nil || !strings.Contains(err.Error(), "Route/catalog mismatch") {
		t.Fatalf("full discovery error = %v", err)
	}
	identities, err := route.DiscoverIdentities(x.root)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, d := range identities {
		names = append(names, d.ID)
	}
	sort.Strings(names)
	if !reflect.DeepEqual(names, []string{"grpc", "linux-legacy", "planned-demo", "postgres-legacy", "sqlite-legacy"}) {
		t.Fatalf("degraded identity names = %q", names)
	}

	for _, spelling := range []string{"postgres-legacy", "postgres"} {
		stdout, stderr, code := x.run(spelling, "check")
		if code != 1 || stdout != "" || !strings.Contains(stderr, "Route/catalog mismatch") {
			t.Fatalf("%s degraded check: exit=%d stdout=%q stderr=%q", spelling, code, stdout, stderr)
		}
		validation := x.runOK(t, spelling, "validate", "--from", "1", "--to", "1", "--timeout", "2000", "1")
		if !strings.Contains(validation, "1/1 lessons completed without timeout") {
			t.Fatalf("%s degraded validate did not run:\n%s", spelling, validation)
		}
	}
	stdout, stderr, code := x.run("postgres", "init", "--db", x.db)
	if code != 1 || stdout != "" || !strings.Contains(stderr, "Route/catalog mismatch") {
		t.Fatalf("degraded init: exit=%d stdout=%q stderr=%q", code, stdout, stderr)
	}
	assertLegacyDBAbsent(t, x.db)
}
