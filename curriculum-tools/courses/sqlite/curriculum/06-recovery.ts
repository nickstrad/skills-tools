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
        code`Keep a source connection open with committed frames in WAL, copy only the main file, and compare the disposable destination with the source.`,
      syntaxBreakdown:
        code`The shell cp command copies bytes without asking SQLite for a consistent snapshot. The course REPL already opens TUTOR_SQLITE_DB; WAL mode stores recent committed pages in the -wal sidecar.`,
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
        code`B and A see source count 2 after the commit. The copy made while B keeps the source connection open sees only the baseline count 1 (or reports an unusable/incomplete state), demonstrating that main-file bytes alone are not a transactional snapshot. The source remains intact at count 2.`,
      systemsLens:
        code`Filesystem copying ignores transaction boundaries. A recovery point objective is meaningful only when the capture method coordinates with the engine's pager and all live sidecars.`,
      challenge:
        code`Repeat after a coordinated TRUNCATE checkpoint and compare the copy. Why does that make the copy less unsafe but still less flexible than online backup?`,
      caution:
        code`This intentionally unsafe exercise copies only a disposable source and never overwrites the original. Do not copy live SQLite files in production this way.`,
      revision: 1,
      minVersion: "3.45",
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
        code`Run SQLite's online .backup command while another connection performs bounded writes, then validate the destination independently.`,
      syntaxBreakdown:
        code`.backup FILE asks SQLite to copy pages through the backup API, coordinating with source locks and snapshots. integrity_check validates structural consistency after opening the destination.`,
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
        code`Online backup turns a moving file set into a consistent recovery artifact. The snapshot point defines RPO; the time to produce and restore it contributes to RTO.`,
      challenge:
        code`Close B, switch the lab to journal_mode=DELETE, and repeat the same sequence. In rollback mode B's COMMIT needs an EXCLUSIVE lock while the backup holds a SHARED lock. Predict which side waits this time, then explain what WAL removed and what it did not (the single writer).`,
      caution:
        code`A backup is only as current as its capture point; schedule and monitor it rather than treating it as continuous replication.`,
      revision: 1,
      minVersion: "3.45",
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
        code`Create free pages, then use VACUUM INTO to produce a separate compact database and compare size and logical contents.`,
      syntaxBreakdown:
        code`freelist_count reports pages available for reuse. VACUUM INTO rewrites a consistent database into a new filename without changing the source.`,
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
        code`A logical rewrite can combine snapshot creation and compaction, but it spends I/O and temporary space. Reuse, compaction, and backup are separate operational policies.`,
      challenge:
        code`Increase payload size and compare the size delta. At what point does rewrite cost exceed the space benefit for your workload?`,
      caution:
        code`The destination must not already exist; this lesson removes only its uniquely named disposable copy.`,
      revision: 1,
      minVersion: "3.45",
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
        code`Construct a structurally valid database with an orphan child row, then compare SQLite's structural checks with foreign-key and domain-level checks.`,
      syntaxBreakdown:
        code`quick_check samples structural invariants; integrity_check performs a deeper consistency check. foreign_key_check reports relational violations, while a domain query encodes business meaning.`,
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
        code`Consistency has layers: storage structure, relational constraints, and domain invariants. Monitoring only the first layer can declare a semantically broken database healthy.`,
      challenge:
        code`Add a CHECK constraint for allowed state values and compare what integrity_check can and cannot validate.`,
      caution:
        code`Foreign keys are connection settings; every writer must enable PRAGMA foreign_keys=ON rather than relying on a process-wide default.`,
      revision: 1,
      minVersion: "3.45",
    },
    {
      slug: "recover-damaged-copy",
      title: "Recovery maximizes salvage, while backups provide guarantees",
      difficulty: "advanced",
      tags: ["recovery", "integrity-check", "incident", "rpo", "rto"],
      prerequisites: ["integrity-and-domain-checks"],
      safetyLevel: "dangerous",
      runIn: "mixed",
      sessions: 1,
      estimatedMinutes: 25,
      overview:
        code`Preserve an original, corrupt one leaf page of a multi-page table in a uniquely named copy, watch structural checks and a full scan fail, then salvage every intact leaf by key range into a third database. The B-tree's own key routing is the salvage tool; .recover is tried as an optional extra.`,
      syntaxBreakdown:
        code`dbstat lists the table's leaf pages; dd zeroes the chosen page's header in the copy. A full scan must visit every leaf, but WHERE id BETWEEN a AND b descends only into leaves that hold that key range, so ranges that avoid the damaged leaf still read. ATTACH lets one INSERT ... SELECT move each readable range into the recovered file. .recover needs the sqlite_dbpage extension and is reported either way.`,
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
        code`leaf_pages is about 60 at a 1 KiB page size or about 15 at 4 KiB, and damaged_leaf_page names the leaf that was zeroed. quick_check on the copy reports a btreeInitPage error for that page and the full scan fails with database disk image is malformed (the CLI also notes that the system command returned a nonzero status). The chunk loop prints unreadable for only the 100-row ranges that touch the damaged leaf: one chunk at 1 KiB pages, two or three at 4 KiB depending on where the leaf boundary falls. The recovered file passes integrity_check and holds 3000 minus 100 per unreadable chunk (for example 2900 or 2800 rows), with min/max ids showing the surviving range. On the installed SQLite 3.45.1 build .recover prints recover_available=no followed by no such table: sqlite_dbpage; a build with that extension prints yes and a line count. The source still prints ok and source_rows|3000.`,
      systemsLens:
        code`Recovery tools maximize readable evidence after an incident: the structure that survives (here, key routing through intact interior pages) bounds what can be salvaged, and the loss is measured, not guessed. Only a verified, engine-coordinated backup can support a stated RPO/RTO restoration guarantee.`,
      challenge:
        code`Zero the table's root page (rootpage in sqlite_schema) instead of a leaf and rerun the chunk loop. Explain why the salvage rate collapses even though most leaf bytes are untouched, and what that says about where backups must be verified.`,
      caution:
        code`This deliberately corrupts only the uniquely named TUTOR_SQLITE_DB.damaged.db copy and preserves the source. Never point dd or .recover at a production database.`,
      revision: 2,
      minVersion: "3.45",
    },
  ],
};
