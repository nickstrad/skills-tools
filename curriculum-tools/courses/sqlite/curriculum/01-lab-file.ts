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
        "Create one owned directory and a repeatable one-row baseline. Unlike the PostgreSQL lab, there is no database server to start or connect to: this process opens a local file and the library executes inside it. Establish the path boundary now because later experiments deliberately crash writers and damage copies.",
      syntaxBreakdown: code`### In plain terms

This establishes an owned SQLite file and proves that setup is repeatable. Every command may change only the path under sqlite-lab. Re-running demonstrates idempotency: the same preparation produces one known baseline row instead of accumulating data.

### What you are learning

- **File ownership** identifies exactly which path an experiment may modify.
- **CLI inspection** shows attached files and tables.
- **Repeatable setup** clears only this experiment's table and recreates it.

### Piece by piece

- **export VAR=value** (shell environment assignment): names a directory and database path for later commands; the printed path and stat result are the ownership evidence.
- **mkdir -p** (shell command; -p creates missing parents and accepts an existing directory): makes the scratch boundary safe to rerun.
- **sqlite3 FILE** (SQLite shell): opens or creates FILE and consumes the SQL heredoc; it creates events and one row.
- **DROP TABLE IF EXISTS** (SQL setup clause): removes this lesson's old table without failing when absent.
- **CREATE TABLE with PRIMARY KEY, NOT NULL, and DEFAULT** (SQL definition): gives events an identity and required text fields, with an empty payload default.
- **.databases** (SQLite dot command): lists database names and paths; main must be the learner-owned lab.db.
- **.tables** (SQLite dot command): lists visible tables; events proves setup ran.
- **SELECT count(*) AS baseline_rows** (SQL aggregate and alias): counts rows and names the evidence column, which must be 1.
- **stat -c format FILE** (shell inspection; -c selects the format, %s is bytes and %n is the path): proves the file exists and records its size.
- **.shell** (SQLite host-command escape, used in the challenge): runs a host copy command so the copied file can be inspected as a separate object.
`,
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
        code`sqlite3 reports one main database whose path ends in sqlite-lab/lab.db, .tables prints events, and baseline_rows is 1. A second run again reports one row because setup drops and recreates the table.`,
      systemsLens:
        "Embedding removes a service boundary, not the need for operational ownership. The application inherits responsibility for file placement, permissions, connection policy, backups and recovery. The lab makes that responsibility concrete without repeating PostgreSQL's server-installation workflow.",
      challenge:
        code`Copy the directory to sqlite-lab-copy, open the copy, and predict which path .databases reports.`,
      revision: 1,
    },
    {
      slug: "inspect-build-capabilities",
      title: "Inspect the SQLite build capabilities",
      difficulty: "beginner",
      tags: ["sqlite-cli", "file-format", "observability", "fts5"],
      prerequisites: ["build-sqlite-lab"],
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 10,
      overview:
        "Probe the exact SQLite runtime that will execute the course, including dbstat, raw pages, bytecode inspection and FTS5. A version string or installed package name does not establish which optional modules are compiled into this process. Treat missing capabilities as a deployment prerequisite to resolve before the dependent experiment.",
      syntaxBreakdown: code`### In plain terms

SQLite is a library that can be built with different optional features. Two programs on the same host may use different SQLite libraries even when they open the same file. We record metadata and actually execute each required feature; a successful inventory query alone is not a capability test.

### What you are learning

- **Runtime evidence:** Test the process that will perform the operation.
- **Build versus file contract:** A compatible file format does not guarantee an identical extension set.
- **Introspection boundary:** Virtual-machine instructions describe execution machinery, not a measured performance profile.

### Piece by piece

- **CREATE TABLE IF NOT EXISTS and INSERT OR REPLACE** establish a harmless named baseline page so this probe works in a fresh isolated lab too.
- **sqlite_version()** returns the linked library version. The course is validated on 3.53.4.
- **pragma_compile_options** lists build flags; **LIKE** filters DBSTAT, DBPAGE, FTS5 and THREADSAFE. **pragma_module_list** lists registered virtual-table modules, which still need real probes.
- **.bail off** keeps the CLI running after a missing-capability error so all diagnostics are visible. It does not convert the error into a passed prerequisite.
- **dbstat** reports B-tree page records; a nonzero count proves that module can inspect this file.
- **CREATE VIRTUAL TABLE temp.dbpage_probe USING sqlite_dbpage** makes a connection-local raw-page interface. **pgno=1 and length(data)** verify a real page, whose byte length must match the database geometry.
- **bytecode('SELECT 1')** invokes the optional bytecode virtual table and returns opcode rows ordered by instruction address. Ordinary EXPLAIN alone would not prove that optional module exists.
- **fts5(body) and MATCH 'capability'** create a temporary full-text table, insert text and require one search result. A substitute LIKE query would bypass the capability being tested.
- **.help backup/recover** checks the CLI command surface, not whether a future backup or salvage will work.
- **sqlite_compileoption_used('ENABLE_DBSTAT_VTAB')** in the challenge compares a named build flag with the successful operation; it complements rather than replaces the probe.`,
      setup: code`CREATE TABLE IF NOT EXISTS capability_baseline(id INTEGER PRIMARY KEY);
INSERT OR REPLACE INTO capability_baseline VALUES (1);`,
      code: code`.bail off
.headers on
.mode box
SELECT sqlite_version() AS sqlite_version;
SELECT compile_options FROM pragma_compile_options WHERE compile_options LIKE '%DBSTAT%' OR compile_options LIKE '%DBPAGE%' OR compile_options LIKE '%FTS5%' OR compile_options LIKE '%THREADSAFE%' ORDER BY compile_options;
SELECT name FROM pragma_module_list WHERE name IN ('dbstat', 'sqlite_dbpage', 'fts5') ORDER BY name;
SELECT count(*) AS dbstat_probe_rows FROM dbstat;
CREATE VIRTUAL TABLE temp.dbpage_probe USING sqlite_dbpage;
SELECT pgno, length(data) AS page_bytes FROM dbpage_probe WHERE pgno=1;
SELECT opcode FROM bytecode('SELECT 1') ORDER BY addr;
CREATE VIRTUAL TABLE temp.fts_probe USING fts5(body);
INSERT INTO fts_probe(body) VALUES ('capability probe');
SELECT count(*) AS fts_matches FROM fts_probe WHERE fts_probe MATCH 'capability';
.help backup
.help recover`,
      expectedResult:
        "The course runtime reports SQLite 3.53.4 or newer, nonzero dbstat rows, raw page 1 with the correct byte length, bytecode opcode rows, and fts_matches=1. Help lists .backup and .recover. A missing module is an unmet prerequisite, not an alternative successful result; use the repository bootstrap's explicit feature configuration before continuing.",
      systemsLens:
        "An embedded database becomes part of your application's deployed binary contract. PostgreSQL's client/server version split becomes a different question here: which library and extensions did this process link? Capture that evidence when investigating a bug that appears on only one machine.",
      challenge:
        code`Run SELECT sqlite_compileoption_used('ENABLE_DBSTAT_VTAB'); and compare it with the compile-options list and the real dbstat probe.`,
      revision: 3,
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
        "Use two independent sqlite3 processes against the same path and compare committed with uncommitted rows. This is a brief orientation, not a second isolation tutorial: the important difference is that coordination occurs through the local file and its locking protocol, without a database server mediating requests.",
      syntaxBreakdown: code`### In plain terms

Two CLI processes can coordinate through one local file without a server. The experiment separates a committed row from an uncommitted row, then asks each connection what it can see. A connection can read its own pending write, while another connection sees only the last committed file state.

### What you are learning

- **Connection identity** gives each sqlite3 process separate transaction state.
- **Commit visibility** makes a write available to other connections.
- **Rollback** removes pending changes from the writer and shared file.

### Piece by piece

- **Session A / Session B** (lesson coordination labels): run blocks in two concurrently open CLI processes; B's counts are the cross-connection evidence.
- **DROP TABLE IF EXISTS and CREATE TABLE** (SQL setup): make a repeatable table with an integer key and required body.
- **BEGIN** (transaction start): opens a transaction without immediately reserving the writer slot.
- **INSERT** (data change): adds a row to the current transaction; the second insert is deliberately pending.
- **COMMIT** (transaction end): publishes A's first row for B to see.
- **ROLLBACK** (transaction end): discards A's second row before B's final count.
- **count(*)** (SQL aggregate): produces a_count, b_count, and b_after_rollback, which distinguish private and committed state.
`,
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
        code`B first prints one committed row. While A's second transaction is open, A reports a_count = 2 but B reports b_count = 1. After A rolls back, B reports b_after_rollback = 1.`,
      systemsLens:
        "No server process does not mean no concurrency protocol. Each caller has private connection and transaction state, while SQLite coordinates access to one shared file. Distinguish this arrangement from two independent database files, which later lessons use to model separate commit histories.",
      challenge: code`Replace ROLLBACK with COMMIT and predict the next count in B; then test it.`,
      revision: 1,
    },
    {
      slug: "connection-settings-are-local",
      title: "Separate persistent and connection-local settings",
      difficulty: "intermediate",
      tags: ["connection-policy", "locking", "foreign-keys", "wal"],
      prerequisites: ["share-one-file-between-sessions"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      overview:
        "Choose WAL in A, then compare A's connection policy with a fresh B connection opening the same file. A declared foreign key is not enough if a writer has enforcement disabled. The experiment exposes exactly which setup your application's connection factory must repeat.",
      syntaxBreakdown: code`### In plain terms

A file can retain a storage-mode choice while new connections still begin with their own runtime policies. A sets WAL, NORMAL synchronization, foreign-key enforcement and a 750 ms wait budget. B sees the persistent mode but does not inherit A's other settings, so a bad child row may be accepted until B initializes itself.

### What you are learning

- **Persistence boundary:** WAL is stored as a file-level mode; these other policies belong to a connection.
- **Constraint boundary:** Declaring REFERENCES and enforcing it are separate steps in SQLite.
- **Initialization contract:** Every writer, including a migration or background task, needs deliberate setup.

### Piece by piece

- **PRAGMA journal_mode=WAL** requests the persistent mode and should return wal. This experiment does not yet need the WAL internals explained in module 05.
- **PRAGMA synchronous=NORMAL** sets A's durability policy and reports integer 1. NORMAL's power-loss guarantees depend on journal mode; it is a visible comparison value, not a blanket recommendation.
- **PRAGMA foreign_keys=ON** enables enforcement before a transaction. Turning it on later does not retroactively repair existing orphan rows.
- **.timeout 750** installs this connection's busy-handler budget in milliseconds.
- **pragma_journal_mode, pragma_synchronous, pragma_foreign_keys and pragma_busy_timeout** expose the policies as queryable rows. The busy-timeout result column is named **timeout**, so the query aliases it to busy_timeout.
- **REFERENCES parent(id)** declares the relationship. A's child 99 fails; fresh B's child 98 is accepted on this lab's default-off build.
- **Session B** is a separate long-lived CLI process opened against the same path. After it repeats initialization, child 97 fails too.
- **count(*)** verifies only the deliberately accepted orphan exists. A different external build may default foreign keys on; record that difference rather than disable safety to mimic an expected default.`,
      setup: code`DROP TABLE IF EXISTS child;
DROP TABLE IF EXISTS parent;
CREATE TABLE parent(id INTEGER PRIMARY KEY);
CREATE TABLE child(parent_id INTEGER REFERENCES parent(id));
INSERT INTO parent VALUES (1);`,
      code: code`-- Session A
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
.timeout 750
SELECT 'A policies' AS who, journal_mode, synchronous, foreign_keys, timeout AS busy_timeout FROM pragma_journal_mode, pragma_synchronous, pragma_foreign_keys, pragma_busy_timeout;
INSERT INTO child VALUES (99);

-- Session B: a newly opened sqlite3 process against the same TUTOR_SQLITE_DB
SELECT 'B fresh policies' AS who, journal_mode, synchronous, foreign_keys, timeout AS busy_timeout FROM pragma_journal_mode, pragma_synchronous, pragma_foreign_keys, pragma_busy_timeout;
INSERT INTO child VALUES (98);
SELECT 'B FK off accepted' AS evidence, count(*) AS child_rows FROM child;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
.timeout 750
SELECT 'B initialized policies' AS who, journal_mode, synchronous, foreign_keys, timeout AS busy_timeout FROM pragma_journal_mode, pragma_synchronous, pragma_foreign_keys, pragma_busy_timeout;
INSERT INTO child VALUES (97);`,
      expectedResult:
        "A prints wal, synchronous=1, foreign_keys=1 and busy_timeout=750; child 99 fails its FK constraint. On the course build, fresh B shows wal, synchronous=2, foreign_keys=0 and busy_timeout=0; child 98 succeeds and child_rows=1. B then initializes its own policies and child 97 fails. Defaults are build-dependent, but B never inherits A's connection settings.",
      systemsLens:
        "PostgreSQL also has session-local settings, but an embedded application cannot assume a central server configuration initialized every writer. Make connection setup an explicit, tested contract. The schema declaration, persistent file format and current connection policy are three different sources of authority.",
      challenge:
        code`Open a third connection and inspect all four values before initialization. Which values can a file reader trust, and which must the application set before SQL?`,
      caution:
        code`The exact default synchronous integer is version and build dependent; record B's observed value instead of treating 2 as a portability promise.`,
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "decode-database-header",
      title: "Decode the database header",
      difficulty: "beginner",
      tags: ["file-format", "pages", "observability"],
      prerequisites: ["connection-settings-are-local"],
      safetyLevel: "ddl",
      runIn: "mixed",
      estimatedMinutes: 12,
      overview:
        "Create a committed rollback-mode layout, then compare its page metadata with actual header bytes and file length. SQLite's stable file format is part of why it works as an application artifact. Learn which evidence is durable on disk before applying file tools to a live WAL database.",
      syntaxBreakdown: code`### In plain terms

SQLite stores a file header before its pages, and the header records compatibility facts such as page size and schema state. This experiment sets a known page size, commits twenty rows, and compares SQL metadata with filesystem length and a hexadecimal header dump. The arithmetic checks that a complete rollback-mode database occupies an integer number of pages.

### What you are learning

- **Page geometry** determines the unit of allocation and I/O.
- **Header bytes** are a durable compatibility contract.
- **Cross-layer checks** catch a mismatched file or page-size assumption.

### Piece by piece

- **PRAGMA journal_mode=DELETE** (persistent setting): uses rollback mode so the main file is stable during inspection.
- **PRAGMA page_size=4096** (page-size setting): requests 4096-byte pages before rebuilding; an existing geometry may require VACUUM.
- **VACUUM** (rewrite command): rebuilds the database and applies the requested page size.
- **pragma_page_size and pragma_page_count** (table-valued PRAGMAs): expose geometry; their product is expected_bytes.
- **stat -c %s FILE** (shell query): reports actual_bytes for comparison with the SQL product.
- **xxd -l 100 -g 1 FILE** (hex dump and flags): limits output to 100 bytes in one-byte groups; the first bytes should spell SQLite format 3.
- **WITH RECURSIVE** (SQL row generator): creates deterministic rows so the file extends beyond the header.
`,
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
        code`The query reports page size 4096 and page_count > 1. actual_bytes equals page_size multiplied by page_count. The hex dump starts with ASCII SQLite format 3 followed by a NUL; remaining header bytes include page size and schema metadata.`,
      systemsLens:
        "The contrast with PostgreSQL is packaging and responsibility: a SQLite file is a documented, portable application format, but its current live state can still depend on sidecars. Header fields help identify and validate an artifact; they do not replace an engine-coordinated snapshot.",
      challenge:
        code`Change the page size to 1024 in a new database and compare the first 20 header bytes and file length.`,
      revision: 2,
      minVersion: "3.53.4",
    },
    {
      slug: "application-id-schema-versioning",
      title: "Version an application file format",
      difficulty: "intermediate",
      tags: ["file-format", "transactions", "idempotency", "migrations"],
      prerequisites: ["decode-database-header"],
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 12,
      overview:
        "Commit a schema migration and its application version together, then deliberately fail and roll back the next migration. Reopen the file through a reader acceptance check that examines both metadata and schema shape. The failure path is the point: a version number is useful only when it agrees with what was actually committed.",
      syntaxBreakdown: code`### In plain terms

A reader needs to know whether it understands a file before using its rows. application_id identifies the application format and user_version records the application's schema generation. Both are application-controlled header fields; neither is the SQLite library version or an automatic migration system.

### What you are learning

- **Atomic migration:** Schema, data and version metadata must publish together.
- **Error scope:** A default constraint error does not automatically roll back all SQLite transaction work.
- **Reader contract:** A supported marker/version and expected schema shape justify acceptance.

### Piece by piece

- **PRAGMA application_id and user_version** reset the fixture, then assign format marker 1397836884 (0x53514c54) and generation 2 inside the migration transaction.
- **BEGIN IMMEDIATE** obtains writer admission before changing the schema. **ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT ''** adds body and supplies a compatible value for the existing row.
- **COMMIT** publishes the column, extra document and version together. **sqlite_schema.sql** displays the resulting definition; **count(body)** verifies both rows have non-NULL bodies.
- **The second transaction** adds pending_column and sets version 3, then intentionally inserts duplicate id 1. The UNIQUE error is followed by explicit **ROLLBACK**; do not assume the error itself abandoned the migration.
- **pragma_table_info('documents')** exposes column names. A zero count for pending_column and user_version=2 prove the rollback restored schema and metadata together.
- **.shell sqlite3 FILE SQL** opens an independent reader. **CASE WHEN** combines the expected application ID, supported version and column checks into reader accepts v2 or reader rejects file.
- **The final reopen query** verifies the durable marker and two documents. An application should refuse unsupported formats rather than silently treating any valid SQLite file as its own.`,
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
.print -- A failed migration must explicitly abandon the transaction
BEGIN IMMEDIATE;
ALTER TABLE documents ADD COLUMN pending_column TEXT;
PRAGMA user_version=3;
INSERT INTO documents(id, title, body) VALUES (1, 'duplicate identity', 'must fail');
ROLLBACK;
SELECT 'after rollback', user_version,
  (SELECT count(*) FROM pragma_table_info('documents') WHERE name='pending_column') AS leaked_column
FROM pragma_user_version;
.print -- A fresh reader refuses an unknown format or a mismatched schema generation
.shell sqlite3 "$TUTOR_SQLITE_DB" "SELECT CASE WHEN application_id=1397836884 AND user_version=2 AND (SELECT count(*) FROM pragma_table_info('documents') WHERE name='body')=1 AND (SELECT count(*) FROM pragma_table_info('documents') WHERE name='pending_column')=0 THEN 'reader accepts v2' ELSE 'reader rejects file' END FROM pragma_application_id, pragma_user_version;"
.shell sqlite3 "$TUTOR_SQLITE_DB" "PRAGMA application_id; PRAGMA user_version; SELECT count(*), count(body) FROM documents;"`,
      expectedResult:
        "The first migration commits application_id=1397836884, user_version=2, a body column and two documents with bodies. The next migration prints one expected UNIQUE failure and is explicitly rolled back. after rollback reports version 2 and leaked_column=0; a fresh process prints reader accepts v2 and sees the same two documents.",
      systemsLens:
        "SQLite can be an application file format, so migration and reader compatibility belong to the application, not an unseen service administrator. Atomic metadata updates prevent half-migrations; a supported-version gate prevents a different class of failure, where a structurally valid file is interpreted under the wrong contract.",
      challenge:
        "On another owned copy, change user_version to an unsupported generation without changing the schema and run the acceptance query. Then remove the explicit ROLLBACK from the failed migration and inspect transaction state without committing it: why is catching the exception alone insufficient?",
      caution:
        code`Use an application-specific identifier in a real product and advance user_version only after a successful migration. Do not treat either pragma as SQLite's library version.`,
      revision: 3,
      minVersion: "3.53.4",
    },
    {
      slug: "strict-storage-contracts",
      title: "Make storage and domain contracts explicit",
      difficulty: "intermediate",
      tags: ["strict-tables", "constraints", "data-quality"],
      prerequisites: ["application-id-schema-versioning"],
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 15,
      overview:
        "Compare an ordinary INTEGER column with a STRICT table, then add a domain range check. If you carry PostgreSQL's usual declared-type intuition directly into ordinary SQLite tables, invalid data may be stored rather than rejected. Observe the actual storage class and the distinct rejection boundaries.",
      syntaxBreakdown: code`### In plain terms

Ordinary SQLite tables use flexible type affinity: an INTEGER declaration may still store text when conversion is impossible. STRICT tables reject values that cannot be losslessly converted, while CHECK adds a domain rule such as a permitted range. The experiment records typeof and separately observes each expected constraint error.

### What you are learning

- **Affinity versus STRICT typing** separates a storage preference from a lossless type contract.
- **Lossless coercion** lets 42.0 fit an INTEGER STRICT column when no information is lost.
- **CHECK constraints** enforce a domain predicate that type declarations cannot express.

### Piece by piece

- **CREATE TABLE flexible(value INTEGER)** (ordinary table): gives INTEGER affinity but does not reject impossible conversion; typeof proves text was stored.
- **STRICT** (table option): rejects nonnumeric text while accepting losslessly coercible 42.0.
- **typeof(value)** (SQLite scalar function): reports the stored class, such as integer, real, or text.
- **CHECK(value BETWEEN 0 AND 100)** (constraint expression): rejects a correctly typed value outside the permitted range.
- **.bail off** (CLI dot command): continues after expected errors so later probes and counts run.
- **count(*)** (aggregate): final flexible_rows, strict_rows, and bounded_rows show exactly which inserts survived.
`,
      setup: code`.bail off
DROP TABLE IF EXISTS flexible;
DROP TABLE IF EXISTS strict_numbers;
DROP TABLE IF EXISTS bounded;
CREATE TABLE flexible(value INTEGER);
CREATE TABLE strict_numbers(value INTEGER) STRICT;
CREATE TABLE bounded(value INTEGER CHECK (value BETWEEN 0 AND 100)) STRICT;`,
      code: code`.headers on
.mode box
INSERT INTO flexible VALUES ('not-an-integer');
SELECT 'flexible text accepted' AS case_name, value, typeof(value) AS stored_type FROM flexible;
INSERT INTO strict_numbers VALUES ('not-an-integer');
INSERT INTO strict_numbers VALUES (42.0);
SELECT 'strict lossless number accepted' AS case_name, value, typeof(value) AS stored_type FROM strict_numbers;
INSERT INTO bounded VALUES (-1);
INSERT INTO bounded VALUES (50);
SELECT 'domain-valid row' AS case_name, value, typeof(value) AS stored_type FROM bounded;
SELECT (SELECT count(*) FROM flexible) AS flexible_rows, (SELECT count(*) FROM strict_numbers) AS strict_rows, (SELECT count(*) FROM bounded) AS bounded_rows;`,
      expectedResult:
        code`The flexible insert succeeds and typeof(value) is text. The first strict insert reports a datatype constraint error, while 42.0 succeeds with typeof(value) = integer. The bounded insert of -1 reports a CHECK constraint error; 50 succeeds. Final counts are flexible_rows = 1, strict_rows = 1, and bounded_rows = 1.`,
      systemsLens:
        "Validation is a placement decision. Ordinary SQLite affinity is more permissive than PostgreSQL's declared column types; STRICT brings a lossless storage-type contract, while CHECK and NOT NULL still express separate domain rules. These local constraints reduce bad state but do not validate a distributed history or external input protocol.",
      challenge:
        code`Try inserting 42.5 into strict_numbers and 101 into bounded. Predict which layer rejects each value and inspect typeof for every accepted row.`,
      caution:
        code`Constraint wording can vary by build. Classify each error by the violated rule and verify final counts; a later success is not evidence that a rejected row was stored.`,
      revision: 1,
      minVersion: "3.53.4",
    },
  ],
};
