# Refresh a cache and capture an engine snapshot

slug: cache-invalidation-and-snapshots
category: toolkit
difficulty: intermediate
tags: cache-invalidation, read-only, backup, snapshots
prerequisites: attached-database-boundaries
safety: writes-data
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 20
revision: 1

## Overview
Cache a value next to a persistent connection, let a different connection change it, then use data_version to notice that the cached value needs refreshing. Capture a separate engine backup and verify a read-only open. This combines two practical toolkit uses without pretending the counter is a replication cursor.

## Syntax breakdown
### In plain terms

A value cached in application memory can become stale even when the database is correct. SQLite exposes a connection-local data_version that changes when another connection commits. We compare it on the same still-open connection, reread the authoritative row, then preserve a verified snapshot for independent read-only consumption.

### What you are learning

- **Hint versus history:** data_version says something changed, not which rows changed or which remote operations were received.
- **Connection identity:** Numbers from different or reopened connections are not comparable global versions.
- **Snapshot artifact:** Read-only access constrains a connection's writes; consistent capture requires the backup protocol.

### Piece by piece

- **Path checks, mktemp -d and journal_mode=WAL** create a fresh owned source and a separate snapshot destination.
- **mkfifo, background sqlite3 and exec 3/4** keep A and B alive with separate inputs and logs. **trap, kill -0, kill -KILL and wait** clean up only these owned workers.
- A reads **PRAGMA data_version** and the source value, then prints **A_READY** after both observations. **grep** waits for this completion marker; printing readiness before the queries would race the shell reader.
- **awk** extracts A's numeric counter and cached value from the complete log. They must identify the original before value.
- B's **BEGIN IMMEDIATE/UPDATE/COMMIT** publishes after and only then prints **B_COMMITTED**.
- A repeats its version query and value read on the same connection, then prints **A_AFTER**. Assertions require a changed version, before as the cached value and after as the refreshed value.
- **.quit, descriptor closure and wait** finish both sessions before creating the snapshot.
- **.backup** invokes SQLite's engine-coordinated capture. **sqlite3 -readonly** opens the result without write permission through that connection; integrity and the after value are explicitly asserted.
- A deliberate snapshot INSERT must fail with a read-only error and nonzero exit. Read-only is not the stronger promise made by immutable=1; never label a changing source immutable.

## Caution
The source and snapshot are disposable. A changed data_version does not identify changed rows or certify a remote replica is current.

## Run
```sh
set -eu
db=$(printenv TUTOR_SQLITE_DB || true)
if [ -z "$db" ]; then echo 'TUTOR_SQLITE_DB must be nonempty' >&2; exit 2; fi
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
dir=$(dirname -- "$db")
[ "$dir" != / ] && [ -d "$dir" ] && [ -w "$dir" ] || exit 2
case "$dir" in *"'"*|*'"'*) echo 'use a lab path without quote characters' >&2; exit 2;; esac
scratch=$(mktemp -d "$dir/toolkit-cache.XXXXXX")
echo "evidence_dir=$scratch"
source=$scratch/cache-source.sqlite; snapshot=$scratch/cache-snapshot.sqlite
rm -f "$source" "$source-wal" "$source-shm" "$source-journal" "$snapshot" "$snapshot-wal" "$snapshot-shm" "$snapshot-journal"
sqlite3 "$source" "PRAGMA journal_mode=WAL; CREATE TABLE cache_rows(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO cache_rows VALUES (1, 'before');"
mkfifo "$scratch/a.in" "$scratch/b.in"
sqlite3 "$source" <"$scratch/a.in" >"$scratch/a.out" 2>&1 & apid=$!
sqlite3 "$source" <"$scratch/b.in" >"$scratch/b.out" 2>&1 & bpid=$!
exec 3>"$scratch/a.in"; exec 4>"$scratch/b.in"
cleanup() { for process in "$apid" "$bpid"; do if [ "$process" -gt 0 ] && kill -0 "$process" 2>/dev/null; then kill -KILL "$process" 2>/dev/null || true; wait "$process" 2>/dev/null || true; fi; done; }
trap cleanup EXIT
printf '%s\n' 'PRAGMA data_version;' "SELECT 'A_CACHE=' || value FROM cache_rows WHERE id=1;" '.print A_READY' >&3
deadline=$(( $(date +%s) + 5 )); while ! grep -q 'A_READY' "$scratch/a.out" && [ "$(date +%s)" -lt "$deadline" ]; do sleep 0.05; done
grep -q 'A_READY' "$scratch/a.out" || { echo 'session_a_ready=no' >&2; exit 1; }
before=$(awk '/^[0-9]+$/{print; exit}' "$scratch/a.out"); cached=$(awk -F= '/A_CACHE=/{print $2; exit}' "$scratch/a.out")
echo "cache_value_before=$cached data_version_before=$before"
printf '%s\n' 'BEGIN IMMEDIATE;' "UPDATE cache_rows SET value='after' WHERE id=1;" 'COMMIT;' '.print B_COMMITTED' >&4
deadline=$(( $(date +%s) + 5 )); while ! grep -q 'B_COMMITTED' "$scratch/b.out" && [ "$(date +%s)" -lt "$deadline" ]; do sleep 0.05; done
grep -q 'B_COMMITTED' "$scratch/b.out" || { echo 'session_b_commit=no' >&2; exit 1; }
printf '%s\n' 'PRAGMA data_version;' "SELECT 'A_REFRESH=' || value FROM cache_rows WHERE id=1;" '.print A_AFTER' >&3
deadline=$(( $(date +%s) + 5 )); while ! grep -q 'A_AFTER' "$scratch/a.out" && [ "$(date +%s)" -lt "$deadline" ]; do sleep 0.05; done
after=$(awk '/A_AFTER/{print v; exit} /^[0-9]+$/{v=$0}' "$scratch/a.out"); refreshed=$(awk -F= '/A_REFRESH=/{print $2; exit}' "$scratch/a.out")
[ -n "$before" ] && [ -n "$after" ] && [ "$cached" = before ] && [ "$refreshed" = after ] || { echo 'cache evidence assertion failed' >&2; exit 1; }
echo "data_version_after=$after cache_refresh_value=$refreshed"
if [ "$before" = "$after" ]; then echo 'version_changed=0'; exit 1; else echo 'version_changed=1'; fi
printf '%s\n' '.quit' >&3; printf '%s\n' '.quit' >&4; exec 3>&-; exec 4>&-; wait "$apid"; wait "$bpid"; apid=0; bpid=0
sqlite3 "$source" ".backup '$snapshot'"
sqlite3 -readonly "$snapshot" "PRAGMA integrity_check; SELECT 'snapshot_value', value FROM cache_rows WHERE id=1;"
[ "$(sqlite3 -readonly "$snapshot" 'PRAGMA integrity_check;')" = ok ]
[ "$(sqlite3 -readonly "$snapshot" 'SELECT value FROM cache_rows WHERE id=1;')" = after ]
set +e
sqlite3 -readonly "$snapshot" "INSERT INTO cache_rows VALUES (2, 'blocked');" >"$scratch/readonly.out" 2>&1
readonly_status=$?
set -e
echo "readonly_insert_exit=$readonly_status"; [ "$readonly_status" -ne 0 ]; grep -qi 'readonly\|read-only' "$scratch/readonly.out"
echo "session_logs=$scratch/a.out,$scratch/b.out readonly_log=$scratch/readonly.out"
```

## Expected result
The output names an evidence directory, then prints cache_value_before=before and a numeric version from persistent Session A. After persistent Session B commits, A's data_version differs, version_changed=1, and A's refresh prints after. The backup opens read-only with integrity_check ok and snapshot_value=after; an insert exits nonzero with a read-only error. data_version is not a global replication cursor.

## Systems lens
A local invalidation hint and a portable snapshot solve different problems. The counter helps an application decide to reread; the backup supplies reproducible state for a reader or recovery tool. File replacement, external caches and distributed history still require explicit generation and coordination rules.

## Optional variation
Open a second read-only snapshot after a later commit and compare both values. Define a cache-generation and reopen protocol for replacing a source file.
