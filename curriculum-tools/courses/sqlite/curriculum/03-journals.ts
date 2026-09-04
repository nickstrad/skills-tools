import { code, type Module } from "../../../src/types.ts";

export const JOURNALS: Module = {
  category: "journals",
  title: "Atomic commit, journals, and durability",
  lessons: [
    {
      slug: "rollback-journal-lifecycle",
      revision: 1,
      title: "Observe a rollback journal lifecycle",
      difficulty: "intermediate",
      tags: ["rollback-journal", "transactions", "atomicity"],
      prerequisites: ["freelist-vacuum-and-reuse"],
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      overview:
        "Hold an uncommitted update and compare its physical journal with what a second connection can read. Then contrast rollback and commit of the same 150-row change. PostgreSQL's transaction guarantees are familiar; the new evidence is SQLite's per-file before-image protocol.",
      syntaxBreakdown: code`### In plain terms

A rollback journal holds original page contents so SQLite can undo an interrupted change to the main database. Its existence does not mean those changes are committed or visible to another connection. We observe both files and rows because neither alone explains the transaction state.

### What you are learning

- **Undo evidence:** Journal pages describe the old state, not an application event history.
- **Visibility:** Another connection sees committed rows, not A's pending updates.
- **Commit protocol:** File cleanup has transactional meaning, not merely housekeeping.

### Piece by piece

- **journal_mode=DELETE** selects rollback journaling with journal removal after successful completion. The returned delete confirms the mode.
- **WITH RECURSIVE** generates a bounded 200-row baseline.
- **BEGIN IMMEDIATE** reserves A's writer position; the 150-row UPDATE creates the journal before-images.
- **.shell ls -l** shows named file sizes and metadata while A is open. **TUTOR_SQLITE_DB** supplies the same owned path to every connection.
- **.shell sqlite3 FILE SQL** opens a short-lived independent reader. The count and concatenated label expose zero pending values before publication.
- **ROLLBACK** discards the first change. **COMMIT** publishes the second; the final independent query must count 150 committed-update rows.
- **test -e, stat -c and echo** distinguish an absent journal from a zero/nonzero length. %s is bytes; journal size is physical evidence, not a count of changed rows.`,
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
        "PostgreSQL already taught atomicity; SQLite shows a different physical implementation. In rollback mode, before-images, file locks and journal invalidation cooperate to make an ordinary file transactional. A shell observer must interpret the coordinated file state, not assume that bytes visible in the main file are committed.",
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
        "Commit equivalent rows under DELETE, TRUNCATE and PERSIST, and compare the journal left behind. All three can publish the same logical result while using different filesystem operations to invalidate undo state. Learn to distinguish allocated file space from live recovery evidence.",
      syntaxBreakdown: code`### In plain terms

A journal need not disappear to stop being a valid rollback record. SQLite can remove the file, truncate it, or invalidate its header while preserving allocation. The experiment holds logical writes constant and changes only this cleanup policy.

### What you are learning

- **Invalidation versus deletion:** A nonempty sidecar is not automatically a hot journal.
- **Allocation reuse:** Keeping space can avoid repeated file allocation.
- **Operational interpretation:** Recovery depends on valid metadata and locks, not filename existence alone.

### Piece by piece

- **PRAGMA journal_mode=DELETE/TRUNCATE/PERSIST** requests each rollback policy. DELETE unlinks the completed journal; TRUNCATE reduces its length to zero; PERSIST invalidates the header while retaining file space. Do not assume rollback-mode choices persist across unrelated connections like WAL mode does.
- **BEGIN/COMMIT** group the two rows for each named mode into one transaction.
- **.shell if test -e** checks existence without opening SQLite. **stat -c** formats byte length with %s; **echo** reports absence explicitly.
- **GROUP BY mode and count(*)** verify exactly two committed rows per mode. **.headers on** labels that evidence.
- **.print and the final journal_mode=DELETE** document and perform cleanup of the PERSIST artifact, leaving the next experiment a known baseline.
- **MEMORY and OFF**, discussed in the caution, are deliberately excluded because their crash-recovery promises differ; they are not interchangeable performance settings.`,
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
        "A storage protocol can invalidate a record without physically erasing it. This is useful intuition for log reuse and tombstones later, but here the authority is the journal header and lock protocol. Compare physical allocation policy separately from transaction outcome.",
      caution:
        code`MEMORY and OFF are useful to discuss but are intentionally not used here: they weaken crash-recovery guarantees and are unsuitable for durable state without a separately justified contract.`,
    },
    {
      slug: "crash-leaves-hot-journal",
      revision: 3,
      title: "Preserve a hot journal after a crash",
      difficulty: "advanced",
      tags: ["rollback-journal", "crash-recovery", "incident"],
      prerequisites: ["journal-modes"],
      safetyLevel: "dangerous",
      runIn: "shell",
      estimatedMinutes: 20,
      overview:
        "Force uncommitted pages out of SQLite's small cache, verify that dirty bytes reached a disposable main file, then terminate only the writer you started. Preserve the matching main/journal pair before any database open can recover it. This is an evidence-ordering exercise as much as a crash exercise.",
      syntaxBreakdown: code`### In plain terms

Killing a process before it writes anything to disk would be a weak recovery demonstration. We first prove that uncommitted markers reached the main file and that a valid rollback journal exists. Only then do we kill the owned writer and copy both files without opening SQLite again.

### What you are learning

- **Cache spill:** Uncommitted dirty pages can reach the main file while undo evidence protects atomicity.
- **Hot journal:** Recovery metadata and transaction state make a journal actionable; a suffix alone is insufficient.
- **Evidence ordering:** Opening a crashed database can alter the very evidence you wanted to inspect.

### Piece by piece

- **set -eu, case, dirname, test, and mktemp -d** reject an absent, relative, root-level or unwritable lab target and create owned scratch space. A printed path is the evidence boundary, not permission to modify a production file.
- **sqlite3 FILE** runs SQL in a fresh connection. **Heredocs** feed multiline SQL; quoted delimiters prevent shell expansion. Each worker must receive its own connection settings.
- **journal_mode=DELETE, page_size=1024 and VACUUM** fix the small-page rollback layout. **WITH RECURSIVE, randomblob and hex** create 500 large committed values.
- **mkfifo, exec 3, background &, and $!** keep one sqlite3 process open and retain its exact PID. No process-name-wide kill is used.
- **cache_size=10 and cache_spill=ON** make the large UPDATE exceed the cache while its transaction stays open. **printf** embeds a recognizable dirty prefix with an integer ID.
- **grep -Fxq, seq and sleep** wait for the complete WRITER_READY marker with a deadline. **kill -0** checks whether that owned PID still exists.
- **grep -a -o and wc -l** count dirty markers in the raw main file; -a treats binary input as text and -o emits matches. This count is physical spill evidence, not a SQL row count.
- **xxd -p -l 8** reads eight journal-header bytes as plain hex; d9d505f920a163d7 is the required magic before termination.
- **kill -KILL and wait** terminate and reap the writer. **cp** preserves both files; **stat -c** reports their lengths. **trap** closes the descriptor and removes the owned FIFO on failure.
- The following lesson discovers the newest preserved pair under this lab parent and recovers a separate working copy.`,
      code: code`(
set -eu
if [ -z "${"$"}{TUTOR_SQLITE_DB:-}" ]; then echo 'set TUTOR_SQLITE_DB to an absolute disposable path'; exit 2; fi
TUTOR_SQLITE_DB=${"$"}{TUTOR_SQLITE_DB}
case "$TUTOR_SQLITE_DB" in /*) ;; *) echo 'TUTOR_SQLITE_DB must be absolute'; exit 2;; esac
case "$TUTOR_SQLITE_DB" in *.db) ;; *) echo 'TUTOR_SQLITE_DB must end in .db'; exit 2;; esac
PARENT_DIR=$(dirname "$TUTOR_SQLITE_DB")
if [ "$PARENT_DIR" = / ] || [ ! -d "$PARENT_DIR" ] || [ ! -w "$PARENT_DIR" ]; then echo 'database parent must be an existing writable non-root directory'; exit 2; fi
SCRATCH_DIR=$(mktemp -d "$PARENT_DIR/sqlite-crash.XXXXXX")
printf 'evidence_dir=%s\n' "$SCRATCH_DIR"
TUTOR_SQLITE_DB="$SCRATCH_DIR/crash.db"
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
WRITER_PID=0
cleanup() { if [ "$WRITER_PID" -gt 0 ]; then kill -KILL "$WRITER_PID" 2>/dev/null || true; wait "$WRITER_PID" 2>/dev/null || true; fi; exec 3>&- 2>/dev/null || true; rm -f "$TUTOR_SQLITE_DB.commands"; }
trap cleanup EXIT
sqlite3 "$TUTOR_SQLITE_DB" <"$TUTOR_SQLITE_DB.commands" >"$TUTOR_SQLITE_DB.writer.log" 2>&1 &
WRITER_PID=$!
exec 3>"$TUTOR_SQLITE_DB.commands"
echo "PRAGMA cache_size=10; PRAGMA cache_spill=ON; BEGIN IMMEDIATE; UPDATE crash_rows SET payload='dirty-' || printf('%08d', id) || hex(randomblob(2500)); SELECT 'WRITER_READY';" >&3
READY=0
for attempt in $(seq 1 100); do
  if grep -Fxq WRITER_READY "$TUTOR_SQLITE_DB.writer.log"; then READY=1; break; fi
  kill -0 "$WRITER_PID" 2>/dev/null || break
  sleep 0.05
done
[ "$READY" -eq 1 ] || { echo 'writer readiness deadline exceeded'; exit 3; }
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
WRITER_PID=0
cp "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB.hot-main"
cp "$TUTOR_SQLITE_DB-journal" "$TUTOR_SQLITE_DB.hot-main-journal"
stat -c 'preserved_main_bytes=%s' "$TUTOR_SQLITE_DB.hot-main"
stat -c 'preserved_journal_bytes=%s' "$TUTOR_SQLITE_DB.hot-main-journal"
printf 'preserved_main=%s\npreserved_journal=%s\n' "$TUTOR_SQLITE_DB.hot-main" "$TUTOR_SQLITE_DB.hot-main-journal"
rm -f "$TUTOR_SQLITE_DB.commands"
)
      `,
      expectedResult:
        "Before SIGKILL, pre_kill_dirty_rows is positive and journal magic is d9d505f920a163d7. The owned writer dies before COMMIT. A unique sqlite-crash directory retains crash.db.hot-main and its nonempty matching -journal, with their lengths printed. No SQLite open follows the kill in this lesson, so recovery has not consumed the evidence.",
      systemsLens:
        "A forensic workflow has a happens-before relation: preserve first, recover second. The experiment demonstrates a process-crash atomicity mechanism while the operating system remains alive. It does not simulate loss of volatile device caches or establish a power-loss durability guarantee.",
      caution:
        code`Run only with a uniquely named disposable TUTOR_SQLITE_DB. The command deliberately sends SIGKILL and leaves a preserved evidence pair; do not point it at production.`,
    },
    {
      slug: "hot-journal-recovery",
      revision: 3,
      title: "Recover a hot journal deterministically",
      difficulty: "advanced",
      tags: ["crash-recovery", "rollback-journal", "integrity-check"],
      prerequisites: ["crash-leaves-hot-journal"],
      safetyLevel: "dangerous",
      runIn: "shell",
      estimatedMinutes: 12,
      overview:
        "Recover a working copy of the preserved crash pair and compare its logical state with the pre-crash committed baseline. Hash the original pair before and after to prove it stayed untouched. Successful recovery means both sound structure and no leaked uncommitted values.",
      syntaxBreakdown: code`### In plain terms

SQLite automatically applies rollback recovery when a normal open discovers a hot journal. That helpful behavior also mutates files, so we never point it at the preserved evidence pair. A fresh working copy lets you repeat the experiment or inspect the originals later.

### What you are learning

- **Automatic recovery:** Opening the matching main/journal pair triggers the engine's rollback protocol.
- **Structural versus semantic evidence:** An intact B-tree is necessary but does not prove the intended rows survived.
- **Preservation:** Recovery and original evidence belong at different paths.

### Piece by piece

- **set -eu, case, dirname and test** enforce the disposable lab boundary.
- **find -mindepth 2 -maxdepth 2 -type f -name ... -size +0c -printf** selects nonempty preserved main files one scratch-directory level beneath the lab parent. **sort -nr, head -n 1 and cut** choose the newest timestamp and retain its full path; check the printed selection if several attempts exist.
- **sha256sum** records both original files before recovery. A main file without its matching journal is rejected.
- **cp** creates recovered.db and recovered.db-journal. **rm -f** removes only an earlier working result at those exact paths, not the evidence.
- **sqlite3** opens the working pair. **integrity_check** must return ok; **count, min/max, substr and LIKE** verify 500 committed-prefix rows and zero dirty-prefix rows.
- **.headers on and .mode box** label the logical checks. **test -e and stat -c** report whether the working journal was removed or invalidated.
- A second **sha256sum** and equality assertion require **evidence_unchanged=yes**, independent of the working journal's final shape.`,
      code: code`(
set -eu
if [ -z "${"$"}{TUTOR_SQLITE_DB:-}" ]; then echo 'set TUTOR_SQLITE_DB to an absolute disposable path'; exit 2; fi
TUTOR_SQLITE_DB=${"$"}{TUTOR_SQLITE_DB}
case "$TUTOR_SQLITE_DB" in /*) ;; *) echo 'TUTOR_SQLITE_DB must be absolute'; exit 2;; esac
case "$TUTOR_SQLITE_DB" in *.db) ;; *) echo 'TUTOR_SQLITE_DB must end in .db'; exit 2;; esac
PARENT_DIR=$(dirname "$TUTOR_SQLITE_DB")
if [ "$PARENT_DIR" = / ] || [ ! -d "$PARENT_DIR" ] || [ ! -w "$PARENT_DIR" ]; then echo 'database parent must be an existing writable non-root directory'; exit 2; fi
HOT_MAIN=$(find "$PARENT_DIR" -mindepth 2 -maxdepth 2 -type f -name 'crash.db.hot-main' -size +0c -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)
[ -n "$HOT_MAIN" ] || { echo 'no preserved crash pair found; run crash-leaves-hot-journal first'; exit 2; }
[ -s "$HOT_MAIN-journal" ] || { echo 'preserved hot journal evidence is missing or empty'; exit 2; }
BEFORE_HASH=$(sha256sum "$HOT_MAIN" "$HOT_MAIN-journal")
WORKING_MAIN="$(dirname "$HOT_MAIN")/recovered.db"
rm -f "$WORKING_MAIN" "$WORKING_MAIN-journal"
cp "$HOT_MAIN" "$WORKING_MAIN"
cp "$HOT_MAIN-journal" "$WORKING_MAIN-journal"
sqlite3 "$WORKING_MAIN" <<'SQL'
.headers on
.mode box
PRAGMA integrity_check;
SELECT count(*) AS rows, min(substr(payload, 1, 10)) AS minimum_prefix, max(substr(payload, 1, 10)) AS maximum_prefix FROM crash_rows;
SELECT count(*) AS uncommitted_rows_visible FROM crash_rows WHERE payload LIKE 'dirty-%';
SQL
if [ -e "$WORKING_MAIN-journal" ]; then stat -c 'working_journal_bytes=%s' "$WORKING_MAIN-journal"; else echo 'working_journal_absent'; fi
AFTER_HASH=$(sha256sum "$HOT_MAIN" "$HOT_MAIN-journal")
printf 'discovered_hot_main=%s\ndiscovered_hot_journal=%s\nevidence_unchanged=%s\n' "$HOT_MAIN" "$HOT_MAIN-journal" "$([ "$BEFORE_HASH" = "$AFTER_HASH" ] && echo yes || echo no)"
[ "$BEFORE_HASH" = "$AFTER_HASH" ]
)
      `,
      expectedResult:
        "The working copy recovers to integrity_check=ok, 500 rows, committed payload prefixes and uncommitted_rows_visible=0. Its working journal is normally removed or invalidated. The printed discovered paths identify the original pair, and evidence_unchanged=yes proves both originals retained identical hashes.",
      systemsLens:
        "Recoverability is a protocol plus a tested procedure, not a hopeful command. The before-image mechanism is SQLite-specific; separating original evidence, recovery output and domain verification transfers directly to distributed incident response.",
      caution:
        "Run crash-leaves-hot-journal first under the same disposable lab parent. This lesson selects the newest preserved pair there and overwrites only its recovered.db working result. Keep the printed original paths; they must remain unchanged.",
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
        "Trace otherwise equivalent rollback-mode writes under FULL, NORMAL and OFF. Count the synchronization calls SQLite requests and inspect which file each call targets. Use the trace to understand acknowledgment cost without confusing an observed syscall with tested power-loss survival.",
      syntaxBreakdown: code`### In plain terms

Durability depends on ordering writes and asking the operating system to persist them before acknowledging a transaction. The synchronous setting changes those requests. We compare one small schema creation plus one 200-row transaction under each policy; this is not a device crash test.

### What you are learning

- **Connection policy:** synchronous belongs to the connection actually performing the writes.
- **Ordering contract:** A synchronization request is evidence of intended persistence ordering.
- **Failure-model limits:** Process death and loss of power are different tests.

### Piece by piece

- **set -eu, case, dirname, test, and mktemp -d** reject an absent, relative, root-level or unwritable lab target and create owned scratch space. A printed path is the evidence boundary, not permission to modify a production file.
- **sqlite3 FILE** runs SQL in a fresh connection. **Heredocs** feed multiline SQL; quoted delimiters prevent shell expansion. Each worker must receive its own connection settings.
- **PRAGMA journal_mode=DELETE and synchronous=FULL/NORMAL/OFF** hold the journal mechanism fixed while changing requested synchronization. WAL has a different policy-to-guarantee mapping and is studied later.
- **WITH RECURSIVE** generates the same 200 rows inside one **BEGIN/COMMIT** transaction per mode.
- **strace -qq -f -yy -e trace=fsync,fdatasync -o FILE** records synchronization calls. -qq reduces chatter; -f follows children; -yy annotates file descriptors with paths; -e selects calls; -o saves evidence. A ptrace denial means this experiment has not run.
- **/usr/bin/time -f %e -o FILE** records total elapsed seconds including process startup and tracing; it is supporting evidence, not uninstrumented commit latency.
- **grep -Ec** counts matching sync lines; OFF can legitimately have zero, so grep's no-match status is tolerated only for that count. **cat** prints each saved duration.
- Trace totals include table creation as well as data commit. Compare requested calls and paths before interpreting elapsed-time differences.`,
      code: code`(
set -eu
if [ -z "${"$"}{TUTOR_SQLITE_DB:-}" ]; then echo 'set TUTOR_SQLITE_DB to an absolute disposable path'; exit 2; fi
TUTOR_SQLITE_DB=${"$"}{TUTOR_SQLITE_DB}
case "$TUTOR_SQLITE_DB" in /*) ;; *) echo 'TUTOR_SQLITE_DB must be absolute'; exit 2;; esac
case "$TUTOR_SQLITE_DB" in *.db) ;; *) echo 'TUTOR_SQLITE_DB must end in .db'; exit 2;; esac
PARENT_DIR=$(dirname "$TUTOR_SQLITE_DB")
if [ "$PARENT_DIR" = / ] || [ ! -d "$PARENT_DIR" ] || [ ! -w "$PARENT_DIR" ]; then echo 'database parent must be an existing writable non-root directory'; exit 2; fi
command -v strace
SCRATCH_DIR=$(mktemp -d "$PARENT_DIR/sqlite-sync.XXXXXX")
TUTOR_SQLITE_DB="$SCRATCH_DIR/sync.db"
echo "evidence_dir=$SCRATCH_DIR"
rm -f "$TUTOR_SQLITE_DB-FULL" "$TUTOR_SQLITE_DB-NORMAL" "$TUTOR_SQLITE_DB-OFF" "$TUTOR_SQLITE_DB-FULL.trace" "$TUTOR_SQLITE_DB-NORMAL.trace" "$TUTOR_SQLITE_DB-OFF.trace" "$TUTOR_SQLITE_DB-FULL.time" "$TUTOR_SQLITE_DB-NORMAL.time" "$TUTOR_SQLITE_DB-OFF.time"
 /usr/bin/time -f '%e' -o "$TUTOR_SQLITE_DB-FULL.time" strace -qq -f -yy -e trace=fsync,fdatasync -o "$TUTOR_SQLITE_DB-FULL.trace" sqlite3 "$TUTOR_SQLITE_DB-FULL" "PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE t(x); BEGIN; WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 200) INSERT INTO t SELECT x FROM n; COMMIT;"
 /usr/bin/time -f '%e' -o "$TUTOR_SQLITE_DB-NORMAL.time" strace -qq -f -yy -e trace=fsync,fdatasync -o "$TUTOR_SQLITE_DB-NORMAL.trace" sqlite3 "$TUTOR_SQLITE_DB-NORMAL" "PRAGMA journal_mode=DELETE; PRAGMA synchronous=NORMAL; CREATE TABLE t(x); BEGIN; WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 200) INSERT INTO t SELECT x FROM n; COMMIT;"
 /usr/bin/time -f '%e' -o "$TUTOR_SQLITE_DB-OFF.time" strace -qq -f -yy -e trace=fsync,fdatasync -o "$TUTOR_SQLITE_DB-OFF.trace" sqlite3 "$TUTOR_SQLITE_DB-OFF" "PRAGMA journal_mode=DELETE; PRAGMA synchronous=OFF; CREATE TABLE t(x); BEGIN; WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 200) INSERT INTO t SELECT x FROM n; COMMIT;"
printf 'FULL sync_calls='; grep -Ec 'fsync|fdatasync' "$TUTOR_SQLITE_DB-FULL.trace" || true
printf 'NORMAL sync_calls='; grep -Ec 'fsync|fdatasync' "$TUTOR_SQLITE_DB-NORMAL.trace" || true
printf 'OFF sync_calls='; grep -Ec 'fsync|fdatasync' "$TUTOR_SQLITE_DB-OFF.trace" || true
printf 'FULL elapsed_seconds='; cat "$TUTOR_SQLITE_DB-FULL.time"
printf 'NORMAL elapsed_seconds='; cat "$TUTOR_SQLITE_DB-NORMAL.time"
printf 'OFF elapsed_seconds='; cat "$TUTOR_SQLITE_DB-OFF.time"
)
      `,
      expectedResult:
        "The validated rollback-mode fixture requested FULL=8, NORMAL=6 and OFF=0 sync calls, including schema creation. Traces retain file-descriptor path attribution. Elapsed seconds vary with tracing, filesystem and concurrent host load, and need not sort monotonically in one tiny run. Counts describe this workload, not a universal ratio or a power-loss test.",
      systemsLens:
        "PostgreSQL's durability vocabulary helps you ask the right question, but the setting names do not imply identical engine behavior. In SQLite, the embedding application chooses a per-connection contract whose meaning depends on journal mode and the storage stack. Record that contract explicitly instead of treating synchronous as a generic speed knob.",
      caution:
        code`No process-kill or power-loss claim follows from this lesson. Run on a disposable path and preserve trace files with the database files they describe.`,
      revision: 3,
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
        "Feed the same 200 INSERT statements through one connection per case, changing only whether they have 200 commit boundaries or one. Compare synchronization counts before looking at elapsed time. This is application transaction batching, not PostgreSQL group commit.",
      syntaxBreakdown: code`### In plain terms

A database can amortize work because an application asks for fewer transactions, or because the engine shares a flush across independent transactions. This lesson demonstrates only the first. One large transaction reduces commit boundaries but also makes all 200 rows share one failure outcome.

### What you are learning

- **Batching:** Fewer explicit outcomes can mean much less synchronization.
- **Controlled workload:** Same rows, SQL shape, connection count, journal mode and durability policy.
- **Trade-off:** Throughput gains can lengthen writer occupancy and enlarge replay work.

### Piece by piece

- **set -eu, case, dirname, test, and mktemp -d** reject an absent, relative, root-level or unwritable lab target and create owned scratch space. A printed path is the evidence boundary, not permission to modify a production file.
- **sqlite3 FILE** runs SQL in a fresh connection. **Heredocs** feed multiline SQL; quoted delimiters prevent shell expansion. Each worker must receive its own connection settings.
- **echo and awk** generate two SQL files before measurement. awk's bounded loop emits identical INSERT statements; only the batch file adds **BEGIN** and **COMMIT** around them.
- **journal_mode=DELETE and synchronous=FULL** explicitly fix policies in each measured connection.
- **strace -qq -f -yy -e trace=fsync,fdatasync -o** selects sync calls, annotates file paths and preserves a trace; **/usr/bin/time -f %e -o** records the surrounding process duration.
- **Input redirection** feeds the prepared SQL to one sqlite3 process per case. There is no new SQLite process per row.
- **grep -Ec** counts requested flushes; **cat** prints elapsed seconds; **count(*)** verifies both databases contain 200 rows.
- The expected 804-versus-8 example includes table creation. Do not divide it into an exact per-row storage guarantee or call the elapsed ratio a universal SQLite limit.
- **The 2,000-row challenge** asks which work grows with rows and which grows with transactions; predict those curves separately.`,
      code: code`(
set -eu
if [ -z "${"$"}{TUTOR_SQLITE_DB:-}" ]; then echo 'set TUTOR_SQLITE_DB to an absolute disposable path'; exit 2; fi
TUTOR_SQLITE_DB=${"$"}{TUTOR_SQLITE_DB}
case "$TUTOR_SQLITE_DB" in /*) ;; *) echo 'TUTOR_SQLITE_DB must be absolute'; exit 2;; esac
case "$TUTOR_SQLITE_DB" in *.db) ;; *) echo 'TUTOR_SQLITE_DB must end in .db'; exit 2;; esac
PARENT_DIR=$(dirname "$TUTOR_SQLITE_DB")
if [ "$PARENT_DIR" = / ] || [ ! -d "$PARENT_DIR" ] || [ ! -w "$PARENT_DIR" ]; then echo 'database parent must be an existing writable non-root directory'; exit 2; fi
SCRATCH_DIR=$(mktemp -d "$PARENT_DIR/sqlite-batching.XXXXXX")
TUTOR_SQLITE_DB="$SCRATCH_DIR/batching.db"
echo "evidence_dir=$SCRATCH_DIR"
rm -f "$TUTOR_SQLITE_DB-autocommit" "$TUTOR_SQLITE_DB-batch" "$TUTOR_SQLITE_DB-autocommit.sql" "$TUTOR_SQLITE_DB-batch.sql" "$TUTOR_SQLITE_DB-autocommit.trace" "$TUTOR_SQLITE_DB-batch.trace" "$TUTOR_SQLITE_DB-autocommit.time" "$TUTOR_SQLITE_DB-batch.time"
echo 'PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE t(x INTEGER);' > "$TUTOR_SQLITE_DB-autocommit.sql"
awk 'BEGIN { for (i=1; i<=200; i++) print "INSERT INTO t VALUES (" i ");"; }' >> "$TUTOR_SQLITE_DB-autocommit.sql"
echo 'PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE t(x INTEGER); BEGIN;' > "$TUTOR_SQLITE_DB-batch.sql"
awk 'BEGIN { for (i=1; i<=200; i++) print "INSERT INTO t VALUES (" i ");"; }' >> "$TUTOR_SQLITE_DB-batch.sql"
echo 'COMMIT;' >> "$TUTOR_SQLITE_DB-batch.sql"
/usr/bin/time -f '%e' -o "$TUTOR_SQLITE_DB-autocommit.time" strace -qq -f -yy -e trace=fsync,fdatasync -o "$TUTOR_SQLITE_DB-autocommit.trace" sqlite3 "$TUTOR_SQLITE_DB-autocommit" < "$TUTOR_SQLITE_DB-autocommit.sql"
/usr/bin/time -f '%e' -o "$TUTOR_SQLITE_DB-batch.time" strace -qq -f -yy -e trace=fsync,fdatasync -o "$TUTOR_SQLITE_DB-batch.trace" sqlite3 "$TUTOR_SQLITE_DB-batch" < "$TUTOR_SQLITE_DB-batch.sql"
printf 'autocommit sync_calls='; grep -Ec 'fsync|fdatasync' "$TUTOR_SQLITE_DB-autocommit.trace" || true
printf 'batch sync_calls='; grep -Ec 'fsync|fdatasync' "$TUTOR_SQLITE_DB-batch.trace" || true
printf 'autocommit elapsed_seconds='; cat "$TUTOR_SQLITE_DB-autocommit.time"
printf 'batch elapsed_seconds='; cat "$TUTOR_SQLITE_DB-batch.time"
sqlite3 "$TUTOR_SQLITE_DB-autocommit" 'SELECT count(*) AS rows FROM t;'
sqlite3 "$TUTOR_SQLITE_DB-batch" 'SELECT count(*) AS rows FROM t;'
)
      `,
      expectedResult:
        "Both databases contain 200 rows. The validated rollback/FULL fixture requested 804 sync calls for autocommit and 8 for one batch, including schema creation. Elapsed times vary; the repeatable mechanism is that far fewer commit boundaries request far fewer flushes. The batch is also one larger rollback/retry unit.",
      systemsLens:
        code`Application batching removes transaction boundaries: these 200 rows share one commit and one rollback fate. That is different from PostgreSQL group commit, where independent transactions can share a durability flush while retaining separate outcomes. In SQLite, choose batch size jointly with writer occupancy, latency, and the amount of work that must be repeated after failure.`,
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
lessons 14–19. Read these rollback-mode sections to explain the required write and sync ordering
behind that evidence before moving on; this document does not describe WAL, and the corruption
material is optional operational context.
        `,
      },
      revision: 3,
    },
  ],
};
