import { code, type Module } from "../../../src/types.ts";

export const RECOVERY: Module = {
  category: "recovery",
  title: "Backup, integrity, and recovery",
  lessons: [
    {
      slug: "unsafe-live-copy",
      title: "Copying only the main file misses live WAL state",
      difficulty: "advanced",
      tags: ["backup", "wal", "rpo", "file-format"],
      prerequisites: ["checkpoint-starvation"],
      safetyLevel: "dangerous",
      runIn: "mixed",
      sessions: 2,
      estimatedMinutes: 20,
      overview:
        "Commit a row into WAL, copy only the main file and observe a structurally readable but stale destination. The useful failure is not that cp crashes—it succeeds while losing the recovery point you thought you captured. Keep the source intact and compare both row counts.",
      syntaxBreakdown: code`### In plain terms

This experiment asks whether copying the main database pathname is the same as taking a database snapshot. It is not: in write-ahead logging (WAL), committed pages can still be in the -wal sidecar, while another connection keeps the source open. The source is disposable; the copy is evidence, not a recovery target.

### What you are learning

- **WAL file set** — the main file and its -wal/-shm companions together describe the live database.
- **Snapshot boundary** — a byte copy has no SQLite transaction boundary and can omit committed frames.
- **Failure-domain ownership** — the source remains untouched while the experiment demonstrates the risk.

### Piece by piece

- **PRAGMA journal_mode** (SQL connection setting)
  - What it is: DELETE uses rollback journaling and WAL places committed frames in a sidecar.
  - What it does here: establishes a baseline in the main file, then deliberately moves later state to WAL.
  - What it gives us: a known row that a main-file-only copy can see and a later committed row it may miss.
- **PRAGMA wal_autocheckpoint** (SQL setting)
  - What it is: the frame threshold at which a writer asks SQLite to checkpoint WAL frames.
  - What it does here: zero disables automatic checkpointing so the sidecar remains observable.
  - What it gives us: an intentional live-file state rather than an unmeasured race.
- **cp** (shell byte-copy program)
  - What it is: copies named filesystem bytes without consulting SQLite's pager.
  - What it does here: copies only the main pathname, excluding live sidecars.
  - What it gives us: the destination count to compare with the source count.
- **.shell** (sqlite3 CLI command)
  - What it is: runs a host shell command from the current CLI session.
  - What it does here: removes old disposable artifacts, invokes cp, and opens the result with a new sqlite3 process.
  - What it gives us: explicit file/evidence paths; a failed destination open is itself evidence of an incomplete file set.
- **count(*)** (SQL aggregate)
  - What it is: counts rows visible to that connection.
  - What it does here: compares baseline, source, and copied state.
  - What it gives us: the exact committed-row discrepancy, not merely a successful process exit.`,
      setup: code`.print -- close every other sqlite3 session first: the next line must print delete
PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS records;
CREATE TABLE records(id INTEGER PRIMARY KEY, value TEXT);
INSERT INTO records VALUES (1, 'main-file-baseline');
PRAGMA journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;`,
      code: code`-- Session B
PRAGMA wal_autocheckpoint=0;
SELECT 'source baseline', count(*) FROM records;

-- Session A
INSERT INTO records VALUES (2, 'committed-only-in-wal');
SELECT 'source current', count(*) FROM records;
.shell rm -f "$TUTOR_SQLITE_DB.copy.db" "$TUTOR_SQLITE_DB.copy.db-wal" "$TUTOR_SQLITE_DB.copy.db-shm"
.shell cp "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB.copy.db"
.shell sqlite3 "$TUTOR_SQLITE_DB.copy.db" "SELECT 'main-file-only copy', count(*) FROM records;"

-- Session B
SELECT 'source remains', count(*) FROM records;`,
      expectedResult:
        "The source baseline is 1, then A commits and reports source current=2. The deliberately main-only copy reports 1, while B still reports source remains=2. This controlled fixture demonstrates missing committed WAL state without damaging the source; an unexpected destination error needs investigation, not automatic classification as a passed example.",
      systemsLens:
        "A successful file operation is not a successful snapshot protocol. SQLite's portable-file appeal can hide a live multi-file state; PostgreSQL backup experience should make you ask the same capture-consistency question, but the concrete SQLite hazard is omitting committed WAL frames. A backup age metric is meaningless if the captured artifact was never consistent.",
      challenge:
        "Repeat after an engine-coordinated TRUNCATE checkpoint while all writers are quiescent, and compare the copy. Then explain why checkpoint followed by cp is still racy if a writer may commit between them.",
      caution:
        code`This intentionally unsafe exercise copies only a disposable source and never overwrites the original. Do not copy live SQLite files in production this way.`,
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "online-cli-backup",
      title: "The CLI backup captures a consistent source snapshot",
      difficulty: "advanced",
      tags: ["backup", "wal", "consistency", "rpo", "rto"],
      prerequisites: ["unsafe-live-copy"],
      safetyLevel: "writes-data",
      runIn: "mixed",
      sessions: 2,
      estimatedMinutes: 20,
      overview:
        "Hold B's uncommitted transaction while A captures a backup through SQLite's engine, then commit more source work and inspect the two independent histories. The backup should contain the earlier committed state, not a partly applied writer transaction. Consistency and freshness are separate properties.",
      syntaxBreakdown: code`### In plain terms

This experiment runs SQLite's online backup operation while another connection has uncommitted work. The backup API chooses a consistent snapshot, so it contains committed state at its capture point and excludes the open transaction. That capture point is useful evidence for a recovery point objective (RPO), but it is not continuous replication.

### What you are learning

- **Online backup** — SQLite copies pages through the engine rather than copying pathnames.
- **Committed snapshot** — uncommitted pages are not part of the destination.
- **RPO/RTO evidence** — the backup's state and restore time are separate operational measurements.

### Piece by piece

- **PRAGMA journal_mode=WAL** (SQL setting)
  - What it is: enables the WAL sidecar and reader/writer overlap.
  - What it does here: lets Session B keep an uncommitted writer while Session A backs up.
  - What it gives us: a controlled point at which the destination must show only committed rows.
- **BEGIN IMMEDIATE** (SQL transaction command)
  - What it is: starts a write transaction and reserves SQLite's writer slot.
  - What it does here: keeps three inserts uncommitted while the backup runs.
  - What it gives us: a clean boundary for testing whether the backup leaks half a transaction.
- **.backup FILE** (sqlite3 CLI command)
  - What it is: invokes the engine-coordinated backup API into a new file.
  - What it does here: writes the destination named by the shell-expanded path.
  - What it gives us: a file that can be opened and checked independently.
- **PRAGMA integrity_check** (SQL diagnostic)
  - What it is: performs a broad structural consistency check.
  - What it does here: validates the destination before its row count is trusted.
  - What it gives us: ok means the B-tree checks passed; it does not prove domain correctness.
- **COMMIT** (SQL transaction command)
  - What it is: makes Session B's changes durable and visible.
  - What it does here: moves the source from the backup's one-row snapshot to six rows.
  - What it gives us: source-final evidence that is deliberately newer than the backup.`,
      setup: code`PRAGMA journal_mode=WAL;
DROP TABLE IF EXISTS events;
CREATE TABLE events(id INTEGER PRIMARY KEY, note TEXT);
INSERT INTO events VALUES (1, 'baseline');`,
      code: code`-- Session B
BEGIN IMMEDIATE;
INSERT INTO events(note) VALUES ('b1');
INSERT INTO events(note) VALUES ('b2');
INSERT INTO events(note) VALUES ('b3');

-- Session A
.shell rm -f "$TUTOR_SQLITE_DB.online-backup.db"
.shell sqlite3 "$TUTOR_SQLITE_DB" ".backup '$TUTOR_SQLITE_DB.online-backup.db'"
.shell sqlite3 "$TUTOR_SQLITE_DB.online-backup.db" "PRAGMA integrity_check; SELECT 'backup rows', count(*) FROM events;"

-- Session B
COMMIT;
INSERT INTO events(note) VALUES ('b4');
INSERT INTO events(note) VALUES ('b5');
SELECT 'source final', count(*) FROM events;`,
      expectedResult:
        code`B holds an uncommitted write while A runs the online backup. The destination opens successfully and integrity_check returns ok; it reports the committed snapshot count 1, while B then commits and the source final count is 6. The backup never contains B's uncommitted half-effect.`,
      systemsLens:
        "The backup API provides a consistent capture mechanism; your schedule, retention, retrieval and restore procedure determine whether it meets a recovery objective. A one-row backup can be perfectly consistent yet too stale for the application. Do not describe backup creation time alone as recovery time or a tested RTO.",
      challenge:
        "Repeat in DELETE mode after closing other connections. This script finishes backup before B attempts COMMIT, so it need not exhibit a wait. To demonstrate rollback-mode reader blocking, hold a separate read transaction through B's commit as in rollback-reader-writer-blocking; distinguish that evidence from what this backup schedule actually proves.",
      caution:
        code`A backup is only as current as its capture point; schedule and monitor it rather than treating it as continuous replication.`,
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "vacuum-into-snapshot",
      title: "VACUUM INTO creates an independent compact snapshot",
      difficulty: "intermediate",
      tags: ["backup", "vacuum", "pages", "integrity-check"],
      prerequisites: ["online-cli-backup"],
      safetyLevel: "writes-data",
      runIn: "mixed",
      sessions: 1,
      estimatedMinutes: 15,
      overview:
        "Delete most of a large-value fixture, then create an engine-coordinated compact copy with VACUUM INTO. Compare bytes only after checking the retained rows and structure. This is useful when SQLite is an artifact you ship or archive, but a smaller file does not by itself imply a better backup policy.",
      syntaxBreakdown: code`### In plain terms

Deleting rows can leave pages on SQLite's free list even though the logical table is small. This experiment asks what a compact, independent snapshot costs and preserves. VACUUM INTO rewrites the source into a new file; it does not compact the source in place.

### What you are learning

- **Free pages** — deleted space may be reusable without immediately shrinking the file.
- **Rewrite snapshot** — compaction and backup can be combined, at the cost of I/O and temporary space.
- **Validation before comparison** — logical row counts and integrity checks accompany byte measurements.

### Piece by piece

- **PRAGMA journal_mode=DELETE** (SQL setting)
  - What it is: rollback-journal mode, used here for deterministic local-file inspection.
  - What it does here: makes this lesson independent of WAL sidecars left by earlier lessons.
  - What it gives us: a self-contained source file to measure.
- **hex(randomblob(1000))** (SQL function expression)
  - What it is: generates 1,000 random bytes and renders them as hexadecimal text.
  - What it does here: creates payloads large enough to occupy multiple pages.
  - What it gives us: visible fragmentation after deletion.
- **PRAGMA freelist_count** (SQL diagnostic)
  - What it is: reports pages currently available for reuse.
  - What it does here: measures the space released by deleting 80 rows.
  - What it gives us: a nonzero free-page count to compare with file bytes.
- **VACUUM INTO FILE** (SQL command)
  - What it is: builds a new compact database at the supplied filename.
  - What it does here: writes the uniquely named destination without changing the source.
  - What it gives us: an independent file whose size and contents can be checked.
- **stat -c '%n %s bytes'** (shell program and format flag)
  - What it is: reports each path and its byte size; percent-n is the name and percent-s is size.
  - What it does here: compares source and compact destination bytes.
  - What it gives us: measured space trade-off, not an assumed ratio.`,
      setup: code`.print -- close every other sqlite3 session first: the next line must print delete
PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS blobs;
CREATE TABLE blobs(id INTEGER PRIMARY KEY, payload TEXT);
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100)
INSERT INTO blobs SELECT x, hex(randomblob(1000)) FROM n;`,
      code: code`-- Session A
DELETE FROM blobs WHERE id>20;
SELECT 'source rows/free pages', count(*), (SELECT freelist_count FROM pragma_freelist_count) FROM blobs;
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB"
.shell rm -f "$TUTOR_SQLITE_DB.vacuum.db"
.shell sqlite3 "$TUTOR_SQLITE_DB" "VACUUM INTO '$TUTOR_SQLITE_DB.vacuum.db'"
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB.vacuum.db"
.shell sqlite3 "$TUTOR_SQLITE_DB.vacuum.db" "PRAGMA integrity_check; SELECT 'copy rows', count(*) FROM blobs;"
      `,
      expectedResult:
        code`The source has 20 rows and a nonzero freelist after deleting 80 approximately 2,000-byte payloads. VACUUM INTO produces an independent file whose integrity_check is ok and whose count is 20; its byte size is smaller than the fragmented source.`,
      systemsLens:
        "SQLite can package a consistent logical rewrite as an independent file. That combines snapshot creation and compaction, while still leaving freshness, atomic publication of the destination, temporary space and restore verification to the application. An interrupted output must not be published as a known-good backup.",
      challenge:
        code`Increase payload size and compare the size delta. At what point does rewrite cost exceed the space benefit for your workload?`,
      caution:
        "The reserved lab destination TUTOR_SQLITE_DB.vacuum.db is removed before rerun because VACUUM INTO needs an absent or empty destination. Never redirect that cleanup to a valuable file. Verify the output before using it as a restore candidate.",
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "integrity-and-domain-checks",
      title: "Engine integrity does not prove application correctness",
      difficulty: "intermediate",
      tags: ["integrity-check", "consistency", "observability"],
      prerequisites: ["vacuum-into-snapshot"],
      safetyLevel: "ddl",
      runIn: "tool",
      sessions: 1,
      estimatedMinutes: 15,
      overview:
        "Create one orphan child while enforcement is disabled, then turn enforcement back on and ask three different health questions. Structural checks return ok even though a declared relationship remains broken. This extends the PostgreSQL integrity lesson by exposing SQLite's per-connection enforcement boundary.",
      syntaxBreakdown: code`### In plain terms

A database can have valid pages and B-trees while violating the application's relationships or allowed states. This lesson creates an orphan child row by temporarily disabling foreign-key enforcement, then runs structural, relational, and domain checks separately. Each result has a different scope, so one ok must not be treated as a complete health signal.

### What you are learning

- **Structural integrity** — page and B-tree consistency is necessary but not sufficient.
- **Foreign-key integrity** — relationship violations need foreign_key_check when bad data already exists.
- **Domain integrity** — business invariants require explicit queries or constraints.

### Piece by piece

- **PRAGMA foreign_keys=ON/OFF** (per-connection enforcement setting)
  - What it is: enables or disables enforcement of declared foreign keys for this connection.
  - What it does here: turns enforcement off only to create the deliberately invalid orphan, then turns it back on for checking.
  - What it gives us: a concrete reminder that this policy is not automatically global.
- **REFERENCES parent(id)** (foreign-key clause)
  - What it is: declares that child.parent_id should name an existing parent key.
  - What it does here: defines the relationship later reported as broken.
  - What it gives us: the table and row identifiers in foreign_key_check output.
- **PRAGMA quick_check** (bounded structural diagnostic)
  - What it is: a faster consistency check that does not inspect every cross-table invariant.
  - What it does here: checks pages/B-trees in the intentionally structurally valid database.
  - What it gives us: ok, demonstrating the boundary of the check.
- **PRAGMA integrity_check** (deeper structural diagnostic)
  - What it is: checks more structural invariants than quick_check.
  - What it does here: confirms the same valid-page result.
  - What it gives us: another ok that still cannot detect the orphan relationship.
- **PRAGMA foreign_key_check** (relational diagnostic)
  - What it is: scans declared foreign keys for violations already present.
  - What it does here: identifies child row 2 and its missing parent.
  - What it gives us: relationship evidence even though the page structure is sound.
- **LEFT JOIN ... IS NULL** (domain query pattern)
  - What it is: finds child rows with no matching parent.
  - What it does here: counts the same orphan at the application-query layer.
  - What it gives us: domain orphan count = 1, a check an application can expose in monitoring.`,
      setup: code`DROP TABLE IF EXISTS child;
DROP TABLE IF EXISTS parent;
PRAGMA foreign_keys=ON;
CREATE TABLE parent(id INTEGER PRIMARY KEY);
CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id), state TEXT NOT NULL);
INSERT INTO parent VALUES (1);
INSERT INTO child VALUES (1, 1, 'ready');
PRAGMA foreign_keys=OFF;
INSERT INTO child VALUES (2, 999, 'ready');
PRAGMA foreign_keys=ON;`,
      code: code`-- Session A
PRAGMA quick_check;
PRAGMA integrity_check;
PRAGMA foreign_key_check;
SELECT 'domain orphan count', count(*) FROM child c LEFT JOIN parent p ON p.id=c.parent_id WHERE p.id IS NULL;
SELECT 'domain ready count', count(*) FROM child WHERE state='ready';
      `,
      expectedResult:
        code`quick_check and integrity_check each print ok because the B-tree and pages are structurally sound. foreign_key_check prints a row identifying child row 2 and parent; the domain orphan query prints 1, proving application-level consistency needs its own checks.`,
      systemsLens:
        "Health checks certify specific invariants, not a database in the abstract. Structural checks, declared foreign-key checks and application queries cover different failure classes. Enabling SQLite foreign_keys for future writes does not retroactively repair old state; a restored offline replica also needs history reconciliation beyond all three checks.",
      challenge:
        code`Add a CHECK constraint for allowed state values and compare what integrity_check can and cannot validate.`,
      caution:
        code`Foreign keys are connection settings; every writer must enable PRAGMA foreign_keys=ON rather than relying on a process-wide default.`,
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "bounded-storage-failure",
      title: "Recover from a bounded page quota",
      difficulty: "advanced",
      tags: ["storage-quota", "error-scope", "recovery", "integrity-check"],
      prerequisites: ["integrity-and-domain-checks"],
      safetyLevel: "dangerous",
      runIn: "shell",
      sessions: 1,
      estimatedMinutes: 20,
      overview:
        "Exhaust a 12-page SQLite quota in a disposable file without filling the host filesystem. Require a classified full error, zero committed rows and sound structure, then raise the quota and commit the same bounded workload. The exercise turns storage exhaustion into an explicit recoverable policy boundary.",
      syntaxBreakdown: code`### In plain terms

A database can refuse growth even when the host has free bytes. max_page_count caps this SQLite connection's permitted database-page count; we deliberately make 100 large rows exceed it. The failed CLI exits before COMMIT, and a fresh reader verifies that no partial transaction was published.

### What you are learning

- **Failure classification:** SQLITE_FULL can come from an engine quota, not just a physically full disk.
- **Recovery evidence:** A nonzero exit alone is insufficient; inspect the expected error and committed state.
- **Policy ownership:** Reopen and retry with an explicit limit rather than assuming every connection inherited one.
- **Scope limit:** A database page quota is not a bound on WAL or journal bytes.

### Piece by piece

- **set -eu, printenv, case, dirname, test and mktemp -d** establish the disposable path and unique recovery-quota directory. The main lab database is untouched.
- **sqlite3 -bail** stops on a SQL error; it prevents COMMIT or later statements from masking the failed insert. The expected failing invocation is inside **set +e / set -e** so its status can be captured.
- **journal_mode=DELETE and page_size=1024** establish rollback mode and 1 KiB pages before populating the new database.
- **max_page_count=12** is installed again in the actual filling connection. Reading it on a newly opened connection without setting it would not prove what the failing connection enforced.
- **BEGIN IMMEDIATE and WITH RECURSIVE** create one 100-row transaction. **hex(randomblob(700))** produces 1,400-character payloads large enough to exceed the bound.
- **failure.log, cat and grep -qi** preserve and classify database or disk is full. -q suppresses the match and -i ignores capitalization; an unrelated SQL error is not accepted.
- **Fresh count and integrity_check assertions** require zero committed rows and ok. Because the failing CLI closes, this proves durable transaction outcome, not whether a still-open driver's transaction was automatically rolled back at the instant of error.
- **max_page_count=240** in the retry connection admits the same bounded logical rows. Reopened diagnostics explicitly install the limit they report rather than infer persistence.
- **page_count, integrity_check, count(*) and stat -c %s** verify growth beyond 12 pages, 100 committed rows, sound structure and positive main-file length. They do not measure total filesystem pressure.`,
      code: code`
set -eu
db=$(printenv TUTOR_SQLITE_DB || true)
if [ -z "$db" ]; then echo 'TUTOR_SQLITE_DB must be nonempty' >&2; exit 2; fi
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
lab_dir=$(dirname -- "$db")
if [ "$lab_dir" = / ] || [ ! -d "$lab_dir" ] || [ ! -w "$lab_dir" ]; then echo 'database parent must be an existing writable non-root directory' >&2; exit 2; fi
scratch=$(mktemp -d "$lab_dir/recovery-quota.XXXXXX")
quota_db=$scratch/storage-quota.sqlite
echo "evidence_dir=$scratch"
rm -f "$quota_db" "$quota_db-journal" "$quota_db-wal" "$quota_db-shm"
sqlite3 -bail "$quota_db" <<'SQL'
PRAGMA journal_mode=DELETE;
PRAGMA page_size=1024;
CREATE TABLE quota_rows(id INTEGER PRIMARY KEY, payload TEXT NOT NULL);
PRAGMA max_page_count=12;
SQL
echo "quota_db=$quota_db"
echo "initial_limit=$(sqlite3 "$quota_db" 'PRAGMA max_page_count=12; SELECT max_page_count FROM pragma_max_page_count' | tail -n 1) initial_pages=$(sqlite3 "$quota_db" 'PRAGMA page_count')"
set +e
sqlite3 -bail "$quota_db" >"$scratch/failure.log" 2>&1 <<'SQL'
PRAGMA max_page_count=12;
BEGIN IMMEDIATE;
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 100)
INSERT INTO quota_rows SELECT x, hex(randomblob(700)) FROM n;
COMMIT;
SQL
quota_status=$?
set -e
cat "$scratch/failure.log"
grep -qi 'database or disk is full' "$scratch/failure.log" || { echo 'expected SQLITE_FULL evidence missing' >&2; exit 1; }
[ "$(sqlite3 "$quota_db" 'SELECT count(*) FROM quota_rows;')" -eq 0 ]
[ "$(sqlite3 "$quota_db" 'PRAGMA integrity_check;')" = ok ]
echo "quota_insert_exit=$quota_status"
echo "after_failure=$(sqlite3 "$quota_db" 'PRAGMA integrity_check; SELECT count(*) AS rows_after_failure FROM quota_rows; SELECT page_count FROM pragma_page_count;')"
if [ "$quota_status" -eq 0 ]; then echo 'quota_failure=not-observed' >&2; exit 1; fi
sqlite3 -bail "$quota_db" <<'SQL'
PRAGMA max_page_count=240;
BEGIN IMMEDIATE;
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 100)
INSERT INTO quota_rows SELECT x, hex(randomblob(700)) FROM n;
COMMIT;
SQL
echo "recovered_limit=$(sqlite3 "$quota_db" 'PRAGMA max_page_count=240; SELECT max_page_count FROM pragma_max_page_count' | tail -n 1) recovered_pages=$(sqlite3 "$quota_db" 'PRAGMA page_count')"
sqlite3 "$quota_db" 'PRAGMA integrity_check; SELECT count(*) AS rows_after_recovery FROM quota_rows;'
stat -c 'quota_file_bytes=%s' "$quota_db"
[ "$(sqlite3 "$quota_db" 'SELECT count(*) FROM quota_rows;')" -eq 100 ]
[ "$(sqlite3 "$quota_db" 'PRAGMA integrity_check;')" = ok ]
echo "quota_evidence=$scratch (retained for inspection)"
      `,
      expectedResult:
        code`The evidence names a disposable storage-quota.sqlite, reports an initial 12-page limit, and the first insert exits nonzero with SQLITE_FULL (the exact CLI wording may include "database or disk is full"). The post-failure integrity check is ok and rows_after_failure is 0: no partial domain effect is accepted. After the quota is raised to 240 pages, the same 100 rows commit, recovered_pages is greater than 12, integrity_check is ok, rows_after_recovery is 100, and quota_file_bytes is positive. This is a SQLite page quota; it is not proof of host ENOSPC, a WAL-size bound, or corruption.`,
      systemsLens:
        "The same error family can identify different exhausted resources. Diagnose the owner and the bound before retrying or deleting anything. An embedded application's storage budget includes main pages, transient journals/WAL and recovery headroom; one pager quota is only part of that capacity contract.",
      challenge:
        code`Set the bound below the schema's minimum and observe which DDL statement fails. Then repeat in WAL mode and measure main-file, -wal, and max_page_count separately; explain why a WAL file can grow even when the main database is at its page bound.`,
      caution:
        code`The script deletes only its uniquely named quota database. Keep TUTOR_SQLITE_DB pointed at a disposable lab path, and do not treat an SQLITE_FULL result as permission to delete files or reclaim host storage.`,
      revision: 1,
      minVersion: "3.53.4",
    },
    {
      slug: "recover-damaged-copy",
      title: "Recovery maximizes salvage, while backups provide guarantees",
      difficulty: "advanced",
      tags: ["recovery", "integrity-check", "incident", "rpo", "rto"],
      prerequisites: ["bounded-storage-failure"],
      safetyLevel: "dangerous",
      runIn: "mixed",
      sessions: 1,
      estimatedMinutes: 25,
      overview:
        "Damage one leaf page of a lab copy, observe failed reads, then salvage readable key ranges into a separate output. Compare missing ranges with the intact source and inspect .recover as another recovery path. The point is to measure what survived, not to turn a successful salvage command into a recovery guarantee.",
      syntaxBreakdown: code`### In plain terms

This is a salvage experiment, not a promise that corruption is recoverable. We preserve the source, zero one leaf page in a copy, measure which reads fail, and copy only readable key ranges into a fresh destination. A structural recovery utility is attempted as additional evidence, while the intact source remains the authoritative comparison.

### What you are learning

- **Evidence preservation** — opening a hot or damaged file can change recovery artifacts, so copy before inspection.
- **B-tree locality** — intact interior routing can make ranges away from one damaged leaf readable.
- **Salvage versus guarantee** — recovered rows are counted and checked; only a verified backup supplies a stated RPO/RTO guarantee.

### Piece by piece

- **dbstat** (SQLite virtual table)
  - What it is: exposes page-level records such as object name, page number, and page type when enabled.
  - What it does here: counts observation leaf pages and selects a deterministic second leaf.
  - What it gives us: leaf_pages, damaged_leaf_page, and a page number for the byte edit.
- **PRAGMA page_size** (SQL diagnostic)
  - What it is: reports bytes per database page.
  - What it does here: converts a page number to a byte offset.
  - What it gives us: the dd seek calculation; do not assume the page size from an earlier lesson.
- **cp** (shell byte-copy program)
  - What it is: duplicates the source before the dangerous operation.
  - What it does here: creates the only file that will be modified.
  - What it gives us: preserved source evidence for the final integrity and row-count check.
- **dd if=/dev/zero ... bs=1 seek=... count=256 conv=notrunc** (shell byte editor)
  - What it is: reads zero bytes, writes a bounded 256-byte region at a byte offset, and preserves file length.
  - What it does here: damages one copy's selected leaf-page header.
  - What it gives us: a reproducible malformed-page failure without touching the source.
- **PRAGMA quick_check** (structural diagnostic)
  - What it is: a fast page/B-tree consistency check.
  - What it does here: observes the damaged copy before range salvage.
  - What it gives us: the page error and nonzero tool status expected from corruption.
- **WHERE id BETWEEN ...** (range predicate)
  - What it is: constrains each salvage query to a bounded primary-key interval.
  - What it does here: lets intact B-tree paths succeed while intervals touching the damaged leaf fail.
  - What it gives us: explicit chunk ... unreadable lines and a measurable omission set.
- **ATTACH FILE AS rec** (SQLite connection command)
  - What it is: opens a second database file in the same process under a schema name.
  - What it does here: inserts readable source rows into rec.observations.
  - What it gives us: an independent recovered file; it is not a repair of the damaged source.
- **.recover** (sqlite3 CLI recovery command)
  - What it is: asks the CLI's recovery extension to generate SQL from pages it can interpret.
  - What it does here: records availability and output size without trusting it as complete.
  - What it gives us: capability evidence and a second salvage path to compare with range salvage.
- **wc -l** (shell line-count utility)
  - What it is: counts newline-delimited output lines.
  - What it does here: measures generated recovery SQL without printing the whole artifact.
  - What it gives us: a positive line count when sqlite_dbpage is enabled.
- **PRAGMA integrity_check** (structural diagnostic)
  - What it is: validates the recovered and untouched source files.
  - What it does here: gates trust in the recovered destination and confirms source preservation.
  - What it gives us: ok plus row counts and min/max IDs for loss accounting.`,
      setup: code`.print -- close every other sqlite3 session first: the next line must print delete
PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS observations;
CREATE TABLE observations(id INTEGER PRIMARY KEY, reading TEXT NOT NULL);
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<3000)
INSERT INTO observations SELECT x, printf('reading-%04d', x) FROM n;`,
      code: code`-- Session A
.shell rm -f "$TUTOR_SQLITE_DB.damaged.db" "$TUTOR_SQLITE_DB.recovered.db" "$TUTOR_SQLITE_DB.recover.sql" "$TUTOR_SQLITE_DB.recover.err"
.shell cp "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB.damaged.db"
.shell sqlite3 "$TUTOR_SQLITE_DB.damaged.db" "SELECT 'leaf_pages=' || count(*) FROM dbstat WHERE name='observations' AND pagetype='leaf';"
.shell page=$(sqlite3 "$TUTOR_SQLITE_DB.damaged.db" "SELECT pageno FROM dbstat WHERE name='observations' AND pagetype='leaf' ORDER BY pageno LIMIT 1 OFFSET 1"); psz=$(sqlite3 "$TUTOR_SQLITE_DB.damaged.db" 'PRAGMA page_size'); echo "damaged_leaf_page=$page page_size=$psz"; dd if=/dev/zero of="$TUTOR_SQLITE_DB.damaged.db" bs=1 seek=$(( (page - 1) * psz )) count=256 conv=notrunc status=none
.shell sqlite3 "$TUTOR_SQLITE_DB.damaged.db" "PRAGMA quick_check; SELECT 'full_scan_rows', count(*) FROM observations;"
.shell sqlite3 "$TUTOR_SQLITE_DB.recovered.db" "CREATE TABLE observations(id INTEGER PRIMARY KEY, reading TEXT NOT NULL);"
.shell for start in $(seq 1 100 3000); do end=$((start + 99)); sqlite3 "$TUTOR_SQLITE_DB.damaged.db" "ATTACH '$TUTOR_SQLITE_DB.recovered.db' AS rec; INSERT INTO rec.observations SELECT id, reading FROM observations WHERE id BETWEEN $start AND $end;" 2>/dev/null || echo "chunk $start-$end unreadable"; done
.shell sqlite3 "$TUTOR_SQLITE_DB.recovered.db" "PRAGMA integrity_check; SELECT 'recovered_rows', count(*), min(id), max(id) FROM observations;"
.shell if sqlite3 "$TUTOR_SQLITE_DB.damaged.db" .recover >"$TUTOR_SQLITE_DB.recover.sql" 2>"$TUTOR_SQLITE_DB.recover.err"; then echo "recover_available=yes sql_lines=$(wc -l <$TUTOR_SQLITE_DB.recover.sql)"; else echo recover_available=no; head -c 120 "$TUTOR_SQLITE_DB.recover.err"; echo; fi
.shell sqlite3 "$TUTOR_SQLITE_DB" "PRAGMA integrity_check; SELECT 'source_rows', count(*) FROM observations;"
      `,
      expectedResult:
        "At 1 KiB pages the fixture has roughly 60 leaves; at 4 KiB roughly 15. The selected copied leaf produces malformed-page/quick_check errors and failed full scanning. Each unreadable 100-row range is omitted, so recovered rows equal 3000 minus 100 per failed range: validated examples were 2900 at 1 KiB and 2700 at 4 KiB. The recovered output is structurally ok; .recover generates nonempty SQL on this build but that line count is not recovered-row completeness. The intact source remains ok with 3000 observation rows.",
      systemsLens:
        "Surviving structure determines what salvage can reach, and coarse extraction boundaries can lose more rows than the damaged bytes alone would suggest. A validated backup plus a rehearsed retrieval/restore process supports a recovery objective; salvage is a contingent fallback. An integrity-valid restored replica may still need the history repair taught in module 08.",
      challenge:
        code`Zero the table's root page (rootpage in sqlite_schema) instead of a leaf and rerun the chunk loop. Explain why the salvage rate collapses even though most leaf bytes are untouched, and what that says about where backups must be verified.`,
      studyCheckpoint: {
        core: [
          {
            source: "[SQLite Backup API](https://sqlite.org/backup.html)",
            locator:
              "Sections 1 (Using the SQLite Online Backup API), 1.1 (Other Backup Techniques), and 3.1 (File and Database Connection Locking)",
          },
          {
            source:
              "[How To Corrupt An SQLite Database File](https://sqlite.org/howtocorrupt.html)",
            locator:
              "Sections 1.2 (Backup or restore while a transaction is active), 1.3 (Deleting a hot journal), and 1.4 (Mispairing database files and hot journals)",
          },
        ],
        optionalDepth: [
          {
            source:
              "[How To Corrupt An SQLite Database File](https://sqlite.org/howtocorrupt.html)",
            locator:
              "Sections 2.1 (Filesystems with broken or missing lock implementations), 2.5 (Unlinking or renaming a database file while in use), and 3.2 (Disabling sync using PRAGMAs)",
          },
        ],
        rationale:
          "Across lessons 32–37 you saw a main-file copy miss live WAL state, created engine-coordinated snapshots, checked both structural and domain integrity, recovered from a bounded page quota, and measured salvage from a damaged copy. Read these excerpts before continuing to distinguish a consistent backup from byte copying or salvage, and to understand why live journals and their database file must remain paired.",
      },
      caution:
        "Only the reserved TUTOR_SQLITE_DB.damaged.db copy is byte-edited; reruns overwrite named damaged/recovered/recover-output lab artifacts. Preserve the original source and never point dd at it. Inspect errors from every salvage range: an unrelated execution error is not evidence of a corrupt range.",
      revision: 3,
      minVersion: "3.53.4",
    },
  ],
};
