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
		n, err := progress.Init(db, lessons(5))
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
	if err := progress.EnsureReady(db); err != nil {
		t.Fatal(err)
	}
	fresh, _ := progress.Open(filepath.Join(t.TempDir(), "x.sqlite"))
	defer fresh.Close()
	if err := progress.EnsureReady(fresh); err != progress.ErrNotInitialized {
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
	if _, err := progress.Init(db, lessons(1)); err != nil {
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
	if _, err := progress.Init(db, catalog); err != nil {
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

	if _, err := progress.Seed(db, catalog); err != nil {
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
	if _, err := progress.Seed(db, catalog); err != nil {
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
		if _, err := progress.Seed(db, catalog); err != nil {
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
	if _, err := progress.Init(db, catalog); err != nil {
		t.Fatal(err)
	}
	mustExec(t, db, "INSERT INTO progress(lesson_id,status,completed_revision,completed_at) VALUES(1,'done',1,'2026-09-12T00:00:00.000Z')")
	stale := "SELECT CASE WHEN p.status='done' AND p.completed_revision<>l.revision THEN 1 ELSE 0 END FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id WHERE l.ordinal=1"
	if queryInt(t, db, stale) != 0 {
		t.Fatal("fresh completion reported stale")
	}
	catalog[0].Revision = 2
	if _, err := progress.Seed(db, catalog); err != nil {
		t.Fatal(err)
	}
	if queryInt(t, db, stale) != 1 {
		t.Fatal("revision bump did not make the completion stale")
	}
}

// Seeding a copy of each real learner database from the converted lesson files must produce the
// same rows the Deno engine's `init` produced on an identical copy (golden dump.json), ignoring
// updated_at. Requires the WP0/WP1.2 artifacts; skipped when they are absent.
func TestSeedOnRealDatabaseCopiesMatchesDenoInit(t *testing.T) {
	work := "/root/tutor-migration"
	root, _ := filepath.Abs("../..")
	if _, err := os.Stat(filepath.Join(work, "golden")); err != nil {
		t.Skip("golden corpus not present")
	}
	for _, id := range []string{"grpc", "linux", "postgres", "postgres-essentials", "sqlite"} {
		t.Run(id, func(t *testing.T) {
			if files, _ := course.LessonFiles(root, id); files == nil {
				t.Skip("lesson files not converted yet")
			}
			want, err := os.ReadFile(filepath.Join(work, "golden", id, "dump.json"))
			if err != nil {
				t.Skip(err)
			}
			dir := t.TempDir()
			for _, suffix := range []string{"", "-wal", "-shm"} {
				copyFile(t, filepath.Join(work, "baseline", id, "progress.sqlite"+suffix), filepath.Join(dir, "progress.sqlite"+suffix))
			}
			catalog, err := course.LoadLessons(root, id)
			if err != nil {
				t.Fatal(err)
			}
			db, err := progress.Open(filepath.Join(dir, "progress.sqlite"))
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			if _, err := progress.Init(db, catalog); err != nil {
				t.Fatal(err)
			}
			got := dump(t, db)
			if !reflect.DeepEqual(got, normalizeDump(t, want)) {
				g, _ := json.MarshalIndent(got, "", " ")
				t.Fatalf("dump differs from Deno init\n%s", g)
			}
		})
	}
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
