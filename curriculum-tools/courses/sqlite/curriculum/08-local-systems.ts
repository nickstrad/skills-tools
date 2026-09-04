import { code, type Module } from "../../../src/types.ts";

export const LOCAL_SYSTEMS: Module = {
  category: "local-systems",
  title: "Local systems and offline synchronization",
  lessons: [
    {
      slug: "transactional-outbox",
      title: "Use SQLite's one-file commit boundary for an outbox",
      difficulty: "intermediate",
      tags: ["outbox", "atomicity", "transactions", "idempotency"],
      prerequisites: ["idempotent-retry-ledger"],
      overview:
        "Use SQLite's one-file transaction to commit a domain update and the durable intent to deliver it, then roll back a second attempt. The evidence is a precise commit boundary: both tables change together inside this database file, while delivery to anything outside the file remains a later responsibility.",
      syntaxBreakdown: `
### In plain terms

This experiment asks which parts of a local state change SQLite can make atomic. The account balance and its outbox row are committed together or rolled back together, so a worker that later reads the outbox can find durable intent for every committed debit. An outbox is a table of pending delivery intent; it does not make a network or other external action part of SQLite's transaction.

### What you are learning

- **One-file commit boundary**: A SQLite transaction commits changes to the tables in this database file as one state transition, or makes none of them durable.
- **Stable operation identity**: A UNIQUE operation ID gives a retryable event an identity that can be checked again without inventing another event.
- **Delivery boundary**: The published flag records local acknowledgement state; it does not prove that a separate delivery process or remote system performed the effect.

### Piece by piece

- **DROP TABLE IF EXISTS** (SQL schema command)
  - What it is: A conditional table removal.
  - What it does here: It makes the disposable accounts and outbox tables safe to recreate when the setup is rerun.
  - What it gives us: A clean local database state; it does not affect any external system.
- **CREATE TABLE** (SQL schema command)
  - What it is: A table definition for rows SQLite stores in this file.
  - What it does here: It creates domain state in **accounts** and delivery intent in **outbox**.
  - What it gives us: Two tables whose rows can be inspected before and after each transaction.
  - The **PRIMARY KEY** columns identify rows, and **UNIQUE operation_id** rejects a second outbox row with the same operation identity.
  - **NOT NULL** and **DEFAULT 0** enforce required values and make a new event start as unpublished.
- **BEGIN** (SQL transaction command)
  - What it is: The start of a transaction, SQLite's unit of atomic local change.
  - What it does here: It groups the balance update and outbox insert into one pending state transition.
  - What it gives us: Until **COMMIT**, another connection cannot treat these writes as durable committed state.
- **UPDATE accounts** (SQL data-change statement)
  - What it is: A row mutation selected by a WHERE condition.
  - What it does here: It subtracts the debit amount from account 1 inside the open transaction.
  - What it gives us: The balance that must agree with the corresponding outbox payload after commit.
- **INSERT INTO outbox** (SQL data-change statement)
  - What it is: A new durable-intent row insertion.
  - What it does here: It records operation **op-001** and its debit payload in the same transaction as the balance change.
  - What it gives us: A row a later delivery worker can read; **published = 0** means this local row is still pending.
- **COMMIT** (SQL transaction command)
  - What it is: The successful end of a transaction.
  - What it does here: It makes the account update and outbox insert one durable SQLite commit.
  - What it gives us: The joined SELECT should show balance 85 alongside op-001.
- **SELECT ... JOIN ... USING** (SQL observation query)
  - What it is: A query that combines related rows through their shared **account_id** column.
  - What it does here: It displays domain state and delivery intent together after the commit.
  - What it gives us: One line of evidence that the committed balance and event belong to the same local transition.
- **ROLLBACK** (SQL transaction command)
  - What it is: An explicit cancellation of the current transaction.
  - What it does here: It discards the op-002 debit and its outbox insert after they have been issued but before commit.
  - What it gives us: The later **balance_after_rollback** and **durable_events** queries show which state crossed SQLite's commit boundary.
`,
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
        "SQLite's distinctive contribution here is a one-file commit boundary: domain state and delivery intent cross it together, and the rollback evidence shows exactly what stays out. That boundary is strong for a local or offline process, but it ends at the database file; a later worker, network call, broker, or remote service must provide delivery, retry, and any downstream deduplication guarantee.",
      challenge:
        "Keep the same experiment but add a delivery-attempt timestamp and inspect only rows with published = 0. Which facts can SQLite commit atomically in this file, and what evidence would you need from the delivery service before claiming the external effect happened?",
      caution:
        "The outbox is not a distributed transaction or proof of remote delivery. It records durable intent; delivery, retry, and downstream deduplication remain separate responsibilities.",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      minVersion: "3.53.4",
      revision: 2,
      estimatedMinutes: 20,
    },
    {
      slug: "outbox-replay-after-crash",
      title: "Replay across SQLite's acknowledgement gap",
      difficulty: "advanced",
      tags: ["outbox", "deduplication", "retries", "crash-recovery"],
      prerequisites: ["transactional-outbox"],
      overview:
        "Commit a worker claim, stop before its acknowledgement, and then replay the same durable row after the worker restarts. SQLite preserves the in-flight state and the receipt ledger in the local file, so the second attempt can be recognized; the acknowledgement gap still means an external effect may have happened before the process failed.",
      syntaxBreakdown: `
### In plain terms

This experiment makes the worker's acknowledgement gap visible: a claim commits in SQLite, but the worker dies before recording that it finished. A restarted worker reads the same durable local state, records one receipt keyed by the operation ID, and then safely sees a duplicate as a no-op. The receipt ledger is local SQLite evidence of accepted intent; it cannot prove that a separate email service, API, or other external resource performed exactly one effect.

### What you are learning

- **Durable state across restart**: A committed claim and its attempt count remain in the SQLite file after the worker process disappears.
- **Acknowledgement gap**: Failure between an external effect and the local acknowledgement can cause a replay, so delivery is at least once unless the effect boundary deduplicates it.
- **Receipt-ledger location**: The receipt row is stored in **delivery_receipts**, beside the replay state in this local database; its scope and durability are the scope and durability of that file.

### Piece by piece

- **DROP TABLE IF EXISTS** (SQL schema command)
  - What it is: A conditional table removal.
  - What it does here: It clears both disposable tables so the replay starts with no prior receipt.
  - What it gives us: A repeatable local failure-window experiment.
- **CREATE TABLE** (SQL schema command)
  - What it is: A definition for SQLite-managed durable rows.
  - What it does here: **outbox_replay** stores the operation, payload, status, and attempts; **delivery_receipts** stores one accepted effect per operation ID.
  - What it gives us: A place to observe the worker state and the receipt ledger separately.
  - The **PRIMARY KEY** on operation_id makes an operation identity unique in each table, while **DEFAULT** values make new work pending with zero attempts.
- **BEGIN IMMEDIATE** (SQL transaction command)
  - What it is: A transaction start that requests SQLite's writer reservation immediately.
  - What it does here: It makes the claim and later receipt/status updates short, serialized local state transitions.
  - What it gives us: A committed claim that is visible as one SQLite state change before the simulated worker death.
- **UPDATE ... RETURNING** (SQL data-change statement and result clause)
  - What it is: An update with a guarded row change that also returns the changed columns.
  - What it does here: It changes only a pending send to **in_flight**, increments attempts, and prints the claimed identity, status, and count.
  - What it gives us: The concrete claim evidence: **send-001**, **in_flight**, and **attempts = 1**.
- **COMMIT** (SQL transaction command)
  - What it is: The point where the current transaction's changes become durable in SQLite.
  - What it does here: It commits the claim before the worker-died observation, leaving no acknowledgement yet.
  - What it gives us: A restart can recover the row because the claim crossed the local commit boundary.
- **INSERT OR IGNORE** (SQL insert conflict policy)
  - What it is: An insert that skips a row when a uniqueness constraint conflicts instead of failing the statement.
  - What it does here: It inserts the receipt on the first replay and treats the same operation ID as a duplicate on the second replay.
  - What it gives us: A controlled duplicate boundary rather than a second receipt row.
- **SELECT changes()** (SQLite scalar function)
  - What it is: A function reporting rows changed by the immediately preceding INSERT, UPDATE, or DELETE.
  - What it does here: It distinguishes the first receipt insertion from the duplicate replay.
  - What it gives us: **new_effect_on_first_replay = 1** and **new_effect_on_duplicate_replay = 0**.
- **UPDATE outbox_replay ... SET status = 'done'** (SQL data-change statement)
  - What it is: A status transition for the durable local work row.
  - What it does here: It acknowledges completion in SQLite after the receipt insert succeeds.
  - What it gives us: The final **status** and **attempts** query shows the recovered row as done after one retry attempt.
- **SELECT count(*) AS logical_effects** (SQL observation query)
  - What it is: A count over the receipt ledger.
  - What it does here: It checks whether duplicate delivery produced another locally recorded effect.
  - What it gives us: **logical_effects = 1**, even though the operation was replayed.
`,
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
        "SQLite makes the worker's local state durable across restart and lets a receipt ledger enforce one local row per operation identity. The acknowledgement gap remains between that local commit and any external effect: replay is expected, and exactly-once-looking behavior requires the external effect boundary to honor the same identity or provide its own idempotency guarantee.",
      challenge:
        "Replay with a different payload and inspect the receipt ledger's existing row. What SQLite key and payload-validation rule would stop an operation ID from being reused for a different effect, and what must the external service verify before acknowledging delivery?",
      caution:
        "The SQL simulation models the failure window; it does not kill a real process or prove remote side effects are transactional. Use stable operation identities and make downstream operations genuinely idempotent.",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      minVersion: "3.53.4",
      revision: 2,
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
      minVersion: "3.53.4",
      revision: 2,
      estimatedMinutes: 25,
    },
    {
      slug: "lease-expiry-and-fencing",
      title: "Use a SQLite conditional write as a resource-side fence",
      difficulty: "advanced",
      tags: ["leases", "fencing", "optimistic-concurrency", "retries"],
      prerequisites: ["durable-job-claims"],
      overview:
        "Let worker B take over an expired row with a higher token, then submit worker A's late completion through SQLite's conditional UPDATE. The stale write changes zero rows because the resource-side row no longer carries A's token, showing exactly where SQLite can enforce fencing and where an external resource must enforce it again.",
      syntaxBreakdown: `
### In plain terms

This experiment treats the **leased_jobs** row as the protected resource. A fencing token is a monotonically increasing number attached to the current owner; a completion is accepted only when its owner, token, and state still match the row in SQLite. The zero-row stale completion is a resource-side rejection inside SQLite, but an email provider, object store, or other external resource must perform an equivalent token check at its own boundary.

### What you are learning

- **Conditional write**: An UPDATE whose WHERE clause includes the expected owner and token acts like a compare-and-swap against the current SQLite row.
- **Resource-side fencing**: The resource that accepts a completion must reject an old token after takeover, even if the stale worker is still running.
- **Boundary of SQLite fencing**: SQLite serializes and guards writes to this file only; it cannot automatically prevent a stale worker from affecting an external resource.

### Piece by piece

- **DROP TABLE IF EXISTS** (SQL schema command)
  - What it is: A conditional table removal.
  - What it does here: It resets the disposable lease row so the takeover and stale-write sequence is repeatable.
  - What it gives us: A known token and expiry from which to observe ownership changes.
- **CREATE TABLE** (SQL schema command)
  - What it is: A definition for the resource state SQLite protects.
  - What it does here: It gives each job an owner, fencing **token**, expiry, state, and result.
  - What it gives us: One row whose token and result can be inspected after every guarded write.
  - **NOT NULL** keeps ownership evidence present, while **result** remains nullable until a completion is accepted.
- **SELECT job_id, state, owner, token, lease_until** (SQL observation query)
  - What it is: A query of the current resource-side ownership record.
  - What it does here: It shows worker A's initial claim and token 1 before takeover.
  - What it gives us: The baseline against which the higher token and new owner are compared.
- **UPDATE ... WHERE lease_until <= 200** (SQL conditional data-change statement)
  - What it is: An update whose predicate must prove that the existing lease has expired.
  - What it does here: It lets worker B replace A, increments the token, and sets B's later expiry.
  - What it gives us: **takeover_rows = 1**, with worker-b and token 2 in the following SELECT.
- **SELECT changes()** (SQLite scalar function)
  - What it is: A function reporting rows changed by the immediately preceding write.
  - What it does here: It reports whether the takeover or either completion actually matched its guard.
  - What it gives us: **stale_completion_rows = 0** proves A's old token was rejected; **current_completion_rows = 1** proves B's current token was accepted.
- **UPDATE ... WHERE owner = 'worker-a' AND token = 1 AND state = 'claimed'** (SQL conditional data-change statement)
  - What it is: A completion write guarded by all of A's old ownership evidence.
  - What it does here: It attempts the late stale completion after B has taken over.
  - What it gives us: Zero changed rows, so A cannot overwrite the resource-side result in SQLite.
- **UPDATE ... WHERE owner = 'worker-b' AND token = 2 AND state = 'claimed'** (SQL conditional data-change statement)
  - What it is: The same resource-side fence evaluated with the current owner's evidence.
  - What it does here: It accepts B's completion and writes **result-b**.
  - What it gives us: One changed row and a final result owned by worker-b with token 2.
- **SELECT ... FROM leased_jobs** (SQL observation query)
  - What it is: A final read of the protected resource row.
  - What it does here: It displays the owner, token, state, and result after both completion attempts.
  - What it gives us: The durable proof that the stale result was not written.
`,
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
        "The SQLite conditional UPDATE is a resource-side fence: the row itself rejects a completion carrying an obsolete token. That is sufficient when the protected effect is committed in SQLite, but serialization of this file does not fence an email, API, object store, or other external resource; that resource must verify the token at its own boundary before applying the effect.",
      challenge:
        "Move the result into a separate SQLite table with UNIQUE job_id and keep the token in the guarded write. Then model the same completion against an external resource: what token must that resource receive and check at its own boundary before accepting a stale worker's effect?",
      caution:
        "Wall-clock expiry can jump or be misconfigured. Production leases need a clock policy, bounded durations, and a fencing check at every side-effecting boundary.",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      minVersion: "3.53.4",
      revision: 2,
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
      minVersion: "3.53.4",
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
      minVersion: "3.53.4",
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
      minVersion: "3.53.4",
      estimatedMinutes: 35,
    },
  ],
};
