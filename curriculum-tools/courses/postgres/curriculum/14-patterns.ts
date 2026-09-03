import { code, type Module } from "../../../src/types.ts";

export const PATTERNS: Module = {
  category: "distributed-patterns",
  title: "Distributed-systems patterns on PostgreSQL",
  lessons: [
    {
      slug: "transactional-outbox",
      tags: [
        "outbox",
        "queues",
        "skip-locked",
        "idempotency",
        "distributed-patterns",
      ],
      title: "Transactional outbox: one commit for the row and the message",
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 13 "Row-Level Locks".`,
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 20,
      prerequisites: ["skip-locked-work-queue", "atomic-abort"],
      overview: code`
The dual-write problem is the reason this pattern exists: if your handler writes a row and then
publishes an event to a broker, a crash between the two leaves the two systems disagreeing forever,
and no amount of retrying fixes it because the retry cannot know which half happened. The outbox
removes the second system from the critical path. The event is a row in the same database, written
in the same transaction, so commit-equals-visibility makes the row and the message atomic. A
separate relay then moves messages out of the table with the SKIP LOCKED claim you already built.
In this lesson you cause the whole life cycle, including the failure the pattern does NOT remove:
the relay can crash after delivering and before marking, so delivery is at-least-once and the
consumer must dedupe.`,
      syntaxBreakdown: code`
### In plain terms

This experiment asks how an application can commit a database change and an event together without pretending a broker shares the database transaction. The order and outbox rows become visible together, a relay claims the event, and a simulated crash reopens at-least-once delivery. A consumer table makes applying the same event twice harmless.

### What you are learning

- **Transactional outbox:** Store the event beside the business row so one commit controls both.
- **SKIP LOCKED:** Concurrent relays take different unsent rows without waiting.
- **At-least-once delivery:** A relay can publish and die before marking sent, so duplicates are expected.
- **Consumer idempotency:** A primary key turns a duplicate event into zero inserted rows.

### Piece by piece

- **GENERATED ALWAYS AS IDENTITY** (automatic key)
  - What it is: It assigns database-generated values to msg_id.
  - What it does here: Each event gets a stable message and dedupe ID.
  - What it gives us: RETURNING exposes msg_id to the relay and consumer.
- **sent_at** and **attempts** (delivery columns)
  - What they are: sent_at records a committed delivery mark; attempts counts tries.
  - What they do here: NULL identifies work and rollback restores attempts to zero.
  - What they give us: sent = t and attempts = 1 prove the second attempt committed.
- **payload jsonb** and **payload ->> 'event'** (structured data)
  - What they are: jsonb stores event data; ->> extracts a JSON value as text.
  - What they do here: The relay prints a simulated publication.
  - What they give us: PUBLISH order_created shows the external side effect.
- **FOR UPDATE SKIP LOCKED LIMIT 10** (claim clause)
  - What it is: FOR UPDATE locks rows; SKIP LOCKED ignores rows another relay owns; LIMIT bounds a batch.
  - What it does here: B claims work and A's competing relay sees none.
  - What it gives us: Zero rows means busy work was skipped, not permanently absent.
- **RETURNING** and **ON CONFLICT DO NOTHING** (result and dedupe clauses)
  - What they are: RETURNING emits changed rows; ON CONFLICT ignores an existing primary key.
  - What they do here: They expose relay and consumer outcomes while quiet psql suppresses command tags.
  - What they give us: One row means applied; zero means duplicate.
- **BEGIN, COMMIT, and ROLLBACK** (transaction boundaries)
  - What they are: They start, publish, or undo a transaction.
  - What they do here: The first commit publishes order and message together; rollback simulates relay death.
  - What they give us: sent_at remains NULL after rollback while publishing already happened.
- **pg_stat_user_tables.n_dead_tup**, **pgstattuple(...)**, and partial index (challenge)
  - What they are: They expose dead rows, physical bloat, and an index restricted to sent_at IS NULL.
  - What they do here: They compare deleting with marking sent.
  - What they give us: EXPLAIN shows whether sent rows are avoided.`,
      setup: code`
drop table if exists pat_outbox;
drop table if exists pat_orders;
drop table if exists pat_inbox;
create table pat_orders(id int primary key, customer text not null, amount numeric not null);
create table pat_outbox(
  msg_id bigint generated always as identity primary key,
  order_id int not null,
  payload jsonb not null,
  sent_at timestamptz,
  attempts int not null default 0);
create table pat_inbox(msg_id bigint primary key, applied_at timestamptz not null default now());`,
      code: code`
-- Session A (the application): the row and the event in ONE transaction.
begin;
insert into pat_orders values (1, 'ada', 99.00) returning id, customer;
insert into pat_outbox(order_id, payload)
  values (1, '{"event":"order_created","order_id":1}') returning msg_id, order_id;
select count(*) as visible_to_me from pat_outbox;
-- Session B (the relay): claims nothing, because nothing has committed.
select msg_id, order_id from pat_outbox
where sent_at is null order by msg_id for update skip locked limit 10;
-- Session A
commit;
-- Session B: the order and its message became visible at the same instant.
select (select count(*) from pat_orders) as orders, (select count(*) from pat_outbox) as messages;
begin;
select msg_id, order_id, payload from pat_outbox
where sent_at is null order by msg_id for update skip locked limit 10;
-- Session A: a second relay running concurrently sees no work at all.
begin;
select msg_id from pat_outbox where sent_at is null order by msg_id
for update skip locked limit 10;
commit;
-- Session B: the relay delivers to the broker, then dies before marking it sent.
select msg_id, 'PUBLISH ' || (payload ->> 'event') as side_effect from pat_outbox
where sent_at is null order by msg_id;
rollback;
-- Session B: the claim died with the transaction and the message is unsent again.
select msg_id, order_id, sent_at, attempts from pat_outbox order by msg_id;
-- Session B: attempt two. Same delivery, this time the mark commits.
begin;
update pat_outbox set sent_at = now(), attempts = attempts + 1
where msg_id = (select msg_id from pat_outbox where sent_at is null
                order by msg_id for update skip locked limit 1)
returning msg_id, attempts;
commit;
select msg_id, sent_at is not null as sent, attempts from pat_outbox order by msg_id;
-- Session B: the consumer received msg_id 1 twice. The second one is a no-op.
insert into pat_inbox(msg_id) values (1) on conflict do nothing returning msg_id;
insert into pat_inbox(msg_id) values (1) on conflict do nothing returning msg_id;
select count(*) as effects_applied from pat_inbox;`,
      expectedResult: code`
Inside A's open transaction the INSERTs return their rows (1 / ada, and msg_id 1 / order_id 1) and
visible_to_me = 1, but B's claim query returns

   msg_id | order_id
  --------+----------
  (0 rows)

- not a locked row, not a half-visible one: nothing. The message does not exist for anyone else
until the order does. After A commits, B's first query reports orders = 1 and messages = 1 in the
same snapshot, and the claim returns msg_id 1 with payload
{"event": "order_created", "order_id": 1}. While B holds that claim, Session A's competing relay
query returns (0 rows) again - SKIP LOCKED, so the second relay does not queue behind the first, it
simply finds nothing to do.

The delivery step prints

   msg_id |     side_effect
  --------+----------------------
        1 | PUBLISH order_created

and then B rolls back. The next query is the whole point of the lesson: msg_id 1 is still there
with sent_at = NULL (empty) and attempts = 0. The broker already has the event; the database does
not know it. That is the at-least-once window, and it cannot be closed - closing it would mean
committing the mark and publishing atomically, which is the dual-write problem again.

The second attempt's UPDATE returns msg_id 1 / attempts 1, and after commit the table reads
sent = t, attempts = 1. Finally the consumer's two inserts show the fix: the first returns

   msg_id
  --------
        1
  (1 row)

and the second returns (0 rows), so effects_applied = 1. Delivered twice, applied once.`,
      systemsLens: code`
The outbox is what you build when you have exactly one thing that can commit atomically and two
things that need to agree. It does not give you exactly-once delivery - nothing does across a
process boundary - it gives you exactly-once state change plus at-least-once delivery plus a dedupe
key, which is the strongest combination that is actually implementable. Everything expensive about
it is visible in this experiment: every message is a heap row and a WAL record, the claim is
another WAL record, completed rows are dead tuples for VACUUM, and the relay's throughput is
bounded by commit latency. That is the price of keeping a broker out of the write path, and it is
usually worth paying. When it is not, the same reasoning leads to change data capture, where the
log itself is the outbox (module 10) and the write path pays nothing extra at all.`,
      challenge: code`
Have the relay DELETE ... RETURNING the message instead of marking it sent, then compare
pg_stat_user_tables.n_dead_tup and pgstattuple('pat_outbox') after a few thousand messages against
the mark-as-sent version. Then add a partial index on (msg_id) WHERE sent_at IS NULL and re-check
the claim with EXPLAIN: an outbox that is only ever scanned for unsent rows should not be paying to
scan the sent ones.`,
    },
    {
      slug: "idempotency-keys",
      tags: [
        "idempotency",
        "unique-constraints",
        "retries",
        "distributed-patterns",
      ],
      title: "Idempotency keys: make the retry a no-op, not a second charge",
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 12 "Relation-Level Locks".`,
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 18,
      prerequisites: ["unique-constraint-race", "transactional-outbox"],
      overview: code`
A client that does not get an answer must retry, and it cannot tell "the request never arrived"
from "the answer was lost". So the server has to make the second request harmless. The whole
mechanism is a unique index on a key the client chooses plus ON CONFLICT DO NOTHING, which turns
"this already happened" from an error into zero rows. You will run the retry three ways - the naive
INSERT that errors, the idempotent one that no-ops, and the read-back that returns the original
answer - and then race two retries concurrently to watch the second one wait on the first
transaction's fate before it learns it lost.`,
      syntaxBreakdown: code`
### In plain terms

This experiment asks how a server makes a retry safe when a client cannot tell whether the first request succeeded. A primary key names the request, ON CONFLICT turns a repeat into a no-op, and a read-back returns the original answer. A concurrent retry waits for the first transaction's decision before learning whether it lost.

### What you are learning

- **Idempotency key:** A client-chosen name identifies one logical request across retries.
- **Unique enforcement:** The unique index serializes competing uses of a key.
- **Zero rows versus an answer:** RETURNING shows whether this attempt inserted; a read-back supplies the stored result.
- **Retry discipline:** A waiter can receive success, a no-op, or unique_violation depending on the SQL pattern.

### Piece by piece

- **pat_payments PRIMARY KEY** (uniqueness constraint)
  - What it is: It rejects two rows with the same idem_key.
  - What it does here: req-7 and req-8 stand for retried requests.
  - What it gives us: Duplicate attempts have a deterministic identity.
- **ON CONFLICT (idem_key) DO NOTHING** (conflict clause)
  - What it is: It uses the key's unique index and skips an existing row.
  - What it does here: A retry completes without charging again.
  - What it gives us: RETURNING gives one row for creation and zero for a no-op.
- **RETURNING** (result clause)
  - What it is: It emits inserted or updated rows.
  - What it does here: It exposes the original charged_at timestamp.
  - What it gives us: A client can distinguish new work from an existing result.
- **WITH ins AS (...)** (data-modifying CTE)
  - What it is: It executes the INSERT once and exposes its returned row as a temporary result.
  - What it does here: UNION ALL falls back only when ins is empty.
  - What it gives us: created = t or f tells whether this attempt charged.
- **SQLSTATE 23505 / unique_violation** (error identity)
  - What it is: The code for a duplicate unique key.
  - What it does here: The naive retry demonstrates the unsafe alternative.
  - What it gives us: Applications can classify the error without parsing prose.
- **Concurrent BEGIN, pg_sleep(1), and COMMIT** (race timing)
  - What they are: A keeps req-8 uncommitted; sleep lets B be observed; COMMIT decides the key.
  - What they do here: B's INSERT waits on A's transaction.
  - What they give us: Lock/transactionid in pg_stat_activity proves uniqueness waited for a commit.`,
      setup: code`
drop table if exists pat_payments;
create table pat_payments(
  idem_key text primary key,
  account text not null,
  amount numeric not null,
  charged_at timestamptz not null default clock_timestamp());`,
      code: code`
-- Session A: the first request. It really charges.
insert into pat_payments(idem_key, account, amount) values ('req-7', 'ada', 25.00)
on conflict (idem_key) do nothing
returning idem_key, amount, charged_at;
-- Session A: the client timed out and retried. Same key, same statement.
insert into pat_payments(idem_key, account, amount) values ('req-7', 'ada', 25.00)
on conflict (idem_key) do nothing
returning idem_key, amount, charged_at;
select count(*) as charges_for_req_7 from pat_payments where idem_key = 'req-7';
-- Session A: zero rows is not an answer a client can use. Read back instead.
with ins as (
  insert into pat_payments(idem_key, account, amount) values ('req-7', 'ada', 25.00)
  on conflict (idem_key) do nothing
  returning idem_key, amount, charged_at, true as created
)
select idem_key, amount, charged_at, created from ins
union all
select idem_key, amount, charged_at, false from pat_payments
where idem_key = 'req-7' and not exists (select 1 from ins);
-- Session A: the same retry with no ON CONFLICT clause is an outage, not a no-op.
insert into pat_payments(idem_key, account, amount) values ('req-7', 'ada', 25.00);
-- Session A: now two retries land at once. A gets there first, uncommitted.
begin;
insert into pat_payments(idem_key, account, amount) values ('req-8', 'linus', 10.00)
on conflict (idem_key) do nothing returning idem_key, amount;
-- Session B (blocks until A commits: uniqueness cannot be decided yet)
insert into pat_payments(idem_key, account, amount) values ('req-8', 'linus', 10.00)
on conflict (idem_key) do nothing returning idem_key, amount;
-- Session A
select pg_sleep(1);
select pid, wait_event_type, wait_event from pg_stat_activity where wait_event_type = 'Lock';
commit;
-- Session B: B waited on A's transaction, then found the key taken.
select idem_key, account, amount from pat_payments order by idem_key;
select count(*) as rows_total from pat_payments;`,
      expectedResult: code`
The first insert returns one row:

   idem_key | amount |           charged_at
  ----------+--------+--------------------------------
   req-7    |  25.00 | 2026-09-03 11:20:44.112446+00

The retry returns

   idem_key | amount | charged_at
  ----------+--------+------------
  (0 rows)

with charges_for_req_7 = 1: the money moved once. The CTE version returns the ORIGINAL row with
created = f - same amount, same charged_at as the first request, which is the answer the client
actually wanted. Without ON CONFLICT the identical retry fails instead:

  ERROR:  duplicate key value violates unique constraint "pat_payments_pkey"
  DETAIL:  Key (idem_key)=(req-7) already exists.

In the concurrent half, A's insert returns req-8 / 10.00 and B's identical statement blocks -
pg_stat_activity shows B's pid with wait_event_type = Lock and wait_event = transactionid, waiting
for A's xid, not for a row. Uniqueness cannot be decided until A's fate is known. When A commits, B
returns (0 rows) immediately and with no error. The final table holds exactly two rows, req-7 and
req-8, and rows_total = 2. Had A rolled back instead, B's insert would have succeeded - the
waiter's outcome is decided entirely by the other transaction's commit record.`,
      systemsLens: code`
Idempotency is not a property of an operation, it is a property of an operation plus a name. The
unique index is where "the same request" gets defined, and every design decision hides in that
definition: keys scoped per client so two customers cannot collide, keys that expire so the table
does not grow forever, and keys that cover the request body so a retry with different content is
rejected rather than silently ignored. Notice also what the concurrent case cost: a serialization
point. Every retry of a key waits for the in-flight original, which is correct but means a slow
request holds up its own retries - the head-of-line behaviour from the lock queue, now keyed by
request id. This is how payment APIs, cloud control planes and any at-least-once RPC layer make
duplicate delivery survivable, and it is why "retries are safe" is a claim about the server, never
about the client.`,
      challenge: code`
Add a request_hash column and make the retry check it: ON CONFLICT (idem_key) DO UPDATE SET
account = excluded.account WHERE pat_payments.request_hash = excluded.request_hash, then see what a
retry with a changed amount does. Then count the dead tuples DO UPDATE leaves compared with DO
NOTHING - the "harmless" retry still writes a new row version every time it fires.`,
    },
    {
      slug: "two-phase-commit",
      tags: [
        "two-phase-commit",
        "transactions",
        "durability",
        "gc-horizon",
        "recovery",
      ],
      title: "Two-phase commit: a transaction with no process",
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 3 "Pages and Tuples".`,
      difficulty: "advanced",
      safetyLevel: "dangerous",
      runIn: "mixed",
      sessions: 1,
      estimatedMinutes: 35,
      prerequisites: [
        "crash-and-redo",
        "xmin-horizon-blocks-cleanup",
        "idempotency-keys",
      ],
      overview: code`
PREPARE TRANSACTION splits COMMIT in half. The first half does everything a commit does except
become visible: it writes the changes to WAL, fsyncs them, keeps every lock, and then detaches the
whole thing from your session. What is left is a transaction with no backend, no connection and no
timeout, sitting in pg_prepared_xacts until somebody says COMMIT PREPARED or ROLLBACK PREPARED.
That is exactly the guarantee an external coordinator needs to run 2PC across several databases -
and exactly the operational hazard, because a coordinator that dies leaves a transaction that holds
locks and pins the xmin horizon forever. You will build one, watch it block a writer, watch it
stall VACUUM, kill the server underneath it, find it still there after recovery, and finally
resolve it.

The feature is off by default: max_prepared_transactions is 0 on a stock cluster, and it is a
postmaster-level setting, so turning it on needs a restart, not a reload. The lab's postgresql.conf
from module 01 already sets it to 10; the first block changes it anyway so you can watch a config
reload fail to take effect.`,
      syntaxBreakdown: code`
### In plain terms

This experiment asks what remains after a transaction is prepared but no session owns it. PREPARE makes changes durable without making them visible, then leaves locks and the transaction horizon until another session resolves the global ID. A crash and restart show that this promise survives process and server failure.

### What you are learning

- **Two-phase commit:** Preparation records a participant's promise; a later prepared commit or rollback finishes it.
- **Prepared state:** It has no client backend but still holds locks and prevents cleanup.
- **Postmaster settings:** max_prepared_transactions sizes shared memory and needs restart.
- **Recovery durability:** WAL and two-phase state files restore unresolved prepared work.

### Piece by piece

- **max_prepared_transactions** (postmaster setting)
  - What it is: It limits prepared transactions and reserves shared memory.
  - What it does here: ALTER SYSTEM changes disk configuration while reload leaves pending_restart true.
  - What it gives us: SHOW before and after restart proves reload was insufficient.
- **ALTER SYSTEM**, **pg_reload_conf()**, and **pending_restart** (configuration controls)
  - What they are: ALTER SYSTEM writes postgresql.auto.conf; reload rereads it; pending_restart flags a restart-only difference.
  - What they do here: They show running 10 while the requested value is 20.
  - What they give us: source, setting, and pending_restart explain the delayed change.
- **PREPARE TRANSACTION**, **COMMIT PREPARED**, and **ROLLBACK PREPARED** (2PC commands)
  - What they are: PREPARE detaches a transaction; the others resolve its global ID.
  - What they do here: pat-xfer-1 remains pending through a crash, then commits.
  - What they give us: Balances stay 100/100 until commit, then become 75/125.
- **pg_prepared_xacts** (prepared-transaction view)
  - What it is: It lists gid, timestamp, owner, database, and xid.
  - What it does here: It proves state remains without a session.
  - What it gives us: A gid and transaction number for recovery.
- **pg_locks virtualtransaction and pid** (lock evidence)
  - What they are: They identify ownership; pid is empty for detached state and virtualtransaction becomes -1/xid after recovery.
  - What they do here: The account update blocks and times out.
  - What they give us: A relation lock with no live process.
- **VACUUM (VERBOSE)** and **removable cutoff** (cleanup evidence)
  - What they are: Verbose vacuum reports removed and non-removable rows and its horizon cutoff.
  - What they do here: The prepared xid keeps 500 dead rows from being reclaimed.
  - What they give us: Counts and cutoff move only after COMMIT PREPARED.
- **pg_ctl stop -m immediate / start** (crash and recovery)
  - What they are: immediate stops without clean shutdown; start launches the cluster.
  - What they do here: The unresolved transaction is recovered.
  - What they give us: recovering prepared transaction in the log proves durability.`,
      caution: code`
This lesson restarts the lab cluster three times and crashes it once with SIGQUIT, and it leaves a
prepared transaction holding locks in between. Run it only against the $PGLAB cluster on port 5440,
never against the packaged cluster on 5432. An unresolved prepared transaction is a real outage
generator: it never times out, and it stops VACUUM cluster-wide.`,
      setup: code`
drop table if exists pat_2pc_accounts;
drop table if exists pat_2pc_junk;
create table pat_2pc_accounts(id int primary key, owner text, balance numeric not null);
insert into pat_2pc_accounts values (1, 'ada', 100), (2, 'linus', 100);
create table pat_2pc_junk(id int primary key, n int not null);
insert into pat_2pc_junk select g, g from generate_series(1, 1000) g;`,
      code: code`
-- Session A: a postmaster-level setting. Change it, reload, and watch nothing happen.
show max_prepared_transactions;
alter system set max_prepared_transactions = 20;
select pg_reload_conf(), pg_sleep(1);
select name, setting as running_value, pending_restart, source
from pg_settings where name = 'max_prepared_transactions';

-- ==========================================================================
-- SHELL, as the postgres OS user. Run these by hand: no lesson runner can
-- follow the server across a restart.
--
--   export PATH=/usr/lib/postgresql/16/bin:$PATH PGLAB=$HOME/pglab
--   pg_ctl -D "$PGLAB/primary" -l "$PGLAB/primary.log" restart -w
--
-- ==========================================================================

-- Session A: reconnect. Now prepare a transfer and walk away from it.
show max_prepared_transactions;
begin;
update pat_2pc_accounts set balance = balance - 25 where id = 1 returning id, balance;
update pat_2pc_accounts set balance = balance + 25 where id = 2 returning id, balance;
select pg_current_xact_id() as my_xid;
prepare transaction 'pat-xfer-1';

-- Session A: gone from this session, still very much alive in the cluster.
select gid, prepared, owner, database, transaction from pg_prepared_xacts;
select id, owner, balance from pat_2pc_accounts order by id;
select locktype, relation::regclass as rel, mode, granted, virtualtransaction, pid
from pg_locks where relation = 'pat_2pc_accounts'::regclass;

-- Session A: it still holds row locks, even though no process owns it.
set lock_timeout = '2s';
update pat_2pc_accounts set balance = 0 where id = 1 returning id;
reset lock_timeout;

-- Session A: and it still pins the xmin horizon, so VACUUM cannot clean up.
delete from pat_2pc_junk where id <= 500;
vacuum (verbose) pat_2pc_junk;

-- ==========================================================================
-- SHELL: crash the server with the prepared transaction still open.
--
--   pg_ctl -D "$PGLAB/primary" stop -m immediate
--   pg_ctl -D "$PGLAB/primary" -l "$PGLAB/primary.log" start -w
--   grep -E 'not properly|redo |recovering prepared|two-phase' \
--        "$PGLAB/primary/log/postgresql.log" | tail -6
--
-- ==========================================================================

-- Session A: reconnect after the crash. It survived.
select gid, prepared, transaction, database from pg_prepared_xacts;
select locktype, relation::regclass as rel, mode, granted, virtualtransaction, pid
from pg_locks where relation = 'pat_2pc_accounts'::regclass;
select id, owner, balance from pat_2pc_accounts order by id;

-- Session A: still blocking and still pinning, after a full crash and recovery.
set lock_timeout = '2s';
update pat_2pc_accounts set balance = 0 where id = 1 returning id;
reset lock_timeout;
vacuum (verbose) pat_2pc_junk;

-- Session A: the coordinator finally decides. Now it becomes visible.
commit prepared 'pat-xfer-1';
select id, owner, balance from pat_2pc_accounts order by id;
select count(*) as prepared_now from pg_prepared_xacts;
vacuum (verbose) pat_2pc_junk;

-- Session A: put the setting back. Leave no state behind.
alter system reset max_prepared_transactions;
select pg_reload_conf(), pg_sleep(1);
select name, setting, pending_restart from pg_settings where name = 'max_prepared_transactions';

-- ==========================================================================
-- SHELL: last restart, then confirm the cluster is clean.
--
--   pg_ctl -D "$PGLAB/primary" -l "$PGLAB/primary.log" restart -w
--   cat "$PGLAB/primary/postgresql.auto.conf"     # header comments only
--   psql -h /tmp -p 5440 -d lab -c 'show max_prepared_transactions'
--   psql -h /tmp -p 5440 -d lab -c 'select count(*) from pg_prepared_xacts'
--
-- ==========================================================================`,
      expectedResult: code`
SHOW reports 10, because module 01's postgresql.conf sets it. (A stock cluster says 0, and there
PREPARE TRANSACTION fails with "ERROR: prepared transactions are disabled / HINT: Set
max_prepared_transactions to a nonzero value." If your SHOW says 0, use 10 as the ALTER SYSTEM
value.) After ALTER SYSTEM and a reload:

              name            | running_value | pending_restart |       source
   ---------------------------+---------------+-----------------+--------------------
    max_prepared_transactions | 10            | t               | configuration file

The new value is on disk and the server has read it, yet running_value is still 10 and
pending_restart = t. That is the postmaster-level class of GUC: it sizes shared memory, so only a
restart can change it. After the restart SHOW says 20.

PREPARE TRANSACTION returns with no error and no output, and the session is no longer in a
transaction - but the transfer has NOT happened:

      gid     |           prepared            |  owner   | database | transaction
   -----------+-------------------------------+----------+----------+-------------
   pat-xfer-1 | 2026-09-03 11:25:41.361267+00 | postgres | lab      |       88814

Note that the two UPDATEs already returned their new values (1 / 75 and 2 / 125) - the changes are
real and in the WAL - yet the accounts still read 100 and 100 to everybody else. pg_locks gives it
away:

   locktype |       rel        |       mode       | granted | virtualtransaction | pid
  ----------+------------------+------------------+---------+--------------------+-----
   relation | pat_2pc_accounts | RowExclusiveLock | t       | 3/3                |

pid is empty. There is no backend behind that lock. Your own UPDATE of row 1 then waits on a
transaction no session owns, and dies on the timeout:

  ERROR:  canceling statement due to lock timeout
  CONTEXT:  while updating tuple (0,1) in relation "pat_2pc_accounts"

VACUUM VERBOSE shows the second, quieter damage:

  INFO:  finished vacuuming "lab.public.pat_2pc_junk": index scans: 0
  tuples: 0 removed, 1000 remain, 500 are dead but not yet removable
  removable cutoff: 88814, which was 3 XIDs old when operation ended

The cutoff is exactly the prepared transaction's xid. It is the cluster's xmin horizon now, and it
will not move until somebody resolves the gid - the same mechanism as an abandoned long
transaction, except this one survives the death of every session and of the server itself.

The crash proves that. pg_ctl stop -m immediate, start, and the log says:

  LOG:  database system was not properly shut down; automatic recovery in progress
  LOG:  redo starts at 1/870000A0
  LOG:  redo done at 1/8701E220 system usage: CPU: user: 0.00 s, system: 0.00 s, elapsed: 0.00 s
  LOG:  recovering prepared transaction 88814 from shared memory
  LOG:  1 two-phase state file was written for a long-running prepared transaction

The last of those is the durability mechanism: a prepared transaction that outlives a checkpoint is
written to pg_twophase/ as a file, so it does not even depend on the WAL segments still being
there.

After reconnecting, pg_prepared_xacts still lists pat-xfer-1 with the SAME prepared timestamp and
the same xid 88814, the balances still read 100 and 100, the UPDATE still ends in "canceling
statement due to lock timeout", and VACUUM still reports "500 are dead but not yet removable /
removable cutoff: 88814". Only pg_locks changed, and in the most telling way:

   locktype |       rel        |       mode       | granted | virtualtransaction | pid
  ----------+------------------+------------------+---------+--------------------+-----
   relation | pat_2pc_accounts | RowExclusiveLock | t       | -1/88814           |

virtualtransaction went from 3/3 to -1/88814. Backend id -1 means there is no backend at all: the
lock was rebuilt from WAL and a two-phase state file, not from a session.

COMMIT PREPARED 'pat-xfer-1' finishes it. The balances become 75 and 125 atomically, prepared_now =
0, and the next VACUUM finally reclaims:

  tuples: 500 removed, 500 remain, 0 are dead but not yet removable
  removable cutoff: 88818, which was 0 XIDs old when operation ended
  index scan needed: 3 pages from table (60.00% of total) had 500 dead item identifiers removed

ALTER SYSTEM RESET plus a reload prints setting = 20, pending_restart = t - the running value is
still the one that sized shared memory. After the last restart SHOW says 10 again,
pg_prepared_xacts is empty, and postgresql.auto.conf holds only its two header comment lines:

  # Do not edit this file manually!
  # It will be overwritten by the ALTER SYSTEM command.`,
      systemsLens: code`
This is the participant half of two-phase commit, and holding it in your hand makes the protocol's
famous weakness concrete. After PREPARE, the participant has given up its right to unilaterally
abort: it has promised it can commit, so it must hold every resource until the coordinator speaks.
2PC is therefore a blocking protocol, and the blocking is not an implementation detail you can tune
away - it is the price of the promise. The lab makes the cost visible on two axes at once: locks,
so other writers stop, and the xmin horizon, so garbage collection stops cluster-wide and an
orphaned gid bloats databases that have nothing to do with the transaction.

That is why most distributed systems should avoid 2PC and reach for the patterns on either side of
this lesson instead: an outbox plus idempotent consumers gives eventual agreement with no blocking,
and sagas give compensations instead of a prepare phase. Where 2PC genuinely fits - XA against a
message broker, a coordinator with its own durable log and a recovery process that resolves orphans
- it needs monitoring you have to write yourself: alert on any row in pg_prepared_xacts older than
a few minutes. PostgreSQL will never clean one up for you, by design, because "the coordinator
forgot" and "the coordinator has not spoken yet" are indistinguishable from here.`,
      challenge: code`
Drive a real 2PC round across two databases in the lab: PREPARE in both, then crash the server
between the two COMMIT PREPAREDs and work out what a coordinator would have had to log to finish
the job correctly afterwards. Then measure the cost of the promise - prepare a transaction, leave
it for a few minutes while running pgbench against an unrelated table, and watch that table's
n_dead_tup grow without bound.`,
    },
    {
      slug: "optimistic-concurrency-with-version-columns",
      tags: [
        "optimistic-concurrency",
        "lost-update",
        "read-committed",
        "retries",
      ],
      title: "Optimistic concurrency: zero rows updated is the conflict",
      reading: code`PostgreSQL 14 Internals, Chapter 2 "Isolation" (section "Read Committed")`,
      readingNotes: code`
Chapter 2 explains Read Committed visibility and the recheck after a concurrent update. This lesson applies that mechanism to a version-column compare-and-swap, then contrasts it with SELECT FOR UPDATE. Read the chapter before or after; the race makes its recheck rule visible.`,
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 18,
      prerequisites: ["lost-update-under-read-committed", "idempotency-keys"],
      overview: code`
Two editors read the same document, both edit, both save. Under read committed the second write
simply overwrites the first and nobody finds out - the lost update you caused in module 05. The
optimistic fix costs one integer: carry the version you read into the WHERE clause of the write. If
somebody got there first the predicate no longer matches, the UPDATE affects zero rows, and zero
rows is the conflict signal your application retries on. You will cause both halves - the
optimistic version where the loser learns it lost, and the pessimistic FOR UPDATE version where the
loser waits instead - and see the read-committed detail that makes the guard work at all: a blocked
UPDATE re-evaluates its WHERE clause against the row the other transaction committed.`,
      syntaxBreakdown: code`
### In plain terms

This experiment asks how two editors can prevent one save from silently overwriting the other. Each update includes the version read earlier, so a stale writer matches zero rows; the retry rereads and succeeds. SELECT FOR UPDATE instead makes the second reader wait for the newer version.

### What you are learning

- **Compare-and-swap:** A write is allowed only if the row still has the version observed by the client.
- **Read Committed recheck:** A blocked UPDATE rechecks its WHERE clause against the newly committed row.
- **Optimistic versus pessimistic control:** Optimism detects and retries; locking prevents conflict by waiting.
- **RETURNING as a signal:** One row means success; zero rows means the version no longer matched.

### Piece by piece

- **version int NOT NULL DEFAULT 1** (schema version)
  - What it is: A required integer with an initial value.
  - What it does here: It records the revision each editor read.
  - What it gives us: Version 1 becomes 2 after A; B’s version-1 predicate matches nothing.
- **UPDATE ... WHERE id = 1 AND version = 1 RETURNING** (guarded write)
  - What it is: WHERE is a compare condition; RETURNING emits the changed row.
  - What it does here: B waits for A, then rechecks against version 2.
  - What it gives us: One row for A and zero for B.
- **pg_stat_activity wait fields** (race observation)
  - What they are: Activity rows report why a backend is waiting.
  - What it does here: A selects rows with wait_event_type = Lock.
  - What it gives us: transactionid identifies the xid B awaits.
- **SELECT ... FOR UPDATE** (pessimistic row lock)
  - What it is: It locks selected rows for the transaction.
  - What it does here: B’s read waits until A commits.
  - What it gives us: B reads A’s committed version and sees no conflict.
- **REPEATABLE READ and SQLSTATE 40001** (challenge)
  - What they are: A stricter snapshot and serialization-failure code.
  - What they do here: The same race fails B’s transaction.
  - What they give us: Retry the whole transaction, not only the statement.`,
      setup: code`
drop table if exists pat_docs;
create table pat_docs(id int primary key, title text, body text, version int not null default 1);
insert into pat_docs values (1, 'runbook', 'draft', 1);`,
      code: code`
-- Session A: read the document. No lock, no transaction, just the version.
select id, body, version from pat_docs where id = 1;
-- Session B: a second editor reads the same version.
select id, body, version from pat_docs where id = 1;
-- Session A: save, guarded by the version we read.
begin;
update pat_docs set body = 'edited by A', version = version + 1
where id = 1 and version = 1 returning id, body, version;
-- Session B (blocks until A commits: same row, and the guard must be re-checked)
update pat_docs set body = 'edited by B', version = version + 1
where id = 1 and version = 1 returning id, body, version;
-- Session A
select pg_sleep(1);
select pid, wait_event_type, wait_event, left(query, 32) as query
from pg_stat_activity where wait_event_type = 'Lock';
commit;
-- Session B: the guard did not match the committed row. Nothing was written.
select id, body, version from pat_docs where id = 1;
-- Session B: the retry re-reads, re-applies its edit, and wins.
update pat_docs set body = 'edited by B (retry)', version = version + 1
where id = 1 and version = 2 returning id, body, version;
-- Session A: the pessimistic alternative. Lock during the read.
begin;
select id, body, version from pat_docs where id = 1 for update;
-- Session B (blocks: FOR UPDATE serialises the readers, so there is no conflict to signal)
begin;
select id, body, version from pat_docs where id = 1 for update;
-- Session A
select pg_sleep(1);
update pat_docs set body = 'A holds the lock', version = version + 1
where id = 1 returning id, body, version;
commit;
-- Session B: B's SELECT returned only after A committed, and it already sees A's version.
update pat_docs set body = 'B after the lock', version = version + 1
where id = 1 returning id, body, version;
commit;
select id, body, version from pat_docs where id = 1;`,
      expectedResult: code`
Both sessions read (1, draft, 1). A's guarded UPDATE returns

   id |    body     | version
  ----+-------------+---------
    1 | edited by A |       2

B's identical statement blocks - pg_stat_activity shows B's pid with wait_event_type = Lock and
wait_event = transactionid, waiting for A's xid. The moment A commits, B's statement finishes and
returns

   id | body | version
  ----+------+---------
  (0 rows)

That is the entire mechanism. B was not rejected with an error and did not lose its edit silently:
it was told, in the only way SQL has, that the row it planned to overwrite is no longer the row it
read. Underneath, B's UPDATE was released by A's commit, re-read the new tuple (version 2),
re-evaluated "version = 1", and matched nothing. The table reads 'edited by A', version 2 - A's
write survived, which is what the lost-update experiment in module 05 could not achieve. B's retry
with version = 2 then returns one row, 'edited by B (retry)', version 3.

The pessimistic half looks completely different from the client's side. A's SELECT ... FOR UPDATE
returns immediately; B's identical SELECT does not return at all until A commits, and when it does
it already shows body = 'A holds the lock', version = 4. B never sees a conflict, because there was
nothing left to conflict with - the wait replaced the failure. B's UPDATE then returns
'B after the lock', version 5, and the final row reads the same.`,
      systemsLens: code`
Optimistic and pessimistic control are the same trade you make in every replicated system: detect
conflicts and retry, or prevent conflicts and wait. Optimism wins when conflicts are rare and the
work is cheap to redo - it holds no locks across the user's thinking time, so a browser tab left
open for an hour costs nothing, and it works across stateless request boundaries where holding a
transaction open is not even possible. It loses when conflicts are common, because throughput
collapses into a retry storm. Pessimism is the mirror image: bounded work, unbounded latency, and
head-of-line blocking for everyone in the queue.

The version column is a compare-and-swap, which is why the pattern generalises: it is the same
primitive as an ETag with If-Match, a DynamoDB conditional write, a Kafka producer epoch, and a CAS
loop on an atomic word. In every case the correctness argument is "my write is conditional on the
state I read", and in every case the interesting question is what the client does with the failure.
Note also the read-committed detail you just observed: the EPQ recheck is what makes the guard
sound here. Under REPEATABLE READ that same UPDATE would raise "could not serialize access due to
concurrent update" instead of returning zero rows - a different signal for the same event, and one
your retry loop must handle too.`,
      challenge: code`
Rerun the first race with both sessions in REPEATABLE READ and compare the failure: B gets ERROR
40001 rather than (0 rows), which means the retry has to restart the whole transaction and not just
the statement. Then drop the version column and use xmin as the token instead
(UPDATE ... WHERE id = 1 AND xmin = ?): it works, costs no schema, and breaks the first time a
HOT-pruned or frozen tuple changes xmin under you.`,
    },
    {
      slug: "fencing-tokens-with-a-monotonic-counter",
      tags: [
        "fencing",
        "leases",
        "leader-election",
        "split-brain",
        "advisory-locks",
      ],
      title: "Fencing tokens: why a lease alone is not mutual exclusion",
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 14 "Miscellaneous Locks".`,
      difficulty: "advanced",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 20,
      prerequisites: [
        "advisory-locks-as-leases",
        "optimistic-concurrency-with-version-columns",
      ],
      overview: code`
The advisory-lock lease in module 06 had a hole: the lock dies when the session dies, but the
process holding it does not necessarily know. A worker that is GC-paused, swapped out, or on the
wrong side of a network partition can wake up believing it is still the leader and write. The lock
manager cannot stop it, because by then the lock belongs to somebody else and the old holder is
just another client with a valid connection. The fix is not a better lock: it is to make every
write carry the token it was authorised with, and to have the storage refuse tokens it has already
moved past. You will play both workers, cause the stale write, watch the guard reject it, then
remove the guard and watch the same write silently win.`,
      syntaxBreakdown: code`
### In plain terms

This experiment asks why a lease or advisory lock cannot stop an old worker that wakes up late. Worker A gets token 1, worker B takes token 2, and A's guarded write is rejected; removing the guard lets stale data overwrite B. A trigger then makes storage enforce the rule even when a writer forgets.

### What you are learning

- **Lease versus fencing:** A lease says who should act; fencing makes the resource reject old actors.
- **Monotonic tokens:** Every takeover gets a larger epoch that can be compared without synchronized clocks.
- **Compare-and-swap writes:** A token predicate turns a stale write into zero rows.
- **Storage-side enforcement:** A trigger prevents unsafe unguarded writes.

### Piece by piece

- **epoch = epoch + 1 RETURNING** (token issuance)
  - What it is: An atomic counter increment that returns its new value.
  - What it does here: A receives epoch 1 and B receives epoch 2.
  - What it gives us: A value that orders lease ownership.
- **pg_try_advisory_xact_lock(hashtext(...))** (transaction advisory lock)
  - What it is: hashtext makes an integer key; try-lock returns immediately.
  - What it does here: It serializes acquisition only until COMMIT.
  - What it gives us: got_mutex = t without making the lock the authority.
- **epoch <= token in UPDATE** (fencing predicate)
  - What it is: A write condition requiring the stored epoch not to be newer.
  - What it does here: A’s token 1 matches zero rows after B records 2.
  - What it gives us: Zero rows is a safe stale-write signal.
- **BEFORE UPDATE trigger, NEW, and OLD** (storage guard)
  - What they are: The trigger runs before each update; NEW and OLD are proposed and existing values.
  - What they do here: pat_fence raises when NEW.epoch is lower than OLD.epoch.
  - What they give us: A loud failure instead of silent clobbering.
- **RAISE EXCEPTION ... ERRCODE = 'check_violation'** (PL/pgSQL error)
  - What it is: It aborts the statement with SQLSTATE 23514.
  - What it does here: It reports token 1 is older than 2.
  - What it gives us: A machine-classifiable stale-worker failure.
- **CREATE TRIGGER ... EXECUTE FUNCTION** (trigger installation)
  - What it is: It attaches pat_fence to updates of pat_state.
  - What it does here: Even the later unguarded UPDATE is checked.
  - What it gives us: Current epoch 2 succeeds while epoch 1 fails.`,
      setup: code`
drop table if exists pat_state;
drop table if exists pat_lease;
create table pat_lease(resource text primary key, holder text, epoch bigint not null default 0);
insert into pat_lease values ('shard-1', null, 0);
create table pat_state(resource text primary key, value text, epoch bigint not null default 0);
insert into pat_state values ('shard-1', 'initial', 0);`,
      code: code`
-- Session A (worker-A): take the lease. The epoch bump IS the token.
begin;
select pg_try_advisory_xact_lock(hashtext('shard-1')) as got_mutex;
update pat_lease set holder = 'worker-A', epoch = epoch + 1
where resource = 'shard-1' returning holder, epoch;
commit;
-- Session A: A does its work, stamping the token it holds.
update pat_state set value = 'written by A', epoch = 1
where resource = 'shard-1' and epoch <= 1 returning resource, value, epoch;
-- Session B (worker-B): A is partitioned or GC-paused, so B takes over.
begin;
select pg_try_advisory_xact_lock(hashtext('shard-1')) as got_mutex;
update pat_lease set holder = 'worker-B', epoch = epoch + 1
where resource = 'shard-1' returning holder, epoch;
commit;
update pat_state set value = 'written by B', epoch = 2
where resource = 'shard-1' and epoch <= 2 returning resource, value, epoch;
-- Session A: A wakes up. It still believes it is the leader, with epoch 1.
update pat_state set value = 'STALE write from A', epoch = 1
where resource = 'shard-1' and epoch <= 1 returning resource, value, epoch;
select resource, value, epoch from pat_state;
-- Session A: the same stale write with the guard left out. This is the bug.
update pat_state set value = 'STALE write from A (unguarded)'
where resource = 'shard-1' returning resource, value, epoch;
select resource, value, epoch from pat_state;
-- Session A: put the guard where a writer cannot forget it.
update pat_state set value = 'written by B', epoch = 2 where resource = 'shard-1';
create or replace function pat_fence() returns trigger language plpgsql as $fence$
begin
  if new.epoch < old.epoch then
    raise exception 'fenced: token % is older than %', new.epoch, old.epoch
      using errcode = 'check_violation';
  end if;
  return new;
end
$fence$;
drop trigger if exists pat_fence_trg on pat_state;
create trigger pat_fence_trg before update on pat_state
  for each row execute function pat_fence();
-- Session A: now even the unguarded stale write is rejected by the storage.
update pat_state set value = 'STALE write from A', epoch = 1
where resource = 'shard-1' returning resource, value, epoch;
select resource, value, epoch from pat_state;
select holder, epoch from pat_lease;
-- Session B: the current leader's write still goes through.
update pat_state set value = 'B is still the leader', epoch = 2
where resource = 'shard-1' returning resource, value, epoch;`,
      expectedResult: code`
A acquires the lease (got_mutex = t, holder worker-A, epoch 1) and its guarded write returns one
row: shard-1 / 'written by A' / 1. B then acquires the lease - got_mutex = t again, because A's
transaction-scoped advisory lock was released at COMMIT - takes epoch 2, and B's write returns
shard-1 / 'written by B' / 2.

Now the interesting part. A, still holding token 1 and still perfectly able to talk to the
database, issues its write and gets

   resource | value | epoch
  ----------+-------+-------
  (0 rows)

The state is untouched: 'written by B', epoch 2. Nothing errored, nothing was locked, and A was
still the rightful leader as far as A knew - the storage simply refused a token it had already
moved past. Remove the guard and the same statement returns

   resource |             value              | epoch
  ----------+--------------------------------+-------
   shard-1  | STALE write from A (unguarded) |     2

one row, applied. That is split-brain: a lease changed hands, two workers believed they held it,
and the loser's write clobbered the winner's. Note that epoch still reads 2 - the row now lies
about who wrote it.

With the trigger installed, the unguarded statement fails loudly instead:

  ERROR:  fenced: token 1 is older than 2
  CONTEXT:  PL/pgSQL function pat_fence() line 4 at RAISE

and the state still reads 'written by B' / 2, with pat_lease showing holder worker-B, epoch 2. B's
own write, carrying the current token, returns one row (shard-1 / 'B is still the leader' / 2) -
the guard rejects stale tokens, not the leader.`,
      systemsLens: code`
This is the argument from "How to do distributed locking": a lock gives you mutual exclusion only
if the resource itself checks. Every step between deciding you hold the lease and performing the
write - a scheduler preemption, a stop-the-world GC pause, a TCP retransmit, a paused VM - can take
longer than the lease, and no amount of clock tightening removes the possibility, because a process
cannot observe its own suspension. A fencing token converts an unsolvable timing problem into a
trivial comparison: the resource keeps the highest token it has accepted and rejects anything
lower. That is what ZooKeeper's zxid, Raft's term number, Kafka's producer epoch and an HDFS
NameNode fencing token all are.

The requirement it places on the store is why this pattern belongs in a database course: the store
must be able to compare-and-set atomically against the token. Here that is one UPDATE with a
predicate - the same compare-and-swap as the previous lesson, with a lease-issued number in place
of a row version. A store that cannot do that (a plain object store, a filesystem, a cache with no
conditional write) cannot be fenced, and no lock service in front of it makes it safe. Note also
which half is authoritative: the advisory lock is only an optimisation that keeps two workers from
racing to bump the epoch. Delete it and the system is still correct, just noisier. Delete the token
check and no lock in the world saves you.`,
      challenge: code`
Add an expires_at to the lease and make acquisition conditional on
(holder IS NULL OR expires_at < now()), then run three workers in a loop and confirm epochs never
repeat even when two of them race for the same expired lease. Then break it deliberately: change
acquisition to SELECT the epoch and UPDATE it in two separate statements under READ COMMITTED, and
watch two workers walk away with the same token.`,
    },
    {
      slug: "read-your-writes-on-a-replica",
      tags: [
        "logical-replication",
        "consistency",
        "replication-slots",
        "distributed-patterns",
      ],
      title: "Read your writes: carry an LSN from the primary to the replica",
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".`,
      difficulty: "advanced",
      safetyLevel: "privileged",
      runIn: "tool",
      sessions: 1,
      estimatedMinutes: 25,
      prerequisites: [
        "publication-and-subscription",
        "optimistic-concurrency-with-version-columns",
      ],
      overview: code`
The cheapest way to scale reads is to send them to a replica, and the first bug it causes is always
the same: a user saves a change, the redirect issues a read, the read lands on a replica that has
not applied it yet, and the change appears to have been lost. Eventual consistency is not the
problem - the problem is that the client has no way to say "I need at least the state I already
saw". The fix is a session token: take the write position from the primary, carry it with the
request, and make the replica wait until it has applied at least that position before answering.

The lab has no standby yet (module 09 builds one), so you will do the same handshake with logical
replication between the lab database and a second database, lab_rr, in this same cluster. The token
is an LSN either way, and so is the comparison; the only difference is that a physical standby
reports its position as pg_last_wal_replay_lsn() while a logical subscriber reports it as the
remote_lsn of its replication origin. You will deliberately stop the replica, observe the stale
read, and then watch the LSN comparison flip from false to true at exactly the moment the row
appears.`,
      syntaxBreakdown: code`
### In plain terms

This experiment asks how a user can read a change immediately after writing when reads may go to a lagging replica. The primary returns a log position, the client carries it to the replica, and the replica is trusted only after its applied position reaches that token. Disabling logical apply creates the stale-read window; enabling it closes it.

### What you are learning

- **Read-your-writes guarantee:** A client can require a replica to have applied the state produced by its write.
- **LSN tokens:** A log sequence number is an ordered WAL position that travels with a request.
- **Logical apply position:** remote_lsn reports how far the subscriber has applied publisher changes.
- **Replication cleanup:** Slots retain WAL, so disabled subscriptions must be detached and dropped.

### Piece by piece

- **CREATE PUBLICATION ... FOR TABLE** (publisher definition)
  - What it is: It declares which table changes are offered to subscribers.
  - What it does here: pat_profile changes become publishable.
  - What it gives us: A name for CREATE SUBSCRIPTION.
- **pg_create_logical_replication_slot** and **pg_drop_replication_slot** (slot functions)
  - What they are: A slot reserves WAL until a consumer receives it; these functions create and remove it.
  - What they do here: A hand-created pgoutput slot avoids same-cluster creation deadlock.
  - What they give us: slot_name and lsn identify the stream; zero slots proves cleanup.
- **CREATE SUBSCRIPTION ... create_slot = false, slot_name, copy_data** (subscriber setup)
  - What it is: It connects lab_rr to pat_pub, copies existing rows, then streams changes.
  - What it does here: It reuses the hand-created slot and copies v0.
  - What it gives us: A subscriber table and apply worker.
- **ALTER SUBSCRIPTION ... DISABLE / ENABLE** (apply control)
  - What it is: It stops or starts the apply worker without dropping the slot.
  - What it does here: DISABLE creates lag; ENABLE lets remote_lsn catch up.
  - What it gives us: caught_up changes from false to true.
- **pg_current_wal_lsn()**, **\gset**, **pg_replication_origin_status**, and **remote_lsn** (position handshake)
  - What they are: The first returns primary WAL position; \gset stores it; the view reports subscriber progress.
  - What they do here: The token is compared with remote_lsn.
  - What they give us: caught_up = f means stale is possible; t means the write is applied.
- **\c**, **\set conn**, and **\watch i=1 c=4** (psql controls)
  - What they are: \c changes database; \set stores a variable; \watch repeats a query.
  - What they do here: One session moves between databases and watches apply progress.
  - What they give us: The LSN variable survives the connection switch.
- **DROP SUBSCRIPTION**, **pg_drop_replication_slot**, and **DROP DATABASE** (cleanup)
  - What they are: They detach subscription, release the slot, and remove the scratch database.
  - What they do here: They prevent retained WAL and leftover connections.
  - What they give us: slots_left = 0 and lab_rr_left = 0.`,
      caution: code`
This lesson creates a database (lab_rr) and a replication slot, and the last block drops both. If
you stop early, drop them by hand: an abandoned logical slot retains WAL until the disk fills.`,
      setup: code`
drop table if exists pat_profile;
create table pat_profile(id int primary key, name text, bio text);
insert into pat_profile values (1, 'ada', 'v0');
drop publication if exists pat_pub;`,
      code: code`
-- Session A: publish the table and remember which database we are in.
select current_database() as pubdb \gset
\set conn 'host=/tmp port=5440 user=postgres dbname=' :pubdb
create publication pat_pub for table pat_profile;
select 'create database lab_rr' where not exists
  (select 1 from pg_database where datname = 'lab_rr')
\gexec
select pg_drop_replication_slot('pat_rr_slot')
where exists (select 1 from pg_replication_slots where slot_name = 'pat_rr_slot');
select slot_name, lsn from pg_create_logical_replication_slot('pat_rr_slot', 'pgoutput');

-- Session A: become the replica. Schema is not replicated, so create it.
\c lab_rr
drop table if exists pat_profile;
create table pat_profile(id int primary key, name text, bio text);
create subscription pat_rr_sub connection :'conn' publication pat_pub
  with (create_slot = false, slot_name = 'pat_rr_slot', copy_data = true);
select id, name, bio from pat_profile \watch i=1 c=3
select external_id, remote_lsn from pg_replication_origin_status;

-- Session A: now make the replica lag, on purpose.
alter subscription pat_rr_sub disable;

-- Session A: back to the primary. Write, and capture the position of that write.
\c :pubdb
update pat_profile set bio = 'v1-written-by-me' where id = 1 returning id, bio;
select pg_current_wal_lsn() as write_lsn \gset
select :'write_lsn' as token_i_carry_to_the_replica;

-- Session A: read from the replica the naive way, and lose your own write.
\c lab_rr
select id, bio from pat_profile where id = 1;
select external_id, remote_lsn, remote_lsn >= :'write_lsn'::pg_lsn as caught_up
from pg_replication_origin_status;

-- Session A: the honest read waits for the token before it answers.
alter subscription pat_rr_sub enable;
select remote_lsn, remote_lsn >= :'write_lsn'::pg_lsn as caught_up
from pg_replication_origin_status \watch i=1 c=4
select id, bio from pat_profile where id = 1;

-- Session A: clean up. Detach the slot before dropping the subscription.
alter subscription pat_rr_sub disable;
alter subscription pat_rr_sub set (slot_name = none);
drop subscription pat_rr_sub;
\c :pubdb
select pg_drop_replication_slot('pat_rr_slot')
where exists (select 1 from pg_replication_slots where slot_name = 'pat_rr_slot');
drop publication if exists pat_pub;
drop database if exists lab_rr;
select count(*) as slots_left from pg_replication_slots;
select count(*) as lab_rr_left from pg_database where datname = 'lab_rr';`,
      expectedResult: code`
The manual slot is created at the current position, for example pat_rr_slot / 1/85E60BE8. On the
replica the \watch catches the initial copy: the first sample prints (0 rows), the next prints
1 / ada / v0. pg_replication_origin_status then shows one origin, external_id like pg_67639, with
remote_lsn 0/0 - those rows arrived through a COPY, and the origin has not durably applied any
streamed change yet.

After DISABLE, the write on the primary returns 1 / v1-written-by-me and the token is an LSN:

   token_i_carry_to_the_replica
  ------------------------------
   1/85E69BC8

The naive read on the replica is the bug, reproduced on demand:

   id | bio
  ----+-----
    1 | v0

and the check says why:

   external_id | remote_lsn | caught_up
  -------------+------------+-----------
   pg_67639    | 0/0        | f

caught_up = f is the answer a correct read path needs BEFORE it serves anything. Enable the
subscription and the \watch shows the flip, one sample per second:

   remote_lsn | caught_up               remote_lsn | caught_up
  ------------+-----------      ->     ------------+-----------
   0/0        | f                       1/85E69BC8 | t

remote_lsn lands on exactly the write_lsn the primary reported. Only now does the read return

   id |       bio
  ----+------------------
    1 | v1-written-by-me

Cleanup reports slots_left = 0 and lab_rr_left = 0. (If DROP DATABASE complains that lab_rr "is
being accessed by other users", the apply worker is still connected: re-run the DISABLE and try
again.)`,
      systemsLens: code`
Read-your-writes is a session guarantee, not a system guarantee, and that distinction is the whole
design. The storage layer stays eventually consistent and cheap; the client carries one monotonic
token saying how much of the log it has already observed, and each replica decides locally whether
it can serve the request or must wait, redirect, or fail. That is the same shape as DynamoDB's
consistent-read flag, MongoDB's afterClusterTime, Kafka consumer offsets, and vector clocks in
Dynamo-style stores - a causal token, not a global order.

Three engineering consequences follow, all visible above. First, the token must come from the write
path: an LSN read separately a moment later is not the LSN of your write. Second, the wait is
unbounded unless you bound it, so a production read path needs a timeout plus a fallback to the
primary - a replica twenty minutes behind will happily block your user forever. Third, the
guarantee is only as good as the position the replica reports: remote_lsn here means "durably
applied by the apply worker", while a physical standby's pg_last_wal_replay_lsn() means "replayed",
and hot_standby_feedback, synchronous_commit and recovery_min_apply_delay all change what those
numbers promise. Read the definition of your replica's position field before you trust it.`,
      challenge: code`
Redo the handshake against a physical standby once module 09 is built: the check becomes
pg_last_wal_replay_lsn() >= :write_lsn, and synchronous_commit = remote_apply on the primary turns
the wait into the writer's problem instead of the reader's. Measure both - the handshake costs the
reader latency only when it is behind, remote_apply costs every writer latency all the time.`,
    },
    {
      slug: "listen-notify-as-a-bus",
      tags: [
        "listen-notify",
        "queues",
        "outbox",
        "durability",
        "distributed-patterns",
      ],
      title: "LISTEN/NOTIFY: a bus with no memory",
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 1 "Introduction".`,
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      prerequisites: ["transactional-outbox"],
      overview: code`
LISTEN/NOTIFY is the one piece of pub/sub built into PostgreSQL, and it is genuinely useful: it
removes the polling loop from the outbox relay you built in the first lesson. It is also the most
frequently misused feature in the database, because it looks like a message queue and is not one.
In this lesson you establish the two properties that decide where it belongs: delivery happens at
COMMIT, in the same instant the data becomes visible, and delivery reaches only whoever is
listening at that instant. Nothing is stored. A listener that is disconnected, restarting, or
simply not subscribed yet misses the message permanently, and there is no offset, no
acknowledgement and no redelivery.`,
      syntaxBreakdown: code`
### In plain terms

This experiment asks whether LISTEN/NOTIFY can replace a durable queue. A notification arrives only after the sending transaction commits, at the same time its row becomes visible, but it is not stored for an absent listener. The useful pattern is a durable table for truth and NOTIFY as a wake-up bell.

### What you are learning

- **Commit-time delivery:** Notifications from an uncommitted transaction do not reach listeners.
- **At-most-once signalling:** Duplicates collapse and missed notifications are not replayed.
- **Table plus doorbell:** The table stores the event; NOTIFY reduces polling delay.
- **Queue pressure:** A listener that stops consuming can hold space in the shared notification queue.

### Piece by piece

- **LISTEN**, **UNLISTEN**, and **NOTIFY** (session commands)
  - What they are: LISTEN subscribes; UNLISTEN removes the subscription; NOTIFY queues a channel/payload signal for commit.
  - What they do here: B listens before A commits, then stops before a later event.
  - What they give us: Two order-1 lines show duplicate collapse; the missed event produces no line.
- **pg_notify(channel, payload)** (function)
  - What it is: The function form of NOTIFY, usable in triggers.
  - What it does here: The challenge attaches a signal to an insert.
  - What it gives us: A row ID can identify what to inspect, but is not durable alone.
- **Asynchronous notification output** (psql behaviour)
  - What it is: psql prints pending notifications while processing a later command.
  - What it does here: Dummy SELECT statements poll the connection.
  - What it gives us: The sender PID may appear after the query result.
- **pg_notification_queue_usage()** (queue metric)
  - What it is: It returns the fraction of the cluster-wide queue in use.
  - What it does here: The lesson checks queue pressure.
  - What it gives us: A growing value signals a stuck listener.
- **BEGIN, COMMIT, and SELECT** (visibility proof)
  - What they are: Transaction boundaries control when writes and notifications become visible.
  - What they do here: A inserts and notifies before commit, then B reads after commit.
  - What they give us: Row visibility and delivery happen together.
- **8000-byte payload limit** (challenge boundary)
  - What it is: PostgreSQL limits one notification payload to about 8000 bytes.
  - What it does here: An oversized payload fails instead of becoming a durable message.
  - What it gives us: Send a key and read the table rather than embedding the full event.`,
      setup: code`
drop table if exists pat_bus_orders;
create table pat_bus_orders(id int primary key, customer text not null);`,
      code: code`
-- Session B (the worker): subscribe first. Anything sent before this is lost.
listen pat_chan;
-- Session A (the application): write and announce, in one transaction.
begin;
insert into pat_bus_orders values (1, 'ada') returning id, customer;
notify pat_chan, 'order-1';
notify pat_chan, 'order-1';
notify pat_chan, 'order-2';
-- Session B: check for mail while A is still uncommitted.
select 'B polls before commit' as when_i_looked;
-- Session A
commit;
-- Session B: the next thing B does, the notifications are already waiting.
select 'B polls after commit' as when_i_looked;
select id, customer from pat_bus_orders order by id;
-- Session B: now stop listening, the way a restarting worker does.
unlisten pat_chan;
select 'B is not listening' as state;
-- Session A: the application does not know and does not care.
insert into pat_bus_orders values (2, 'linus') returning id, customer;
notify pat_chan, 'order-2-missed';
-- Session B: subscribe again and look for the message sent meanwhile.
listen pat_chan;
select 'B is listening again' as state;
select pg_sleep(1);
select 'still nothing arrived' as state;
-- Session B: the row is there. The event is not.
select id, customer from pat_bus_orders order by id;
select pg_notification_queue_usage() as async_queue_fraction_used;
-- Session A: what a relay actually does - notify as a wake-up, table as the truth.
begin;
insert into pat_bus_orders values (3, 'barbara') returning id;
notify pat_chan, 'wake-up';
commit;
-- Session B: woken, then reads the table instead of trusting the payload.
select count(*) as rows_i_found from pat_bus_orders;`,
      expectedResult: code`
While A's transaction is open, B's poll prints only its own result - no notification line:

   when_i_looked
  -----------------------
   B polls before commit

After A commits, B's very next statement prints its result and then the mail:

   when_i_looked
  ----------------------
   B polls after commit

  Asynchronous notification "pat_chan" with payload "order-1" received from server process with PID 140725.
  Asynchronous notification "pat_chan" with payload "order-2" received from server process with PID 140725.

Two lines, not three: A issued NOTIFY 'order-1' twice and PostgreSQL collapsed the duplicate. That
is the first thing that makes it not a queue - the payload is a signal, not a message, and you
cannot count them. Delivery is atomic with visibility, though: the same commit made row 1 readable
and the notification deliverable, so a listener can never be told about a row it cannot yet see.

After UNLISTEN, A inserts row 2 and notifies. B re-LISTENs, waits a second, and prints

   state
  -----------------------
   still nothing arrived

with no notification line at all. The message was not queued, not retried and not stored anywhere:
at NOTIFY time nobody was listening on that channel, so there was nothing to deliver. The row
meanwhile is perfectly durable - B's select returns both (1, ada) and (2, linus).
pg_notification_queue_usage() reads 0, because the queue only holds notifications between COMMIT
and the listener consuming them.

The last exchange is the pattern that works. A commits row 3 with a contentless 'wake-up' payload,
and B's next statement both reads the table and picks up the mail:

   rows_i_found
  --------------
              3

  Asynchronous notification "pat_chan" with payload "wake-up" received from server process with PID 141429.

(psql prints notifications after the result of whatever it was doing, which is why the line lands
below the count rather than above it.) The notification saved a poll; the table carried the truth.`,
      systemsLens: code`
NOTIFY is a doorbell, not a mailbox, and almost every LISTEN/NOTIFY incident comes from treating it
as the latter. Its delivery semantics are at-most-once with no persistence and no acknowledgement -
strictly weaker than the outbox table from lesson one, which is why the two belong together: the
table is the durable log with at-least-once redelivery, and the notification only removes polling
latency. Used that way, a missed doorbell costs one poll interval, not a lost order.

The failure modes are worth knowing before you deploy it. The async queue is a fixed, cluster-wide
region shared by every database (8 GB in PostgreSQL 16): one listener that stops consuming - idle
in transaction, blocked, or just slow - holds the queue's tail and can fill it, at which point
NOTIFY starts failing and the transactions that call it abort. Notifications are also not
replicated, so a standby is deaf after failover, and connection poolers in transaction mode
silently break LISTEN because your session is not the same backend twice. Compare that with what a
broker gives you - durable offsets, consumer groups, redelivery - and the rule falls out: NOTIFY
for latency, a table for truth, a broker when you need fan-out or replay you cannot afford to
rebuild yourself.`,
      challenge: code`
Attach the notify to the data with an AFTER INSERT trigger that calls
pg_notify('pat_chan', new.id::text) so no writer can forget it, then find out what happens when the
payload exceeds the 8000-byte limit. Then open a listener, park it in a transaction that never
commits, and watch pg_notification_queue_usage() climb as another session notifies in a loop - that
number is the one to alert on.`,
    },
  ],
};
