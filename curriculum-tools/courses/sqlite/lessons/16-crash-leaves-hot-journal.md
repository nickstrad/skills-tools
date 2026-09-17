# Preserve a hot journal after a crash

slug: crash-leaves-hot-journal
category: journals
difficulty: advanced
tags: rollback-journal, crash-recovery, incident
prerequisites: journal-modes
safety: dangerous
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 20
revision: 3

## Overview
Force uncommitted pages out of SQLite's small cache, verify that dirty bytes reached a disposable main file, then terminate only the writer you started. Preserve the matching main/journal pair before any database open can recover it. This is an evidence-ordering exercise as much as a crash exercise.

## Syntax breakdown
### In plain terms

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
- The following lesson discovers the newest preserved pair under this lab parent and recovers a separate working copy.

## Caution
Run only with a uniquely named disposable TUTOR_SQLITE_DB. The command deliberately sends SIGKILL and leaves a preserved evidence pair; do not point it at production.

## Run
```sh
(
set -eu
if [ -z "${TUTOR_SQLITE_DB:-}" ]; then echo 'set TUTOR_SQLITE_DB to an absolute disposable path'; exit 2; fi
TUTOR_SQLITE_DB=${TUTOR_SQLITE_DB}
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
PRAGMA journal_mode = DELETE;

PRAGMA page_size = 1024;

VACUUM;

CREATE TABLE crash_rows (id INTEGER PRIMARY KEY, payload TEXT);

WITH RECURSIVE
  n (x) AS (
    VALUES
      (1)
    UNION ALL
    SELECT
      x + 1
    FROM
      n
    WHERE
      x < 500
  )
INSERT INTO
  crash_rows
SELECT
  x,
  'committed-' || hex(randomblob(2500))
FROM
  n;
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
```

## Expected result
Before SIGKILL, pre_kill_dirty_rows is positive and journal magic is d9d505f920a163d7. The owned writer dies before COMMIT. A unique sqlite-crash directory retains crash.db.hot-main and its nonempty matching -journal, with their lengths printed. No SQLite open follows the kill in this lesson, so recovery has not consumed the evidence.

## Systems lens
A forensic workflow has a happens-before relation: preserve first, recover second. The experiment demonstrates a process-crash atomicity mechanism while the operating system remains alive. It does not simulate loss of volatile device caches or establish a power-loss durability guarantee.
