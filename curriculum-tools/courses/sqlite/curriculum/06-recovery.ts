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
      setup: code`PRAGMA journal_mode=DELETE;
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
        code`Run .backup while B holds a bounded write transaction. Which operation waits, and how does that differ from guessing an ordering of cp calls?`,
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
      setup: code`PRAGMA journal_mode=DELETE;
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
        code`Preserve an original, corrupt only a uniquely named copy, run checks, and use .recover to salvage readable rows into a third database.`,
      syntaxBreakdown:
        code`.recover emits SQL that reconstructs readable tables. .output redirects that SQL to a file, .read executes it, and dd changes selected bytes in the disposable copy.`,
      setup: code`PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS observations;
CREATE TABLE observations(id INTEGER PRIMARY KEY, reading TEXT NOT NULL);
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<40)
INSERT INTO observations SELECT x, printf('reading-%02d', x) FROM n;`,
      code: code`-- Session A
.shell rm -f "$TUTOR_SQLITE_DB.damaged.db" "$TUTOR_SQLITE_DB.recovered.db" "$TUTOR_SQLITE_DB.recover.sql" "$TUTOR_SQLITE_DB.recover.err" "$TUTOR_SQLITE_DB.recover.status" "$TUTOR_SQLITE_DB.dump.sql" "$TUTOR_SQLITE_DB.dump.err" "$TUTOR_SQLITE_DB.observations.present"
.shell cp "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB.damaged.db"
.shell dd if=/dev/zero of="$TUTOR_SQLITE_DB.damaged.db" bs=1 seek=4096 count=128 conv=notrunc
.shell sqlite3 "$TUTOR_SQLITE_DB.damaged.db" "PRAGMA quick_check; PRAGMA integrity_check;"
.shell sqlite3 "$TUTOR_SQLITE_DB.damaged.db" ".recover" >"$TUTOR_SQLITE_DB.recover.sql" 2>"$TUTOR_SQLITE_DB.recover.err"; rc=$?; echo recover_status=$rc; printf "%s" "$rc" >"$TUTOR_SQLITE_DB.recover.status"
.shell cat "$TUTOR_SQLITE_DB.recover.err"
.shell if grep -q sqlite_dbpage "$TUTOR_SQLITE_DB.recover.err"; then sqlite3 "$TUTOR_SQLITE_DB.damaged.db" ".dump" >"$TUTOR_SQLITE_DB.dump.sql" 2>"$TUTOR_SQLITE_DB.dump.err"; sqlite3 "$TUTOR_SQLITE_DB.recovered.db" <"$TUTOR_SQLITE_DB.dump.sql"; else sqlite3 "$TUTOR_SQLITE_DB.recovered.db" <"$TUTOR_SQLITE_DB.recover.sql"; fi
.shell sqlite3 "$TUTOR_SQLITE_DB.recovered.db" "PRAGMA integrity_check;"
.shell sqlite3 "$TUTOR_SQLITE_DB.recovered.db" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='observations';" >"$TUTOR_SQLITE_DB.observations.present"
.shell if grep -q '^1$' "$TUTOR_SQLITE_DB.observations.present"; then sqlite3 "$TUTOR_SQLITE_DB.recovered.db" "SELECT 'recovered observation rows', count(*) FROM observations;"; else echo 'recovered observation rows|0 (absent)'; fi
.shell sqlite3 "$TUTOR_SQLITE_DB" "PRAGMA integrity_check; SELECT 'source_rows', count(*) FROM observations;"
      `,
      expectedResult:
        code`The source remains untouched and the damaged copy's checks report corruption or an error. The lesson prints one recover_status=N line, captures .recover SQL and stderr, and then validates the third artifact. On builds with sqlite_dbpage, a successful .recover is loaded and prints recovered observation rows|N. On the installed SQLite 3.45.1 build, .recover prints recover_status=1 with stderr containing no such table: sqlite_dbpage; the documented .dump fallback yields integrity_check ok and recovered observation rows|0 (absent). The final source check prints ok and source_rows|40.`,
      systemsLens:
        code`Recovery tools maximize readable evidence after an incident; only a verified, engine-coordinated backup can support a stated RPO/RTO restoration guarantee.`,
      challenge:
        code`Run .recover against a copy damaged in a different page and compare which rows survive. Record the corruption location and salvage rate.`,
      caution:
        code`This deliberately corrupts only the uniquely named TUTOR_SQLITE_DB.damaged.db copy and preserves the source. Never point dd or .recover at a production database.`,
      revision: 1,
      minVersion: "3.45",
    },
  ],
};
