import { code, type Module } from "../../../src/types.ts";

export const LOCAL_SYSTEMS: Module = {
  category: "local-systems",
  title: "Local systems and offline synchronization",
  lessons: [
    {
      slug: "transactional-outbox",
      title: "Close the dual-write gap with a transactional outbox",
      difficulty: "intermediate",
      tags: ["outbox", "atomicity", "transactions", "idempotency"],
      prerequisites: ["idempotent-retry-ledger"],
      overview:
        "Update domain state and append the message describing that update in one SQLite transaction. Then run a rollback variant to show that a failed transaction emits neither half of the intended effect.",
      syntaxBreakdown:
        "A UNIQUE operation_id gives an outbox event stable identity. BEGIN, COMMIT, and ROLLBACK define one atomic state transition. SELECT joins domain state to durable intent for inspection.",
      setup: code`
DROP TABLE IF EXISTS outbox;
DROP TABLE IF EXISTS accounts;
CREATE TABLE accounts(account_id INTEGER PRIMARY KEY, balance INTEGER NOT NULL);
CREATE TABLE outbox(event_id INTEGER PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE, account_id INTEGER NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0);
INSERT INTO accounts VALUES (1, 100);
`,
      code: code`
BEGIN;
UPDATE accounts SET balance = balance - 15 WHERE account_id = 1;
INSERT INTO outbox(operation_id, account_id, event_type, payload) VALUES ('op-001', 1, 'debit', 'amount=15');
COMMIT;
SELECT a.account_id, a.balance, o.operation_id, o.event_type, o.published FROM accounts a JOIN outbox o USING (account_id);
BEGIN;
UPDATE accounts SET balance = balance - 20 WHERE account_id = 1;
INSERT INTO outbox(operation_id, account_id, event_type, payload) VALUES ('op-002', 1, 'debit', 'amount=20');
ROLLBACK;
SELECT balance AS balance_after_rollback FROM accounts WHERE account_id = 1;
SELECT count(*) AS durable_events FROM outbox;
`,
      expectedResult:
        "The committed operation leaves balance 85 and one outbox row for op-001. The rollback variant leaves balance at 85 and durable_events at 1: neither the debit nor op-002 exists. The outbox is pending (published = 0) until a separate delivery process acknowledges it.",
      systemsLens:
        "The outbox closes the dual-write gap by placing domain state and delivery intent behind one local commit point. A later worker may deliver at least once, but it cannot observe intent for a state change that rolled back.",
      challenge:
        "Add a foreign key and a query that lists unpublished events older than a chosen timestamp. Which invariant belongs in SQLite and which belongs in the delivery service?",
      caution:
        "The outbox is not a distributed transaction or proof of remote delivery. It records durable intent; delivery, retry, and downstream deduplication remain separate responsibilities.",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      minVersion: "3.45",
      estimatedMinutes: 20,
    },
    {
      slug: "outbox-replay-after-crash",
      title: "Make an outbox replay safe after worker death",
      difficulty: "advanced",
      tags: ["outbox", "deduplication", "retries", "crash-recovery"],
      prerequisites: ["transactional-outbox"],
      overview:
        "Commit an outbox claim, stop before acknowledgement, and restart a worker against the same row. A downstream receipt ledger keyed by operation_id turns the replay into one logical effect while retaining at-least-once delivery semantics.",
      syntaxBreakdown:
        "UPDATE ... RETURNING claims and displays one row. INSERT OR IGNORE makes a replay a no-op at the receipt boundary. changes() reports whether the current statement inserted a new effect.",
      setup: code`
DROP TABLE IF EXISTS delivery_receipts;
DROP TABLE IF EXISTS outbox_replay;
CREATE TABLE outbox_replay(operation_id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE delivery_receipts(operation_id TEXT PRIMARY KEY, effect TEXT NOT NULL);
INSERT INTO outbox_replay VALUES ('send-001', 'email:welcome', 'pending', 0);
`,
      code: code`
BEGIN IMMEDIATE;
UPDATE outbox_replay SET status = 'in_flight', attempts = attempts + 1 WHERE operation_id = 'send-001' AND status = 'pending' RETURNING operation_id, status, attempts;
COMMIT;
SELECT 'worker_died_before_ack' AS event, status, attempts FROM outbox_replay WHERE operation_id = 'send-001';
BEGIN IMMEDIATE;
INSERT OR IGNORE INTO delivery_receipts(operation_id, effect) SELECT operation_id, payload FROM outbox_replay WHERE operation_id = 'send-001';
SELECT changes() AS new_effect_on_first_replay;
UPDATE outbox_replay SET status = 'done' WHERE operation_id = 'send-001';
COMMIT;
BEGIN;
INSERT OR IGNORE INTO delivery_receipts(operation_id, effect) VALUES ('send-001', 'email:welcome');
SELECT changes() AS new_effect_on_duplicate_replay;
COMMIT;
SELECT operation_id, status, attempts FROM outbox_replay;
SELECT count(*) AS logical_effects FROM delivery_receipts;
`,
      expectedResult:
        "The claim commits as status in_flight with attempts = 1, then the simulated worker death leaves it unacknowledged. The first replay inserts one receipt (new_effect_on_first_replay = 1) and marks the outbox done; the duplicate replay reports 0 new effects. The final logical_effects count is 1 even though delivery was attempted again.",
      systemsLens:
        "A crash between remote effect and local acknowledgement creates at-least-once delivery. Exactly-once-looking behavior comes from an atomic identity ledger at the effect boundary, not from pretending a process cannot fail between two systems.",
      challenge:
        "Delete the receipt and replay with a different payload. What key and validation rule would prevent an operation ID from being reused for a different effect?",
      caution:
        "The SQL simulation models the failure window; it does not kill a real process or prove remote side effects are transactional. Use stable operation identities and make downstream operations genuinely idempotent.",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      minVersion: "3.45",
      estimatedMinutes: 25,
    },
    {
      slug: "durable-job-claims",
      title: "Claim durable jobs with short write transactions",
      difficulty: "advanced",
      tags: ["queues", "leases", "locking", "transactions"],
      prerequisites: ["outbox-replay-after-crash"],
      overview:
        "Claim queued jobs with short BEGIN IMMEDIATE transactions and watch a second worker collide with the first. Worker A claims job 1 and holds the writer; worker B's admission attempt fails with a bounded busy timeout, still reads committed state, and only after A commits does B claim job 2.",
      syntaxBreakdown:
        "BEGIN IMMEDIATE reserves SQLite's single writer slot before the claim query, so contention surfaces at admission rather than mid-update. .timeout N is that session's busy budget in milliseconds and .timer on measures the wait actually spent. UPDATE ... RETURNING both changes and displays the selected job, and julianday provides a portable numeric deadline.",
      setup: code`
DROP TABLE IF EXISTS durable_jobs;
CREATE TABLE durable_jobs(job_id INTEGER PRIMARY KEY, payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued', owner TEXT, attempt INTEGER NOT NULL DEFAULT 0, lease_until REAL);
INSERT INTO durable_jobs(job_id, payload) VALUES (1, 'resize-image'), (2, 'send-report'), (3, 'refresh-cache');
`,
      code: code`
-- Session A
.timeout 100
BEGIN IMMEDIATE;
WITH next_job AS (SELECT job_id FROM durable_jobs WHERE state = 'queued' ORDER BY job_id LIMIT 1)
UPDATE durable_jobs SET state = 'claimed', owner = 'worker-a', attempt = attempt + 1, lease_until = julianday('now') + 1.0 / 1440.0 WHERE job_id IN next_job RETURNING job_id, owner, attempt, state;

-- Session B
.timeout 250
.timer on
BEGIN IMMEDIATE;
.timer off
SELECT 'B sees committed state', job_id, state, owner FROM durable_jobs ORDER BY job_id;

-- Session A
COMMIT;

-- Session B
BEGIN IMMEDIATE;
WITH next_job AS (SELECT job_id FROM durable_jobs WHERE state = 'queued' ORDER BY job_id LIMIT 1)
UPDATE durable_jobs SET state = 'claimed', owner = 'worker-b', attempt = attempt + 1, lease_until = julianday('now') + 1.0 / 1440.0 WHERE job_id IN next_job RETURNING job_id, owner, attempt, state;
COMMIT;
SELECT job_id, state, owner, attempt FROM durable_jobs ORDER BY job_id;
`,
      expectedResult:
        "Session A's claim returns job 1 for worker-a with attempt 1 while its transaction stays open. Session B's first BEGIN IMMEDIATE returns database is locked after roughly 250 ms, as measured by the timer, because A holds the writer. B's read of committed state still shows job 1 as queued with a NULL owner. After A commits, B's BEGIN IMMEDIATE succeeds and its claim must pick job 2, since job 1 is no longer queued. The final rows are job 1 claimed by worker-a, job 2 claimed by worker-b, both with attempt = 1 and a non-NULL lease_until, and job 3 still queued. No job has two owners.",
      systemsLens:
        "A durable queue separates an ownership transition from the work it authorizes. BEGIN IMMEDIATE makes admission explicit, while the lease and attempt fields make recovery and observability possible after a worker disappears.",
      challenge:
        "Make A hold the claim longer than B's budget: add `.shell sleep 0.5` inside A's open transaction, before COMMIT, to stand in for slow work done while the writer slot is held. B's 250 ms admission attempt now fails against a holder that will not release in time. What latency budget should this queue publish, and does the slow work belong inside the claim transaction at all?",
      caution:
        "A lease is not fencing by itself: a worker that holds an old lease can still finish late unless every completion checks the ownership token. The next lesson adds that guard.",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      minVersion: "3.45",
      revision: 2,
      estimatedMinutes: 25,
    },
    {
      slug: "lease-expiry-and-fencing",
      title: "Fence a stale worker after lease takeover",
      difficulty: "advanced",
      tags: ["leases", "fencing", "optimistic-concurrency", "retries"],
      prerequisites: ["durable-job-claims"],
      overview:
        "Expire worker A's lease, let worker B take over with a higher fencing token, then submit A's late completion. The stale completion must update zero rows even though A still believes it owns the job.",
      syntaxBreakdown:
        "The token column is monotonically increasing ownership evidence. UPDATE ... WHERE token = ? is a compare-and-swap guard. changes() exposes whether a stale completion was accepted.",
      setup: code`
DROP TABLE IF EXISTS leased_jobs;
CREATE TABLE leased_jobs(job_id INTEGER PRIMARY KEY, state TEXT NOT NULL, owner TEXT, token INTEGER NOT NULL, lease_until INTEGER NOT NULL, result TEXT);
INSERT INTO leased_jobs VALUES (1, 'claimed', 'worker-a', 1, 100, NULL);
`,
      code: code`
SELECT job_id, state, owner, token, lease_until FROM leased_jobs;
UPDATE leased_jobs SET state = 'claimed', owner = 'worker-b', token = token + 1, lease_until = 300 WHERE job_id = 1 AND lease_until <= 200;
SELECT changes() AS takeover_rows;
SELECT job_id, state, owner, token, lease_until FROM leased_jobs;
UPDATE leased_jobs SET state = 'done', result = 'late-a' WHERE job_id = 1 AND owner = 'worker-a' AND token = 1 AND state = 'claimed';
SELECT changes() AS stale_completion_rows;
UPDATE leased_jobs SET state = 'done', result = 'result-b' WHERE job_id = 1 AND owner = 'worker-b' AND token = 2 AND state = 'claimed';
SELECT changes() AS current_completion_rows;
SELECT job_id, state, owner, token, result FROM leased_jobs;
`,
      expectedResult:
        "Worker B's takeover changes one row and raises token to 2. Worker A's late completion changes zero rows (stale_completion_rows = 0), while B's guarded completion changes one row. The final result is result-b, owned by worker-b with token 2; the stale worker cannot overwrite it.",
      systemsLens:
        "Expiry permits progress after a failed owner; fencing prevents an old owner from acting after that progress. The monotonically increasing token is a local form of authority that downstream writes must verify.",
      challenge:
        "Move the token check into a separate result table with a UNIQUE job_id and test a duplicate completion. Which boundary must enforce the fence if the side effect is outside SQLite?",
      caution:
        "Wall-clock expiry can jump or be misconfigured. Production leases need a clock policy, bounded durations, and a fencing check at every side-effecting boundary.",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      minVersion: "3.45",
      estimatedMinutes: 20,
    },
    {
      slug: "local-oplog",
      title: "Record local mutations in an operation log",
      difficulty: "advanced",
      tags: ["oplog", "idempotency", "ordering", "atomicity"],
      prerequisites: ["lease-expiry-and-fencing"],
      overview:
        "Apply a local document mutation and append its operation metadata in one transaction. The operation ID, device sequence, payload, and acknowledgement state provide durable intent while disconnected.",
      syntaxBreakdown:
        "A composite UNIQUE(device_id, device_seq) detects sequence reuse. A separate UNIQUE(op_id) detects duplicate identity. The transaction makes the state row and oplog row appear together or not at all.",
      setup: code`
DROP TABLE IF EXISTS local_oplog;
DROP TABLE IF EXISTS local_notes;
CREATE TABLE local_notes(note_id INTEGER PRIMARY KEY, body TEXT NOT NULL, version INTEGER NOT NULL);
CREATE TABLE local_oplog(op_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, device_seq INTEGER NOT NULL, note_id INTEGER NOT NULL, payload TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0, UNIQUE(device_id, device_seq));
INSERT INTO local_notes VALUES (1, 'draft', 0);
`,
      code: code`
BEGIN;
UPDATE local_notes SET body = 'offline edit 1', version = version + 1 WHERE note_id = 1;
INSERT INTO local_oplog(op_id, device_id, device_seq, note_id, payload) VALUES ('dev-a-0001', 'device-a', 1, 1, 'body=offline edit 1');
COMMIT;
SELECT n.note_id, n.body, n.version, o.op_id, o.device_id, o.device_seq, o.acknowledged FROM local_notes n JOIN local_oplog o ON o.note_id = n.note_id;
BEGIN;
UPDATE local_notes SET body = 'should-not-commit', version = version + 1 WHERE note_id = 1;
INSERT INTO local_oplog(op_id, device_id, device_seq, note_id, payload) VALUES ('dev-a-0002', 'device-a', 2, 1, 'body=should-not-commit');
ROLLBACK;
SELECT body AS body_after_rollback, count(*) AS oplog_rows FROM local_notes CROSS JOIN local_oplog;
`,
      expectedResult:
        "The first commit shows body offline edit 1, version 1, and exactly one oplog entry with device-a sequence 1 and acknowledged = 0. The rollback leaves body offline edit 1 and oplog_rows = 1; the failed mutation has no durable intent record.",
      systemsLens:
        "An operation log is durable intent, not replication by itself. Atomic local state plus ordered identity lets a disconnected agent resume after a crash; transport, conflict policy, and compaction are separate protocols.",
      challenge:
        "Add a CHECK requiring positive device_seq and query the next contiguous unacknowledged operation for a device. What state do you need to retain after compaction?",
      caution:
        "Device sequence numbers are only ordered within a device. Do not compare them as a global clock or use an oplog as proof that another replica has applied an operation.",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      minVersion: "3.45",
      estimatedMinutes: 25,
    },
    {
      slug: "duplicate-and-lost-ack",
      title: "Survive duplicate transfer and a lost acknowledgement",
      difficulty: "advanced",
      tags: ["deduplication", "oplog", "outbox", "rpo"],
      prerequisites: ["local-oplog"],
      overview:
        "Attach two disposable SQLite files as sender and receiver. Commit a receiver receipt without advancing the sender, then retry the same operation; a unique receipt ledger makes the duplicate harmless before the sender eventually advances.",
      syntaxBreakdown:
        "ATTACH adds another database file to one connection. A transaction spanning attached databases coordinates the local file changes. INSERT OR IGNORE expresses duplicate delivery as a deliberate no-op.",
      code: code`
set -eu
db=$(printenv TUTOR_SQLITE_DB || true)
if [ -z "$db" ]; then echo 'TUTOR_SQLITE_DB must be nonempty' >&2; exit 2; fi
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
parent=$(dirname -- "$db")
if [ "$parent" = / ] || [ ! -d "$parent" ] || [ ! -w "$parent" ]; then echo 'database parent must be an existing writable non-root directory' >&2; exit 2; fi
if [ -L "$db" ] || { [ -e "$db" ] && [ ! -f "$db" ]; }; then echo 'database path must not be a symlink or non-regular file' >&2; exit 2; fi
case "$parent" in *"'"*) echo 'database parent may not contain a single quote for ATTACH safety' >&2; exit 2;; esac
db_dir=$(dirname -- "$db")
sender_db=$db_dir/sync-sender.sqlite
receiver_db=$db_dir/sync-receiver.sqlite
rm -f "$sender_db" "$receiver_db" "$sender_db-journal" "$receiver_db-journal" "$sender_db-wal" "$receiver_db-wal" "$sender_db-shm" "$receiver_db-shm"
sqlite3 "$db" <<SQL
ATTACH '$sender_db' AS sender;
ATTACH '$receiver_db' AS receiver;
.databases
CREATE TABLE sender.pending_ops(op_id TEXT PRIMARY KEY, payload TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0);
CREATE TABLE receiver.receipts(op_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
INSERT INTO sender.pending_ops VALUES ('sync-001', 'set-color=blue', 0);
BEGIN;
INSERT OR IGNORE INTO receiver.receipts(op_id, payload) SELECT op_id, payload FROM sender.pending_ops WHERE op_id = 'sync-001';
SELECT changes() AS first_delivery_rows;
COMMIT;
SELECT op_id, acknowledged FROM sender.pending_ops;
BEGIN;
INSERT OR IGNORE INTO receiver.receipts(op_id, payload) SELECT op_id, payload FROM sender.pending_ops WHERE op_id = 'sync-001';
SELECT changes() AS retry_delivery_rows;
UPDATE sender.pending_ops SET acknowledged = 1 WHERE op_id = 'sync-001' AND acknowledged = 0 AND EXISTS (SELECT 1 FROM receiver.receipts WHERE op_id = 'sync-001');
SELECT changes() AS sender_advance_rows;
COMMIT;
SELECT count(*) AS receiver_effects FROM receiver.receipts;
SELECT op_id, acknowledged FROM sender.pending_ops;
SQL
rm -f "$sender_db" "$receiver_db" "$sender_db-journal" "$receiver_db-journal" "$sender_db-wal" "$receiver_db-wal" "$sender_db-shm" "$receiver_db-shm"
`,
      expectedResult:
        "ATTACH lists sender and receiver as separate files. The first delivery inserts one receipt and the sender remains acknowledged = 0, modeling a lost acknowledgement. The retry inserts zero new receipts, then advances the sender by one row. Final receiver_effects = 1 and sender acknowledged = 1: duplicate transfer did not duplicate the logical effect.",
      systemsLens:
        "Messages and acknowledgements can each be lost, so a sender must retry and a receiver must deduplicate by stable identity. A receipt ledger is a local convergence aid, not a guarantee that an arbitrary remote side effect was reversible.",
      challenge:
        "Close and reopen the connection, then inspect both attached files. Add a payload hash and reject a reused op_id whose payload differs.",
      caution:
        "The attached sender and receiver filenames are derived as siblings of TUTOR_SQLITE_DB. Run the lesson in the disposable lab and remove only those uniquely named files when cleanup is appropriate; never attach a production database by accident.",
      safetyLevel: "writes-data",
      runIn: "shell",
      sessions: 1,
      minVersion: "3.45",
      estimatedMinutes: 30,
    },
    {
      slug: "ordering-conflicts-and-tombstones",
      title: "Make ordering, conflicts, and deletion explicit",
      difficulty: "advanced",
      tags: ["ordering", "conflict-resolution", "tombstones", "deduplication"],
      prerequisites: ["duplicate-and-lost-ack"],
      overview:
        "Deliver operations out of order and resolve concurrent edits with one deterministic rule: the greatest (logical_time, device_id) wins, with a tombstone represented as a value that participates in the same ordering. A cursor prevents applying a gap and a tombstone prevents stale resurrection.",
      syntaxBreakdown:
        "The next_seq cursor is a contiguous application boundary. INSERT OR IGNORE handles duplicate operation delivery. The tuple comparison in the guarded UPDATE is a deterministic last-writer-wins rule; deleted = 1 is a tombstone, not physical absence.",
      setup: code`
DROP TABLE IF EXISTS sync_ops;
DROP TABLE IF EXISTS sync_state;
DROP TABLE IF EXISTS replica_delivery;
DROP TABLE IF EXISTS replica_notes;
CREATE TABLE sync_state(replica TEXT PRIMARY KEY, next_seq INTEGER NOT NULL DEFAULT 1);
CREATE TABLE replica_delivery(replica TEXT NOT NULL, seq INTEGER NOT NULL, applied INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(replica, seq));
CREATE TABLE replica_notes(replica TEXT NOT NULL, note_id INTEGER NOT NULL, body TEXT, deleted INTEGER NOT NULL, logical_time INTEGER NOT NULL, device_id TEXT NOT NULL, PRIMARY KEY(replica, note_id));
CREATE TABLE sync_ops(seq INTEGER PRIMARY KEY, op_id TEXT NOT NULL UNIQUE, device_id TEXT NOT NULL, logical_time INTEGER NOT NULL, note_id INTEGER NOT NULL, body TEXT, deleted INTEGER NOT NULL DEFAULT 0);
INSERT INTO sync_state VALUES ('replica-a', 1), ('replica-b', 1);
INSERT INTO sync_ops(seq, op_id, device_id, logical_time, note_id, body, deleted) VALUES
  (1, 'a-1', 'device-a', 1, 1, 'A at t1', 0),
  (2, 'b-2', 'device-b', 2, 1, 'B at t2', 0),
  (3, 'a-3-delete', 'device-a', 3, 1, NULL, 1),
  (4, 'b-4-stale', 'device-b', 2, 1, 'late B', 0);
`,
      code: code`
INSERT INTO replica_delivery(replica, seq) VALUES ('replica-a', 2), ('replica-b', 1), ('replica-b', 3);
SELECT 'initial_gaps' AS observation, replica, next_seq, (SELECT group_concat(seq) FROM (SELECT seq FROM replica_delivery WHERE replica = sync_state.replica ORDER BY seq)) AS delivered FROM sync_state ORDER BY replica;
UPDATE sync_state SET next_seq = next_seq + 1 WHERE replica = 'replica-a' AND EXISTS (SELECT 1 FROM replica_delivery WHERE replica = 'replica-a' AND seq = sync_state.next_seq);
SELECT changes() AS advancement_with_gap;
UPDATE replica_delivery SET applied = 1 WHERE replica = 'replica-b' AND seq = 1 AND (SELECT next_seq FROM sync_state WHERE replica = 'replica-b') = 1;
INSERT INTO replica_notes VALUES ('replica-b', 1, 'A at t1', 0, 1, 'device-a');
UPDATE sync_state SET next_seq = 2 WHERE replica = 'replica-b';
SELECT 'b_stops_at_missing_seq_2' AS observation, replica, next_seq, (SELECT applied FROM replica_delivery WHERE replica = 'replica-b' AND seq = 3) AS seq3_applied FROM sync_state WHERE replica = 'replica-b';
INSERT INTO replica_delivery(replica, seq) VALUES ('replica-a', 1), ('replica-a', 3), ('replica-b', 2);
INSERT INTO replica_notes VALUES ('replica-a', 1, 'A at t1', 0, 1, 'device-a');
UPDATE replica_delivery SET applied = 1 WHERE replica = 'replica-a' AND seq = 1;
UPDATE sync_state SET next_seq = 2 WHERE replica = 'replica-a';
UPDATE replica_notes SET body = 'B at t2', deleted = 0, logical_time = 2, device_id = 'device-b' WHERE replica = 'replica-a' AND note_id = 1 AND 2 > logical_time;
UPDATE replica_delivery SET applied = 1 WHERE replica = 'replica-a' AND seq = 2;
UPDATE sync_state SET next_seq = 3 WHERE replica = 'replica-a';
UPDATE replica_notes SET body = NULL, deleted = 1, logical_time = 3, device_id = 'device-a' WHERE replica = 'replica-a' AND note_id = 1 AND 3 > logical_time;
UPDATE replica_delivery SET applied = 1 WHERE replica = 'replica-a' AND seq = 3;
UPDATE sync_state SET next_seq = 4 WHERE replica = 'replica-a';
UPDATE replica_notes SET body = 'B at t2', deleted = 0, logical_time = 2, device_id = 'device-b' WHERE replica = 'replica-b' AND note_id = 1 AND 2 > logical_time;
UPDATE replica_delivery SET applied = 1 WHERE replica = 'replica-b' AND seq = 2;
UPDATE sync_state SET next_seq = 3 WHERE replica = 'replica-b';
UPDATE replica_notes SET body = NULL, deleted = 1, logical_time = 3, device_id = 'device-a' WHERE replica = 'replica-b' AND note_id = 1 AND 3 > logical_time;
UPDATE replica_delivery SET applied = 1 WHERE replica = 'replica-b' AND seq = 3;
UPDATE sync_state SET next_seq = 4 WHERE replica = 'replica-b';
SELECT 'missing_ops_unblock' AS observation, replica, next_seq FROM sync_state ORDER BY replica;
INSERT INTO replica_delivery(replica, seq) VALUES ('replica-a', 4), ('replica-b', 4);
UPDATE replica_notes SET body = (SELECT body FROM sync_ops WHERE seq = 4), deleted = (SELECT deleted FROM sync_ops WHERE seq = 4), logical_time = (SELECT logical_time FROM sync_ops WHERE seq = 4), device_id = (SELECT device_id FROM sync_ops WHERE seq = 4) WHERE replica = 'replica-a' AND note_id = 1 AND ((SELECT logical_time FROM sync_ops WHERE seq = 4) > logical_time OR ((SELECT logical_time FROM sync_ops WHERE seq = 4) = logical_time AND (SELECT device_id FROM sync_ops WHERE seq = 4) > device_id));
SELECT changes() AS replica_a_seq4_effect;
UPDATE replica_delivery SET applied = 1 WHERE replica = 'replica-a' AND seq = 4;
UPDATE sync_state SET next_seq = 5 WHERE replica = 'replica-a' AND next_seq = 4;
UPDATE replica_notes SET body = (SELECT body FROM sync_ops WHERE seq = 4), deleted = (SELECT deleted FROM sync_ops WHERE seq = 4), logical_time = (SELECT logical_time FROM sync_ops WHERE seq = 4), device_id = (SELECT device_id FROM sync_ops WHERE seq = 4) WHERE replica = 'replica-b' AND note_id = 1 AND ((SELECT logical_time FROM sync_ops WHERE seq = 4) > logical_time OR ((SELECT logical_time FROM sync_ops WHERE seq = 4) = logical_time AND (SELECT device_id FROM sync_ops WHERE seq = 4) > device_id));
SELECT changes() AS replica_b_seq4_effect;
UPDATE replica_delivery SET applied = 1 WHERE replica = 'replica-b' AND seq = 4;
UPDATE sync_state SET next_seq = 5 WHERE replica = 'replica-b' AND next_seq = 4;
INSERT OR IGNORE INTO replica_delivery(replica, seq) VALUES ('replica-a', 4);
SELECT changes() AS duplicate_delivery_insert;
SELECT a.body AS a_body, a.deleted AS a_deleted, b.body AS b_body, b.deleted AS b_deleted, CASE WHEN a.body IS b.body AND a.deleted = b.deleted AND a.logical_time = b.logical_time AND a.device_id = b.device_id THEN 'converged' ELSE 'diverged' END AS convergence FROM replica_notes a JOIN replica_notes b ON a.note_id = b.note_id WHERE a.replica = 'replica-a' AND b.replica = 'replica-b';
SELECT replica, next_seq FROM sync_state ORDER BY replica;
`,
      expectedResult:
        "initial_gaps shows both cursors at 1 while replica-a has only seq 2 and replica-b has seq 1 and 3. advancement_with_gap is 0, proving A cannot advance over missing seq 1. After B applies seq 1, b_stops_at_missing_seq_2 shows next_seq 2 and seq3_applied 0. Delivering the missing operations moves both cursors to 4 and applies the body updates followed by the logical_time 3 tombstone. Both guarded seq-4 stale updates report 0 effects because (2, device-b) loses to the tombstone (3, device-a), but both deliveries are marked applied and both cursors become 5. duplicate_delivery_insert is 0. The final joined row has NULL bodies, deleted = 1 on both replicas, matching clocks/device IDs, and convergence = converged.",
      systemsLens:
        "Synchronization needs explicit policies for ordering, conflict resolution, deletion retention, and compaction. A cursor prevents gaps from being mistaken for progress; a tombstone preserves deletion knowledge so an old update cannot resurrect state.",
      challenge:
        "Add a third replica with a deliberately delayed seq 3. Predict which cursor and note state it can expose at each step, then design a tombstone garbage-collection horizon that cannot admit a late resurrection.",
      caution:
        "Last-writer-wins is deterministic, not inherently semantically correct. Document clock assumptions and retain tombstones long enough that delayed operations cannot arrive after their deletion evidence is discarded.",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      minVersion: "3.45",
      estimatedMinutes: 35,
    },
  ],
};
