# Use independent files as writer domains

slug: independent-database-writers
category: toolkit
difficulty: advanced
tags: sharding, locking, writer-admission, failure-domain
prerequisites: restore-and-rejoin-history
safety: locking
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 25
revision: 1

## Overview
Hold tenant A's writer while tenant B commits to a different file, then make a second A connection fail admission. This shows exactly what file-per-tenant buys: independent local writer queues. It does not create a separate machine, isolate shared disk pressure or atomically coordinate the two independent connections.

## Syntax breakdown
### In plain terms

One SQLite file has one writer position, but the restriction is not a host-wide mutex. Two files can accept writes independently while two connections to the same file still contend. We hold A until all observations finish, so the result does not depend on beating a one-second background sleep.

### What you are learning

- **Partitioned admission:** Separate files create independent writer domains.
- **Shared failure domain:** Host, filesystem and capacity failures can still affect both.
- **Coordination boundary:** Independent transactions do not become one transaction merely because the files are nearby.

### Piece by piece

- **set -eu, printenv, case, dirname, test and mktemp -d** require an owned writable lab parent and create unique tenant files and logs.
- **sqlite3 -bail** stops unexpected SQL failures. Both files explicitly use **journal_mode=DELETE** and the same small table.
- **mkfifo, exec 3, background &, and $!** retain one live A writer and its exact process ID.
- **BEGIN IMMEDIATE, INSERT and HOLDER_READY** acquire A's writer and report readiness only after the pending mutation. **grep -Fxq, seq and sleep** wait for that full marker within a bounded loop.
- B's separate **BEGIN/INSERT/COMMIT** must succeed while A is still held. Its success is checked before the A contender begins.
- **busy_timeout=200** bounds the second A connection's admission attempt. Its nonzero exit plus database is locked evidence is required; **date +%s%N** measures the wait including process launch.
- Only after the contender finishes does the parent send A **COMMIT** and **.quit**, close the FIFO descriptor and **wait** for the child.
- **count(*) and integrity_check** are asserted on both files: each has exactly its one intended row and sound structure.
- **trap, kill -0 and kill -KILL** clean up only the owned process on failure. **cat** exposes the retained contender log for review.

## Caution
Only scratch files named by the script are removed. Keep TUTOR_SQLITE_DB disposable; unrelated errors in the contender log are not lock evidence.

## Run
```sh
(
set -eu
db=$(printenv TUTOR_SQLITE_DB)
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
dir=$(dirname -- "$db")
[ "$dir" != / ] && [ -d "$dir" ] && [ -w "$dir" ] || exit 2
case "$dir" in *"'"*|*'"'*) echo 'use a lab path without quote characters' >&2; exit 2;; esac
[ "$dir" != / ] && [ -d "$dir" ] && [ -w "$dir" ] || exit 2
scratch=$(mktemp -d "$dir/toolkit-writers.XXXXXX")
echo "evidence_dir=$scratch"
a="$scratch/tenant-a.sqlite"; b="$scratch/tenant-b.sqlite"; pid=0
cleanup() { if [ "$pid" -gt 0 ] && kill -0 "$pid" 2>/dev/null; then kill -KILL "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi; }
trap cleanup EXIT
sqlite3 -bail "$a" 'PRAGMA journal_mode=DELETE; CREATE TABLE writes(note TEXT);'
sqlite3 -bail "$b" 'PRAGMA journal_mode=DELETE; CREATE TABLE writes(note TEXT);'
mkfifo "$scratch/holder.in"
sqlite3 -bail "$a" <"$scratch/holder.in" >"$scratch/holder.log" 2>&1 & pid=$!
exec 3>"$scratch/holder.in"
printf "%s\n" "BEGIN IMMEDIATE; INSERT INTO writes VALUES ('holder'); SELECT 'HOLDER_READY';" >&3
ready=0
for poll in $(seq 1 100); do
  if grep -Fxq HOLDER_READY "$scratch/holder.log"; then ready=1; break; fi
  sleep 0.02
done
[ "$ready" -eq 1 ] || { echo 'holder readiness deadline exceeded' >&2; exit 3; }
sqlite3 -bail "$b" "BEGIN IMMEDIATE; INSERT INTO writes VALUES ('independent'); COMMIT;"
echo 'tenant_b_commit=ok while tenant_a_writer_is_held=yes'
start=$(date +%s%N)
status=0
sqlite3 -bail "$a" 'PRAGMA busy_timeout=200; BEGIN IMMEDIATE;' >"$scratch/contender.log" 2>&1 || status=$?
end=$(date +%s%N)
[ "$status" -ne 0 ] && grep -qi 'database is locked' "$scratch/contender.log" || { echo 'missing contention evidence' >&2; exit 4; }
printf 'COMMIT;\n.quit\n' >&3
exec 3>&-
wait "$pid"; pid=0
[ "$(sqlite3 "$a" 'SELECT count(*) FROM writes;')" -eq 1 ]
[ "$(sqlite3 "$b" 'SELECT count(*) FROM writes;')" -eq 1 ]
[ "$(sqlite3 "$a" 'PRAGMA integrity_check;')" = ok ]
[ "$(sqlite3 "$b" 'PRAGMA integrity_check;')" = ok ]
printf 'tenant_a_contender_exit=%s wait_ms=%s tenant_a_rows=1 tenant_b_rows=1 integrity=ok\n' "$status" "$(( (end-start)/1000000 ))"
cat "$scratch/contender.log"
)
```

## Expected result
tenant_b_commit=ok is printed with tenant_a_writer_is_held=yes. The second A connection exits nonzero after approximately its 200 ms wait budget and prints database is locked. Both file counts are asserted as 1 and both integrity checks are ok; no fixed cross-machine throughput claim follows.

## Systems lens
File-per-tenant partitioning exchanges a shared writer queue for routing, migrations, backup coordination and cross-partition invariants. SQLite is useful when those responsibilities fit the application. When one invariant spans independent writers, explicitly choose a coordinating transaction or a protocol; do not assume physical proximity supplies atomicity.

## Optional variation
For a transfer spanning these files, conservation of the combined balance requires the debit and credit to share a coordinated outcome or a recoverable protocol. One connection using ATTACH can coordinate eligible local rollback-mode files under SQLite's documented conditions; the next lesson inspects those boundaries. Two independent commits can leave a debit without its credit after a failure, so stable transfer identity, recorded progress and retry or compensation are application responsibilities. File separation buys the demonstrated independent admission, while cross-file invariants add coordination work.
