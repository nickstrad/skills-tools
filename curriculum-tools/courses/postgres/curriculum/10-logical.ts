import { code, type Module } from "../../../src/types.ts";

export const LOGICAL: Module = {
  category: "logical-replication",
  title: "Logical decoding, CDC, and publications",
  lessons: [
    {
      slug: "decode-the-log",
      tags: ["logical-decoding", "cdc", "replication-slots", "wal", "replicated-log"],
      title: "Decode the WAL into row changes",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 20,
      prerequisites: ["shell-and-psql-toolkit", "every-change-is-a-wal-record"],
      overview: code`
Physical replication ships page deltas: unreadable outside PostgreSQL and useless to a downstream
system. Logical decoding runs the same WAL through an output plugin that knows the catalog, and
turns it back into row-level INSERT/UPDATE/DELETE events. That is exactly what a CDC pipeline is.
In this lesson you create a slot with the test_decoding plugin, cause a transaction, read the
event stream, and find out what the stream does NOT contain: rolled-back work, DDL, and the old
values of a row unless you ask for them.`,
      syntaxBreakdown: code`
pg_create_logical_replication_slot(name, plugin) creates a durable cursor into the WAL of the
current database and pins WAL from that point on. test_decoding is the demo output plugin that
prints changes as text (real consumers use pgoutput or wal2json). pg_logical_slot_peek_changes and
pg_logical_slot_get_changes decode from the slot position; peek leaves the position alone, get
advances it. A slot is per-database and is stored in pg_replication_slots. ALTER TABLE ... REPLICA
IDENTITY FULL makes the WAL carry the whole old row for UPDATE and DELETE instead of just the key.`,
      setup: code`
-- Idempotent: drop the slot and the table if a previous run left them behind.
select pg_drop_replication_slot('lg_decode')
where exists (select 1 from pg_replication_slots where slot_name = 'lg_decode');
drop table if exists lg_orders;
create table lg_orders(id int primary key, customer text, amount numeric);`,
      code: code`
-- Session A: create the slot. It starts empty and points at "now".
select slot_name, lsn from pg_create_logical_replication_slot('lg_decode', 'test_decoding');

select slot_name, plugin, slot_type, database, temporary, active,
       restart_lsn, confirmed_flush_lsn
from pg_replication_slots where slot_name = 'lg_decode';

-- Session A: one transaction with three different row events.
begin;
insert into lg_orders values (1, 'ada', 10.00), (2, 'grace', 20.00);
update lg_orders set amount = 99.00 where id = 1;
delete from lg_orders where id = 2;
commit;

-- Session A: read the stream without consuming it.
select lsn, xid, data from pg_logical_slot_peek_changes('lg_decode', null, null);

-- Session A: a rolled back transaction, and a DDL, and a row using the new column.
begin;
insert into lg_orders values (700, 'rolled-back', 1.00);
rollback;
alter table lg_orders add column note text;
insert into lg_orders values (701, 'after-ddl', 2.00, 'hello');
delete from lg_orders where id = 701;
select data from pg_logical_slot_get_changes('lg_decode', null, null);

-- Session A: what the downstream sees for an UPDATE/DELETE depends on replica identity.
alter table lg_orders replica identity full;
update lg_orders set amount = 12.00 where id = 1;
delete from lg_orders where id = 1;
select data from pg_logical_slot_get_changes('lg_decode', null, null);
alter table lg_orders replica identity default;

-- Ordering: B starts its transaction first but commits last.
-- Session B
begin;
insert into lg_orders values (800, 'started-first', 1.00);
select txid_current() as b_xid;

-- Session A
begin;
insert into lg_orders values (801, 'committed-first', 2.00);
select txid_current() as a_xid;
commit;

-- Session B
commit;

-- Session A: the stream is in commit order, not in start order or xid order.
select xid, data from pg_logical_slot_get_changes('lg_decode', null, null);`,
      expectedResult: code`
The slot is created at the current WAL position, plugin test_decoding, slot_type logical,
database lab, temporary f, active f, and restart_lsn a few dozen bytes behind confirmed_flush_lsn
(0/37B5A360 vs 0/37B5A398 in one run).

peek returns exactly six rows for one transaction, all with the same xid, bracketed by BEGIN and
COMMIT:
  0/37B5A398 | 3473 | BEGIN 3473
  0/37B5A398 | 3473 | table public.lg_orders: INSERT: id[integer]:1 customer[text]:'ada' ...
  0/37B5A480 | 3473 | table public.lg_orders: INSERT: id[integer]:2 customer[text]:'grace' ...
  0/37B5A508 | 3473 | table public.lg_orders: UPDATE: id[integer]:1 ... amount[numeric]:99.00
  0/37B5A558 | 3473 | table public.lg_orders: DELETE: id[integer]:2
  0/37B5A5C8 | 3473 | COMMIT 3473
The UPDATE carries only the new row and the DELETE carries only id: with the default replica
identity the WAL records the primary key of the old row and nothing else.

The next get returns 14 rows, and it starts by repeating all six rows above -- peek did not
consume them. The four new transactions prove two absences. The rolled back INSERT is not in the
stream at all: its xid (3474 here) never appears, because decoding replays only committed
transactions and a consumer never sees work that did not happen. The ALTER TABLE appears as an
empty BEGIN 3475 / COMMIT 3475 pair: catalog changes are decoded as nothing, and only their effect
is visible, in that the very next INSERT prints the new column note[text]:'hello'.

After REPLICA IDENTITY FULL the same operations print the old row too:
  table public.lg_orders: UPDATE: old-key: id[integer]:1 customer[text]:'ada' amount[numeric]:99.00
    new-tuple: id[integer]:1 customer[text]:'ada' amount[numeric]:12.00 note[text]:null
  table public.lg_orders: DELETE: id[integer]:1 customer[text]:'ada' amount[numeric]:12.00
That extra information is written into the WAL, so it costs write bandwidth on every update.

The last get returns two real transactions plus one more empty DDL pair. B's xid is the lower
number (3482, it started first) but A's transaction (3483, committed-first) is emitted first:
  3483 | BEGIN 3483
  3483 | table public.lg_orders: INSERT: id[integer]:801 customer[text]:'committed-first' ...
  3483 | COMMIT 3483
  3482 | BEGIN 3482
  3482 | table public.lg_orders: INSERT: id[integer]:800 customer[text]:'started-first' ...
  3482 | COMMIT 3482
Decoding order is commit order, and a transaction is buffered until its commit record is read.`,
      systemsLens: code`
This is the whole idea behind change data capture: the durability log is already a totally ordered
record of every change, so the cheapest correct event stream is the log itself, replayed through a
schema. The consequences follow from that. Events appear in commit order, not in the order the
writes happened, so a slow long transaction delays everything behind it. Aborted work never
appears, which is why log-based CDC does not need compensating events the way dual writes do.
Schema changes are invisible to the stream, which is why every CDC deployment eventually breaks on
a migration. And the stream only contains what the log contains: if you want before-images you must
pay for them at write time (REPLICA IDENTITY FULL), the same trade Kafka compaction and
event-sourced systems make when they choose how much state to put in each event.`,
      challenge: code`
Set replica identity to NOTHING on a table with no primary key and try to UPDATE it. The error
("cannot update table ... because it does not have a replica identity") is the publisher refusing
to produce an event no downstream could apply.`,
    },
    {
      slug: "slot-position-and-acknowledgement",
      tags: ["replication-slots", "logical-decoding", "idempotency", "retries", "gc-horizon"],
      title: "Peek, get, and the consumer offset",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 20,
      prerequisites: ["decode-the-log"],
      overview: code`
A slot is a durable consumer offset that lives on the server. This lesson makes the acknowledgement
protocol concrete: peeking is a repeatable read, getting is a destructive read that advances the
offset, and there is no way to un-get. That single fact decides the delivery semantics of every
CDC pipeline built on PostgreSQL, and it is why the slot also holds back WAL removal and catalog
vacuuming.`,
      syntaxBreakdown: code`
pg_replication_slots.confirmed_flush_lsn is the position the consumer has acknowledged;
restart_lsn is the oldest WAL the server must keep for this slot. catalog_xmin is the oldest
transaction whose catalog rows vacuum may not remove, so the decoder can still resolve column
types. pg_replication_slot_advance(name, lsn) moves the offset forward without reading, i.e. skips
data. pg_current_wal_lsn() minus an LSN is a bytes value (pg_lsn subtraction returns numeric).`,
      setup: code`
select pg_drop_replication_slot('lg_decode')
where exists (select 1 from pg_replication_slots where slot_name = 'lg_decode');
drop table if exists lg_orders;
create table lg_orders(id int primary key, customer text, amount numeric);
select slot_name from pg_create_logical_replication_slot('lg_decode', 'test_decoding');
insert into lg_orders select g, 'customer-' || g, g * 1.5 from generate_series(1, 5) g;`,
      code: code`
-- What the slot holds back for us.
select slot_name, active, restart_lsn, confirmed_flush_lsn, xmin, catalog_xmin,
       pg_size_pretty(pg_current_wal_lsn() - restart_lsn) as wal_retained
from pg_replication_slots where slot_name = 'lg_decode';

-- Peek is repeatable: same rows, offset unchanged.
select count(*) as peek_1 from pg_logical_slot_peek_changes('lg_decode', null, null);
select count(*) as peek_2 from pg_logical_slot_peek_changes('lg_decode', null, null);
select confirmed_flush_lsn as after_two_peeks
from pg_replication_slots where slot_name = 'lg_decode';

-- Get is destructive: same rows once, then the offset jumps forward.
select count(*) as got from pg_logical_slot_get_changes('lg_decode', null, null);
select confirmed_flush_lsn as after_get, restart_lsn
from pg_replication_slots where slot_name = 'lg_decode';
select count(*) as get_again from pg_logical_slot_get_changes('lg_decode', null, null);

-- Consuming in bounded batches is what a real consumer does (upto_nchanges).
insert into lg_orders select g, 'customer-' || g, g from generate_series(10, 19) g;
select count(*) as batch_1 from pg_logical_slot_get_changes('lg_decode', null, 5);
select count(*) as batch_2 from pg_logical_slot_get_changes('lg_decode', null, 5);
select count(*) as batch_3 from pg_logical_slot_get_changes('lg_decode', null, null);

-- Skipping without reading: advance the offset past everything that is pending.
insert into lg_orders select g, 'skipped-' || g, g from generate_series(30, 34) g;
select pg_current_wal_lsn() as target \gset
select end_lsn from pg_replication_slot_advance('lg_decode', :'target');
select count(*) as after_advance from pg_logical_slot_get_changes('lg_decode', null, null);
select count(*) as rows_still_in_table from lg_orders where customer like 'skipped-%';

-- The slot pins resources until it is dropped. Always drop what you create.
select slot_name, pg_size_pretty(pg_current_wal_lsn() - restart_lsn) as wal_retained, catalog_xmin
from pg_replication_slots where slot_name = 'lg_decode';
select pg_drop_replication_slot('lg_decode');
select count(*) as slots_left from pg_replication_slots;`,
      expectedResult: code`
The slot is inactive (active f) but still holds a position: restart_lsn just behind
confirmed_flush_lsn, xmin null but catalog_xmin set to a live transaction id (3463 in one run),
and wal_retained under 10 kB on an idle lab (920 bytes in one run) -- it is however many bytes the
rest of the cluster has written since, so on a busy one it is megabytes.

peek_1 and peek_2 are both 7 (BEGIN, five INSERTs, COMMIT) and after_two_peeks equals the
confirmed_flush_lsn from before the peeks: peeking is a pure read. got is the same 7 rows, but
after_get the confirmed_flush_lsn has jumped forward to the end of the decoded WAL (0/37B63CF0 ->
0/37B66058), while restart_lsn stays where it was. get_again returns 0: the changes are gone, and
nothing you can run will bring them back.

The batched gets are the surprise. batch_1 is 12, not 5: upto_nchanges is a soft limit checked
between transactions, so the ten-row transaction (BEGIN + 10 INSERTs + COMMIT = 12 rows) is
delivered whole. batch_2 and batch_3 are then 0. A consumer cannot ask for half a transaction --
atomicity survives all the way into the change stream.

pg_replication_slot_advance moves the offset to the current WAL end and returns that LSN
(0/37B66960); after_advance is 0 changes even though rows_still_in_table is 5. The rows exist in
the table and were never delivered: advancing a slot is data loss for the consumer, which is
exactly what it is for.

The final drop returns an empty result and slots_left is 0 (or 1 if you have already built the
subscription from a later lesson). Until that drop, the slot is holding WAL and blocking catalog
vacuum on this database.`,
      systemsLens: code`
The slot is a server-side consumer offset, the same object as a Kafka consumer group offset, and it
has the same failure modes. Acknowledgement is a separate step from delivery, so the client can
crash between reading a change and committing its own side effect. get gives you at-most-once
(acknowledge then process, lose data if you crash), peek plus an explicit advance after your own
commit gives you at-least-once (process then acknowledge, replay data if you crash), and there is
no exactly-once: your consumer has to be idempotent. The other half is back-pressure. A stalled
consumer does not silently drop events; it makes the producer accumulate WAL and stop vacuuming
catalogs, i.e. an unavailable consumer turns into a full disk on the producer. Every log-based
system has to pick between those two, and PostgreSQL picks retention.`,
      challenge: code`
Create a temporary slot with pg_create_logical_replication_slot('t', 'test_decoding', true) and
then close the session. Look at pg_replication_slots: the slot is gone. Temporary slots trade
durable offsets for automatic cleanup, which is the right choice for one-off consumers.`,
    },
    {
      slug: "publication-and-subscription",
      tags: ["logical-replication", "replication-slots", "cdc", "streaming-replication"],
      title: "Build a logical replica: publication, slot, subscription",
      difficulty: "intermediate",
      safetyLevel: "privileged",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 25,
      prerequisites: ["slot-position-and-acknowledgement"],
      overview: code`
Built-in logical replication is the same decoding machinery with the pgoutput plugin on one side
and an apply worker on the other. You will build a working replica inside this one cluster: the lab
database publishes a table and a second database, lab_sub, subscribes to it. Doing it in a single
cluster is what makes the moving parts visible -- publisher and subscriber processes, the slot, the
walsender, the apply worker -- and it also exposes a real trap that a cross-machine setup hides.`,
      syntaxBreakdown: code`
CREATE PUBLICATION names a set of tables and which operations to publish. CREATE SUBSCRIPTION
stores a connection string and a publication name, creates a replication slot on the publisher, and
starts an apply worker. WITH (create_slot = false, slot_name = ...) tells it to use a slot you
already created, and WITH (copy_data = true) (the default) copies the existing rows first.
pg_stat_replication shows the walsender feeding a subscriber; pg_stat_subscription shows the apply
worker on the other side. In psql, \gset captures a query result into a variable, \set builds a
string out of several pieces, and :'var' interpolates it as a quoted literal.`,
      caution: code`
Never point a subscription at a production database you do not own: the subscription creates a
replication slot there, and an abandoned slot retains WAL until the publisher runs out of disk.
Lesson slot-lag-and-disk shows this happening and the last lesson of the module cleans up.`,
      setup: code`
drop table if exists lg_orders;
create table lg_orders(id int primary key, customer text, amount numeric);
insert into lg_orders values (1, 'ada', 10.00), (3, 'linus', 30.00), (4, 'barbara', 40.00);
drop publication if exists lg_pub;`,
      code: code`
-- Session A (publisher). A publication is just a named set of tables.
create publication lg_pub for table lg_orders;
select pubname, puballtables, pubinsert, pubupdate, pubdelete, pubtruncate from pg_publication
where pubname = 'lg_pub';
select schemaname, tablename, attnames from pg_publication_tables where pubname = 'lg_pub';

-- Session B: build the connection string out of the database you are actually in,
-- then move to the subscriber database, creating it the first time through.
select current_database() as pubdb \gset
\set conn 'host=/tmp port=5440 user=postgres dbname=' :pubdb
select 'create database lab_sub' where not exists
  (select 1 from pg_database where datname = 'lab_sub')
\gexec
\c lab_sub

-- Session B: start from a clean subscriber. Detaching the slot before dropping the
-- subscription keeps the drop a local catalog operation (see the last lesson).
select 'alter subscription lg_sub disable'
where exists (select 1 from pg_subscription where subname = 'lg_sub')
\gexec
select 'alter subscription lg_sub set (slot_name = none)'
where exists (select 1 from pg_subscription where subname = 'lg_sub')
\gexec
select 'drop subscription lg_sub'
where exists (select 1 from pg_subscription where subname = 'lg_sub')
\gexec
drop table if exists lg_orders;
create table lg_orders(id int primary key, customer text, amount numeric);

-- Session A: create the slot BY HAND. If CREATE SUBSCRIPTION creates it for you and the
-- publisher is this same cluster, the slot creation waits for all running transactions --
-- including the CREATE SUBSCRIPTION transaction itself -- and the command hangs forever.
select pg_drop_replication_slot('lg_sub_slot')
where exists (select 1 from pg_replication_slots where slot_name = 'lg_sub_slot');
select slot_name, lsn from pg_create_logical_replication_slot('lg_sub_slot', 'pgoutput');

-- Session B: subscribe, using the slot that already exists.
create subscription lg_sub
  connection :'conn'
  publication lg_pub
  with (create_slot = false, slot_name = 'lg_sub_slot', copy_data = true);

-- Session B: the initial copy runs in a background worker, so give it a moment.
select count(*) as rows_on_subscriber from lg_orders \watch i=1 c=3
select srrelid::regclass as tbl, srsubstate, srsublsn from pg_subscription_rel;

-- Session A: now stream a change.
insert into lg_orders values (5, 'edsger', 50.00);
update lg_orders set amount = 11.00 where id = 1;
select slot_name, plugin, active, active_pid, confirmed_flush_lsn from pg_replication_slots
where slot_name = 'lg_sub_slot';
select pid, application_name, state, sent_lsn, replay_lsn, sync_state from pg_stat_replication;

-- Session B: the change arrives without anyone polling for it.
select id, customer, amount from lg_orders order by id \watch i=1 c=3
select subname, pid is not null as worker_running, received_lsn, latest_end_lsn
from pg_stat_subscription;`,
      expectedResult: code`
The publication publishes all four operations (pubinsert/pubupdate/pubdelete/pubtruncate all t,
puballtables f) and lists one table, public.lg_orders with attnames {id,customer,amount}. The
manual slot is created with plugin pgoutput at a current LSN such as 0/392D6780.

CREATE SUBSCRIPTION returns immediately (about 0.2 s) because the slot already exists. If you
leave out create_slot = false in this same-cluster setup, the command instead sits there forever
and you have to cancel it: that is the trap.

The \watch catches the initial copy happening: rows_on_subscriber is 0 on the first sample and 3
one second later -- those three rows came from a COPY, not from the stream -- and
pg_subscription_rel shows lg_orders in state r (ready) with an srsublsn like 0/392D73A0:
     tbl    | srsubstate |  srsublsn
  -----------+------------+------------
   lg_orders | r          | 0/392D73A0

On the publisher the slot is now active t with an active_pid, and pg_stat_replication has one row:
pid 8010, application_name lg_sub, state streaming, sent_lsn = replay_lsn = 0/392D7BE0,
sync_state async. The walsender is a normal backend process doing decoding for that slot.

After the insert and update, the subscriber shows four rows with id 1 at amount 11.00, and
pg_stat_subscription reports worker_running t with received_lsn tracking the publisher's LSN. No
polling loop exists anywhere: the apply worker is fed by the walsender over a replication
connection.`,
      systemsLens: code`
A logical replica is a consumer with the durability of the log built in. Compare it with the
alternatives you would otherwise write: a polling query on updated_at (misses deletes, and misses
rows committed out of timestamp order), or a dual write to a queue (not atomic with the
transaction). Here the transport is the same WAL that already had to be durable for the commit to
return, so there is nothing to keep in sync. The cost is that the publisher now has state about a
consumer it does not control -- the slot -- and its disk usage depends on that consumer's health.
The same-cluster hang is worth remembering as a lesson about deadlocks in general: building a
consistent snapshot means waiting for all in-flight transactions to end, and if the thing doing the
waiting is itself one of them, nothing ever ends.`,
      challenge: code`
Run TRUNCATE lg_orders on the publisher and watch the subscriber empty too, then remove truncate
from the publication (ALTER PUBLICATION lg_pub SET (publish = 'insert, update, delete')) and try
again. Which operations a publication carries is a choice, and asymmetric choices are how logical
replicas silently diverge.`,
    },
    {
      slug: "initial-sync-vs-streaming",
      tags: ["logical-replication", "snapshots", "cdc", "consistency"],
      title: "Backfill and tail: how a new table joins the stream",
      difficulty: "advanced",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 25,
      prerequisites: ["publication-and-subscription"],
      overview: code`
Adding a table to a running replication stream is the hard part of every CDC system: you have to
copy the rows that already exist and then start the stream at exactly the point the copy's snapshot
ended, with no gap and no duplicate. PostgreSQL does this with a per-table state machine you can
watch. In this lesson you add a 50000 row table to the publication and step the state machine
through i -> d -> r by holding the copy hostage with an open transaction on the publisher.`,
      syntaxBreakdown: code`
ALTER PUBLICATION ... ADD TABLE changes the publisher's table set; the subscriber only notices when
you run ALTER SUBSCRIPTION ... REFRESH PUBLICATION. pg_subscription_rel.srsubstate is the per-table
state: i = initialize, d = data is being copied, f = finished the copy, s = synchronized with the
apply worker, r = ready (streaming normally). srsublsn is the LSN at which the table's copy ended
and streaming took over. Each table sync uses its own temporary slot and its own snapshot, so it
needs a consistent snapshot on the publisher before it can start copying.`,
      setup: code`
drop table if exists lg_ledger;
create table lg_ledger(id int primary key, note text);
insert into lg_ledger select g, 'note-' || g from generate_series(1, 50000) g;`,
      code: code`
-- Session A (publisher): publish the new table.
alter publication lg_pub add table lg_ledger;
select tablename from pg_publication_tables where pubname = 'lg_pub' order by tablename;

-- Session B (subscriber): the schema is NOT replicated. Create it yourself.
\c lab_sub
drop table if exists lg_ledger;
create table lg_ledger(id int primary key, note text);
select srrelid::regclass as tbl, srsubstate from pg_subscription_rel order by 1;

-- Session A: hold an uncommitted write transaction open. A table sync cannot start
-- until it can build a consistent snapshot, which means waiting for us.
begin;
insert into lg_orders values (900, 'blocker', 1.00);
select txid_current() as blocking_xid;

-- Session B: tell the subscriber about the new table.
alter subscription lg_sub refresh publication;
select srrelid::regclass as tbl, srsubstate from pg_subscription_rel order by 1;

-- Session B: a second later the worker has claimed the table but cannot copy it.
select srrelid::regclass as tbl, srsubstate from pg_subscription_rel order by 1 \watch i=2 c=2
select count(*) as rows_on_subscriber from lg_ledger;

-- Session A: release the snapshot.
commit;

-- Session B: the copy runs, the state machine finishes, and the rows are there.
select srrelid::regclass as tbl, srsubstate, srsublsn from pg_subscription_rel order by 1 \watch i=2 c=3
select count(*) as rows_on_subscriber from lg_ledger;
select id, customer from lg_orders where id = 900;`,
      expectedResult: code`
Right after ALTER PUBLICATION ADD TABLE the publisher lists both tables (lg_ledger, lg_orders) but
the subscriber's pg_subscription_rel still has only lg_orders in state r: publishing a table does
not push it anywhere.

REFRESH PUBLICATION adds the row immediately in state i:
     tbl    | srsubstate
  -----------+------------
   lg_orders | r
   lg_ledger | i
and about a second later the table sync worker has moved it to d and left it there:
   lg_ledger | d
with rows_on_subscriber still 0. The worker set the state, then blocked creating its snapshot
behind the open transaction on the publisher. This is why a busy publisher with long transactions
makes new tables take forever to backfill.

After COMMIT the copy runs in well under a second and the state goes to r with a non-null srsublsn
(0/3B0D7288 in one run), rows_on_subscriber is 50000, and the blocker row (900, blocker) has also
arrived through the normal stream. State s (synchronized) exists between d and r but is usually too
short to catch; if REFRESH PUBLICATION itself appears to hang, something on the publisher holds an
ACCESS EXCLUSIVE lock on a published table, because the refresh has to read the publisher's
catalog.

Note what the copy did NOT bring: if you skip the CREATE TABLE on the subscriber, the sync fails
with "relation public.lg_ledger does not exist" and srsubstate stays d forever. DDL is never
replicated.`,
      systemsLens: code`
Backfill plus tail is the universal shape of "start consuming an existing dataset": snapshot at a
point in the log, then replay from that exact point. The correctness requirement is that the
snapshot LSN and the stream start LSN are the same number, which is why srsublsn exists and why the
sync worker needs its own slot and snapshot rather than just running a SELECT. Anyone who has
written a migration by copying a table and then "starting the stream from about now" has shipped
the bug this design avoids. The operational lesson is the one you caused on purpose: a snapshot
cannot be built while an older write transaction is still open, so long transactions on the source
stall not just vacuum but every new consumer that tries to join.`,
      challenge: code`
Set the publication to publish only inserts, then update a row on the publisher and refresh. The
subscriber's copy is correct at the moment it happens and drifts afterwards. A replica is only as
consistent as the weakest operation you chose to publish.`,
    },
    {
      slug: "conflicts-stop-the-apply-worker",
      tags: ["logical-replication", "consistency", "retries", "observability"],
      title: "A conflict stops the apply worker, and nothing else notices",
      difficulty: "advanced",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 25,
      prerequisites: ["initial-sync-vs-streaming"],
      overview: code`
A logical replica is a writable database that happens to be applying someone else's changes. There
is no rule that stops you from writing to it, and no conflict resolution when your write collides
with an incoming one. In this lesson you plant a row on the subscriber that the publisher is about
to insert, and watch the apply worker crash, restart, crash again in a five second loop, while the
publisher keeps accepting writes and reports nothing wrong.`,
      syntaxBreakdown: code`
pg_stat_subscription_stats has one row per subscription with apply_error_count and
sync_error_count, both cumulative since stats_reset. pg_stat_subscription.pid is null while the
apply worker is dead. The server log records the failing statement with a CONTEXT line naming the
replication origin, the message type, and the transaction's finish LSN, which is the information
you need to skip it. ALTER SUBSCRIPTION ... SKIP (lsn = ...) and pg_replication_origin_advance()
discard the stuck transaction; deleting the offending local row instead lets it apply.`,
      setup: code`
-- Publisher side: nothing to prepare, lg_orders is already published.
select count(*) as publisher_rows from lg_orders;`,
      code: code`
-- Session B (subscriber): a local write that will collide.
\c lab_sub
select subname, apply_error_count, sync_error_count, stats_reset from pg_stat_subscription_stats;
insert into lg_orders values (600, 'conflict-local', 0.00);

-- Session A (publisher): the same primary key, different row.
insert into lg_orders values (600, 'from-publisher', 77.00);
insert into lg_orders values (601, 'behind-the-jam', 1.00);
select id, customer from lg_orders where id in (600, 601) order by id;

-- Session B: the apply worker is now failing and retrying.
select subname, apply_error_count from pg_stat_subscription_stats \watch i=3 c=3
select subname, pid is not null as worker_running, received_lsn from pg_stat_subscription;
select id, customer from lg_orders where id in (600, 601) order by id;

-- Session B: the reason, in the server log (the most recent failure, not the first).
\! grep -A2 'duplicate key' $PGLAB/primary/log/postgresql.log | tail -3
\! grep 'logical replication' $PGLAB/primary/log/postgresql.log | tail -3

-- Session B: resolve the conflict by removing the local row. The next retry applies.
delete from lg_orders where id = 600;
select id, customer, amount from lg_orders where id in (600, 601) order by id \watch i=3 c=3
select subname, apply_error_count from pg_stat_subscription_stats;
select subname, pid is not null as worker_running from pg_stat_subscription;`,
      expectedResult: code`
Before the conflict, apply_error_count and sync_error_count are 0 and stats_reset is null.

The publisher's two inserts succeed instantly and the publisher shows both rows (600
from-publisher, 601 behind-the-jam). Nothing on the publisher indicates a problem: the walsender
keeps sending, the slot stays active, and COMMIT never waited for the subscriber.

On the subscriber, apply_error_count climbs by one every five seconds -- sampled every three
seconds it reads 0, 2, 3 (the first sample can land before the first failure) -- because the worker
starts, hits the duplicate key, exits with code 1, and the launcher restarts it. In between, pg_stat_subscription reports worker_running f with a
null received_lsn. The subscriber still shows only (600, conflict-local) and does NOT have row
601: every transaction after the failing one is stuck behind it, because apply is strictly
ordered.

The log names the failure exactly:
  ERROR:  duplicate key value violates unique constraint "lg_orders_pkey"
  DETAIL:  Key (id)=(600) already exists.
  CONTEXT:  processing remote data for replication origin "pg_18691" during message type "INSERT"
    for replication target relation "public.lg_orders" in transaction 3440, finished at 0/36544D68
and the second grep shows the restart loop around it, alternating start and exit every five
seconds with a new PID each time:
  LOG:  logical replication apply worker for subscription "lg_sub" has started
  LOG:  background worker "logical replication worker" (PID 10087) exited with exit code 1
  LOG:  logical replication apply worker for subscription "lg_sub" has started
That finish LSN in the CONTEXT line is the handle you would use to skip the transaction.

After DELETE ... where id = 600 the table is briefly empty for those two ids (the local row is
gone and the publisher's has not been applied yet); within about five seconds the next retry
applies the whole backlog:
   600 | from-publisher |  77.00
   601 | behind-the-jam |   1.00
Row 600 is the publisher's version, because your local row is gone. worker_running is t again, and
apply_error_count does not reset -- it is still 3, which is exactly why it is the metric to alert
on.`,
      systemsLens: code`
This is the asynchronous replication failure mode in its purest form. The publisher's commit is
durable and acknowledged, the replica is stalled, and the only thing connecting the two facts is a
counter nobody is looking at. Multi-writer systems either detect conflicts (version vectors,
last-write-wins, CRDTs) or refuse them (single writer per key); PostgreSQL logical replication
does neither, so "who is allowed to write to the replica" is an invariant you have to enforce
outside the database. Note also that apply is a single ordered stream: one poison message blocks
every later transaction, exactly like a queue consumer with no dead-letter path. The equivalent of
a dead-letter queue here is ALTER SUBSCRIPTION ... SKIP (lsn = ...), and it works by throwing the
transaction away, which means someone has to decide that losing it is acceptable.`,
      challenge: code`
Recreate the conflict, then instead of deleting the local row use the finish LSN from the CONTEXT
line: ALTER SUBSCRIPTION lg_sub SKIP (lsn = ...). The apply worker resumes and the publisher's row
never arrives. Now the two databases disagree permanently and no error is reported anywhere; write
down how you would detect that in production.`,
    },
    {
      slug: "slot-lag-and-disk",
      tags: ["replication-slots", "logical-replication", "capacity", "wal", "observability"],
      title: "A stalled subscriber becomes the publisher's disk problem",
      difficulty: "advanced",
      safetyLevel: "privileged",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 25,
      prerequisites: ["conflicts-stop-the-apply-worker"],
      overview: code`
A replication slot is a promise: the publisher will keep every WAL segment the consumer has not
acknowledged, forever, no matter how much that is. In this lesson you stop the consumer, write on
the publisher, and measure the WAL that piles up and the exact file that cannot be recycled. Then
you restart the consumer, watch the retention drain, and clean up everything the module created --
because an abandoned slot is the single most common way a PostgreSQL server fills its disk.`,
      syntaxBreakdown: code`
ALTER SUBSCRIPTION ... DISABLE stops the apply worker, which disconnects the walsender and makes
the slot inactive; the slot itself survives. pg_replication_slots.restart_lsn is the oldest WAL
byte the slot needs and pg_walfile_name(restart_lsn) turns it into a file name in pg_wal.
wal_status is reserved / extended / unreserved / lost, and safe_wal_size is how much more WAL can
be written before this slot starts losing data -- both are governed by max_slot_wal_keep_size,
which is -1 (unlimited retention) by default. pg_ls_waldir() lists the segment files.
Dropping cleanly: DISABLE, SET (slot_name = none), DROP SUBSCRIPTION, then drop the slot yourself.`,
      setup: code`
select name, setting from pg_settings
where name in ('wal_level', 'max_wal_size', 'wal_keep_size', 'max_slot_wal_keep_size');`,
      code: code`
-- Session A (publisher): the baseline.
select slot_name, active, restart_lsn, pg_walfile_name(restart_lsn) as oldest_needed_file,
       pg_size_pretty(pg_current_wal_lsn() - restart_lsn) as wal_retained, wal_status
from pg_replication_slots where slot_name = 'lg_sub_slot';
select count(*) as wal_files, pg_size_pretty(sum(size)) as pg_wal_bytes from pg_ls_waldir();

-- Session B: remember the publisher database name, then stop the consumer.
-- This is what an outage looks like to the publisher.
select current_database() as pubdb \gset
\c lab_sub
alter subscription lg_sub disable;

-- Session A: keep working. The publisher does not care that nobody is listening.
insert into lg_orders(id, customer, amount)
select g, repeat('x', 200), 1 from generate_series(1000001, 1030000) g;
select slot_name, active, restart_lsn, pg_walfile_name(restart_lsn) as oldest_needed_file,
       pg_size_pretty(pg_current_wal_lsn() - restart_lsn) as wal_retained, wal_status
from pg_replication_slots where slot_name = 'lg_sub_slot';
select count(*) as wal_files, pg_size_pretty(sum(size)) as pg_wal_bytes from pg_ls_waldir();
checkpoint;
select count(*) as wal_files_after_checkpoint, pg_size_pretty(sum(size)) as pg_wal_bytes
from pg_ls_waldir();
select pg_walfile_name(pg_current_wal_lsn()) as current_wal_file,
       pg_walfile_name(restart_lsn) as still_pinned_file
from pg_replication_slots where slot_name = 'lg_sub_slot';

-- Session B: bring the consumer back.
alter subscription lg_sub enable;
select count(*) as rows_on_subscriber from lg_orders \watch i=3 c=4

-- Session A: retention drains once the consumer acknowledges.
select slot_name, active,
       pg_size_pretty(pg_current_wal_lsn() - restart_lsn) as wal_retained,
       pg_walfile_name(restart_lsn) as oldest_needed_file, wal_status
from pg_replication_slots where slot_name = 'lg_sub_slot' \watch i=5 c=6

-- Session B: clean up the subscriber side, then the database itself.
alter subscription lg_sub disable;
alter subscription lg_sub set (slot_name = none);
drop subscription lg_sub;
\c :pubdb
select 'drop database lab_sub' where exists
  (select 1 from pg_database where datname = 'lab_sub')
\gexec

-- Session A: clean up the publisher side. The slot outlives the subscription; drop it.
select pg_drop_replication_slot(slot_name) from pg_replication_slots
where slot_name in ('lg_sub_slot', 'lg_decode');
drop publication if exists lg_pub;
drop table if exists lg_ledger;
drop table if exists lg_orders;
select count(*) as slots_left from pg_replication_slots;`,
      expectedResult: code`
While the subscriber is running the slot is active t, wal_status reserved, and wal_retained is
whatever the cluster has written since the last feedback -- 71 kB on an idle lab, and 148 MB in one
run on a lab where other databases were being hammered at the same time. pg_ls_waldir shows 29 files / 464 MB, the lab's steady state under
max_wal_size = 1 GB.

After DISABLE the slot goes to active f and restart_lsn stops moving: it stays at the same LSN and
oldest_needed_file stays pinned to one segment (00000001000000000000005E in one run) while the
30000 row insert and everything else push the write position on. wal_retained went from 71 kB to
9779 kB, which is that insert's WAL: roughly 300 bytes on disk per 200-byte row. On a busy lab the
pin is worse than the arithmetic suggests -- another run stayed pinned at segment 66 while the
write position reached 70, ten segments (160 MB) that cannot be recycled for one paused
subscriber.

The manual CHECKPOINT is the point of the lesson: pg_wal is still 29 files / 464 MB afterwards.
still_pinned_file is the same segment as before the insert; current_wal_file is either the same
segment (10 MB of new WAL does not always cross a 16 MB segment boundary) or the next one, for
example 00000001000000000000005F against a pin at 00000001000000000000005E. Normally a checkpoint
lets older segments be recycled; here the slot's restart_lsn is older than the checkpoint, so those
segments cannot be released. That is the entire
mechanism of the "replication slot filled the disk" incident, and with
max_slot_wal_keep_size = -1 there is no limit at which the server protects itself. wal_status stays
reserved; it would go to unreserved and then lost (forcing a full resync of the subscriber) only if
a limit were set and exceeded.

After ENABLE the subscriber's lg_orders count jumps by 30000 within a few seconds, and the retention
collapses: 9974 kB, 9974 kB, then 56 bytes across five-second samples, with oldest_needed_file
walking forward from 5E to 5F. It is a sawtooth, not a smooth drain -- feedback is periodic, so on
a lab where other databases are writing you will see it climb again (20 MB, 26 MB, even 73 MB)
between acknowledgements, while oldest_needed_file still advances (66 -> 70 -> 71). The number that proves the pin was released is oldest_needed_file, not the byte
count.

The cleanup sequence must be in that order. DROP SUBSCRIPTION on a subscription that still owns a
slot tries to drop the slot over the replication connection, which is the same-cluster hang from
lesson publication-and-subscription; SET (slot_name = none) first makes the drop a local catalog
operation, and then you drop the slot yourself. At the end slots_left is 0 and lab_sub is gone. If
DROP DATABASE complains that lab_sub is being accessed by other users, some psql is still connected
to it.`,
      systemsLens: code`
Retention is the price of exactly the guarantee you wanted: a consumer that can go away and come
back without losing data. Kafka bounds it with retention.ms and drops the laggard; PostgreSQL
defaults to unbounded and drops the producer instead. Neither is safe by default, and the choice is
the same one every durable queue makes -- when a consumer stops, either lose its data or lose your
disk. The operational rule that follows: a slot is a resource with an owner, monitor
pg_current_wal_lsn() - restart_lsn on every slot, alert on both bytes and slot age, set
max_slot_wal_keep_size when you would rather resync a replica than lose the primary, and treat a
slot with no live consumer as an incident rather than a leftover. This is also the concrete reason
lesson one told you to drop the slots you create.`,
      challenge: code`
Set max_slot_wal_keep_size to 64MB, recreate a slot, write more than that without consuming, and
watch wal_status go from reserved to unreserved to lost. Then try to use the slot: the publisher
tells you the required WAL has been removed. That error is a deliberate design choice -- the
producer stayed alive.`,
    },
  ],
};
