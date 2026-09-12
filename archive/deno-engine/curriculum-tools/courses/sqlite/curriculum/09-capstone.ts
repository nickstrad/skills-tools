import { code, type Module } from "../../../src/types.ts";
import { deliveryProtocol, offlineLab, shellExplanation } from "./offline-protocol.ts";

export const CAPSTONE: Module = {
  category: "capstone",
  title: "Diagnose, compose, and decide",
  lessons: [
    {
      slug: "wal-growth-incident",
      title: "Explain a growing WAL before choosing a remedy",
      revision: 3,
      difficulty: "advanced",
      tags: ["wal", "checkpoints", "incident", "backpressure"],
      prerequisites: ["checkpoint-starvation"],
      overview:
        "A local service still accepts writes, but its WAL keeps growing and a checkpoint does not reclaim it. Collect a timeline that distinguishes writer admission, committed visibility and checkpoint progress. At the marked pause, predict which transaction must end and what evidence would falsify your diagnosis before running the recovery steps.",
      syntaxBreakdown: code`### In plain terms

An incident diagnosis should explain all the observations, not just name a familiar setting.
If writes commit while an old reader sees the same count, a blocked writer is not a sufficient
explanation for disk growth. Run the evidence phase first and stop at the printed pause. Write down
your hypothesis, the next measurement, and the smallest corrective action. The continuation tests it.

### What you are learning

- A growing WAL is a symptom with several possible causes. Committed row counts and checkpoint
  frame counts separate incoming work from work that reclamation cannot yet finish.
- An intervention should preserve data and address the resource actually being retained.
- PostgreSQL's old snapshots and replication slots also retain history, but here the retaining
  participant is a connection to a local file, without a server process catalog to inspect.

### Piece by piece

- **journal_mode=WAL / wal_autocheckpoint=0** (file mode and connection policy): Keep the observed
  backlog under explicit control. Each writing connection disables its own automatic checkpoint.
- **BEGIN / SELECT / COMMIT** (snapshot lifecycle): A's first read establishes its snapshot.
  An idle connection alone would not reproduce the same retention; a live read transaction does.
- **WITH RECURSIVE / hex(randomblob(700))** (bounded workload): Generate three batches of 200
  rows with large payloads. The fixed number of rows bounds disk use; random contents avoid assuming
  that logical payload size alone predicts storage behavior.
- **.shell stat -c '%s'** (file measurement): Inspect bytes while the connections remain open.
  Closing the last connection before measuring can change the WAL lifecycle you intend to observe.
- **wal_checkpoint(PASSIVE)** (non-waiting checkpoint): Its three columns are busy status, log
  frames and copied frames. A busy value of zero does not imply all frames were copied.
- **wal_checkpoint(TRUNCATE)** (reclamation request): After the suspected reader ends, request
  reuse and truncation. Compare both the tuple and file size, then verify the committed row count.
`,
      setup: code`PRAGMA journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;
DROP TABLE IF EXISTS incident_events;
CREATE TABLE incident_events(id INTEGER PRIMARY KEY,payload TEXT NOT NULL);`,
      code: code`-- Session A
BEGIN;
SELECT 'A_start',count(*) FROM incident_events;
-- Session B
PRAGMA wal_autocheckpoint=0;
BEGIN;
WITH RECURSIVE n(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<200)
INSERT INTO incident_events(payload) SELECT hex(randomblob(700)) FROM n;
COMMIT;
BEGIN;
WITH RECURSIVE n(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<200)
INSERT INTO incident_events(payload) SELECT hex(randomblob(700)) FROM n;
COMMIT;
BEGIN;
WITH RECURSIVE n(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<200)
INSERT INTO incident_events(payload) SELECT hex(randomblob(700)) FROM n;
COMMIT;
SELECT 'B_committed',count(*) FROM incident_events;
.shell stat -c 'wal_after_writes=%s' "$TUTOR_SQLITE_DB-wal"
PRAGMA wal_checkpoint(PASSIVE);
-- Session A
SELECT 'A_now',count(*) FROM incident_events;
.print PAUSE: record your diagnosis, predicted checkpoint result, and smallest remedy before continuing
-- Session A
COMMIT;
-- Session B
PRAGMA wal_checkpoint(TRUNCATE);
.shell stat -c 'wal_after_remedy=%s' "$TUTOR_SQLITE_DB-wal"
SELECT 'verified_rows',count(*) FROM incident_events;
PRAGMA integrity_check;`,
      expectedResult:
        "Before the pause, A_start and A_now are 0 while B_committed is 600; WAL bytes are positive and PASSIVE cannot copy all log frames. This rules out writer admission failure as the immediate cause. Ending A's read transaction allows TRUNCATE to report 0|0|0, wal_after_remedy=0, verified_rows=600 and integrity_check=ok. Frame counts depend on page size and earlier lab state.",
      systemsLens:
        "Resource growth becomes an incident when production outruns reclamation. Diagnose the consumer or snapshot retaining the history before increasing a limit. The proof of recovery includes restored progress and intact committed state, not merely a smaller file.",
      challenge:
        "Repeat with A ending its read transaction before the burst, then with a different connection holding the writer. Build a three-row diagnostic table: symptoms, distinguishing observation, and corrective action. Keep every burst bounded at 600 rows.",
      caution:
        "Finish A's transaction before leaving. Never delete the WAL to reclaim space; it may contain committed state absent from the main file.",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 30,
    },
    {
      slug: "offline-agent-capstone",
      title: "Recover an agent while preserving its local invariants",
      revision: 3,
      difficulty: "advanced",
      tags: ["architecture", "outbox", "fencing", "backup", "recovery"],
      prerequisites: ["restore-and-rejoin-history", "wal-growth-incident"],
      overview:
        "Compose the course's local boundaries into one agent: state and intent, receiver effect and receipt, ownership and fenced completion, backup and verified restore. Inject an uncommitted process death, lost acknowledgement, duplicate delivery, stale completion and damaged restore candidate. Each success line is guarded by an assertion against the actual database state.",
      syntaxBreakdown: code`### In plain terms

Each earlier experiment isolated one failure. Here several independent guarantees must hold at
once. Start by writing four invariants: a committed debit has intent, a repeated delivery has one
receiver effect, an old worker cannot complete the new owner's job, and a restore contains both
valid pages and the expected domain state. The script then challenges each invariant separately.

### What you are learning

- Composition preserves guarantees only when the relevant facts share the correct transaction.
- A verified backup is a restore input; a damaged candidate must be rejected before it replaces state.
- These copies share one host. Their successful recovery does not establish resilience to losing
  that host, and an old restored participant still needs the rejoin policy from the previous module.

### Piece by piece
` + shellExplanation + code`
- **mkfifo / exec 3<> / $! / trap** (owned-process control): Keep one writer's input open, capture
  its PID and ensure it is reaped on error. A bounded DIRTY_READY poll chooses the uncommitted failure
  point; no delay is used as proof that a transaction started.
- **kill -KILL / wait / status 137** (process crash): End only that writer. Reopening must show
  neither its uncommitted row nor a damaged database. This is not a power-loss durability test.
- **user_version** (application format metadata): A restore must recover its schema generation as
  well as rows. This test expects generation 1, whose schema the reader understands.
- **token predicate / changes()** (fenced completion): An obsolete owner changes zero rows, while
  the current generation can complete the resource. This only protects the effect stored in SQLite.
- **.backup / cp / dd bs=1 seek=100 count=8 conv=notrunc** (snapshot and deliberate damage): Create
  an engine snapshot, copy it, then zero eight bytes at the first B-tree page header in only that
  candidate. conv=notrunc preserves the rest of the copy so the experiment tests corruption detection.
- **grep / test / integrity_check / domain queries** (acceptance gates): A nonzero damaged check
  must include a malformed-image error. The intact restore must pass structural, balance, intent,
  job-result and schema checks. The summary is printed only after all gates succeed.
`,
      code: offlineLab + deliveryProtocol + code`
sender=$lab/agent.db
receiver=$lab/receiver.db
init_receiver "$receiver"
sqlite3 -bail "$sender" <<'SQL'
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA user_version=1;
CREATE TABLE account(id INTEGER PRIMARY KEY,balance INTEGER NOT NULL);
CREATE TABLE outbox(op_id TEXT PRIMARY KEY NOT NULL,amount INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0);
CREATE TABLE jobs(id INTEGER PRIMARY KEY,owner TEXT,token INTEGER,result TEXT);
INSERT INTO account VALUES(1,100);
INSERT INTO jobs VALUES(1,'a',1,NULL);
BEGIN IMMEDIATE;
UPDATE account SET balance=balance-10;
INSERT INTO outbox(op_id,amount) VALUES('a/g1:1',10);
COMMIT;
SQL
mkfifo "$lab/writer.fifo"
exec 3<>"$lab/writer.fifo"
sqlite3 -bail "$sender" <"$lab/writer.fifo" >"$lab/writer.log" 2>&1 &
writer=$!
trap 'kill -KILL "$writer" 2>/dev/null || true; wait "$writer" 2>/dev/null || true' EXIT HUP INT TERM
printf '%s\n' 'BEGIN IMMEDIATE; INSERT INTO account VALUES(2,50);' '.print DIRTY_READY' >&3
n=0
until grep -q DIRTY_READY "$lab/writer.log"; do n=$((n+1)); test "$n" -lt 200; sleep 0.02; done
kill -KILL "$writer"
set +e
wait "$writer"
crash_status=$?
set -e
trap - EXIT HUP INT TERM
exec 3>&-
test "$crash_status" = 137
test "$(sqlite3 "$sender" 'SELECT count(*) FROM account;')" = 1
test "$(sqlite3 "$sender" 'PRAGMA integrity_check;')" = ok
echo 'crash_recovery=ok uncommitted_rows=0'
sqlite3 "$sender" "SELECT 'INSERT INTO incoming VALUES(' || quote(op_id) || ',' || amount || ');' FROM outbox WHERE sent=0;" >"$lab/batch.sql"
deliver "$receiver" "$lab/batch.sql"
test "$(sqlite3 "$sender" 'SELECT sent FROM outbox;')" = 0
deliver "$receiver" "$lab/batch.sql"
sqlite3 -bail "$sender" 'UPDATE outbox SET sent=1;'
test "$(sqlite3 "$receiver" 'SELECT balance FROM account;')" = 90
test "$(sqlite3 "$receiver" 'SELECT count(*) FROM receipts;')" = 1
echo 'duplicate_delivery=one_effect balance=90 receipts=1'
sqlite3 -bail "$sender" "UPDATE jobs SET owner='b',token=2 WHERE id=1;"
stale=$(sqlite3 -bail "$sender" "UPDATE jobs SET result='late-a' WHERE id=1 AND owner='a' AND token=1; SELECT changes();")
test "$stale" = 0
sqlite3 -bail "$sender" "UPDATE jobs SET result='current-b' WHERE id=1 AND owner='b' AND token=2;"
sqlite3 "$sender" ".backup '$lab/verified.db'"
test "$(sqlite3 "$lab/verified.db" 'PRAGMA integrity_check;')" = ok
cp "$lab/verified.db" "$lab/damaged.db"
dd if=/dev/zero of="$lab/damaged.db" bs=1 seek=100 count=8 conv=notrunc status=none
if sqlite3 -bail "$lab/damaged.db" 'PRAGMA integrity_check;' >"$lab/damaged.log" 2>&1; then
  echo 'unexpected: damaged candidate accepted' >&2; exit 1
else
  grep -q 'malformed' "$lab/damaged.log"
fi
sqlite3 "$lab/verified.db" ".backup '$lab/restored.db'"
test "$(sqlite3 "$lab/restored.db" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$lab/restored.db" 'PRAGMA user_version;')" = 1
test "$(sqlite3 "$lab/restored.db" 'SELECT balance FROM account;')" = 90
test "$(sqlite3 "$lab/restored.db" 'SELECT count(*) FROM outbox WHERE sent=1;')" = 1
test "$(sqlite3 "$lab/restored.db" 'SELECT result FROM jobs;')" = current-b
echo 'stale_completion=0 damaged_candidate=rejected restore_integrity=ok restore_invariants=ok'
`,
      expectedResult:
        "The owned writer exits 137; crash_recovery=ok and uncommitted_rows=0 are asserted. Deliveries report 1 then 0 new receipts, receiver balance is 90 and receipts=1. Stale completion changes zero rows. The damaged candidate is rejected with a malformed-image error, while the verified restore passes integrity, user_version=1, balance=90, one acknowledged intent and current-b job result. A 'Killed' shell diagnostic is expected.",
      systemsLens:
        "Reliable composition follows the boundaries of authority: each participant commits the facts it owns, replay crosses between participants, and recovery verifies both storage and meaning. A list of features is not a guarantee until failure experiments show their invariants survive together.",
      challenge:
        "Restore the sender from a backup taken before acknowledgement while keeping the receiver current. Predict the replay and check it. Then explain why restoring a backup from before sequence allocation additionally requires a generation/rejoin policy.",
      caution:
        "The script creates a unique directory, kills only its child and damages only a copy. Keep the intact backup and diagnostic files until you have explained every invariant.",
      safetyLevel: "dangerous",
      runIn: "shell",
      estimatedMinutes: 45,
    },
    {
      slug: "sqlite-architecture-decision",
      title: "Choose an architecture from measured requirements",
      revision: 3,
      difficulty: "advanced",
      tags: ["architecture", "capacity", "durability", "rpo", "rto"],
      prerequisites: ["offline-agent-capstone", "measure-the-writer-envelope"],
      overview:
        "Your task is to choose storage for a one-host agent with two producers, a growing event history and a recoverable local queue. First define its latency, loss and recovery budgets; then use a controlled contention experiment, the writer-envelope measurements and a restore rehearsal to assess those budgets. The script collects evidence and creates an incomplete decision record; completing the lesson requires your reasoning, not just running it.",
      syntaxBreakdown: code`### In plain terms

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
` + shellExplanation + code`
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
`,
      code: offlineLab + code`
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
`,
      expectedResult:
        "query-evidence.txt contains the by_tenant plan and 50 initial matches. The second writer encounters a verified busy error near its 100 ms configured budget; after release, the append succeeds. Restore and domain checks recover 5001 rows. operational-evidence.txt records actual wait/restore times and explicitly unmeasured work. architecture-adr.md remains incomplete until you fill it with requirements, measurements, justified policies and exit criteria; script success is not lesson completion.",
      systemsLens:
        "Architecture is the match between a workload's requirements and a component's measured and documented guarantees. SQLite can own local durable state while other components own transport or host-loss resilience. The decision should make those responsibilities explicit and identify the evidence that would change it.",
      challenge:
        "Evaluate two requirement sets against the same evidence: a single-device offline tool and a service requiring writes to survive immediate host loss. Explain which parts of your design can stay, which need another component, and what you must measure before making a production commitment.",
      caution:
        "All generated files remain in the unique evidence directory. Keep your completed ADR separately before rerunning experiments. Host-specific timings are observations; a small restore cannot establish a large deployment's RTO.",
      safetyLevel: "locking",
      runIn: "shell",
      estimatedMinutes: 40,
    },
  ],
};
