# Choose an architecture from measured requirements

slug: sqlite-architecture-decision
category: capstone
difficulty: advanced
tags: architecture, capacity, durability, rpo, rto
prerequisites: offline-agent-capstone, measure-the-writer-envelope
safety: locking
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 40
revision: 3

## Overview
Assess SQLite for a one-host agent with two producers, a growing event history and a recoverable local queue. A controlled contention experiment and restore rehearsal show which latency and recovery costs can be measured locally, and which requirements need sustained-load evidence or a separate failure domain.

## Syntax breakdown
### In plain terms

Use this workload brief: two producers append events, a worker claims jobs, and readers inspect
recent state. The local device can be offline; loss of its host is a separate failure to plan for.
Append rate, p95 latency, tolerated loss of acknowledged operations, backup age and recovery deadline
are distinct requirements. The small test below measures one controlled lock hold with a 100 ms busy
timeout and one restore path. It does not establish a p95 latency distribution or sustained capacity;
the writer-envelope lesson supplies the separate persistent-worker measurement method.

```text
producer A -- holds writer --+--> local SQLite file --> local backup --> restored file
producer B -- waits/fails ---+          |
                                     host loss affects all three local files
```

The writer experiment measures admission under contention. The local restore checks copying and
validation; keeping another file on the same host does not make acknowledged writes survive loss
of that host. An independent copy or replicated receiver introduces its own publication delay and
recovery procedure, which this local experiment does not measure.

### What you are learning

- Requirements, observed results and inferred guarantees are separate parts of an architecture.
- A busy timeout spends a latency budget; it does not create writer capacity. A long critical section
  can violate that budget even when a small uncontended query is fast.
- RPO includes backup age, publication lag and failure domain. RTO includes finding a usable copy,
  restoring it and validating domain state, not merely timing a file copy.

### Piece by piece

- **set -eu**, **printenv**, **case**, **dirname**, **test**, and **mktemp -d** (shell controls):
  Stop on unexpected failures/unset variables, require an absolute lab path, and allocate a unique
  evidence directory under its parent. The learner's main database is not reset. The printed path
  contains only this experiment's databases and evidence files.
- **sqlite3 -bail / <<'SQL'** (CLI and shell input): A quoted heredoc sends literal SQL; -bail
  stops at an unexpected SQL error. Each invocation owns its connection and transaction boundary.
- **BEGIN IMMEDIATE / ROLLBACK** (writer ownership): The holder reserves the file's writer until
  the shell sends ROLLBACK. The contender's standalone INSERT either commits or fails at admission.

- **PRAGMA synchronous=FULL** (connection policy): Explicitly initialize the measured writer.
  This is the experiment's setting, not a preselected final architecture; measure other accepted
  policies separately and justify their persistence contracts.
- **EXPLAIN QUERY PLAN / CREATE INDEX / ANALYZE** (access-path evidence): Capture the lookup
  mechanism for a fixed tenant. The expected 50 matches check the dataset; the plan does not establish
  the two-producer workload's latency or throughput.
- **mkfifo / .print HELD / timeout via busy_timeout** (contention measurement): Hold a known writer
  reservation until explicitly released, and time a second connection's bounded INSERT attempt.
  Because that INSERT is its own transaction, a failed admission cannot fall through into COMMIT.
- **date +%s%N / arithmetic / stat -c %s** (measurements): Record wall-clock elapsed nanoseconds,
  convert to milliseconds, and label database bytes. Scheduling and observation overhead remain in
  the measurement; the small controlled sample is not a p95 latency distribution.
- **.backup / integrity_check / count(*)** (restore rehearsal): Take the backup before starting
  the restore timer, then time restoration and structural/domain verification. The source-selection
  and off-host retrieval delays are explicitly unmeasured here.
- **rm -r -- "$lab"** (cleanup): Remove the unique directory created by this Run block after
  inspecting its evidence. Keep this shell's lab variable; never substitute an unrelated path.

## Caution
All generated files remain in the unique evidence directory until the cleanup below. Host-specific timings are observations; a small restore cannot establish a large deployment's RTO.

## Run
```sh
set -eu
lab_db=$(printenv TUTOR_SQLITE_DB)
case "$lab_db" in /*.db) ;; *) echo 'Set TUTOR_SQLITE_DB to an absolute disposable .db path' >&2; exit 2;; esac
lab_parent=$(dirname -- "$lab_db")
test "$lab_parent" != /
test -d "$lab_parent"
case "$lab_parent" in *"'"*|*'"'*) echo 'Use a lab path without quote characters for this SQL/shell transport' >&2; exit 2;; esac
lab=$(mktemp -d "$lab_parent/offline.XXXXXX")
echo "evidence_directory=$lab"

db=$lab/workload.db
sqlite3 -bail "$db" <<'SQL'
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
CREATE TABLE events(id INTEGER PRIMARY KEY,tenant INTEGER,payload TEXT);
WITH RECURSIVE n(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<5000)
INSERT INTO events SELECT x,x%100,'event-'||x FROM n;
CREATE INDEX by_tenant ON events(tenant);
ANALYZE;
SQL
sqlite3 "$db" 'SELECT sqlite_version(); EXPLAIN QUERY PLAN SELECT payload FROM events WHERE tenant=7; SELECT count(*) FROM events WHERE tenant=7;' >"$lab/query-evidence.txt"
grep -q 'by_tenant' "$lab/query-evidence.txt"
grep -Fxq '50' "$lab/query-evidence.txt"
mkfifo "$lab/holder.fifo"
exec 3<>"$lab/holder.fifo"
sqlite3 -bail "$db" <"$lab/holder.fifo" >"$lab/holder.log" 2>&1 &
holder=$!
trap 'kill "$holder" 2>/dev/null || true; wait "$holder" 2>/dev/null || true' EXIT HUP INT TERM
printf '%s\n' 'PRAGMA synchronous=FULL; BEGIN IMMEDIATE;' '.print HELD' >&3
n=0
until grep -q HELD "$lab/holder.log"; do n=$((n+1)); test "$n" -lt 200; sleep 0.02; done
start=$(date +%s%N)
if sqlite3 -bail "$db" "PRAGMA synchronous=FULL; PRAGMA busy_timeout=100; INSERT INTO events(tenant,payload) VALUES(7,'contender');" >"$lab/contention.txt" 2>&1; then
  echo 'unexpected: second writer admitted' >&2; exit 1
else
  grep -q 'database is locked' "$lab/contention.txt"
fi
end=$(date +%s%N)
wait_ms=$(( (end-start)/1000000 ))
printf '%s\n' 'ROLLBACK;' '.quit' >&3
exec 3>&-
wait "$holder"
trap - EXIT HUP INT TERM
sqlite3 -bail "$db" "PRAGMA synchronous=FULL; INSERT INTO events(tenant,payload) VALUES(7,'after-release');"
test "$(sqlite3 "$db" 'SELECT count(*) FROM events;')" = 5001
sqlite3 "$db" ".backup '$lab/backup.db'"
start=$(date +%s%N)
sqlite3 "$lab/backup.db" ".backup '$lab/restored.db'"
test "$(sqlite3 "$lab/restored.db" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$lab/restored.db" 'SELECT count(*) FROM events;')" = 5001
end=$(date +%s%N)
restore_ms=$(( (end-start)/1000000 ))
{
  echo "busy_wait_ms=$wait_ms configured_budget_ms=100"
  echo "restore_and_checks_ms=$restore_ms restored_rows=5001"
  stat -c 'source_main_bytes=%s' "$db"
  echo 'unmeasured=off-host retrieval, backup age/publication lag, sustained load, full job workload'
} >"$lab/operational-evidence.txt"
cat "$lab/operational-evidence.txt"
```

## Expected result
query-evidence.txt contains the by_tenant plan and 50 initial matches. The second writer encounters a verified busy error near its 100 ms configured budget; after release, the append succeeds. Restore and domain checks recover 5001 rows. operational-evidence.txt records actual wait/restore times and explicitly unmeasured work. The holder has exited and its descriptor is closed. A longer busy timeout could turn a brief contention error into a longer wait, but it would not increase writer capacity.

### Cleanup

After inspecting the evidence and the optional comparison below, remove only this run's directory
from the same shell that ran the experiment:

```sh
rm -r -- "$lab"
```

## Systems lens
Architecture is the match between a workload's requirements and a component's measured and documented guarantees. SQLite can own local durable state while other components own transport or host-loss resilience. The decision should make those responsibilities explicit and identify the evidence that would change it.

## Optional variation
Compare two requirement sets against the same evidence. A single-device offline tool can use the
local file for durable state and a backup for recovery within the backup's loss window. A service
requiring acknowledged writes to survive immediate host loss also needs the acknowledgement to
depend on persistence in an independent failure domain. The local file and indexing can remain
useful, but a same-host backup does not satisfy that requirement. Measure publication delay,
sustained contention, retrieval and complete recovery separately before relying on either design.
