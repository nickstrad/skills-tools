import { code, type Module } from "../../../src/types.ts";
import {
  deliveryProtocol,
  mergeExplanation,
  mergeProtocol,
  offlineLab,
  shellExplanation,
} from "./offline-protocol.ts";

export const LOCAL_SYSTEMS: Module = {
  category: "local-systems",
  title: "Independent local histories and offline reconciliation",
  lessons: [
    {
      slug: "local-oplog",
      title: "Give an offline mutation an identity and a durable history",
      revision: 3,
      difficulty: "intermediate",
      tags: ["oplog", "outbox", "atomicity", "device-generation"],
      prerequisites: ["idempotent-retry-ledger"],
      overview:
        "An offline writer cannot ask a central server for its next operation number. Give one device generation its own sequence, and commit the sequence advance, document edit, and delivery intent together. A rollback must undo all three: otherwise the next receiver sees either an unexplained gap or an operation describing a change that never happened.",
      syntaxBreakdown: code`### In plain terms

PostgreSQL's outbox lesson established why state and delivery intent belong in one transaction.
Here the application also owns an offline history. An origin such as device-a/g1 names one device
generation; its sequence orders that origin's mutations without pretending to order other devices.
The transaction below first succeeds and then aborts, so you can inspect exactly which facts survive.

### What you are learning

- A durable operation identity is the pair of origin and sequence. Retransmission keeps that pair
  and its payload unchanged; a new identity means a new operation.
- Sequence allocation is application state. It must commit with the mutation and its log entry.
- A generation separates a device's histories across destructive reset or restore. Later lessons
  show why reopening an old file can make a formerly safe local counter unsafe to reuse.

### Piece by piece

- **device** (local metadata table): Stores an origin, next sequence, and logical clock. Unlike a
  timestamp from the operating system, this clock is a version the application advances deliberately.
- **PRIMARY KEY(origin,seq) / WITHOUT ROWID** (identity constraint and layout): Make one B-tree
  keyed by the operation identity. Its uniqueness protects the ledger inside this database file.
- **BEGIN IMMEDIATE** (transaction command): Reserves this file's writer before allocating an
  identity. Another local connection cannot allocate the same counter value concurrently.
- **UPDATE ... clock=clock+1 / INSERT SELECT** (state transition): Edit the note, copy the current
  identity and payload into the log, then advance next_seq. The log's clock records the committed edit.
- **COMMIT / ROLLBACK** (transaction boundaries): The second attempt reaches all three tables but
  rolls back. Read the note, next_seq and log count afterward; checking only the note would miss a gap.
- **printf** and **ORDER BY** (SQL formatting and ordering): Render the pair as a readable operation
  ID and display sequence order explicitly. SQL's default row order is not the protocol's ordering.
`,
      setup: code`PRAGMA journal_mode=WAL;
DROP TABLE IF EXISTS local_oplog;
DROP TABLE IF EXISTS local_notes;
DROP TABLE IF EXISTS device;
CREATE TABLE device(origin TEXT PRIMARY KEY NOT NULL,next_seq INTEGER NOT NULL,clock INTEGER NOT NULL);
INSERT INTO device VALUES('device-a/g1',1,0);
CREATE TABLE local_notes(id INTEGER PRIMARY KEY,body TEXT NOT NULL);
INSERT INTO local_notes VALUES(1,'draft');
CREATE TABLE local_oplog(origin TEXT NOT NULL,seq INTEGER NOT NULL,clock INTEGER NOT NULL,
 note_id INTEGER NOT NULL,body TEXT NOT NULL,acknowledged INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(origin,seq)) WITHOUT ROWID;`,
      code: code`BEGIN IMMEDIATE;
UPDATE device SET clock=clock+1;
UPDATE local_notes SET body='offline edit';
INSERT INTO local_oplog(origin,seq,clock,note_id,body)
 SELECT origin,next_seq,clock,id,body FROM device CROSS JOIN local_notes;
UPDATE device SET next_seq=next_seq+1;
COMMIT;
SELECT printf('%s:%d',origin,seq) AS operation_id,clock,body,acknowledged FROM local_oplog;
BEGIN IMMEDIATE;
UPDATE device SET clock=clock+1;
UPDATE local_notes SET body='aborted edit';
INSERT INTO local_oplog(origin,seq,clock,note_id,body)
 SELECT origin,next_seq,clock,id,body FROM device CROSS JOIN local_notes;
UPDATE device SET next_seq=next_seq+1;
ROLLBACK;
SELECT body AS committed_body,next_seq,clock,(SELECT count(*) FROM local_oplog) AS durable_ops
 FROM local_notes CROSS JOIN device;`,
      expectedResult:
        "The committed operation is device-a/g1:1, clock 1, body offline edit, acknowledged 0. After the aborted attempt, committed_body is offline edit, next_seq is 2, clock is 1 and durable_ops is 1. Neither a sequence gap nor an intent for the aborted edit remains.",
      systemsLens:
        "An embedded database can own the durable prefix of a disconnected device's history. SQLite makes local allocation and intent atomic; the application still defines identity, generation changes, delivery and merge policy. A local operation log is not SQLite's WAL and does not inherit a replication protocol from it.",
      challenge:
        "Move only the next_seq update outside the transaction and abort the edit. Predict the receiver's next missing sequence. Then explain which retained metadata a restored device would need before it could safely continue using device-a/g1.",
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 20,
    },
    {
      slug: "outbox-replay-after-crash",
      title: "Kill the sender after the receiver commits",
      revision: 3,
      difficulty: "advanced",
      tags: ["outbox", "crash-recovery", "idempotency", "deduplication"],
      prerequisites: ["local-oplog"],
      overview:
        "Commit an effect in a receiver's database, then actually terminate the sender before its acknowledgement can commit. On restart the sender must repeat an operation whose outcome it cannot infer from its own file. The receiver's transaction couples the debit and receipt, so repeated transport does not repeat the local debit.",
      syntaxBreakdown: code`### In plain terms

The interesting failure occurs after success somewhere else. The receiver has accepted the debit,
but the sender still sees pending work. We use two files and separate CLI processes so there is no
accidental transaction joining those facts. A ready marker selects the failure point; SIGKILL ends
only the owned sender process. This is a same-host model of independent commit boundaries, not a
demonstration of a network partition or host-loss tolerance.

### What you are learning

- Receiver effect and receipt commit together. Recording a receipt before an unprotected effect
  would allow a crash to turn deduplication into lost work.
- An acknowledgement gap creates uncertainty at the sender even when the receiver is correct.
- Retries carry an immutable identity and payload; receiver-side validation is what makes replay safe.

### Piece by piece
` + shellExplanation + code`
- **mkfifo**, **exec 3<>**, **>&3**, and **$!** (process coordination): The FIFO feeds a live sender
  CLI. Descriptor 3 holds it open and $! captures that exact child's PID. The sender prints a marker
  after delivery; the parent waits for that evidence before killing it. A counter bounds readiness.
- **.shell sh ...**, **.print**, **kill -KILL**, **wait**, and **trap** (failure injection): The
  sender invokes the lab receiver script and reports completion, but receives no acknowledgement SQL
  before termination. wait collects its status. The trap reaps only the captured child if a check fails.
- **COALESCE(sum(...),0)** and **NOT EXISTS** (effect gate): Subtract amounts only for identities
  absent from receipts. A duplicate contributes zero. Inserting receipts and updating the balance
  share one transaction; the guard rejects a changed amount under an existing ID.
- **test** (shell assertion): Compare actual status, pending state, balance and receipt count.
  A printed success marker is reached only after every invariant passes.
`,
      code: offlineLab + deliveryProtocol + code`
sender=$lab/sender.db
receiver=$lab/receiver.db
init_receiver "$receiver"
sqlite3 -bail "$sender" "CREATE TABLE outbox(op_id TEXT PRIMARY KEY,amount INTEGER,sent INTEGER); INSERT INTO outbox VALUES('a/g1:1',10,0);"
sqlite3 "$sender" "SELECT 'INSERT INTO incoming VALUES(' || quote(op_id) || ',' || amount || ');' FROM outbox WHERE sent=0;" >"$lab/batch.sql"
# Materialize exactly the delivery SQL the worker must run before acknowledging.
{
  echo 'CREATE TEMP TABLE incoming(op_id TEXT PRIMARY KEY,amount INTEGER);'
  cat "$lab/batch.sql"
  echo 'BEGIN IMMEDIATE;'
  echo 'UPDATE account SET balance=balance-(SELECT amount FROM incoming) WHERE NOT EXISTS(SELECT 1 FROM receipts r JOIN incoming i USING(op_id));'
  echo 'INSERT INTO receipts SELECT * FROM incoming;'
  echo 'COMMIT;'
} >"$lab/first-delivery.sql"
printf 'sqlite3 -bail "%s" < "%s"\n' "$receiver" "$lab/first-delivery.sql" >"$lab/receive.sh"
mkfifo "$lab/sender.commands"
exec 3<>"$lab/sender.commands"
sqlite3 -bail "$sender" <"$lab/sender.commands" >"$lab/sender.log" 2>&1 &
worker=$!
trap 'kill -KILL "$worker" 2>/dev/null || true; wait "$worker" 2>/dev/null || true' EXIT HUP INT TERM
printf '.shell sh "%s"\n.print RECEIVER_COMMITTED\n' "$lab/receive.sh" >&3
attempt=0
until grep -q RECEIVER_COMMITTED "$lab/sender.log"; do
  attempt=$((attempt+1)); test "$attempt" -lt 200; sleep 0.02
done
test "$(sqlite3 "$receiver" 'SELECT balance FROM account;')" = 90
kill -KILL "$worker"
set +e
wait "$worker"
killed_status=$?
set -e
trap - EXIT HUP INT TERM
exec 3>&-
test "$killed_status" -eq 137
test "$(sqlite3 "$sender" 'SELECT sent FROM outbox;')" = 0
echo "sender_killed=$killed_status receiver_balance=90 sender_pending=1"
deliver "$receiver" "$lab/batch.sql"
sqlite3 -bail "$sender" "UPDATE outbox SET sent=1 WHERE op_id='a/g1:1';"
test "$(sqlite3 "$receiver" 'SELECT balance FROM account;')" = 90
test "$(sqlite3 "$receiver" 'SELECT count(*) FROM receipts;')" = 1
test "$(sqlite3 "$sender" 'SELECT sent FROM outbox;')" = 1
echo 'replay_balance=90 receipts=1 sender_acknowledged=1'
`,
      expectedResult:
        "The sender exits with SIGKILL status 137 after receiver_balance=90 while sender_pending=1. The retry prints new_receipts=0 (the CLI prints the value 0), and the checked final line is replay_balance=90 receipts=1 sender_acknowledged=1. Inspect sender.log and the two files in the printed evidence directory. A shell 'Killed' diagnostic is expected; other errors are not.",
      systemsLens:
        "A local transaction resolves facts inside one participant. A protocol resolves uncertainty between participants. Stable request identity lets the receiver answer the same request again without repeating a committed local effect; it does not make an email or external API call atomic with this database.",
      challenge:
        "Move the receipt insert into a later transaction and place the kill between the debit and receipt. Predict the balance after replay. Identify the corresponding failure window if the protected effect were an HTTP request instead of the account row.",
      caution:
        "The script kills only its captured child and retains all files in a fresh evidence directory. Do not substitute a PID from another process. SIGKILL tests process recovery, not a power failure.",
      safetyLevel: "dangerous",
      runIn: "shell",
      estimatedMinutes: 30,
    },
    {
      slug: "durable-job-claims",
      title: "Release the writer while a job runs, then fence a late completion",
      revision: 3,
      difficulty: "advanced",
      tags: ["queues", "leases", "fencing", "optimistic-concurrency", "locking"],
      prerequisites: ["immediate-reserves-writer"],
      overview:
        "Use the single writer briefly to assign a job, then release it before doing the work. A second worker can claim another job while the first is running. When a lease expires, a higher token allows takeover while the completion predicate prevents the old worker from overwriting the new result.",
      syntaxBreakdown: code`### In plain terms

PostgreSQL's SKIP LOCKED queue lets workers claim different rows concurrently. SQLite instead
serializes the short ownership changes for this file. Holding its writer for the duration of a job
would block unrelated claims too. The experiment separates claim, work and completion, then advances
a logical test clock so takeover and a stale result happen in a deterministic order.

### What you are learning

- A lease permits recovery of abandoned work. Its deadline does not stop an old process from running.
- A token identifies the current ownership generation; a conditional completion is a compare-and-swap.
- The guarded row is the protected resource. An external effect would need its own identity/token check.

### Piece by piece

- **.timeout 100** (connection busy budget): Bound B's initial attempt to reserve the writer at
  100 ms. Read the busy error as failed admission, not proof that B owns any job.
- **BEGIN IMMEDIATE / COMMIT** (claim boundary): Reserve the writer while selecting and updating a
  job. The first COMMIT releases it before the simulated work interval.
- **UPDATE ... WHERE id=(SELECT ... LIMIT 1) RETURNING** (claim): Pick one queued row, record owner,
  increment token, and display the resulting ownership. ORDER BY makes the selection reproducible.
- **lease_until<=200** (logical deadline): The test treats 200 as now and 100 as expired. It avoids
  a timing race and says nothing about clock synchronization between real hosts.
- **WHERE owner=... AND token=... AND state='claimed'** (completion fence): Recheck ownership at
  the resource itself. A zero-row update is a stale result, not a successful completion.
- **changes()** (last write count): Query it immediately after each guarded write. One means the
  resource accepted the transition; zero means the expected owner/version no longer matched.
`,
      setup: code`PRAGMA journal_mode=WAL;
DROP TABLE IF EXISTS durable_jobs;
CREATE TABLE durable_jobs(id INTEGER PRIMARY KEY,state TEXT NOT NULL,owner TEXT,
 token INTEGER NOT NULL DEFAULT 0,lease_until INTEGER,result TEXT);
INSERT INTO durable_jobs(id,state) VALUES(1,'queued'),(2,'queued');`,
      code: code`-- Session A
BEGIN IMMEDIATE;
UPDATE durable_jobs SET state='claimed',owner='a',token=token+1,lease_until=100
 WHERE id=(SELECT id FROM durable_jobs WHERE state='queued' ORDER BY id LIMIT 1)
 RETURNING id,owner,token;
-- Session B
.timeout 100
BEGIN IMMEDIATE;
-- Session A
COMMIT;
.print A is doing slow work with no open write transaction
-- Session B
BEGIN IMMEDIATE;
UPDATE durable_jobs SET state='claimed',owner='b',token=token+1,lease_until=300
 WHERE id=(SELECT id FROM durable_jobs WHERE state='queued' ORDER BY id LIMIT 1)
 RETURNING id,owner,token;
COMMIT;
UPDATE durable_jobs SET owner='b',token=token+1,lease_until=300
 WHERE id=1 AND state='claimed' AND lease_until<=200;
SELECT 'takeover',changes();
-- Session A
UPDATE durable_jobs SET state='done',result='late-a'
 WHERE id=1 AND owner='a' AND token=1 AND state='claimed';
SELECT 'stale_completion',changes();
-- Session B
UPDATE durable_jobs SET state='done',result='current-b'
 WHERE id=1 AND owner='b' AND token=2 AND state='claimed';
SELECT 'current_completion',changes();
SELECT id,state,owner,token,result FROM durable_jobs ORDER BY id;`,
      expectedResult:
        "A claims 1|a|1. B's first BEGIN reports database is locked after its bounded wait. After A commits, B claims 2|b|1 while A's work is unfinished. Takeover reports 1, stale_completion 0, current_completion 1; job 1 ends done|b|2|current-b, and job 2 remains claimed by b with token 1.",
      systemsLens:
        "The throughput cost of a single writer depends on the duration of serialized state transitions, not the duration of the jobs they describe. Lease expiry restores liveness; a predicate checked by the protected resource preserves safety after takeover.",
      challenge:
        "Hold A's claim transaction open while it does its work. Predict what happens to B even though B wants a different job. Then omit the token predicate from completion and demonstrate the stale-write failure on a disposable row.",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 25,
    },
    {
      slug: "duplicate-and-lost-ack",
      title: "Reject identity reuse while retrying an independent receiver",
      revision: 3,
      difficulty: "advanced",
      tags: ["deduplication", "idempotency", "outbox", "consistency"],
      prerequisites: ["outbox-replay-after-crash"],
      overview:
        "Replay a batch whose acknowledgement was lost, then submit a different debit under its existing identity. The receiver must distinguish a duplicate from conflicting intent. Its receipt is the durable accepted set; the sender's acknowledgement is updated only after the receiving transaction succeeds.",
      syntaxBreakdown: code`### In plain terms

A unique key alone cannot tell whether a repeated request means the same thing. The receiver below
stores the original amount beside the identity and checks it before changing state. There is no
global transaction and no ATTACH: one connection accepts a batch, and another later records that
acknowledgement. With no ordering-dependent operations in this debit example, the receipt set is
sufficient receive progress; the next lesson introduces contiguous cursors where order matters.

### What you are learning

- Retryable delivery needs identity, immutable content and a receiver-side atomic boundary.
- A lost acknowledgement leaves pending work that is safe to resend; conflicting content is a
  protocol error that must remain visible to the sender.
- An expected rejection must have the expected error and unchanged state. Any nonzero exit is not
  automatically proof that your validation rule worked.

### Piece by piece
` + shellExplanation + code`
- **quote(op_id)** (SQLite function): Generate literal SQL for the small trusted fixture without
  breaking an identity containing a quote. This laboratory transport is not a production RPC format.
- **COALESCE(sum(...),0)** (new-effect calculation): Sum only identities missing from receipts.
  A fully duplicate batch has no new rows, so its amount is zero instead of NULL.
- **if deliver ...; then ...; else ...; fi**, **grep -q**, and **test** (rejection checks): Capture
  the exact CHECK error, verify nonzero status, then reopen and compare the balance and receipt count.
  The sender acknowledgement is deliberately absent on the rejection path.
`,
      code: offlineLab + deliveryProtocol + code`
sender=$lab/sender.db
receiver=$lab/receiver.db
init_receiver "$receiver"
sqlite3 -bail "$sender" "CREATE TABLE pending(op_id TEXT PRIMARY KEY,amount INTEGER,acked INTEGER); INSERT INTO pending VALUES('a/g1:1',10,0),('a/g1:2',5,0);"
sqlite3 "$sender" "SELECT 'INSERT INTO incoming VALUES(' || quote(op_id) || ',' || amount || ');' FROM pending ORDER BY op_id;" >"$lab/batch.sql"
deliver "$receiver" "$lab/batch.sql"
test "$(sqlite3 "$sender" 'SELECT sum(acked) FROM pending;')" = 0
echo 'ack_lost sender_acked=0'
deliver "$receiver" "$lab/batch.sql"
sqlite3 -bail "$sender" 'UPDATE pending SET acked=1;'
echo "INSERT INTO incoming VALUES('a/g1:1',99);" >"$lab/conflict.sql"
if deliver "$receiver" "$lab/conflict.sql" >"$lab/rejected.log" 2>&1; then
  echo 'unexpected: conflicting identity accepted' >&2; exit 1
else
  grep -q 'CHECK constraint failed' "$lab/rejected.log"
  echo 'identity_conflict_rejected=1'
fi
test "$(sqlite3 "$receiver" 'SELECT balance FROM account;')" = 85
test "$(sqlite3 "$receiver" 'SELECT count(*) FROM receipts;')" = 2
test "$(sqlite3 "$sender" 'SELECT sum(acked) FROM pending;')" = 2
echo 'receiver_balance=85 receipts=2 sender_acked=2'
`,
      expectedResult:
        "The first delivery prints 2 new receipts, and the duplicate prints 0 while the sender initially has zero acknowledged rows. A changed amount under a/g1:1 produces the checked CHECK constraint rejection. Final asserted state is receiver_balance=85 receipts=2 sender_acked=2; the rejected amount 99 never affects the account.",
      systemsLens:
        "An idempotency ledger is a durable assertion about the meaning of a request, not just its existence. SQLite can enforce that assertion with the local effect. Cross-participant acknowledgement remains a separate state transition, so the protocol must survive repeating it.",
      challenge:
        "Remove payload comparison and use only ON CONFLICT DO NOTHING. Which request would the sender believe was accepted after the changed-amount retry? Extend the receipt to retain a response that can be returned consistently on replay.",
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 25,
    },
    {
      slug: "ordering-conflicts-and-tombstones",
      title: "Merge independent origins, then break deletion by forgetting history",
      revision: 3,
      difficulty: "advanced",
      tags: ["ordering", "conflict-resolution", "tombstones", "retention"],
      prerequisites: ["duplicate-and-lost-ack"],
      overview:
        "Two replicas receive the same operations in different orders. Each origin has its own sequence; gaps delay only that origin, while a deterministic version rule resolves cross-origin edits. After convergence, deliberately discard a tombstone and deliver an old device's previously unseen edit to expose the history-retention assumption.",
      syntaxBreakdown: code`### In plain terms

Disconnected devices cannot allocate a shared global sequence without another protocol. We give
each origin its own consecutive numbers and use a separate logical version to choose a document's
winning value. Both replicas run the same apply_batch function; we vary delivery order, not the
application logic. The final failure demonstrates why a deletion is retained as data.

### What you are learning

- Per-origin ordering and cross-origin conflict resolution answer different questions. A cursor
  cannot resolve a concurrent edit, and a winning value cannot certify a complete receive prefix.
- Equal logical clocks require a deterministic tie-breaker. This policy gives convergence but may
  discard a user's edit; convergence is not a claim that the policy meets every application's needs.
- Tombstone collection requires a known retention horizon or a full-resync rule for stale peers.
  Receipt retention alone cannot reject an old operation that this replica has never received.

### Piece by piece
` + shellExplanation + mergeExplanation + code`
- **printf / batch SQL files** (delivery schedule): Each file contains fixed incoming rows. Sequence
  2 is delivered before 1 on one replica, and origins arrive in opposite orders on the other.
- **diff -u** (convergence check): Compare explicitly sorted document rows. Empty diff means the
  entire displayed state matches; equal row counts alone would not establish convergence.
- **DELETE FROM notes WHERE deleted=1** (deliberately unsafe collection): Remove deletion metadata
  before every possible old origin has been retired. The later c/g1 edit is new to the receipt ledger
  but older than the removed tombstone. The unsafe copy resurrects it; the retained copy rejects it.
`,
      code: offlineLab + mergeProtocol + code`
a=$lab/a.db
b=$lab/b.db
init_replica "$a"
init_replica "$b"
echo "INSERT INTO incoming VALUES('a/g1',1,1,'note','A first',0);" >"$lab/a1.sql"
echo "INSERT INTO incoming VALUES('a/g1',2,3,'note',NULL,1);" >"$lab/a2.sql"
echo "INSERT INTO incoming VALUES('b/g1',1,1,'note','B tie winner',0);" >"$lab/b1.sql"
apply_batch "$a" "$lab/a2.sql"
test "$(sqlite3 "$a" 'SELECT last_seq FROM cursors;')" = 0
test "$(sqlite3 "$a" 'SELECT count(*) FROM notes;')" = 0
echo 'gap_held cursor_a=0 notes=0'
apply_batch "$a" "$lab/b1.sql"
apply_batch "$b" "$lab/a1.sql"
apply_batch "$b" "$lab/b1.sql"
test "$(sqlite3 "$b" 'SELECT body FROM notes;')" = 'B tie winner'
echo 'equal_clock_winner=b/g1'
apply_batch "$a" "$lab/a1.sql"
apply_batch "$b" "$lab/a2.sql"
apply_batch "$a" "$lab/a2.sql"
sqlite3 "$a" 'SELECT * FROM notes ORDER BY doc;' >"$lab/a-state.txt"
sqlite3 "$b" 'SELECT * FROM notes ORDER BY doc;' >"$lab/b-state.txt"
diff -u "$lab/a-state.txt" "$lab/b-state.txt"
test "$(sqlite3 "$a" 'SELECT deleted FROM notes;')" = 1
test "$(sqlite3 "$a" "SELECT last_seq FROM cursors WHERE origin='a/g1';")" = 2
echo 'converged=1 deleted=1 a_cursor=2'
sqlite3 "$a" ".backup '$lab/unsafe.db'"
sqlite3 -bail "$lab/unsafe.db" 'DELETE FROM notes WHERE deleted=1;'
echo "INSERT INTO incoming VALUES('c/g1',1,1,'note','old unseen edit',0);" >"$lab/stale.sql"
apply_batch "$a" "$lab/stale.sql"
apply_batch "$lab/unsafe.db" "$lab/stale.sql"
test "$(sqlite3 "$a" 'SELECT deleted FROM notes;')" = 1
test "$(sqlite3 "$lab/unsafe.db" 'SELECT deleted FROM notes;')" = 0
echo 'retained_tombstone_deleted=1 premature_gc_resurrected=1'
`,
      expectedResult:
        "A's seq-2-first delivery prints gap_held cursor_a=0 notes=0. The same-clock comparison selects b/g1. Missing a/g1:1 then releases A's buffered deletion; both sorted states match with deleted=1 and a_cursor=2, including after duplicate delivery. The final checked contrast is retained_tombstone_deleted=1 premature_gc_resurrected=1.",
      systemsLens:
        "Convergence requires a deterministic state transition plus assumptions about the history still available. SQLite protects each replica's inbox, materialized state and receive cursor atomically; origin membership, logical clocks, garbage-collection horizons and conflict policy belong to the synchronization design.",
      challenge:
        "Keep both conflicting values instead of selecting one. What additional application decision would be required? Then propose a membership/expiry rule under which tombstones can be removed, and explain how an expired device rejoins without replaying ancient edits.",
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 40,
    },
    {
      slug: "restore-and-rejoin-history",
      title: "Restore an old device file without reusing its history",
      revision: 1,
      difficulty: "advanced",
      tags: ["backup", "device-generation", "oplog", "retention", "recovery"],
      prerequisites: ["ordering-conflicts-and-tombstones"],
      overview:
        "Restore a device backup taken before its latest operations while a peer still remembers them. The restored sequence counter can now assign an old identity to new intent, which the peer must reject. Reconcile retained history and move future writes to a new generation before allowing the device to write again.",
      syntaxBreakdown: code`### In plain terms

A backup can be internally correct and still be older than the world around it. Restoring one
device rewinds its counters, acknowledgements and knowledge of remote work. The other replica does
not rewind. This experiment first causes identity reuse, then makes rejoin an explicit operation:
recover retained history, advance the logical version and assign a fresh generation.

### What you are learning

- Database integrity and safe protocol identity are separate recovery requirements.
- A new generation prevents sequence reuse but does not reconstruct missing state or decide an
  edit's logical version. Those require reconciliation too.
- This recovery succeeds because a peer retains the complete needed history. Without that history,
  the protocol must define a trusted snapshot/full-resync path and retire the old origin.

### Piece by piece
` + shellExplanation + mergeExplanation + code`
- **.backup** (engine snapshot command): Capture A at seq 1, then restore into a new file. The live
  peer remains untouched. A backup's integrity does not tell you whether its sequence is still unused.
- **device.next_seq / advance_local_sequence** (local allocation state and trigger): An accepted
  local-origin inbox insert advances the counter in the same transaction as application. The old
  backup still contains 2. The experiment tries that identity with different content and checks rejection.
- **if apply_batch ... / CHECK error** (conflict test): Verify the exact reused-identity failure
  and unchanged peer state. A transport failure would not establish the same result.
- **.mode insert incoming** (lab history export): Serialize the peer's retained operations as
  INSERT statements for the common apply procedure. All six protocol fields are exported in order.
- **max(clock)+1 / new origin generation** (rejoin policy): After receiving retained history,
  make future local versions newer than observed versions and allocate under a/g2. Generation creation
  is a deliberate policy decision here; a real system needs a collision-resistant way to assign it.
`,
      code: offlineLab + mergeProtocol + code`
a=$lab/a.db
b=$lab/b.db
init_replica "$a"
init_replica "$b"
sqlite3 -bail "$a" <<'SQL'
CREATE TABLE device(origin TEXT PRIMARY KEY,next_seq INTEGER);
INSERT INTO device VALUES('a/g1',1);
CREATE TRIGGER advance_local_sequence AFTER INSERT ON inbox
 WHEN NEW.origin=(SELECT origin FROM device)
 BEGIN UPDATE device SET next_seq=max(next_seq,NEW.seq+1); END;
SQL
echo "INSERT INTO incoming VALUES('a/g1',1,1,'note','initial',0);" >"$lab/first.sql"
apply_batch "$a" "$lab/first.sql"
apply_batch "$b" "$lab/first.sql"
sqlite3 "$a" ".backup '$lab/old-backup.db'"
echo "INSERT INTO incoming VALUES('a/g1',2,2,'note','peer remembers',0);" >"$lab/later.sql"
apply_batch "$a" "$lab/later.sql"
apply_batch "$b" "$lab/later.sql"
test "$(sqlite3 "$a" 'SELECT next_seq FROM device;')" = 3
sqlite3 "$lab/old-backup.db" ".backup '$lab/restored.db'"
restored=$lab/restored.db
test "$(sqlite3 "$restored" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$restored" 'SELECT next_seq FROM device;')" = 2
echo "INSERT INTO incoming VALUES('a/g1',2,2,'note','different new intent',0);" >"$lab/reused.sql"
if apply_batch "$b" "$lab/reused.sql" >"$lab/reused.log" 2>&1; then
  echo 'unexpected: old identity accepted with new payload' >&2; exit 1
else
  grep -q 'CHECK constraint failed' "$lab/reused.log"
  echo 'restored_integrity=ok reused_identity_rejected=1'
fi
sqlite3 "$b" <<'SQL' >"$lab/history.sql"
.mode insert incoming
SELECT origin,seq,clock,doc,body,deleted FROM inbox ORDER BY origin,seq;
SQL
apply_batch "$restored" "$lab/history.sql"
sqlite3 -bail "$restored" "UPDATE device SET origin='a/g2',next_seq=1;"
sqlite3 "$restored" "SELECT 'INSERT INTO incoming VALUES(' || quote(origin) || ',' || next_seq || ',' || (SELECT max(clock)+1 FROM inbox) || ',''note'',''after rejoin'',0);' FROM device;" >"$lab/rejoined.sql"
apply_batch "$restored" "$lab/rejoined.sql"
test "$(sqlite3 "$restored" 'SELECT next_seq FROM device;')" = 2
apply_batch "$b" "$lab/rejoined.sql"
apply_batch "$b" "$lab/rejoined.sql"
sqlite3 "$restored" 'SELECT * FROM notes ORDER BY doc;' >"$lab/restored-state.txt"
sqlite3 "$b" 'SELECT * FROM notes ORDER BY doc;' >"$lab/peer-state.txt"
diff -u "$lab/restored-state.txt" "$lab/peer-state.txt"
test "$(sqlite3 "$b" 'SELECT count(*) FROM inbox;')" = 3
test "$(sqlite3 "$b" 'SELECT body FROM notes;')" = 'after rejoin'
echo 'rejoined_origin=a/g2 clock=3 unique_ops=3 converged=1'
`,
      expectedResult:
        "The restored file passes integrity_check but still proposes sequence 2. The peer rejects changed content under that old identity with CHECK constraint failed. After replaying retained history and adopting a/g2, both document states match at clock 3 with body after rejoin; repeating the new operation leaves unique_ops=3 and converged=1.",
      systemsLens:
        "Restoring a participant is a protocol event because the rest of the system retains observations the participant has forgotten. A generation fences the old identity space; reconciliation repairs its missing knowledge. Neither is supplied automatically by copying a valid SQLite file.",
      challenge:
        "Delete the peer's retained a/g1:2 history before rejoin. Can the restored device still prove a complete receive prefix? Specify which authoritative snapshot and origin-retirement rule your system would require before accepting new writes.",
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 35,
    },
  ],
};
