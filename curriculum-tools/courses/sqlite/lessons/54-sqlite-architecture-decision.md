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
Your task is to choose storage for a one-host agent with two producers, a growing event history and a recoverable local queue. First define its latency, loss and recovery budgets; then use a controlled contention experiment, the writer-envelope measurements and a restore rehearsal to assess those budgets. The script collects evidence and creates an incomplete decision record; completing the lesson requires your reasoning, not just running it.

## Syntax breakdown
### In plain terms

Use this workload brief: two producers append events, a worker claims jobs, and readers inspect
recent state. The local device can be offline; loss of its host is a separate failure to plan for.
Before running, write your required append rate, p95 latency budget, tolerated loss of acknowledged
local operations, backup loss window and recovery deadline. You choose the numerical requirements.
The small test below measures one controlled lock hold and restore path. It does not certify sustained
capacity; bring the persistent-worker samples from the capacity lesson into the decision too.

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
  is where batch files and independent databases can be inspected after the run.
- **sqlite3 -bail**, **<<'SQL'**, **echo**, **cat**, and **|** (CLI and shell input):
  A quoted heredoc sends literal SQL. The brace group writes schema, batch, and transaction SQL into
  one connection through a pipe; -bail stops at an unexpected SQL error. Closing that connection
  rolls back an unfinished transaction. Each invocation owns its own connection and commit boundary.
- **Shell functions and $1/$2** (reusable commands):
  The first argument is the destination database and the second is a batch file. They make retries
  use exactly the same application procedure. The SQL batches contain fixed, trusted lab data;
  production transport needs validated data and bound parameters, not execution of received SQL.
- **BEGIN IMMEDIATE / COMMIT** (transaction boundaries):
  Reserve only the receiving file's writer, then commit its related facts together. Sender progress
  is a different commit. A shell command finishing is not an acknowledgement transaction.
- **TEMP tables and identity_guard CHECK(ok=1)** (connection-local staging and assertion):
  Load an incoming batch, compare immutable payloads, and reject identity reuse with a constraint
  error. The conflict is observable as a nonzero process status; do not acknowledge rejected data.
- **ON CONFLICT ... DO NOTHING**, **WHERE true**, and **changes()** (targeted replay handling):
  An existing identity skips insertion only after payload validation. WHERE true disambiguates
  INSERT SELECT's UPSERT syntax. changes() counts the immediately preceding modifying statement.

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
- **ADR template** (learner artifact): Fill every requirement and cite an evidence file or source
  for each claim. The script cannot verify your reasoning; it prints the document's location, never
  a claim that an architecture has been approved.

## Caution
All generated files remain in the unique evidence directory. Keep your completed ADR separately before rerunning experiments. Host-specific timings are observations; a small restore cannot establish a large deployment's RTO.

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
printf '%s\n' '# SQLite architecture decision' '' \
 '## Workload and requirements' \
 'TODO: append rate, producers, reader lifetime, payload size, p95 latency budget.' \
 'TODO: tolerated acknowledged-write loss, backup RPO, complete recovery RTO, host-loss scope.' \
 '## Evidence and limits' \
 'TODO: cite query-evidence.txt, operational-evidence.txt, and writer-envelope transaction samples.' \
 'TODO: distinguish measured results, documented contracts and untested assumptions.' \
 '## Decision' \
 'TODO: choose ownership model, connection policy, transaction size and checkpoint placement.' \
 'TODO: specify independent backup destination, cadence, restore procedure and rejoin policy.' \
 '## Acceptance and exit criteria' \
 'TODO: name measurable pass/fail conditions and a justified alternative if requirements fail.' \
 >"$lab/architecture-adr.md"
echo "complete_your_decision=$lab/architecture-adr.md"
```

## Expected result
query-evidence.txt contains the by_tenant plan and 50 initial matches. The second writer encounters a verified busy error near its 100 ms configured budget; after release, the append succeeds. Restore and domain checks recover 5001 rows. operational-evidence.txt records actual wait/restore times and explicitly unmeasured work. architecture-adr.md remains incomplete until you fill it with requirements, measurements, justified policies and exit criteria; script success is not lesson completion.

## Systems lens
Architecture is the match between a workload's requirements and a component's measured and documented guarantees. SQLite can own local durable state while other components own transport or host-loss resilience. The decision should make those responsibilities explicit and identify the evidence that would change it.

## Optional variation
Evaluate two requirement sets against the same evidence: a single-device offline tool and a service requiring writes to survive immediate host loss. Explain which parts of your design can stay, which need another component, and what you must measure before making a production commitment.
