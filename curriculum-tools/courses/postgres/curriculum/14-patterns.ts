import { code, type Module } from "../../../src/types.ts";

import { IDEMPOTENCY_KEYS } from "./idempotency-protocol.ts";
import { TRANSACTIONAL_OUTBOX } from "./outbox-delivery.ts";
import { TWO_PHASE_COMMIT } from "./two-phase-protocol.ts";

export const PATTERNS: Module = {
  category: "distributed-patterns",
  title: "Distributed-systems patterns on PostgreSQL",
  lessons: [
    TRANSACTIONAL_OUTBOX,
    IDEMPOTENCY_KEYS,
    TWO_PHASE_COMMIT,
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
