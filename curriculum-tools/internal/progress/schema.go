// Package progress owns the learner database: schema, identity-preserving seeding and the
// read/write operations behind the course verbs. One file, curriculum-tools/tutor.sqlite, holds
// every course's lesson rows, progress and attempts (plus the roadmap tables, owned by
// internal/roadmap); every query is scoped by course id. The SQL is otherwise a verbatim port of
// the Deno engine, so consolidated learner history keeps behaving identically.
package progress

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite" // database/sql driver "sqlite"
)

// Schema is the DDL of plan.md §3.4 as revised by Phase 9: lessons carry course_id, uniqueness of
// ordinal and slug is per course, ids stay global. CREATE ... IF NOT EXISTS keeps it idempotent.
const Schema = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY,
  course_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  slug TEXT NOT NULL,
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
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (course_id, ordinal),
  UNIQUE (course_id, slug)
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

CREATE INDEX IF NOT EXISTS lessons_course_ordinal_idx ON lessons(course_id, active, ordinal);
CREATE INDEX IF NOT EXISTS lessons_category_ordinal_idx ON lessons(course_id, category, ordinal);
CREATE INDEX IF NOT EXISTS progress_status_idx ON progress(status);
CREATE INDEX IF NOT EXISTS attempts_lesson_time_idx ON attempts(lesson_id, attempted_at DESC);
`

// Migrations are the schema_migrations rows a Go-created database records: the Deno engine's
// history plus version 7, the one-database layout.
var Migrations = []struct {
	Version int
	Name    string
}{{1, "initial"}, {2, "lesson tags"}, {6, "remove legacy reading metadata"}, {7, "consolidate courses"}}

// ErrNotInitialized is returned by EnsureReady when the database has no lesson rows for the
// course (or no lessons table at all).
var ErrNotInitialized = errors.New("progress database is not initialized; run 'tutor <course> init'")

// ErrMissing is returned by OpenReadOnly when the database file does not exist.
var ErrMissing = errors.New("progress database does not exist")

// ErrLegacyLayout is returned when a database still has the per-course layout (a lessons table
// without course_id). Such a file is read only by Consolidate.
var ErrLegacyLayout = errors.New("this is a per-course progress database; run 'tutor progress consolidate' to move it into tutor.sqlite")

// DefaultPath is the one learner database of a curriculum-tools tree: <root>/tutor.sqlite.
func DefaultPath(root string) string { return filepath.Join(root, "tutor.sqlite") }

func dsn(path string, params []string) string {
	// A path may contain '?' or '#'; encode it as a file URI so the driver parses it correctly.
	u := url.URL{Scheme: "file", Path: path}
	return u.String() + "?" + strings.Join(params, "&")
}

// Open opens (creating if needed) a read-write progress database with the Deno engine's pragmas:
// foreign_keys=ON, busy_timeout=5000, journal_mode=WAL, synchronous=NORMAL. Transactions started
// with db.Begin use BEGIN IMMEDIATE. One connection is used so pragmas and transactions are stable.
func Open(path string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", dsn(path, []string{
		"_txlock=immediate",
		"_pragma=foreign_keys(1)",
		"_pragma=busy_timeout(5000)",
		"_pragma=journal_mode(WAL)",
		"_pragma=synchronous(NORMAL)",
	}))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// OpenReadOnly opens an existing database with mode=ro. It never creates the file; a missing file
// yields ErrMissing. Read verbs use it so displaying a lesson cannot modify learner state.
func OpenReadOnly(path string) (*sql.DB, error) {
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, ErrMissing
		}
		return nil, err
	}
	db, err := sql.Open("sqlite", dsn(path, []string{
		"mode=ro",
		"_pragma=busy_timeout(5000)",
	}))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// queryer is the read subset shared by *sql.DB and *sql.Tx.
type queryer interface {
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
}

// tableExists reports whether a table is present.
func tableExists(q queryer, table string) (bool, error) {
	var n int
	if err := q.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

// columns lists the column names of a table (empty when the table is absent).
func columns(q queryer, table string) ([]string, error) {
	rows, err := q.Query("PRAGMA table_info(" + table + ")")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var cid int
		var name, typ string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
			return nil, err
		}
		out = append(out, name)
	}
	return out, rows.Err()
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// Layout classifies a database's lessons table: LayoutNone (no table), LayoutLegacy (per-course,
// no course_id) or LayoutCourses (the one-database layout).
type Layout int

const (
	LayoutNone Layout = iota
	LayoutLegacy
	LayoutCourses
)

// DetectLayout reports which lessons layout a database has.
func DetectLayout(q queryer) (Layout, error) {
	cols, err := columns(q, "lessons")
	if err != nil {
		return LayoutNone, err
	}
	switch {
	case len(cols) == 0:
		return LayoutNone, nil
	case contains(cols, "course_id"):
		return LayoutCourses, nil
	default:
		return LayoutLegacy, nil
	}
}

// EnsureReady fails with ErrNotInitialized when the database holds no lesson rows for courseID,
// and with ErrLegacyLayout when the file still has the per-course layout.
func EnsureReady(db *sql.DB, courseID string) error {
	layout, err := DetectLayout(db)
	if err != nil {
		return err
	}
	switch layout {
	case LayoutNone:
		return ErrNotInitialized
	case LayoutLegacy:
		return ErrLegacyLayout
	}
	var n int
	if err := db.QueryRow("SELECT count(*) FROM lessons WHERE course_id=?", courseID).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return ErrNotInitialized
	}
	return nil
}

var legacyColumns = []string{"reading", "reading_notes", "study_checkpoint"}

// EnsureSchema creates missing tables and indexes and records the schema versions. It refuses a
// per-course database (ErrLegacyLayout) and one that still carries the legacy reading columns,
// which only the archived Deno `migrate` command knows how to export and drop.
func EnsureSchema(db *sql.DB) error {
	cols, err := columns(db, "lessons")
	if err != nil {
		return err
	}
	var found []string
	for _, legacy := range legacyColumns {
		if contains(cols, legacy) {
			found = append(found, legacy)
		}
	}
	if len(found) > 0 {
		return fmt.Errorf("lessons table still has legacy column(s) %s; run the archived Deno 'tutor <course> migrate' (see archive/deno-engine) before using the Go tutor", strings.Join(found, ", "))
	}
	if len(cols) > 0 && !contains(cols, "course_id") {
		return ErrLegacyLayout
	}
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(Schema); err != nil {
		return err
	}
	for _, m := range Migrations {
		if _, err := tx.Exec("INSERT OR IGNORE INTO schema_migrations(version,name) VALUES(?,?)", m.Version, m.Name); err != nil {
			return err
		}
	}
	return tx.Commit()
}
