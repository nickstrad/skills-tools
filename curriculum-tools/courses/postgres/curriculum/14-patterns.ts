import { code, type Module } from "../../../src/types.ts";

import { IDEMPOTENCY_KEYS } from "./idempotency-protocol.ts";
import { TRANSACTIONAL_OUTBOX } from "./outbox-delivery.ts";
import { RESOURCE_FENCING } from "./resource-fencing.ts";
import { TWO_PHASE_COMMIT } from "./two-phase-protocol.ts";

export const PATTERNS: Module = {
  category: "distributed-patterns",
  title: "Distributed-systems patterns on PostgreSQL",
  lessons: [
    TRANSACTIONAL_OUTBOX,
    IDEMPOTENCY_KEYS,
    TWO_PHASE_COMMIT,
    RESOURCE_FENCING,
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
