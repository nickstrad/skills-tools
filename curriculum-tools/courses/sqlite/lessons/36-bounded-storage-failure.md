# Recover from a bounded page quota

slug: bounded-storage-failure
category: recovery
difficulty: advanced
tags: storage-quota, error-scope, recovery, integrity-check
prerequisites: integrity-and-domain-checks
safety: dangerous
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 20
revision: 1

## Overview
Exhaust a 12-page SQLite quota in a disposable file without filling the host filesystem. Require a classified full error, zero committed rows and sound structure, then raise the quota and commit the same bounded workload. The exercise turns storage exhaustion into an explicit recoverable policy boundary.

## Syntax breakdown
### In plain terms

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
- **page_count, integrity_check, count(*) and stat -c %s** verify growth beyond 12 pages, 100 committed rows, sound structure and positive main-file length. They do not measure total filesystem pressure.

## Caution
The script deletes only its uniquely named quota database. Keep TUTOR_SQLITE_DB pointed at a disposable lab path, and do not treat an SQLITE_FULL result as permission to delete files or reclaim host storage.

## Run
```sh
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
```

## Expected result
The evidence names a disposable storage-quota.sqlite, reports an initial 12-page limit, and the first insert exits nonzero with SQLITE_FULL (the exact CLI wording may include "database or disk is full"). The post-failure integrity check is ok and rows_after_failure is 0: no partial domain effect is accepted. After the quota is raised to 240 pages, the same 100 rows commit, recovered_pages is greater than 12, integrity_check is ok, rows_after_recovery is 100, and quota_file_bytes is positive. This is a SQLite page quota; it is not proof of host ENOSPC, a WAL-size bound, or corruption.

## Systems lens
The same error family can identify different exhausted resources. Diagnose the owner and the bound before retrying or deleting anything. An embedded application's storage budget includes main pages, transient journals/WAL and recovery headroom; one pager quota is only part of that capacity contract.

## Optional variation
Set the bound below the schema's minimum and observe which DDL statement fails. Then repeat in WAL mode and measure main-file, -wal, and max_page_count separately; explain why a WAL file can grow even when the main database is at its page bound.
