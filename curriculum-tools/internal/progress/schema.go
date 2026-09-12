// Package progress owns the per-course learner database: schema, identity-preserving seeding and
// the read/write operations behind the course verbs. The schema and SQL are ported verbatim from
// the Deno engine so existing databases keep working unchanged.
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

// Schema is the DDL copied from src/main.ts. CREATE ... IF NOT EXISTS keeps it idempotent.
const Schema = `
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

CREATE INDEX IF NOT EXISTS lessons_category_ordinal_idx ON lessons(category, ordinal);
CREATE INDEX IF NOT EXISTS progress_status_idx ON progress(status);
CREATE INDEX IF NOT EXISTS attempts_lesson_time_idx ON attempts(lesson_id, attempted_at DESC);
`

// ErrNotInitialized is returned by EnsureReady when the lessons table is missing.
var ErrNotInitialized = errors.New("progress database is not initialized; run 'tutor <course> init'")

// ErrMissing is returned by OpenReadOnly when the database file does not exist.
var ErrMissing = errors.New("progress database does not exist")

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

// EnsureReady fails with ErrNotInitialized when the lessons table is absent.
func EnsureReady(db *sql.DB) error {
	var n int
	if err := db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='lessons'").Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return ErrNotInitialized
	}
	return nil
}

var legacyColumns = []string{"reading", "reading_notes", "study_checkpoint"}

// EnsureSchema creates missing tables and indexes and records the schema versions the Deno engine
// recorded. It refuses databases that still carry the legacy reading columns, which only the
// archived Deno `migrate` command knows how to export and drop.
func EnsureSchema(db *sql.DB) error {
	rows, err := db.Query("PRAGMA table_info(lessons)")
	if err != nil {
		return err
	}
	var found []string
	for rows.Next() {
		var cid int
		var name, typ string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
			rows.Close()
			return err
		}
		for _, legacy := range legacyColumns {
			if name == legacy {
				found = append(found, name)
			}
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(found) > 0 {
		return fmt.Errorf("lessons table still has legacy column(s) %s; run the archived Deno 'tutor <course> migrate' (see archive/deno-engine) before using the Go tutor", strings.Join(found, ", "))
	}
	tx, err := db.BeginTx(context.Background(), nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(Schema); err != nil {
		return err
	}
	for _, m := range []struct {
		version int
		name    string
	}{{1, "initial"}, {2, "lesson tags"}, {6, "remove legacy reading metadata"}} {
		if _, err := tx.Exec("INSERT OR IGNORE INTO schema_migrations(version,name) VALUES(?,?)", m.version, m.name); err != nil {
			return err
		}
	}
	return tx.Commit()
}
