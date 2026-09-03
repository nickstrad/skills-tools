import { code, type Module } from "../../../src/types.ts";

export const LAB_FILE: Module = {
  category: "lab-file",
  title: "Lab and SQLite as a file",
  lessons: [
    {
      slug: "build-sqlite-lab",
      title: "Build a disposable SQLite lab",
      difficulty: "beginner",
      tags: ["sqlite-cli", "file-format", "idempotency"],
      safetyLevel: "ddl",
      runIn: "shell",
      estimatedMinutes: 10,
      overview:
        code`Create a learner-owned directory and a small baseline database. The same setup can be run again to reset the experiment, so later lessons have a known file and schema to inspect.`,
      syntaxBreakdown:
        code`sqlite3 FILE opens or creates a database at FILE; .databases lists attached database paths; .tables lists visible tables; .shell runs a host command; stat reports file bytes.`,
      code: code`
export SQLITE_LAB="$PWD/sqlite-lab"
export TUTOR_SQLITE_DB="$SQLITE_LAB/lab.db"
mkdir -p "$SQLITE_LAB"
sqlite3 "$SQLITE_LAB/lab.db" <<'SQL'
.headers on
.mode box
DROP TABLE IF EXISTS events;
CREATE TABLE events(event_id INTEGER PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '');
INSERT INTO events(kind, payload) VALUES ('baseline', 'owned lab');
.databases
.tables
SELECT count(*) AS baseline_rows FROM events;
SQL
stat -c 'lab.db bytes=%s path=%n' "$SQLITE_LAB/lab.db"
      `,
      expectedResult:
        code`sqlite3 reports one main database whose path ends in sqlite-lab/lab.db, .tables prints events, and the final query prints baseline_rows = 1. A second run again reports one row because setup drops and recreates the table; the file is inside the directory you own.`,
      systemsLens:
        code`Safe systems experiments start with ownership, isolation, and a reproducible initial state. SQLite's database is a local file object, so the lab boundary is also the boundary of what the experiment may modify.`,
      challenge:
        code`Copy the directory to sqlite-lab-copy, open the copy, and predict which path .databases reports.`,
    },
    {
      slug: "inspect-build-capabilities",
      title: "Inspect the SQLite build capabilities",
      difficulty: "beginner",
      tags: ["sqlite-cli", "file-format", "observability"],
      prerequisites: ["build-sqlite-lab"],
      safetyLevel: "read-only",
      runIn: "tool",
      estimatedMinutes: 8,
      overview:
        code`Open the lab and inspect the runtime rather than inferring capabilities from a package name. Record the SQLite version, compile-time options, and help for optional inspection commands.`,
      syntaxBreakdown:
        code`sqlite_version() is the engine version; PRAGMA compile_options exposes build flags; .help filters CLI help. The dbstat virtual table is useful only when the build includes ENABLE_DBSTAT_VTAB.`,
      setup: code`.print -- The wrapper has already opened $TUTOR_SQLITE_DB`,
      code: code`.headers on
.mode box
SELECT sqlite_version() AS sqlite_version;
SELECT compile_options FROM pragma_compile_options WHERE compile_options LIKE '%DBSTAT%' OR compile_options LIKE '%THREADSAFE%' ORDER BY compile_options;
.print -- CLI commands relevant to this course
.help backup
.help recover`,
      expectedResult:
        code`The version query prints 3.45.1 (or another version at least 3.45). The compile-option query records whether ENABLE_DBSTAT_VTAB appears; this installation should report it. Help includes .backup and .recover entries. Missing optional features are evidence to record, not reasons to assume they exist.`,
      systemsLens:
        code`Deployed capability is a runtime fact. Reproducible operations begin by measuring the binary and its feature set, just as a service checks protocol and storage capabilities at startup.`,
      challenge:
        code`Run SELECT sqlite_compileoption_used('ENABLE_DBSTAT_VTAB'); and compare its integer result with the compile-options list.`,
    },
    {
      slug: "share-one-file-between-sessions",
      title: "Share one database file between sessions",
      difficulty: "beginner",
      tags: ["sqlite-cli", "transactions", "isolation"],
      prerequisites: ["inspect-build-capabilities"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 12,
      overview:
        code`Use two sqlite3 processes against one path. Commit a row in Session A and read it in Session B, then leave another row uncommitted and prove that B sees only committed state.`,
      syntaxBreakdown:
        code`BEGIN starts a transaction; COMMIT makes its changes visible to other connections; ROLLBACK discards uncommitted changes. Both wrapper-opened sessions use TUTOR_SQLITE_DB, so they share one pager state boundary.`,
      setup: code`.print -- The wrapper has already opened $TUTOR_SQLITE_DB
DROP TABLE IF EXISTS messages;
CREATE TABLE messages(id INTEGER PRIMARY KEY, body TEXT NOT NULL);`,
      code: code`-- Session A
.headers on
BEGIN;
INSERT INTO messages(body) VALUES ('committed from A');
COMMIT;

-- Session B
.headers on
SELECT id, body FROM messages ORDER BY id;

-- Session A
BEGIN;
INSERT INTO messages(body) VALUES ('uncommitted from A');
SELECT count(*) AS a_count FROM messages;

-- Session B
SELECT count(*) AS b_count FROM messages;

-- Session A
ROLLBACK;

-- Session B
SELECT count(*) AS b_after_rollback FROM messages;`,
      expectedResult:
        code`Session B first prints one committed row. While A's second transaction is open, A reports a_count = 2 but B reports b_count = 1. After A rolls back, B still reports b_after_rollback = 1. No connection ever observes A's uncommitted row.`,
      systemsLens:
        code`Separate processes coordinate through one filesystem object and its locks, while transaction commit defines the visibility boundary. This is connection-level isolation without a database server.`,
      challenge: code`Replace ROLLBACK with COMMIT and predict the next count in B; then test it.`,
    },
    {
      slug: "decode-database-header",
      title: "Decode the database header",
      difficulty: "beginner",
      tags: ["file-format", "pages", "observability"],
      prerequisites: ["share-one-file-between-sessions"],
      safetyLevel: "read-only",
      runIn: "mixed",
      estimatedMinutes: 12,
      revision: 2,
      overview:
        code`Correlate SQLite's page metadata with bytes on disk. The setup commits before you look, so in rollback mode the file on disk is a stable state and the connection can stay open while you inspect it.`,
      syntaxBreakdown:
        code`PRAGMA page_size and page_count expose pager geometry; stat -c %s reports bytes; xxd -l 100 prints the first 100 bytes. SQLite format 3 begins at byte zero and uses a power-of-two page size. The setup forces rollback mode with PRAGMA journal_mode=DELETE because page geometry cannot change in WAL mode and in WAL the main file alone is not the database.`,
      setup: code`.print -- The wrapper has already opened $TUTOR_SQLITE_DB
PRAGMA journal_mode=DELETE;
PRAGMA page_size=4096;
VACUUM;
DROP TABLE IF EXISTS records;
CREATE TABLE records(k INTEGER PRIMARY KEY, v TEXT);
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 20) INSERT INTO records SELECT x, 'value-' || x FROM n;`,
      code: code`.headers on
.mode box
SELECT page_size, page_count, page_size * page_count AS expected_bytes FROM pragma_page_size, pragma_page_count;
.shell stat -c 'actual_bytes=%s' "$TUTOR_SQLITE_DB"
.shell xxd -l 100 -g 1 "$TUTOR_SQLITE_DB"`,
      expectedResult:
        code`The query reports a power-of-two page size (4096 in a fresh file) and page_count > 1. actual_bytes equals page_size multiplied by page_count. The hex dump starts with ASCII "SQLite format 3" followed by a NUL; the remaining header bytes include page size and schema metadata.`,
      systemsLens:
        code`Durable abstractions have byte-level compatibility contracts. Page geometry is not an implementation detail when it determines I/O units, file sizing, and whether another implementation can open the file.`,
      challenge:
        code`Change the page size to 1024 in a new database and compare the first 20 header bytes and file length.`,
    },
    {
      slug: "application-id-schema-versioning",
      title: "Version an application file format",
      difficulty: "intermediate",
      tags: ["file-format", "transactions", "idempotency"],
      prerequisites: ["decode-database-header"],
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 12,
      overview:
        code`Use application_id and user_version as durable metadata while migrating a document table. Perform the schema change and version update in one transaction, then reopen and validate both values.`,
      syntaxBreakdown:
        code`PRAGMA application_id identifies an application-owned file format; PRAGMA user_version is an application-controlled schema integer; ALTER TABLE changes schema; BEGIN/COMMIT makes migration and metadata advancement one atomic unit.`,
      setup: code`.print -- The wrapper has already opened $TUTOR_SQLITE_DB
DROP TABLE IF EXISTS documents;
PRAGMA application_id=0;
PRAGMA user_version=0;
CREATE TABLE documents(id INTEGER PRIMARY KEY, title TEXT NOT NULL);
INSERT INTO documents(title) VALUES ('first document');`,
      code: code`BEGIN IMMEDIATE;
ALTER TABLE documents ADD COLUMN body TEXT NOT NULL DEFAULT '';
PRAGMA application_id=1397836884;
PRAGMA user_version=2;
INSERT INTO documents(title, body) VALUES ('migrated document', 'body survives reopen');
COMMIT;
.headers on
.mode box
PRAGMA application_id;
PRAGMA user_version;
SELECT sql FROM sqlite_schema WHERE name='documents';
SELECT count(*) AS documents, count(body) AS rows_with_body FROM documents;
.shell sqlite3 "$TUTOR_SQLITE_DB" "PRAGMA application_id; PRAGMA user_version; SELECT count(*), count(body) FROM documents;"`,
      expectedResult:
        code`After reopening, application_id is 1397836884 (hex 0x53514c54, the chosen SQLite Systems marker) and user_version is 2. The schema contains body with its default, and documents = 2 with rows_with_body = 2. Both metadata values and data survive close/reopen.`,
      systemsLens:
        code`A local database can be a versioned application file format. Identity and schema generation let a reader reject or migrate files deliberately, and the transaction couples format metadata to contents.`,
      caution:
        code`Use an application-specific identifier in a real product and advance user_version only after a successful migration. Do not treat either pragma as SQLite's internal library version.`,
    },
  ],
};
