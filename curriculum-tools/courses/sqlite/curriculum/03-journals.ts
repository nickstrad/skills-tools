import { code, type Module } from "../../../src/types.ts";

export const JOURNALS: Module = {
  category: "journals",
  title: "Atomic commit, journals, and durability",
  lessons: [
    {
      slug: "rollback-journal-lifecycle",
      title: "Observe a rollback journal lifecycle",
      difficulty: "intermediate",
      tags: ["rollback-journal", "transactions", "atomicity"],
      prerequisites: ["freelist-vacuum-and-reuse"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      overview:
        code`Hold a rollback-mode write transaction open and inspect the sidecar journal before rollback and commit.`,
      syntaxBreakdown:
        code`PRAGMA journal_mode=DELETE selects rollback journaling; BEGIN IMMEDIATE reserves the writer; .shell ls inspects sidecar files; ROLLBACK and COMMIT finish the transaction.`,
      setup: code`PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS journal_rows;
CREATE TABLE journal_rows(id INTEGER PRIMARY KEY, payload TEXT);
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 200) INSERT INTO journal_rows SELECT x, 'baseline' FROM n;`,
      code: code`-- Session A
PRAGMA journal_mode=DELETE;
BEGIN IMMEDIATE;
UPDATE journal_rows SET payload='uncommitted-update' WHERE id <= 150;

-- Session B
.shell ls -l "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB-journal"
.shell sqlite3 "$TUTOR_SQLITE_DB" "SELECT 'b_visible_uncommitted=' || count(*) FROM journal_rows WHERE payload='uncommitted-update';"

-- Session A
ROLLBACK;

-- Session B
.shell if [ -e "$TUTOR_SQLITE_DB-journal" ]; then stat -c 'after_rollback journal_bytes=%s' "$TUTOR_SQLITE_DB-journal"; else echo 'after_rollback journal_absent'; fi
.shell sqlite3 "$TUTOR_SQLITE_DB" "SELECT 'b_after_rollback_uncommitted=' || count(*) FROM journal_rows WHERE payload='uncommitted-update';"

-- Session A
BEGIN IMMEDIATE;
UPDATE journal_rows SET payload='committed-update' WHERE id <= 150;
COMMIT;

-- Session B
.shell if [ -e "$TUTOR_SQLITE_DB-journal" ]; then stat -c 'after_commit journal_bytes=%s' "$TUTOR_SQLITE_DB-journal"; else echo 'after_commit journal_absent'; fi
.shell sqlite3 "$TUTOR_SQLITE_DB" "SELECT 'b_committed_update=' || count(*) FROM journal_rows WHERE payload='committed-update';"`,
      expectedResult:
        code`While A's transaction is open, B sees a nonempty journal and b_visible_uncommitted = 0. After rollback, b_after_rollback_uncommitted = 0; after a committed update, b_committed_update = 150. In DELETE mode the sidecar is normally absent after rollback and commit.`,
      systemsLens:
        code`Transaction state is represented by files outside the main database. Atomicity is a protocol of before-images, locks, write ordering, and cleanup—not a property supplied by SQL syntax alone.`,
      challenge:
        code`Repeat with one updated page and then many updated pages; compare journal size and explain why the journal tracks before-images.`,
    },
    {
      slug: "journal-modes",
      title: "Compare rollback journal cleanup modes",
      difficulty: "intermediate",
      tags: ["journal-modes", "rollback-journal", "atomicity"],
      prerequisites: ["rollback-journal-lifecycle"],
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 18,
      revision: 2,
      overview:
        code`Run bounded writes under DELETE, TRUNCATE, and PERSIST, observing sidecar existence and size while checking that committed logical data is equivalent.`,
      syntaxBreakdown:
        code`DELETE removes the journal; TRUNCATE leaves a zero-length sidecar; PERSIST keeps the file but clears its header. PRAGMA journal_mode returns the selected mode.`,
      setup: code`DROP TABLE IF EXISTS mode_rows;
CREATE TABLE mode_rows(mode TEXT, value INTEGER);`,
      code: code`DELETE FROM mode_rows;
PRAGMA journal_mode=DELETE;
BEGIN;
INSERT INTO mode_rows VALUES ('DELETE', 1), ('DELETE', 2);
COMMIT;
.shell if [ -e "$TUTOR_SQLITE_DB-journal" ]; then stat -c 'DELETE exists bytes=%s' "$TUTOR_SQLITE_DB-journal"; else echo 'DELETE absent'; fi

PRAGMA journal_mode=TRUNCATE;
BEGIN;
INSERT INTO mode_rows VALUES ('TRUNCATE', 1), ('TRUNCATE', 2);
COMMIT;
.shell if [ -e "$TUTOR_SQLITE_DB-journal" ]; then stat -c 'TRUNCATE exists bytes=%s' "$TUTOR_SQLITE_DB-journal"; else echo 'TRUNCATE absent'; fi

PRAGMA journal_mode=PERSIST;
BEGIN;
INSERT INTO mode_rows VALUES ('PERSIST', 1), ('PERSIST', 2);
COMMIT;
.shell if [ -e "$TUTOR_SQLITE_DB-journal" ]; then stat -c 'PERSIST exists bytes=%s' "$TUTOR_SQLITE_DB-journal"; else echo 'PERSIST absent'; fi

.headers on
SELECT mode, count(*) AS rows FROM mode_rows GROUP BY mode ORDER BY mode;
.print -- restore DELETE so later lessons start from the default mode
PRAGMA journal_mode=DELETE;
.shell if [ -e "$TUTOR_SQLITE_DB-journal" ]; then stat -c 'after_reset exists bytes=%s' "$TUTOR_SQLITE_DB-journal"; else echo 'after_reset absent'; fi`,
      expectedResult:
        code`All three transactions commit their rows. DELETE normally prints journal absent; TRUNCATE prints an existing journal with bytes=0; PERSIST prints an existing nonzero-sized journal whose contents are reset for reuse. The final query reports exactly two rows for each of DELETE, PERSIST, and TRUNCATE. The closing PRAGMA journal_mode=DELETE prints delete, and the last check prints "after_reset absent": returning to DELETE removes the persisted journal, so later lessons start from the default mode with no stale sidecar.`,
      systemsLens:
        code`Cleanup strategy is independent from the higher-level atomicity interface until failure occurs. The mode changes when and how sidecar space is reclaimed, not whether a committed transaction has one logical outcome.`,
      caution:
        code`MEMORY and OFF are useful to discuss but are intentionally not used here: they weaken crash-recovery guarantees and are unsuitable for durable state without a separately justified contract.`,
    },
    {
      slug: "crash-leaves-hot-journal",
      title: "Preserve a hot journal after a crash",
      difficulty: "advanced",
      tags: ["rollback-journal", "crash-recovery", "incident"],
      prerequisites: ["journal-modes"],
      safetyLevel: "dangerous",
      runIn: "shell",
      estimatedMinutes: 20,
      overview:
        code`Use a disposable copy, kill a writer while its rollback transaction is active, and preserve the main file plus journal before any connection can trigger recovery.`,
      syntaxBreakdown:
        code`A FIFO keeps sqlite3 stdin open; BEGIN IMMEDIATE starts a writer; kill -KILL simulates abrupt process termination; cp preserves evidence.`,
      code: code`
set -eu
if [ -z "${"$"}{TUTOR_SQLITE_DB:-}" ]; then echo 'set TUTOR_SQLITE_DB to an absolute disposable path'; exit 2; fi
TUTOR_SQLITE_DB=${"$"}{TUTOR_SQLITE_DB}
case "$TUTOR_SQLITE_DB" in /*) ;; *) echo 'TUTOR_SQLITE_DB must be absolute'; exit 2;; esac
case "$TUTOR_SQLITE_DB" in *.db) ;; *) echo 'TUTOR_SQLITE_DB must end in .db'; exit 2;; esac
PARENT_DIR=$(dirname "$TUTOR_SQLITE_DB")
if [ "$PARENT_DIR" = / ] || [ ! -d "$PARENT_DIR" ] || [ ! -w "$PARENT_DIR" ]; then echo 'database parent must be an existing writable non-root directory'; exit 2; fi
mkdir -p "$(dirname "$TUTOR_SQLITE_DB")"
rm -f "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB-journal" "$TUTOR_SQLITE_DB.hot-main" "$TUTOR_SQLITE_DB.hot-main-journal" "$TUTOR_SQLITE_DB.commands"
sqlite3 "$TUTOR_SQLITE_DB" <<'SQL'
PRAGMA journal_mode=DELETE;
PRAGMA page_size=1024;
VACUUM;
CREATE TABLE crash_rows(id INTEGER PRIMARY KEY, payload TEXT);
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 500) INSERT INTO crash_rows SELECT x, 'committed-' || hex(randomblob(2500)) FROM n;
SQL
mkfifo "$TUTOR_SQLITE_DB.commands"
sqlite3 "$TUTOR_SQLITE_DB" <"$TUTOR_SQLITE_DB.commands" >"$TUTOR_SQLITE_DB.writer.log" 2>&1 &
WRITER_PID=$!
exec 3>"$TUTOR_SQLITE_DB.commands"
echo "PRAGMA cache_size=10; PRAGMA cache_spill=ON; BEGIN IMMEDIATE; UPDATE crash_rows SET payload='dirty-' || printf('%08d', id) || hex(randomblob(2500)); SELECT 'WRITER_READY';" >&3
until grep -q WRITER_READY "$TUTOR_SQLITE_DB.writer.log"; do sleep 0.05; done
SPILLED=0
for attempt in $(seq 1 100); do
  SPILLED=$(grep -a -o 'dirty-' "$TUTOR_SQLITE_DB" | wc -l || true)
  [ "$SPILLED" -gt 0 ] && break
  sleep 0.05
done
if [ "$SPILLED" -le 0 ]; then kill -KILL "$WRITER_PID" 2>/dev/null || true; wait "$WRITER_PID" 2>/dev/null || true; echo 'dirty-page spill was not observed'; exit 3; fi
JOURNAL_MAGIC=$(xxd -p -l 8 "$TUTOR_SQLITE_DB-journal")
if [ "$JOURNAL_MAGIC" != d9d505f920a163d7 ]; then kill -KILL "$WRITER_PID" 2>/dev/null || true; wait "$WRITER_PID" 2>/dev/null || true; echo "unexpected journal magic=$JOURNAL_MAGIC"; exit 3; fi
printf 'pre_kill_dirty_rows=%s\n' "$SPILLED"
printf 'pre_kill_journal_magic=%s\n' "$JOURNAL_MAGIC"
kill -KILL "$WRITER_PID"
wait "$WRITER_PID" 2>/dev/null || true
cp "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB.hot-main"
cp "$TUTOR_SQLITE_DB-journal" "$TUTOR_SQLITE_DB.hot-main-journal"
stat -c 'preserved_main_bytes=%s' "$TUTOR_SQLITE_DB.hot-main"
stat -c 'preserved_journal_bytes=%s' "$TUTOR_SQLITE_DB.hot-main-journal"
rm -f "$TUTOR_SQLITE_DB.commands"
      `,
      expectedResult:
        code`The writer is terminated while its transaction is uncommitted. Before SIGKILL, pre_kill_dirty_rows is greater than zero and pre_kill_journal_magic is d9d505f920a163d7, the rollback-journal magic. Two preserved files exist: TUTOR_SQLITE_DB.hot-main and a nonempty TUTOR_SQLITE_DB.hot-main-journal. Evidence is saved before any normal open of the crashed copy can roll it back.`,
      systemsLens:
        code`A crash experiment has an evidence-ordering requirement: preserve the file set before recovery mutates it. Process termination demonstrates crash recovery, not a power-loss durability guarantee.`,
      caution:
        code`Run only with a uniquely named disposable TUTOR_SQLITE_DB. The command deliberately sends SIGKILL and leaves a preserved evidence pair; do not point it at production.`,
    },
    {
      slug: "hot-journal-recovery",
      title: "Recover a hot journal deterministically",
      difficulty: "advanced",
      tags: ["crash-recovery", "rollback-journal", "integrity-check"],
      prerequisites: ["crash-leaves-hot-journal"],
      safetyLevel: "dangerous",
      runIn: "shell",
      estimatedMinutes: 12,
      overview:
        code`Open the preserved crashed copy once, allowing SQLite to roll back its before-images, then run integrity and domain checks on the recovered result.`,
      syntaxBreakdown:
        code`sqlite3 opens the hot copy and performs automatic rollback; PRAGMA integrity_check validates structure; domain queries validate application state.`,
      code: code`
set -eu
if [ -z "${"$"}{TUTOR_SQLITE_DB:-}" ]; then echo 'set TUTOR_SQLITE_DB to an absolute disposable path'; exit 2; fi
TUTOR_SQLITE_DB=${"$"}{TUTOR_SQLITE_DB}
case "$TUTOR_SQLITE_DB" in /*) ;; *) echo 'TUTOR_SQLITE_DB must be absolute'; exit 2;; esac
case "$TUTOR_SQLITE_DB" in *.db) ;; *) echo 'TUTOR_SQLITE_DB must end in .db'; exit 2;; esac
PARENT_DIR=$(dirname "$TUTOR_SQLITE_DB")
if [ "$PARENT_DIR" = / ] || [ ! -d "$PARENT_DIR" ] || [ ! -w "$PARENT_DIR" ]; then echo 'database parent must be an existing writable non-root directory'; exit 2; fi
[ -s "$TUTOR_SQLITE_DB.hot-main" ] || { echo 'preserved hot-main evidence is missing or empty'; exit 2; }
[ -s "$TUTOR_SQLITE_DB.hot-main-journal" ] || { echo 'preserved hot journal evidence is missing or empty'; exit 2; }
sqlite3 "$TUTOR_SQLITE_DB.hot-main" <<'SQL'
.headers on
.mode box
PRAGMA integrity_check;
SELECT count(*) AS rows, min(substr(payload, 1, 10)) AS minimum_prefix, max(substr(payload, 1, 10)) AS maximum_prefix FROM crash_rows;
SELECT count(*) AS uncommitted_rows_visible FROM crash_rows WHERE payload LIKE 'dirty-%';
SQL
if [ -e "$TUTOR_SQLITE_DB.hot-main-journal" ]; then stat -c 'post_recovery_journal_bytes=%s' "$TUTOR_SQLITE_DB.hot-main-journal"; else echo 'post_recovery_journal_absent'; fi
      `,
      expectedResult:
        code`Opening the hot copy automatically rolls back the interrupted update. integrity_check prints ok; rows = 500; uncommitted_rows_visible = 0; and payload values are committed. The preserved journal is consumed or invalidated after recovery (typically absent or zero-length), while the recovered database state is the primary check.`,
      systemsLens:
        code`Recovery is a deterministic state transition driven by durable metadata and before-images. A verified backup is the recovery guarantee; a successful salvage run is evidence about one incident, not a promise for every failure.`,
      caution:
        code`This lesson mutates the preserved copy by design. Keep the original evidence pair untouched if you need to inspect it again.`,
    },
    {
      slug: "synchronous-contracts",
      title: "Observe synchronization contracts",
      difficulty: "advanced",
      tags: ["synchronous", "fsync", "durability"],
      prerequisites: ["hot-journal-recovery"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 20,
      overview:
        code`Use strace to compare synchronization calls for bounded FULL, NORMAL, and OFF rollback-mode workloads. Treat the trace as an observation of the contract, not a timing benchmark.`,
      syntaxBreakdown:
        code`strace -e trace=fsync,fdatasync records synchronization syscalls; -o writes a trace file; PRAGMA synchronous selects durability behavior; grep -c counts observed calls.`,
      code: code`
set -eu
if [ -z "${"$"}{TUTOR_SQLITE_DB:-}" ]; then echo 'set TUTOR_SQLITE_DB to an absolute disposable path'; exit 2; fi
TUTOR_SQLITE_DB=${"$"}{TUTOR_SQLITE_DB}
case "$TUTOR_SQLITE_DB" in /*) ;; *) echo 'TUTOR_SQLITE_DB must be absolute'; exit 2;; esac
case "$TUTOR_SQLITE_DB" in *.db) ;; *) echo 'TUTOR_SQLITE_DB must end in .db'; exit 2;; esac
PARENT_DIR=$(dirname "$TUTOR_SQLITE_DB")
if [ "$PARENT_DIR" = / ] || [ ! -d "$PARENT_DIR" ] || [ ! -w "$PARENT_DIR" ]; then echo 'database parent must be an existing writable non-root directory'; exit 2; fi
command -v strace
rm -f "$TUTOR_SQLITE_DB-FULL" "$TUTOR_SQLITE_DB-NORMAL" "$TUTOR_SQLITE_DB-OFF" "$TUTOR_SQLITE_DB-FULL.trace" "$TUTOR_SQLITE_DB-NORMAL.trace" "$TUTOR_SQLITE_DB-OFF.trace" "$TUTOR_SQLITE_DB-FULL.time" "$TUTOR_SQLITE_DB-NORMAL.time" "$TUTOR_SQLITE_DB-OFF.time"
 /usr/bin/time -f '%e' -o "$TUTOR_SQLITE_DB-FULL.time" strace -qq -f -e trace=fsync,fdatasync -o "$TUTOR_SQLITE_DB-FULL.trace" sqlite3 "$TUTOR_SQLITE_DB-FULL" "PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE t(x); BEGIN; WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 200) INSERT INTO t SELECT x FROM n; COMMIT;"
 /usr/bin/time -f '%e' -o "$TUTOR_SQLITE_DB-NORMAL.time" strace -qq -f -e trace=fsync,fdatasync -o "$TUTOR_SQLITE_DB-NORMAL.trace" sqlite3 "$TUTOR_SQLITE_DB-NORMAL" "PRAGMA journal_mode=DELETE; PRAGMA synchronous=NORMAL; CREATE TABLE t(x); BEGIN; WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 200) INSERT INTO t SELECT x FROM n; COMMIT;"
 /usr/bin/time -f '%e' -o "$TUTOR_SQLITE_DB-OFF.time" strace -qq -f -e trace=fsync,fdatasync -o "$TUTOR_SQLITE_DB-OFF.trace" sqlite3 "$TUTOR_SQLITE_DB-OFF" "PRAGMA journal_mode=DELETE; PRAGMA synchronous=OFF; CREATE TABLE t(x); BEGIN; WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 200) INSERT INTO t SELECT x FROM n; COMMIT;"
printf 'FULL sync_calls='; grep -Ec 'fsync|fdatasync' "$TUTOR_SQLITE_DB-FULL.trace" || true
printf 'NORMAL sync_calls='; grep -Ec 'fsync|fdatasync' "$TUTOR_SQLITE_DB-NORMAL.trace" || true
printf 'OFF sync_calls='; grep -Ec 'fsync|fdatasync' "$TUTOR_SQLITE_DB-OFF.trace" || true
printf 'FULL elapsed_seconds='; cat "$TUTOR_SQLITE_DB-FULL.time"
printf 'NORMAL elapsed_seconds='; cat "$TUTOR_SQLITE_DB-NORMAL.time"
printf 'OFF elapsed_seconds='; cat "$TUTOR_SQLITE_DB-OFF.time"
      `,
      expectedResult:
        code`On the validated SQLite 3.53.4 run, strace recorded FULL=8, NORMAL=6, and OFF=0 synchronization calls, with elapsed times of about 0.09s, 0.04s, and 0.04s respectively. Repeat runs may vary with filesystem, kernel, and load; treat these as evidence from one bounded run, not universal ratios or a power-loss simulation.`,
      systemsLens:
        code`Acknowledgement latency buys a specific persistence contract. Observed sync ordering is evidence of what the engine requested from this filesystem, not an abstract guarantee independent of filesystem and hardware behavior.`,
      caution:
        code`No process-kill or power-loss claim follows from this lesson. Run on a disposable path and preserve trace files with the database files they describe.`,
      revision: 2,
    },
    {
      slug: "batching-changes-the-cost",
      title: "Measure the cost of transaction boundaries",
      difficulty: "intermediate",
      tags: ["transactions", "fsync", "write-amplification"],
      prerequisites: ["synchronous-contracts"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 20,
      overview:
        code`Insert the same bounded rows in autocommit and one explicit transaction, comparing elapsed time and synchronization-call counts.`,
      syntaxBreakdown:
        code`An autocommit statement is its own transaction; BEGIN/COMMIT groups statements; strace captures sync calls; awk generates deterministic SQL.`,
      code: code`
set -eu
if [ -z "${"$"}{TUTOR_SQLITE_DB:-}" ]; then echo 'set TUTOR_SQLITE_DB to an absolute disposable path'; exit 2; fi
TUTOR_SQLITE_DB=${"$"}{TUTOR_SQLITE_DB}
case "$TUTOR_SQLITE_DB" in /*) ;; *) echo 'TUTOR_SQLITE_DB must be absolute'; exit 2;; esac
case "$TUTOR_SQLITE_DB" in *.db) ;; *) echo 'TUTOR_SQLITE_DB must end in .db'; exit 2;; esac
PARENT_DIR=$(dirname "$TUTOR_SQLITE_DB")
if [ "$PARENT_DIR" = / ] || [ ! -d "$PARENT_DIR" ] || [ ! -w "$PARENT_DIR" ]; then echo 'database parent must be an existing writable non-root directory'; exit 2; fi
rm -f "$TUTOR_SQLITE_DB-autocommit" "$TUTOR_SQLITE_DB-batch" "$TUTOR_SQLITE_DB-autocommit.sql" "$TUTOR_SQLITE_DB-batch.sql" "$TUTOR_SQLITE_DB-autocommit.trace" "$TUTOR_SQLITE_DB-batch.trace" "$TUTOR_SQLITE_DB-autocommit.time" "$TUTOR_SQLITE_DB-batch.time"
echo 'PRAGMA journal_mode=DELETE; CREATE TABLE t(x INTEGER);' > "$TUTOR_SQLITE_DB-autocommit.sql"
awk 'BEGIN { for (i=1; i<=200; i++) print "INSERT INTO t VALUES (" i ");"; }' >> "$TUTOR_SQLITE_DB-autocommit.sql"
echo 'PRAGMA journal_mode=DELETE; CREATE TABLE t(x INTEGER); BEGIN;' > "$TUTOR_SQLITE_DB-batch.sql"
awk 'BEGIN { for (i=1; i<=200; i++) print "INSERT INTO t VALUES (" i ");"; }' >> "$TUTOR_SQLITE_DB-batch.sql"
echo 'COMMIT;' >> "$TUTOR_SQLITE_DB-batch.sql"
/usr/bin/time -f '%e' -o "$TUTOR_SQLITE_DB-autocommit.time" strace -qq -f -e trace=fsync,fdatasync -o "$TUTOR_SQLITE_DB-autocommit.trace" sqlite3 "$TUTOR_SQLITE_DB-autocommit" < "$TUTOR_SQLITE_DB-autocommit.sql"
/usr/bin/time -f '%e' -o "$TUTOR_SQLITE_DB-batch.time" strace -qq -f -e trace=fsync,fdatasync -o "$TUTOR_SQLITE_DB-batch.trace" sqlite3 "$TUTOR_SQLITE_DB-batch" < "$TUTOR_SQLITE_DB-batch.sql"
printf 'autocommit sync_calls='; grep -Ec 'fsync|fdatasync' "$TUTOR_SQLITE_DB-autocommit.trace" || true
printf 'batch sync_calls='; grep -Ec 'fsync|fdatasync' "$TUTOR_SQLITE_DB-batch.trace" || true
printf 'autocommit elapsed_seconds='; cat "$TUTOR_SQLITE_DB-autocommit.time"
printf 'batch elapsed_seconds='; cat "$TUTOR_SQLITE_DB-batch.time"
sqlite3 "$TUTOR_SQLITE_DB-autocommit" 'SELECT count(*) AS rows FROM t;'
sqlite3 "$TUTOR_SQLITE_DB-batch" 'SELECT count(*) AS rows FROM t;'
      `,
      expectedResult:
        code`Both databases report rows = 200. On the validated SQLite 3.53.4 run, autocommit recorded 804 sync calls and took about 6.54s, while batch recorded 8 sync calls and took about 0.07s. Filesystem, kernel, and load change elapsed time and counts; the durable lesson is the large transaction-boundary difference, and the larger batch is one larger unit of failure if it aborts.`,
      systemsLens:
        code`Group commit amortizes durability costs while enlarging the unit of failure. This is the same throughput-versus-recovery trade-off seen in logs, queues, and storage engines.`,
      challenge:
        code`Change 200 rows to 2000 and plot sync calls against row count; predict where measurement becomes dominated by other overhead.`,
      studyCheckpoint: {
        core: [
          {
            source: "[Atomic Commit In SQLite](https://sqlite.org/atomiccommit.html)",
            locator:
              `§§3.4–3.5, 3.7–3.11, 4.2, and 4.6: rollback-journal updates, database writes, synchronization, journal invalidation, and hot-journal recovery`,
          },
        ],
        optionalDepth: [
          {
            source:
              "[How To Corrupt An SQLite Database File](https://sqlite.org/howtocorrupt.html)",
            locator: `§§3.2 and 4.1 on disabling sync and non-powersafe flash controllers`,
          },
        ],
        rationale: code`
You just saw rollback journals appear and disappear, hot-journal recovery restore committed state,
sync-call differences under FULL/NORMAL/OFF, and batching amortize transaction-boundary work across
lessons 12–17. Read these rollback-mode sections to explain the required write and sync ordering
behind that evidence before moving on; this document does not describe WAL, and the corruption
material is optional operational context.
        `,
      },
      revision: 2,
    },
  ],
};
