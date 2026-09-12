package progress

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// ConsolidateOptions drives Consolidate. Target is the one database (default DefaultPath(root)),
// FromDir the directory holding <course>/progress.sqlite for each legacy course (default
// <root>/courses), BackupDir where the legacy trio is moved after a verified copy (default
// <root>/.cache/legacy-progress). Courses lists the ids to consider, in order.
type ConsolidateOptions struct {
	Target    string
	FromDir   string
	BackupDir string
	Replace   bool
	Courses   []string
}

// ConsolidateReport is the per-course outcome. Skipped is non-empty (and the counts zero) when the
// course had no legacy database to move.
type ConsolidateReport struct {
	Course   string `json:"course"`
	Lessons  int    `json:"lessons"`
	Progress int    `json:"progress"`
	Attempts int    `json:"attempts"`
	Backup   string `json:"backup,omitempty"`
	Skipped  string `json:"skipped,omitempty"`
}

// AlreadyConsolidatedError is returned when the target already holds rows for a course and
// Replace was not requested.
type AlreadyConsolidatedError struct {
	Course string
	Rows   int
}

func (e AlreadyConsolidatedError) Error() string {
	return fmt.Sprintf("%s already has %d lesson rows in the consolidated database; pass --replace to copy the legacy database over them", e.Course, e.Rows)
}

// LegacySchema is the per-course layout Consolidate reads (the Deno engine's SCHEMA constant):
// one course per file, so ordinal and slug are unique on their own. Tests build fixtures from it;
// nothing else creates this layout any more.
const LegacySchema = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY,
  ordinal INTEGER NOT NULL UNIQUE CHECK (ordinal > 0),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner','intermediate','advanced')),
  tags TEXT NOT NULL DEFAULT ',',
  overview TEXT NOT NULL,
  syntax_breakdown TEXT NOT NULL,
  setup TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL,
  expected_result TEXT NOT NULL,
  systems_lens TEXT NOT NULL,
  challenge TEXT NOT NULL DEFAULT '',
  caution TEXT NOT NULL DEFAULT '',
  safety_level TEXT NOT NULL CHECK (safety_level IN ('read-only','writes-data','ddl','locking','privileged','dangerous')),
  run_in TEXT NOT NULL CHECK (run_in IN ('tool','shell','mixed')),
  sessions INTEGER NOT NULL DEFAULT 1 CHECK (sessions BETWEEN 1 AND 4),
  min_version TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
CREATE TABLE IF NOT EXISTS lesson_prerequisites (
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  prerequisite_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  PRIMARY KEY (lesson_id, prerequisite_id),
  CHECK (lesson_id <> prerequisite_id)
) WITHOUT ROWID, STRICT;
CREATE TABLE IF NOT EXISTS progress (
  lesson_id INTEGER PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('todo','done','skipped')),
  completed_revision INTEGER,
  completed_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((status = 'done' AND completed_at IS NOT NULL AND completed_revision IS NOT NULL)
    OR status IN ('todo','skipped'))
) STRICT;
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('manual','success','error','cancelled')),
  lesson_revision INTEGER NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  notes TEXT NOT NULL DEFAULT ''
) STRICT;
`

// legacyColumnsList are the lessons columns of the per-course layout, in schema order.
const legacyColumnsList = `id,ordinal,slug,title,category,difficulty,tags,overview,syntax_breakdown,setup,code,expected_result,systems_lens,challenge,caution,safety_level,run_in,sessions,min_version,estimated_minutes,revision,active,updated_at`

// Consolidate copies every listed course's legacy per-course database into the one target
// database, verifies the copy inside the same transaction, and then moves the legacy files
// (progress.sqlite, -wal, -shm) to BackupDir/<course>/. Learner history is copied, never
// re-derived: lesson rows (active and retired) keep every column except the id, which is remapped
// onto the target's global id space; prerequisites, progress and attempts follow the remap with
// their original timestamps. A course whose legacy file is absent is reported as skipped.
//
// It is safe to re-run: a course already present in the target is refused unless Replace, and a
// course whose legacy file is held open by another process is refused before anything is copied.
func Consolidate(opts ConsolidateOptions) ([]ConsolidateReport, error) {
	if opts.Target == "" || opts.FromDir == "" || opts.BackupDir == "" {
		return nil, errors.New("consolidate: target, source directory and backup directory are required")
	}
	reports := make([]ConsolidateReport, 0, len(opts.Courses))
	for _, id := range opts.Courses {
		src := filepath.Join(opts.FromDir, id, "progress.sqlite")
		if _, err := os.Stat(src); err != nil {
			if os.IsNotExist(err) {
				reports = append(reports, ConsolidateReport{Course: id, Skipped: "no legacy database at " + src})
				continue
			}
			return reports, err
		}
		backup := filepath.Join(opts.BackupDir, id)
		if entries, err := os.ReadDir(backup); err == nil && len(entries) > 0 {
			return reports, fmt.Errorf("%s: backup directory %s is not empty; move it aside first", id, backup)
		}
		if pids := holders(src); len(pids) > 0 {
			return reports, fmt.Errorf("%s: close the learner's progress writer before consolidating (pid %s holds %s)", id, strings.Join(pids, ", "), src)
		}
		report, err := consolidateOne(opts.Target, id, src, opts.Replace)
		if err != nil {
			return reports, fmt.Errorf("%s: %w", id, err)
		}
		if err := moveTrio(src, backup); err != nil {
			return reports, fmt.Errorf("%s: copied into %s but could not move the legacy files: %w", id, opts.Target, err)
		}
		report.Backup = backup
		reports = append(reports, report)
	}
	return reports, nil
}

// holders lists the pids (other than this process) with the database, its -wal or its -shm open.
func holders(path string) []string {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil
	}
	watched := map[string]bool{abs: true, abs + "-wal": true, abs + "-shm": true}
	self := strconv.Itoa(os.Getpid())
	procs, err := os.ReadDir("/proc")
	if err != nil {
		return nil
	}
	var pids []string
	for _, p := range procs {
		name := p.Name()
		if name == self || name[0] < '0' || name[0] > '9' {
			continue
		}
		fds, err := os.ReadDir(filepath.Join("/proc", name, "fd"))
		if err != nil {
			continue
		}
		for _, fd := range fds {
			target, err := os.Readlink(filepath.Join("/proc", name, "fd", fd.Name()))
			if err == nil && watched[target] {
				pids = append(pids, name)
				break
			}
		}
	}
	return pids
}

// moveTrio renames progress.sqlite and its -wal/-shm companions into dir.
func moveTrio(src, dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	for _, suffix := range []string{"", "-wal", "-shm"} {
		from := src + suffix
		if _, err := os.Stat(from); err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return err
		}
		if err := os.Rename(from, filepath.Join(dir, filepath.Base(from))); err != nil {
			return err
		}
	}
	return nil
}

type progressKey struct {
	status            string
	completedRevision sql.NullInt64
	completedAt       sql.NullString
	notes             string
}

// consolidateOne copies one legacy database into the target inside a single immediate transaction
// and verifies the result before committing.
func consolidateOne(target, courseID, src string, replace bool) (ConsolidateReport, error) {
	report := ConsolidateReport{Course: courseID}
	source, err := OpenReadOnly(src)
	if err != nil {
		return report, err
	}
	defer source.Close()
	layout, err := DetectLayout(source)
	if err != nil {
		return report, err
	}
	if layout != LayoutLegacy {
		return report, fmt.Errorf("%s does not have the per-course layout", src)
	}
	for _, table := range []string{"progress", "attempts", "lesson_prerequisites"} {
		ok, err := tableExists(source, table)
		if err != nil {
			return report, err
		}
		if !ok {
			return report, fmt.Errorf("%s has no %s table", src, table)
		}
	}

	db, err := Open(target)
	if err != nil {
		return report, err
	}
	defer db.Close()
	if err := EnsureSchema(db); err != nil {
		return report, err
	}
	tx, err := db.BeginTx(context.Background(), nil) // BEGIN IMMEDIATE
	if err != nil {
		return report, err
	}
	defer tx.Rollback()

	var existing int
	if err := tx.QueryRow("SELECT count(*) FROM lessons WHERE course_id=?", courseID).Scan(&existing); err != nil {
		return report, err
	}
	if existing > 0 {
		if !replace {
			return report, AlreadyConsolidatedError{Course: courseID, Rows: existing}
		}
		if _, err := tx.Exec("DELETE FROM lessons WHERE course_id=?", courseID); err != nil {
			return report, err
		}
	}
	var nextID int64
	if err := tx.QueryRow("SELECT coalesce(max(id),0) FROM lessons").Scan(&nextID); err != nil {
		return report, err
	}

	// Lessons: every row, active and retired, with a fresh global id.
	idMap := map[int64]int64{}
	rows, err := source.Query("SELECT " + legacyColumnsList + " FROM lessons ORDER BY id")
	if err != nil {
		return report, err
	}
	type lessonRow struct {
		id   int64
		cols []any
	}
	var lessonRows []lessonRow
	for rows.Next() {
		var id int64
		cols := make([]any, 22)
		ptrs := make([]any, 23)
		ptrs[0] = &id
		for i := range cols {
			ptrs[i+1] = &cols[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			rows.Close()
			return report, err
		}
		lessonRows = append(lessonRows, lessonRow{id: id, cols: cols})
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return report, err
	}
	insertLesson := "INSERT INTO lessons(id,course_id," + strings.TrimPrefix(legacyColumnsList, "id,") + ") VALUES(?,?" + strings.Repeat(",?", 22) + ")"
	for _, lr := range lessonRows {
		nextID++
		idMap[lr.id] = nextID
		args := append([]any{nextID, courseID}, lr.cols...)
		if _, err := tx.Exec(insertLesson, args...); err != nil {
			return report, fmt.Errorf("lesson %d: %w", lr.id, err)
		}
	}
	report.Lessons = len(lessonRows)

	// Prerequisites.
	if err := copyRows(source, tx, "SELECT lesson_id,prerequisite_id FROM lesson_prerequisites ORDER BY lesson_id,prerequisite_id",
		"INSERT INTO lesson_prerequisites(lesson_id,prerequisite_id) VALUES(?,?)", []int{0, 1}, idMap); err != nil {
		return report, fmt.Errorf("prerequisites: %w", err)
	}
	// Progress.
	n, err := copyRowsCount(source, tx, "SELECT lesson_id,status,completed_revision,completed_at,notes,updated_at FROM progress ORDER BY lesson_id",
		"INSERT INTO progress(lesson_id,status,completed_revision,completed_at,notes,updated_at) VALUES(?,?,?,?,?,?)", []int{0}, idMap)
	if err != nil {
		return report, fmt.Errorf("progress: %w", err)
	}
	report.Progress = n
	// Attempts, in original order, with fresh ids.
	n, err = copyRowsCount(source, tx, "SELECT lesson_id,outcome,lesson_revision,attempted_at,notes FROM attempts ORDER BY id",
		"INSERT INTO attempts(lesson_id,outcome,lesson_revision,attempted_at,notes) VALUES(?,?,?,?,?)", []int{0}, idMap)
	if err != nil {
		return report, fmt.Errorf("attempts: %w", err)
	}
	report.Attempts = n

	// Verify: counts and per-slug progress equality between source and target.
	for _, check := range []struct {
		name       string
		src, dst   string
		want, args []any
	}{
		{"lessons", "SELECT count(*) FROM lessons", "SELECT count(*) FROM lessons WHERE course_id=?", nil, []any{courseID}},
		{"progress", "SELECT count(*) FROM progress", "SELECT count(*) FROM progress WHERE lesson_id IN (SELECT id FROM lessons WHERE course_id=?)", nil, []any{courseID}},
		{"attempts", "SELECT count(*) FROM attempts", "SELECT count(*) FROM attempts WHERE lesson_id IN (SELECT id FROM lessons WHERE course_id=?)", nil, []any{courseID}},
		{"lesson_prerequisites", "SELECT count(*) FROM lesson_prerequisites", "SELECT count(*) FROM lesson_prerequisites WHERE lesson_id IN (SELECT id FROM lessons WHERE course_id=?)", nil, []any{courseID}},
	} {
		var a, b int
		if err := source.QueryRow(check.src).Scan(&a); err != nil {
			return report, err
		}
		if err := tx.QueryRow(check.dst, check.args...).Scan(&b); err != nil {
			return report, err
		}
		if a != b {
			return report, fmt.Errorf("verification failed: %s has %d rows in the source and %d in the target", check.name, a, b)
		}
	}
	srcProgress, err := progressBySlug(source, "SELECT l.slug,p.status,p.completed_revision,p.completed_at,p.notes FROM progress p JOIN lessons l ON l.id=p.lesson_id")
	if err != nil {
		return report, err
	}
	dstProgress, err := progressBySlug(tx, "SELECT l.slug,p.status,p.completed_revision,p.completed_at,p.notes FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.course_id=?", courseID)
	if err != nil {
		return report, err
	}
	if len(srcProgress) != len(dstProgress) {
		return report, fmt.Errorf("verification failed: %d progress slugs in the source, %d in the target", len(srcProgress), len(dstProgress))
	}
	for slug, want := range srcProgress {
		got, ok := dstProgress[slug]
		if !ok || got != want {
			return report, fmt.Errorf("verification failed: progress for %s differs after the copy", slug)
		}
	}
	if err := tx.Commit(); err != nil {
		return report, err
	}
	return report, nil
}

// copyRows streams the rows of query from src into tx with insert, remapping the columns listed
// in idCols through idMap.
func copyRows(src queryer, tx *sql.Tx, query, insert string, idCols []int, idMap map[int64]int64) error {
	_, err := copyRowsCount(src, tx, query, insert, idCols, idMap)
	return err
}

func copyRowsCount(src queryer, tx *sql.Tx, query, insert string, idCols []int, idMap map[int64]int64) (int, error) {
	rows, err := src.Query(query)
	if err != nil {
		return 0, err
	}
	cols, err := rows.Columns()
	if err != nil {
		rows.Close()
		return 0, err
	}
	var batch [][]any
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			rows.Close()
			return 0, err
		}
		for _, c := range idCols {
			old, ok := vals[c].(int64)
			if !ok {
				rows.Close()
				return 0, fmt.Errorf("column %s is not an integer id", cols[c])
			}
			mapped, ok := idMap[old]
			if !ok {
				rows.Close()
				return 0, fmt.Errorf("row references unknown lesson id %d", old)
			}
			vals[c] = mapped
		}
		batch = append(batch, vals)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	for _, vals := range batch {
		if _, err := tx.Exec(insert, vals...); err != nil {
			return 0, err
		}
	}
	return len(batch), nil
}

func progressBySlug(q queryer, query string, args ...any) (map[string]progressKey, error) {
	rows, err := q.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]progressKey{}
	for rows.Next() {
		var slug string
		var k progressKey
		if err := rows.Scan(&slug, &k.status, &k.completedRevision, &k.completedAt, &k.notes); err != nil {
			return nil, err
		}
		out[slug] = k
	}
	return out, rows.Err()
}
