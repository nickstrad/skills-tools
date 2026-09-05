import { code, type Module } from "../../../src/types.ts";

import { IDEMPOTENCY_KEYS } from "./idempotency-protocol.ts";
import { TRANSACTIONAL_OUTBOX } from "./outbox-delivery.ts";

export const PATTERNS: Module = {
  category: "distributed-patterns",
  title: "Distributed-systems patterns on PostgreSQL",
  lessons: [
    TRANSACTIONAL_OUTBOX,
    IDEMPOTENCY_KEYS,
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
