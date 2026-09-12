package progress_test

import (
	"database/sql"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"skills-tools/tutor/internal/course"
	"skills-tools/tutor/internal/progress"
	"skills-tools/tutor/internal/testutil"
)

func openTemp(t *testing.T) (*sql.DB, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "learner's progress.sqlite")
	db, err := progress.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db, path
}

func lessons(n int) []course.Lesson {
	out := make([]course.Lesson, 0, n)
	for i := 1; i <= n; i++ {
		out = append(out, testutil.Lesson(i))
	}
	return out
}

func queryInt(t *testing.T, db *sql.DB, q string, args ...any) int {
	t.Helper()
	var n int
	if err := db.QueryRow(q, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
	return n
}

func queryString(t *testing.T, db *sql.DB, q string, args ...any) string {
	t.Helper()
	var s sql.NullString
	if err := db.QueryRow(q, args...).Scan(&s); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
	return s.String
}

func TestInitIsIdempotentAndRecordsSchemaVersions(t *testing.T) {
	db, path := openTemp(t)
	for i := 0; i < 2; i++ {
		n, err := progress.Init(db, "demo", lessons(5))
		if err != nil || n != 5 {
			t.Fatalf("init %d: %d %v", i, n, err)
		}
	}
	if queryInt(t, db, "SELECT count(*) FROM lessons") != 5 || queryInt(t, db, "SELECT min(ordinal) FROM lessons WHERE active=1") != 1 || queryInt(t, db, "SELECT max(ordinal) FROM lessons WHERE active=1") != 5 {
		t.Fatal("lesson rows")
	}
	if queryInt(t, db, "SELECT count(*) FROM schema_migrations WHERE version IN (1,2,6)") != 3 {
		t.Fatal("schema versions")
	}
	if queryString(t, db, "PRAGMA journal_mode") != "wal" {
		t.Fatal("journal mode")
	}
	if queryInt(t, db, "SELECT count(*) FROM lesson_prerequisites") != 4 {
		t.Fatal("prerequisites")
	}
	if queryString(t, db, "SELECT tags FROM lessons WHERE ordinal=1") != ",demo,topic-1," {
		t.Fatal("tags column")
	}
	if err := progress.EnsureReady(db, "demo"); err != nil {
		t.Fatal(err)
	}
	fresh, _ := progress.Open(filepath.Join(t.TempDir(), "x.sqlite"))
	defer fresh.Close()
	if err := progress.EnsureReady(fresh, "demo"); err != progress.ErrNotInitialized {
		t.Fatalf("want ErrNotInitialized, got %v", err)
	}
	if _, err := progress.OpenReadOnly(filepath.Join(t.TempDir(), "absent.sqlite")); err != progress.ErrMissing {
		t.Fatalf("want ErrMissing, got %v", err)
	}
	ro, err := progress.OpenReadOnly(path)
	if err != nil {
		t.Fatal(err)
	}
	defer ro.Close()
	if _, err := ro.Exec("INSERT INTO progress(lesson_id,status) VALUES(1,'todo')"); err == nil {
		t.Fatal("read-only connection accepted a write")
	}
}

func TestEnsureSchemaRefusesLegacyColumns(t *testing.T) {
	db, _ := openTemp(t)
	if _, err := progress.Init(db, "demo", lessons(1)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("ALTER TABLE lessons ADD COLUMN reading TEXT NOT NULL DEFAULT ''"); err != nil {
		t.Fatal(err)
	}
	err := progress.EnsureSchema(db)
	if err == nil || !strings.Contains(err.Error(), "legacy column(s) reading") || !strings.Contains(err.Error(), "migrate") {
		t.Fatalf("got %v", err)
	}
}

// Port of the Deno test "re-seeding follows lesson identity across reorder, removal and reinsertion".
func TestSeedFollowsIdentityAcrossReorderRemovalAndReinsertion(t *testing.T) {
	db, _ := openTemp(t)
	catalog := lessons(3)
	if _, err := progress.Init(db, "demo", catalog); err != nil {
		t.Fatal(err)
	}
	first, second := catalog[0], catalog[1]
	firstID := queryInt(t, db, "SELECT id FROM lessons WHERE ordinal=1")
	secondID := queryInt(t, db, "SELECT id FROM lessons WHERE ordinal=2")
	// Model the previous curriculum: these identities occupied the opposite positions.
	mustExec(t, db, "UPDATE lessons SET slug='temporary-swap' WHERE id=?", firstID)
	mustExec(t, db, "UPDATE lessons SET slug=? WHERE id=?", first.Slug, secondID)
	mustExec(t, db, "UPDATE lessons SET slug=? WHERE id=?", second.Slug, firstID)
	// Ordinal 1 now carries second.Slug (id firstID); ordinal 2 carries first.Slug (id secondID).
	mustExec(t, db, "INSERT INTO progress(lesson_id,status,completed_revision,completed_at,notes) VALUES(?,'done',1,'2026-09-12T00:00:00.000Z','belongs to second slug')", firstID)
	mustExec(t, db, "INSERT INTO attempts(lesson_id,outcome,lesson_revision,notes) VALUES(?,'manual',1,'')", firstID)
	mustExec(t, db, "INSERT INTO progress(lesson_id,status,notes) VALUES(?,'skipped','belongs to first slug')", secondID)

	if _, err := progress.Seed(db, "demo", catalog); err != nil {
		t.Fatal(err)
	}
	if queryInt(t, db, "SELECT id FROM lessons WHERE ordinal=2 AND active=1") != firstID {
		t.Fatal("identity did not follow slug")
	}
	if queryString(t, db, "SELECT p.status||'|'||p.notes FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.ordinal=2 AND l.active=1") != "done|belongs to second slug" {
		t.Fatal("progress followed ordinal instead of slug")
	}
	if queryInt(t, db, "SELECT count(*) FROM attempts a JOIN lessons l ON l.id=a.lesson_id WHERE l.slug=?", second.Slug) != 1 {
		t.Fatal("attempt history did not follow identity")
	}
	// Removing an old identity and inserting its replacement must not transfer its completion.
	mustExec(t, db, "UPDATE lessons SET slug='removed-fixture' WHERE slug=?", second.Slug)
	if _, err := progress.Seed(db, "demo", catalog); err != nil {
		t.Fatal(err)
	}
	if queryInt(t, db, "SELECT count(*) FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.ordinal=2 AND l.active=1") != 0 {
		t.Fatal("new lesson inherited progress")
	}
	if queryString(t, db, "SELECT l.active||'|'||l.ordinal||'|'||p.notes FROM lessons l JOIN progress p ON p.lesson_id=l.id WHERE l.slug='removed-fixture'") != "0|4|belongs to second slug" {
		t.Fatal("retired history lost or not parked at len+1")
	}
	freshID := queryInt(t, db, "SELECT id FROM lessons WHERE slug=?", second.Slug)
	mustExec(t, db, "UPDATE lessons SET slug='replacement-fixture' WHERE id=?", freshID)
	mustExec(t, db, "UPDATE lessons SET slug=? WHERE slug='removed-fixture'", second.Slug)
	for i := 0; i < 3; i++ {
		if _, err := progress.Seed(db, "demo", catalog); err != nil {
			t.Fatal(err)
		}
	}
	if queryString(t, db, "SELECT p.status FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.ordinal=2 AND l.active=1") != "done" {
		t.Fatal("reintroduced identity lost completion")
	}
	if queryInt(t, db, "SELECT count(*) FROM pragma_foreign_key_check") != 0 {
		t.Fatal("broken prerequisites")
	}
	if queryString(t, db, "SELECT p.status||'|'||p.notes FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.slug=?", first.Slug) != "skipped|belongs to first slug" {
		t.Fatal("skip moved to wrong lesson")
	}
	// Retired rows are parked at consecutive ordinals after the active range, in id order.
	if queryString(t, db, "SELECT group_concat(ordinal) FROM (SELECT ordinal FROM lessons WHERE active=0 ORDER BY id)") != "4" {
		t.Fatalf("parked ordinals: %s", queryString(t, db, "SELECT group_concat(ordinal) FROM (SELECT ordinal FROM lessons WHERE active=0 ORDER BY id)"))
	}
}

func TestRevisionBumpMakesCompletionStale(t *testing.T) {
	db, _ := openTemp(t)
	catalog := lessons(2)
	if _, err := progress.Init(db, "demo", catalog); err != nil {
		t.Fatal(err)
	}
	mustExec(t, db, "INSERT INTO progress(lesson_id,status,completed_revision,completed_at) VALUES(1,'done',1,'2026-09-12T00:00:00.000Z')")
	stale := "SELECT CASE WHEN p.status='done' AND p.completed_revision<>l.revision THEN 1 ELSE 0 END FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id WHERE l.ordinal=1"
	if queryInt(t, db, stale) != 0 {
		t.Fatal("fresh completion reported stale")
	}
	catalog[0].Revision = 2
	if _, err := progress.Seed(db, "demo", catalog); err != nil {
		t.Fatal(err)
	}
	if queryInt(t, db, stale) != 1 {
		t.Fatal("revision bump did not make the completion stale")
	}
}

// TestConsolidateRealDatabaseCopiesThenSeedMatchesDenoInit is the Phase 9 form of the seed parity
// check: copies of the five baseline learner databases are consolidated into one temporary
// tutor.sqlite, the per-course dumps must equal WP0.1's dump.json (ids remapped, everything else
// identical), a second run is refused, --replace works, and after `Init` on the consolidated file
// each course's dump must equal the golden Deno `init` dump. Requires the WP0/WP1.2 artifacts;
// skipped when they are absent.
func TestConsolidateRealDatabaseCopiesThenSeedMatchesDenoInit(t *testing.T) {
	work := "/root/tutor-migration"
	root, _ := filepath.Abs("../..")
	if _, err := os.Stat(filepath.Join(work, "golden")); err != nil {
		t.Skip("golden corpus not present")
	}
	ids := []string{"grpc", "linux", "postgres", "postgres-essentials", "sqlite"}
	for _, id := range ids {
		if files, _ := course.LessonFiles(root, id); files == nil {
			t.Skip("lesson files not converted yet")
		}
	}
	dir := t.TempDir()
	from := filepath.Join(dir, "courses")
	for _, id := range ids {
		for _, suffix := range []string{"", "-wal", "-shm"} {
			copyFile(t, filepath.Join(work, "baseline", id, "progress.sqlite"+suffix), filepath.Join(from, id, "progress.sqlite"+suffix))
		}
	}
	opts := progress.ConsolidateOptions{
		Target:    filepath.Join(dir, "tutor.sqlite"),
		FromDir:   from,
		BackupDir: filepath.Join(dir, "backup"),
		Courses:   append([]string{"absent-course"}, ids...),
	}
	reports, err := progress.Consolidate(opts)
	if err != nil {
		t.Fatal(err)
	}
	if len(reports) != 6 || reports[0].Skipped == "" {
		t.Fatalf("reports = %+v", reports)
	}
	for _, id := range ids {
		if _, err := os.Stat(filepath.Join(from, id, "progress.sqlite")); !os.IsNotExist(err) {
			t.Fatalf("%s: legacy file still in place", id)
		}
		if _, err := os.Stat(filepath.Join(dir, "backup", id, "progress.sqlite-wal")); err != nil {
			t.Fatalf("%s: backup trio incomplete: %v", id, err)
		}
	}

	db, err := progress.Open(opts.Target)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for i, id := range ids {
		want, err := os.ReadFile(filepath.Join(work, "baseline", id, "dump.json"))
		if err != nil {
			t.Fatal(err)
		}
		got := courseDump(t, db, id)
		if !reflect.DeepEqual(idFree(got), idFree(normalizeDump(t, want))) {
			g, _ := json.MarshalIndent(idFree(got), "", " ")
			t.Fatalf("%s: consolidated dump differs from the baseline\n%s", id, g)
		}
		if reports[i+1].Lessons != len(got.Lessons) || reports[i+1].Progress != len(got.Progress) || reports[i+1].Attempts != len(got.Attempts) {
			t.Fatalf("%s: report %+v does not match the dump", id, reports[i+1])
		}
	}
	if n := queryInt(t, db, "SELECT count(*) FROM schema_migrations WHERE version=7 AND name='consolidate courses'"); n != 1 {
		t.Fatal("migration 7 not recorded")
	}

	// A second run over the backups is refused per course, and --replace copies over the rows.
	again := opts
	again.FromDir = filepath.Join(dir, "backup")
	again.BackupDir = filepath.Join(dir, "backup2")
	if _, err := progress.Consolidate(again); err == nil || !strings.Contains(err.Error(), "already has") {
		t.Fatalf("second consolidate: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "backup", "grpc", "progress.sqlite")); err != nil {
		t.Fatal("a refused run moved the legacy files")
	}
	again.Replace = true
	if _, err := progress.Consolidate(again); err != nil {
		t.Fatal(err)
	}
	// Seeding each course from its lesson files now matches the Deno init on the same history.
	for _, id := range ids {
		want, err := os.ReadFile(filepath.Join(work, "golden", id, "dump.json"))
		if err != nil {
			t.Skip(err)
		}
		catalog, err := course.LoadLessons(root, id)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := progress.Init(db, id, catalog); err != nil {
			t.Fatal(err)
		}
		got := courseDump(t, db, id)
		if !reflect.DeepEqual(idFree(got), idFree(normalizeDump(t, want))) {
			g, _ := json.MarshalIndent(idFree(got), "", " ")
			t.Fatalf("%s: dump after init differs from Deno init\n%s", id, g)
		}
	}
	// Every course's history is still present after all five seeds.
	for _, id := range ids {
		if queryInt(t, db, "SELECT count(*) FROM lessons WHERE course_id=? AND active=1", id) == 0 {
			t.Fatalf("%s lost its rows", id)
		}
	}
}

// courseDump reads one course's rows in the shape of the sqlite3 dump files.
func courseDump(t *testing.T, db *sql.DB, courseID string) dumpRows {
	t.Helper()
	q := func(sqlText string) []map[string]any {
		rows, err := db.Query(sqlText, courseID)
		if err != nil {
			t.Fatal(err)
		}
		return rowsToMaps(t, rows)
	}
	return dumpRows{
		Lessons:  q("SELECT id,ordinal,slug,revision,active FROM lessons WHERE course_id=? ORDER BY id"),
		Progress: q("SELECT p.* FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.course_id=? ORDER BY p.lesson_id"),
		Attempts: q("SELECT a.* FROM attempts a JOIN lessons l ON l.id=a.lesson_id WHERE l.course_id=? ORDER BY a.id"),
	}
}

// idFree rewrites a dump so it no longer depends on row ids: lessons lose id (their order by id is
// kept), progress and attempts reference lessons by slug, attempts lose their own id.
func idFree(d dumpRows) dumpRows {
	slugByID := map[float64]string{}
	var lessons []map[string]any
	for _, l := range d.Lessons {
		slugByID[l["id"].(float64)] = l["slug"].(string)
		m := map[string]any{}
		for k, v := range l {
			if k != "id" {
				m[k] = v
			}
		}
		lessons = append(lessons, m)
	}
	rewrite := func(rows []map[string]any, dropID bool) []map[string]any {
		var out []map[string]any
		for _, r := range rows {
			m := map[string]any{}
			for k, v := range r {
				switch {
				case k == "lesson_id":
					m["lesson"] = slugByID[v.(float64)]
				case k == "id" && dropID:
				default:
					m[k] = v
				}
			}
			out = append(out, m)
		}
		return out
	}
	return dumpRows{Lessons: lessons, Progress: rewrite(d.Progress, false), Attempts: rewrite(d.Attempts, true)}
}

type dumpRows struct {
	Lessons  []map[string]any
	Progress []map[string]any
	Attempts []map[string]any
}

func rowsToMaps(t *testing.T, rows *sql.Rows) []map[string]any {
	t.Helper()
	defer rows.Close()
	cols, _ := rows.Columns()
	var out []map[string]any
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			t.Fatal(err)
		}
		m := map[string]any{}
		for i, c := range cols {
			if c == "updated_at" {
				continue
			}
			switch v := vals[i].(type) {
			case int64:
				m[c] = float64(v)
			case []byte:
				m[c] = string(v)
			default:
				m[c] = v
			}
		}
		out = append(out, m)
	}
	return out
}

func dump(t *testing.T, db *sql.DB) dumpRows {
	t.Helper()
	q := func(sqlText string) []map[string]any {
		rows, err := db.Query(sqlText)
		if err != nil {
			t.Fatal(err)
		}
		return rowsToMaps(t, rows)
	}
	return dumpRows{
		Lessons:  q("SELECT id,ordinal,slug,revision,active FROM lessons ORDER BY id"),
		Progress: q("SELECT * FROM progress ORDER BY lesson_id"),
		Attempts: q("SELECT * FROM attempts ORDER BY id"),
	}
}

// normalizeDump parses sqlite3's ".mode json" output: three JSON arrays concatenated.
func normalizeDump(t *testing.T, data []byte) dumpRows {
	t.Helper()
	dec := json.NewDecoder(strings.NewReader(string(data)))
	var arrays [][]map[string]any
	for {
		var a []map[string]any
		if err := dec.Decode(&a); err == io.EOF {
			break
		} else if err != nil {
			t.Fatal(err)
		}
		arrays = append(arrays, a)
	}
	for len(arrays) < 3 {
		arrays = append(arrays, nil)
	}
	for _, a := range arrays {
		for _, m := range a {
			delete(m, "updated_at")
		}
	}
	return dumpRows{Lessons: arrays[0], Progress: arrays[1], Attempts: arrays[2]}
}

func copyFile(t *testing.T, src, dst string) {
	t.Helper()
	data, err := os.ReadFile(src)
	if os.IsNotExist(err) {
		return
	}
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dst, data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func mustExec(t *testing.T, db *sql.DB, q string, args ...any) {
	t.Helper()
	if _, err := db.Exec(q, args...); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
}
