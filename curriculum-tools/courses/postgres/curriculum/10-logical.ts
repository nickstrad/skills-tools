import { code, type Module } from "../../../src/types.ts";
import { LOGICAL_DECODING } from "./logical-decoding.ts";
import { ARCHIVE_PRUNING_REMINDER } from "./archive-reminder.ts";

export const LOGICAL: Module = {
  category: "logical-replication",
  title: "Logical decoding, CDC, and publications",
  lessons: [
    LOGICAL_DECODING,
    {
      slug: "slot-position-and-acknowledgement",
      tags: [
        "replication-slots",
        "logical-decoding",
        "idempotency",
        "retries",
        "gc-horizon",
      ],
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
      reading:
        'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 11 "WAL Modes".',
      syntaxBreakdown: code`
### In plain terms

The slot is a durable acknowledgement point, much like a consumer offset in a message log. Peeking lets a consumer inspect events repeatedly; getting acknowledges them by advancing the offset, and there is no undo. You will also see the cost of an offset that is never acknowledged: the server keeps WAL and catalog history for it.

### What you are learning

- **confirmed_flush_lsn** records what the consumer has acknowledged, while **restart_lsn** records the oldest WAL still required.
- A batch limit does not split a transaction, so atomic changes arrive together even when a consumer asks for fewer events.
- Advancing a slot without processing data is deliberate data loss and should be treated like skipping messages.

### Piece by piece

- **pg_replication_slots** (slot state view)
  - What it is: Reports each slot's activity and retention positions.
  - What it does here: Shows active, restart_lsn, confirmed_flush_lsn, xmin, catalog_xmin, and how much WAL is retained.
  - What it gives us: confirmed_flush_lsn is the acknowledged offset; restart_lsn is the oldest WAL byte kept; catalog_xmin protects catalog rows needed to decode types.
- **pg_logical_slot_peek_changes** (non-consuming read)
  - What it is: Reads decoded changes without moving the slot.
  - What it does here: Two counts and an unchanged confirmed_flush_lsn demonstrate repeatability.
  - What it gives us: Equal counts and an unchanged offset prove peek is safe to retry.
- **pg_logical_slot_get_changes** (consuming read)
  - What it is: Reads and advances decoded changes.
  - What it does here: The first get returns events, the next returns zero, and bounded gets show the transaction-sized delivery rule.
  - What it gives us: got, get_again, and batch counts show exactly which events remain available.
  - **upto_nchanges**: The third argument is a soft maximum checked between transactions, not a command to split a transaction.
- **pg_replication_slot_advance** (offset manipulation function)
  - What it is: Moves a slot to a supplied LSN without decoding or returning skipped events.
  - What it does here: Sets target from pg_current_wal_lsn() and proves table rows remain while consumer events disappear.
  - What it gives us: after_advance = 0 alongside rows_still_in_table proves the consumer skipped real data.
- **pg_current_wal_lsn()** and **pg_wal_lsn_diff** (WAL position functions)
  - What they are: The first returns the current end position; subtraction computes bytes between positions.
  - What they do here: Measure retention; pg_size_pretty formats it as a human-readable kB or MB value.
  - What it gives us: target, retained bytes, and the before/after LSNs quantify the cursor's backlog.
- **pg_drop_replication_slot** (cleanup function)
  - What it is: Deletes the named slot.
  - What it does here: Releases WAL and catalog retention after the experiment.
  - What it gives us: slots_left confirms whether this lesson left any retention obligation behind.
`,
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
      tags: [
        "logical-replication",
        "replication-slots",
        "cdc",
        "streaming-replication",
      ],
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
      reading:
        'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 11 "WAL Modes".',
      syntaxBreakdown: code`
### In plain terms

Logical replication publishes selected table changes and applies them to another database as SQL-level row changes. This lesson builds both sides in the lab: the publisher names what to send, and the subscriber connects, copies existing rows, and keeps applying new ones. The system makes its workers and slot visible so you can tell which component is responsible for each step.

### What you are learning

- A publication is the publisher's allow-list of tables and operations.
- A subscription stores how to connect and starts a walsender, replication slot, and apply worker.
- Initial copy and ongoing streaming are separate phases, and their state is observable per table.

### Piece by piece

- **CREATE PUBLICATION** (DDL command)
  - What it is: Defines a named set of tables and row operations to publish.
  - What it does here: Makes lg_orders eligible for INSERT, UPDATE, and DELETE changes.
  - What it gives us: The publication name lg_pub is referenced by the subscriber.
- **CREATE SUBSCRIPTION** (DDL command)
  - What it is: Defines a subscriber connection and the publication it consumes.
  - What it does here: Creates or adopts a publisher slot, starts an apply worker, and copies existing rows by default.
  - What it gives us: Subscriber rows and worker status show whether the initial copy and ongoing apply succeeded.
  - **create_slot = false** prevents a second slot; **slot_name** selects the existing slot; **copy_data = true** requests the initial copy.
- **pg_stat_replication** and **pg_stat_subscription** (monitoring views)
  - What they are: The first lists publisher walsenders; the second reports subscriber workers and apply positions.
  - What they do here: Prove that the sender connection and apply worker are active.
  - What it gives us: Sender state and subscriber PID/LSN fields identify the two ends of the logical stream.
- **pg_subscription** and **pg_replication_slots** (catalog and slot views)
  - What they are: Store the subscription definition and publisher retention cursor.
  - What they do here: Verify the connection, publication, slot, and active state.
  - What it gives us: Catalog rows make the stored connection/publication relationship and retention cursor inspectable.
- **\gset**, **\set**, and **:'var'** (psql variable commands)
  - What they are: Capture query output, build a string, and interpolate a quoted variable.
  - What they do here: Assemble the subscriber connection string from discovered host, port, and database values.
  - What it gives us: The generated conn string is evidence that Session B targets the intended lab publisher.
- **pg_publication** and **pg_publication_tables** (publication catalog views)
  - What they are: The first stores publication options; the second expands a publication into table names and columns.
  - What they do here: Confirm lg_pub publishes lg_orders and which operations are enabled.
  - What it gives us: pubinsert, pubupdate, pubdelete, schemaname, and tablename show the publication's actual scope.
- **\gexec** (psql execution command)
  - What it is: Executes each text value returned by the preceding query as SQL.
  - What it does here: Conditionally creates, disables, detaches, or drops subscriber objects only when they exist.
  - What it gives us: Idempotent setup output lets the lesson be rerun without assuming objects already exist.
- **CREATE DATABASE** and **\c** (database creation and connection commands)
  - What they are: CREATE DATABASE makes lab_sub; \c switches the current psql session into it.
  - What they do here: Build the subscriber separately from the publisher; the database name comes from the captured pubdb variable.
  - What it gives us: A successful connection to lab_sub proves the subscriber is a separate database endpoint.
`,
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
      reading:
        'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 4 "Snapshots".',
      syntaxBreakdown: code`
### In plain terms

Adding a table to a publication does not immediately make an existing subscription copy it. The subscriber must refresh its publication, then it performs an initial copy and switches to streaming at a known WAL position. This experiment exposes that handoff and the per-table state machine instead of treating replication as one unexplained green light.

### What you are learning

- Publication membership and subscription knowledge are separate and require an explicit refresh.
- Initial table synchronization uses a consistent snapshot, then a recorded LSN marks where streaming takes over.
- Per-table state tells you whether a new table is initializing, copying, synchronized, or ready.

### Piece by piece

- **ALTER PUBLICATION ... ADD TABLE** (publication DDL)
  - What it is: Adds an existing table to the publisher's publication set.
  - What it does here: Makes a table eligible for sending, but does not change the subscriber until refresh.
  - What it gives us: pg_publication_tables shows the new table while the subscriber still lacks a pg_subscription_rel row.
- **ALTER SUBSCRIPTION ... REFRESH PUBLICATION** (subscriber command)
  - What it is: Re-reads the publisher's publication membership.
  - What it does here: Discovers the new table and starts initial synchronization.
  - What it gives us: A new row with srsubstate i is direct evidence that the subscriber noticed the table.
- **pg_subscription_rel** (subscriber catalog table)
  - What it is: Stores one row describing synchronization for each subscribed relation.
  - What it does here: srsubstate shows i initialize, d data copy, f copy finished, s synchronized, and r ready for normal streaming.
  - **srsublsn**: The WAL position at which copying ended and streaming became responsible for later changes.
  - What it gives us: State changes and a non-null srsublsn prove the copy completed without a gap.
- **consistent snapshot** (MVCC snapshot)
  - What it is: A fixed view of committed rows at one logical instant.
  - What it does here: Keeps the initial copy coherent while writes continue; the stream fills the gap after its snapshot.
  - What it gives us: A blocked worker and zero copied rows show the open publisher transaction prevented snapshot creation.
- **temporary synchronization slot** (replication slot)
  - What it is: A short-lived retention cursor used by one table-copy worker.
  - What it does here: Prevents required WAL disappearing before the copy reaches its handoff LSN.
  - What it gives us: The handoff can finish with all rows present because WAL remains available through the copy.
- **pg_stat_subscription** (worker view)
  - What it is: Reports apply and synchronization worker activity.
  - What it does here: Distinguishes a table copy in progress from an idle subscription.
  - What it gives us: Worker activity and timing fields show whether synchronization is progressing or stalled.
- **txid_current()** (transaction-ID function)
  - What it is: Returns the ID assigned to the current transaction.
  - What it does here: Labels the open publisher transaction that blocks the synchronization snapshot.
  - What it gives us: blocking_xid ties the observed wait to one transaction that must COMMIT.
- **\watch i=2 c=2 / \watch i=2 c=3** (psql polling command)
  - What it is: Repeats a status query at a two-second interval for a bounded number of samples.
  - What it does here: Captures the brief state transitions and shows rows arriving after COMMIT releases the snapshot.
  - What it gives us: Repeated srsubstate and row counts reveal i/d/r progression rather than only the final state.
`,
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
      reading:
        'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 11 "WAL Modes".',
      syntaxBreakdown: code`
### In plain terms

Logical replication applies remote changes to local tables, so a local row can block or reject an incoming change. When that happens, the apply worker stops and every later change waits behind the same transaction. You will read worker statistics and the log to identify the exact finish LSN, then choose between fixing the row and intentionally skipping the stuck transaction.

### What you are learning

- Apply errors are cumulative evidence, while a null worker PID shows that replication is currently stopped.
- The log's finish LSN identifies the transaction boundary at which the worker is stuck.
- Skipping advances the replication origin and loses that transaction locally; correcting the row preserves the stream.

### Piece by piece

- **pg_stat_subscription_stats** (subscription statistics view)
  - What it is: Cumulative per-subscription error counters.
  - What it does here: apply_error_count counts apply failures and sync_error_count counts initial-copy failures since statistics reset.
  - What it gives us: A nonzero counter proves an error occurred even after the worker restarts.
- **pg_stat_subscription.pid** (worker status column)
  - What it is: The operating-system PID of the apply worker.
  - What it does here: A null PID while enabled means the worker died or is stopped after the error.
  - What it gives us: A changing PID across retries or null while stopped is evidence of the worker's lifecycle.
- **server log and CONTEXT** (diagnostic output)
  - What they are: PostgreSQL error lines and extra replication context.
  - What they do here: Name the failed statement, origin, message type, and finish LSN; use that LSN for a skip.
  - What it gives us: The finish LSN is the exact safe boundary needed for a targeted skip.
- **ALTER SUBSCRIPTION ... SKIP (lsn = ...)** (recovery command)
  - What it is: Tells the subscriber to discard the transaction ending at a supplied LSN.
  - What it does here: Moves past the stuck transaction; the LSN must come from the log.
  - What it gives us: A resumed worker and advancing origin show later changes are no longer blocked; the skipped row is absent locally.
- **pg_replication_origin_advance** (origin-position function)
  - What it is: Directly moves the subscriber's recorded remote WAL position.
  - What it does here: Demonstrates the offset change caused by a skip; use it only with the exact remote LSN.
  - What it gives us: The origin position after the call records the new remote checkpoint.
- **DELETE** (local conflict repair)
  - What it is: Removes the row preventing an incoming change.
  - What it does here: Lets the original transaction apply normally, avoiding skip-induced data loss.
  - What it gives us: The originally failing change appears on the subscriber after the worker resumes.
- **ALTER SUBSCRIPTION ... ENABLE** (worker restart command)
  - What it is: Turns a disabled subscription back on.
  - What it does here: Restarts the apply worker after the conflict is repaired or skipped so later transactions can continue.
  - What it gives us: A non-null worker PID and falling apply lag show that the subscription recovered.
- **pg_replication_origin_progress** (origin monitoring function)
  - What it is: Reports the remote WAL position recorded for an origin.
  - What it does here: Lets you confirm that the subscriber moved past the finish LSN after recovery.
  - What it gives us: The returned remote_lsn can be compared directly with the log's finish LSN.
- **pg_sleep** and **\watch** (timing and polling tools)
  - What they are: pg_sleep pauses SQL; \\watch repeats a query at a fixed interval.
  - What they do here: Give the worker time to fail or restart and make its changing PID and counters observable.
  - What it gives us: Repeated samples distinguish a transient apply delay from a worker stuck on one transaction.
`,
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
      tags: [
        "replication-slots",
        "logical-replication",
        "capacity",
        "wal",
        "observability",
      ],
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
      caution: ARCHIVE_PRUNING_REMINDER,
      reading:
        'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".',
      syntaxBreakdown: code`
### In plain terms

An abandoned logical subscription can quietly retain WAL on the publisher, because its slot must preserve every change the absent consumer might still need. This lesson disables the subscriber, generates enough changes to make retention visible, and checks the WAL directory and slot status. Cleanup is explicit so the publisher is not left with a disk-filling obligation.

### What you are learning

- Disabling a subscription stops its worker but does not delete the publisher-side slot.
- restart_lsn names the oldest required WAL, and safe_wal_size tells you how close the slot is to its configured limit.
- Dropping a subscription and its slot is lifecycle work; stopping a worker alone is not cleanup.

### Piece by piece

- **ALTER SUBSCRIPTION ... DISABLE** (subscription command)
  - What it is: Turns off automatic apply for a subscription.
  - What it does here: Stops the apply worker and disconnects the publisher's walsender while preserving the slot.
  - What it gives us: pg_replication_slots.active becomes false, proving the retention cursor remains without a consumer.
- **pg_replication_slots** (slot monitoring view)
  - What it is: Reports slot activity and WAL positions controlling retention.
  - What it does here: restart_lsn identifies the oldest required byte; wal_status reports reserved, extended, unreserved, or lost; safe_wal_size reports remaining headroom.
  - What it gives us: Slot activity, retained bytes, and status show whether the disabled consumer is holding publisher disk.
- **pg_walfile_name(restart_lsn)** (WAL filename function)
  - What it is: Converts the retained LSN to the segment filename containing it.
  - What it does here: Lets you compare the slot's oldest requirement with files in pg_wal.
  - What it gives us: oldest_needed_file identifies the exact segment that cannot yet be recycled.
- **max_slot_wal_keep_size** (WAL-retention setting)
  - What it is: Limits how much WAL replication slots may retain; -1 means no limit.
  - What it does here: Governs when an abandoned slot moves toward invalidation.
  - What it gives us: safe_wal_size and wal_status show how close the slot is to losing its retained history.
- **pg_ls_waldir()** (server directory function)
  - What it is: Lists WAL segment files and their sizes.
  - What it does here: Shows disk evidence of a slot holding back cleanup; sum(size) is the total to compare.
  - What it gives us: wal_files and pg_wal_bytes quantify the disk footprint before and after the consumer returns.
- **ALTER SUBSCRIPTION ... SET (slot_name = none)** (subscription configuration command)
  - What it is: Removes the subscription's association with its publisher slot.
  - What it does here: Makes it safe to drop the subscription without targeting the wrong slot.
  - What it gives us: The publisher-side slot remains explicitly identifiable for the final drop.
- **DROP SUBSCRIPTION** and **pg_drop_replication_slot** (cleanup operations)
  - What they are: The first removes the subscriber definition; the second removes the surviving publisher cursor.
  - What they do here: Release both objects so WAL can be recycled; confirm no lab slot remains.
  - What it gives us: slots_left = 0 proves the disk-retention obligation was removed.
- **pg_settings** (configuration view)
  - What it is: Lists current server setting names and values.
  - What it does here: Records wal_level, max_wal_size, wal_keep_size, and max_slot_wal_keep_size before changing retention behavior.
  - What it gives us: The setting values provide the baseline for interpreting later recycling and invalidation.
- **CHECKPOINT** (SQL checkpoint command)
  - What it is: Forces dirty pages and checkpoint bookkeeping to disk.
  - What it does here: Gives PostgreSQL a chance to recycle WAL; the pinned slot prevents eligible files from disappearing.
  - What it gives us: A stable file count after CHECKPOINT is evidence that the slot, not checkpoint timing, holds the segments.
- **\watch i=3 c=4 / \watch i=5 c=6** (psql polling command)
  - What it is: Repeats a status query at a fixed interval for a bounded number of samples.
  - What it does here: Shows subscriber rows and retained WAL fall after the worker reconnects.
  - What it gives us: Time-series samples show both apply progress and retention draining rather than a single snapshot.
- **pg_read_file** (server file function)
  - What it is: Reads text from a data-directory file.
  - What it does here: The challenge can inspect the server log for retention or cleanup evidence.
  - What it gives us: The log text provides the server's own explanation when a slot is invalidated or removed.
`,
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
