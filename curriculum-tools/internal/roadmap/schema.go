package roadmap

import (
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite" // database/sql driver "sqlite"
)

// Schema is the roadmap DDL of plan.md §3.5. CREATE ... IF NOT EXISTS keeps it idempotent, so
// EnsureSchema can run before every write.
const Schema = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE IF NOT EXISTS roadmap_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS roadmap_topics (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('main','workshop','branch')),
  position INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','active','done','deferred')),
  tool TEXT NOT NULL,
  goals TEXT NOT NULL,
  diagram TEXT NOT NULL DEFAULT '',
  course_id TEXT NOT NULL DEFAULT '',
  plan_path TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (track, position)
) STRICT;

CREATE TABLE IF NOT EXISTS roadmap_followups (
  id INTEGER PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES roadmap_topics(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  chosen INTEGER NOT NULL DEFAULT 0 CHECK (chosen IN (0,1)),
  UNIQUE (topic_id, position)
) STRICT;
`

// Meta keys stored in roadmap_meta.
const (
	metaPreamble   = "preamble"
	metaExportedAt = "exported_at"
	metaChangedAt  = "changed_at"
)

// timeLayout is the timestamp format the SQLite defaults use
// (strftime('%Y-%m-%dT%H:%M:%fZ','now')), so Go-written and SQL-written stamps sort together.
const timeLayout = "2006-01-02T15:04:05.000Z"

// ErrNoRoadmap is returned by every read path when the roadmap database does not exist yet. Its
// text is the message the CLI prints (plan.md §3.5).
var ErrNoRoadmap = errors.New("No roadmap yet: run tutor roadmap import")

// ErrNotEmpty is returned by Import when the database already holds topics and --replace was not
// given.
var ErrNotEmpty = errors.New("roadmap database already has topics: pass --replace to overwrite it")

// DatabasePath is the roadmap database of a curriculum-tools tree (root/tutor.sqlite); it holds
// the editable roadmap, not learner progress.
func DatabasePath(root string) string { return filepath.Join(root, "tutor.sqlite") }

// SnapshotPath is the committed roadmap snapshot of a curriculum-tools tree, the default file for
// `tutor roadmap import` and `tutor roadmap export`.
func SnapshotPath(root string) string { return filepath.Join(root, "roadmap", "roadmap.json") }

// Store is the roadmap database at Path (by default <root>/tutor.sqlite). Every operation opens
// its own connection: read verbs open mode=ro and never create a file, write verbs create the
// database and schema on demand.
type Store struct{ Path string }

func dsn(path string, params []string) string {
	// A path may contain '?' or '#'; encode it as a file URI so the driver parses it correctly.
	u := url.URL{Scheme: "file", Path: path}
	return u.String() + "?" + strings.Join(params, "&")
}

// openWrite opens (creating if needed) the roadmap database with the same pragmas the progress
// databases use, and applies the schema.
func (s Store) openWrite() (*sql.DB, error) {
	if s.Path == "" {
		return nil, errors.New("roadmap database path is empty")
	}
	if err := os.MkdirAll(filepath.Dir(s.Path), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", dsn(s.Path, []string{
		"_txlock=immediate",
		"_pragma=foreign_keys(1)",
		"_pragma=busy_timeout(5000)",
		"_pragma=journal_mode(WAL)",
	}))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	if err := ensureSchema(db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// openRead opens the roadmap database read-only. A missing file, or a file without the roadmap
// tables, yields ErrNoRoadmap; no file is ever created.
func (s Store) openRead() (*sql.DB, error) {
	if s.Path == "" {
		return nil, errors.New("roadmap database path is empty")
	}
	if _, err := os.Stat(s.Path); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, ErrNoRoadmap
		}
		return nil, err
	}
	db, err := sql.Open("sqlite", dsn(s.Path, []string{
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
	var n int
	if err := db.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='roadmap_topics'").Scan(&n); err != nil {
		db.Close()
		return nil, err
	}
	if n == 0 {
		db.Close()
		return nil, ErrNoRoadmap
	}
	return db, nil
}

// ensureSchema creates the roadmap tables and records the migration row.
func ensureSchema(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(Schema); err != nil {
		return err
	}
	if _, err := tx.Exec("INSERT OR IGNORE INTO schema_migrations(version,name) VALUES(?,?)", 1, "roadmap"); err != nil {
		return err
	}
	return tx.Commit()
}

// withTx runs fn inside one immediate transaction on a freshly opened read-write database.
func (s Store) withTx(fn func(*sql.Tx) error) error {
	db, err := s.openWrite()
	if err != nil {
		return err
	}
	defer db.Close()
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

// setMeta upserts one roadmap_meta row.
func setMeta(tx *sql.Tx, key, value string) error {
	_, err := tx.Exec("INSERT INTO roadmap_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value)
	return err
}

// getMeta reads one roadmap_meta row; a missing key yields "".
func getMeta(q queryer, key string) (string, error) {
	var value string
	err := q.QueryRow("SELECT value FROM roadmap_meta WHERE key=?", key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return value, nil
}

// queryer is the read subset shared by *sql.DB and *sql.Tx.
type queryer interface {
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
}

// markChanged records that the database now differs from the last exported snapshot.
func markChanged(tx *sql.Tx) error {
	return setMeta(tx, metaChangedAt, now())
}

func now() string { return time.Now().UTC().Format(timeLayout) }

// topicID resolves a slug to its row id.
func topicID(q queryer, slug string) (int64, error) {
	var id int64
	err := q.QueryRow("SELECT id FROM roadmap_topics WHERE slug=?", slug).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, fmt.Errorf("unknown topic %q", slug)
	}
	return id, err
}
