# Measure the cost of transaction boundaries

slug: batching-changes-the-cost
category: journals
difficulty: intermediate
tags: transactions, fsync, write-amplification
prerequisites: synchronous-contracts
safety: writes-data
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 20
revision: 3

## Overview
Feed the same 200 INSERT statements through one connection per case, changing only whether they have 200 commit boundaries or one. Compare synchronization counts before looking at elapsed time. This is application transaction batching, not PostgreSQL group commit.

## Syntax breakdown
### In plain terms

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
- **The 2,000-row variation** compares work that grows with rows with work that grows with transaction boundaries.

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
```

## Expected result
Both databases contain 200 rows. The validated rollback/FULL fixture requested 804 sync calls for autocommit and 8 for one batch, including schema creation. Elapsed times vary; the repeatable mechanism is that far fewer commit boundaries request far fewer flushes. The batch is also one larger rollback/retry unit.

## Systems lens
Application batching removes transaction boundaries: these 200 rows share one commit and one rollback fate. That is different from PostgreSQL group commit, where independent transactions can share a durability flush while retaining separate outcomes. In SQLite, choose batch size jointly with writer occupancy, latency, and the amount of work that must be repeated after failure.

## Optional variation
Repeat Run with both awk loop bounds changed from 200 to 2000. Both final counts should be 2000. Compare the two traces and elapsed times with the 200-row run: autocommit still creates one transaction per row, while the batch has one data transaction. Plot the measured sync counts against row count if useful; page growth and spill can add work, so use the observed counts rather than extrapolating an exact batch count or timing ratio.
