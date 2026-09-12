package progress_test

import (
	"database/sql"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"skills-tools/tutor/internal/progress"
)

// writeLegacy builds a per-course database at dir/<id>/progress.sqlite with n lessons, lesson 1
// done with a note, lesson 2 skipped, one retired row and two attempts.
func writeLegacy(t *testing.T, dir, id string, n int) string {
	t.Helper()
	path := filepath.Join(dir, id, "progress.sqlite")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	mustExec(t, db, progress.LegacySchema)
	insert := `INSERT INTO lessons(id,ordinal,slug,title,category,difficulty,tags,overview,syntax_breakdown,code,expected_result,systems_lens,safety_level,run_in,min_version,estimated_minutes,revision,active,updated_at)
		VALUES(?,?,?,?,'core','beginner',',t,','o','s','c','e','l','read-only','shell','1',5,?,?,'2026-01-01T00:00:00.000Z')`
	for i := 1; i <= n; i++ {
		mustExec(t, db, insert, i*10, i, id+"-lesson-"+strings.Repeat("x", i), "Title "+id, 1, 1)
	}
	mustExec(t, db, insert, 999, n+1, id+"-retired", "Retired", 3, 0)
	if n >= 2 {
		mustExec(t, db, "INSERT INTO lesson_prerequisites(lesson_id,prerequisite_id) VALUES(20,10)")
	}
	mustExec(t, db, "INSERT INTO progress(lesson_id,status,completed_revision,completed_at,notes,updated_at) VALUES(10,'done',1,'2026-02-02T00:00:00.000Z','my note','2026-02-02T00:00:00.000Z')")
	mustExec(t, db, "INSERT INTO progress(lesson_id,status,notes) VALUES(20,'skipped','')")
	mustExec(t, db, "INSERT INTO attempts(lesson_id,outcome,lesson_revision,attempted_at,notes) VALUES(10,'manual',1,'2026-02-02T00:00:00.000Z','my note')")
	mustExec(t, db, "INSERT INTO attempts(lesson_id,outcome,lesson_revision,notes) VALUES(999,'manual',3,'')")
	return path
}

func TestConsolidateRemapsIdsAndKeepsHistory(t *testing.T) {
	dir := t.TempDir()
	writeLegacy(t, filepath.Join(dir, "courses"), "alpha", 3)
	writeLegacy(t, filepath.Join(dir, "courses"), "beta", 2)
	target := filepath.Join(dir, "tutor.sqlite")
	opts := progress.ConsolidateOptions{Target: target, FromDir: filepath.Join(dir, "courses"), BackupDir: filepath.Join(dir, "backup"), Courses: []string{"alpha", "beta"}}
	reports, err := progress.Consolidate(opts)
	if err != nil {
		t.Fatal(err)
	}
	if len(reports) != 2 || reports[0].Lessons != 4 || reports[0].Progress != 2 || reports[0].Attempts != 2 || reports[1].Lessons != 3 {
		t.Fatalf("reports = %+v", reports)
	}
	db, err := progress.Open(target)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	// Ids are dense and global: alpha 1..4, beta 5..7; the retired rows keep active=0.
	if queryInt(t, db, "SELECT max(id) FROM lessons") != 7 || queryInt(t, db, "SELECT count(*) FROM lessons WHERE active=0") != 2 {
		t.Fatal("id remap")
	}
	if queryString(t, db, "SELECT notes FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.course_id='alpha' AND l.ordinal=1") != "my note" {
		t.Fatal("note lost")
	}
	if queryString(t, db, "SELECT completed_at FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.course_id='alpha' AND l.ordinal=1") != "2026-02-02T00:00:00.000Z" {
		t.Fatal("timestamp not preserved")
	}
	if queryInt(t, db, "SELECT count(*) FROM lesson_prerequisites lp JOIN lessons l ON l.id=lp.lesson_id WHERE l.course_id='beta' AND l.ordinal=2") != 1 {
		t.Fatal("prerequisite remap")
	}
	if queryString(t, db, "SELECT updated_at FROM lessons WHERE course_id='beta' AND ordinal=1") != "2026-01-01T00:00:00.000Z" {
		t.Fatal("lesson updated_at not preserved")
	}
	// The verbs see the copied history through the course scope.
	row, err := progress.Get(db, "alpha", 1)
	if err != nil || row.Status != "done" || row.Notes != "my note" {
		t.Fatalf("Get after consolidate: %+v %v", row, err)
	}
	if _, err := progress.Get(db, "beta", 3); err == nil {
		t.Fatal("beta has no lesson 3")
	}
	status, err := progress.GetStatus(db, "alpha")
	if err != nil || status != (progress.Status{Total: 3, Done: 1, Todo: 1, Skipped: 1}) {
		t.Fatalf("status = %+v %v", status, err)
	}
	if err := progress.EnsureReady(db, "gamma"); err != progress.ErrNotInitialized {
		t.Fatalf("EnsureReady for an unseeded course = %v", err)
	}
	// The legacy files moved, WAL included, and a legacy file is refused by the verbs.
	if _, err := os.Stat(filepath.Join(dir, "backup", "alpha", "progress.sqlite-wal")); err != nil {
		t.Fatal(err)
	}
	legacy, err := progress.OpenReadOnly(filepath.Join(dir, "backup", "alpha", "progress.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer legacy.Close()
	if err := progress.EnsureReady(legacy, "alpha"); err != progress.ErrLegacyLayout {
		t.Fatalf("EnsureReady on a legacy file = %v", err)
	}
	if err := progress.EnsureSchema(legacy); err != progress.ErrLegacyLayout {
		t.Fatalf("EnsureSchema on a legacy file = %v", err)
	}

	// Re-running from the backups is refused; --replace copies over the rows and nothing doubles.
	again := opts
	again.FromDir, again.BackupDir = filepath.Join(dir, "backup"), filepath.Join(dir, "backup2")
	if _, err := progress.Consolidate(again); err == nil || !strings.Contains(err.Error(), "already has 4 lesson rows") {
		t.Fatalf("second run: %v", err)
	}
	again.Replace = true
	if _, err := progress.Consolidate(again); err != nil {
		t.Fatal(err)
	}
	if queryInt(t, db, "SELECT count(*) FROM lessons") != 7 || queryInt(t, db, "SELECT count(*) FROM attempts") != 4 {
		t.Fatal("replace doubled rows")
	}
}

func TestConsolidateRefusesAnOpenLegacyDatabase(t *testing.T) {
	dir := t.TempDir()
	path := writeLegacy(t, filepath.Join(dir, "courses"), "alpha", 2)
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	// A child process holding the file stands in for a running tutor/deno writer.
	child := exec.Command("sleep", "30")
	child.ExtraFiles = []*os.File{f}
	if err := child.Start(); err != nil {
		t.Skip("cannot start a child process:", err)
	}
	defer child.Process.Kill()
	opts := progress.ConsolidateOptions{Target: filepath.Join(dir, "tutor.sqlite"), FromDir: filepath.Join(dir, "courses"), BackupDir: filepath.Join(dir, "backup"), Courses: []string{"alpha"}}
	_, err = progress.Consolidate(opts)
	if err == nil || !strings.Contains(err.Error(), "close the learner's progress writer") {
		t.Fatalf("open database: %v", err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal("refusal moved the file")
	}
	if _, err := os.Stat(opts.Target); !os.IsNotExist(err) {
		t.Fatal("refusal created the target")
	}
}

func TestTwoCoursesInOneDatabaseDoNotSeeEachOther(t *testing.T) {
	db, _ := openTemp(t)
	if _, err := progress.Init(db, "a", lessons(3)); err != nil {
		t.Fatal(err)
	}
	if _, err := progress.Init(db, "b", lessons(4)); err != nil {
		t.Fatal(err)
	}
	if queryInt(t, db, "SELECT count(*) FROM lessons") != 7 || queryInt(t, db, "SELECT max(id) FROM lessons") != 7 {
		t.Fatal("global ids")
	}
	if err := progress.Done(db, "a", 1, "a1"); err != nil {
		t.Fatal(err)
	}
	if err := progress.Done(db, "b", 4, "b4"); err != nil {
		t.Fatal(err)
	}
	next, _, _, err := progress.Next(db, "b", "")
	if err != nil || next.Ordinal != 1 || next.CourseID != "b" {
		t.Fatalf("next b = %+v %v", next, err)
	}
	sa, _ := progress.GetStatus(db, "a")
	sb, _ := progress.GetStatus(db, "b")
	if sa != (progress.Status{Total: 3, Done: 1, Todo: 2}) || sb != (progress.Status{Total: 4, Done: 1, Todo: 3}) {
		t.Fatalf("status a=%+v b=%+v", sa, sb)
	}
	ta, _ := progress.Topics(db, "a")
	if len(ta) == 0 || ta[0].Total != 3 {
		t.Fatalf("topics a = %+v", ta)
	}
	ma, _ := progress.Modules(db, "a")
	if len(ma) != 2 || ma[0].Total+ma[1].Total != 3 {
		t.Fatalf("modules a = %+v", ma)
	}
	found, _ := progress.Search(db, "b", []string{"lesson"})
	if len(found) != 4 {
		t.Fatalf("search b = %d rows", len(found))
	}
	// Re-seeding a with a shorter catalog parks only a's rows; b is untouched.
	if _, err := progress.Seed(db, "a", lessons(2)); err != nil {
		t.Fatal(err)
	}
	if queryInt(t, db, "SELECT count(*) FROM lessons WHERE course_id='a' AND active=0") != 1 || queryInt(t, db, "SELECT count(*) FROM lessons WHERE course_id='b' AND active=1") != 4 {
		t.Fatal("seed scope")
	}
	if queryInt(t, db, "SELECT ordinal FROM lessons WHERE course_id='a' AND active=0") != 3 {
		t.Fatal("retired row parked at len+1")
	}
	// A new lesson in a gets the next global id, not a reused one.
	if _, err := progress.Seed(db, "a", lessons(2)); err != nil {
		t.Fatal(err)
	}
	catalog := lessons(3)
	catalog[2].Slug = "brand-new"
	if _, err := progress.Seed(db, "a", catalog); err != nil {
		t.Fatal(err)
	}
	if queryInt(t, db, "SELECT id FROM lessons WHERE slug='brand-new'") != 8 {
		t.Fatal("new id")
	}
	if r, _ := progress.Get(db, "b", 4); r.Notes != "b4" || r.Status != "done" {
		t.Fatal("b's history changed")
	}
}
