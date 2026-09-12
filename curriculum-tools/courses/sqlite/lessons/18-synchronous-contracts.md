# Observe synchronization contracts

slug: synchronous-contracts
category: journals
difficulty: advanced
tags: synchronous, fsync, durability
prerequisites: hot-journal-recovery
safety: writes-data
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 20
revision: 3

## Overview
Trace otherwise equivalent rollback-mode writes under FULL, NORMAL and OFF. Count the synchronization calls SQLite requests and inspect which file each call targets. Use the trace to understand acknowledgment cost without confusing an observed syscall with tested power-loss survival.

## Syntax breakdown
### In plain terms

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
- Trace totals include table creation as well as data commit. Compare requested calls and paths before interpreting elapsed-time differences.

## Caution
No process-kill or power-loss claim follows from this lesson. Run on a disposable path and preserve trace files with the database files they describe.

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
```

## Expected result
The validated rollback-mode fixture requested FULL=8, NORMAL=6 and OFF=0 sync calls, including schema creation. Traces retain file-descriptor path attribution. Elapsed seconds vary with tracing, filesystem and concurrent host load, and need not sort monotonically in one tiny run. Counts describe this workload, not a universal ratio or a power-loss test.

## Systems lens
PostgreSQL's durability vocabulary helps you ask the right question, but the setting names do not imply identical engine behavior. In SQLite, the embedding application chooses a per-connection contract whose meaning depends on journal mode and the storage stack. Record that contract explicitly instead of treating synchronous as a generic speed knob.
