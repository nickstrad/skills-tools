import { code, type Module } from "../../../src/types.ts";
import { SYNC_ACKNOWLEDGEMENT } from "./sync-acknowledgement.ts";
import { REPLICA_READINESS } from "./replica-readiness.ts";
import { REPLAY_LAG } from "./replay-lag.ts";
import { STANDBY_WORKLOAD } from "./standby-workload.ts";
import { ARCHIVE_PRUNING_REMINDER } from "./archive-reminder.ts";

export const REPLICATION: Module = {
  category: "replication",
  title: "Physical streaming replication and failover",
  lessons: [
    STANDBY_WORKLOAD,

    REPLAY_LAG,

    REPLICA_READINESS,

    SYNC_ACKNOWLEDGEMENT,

    {
      slug: "hot-standby-query-conflict",
      tags: ["hot-standby", "vacuum", "mvcc", "consistency", "gc-horizon"],
      title: "Recovery conflicts: the replica cancels your query",
      difficulty: "advanced",
      safetyLevel: "privileged",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 30,
      prerequisites: [
        "replication-lag-under-load",
        "xmin-horizon-blocks-cleanup",
      ],
      overview: code`
A hot standby has two jobs that are in direct conflict. It must replay the primary's WAL as fast as
it arrives, and it must give its own read-only queries a stable snapshot. When the primary vacuums
away row versions that a query on the standby is still allowed to see, those two jobs cannot both
be done, and PostgreSQL resolves it in favour of replay: it waits max_standby_streaming_delay for
the query to finish, and then kills the query.

You will cause it on purpose. Lower max_standby_streaming_delay to 2 seconds on the standby, start
a long query inside a repeatable-read transaction, then delete and VACUUM the rows on the primary.
Within seconds the standby cancels your query with "canceling statement due to conflict with
recovery", and pg_stat_database_conflicts counts it.`,
      reading:
        'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 11 "WAL Modes".',
      syntaxBreakdown: code`
### In plain terms

A standby must replay cleanup changes from the primary while also keeping old row versions available to a long-running read. When those requirements collide, PostgreSQL protects replay by cancelling the standby query after a delay. You will create that conflict and then compare it with feedback, which protects the query by making the primary keep more dead rows.

### What you are learning

- Recovery conflicts are normal consequences of serving reads from a replaying copy.
- **max_standby_streaming_delay** bounds how long replay waits before cancelling a conflicting query.
- **hot_standby_feedback** trades query survival for primary-side bloat by extending the oldest transaction horizon.

### Piece by piece

- **max_standby_streaming_delay** (standby recovery setting)
  - What it is: Maximum time replay waits for a conflicting standby query.
  - What it does here: ALTER SYSTEM sets it to two seconds, so the held repeatable-read query is cancelled quickly; -1 would wait forever.
  - What it gives us: The query error says canceling statement due to conflict with recovery, and replay then proceeds.
- **hot_standby_feedback** (standby recovery setting)
  - What it is: A message from standby to primary carrying the oldest snapshot transaction ID.
  - What it does here: When enabled, it prevents primary VACUUM from removing row versions that the standby query may still need.
  - What it gives us: Fewer cancellations, but rising dead tuples and table size on the primary if the reader remains open.
- **ALTER SYSTEM** and **pg_reload_conf()** (configuration tools)
  - What they are: The first writes the standby's setting file; the second activates a reloadable change without restart.
  - What they do here: Apply each delay or feedback value on port 5441, where recovery runs.
  - What it gives us: pg_settings shows the active value, so you can distinguish a reload failure from a recovery conflict.
- **pg_stat_database_conflicts** (database statistics view)
  - What it is: Cumulative counts of queries cancelled by recovery conflicts.
  - What it does here: Its confl_snapshot column counts removed row-version conflicts; confl_lock, confl_tablespace, confl_bufferpin, confl_deadlock, and confl_active_logicalslot identify other causes.
  - What it gives us: A counter increasing after cancellation proves recovery, not the SQL client, stopped the query.
- **VACUUM** and **REPEATABLE READ** (SQL maintenance and isolation choices)
  - What they are: VACUUM removes obsolete row versions; repeatable read keeps one stable snapshot.
  - What they do here: The primary cleanup creates the WAL replay event while the standby transaction keeps the old version needed by its SELECT.
  - What it gives us: The cancellation error and VACUUM's removed-tuple count connect the old snapshot to the cleanup replay record.
- **pg_stat_activity** (session activity view)
  - What it is: Lists sessions, transaction state, and wait information.
  - What it does here: The held standby query remains visible while replay waits; rollback ends its repeatable-read snapshot.
  - What it gives us: The session state and query text show which reader is holding the conflicting snapshot.
- **pg_stat_user_tables** (table statistics view)
  - What it is: Reports estimated live and dead tuple counts and vacuum timestamps.
  - What it does here: n_dead_tup and last_vacuum show that the primary cleaned its table even though a remote query was cancelled.
  - What it gives us: The n_live_tup, n_dead_tup, and last_vacuum columns show the primary-side cleanup outcome.
- **pg_controldata** (control-file shell reader)
  - What it is: Prints cluster state and checkpoint metadata without connecting to SQL.
  - What it does here: The challenge can compare standby and primary state after a deliberately conflicting operation.
  - What it gives us: Cluster-state and checkpoint lines reveal whether the server is still in production or recovery.
`,
      setup: code`
drop table if exists rep_conflict;
create table rep_conflict(id int primary key, pad text);
insert into rep_conflict select g, repeat('c', 100) from generate_series(1, 50000) g;
select pg_sleep(1);`,
      code: code`
-- Session B: move to the standby and shorten its patience from 30s to 2s so the
-- experiment fits in one coffee. This writes the STANDBY's postgresql.auto.conf.
select current_database() as labdb \gset
\c :labdb - /tmp 5441
alter system set max_standby_streaming_delay = '2s';
select pg_reload_conf();
select pg_sleep(1);
select name, setting from pg_settings
where name in ('max_standby_streaming_delay','max_standby_archive_delay','hot_standby_feedback');
select datname, confl_snapshot, confl_lock, confl_bufferpin, confl_deadlock
from pg_stat_database_conflicts where datname = current_database();

-- Session B: take a snapshot and hold it inside a long-running query. The
-- transaction is REPEATABLE READ, so its snapshot survives statement to
-- statement and its xmin pins every row version it might still need.
begin isolation level repeatable read;
select count(*) as rows_visible_at_snapshot from rep_conflict;

-- Session B (blocks until replay of the primary's VACUUM kills it):
select pg_sleep(25) as never_returns;

-- Session A (primary): make those row versions garbage and collect it. The
-- VACUUM writes cleanup WAL records carrying "everything older than this xid is
-- gone"; the standby has to apply them.
delete from rep_conflict where id % 2 = 0;
vacuum (verbose) rep_conflict;
select pg_current_wal_lsn() as after_vacuum;

-- Session B: the sleep never finished. Read the error, then look at the
-- counter that recorded it, then give the standby its patience back before
-- querying again -- while the delay is 2s and replay is still catching up, an
-- ordinary SELECT can be cancelled a second time for holding a buffer pin.
rollback;
select datname, confl_snapshot, confl_lock, confl_bufferpin, confl_deadlock
from pg_stat_database_conflicts where datname = current_database();
alter system reset max_standby_streaming_delay;
select pg_reload_conf();
select pg_sleep(3);
select count(*) as rows_after_conflict from rep_conflict;
select pg_last_xact_replay_timestamp() as last_commit_applied;

-- Session A: the primary never noticed. hot_standby_feedback = off means the
-- standby's snapshot was never part of the primary's horizon.
select backend_xmin is null as primary_ignores_standby_snapshot
from pg_stat_replication;
select n_live_tup, n_dead_tup, last_vacuum is not null as vacuumed
from pg_stat_user_tables where relname = 'rep_conflict';`,
      expectedResult: code`
On the standby the reload takes:

  name                        | setting
  max_standby_streaming_delay | 2000      (milliseconds)
  max_standby_archive_delay   | 30000
  hot_standby_feedback        | off

pg_stat_database_conflicts starts at zeros on a standby you have not run this on before; the
counters are cumulative, so what matters is that confl_snapshot goes up by one.

Session B's repeatable-read transaction sees rows_visible_at_snapshot = 50000 and then parks in
pg_sleep(25). On the primary, VACUUM VERBOSE reports the garbage it collected:

  INFO:  finished vacuuming "lab.public.rep_conflict": index scans: 1
  tuples: 25000 removed, 25000 remain, 0 are dead but not yet removable
  removable cutoff: 90761, which was 0 XIDs old when operation ended
  index scan needed: 863 pages from table (100.00% of total) had 25000 dead item identifiers removed
  WAL usage: 2730 records, 3 full page images, 321711 bytes

"0 are dead but not yet removable" is the primary saying it had no reason to keep anything: the
standby's snapshot is invisible to it. Those 2730 WAL records are the murder weapon.

About two seconds later -- max_standby_streaming_delay, not the default 30 -- the standby kills the
query:

  ERROR:  canceling statement due to conflict with recovery
  DETAIL:  User query might have needed to see row versions that must be removed.

and the counter records it:

  datname | confl_snapshot | confl_lock | confl_bufferpin | confl_deadlock
  lab     |              1 |          0 |               0 |              0

After the delay is reset and replay settles, rows_after_conflict is 25000: the standby is current
and perfectly usable, it just could not serve a snapshot from before the vacuum. (Query it again
too quickly while the delay is still 2s and you can collect a second cancellation, DETAIL "User was
holding shared buffer pin for too long", counted in confl_bufferpin -- a different conflict class,
the same mechanism.)

On the primary, nothing happened at all: primary_ignores_standby_snapshot is t, because
pg_stat_replication.backend_xmin is null when hot_standby_feedback is off; n_live_tup is 25000 and
n_dead_tup is 0. The primary collected its garbage on schedule, and a query died on another machine
for it.`,
      systemsLens: code`
Follower reads are not free, and this is the bill. The replica has to choose between two
correctness properties -- replay must not stall (or the replica stops being a usable failover
target) and a snapshot must stay readable (or queries return wrong answers) -- and no local choice
satisfies both. PostgreSQL exposes the choice as three dials that all move the same pain around:
max_standby_streaming_delay moves it onto your queries, hot_standby_feedback moves it onto the
primary's bloat and vacuum, and a replication slot plus a delayed standby moves it onto disk.

The general principle is that garbage collection needs a global horizon, and a distributed reader
is a hold on that horizon which the collector cannot see. Every system with snapshot reads and
independent compaction hits it: an old MVCC snapshot pinning an SSTable, a long Spark read against
a compacting table format, a consumer holding a Kafka offset below the retention point. You either
propagate the reader's horizon back to the collector (hot_standby_feedback, leases on a snapshot)
and pay in space, or you let the collector win and make readers restartable, which means your
client code must expect ERROR 40001-shaped failures and retry -- the same retry loop as module 05,
for a completely different reason.

Operationally: a cancelled query on a replica is a normal event, not an incident. Application code
that reads from replicas needs the retry, and analysts pointed at a replica need either
hot_standby_feedback and a bloat budget, or their own replica.`,
      challenge: code`
Move the pain. Set hot_standby_feedback = on on the standby, repeat the experiment, and watch two
things change: the query survives, and on the primary "vacuum (verbose) rep_conflict" now reports
dead tuples it cannot remove ("N dead row versions cannot be removed yet, oldest xmin: ...").
Confirm with pg_stat_replication.backend_xmin, which is no longer null. Which of the two failure
modes would you rather explain to the person who owns the primary's disk?`,
    },

    {
      slug: "replication-slot-retains-wal",
      tags: [
        "replication-slots",
        "wal",
        "capacity",
        "streaming-replication",
        "observability",
      ],
      title: "A slot is an unbounded promise until you bound it",
      difficulty: "advanced",
      safetyLevel: "privileged",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 30,
      prerequisites: ["replication-lag-under-load", "wal-files-and-recycling"],
      overview: code`
The standby you built has no safety net. It streams from wherever the primary happens to still have
WAL, and the primary recycles segments on its own schedule -- so a standby that is offline long
enough comes back to "requested WAL segment has already been removed" and has to be rebuilt from a
fresh base backup.

A physical replication slot fixes that by making the primary keep every segment the standby has not
confirmed. That promise has no expiry date, which is the other failure mode: one forgotten slot
fills the primary's disk. You will attach the standby to a slot, create a second slot for a
consumer that never comes back, watch pg_wal stop shrinking, and then put a 64 MB bound on the
promise with max_slot_wal_keep_size and watch the server invalidate the slot rather than run out of
disk.`,
      reading:
        'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".',
      syntaxBreakdown: code`
### In plain terms

A replication slot is a server-side promise to keep WAL until a consumer has reached a position. This experiment creates an idle slot, generates changes, and watches retained files grow; it then enables a limit so PostgreSQL can invalidate the slot instead of filling the disk forever.

### What you are learning

- A slot's restart position is a retention obligation, even when no consumer is connected.
- Slot status distinguishes safely retained WAL from WAL that is approaching or has passed its configured limit.
- A retention cap protects the cluster by sacrificing an abandoned consumer, which must then be rebuilt.

### Piece by piece

- **pg_create_physical_replication_slot** (SQL slot function)
  - What it is: Creates a named cursor for a physical WAL consumer.
  - What it does here: With immediately_reserve true, it starts reserving WAL before a standby connects.
  - What it gives us: The returned slot name and LSN identify the retention anchor.
- **pg_replication_slots** (slot monitoring view)
  - What it is: Lists logical and physical slots and their resource positions.
  - What it does here: Shows active and active_pid, restart_lsn, safe_wal_size, wal_status, and whether the slot has been invalidated.
  - What it gives us: restart_lsn is the oldest required byte; safe_wal_size is remaining headroom; wal_status reserved, extended, unreserved, or lost describes safety.
- **pg_walfile_name(restart_lsn)** (WAL filename function)
  - What it is: Converts an LSN into the segment filename containing it.
  - What it does here: Names the files the slot prevents from being removed.
  - What it gives us: The oldest_needed_file value identifies the segment that should remain on disk.
- **primary_slot_name** (standby setting)
  - What it is: The physical slot name a standby's WAL receiver should use.
  - What it does here: After reload, the standby requests WAL through this slot rather than allowing the primary to forget its position.
  - What it gives us: pg_stat_wal_receiver.slot_name shows the standby is attached to the intended slot.
- **max_slot_wal_keep_size** (primary retention setting)
  - What it is: Maximum WAL space slots may retain; -1 means unlimited.
  - What it does here: A finite value lets a checkpoint invalidate a slot that has fallen too far behind.
  - What it gives us: The server log records invalidating obsolete replication slot, and the consumer must be rebuilt.
- **CHECKPOINT** (SQL durability operation)
  - What it is: Forces PostgreSQL to write dirty pages and finish a checkpoint.
  - What it does here: Makes the server evaluate slot retention and recycle eligible WAL, so bounded and unbounded cases are visible.
  - What it gives us: Comparing pg_wal before and after the checkpoint shows whether retention prevented recycling.
- **pg_ls_waldir()** and **pg_size_pretty** (WAL inspection and formatting functions)
  - What they are: The first lists segment files; the second formats byte counts.
  - What they do here: Compare the number and total size of pg_wal files with each slot's wal_retained value.
  - What it gives us: wal_files and pg_wal_bytes make disk growth visible in count and readable size units.
- **pg_stat_file**, **pg_read_file**, and **regexp_split_to_table** (server file-inspection functions)
  - What they are: Read file metadata, read file text, and turn text into rows by a separator.
  - What they do here: Capture the log size before the test, then inspect new lines for the slot-invalidation message.
  - What it gives us: The filtered log row is evidence that PostgreSQL invalidated the obsolete slot at the retention limit.
- **pg_drop_replication_slot** (cleanup function)
  - What it is: Removes a slot and its retention obligation.
  - What it gives us: slots_left = 0 confirms no abandoned consumer can keep WAL after cleanup.
  - What it does here: Releases the lab's WAL after the observation.
`,
      caution: code`${ARCHIVE_PRUNING_REMINDER}

This lesson writes about 120 MB of WAL into $PGLAB and into the archive, and briefly sets
max_slot_wal_keep_size = 64MB on the primary. The last steps reset it, drop both slots, and put the
standby back to slot-free streaming; do not stop before them. An orphaned slot on a real primary is
the most common cause of "the database filled the disk".`,
      setup: code`
drop table if exists rep_slot_churn;
create table rep_slot_churn(id int primary key, pad text);
select slot_name, slot_type, active from pg_replication_slots;`,
      code: code`
-- Session A (primary). Today the standby streams with no promise at all.
select count(*) as slots_now from pg_replication_slots;
select count(*) as wal_files, pg_size_pretty(sum(size)) as pg_wal_bytes from pg_ls_waldir();
select pg_create_physical_replication_slot('rep_standby_slot', true) as created;
select slot_name, slot_type, active, restart_lsn, wal_status from pg_replication_slots;

-- Session B: point the standby's walreceiver at the slot and reload. The
-- walreceiver disconnects and comes back holding the slot.
select current_database() as labdb \gset
\c :labdb - /tmp 5441
alter system set primary_slot_name = 'rep_standby_slot';
select pg_reload_conf();
select pg_sleep(3);
select status, slot_name, sender_port, received_tli from pg_stat_wal_receiver;

-- Session A: the slot is now attached to a live consumer, and a second slot is
-- created for a consumer that will never connect at all.
select slot_name, active, active_pid, restart_lsn, wal_status from pg_replication_slots;
select pg_create_physical_replication_slot('rep_ghost', true) as created;
select pg_current_wal_lsn() as lsn_at_ghost_creation \gset

-- Write about 75 MB of WAL, then checkpoint: normally that would let old
-- segments be recycled.
insert into rep_slot_churn select g, repeat('s', 200) from generate_series(1, 250000) g;
checkpoint;
select count(*) as wal_files, pg_size_pretty(sum(size)) as pg_wal_bytes from pg_ls_waldir();
select slot_name, active, pg_walfile_name(restart_lsn) as oldest_needed_file,
       pg_size_pretty(pg_current_wal_lsn() - restart_lsn) as wal_retained,
       wal_status, pg_size_pretty(safe_wal_size) as safe_wal_size
from pg_replication_slots order by slot_name;

-- Bound the promise, then keep writing. 64 MB is far less than the ghost is
-- already holding.
select (pg_stat_file('log/postgresql.log')).size as log_size_before \gset
alter system set max_slot_wal_keep_size = '64MB';
select pg_reload_conf();
insert into rep_slot_churn select g, repeat('s', 200) from generate_series(250001, 400000) g;
checkpoint;
checkpoint;
select slot_name, active, pg_walfile_name(restart_lsn) as oldest_needed_file,
       pg_size_pretty(pg_current_wal_lsn() - restart_lsn) as wal_retained,
       wal_status, pg_size_pretty(safe_wal_size) as safe_wal_size
from pg_replication_slots order by slot_name;
select count(*) as wal_files, pg_size_pretty(sum(size)) as pg_wal_bytes from pg_ls_waldir();

-- The server said so in its log.
select l from regexp_split_to_table(
         pg_read_file('log/postgresql.log', :log_size_before, 200000), chr(10))
         with ordinality as t(l, n)
where l like '%slot%'
order by n;

-- Session B: the streaming standby was never in danger -- it is caught up, so
-- its slot never fell behind the cutoff.
select status, slot_name, received_tli from pg_stat_wal_receiver;
select count(*) as rows_on_standby from rep_slot_churn;

-- Session A: undo everything this lesson set.
alter system reset max_slot_wal_keep_size;
select pg_reload_conf();
select pg_drop_replication_slot('rep_ghost');

-- Session B: back to slot-free streaming, so the next lessons start clean.
alter system reset primary_slot_name;
select pg_reload_conf();
select pg_sleep(3);
select status, slot_name from pg_stat_wal_receiver;

-- Session A: drop the last slot and check the primary is as it was.
select pg_sleep(1);
select pg_drop_replication_slot('rep_standby_slot');
select count(*) as slots_left from pg_replication_slots;
drop table rep_slot_churn;
checkpoint;
select count(*) as wal_files, pg_size_pretty(sum(size)) as pg_wal_bytes from pg_ls_waldir();
select pg_read_file('postgresql.auto.conf') as auto_conf;`,
      expectedResult: code`
The lab starts with no slots and 17 files / 256 MB in pg_wal. Creating the slot returns the LSN it
has pinned:

  created
  (rep_standby_slot,1/A1698E38)

  slot_name        | slot_type | active | restart_lsn | wal_status
  rep_standby_slot | physical  | f      | 1/A1698E38  | reserved

active is f because nothing has connected to it yet. After the standby reloads with
primary_slot_name set, its walreceiver reconnects through the slot:

  status    | slot_name        | sender_port | received_tli
  streaming | rep_standby_slot |        5440 |            1

and on the primary that slot is now active = t with an active_pid and a restart_lsn that tracks the
standby.

rep_ghost is then created at the same LSN and nothing ever connects to it. 250000 rows (about
79 MB of WAL) and a CHECKPOINT later:

  slot_name        | active | oldest_needed_file       | wal_retained | wal_status | safe_wal_size
  rep_ghost        | f      | 0000000100000001000000A1 | 79 MB        | reserved   |
  rep_standby_slot | t      | 0000000100000001000000A6 | 0 bytes      | reserved   |

Two consumers, two stories: the live one is at file A6 and owes nothing, the dead one still holds
file A1 with 79 MB behind it, and the CHECKPOINT could not release a byte of it. safe_wal_size is
null because max_slot_wal_keep_size is -1 -- with no limit there is no "how close am I to it".
pg_wal itself is still 17 files / 256 MB, which is the trap: the lab has enough headroom that the
number on your disk dashboard has not moved yet.

Now the bound. max_slot_wal_keep_size = 64MB, 150000 more rows, two checkpoints:

  slot_name        | active | oldest_needed_file       | wal_retained | wal_status | safe_wal_size
  rep_ghost        | f      |                          |              | lost       |
  rep_standby_slot | t      | 0000000100000001000000A9 | 0 bytes      | reserved   | 75 MB

rep_ghost has no restart_lsn at all any more: the server took the promise back. The streaming
standby was never in danger -- being caught up, it is 75 MB of safe_wal_size away from the limit.
And pg_wal finally shrinks, 17 files to 16.

The server logged the decision, which is the line to alert on:

  LOG:  parameter "max_slot_wal_keep_size" changed to "64MB"
  LOG:  invalidating obsolete replication slot "rep_ghost"
  DETAIL:  The slot's restart_lsn 1/A1698E38 exceeds the limit by 60191176 bytes.
  HINT:  You might need to increase max_slot_wal_keep_size.

57 MB past a 64 MB budget, and the consequence is absolute: a consumer whose slot goes to lost
cannot resume, ever, and must be rebuilt from a new base backup.

The cleanup leaves slots_left = 0, the standby streaming again with an empty slot_name (back to
best-effort retention), pg_wal at 16 files / 240 MB, and postgresql.auto.conf holding only its two
comment lines.`,
      systemsLens: code`
A slot is a lease with no expiry, granted to a consumer that may never come back. It converts
"the follower can fall behind" into "the leader keeps everything the follower has not read", which
is exactly the guarantee you want during a five-minute standby restart and exactly the guarantee
that kills you during a five-day one. The resource being pinned is not obviously a resource --
nobody's dashboard says "WAL retained by slots" until the disk is full -- which is what makes it
such a reliable outage.

Every log-based system has this dial and every one of them chose a default. Kafka's default is
time- and size-based retention: the log drops old segments and a consumer that falls behind gets
OFFSET_OUT_OF_RANGE and must reset -- availability of the broker over completeness for the
consumer. PostgreSQL's default for slots is the opposite, unlimited retention, because losing a
standby's position means a full base backup. max_slot_wal_keep_size lets you pick Kafka's answer,
and wal_status = lost is PostgreSQL's OFFSET_OUT_OF_RANGE.

The design lesson is that a promise to a consumer you do not control needs a bound, and the bound
must be enforced by the party that pays for it. Which one you choose is a question about which
failure is cheaper to recover from: rebuilding one consumer, or rebuilding the cluster.`,
      challenge: code`
Watch the pin from the other side. Recreate rep_ghost, run "select pg_walfile_name(restart_lsn)"
and then "select * from pg_ls_waldir() order by name limit 3": the oldest file on disk is the one
the slot names, and it stays there through as many checkpoints as you care to run. Then work out
what monitoring query you would actually page on -- and why "pg_wal size" is the wrong one and
"pg_current_wal_lsn() - restart_lsn per slot" is the right one.`,
    },

    {
      slug: "promote-the-standby",
      tags: [
        "failover",
        "timelines",
        "split-brain",
        "hot-standby",
        "leader-election",
      ],
      title: "Promote the standby, and meet split brain",
      difficulty: "advanced",
      safetyLevel: "dangerous",
      runIn: "shell",
      estimatedMinutes: 25,
      prerequisites: ["build-a-streaming-standby", "point-in-time-recovery"],
      overview: code`
Failover in PostgreSQL is one command: pg_ctl promote. The standby stops following, finishes
replaying what it has, picks a new timeline ID, and starts accepting writes. It takes about a
second and there is no election, no quorum, and -- this is the part that matters -- nothing
whatsoever that stops the old primary from carrying on.

So you will do the failover the way a panicking operator does it, without touching the old primary
first, and then look at both servers. Each is a primary. Each has its own timeline. Each accepts a
write into the same table and stores something the other will never see -- and they do not even
collide on the primary key, because the promoted node's copy of the sequence had already jumped
ahead. That is split brain, in about four commands, and the next two lessons are the cost of
getting out of it.`,
      reading:
        'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".',
      syntaxBreakdown: code`
### In plain terms

Promotion turns the standby into the new writable primary after the old primary has failed or been deliberately stopped. PostgreSQL records that this server has started a new branch of WAL history, called a timeline, so it can reject stale WAL from the old branch. You will verify the branch and the removal of standby mode.

### What you are learning

- Promotion ends recovery and creates a new timeline rather than erasing the old history.
- The timeline ID appears in control metadata and WAL filenames, which makes branches observable.
- **pg_is_in_recovery()** is the simplest safety check before routing writes.

### Piece by piece

- **pg_ctl promote** (server-control operation)
  - What it is: Requests that a running standby finish recovery and become primary.
  - What it does here: Writes the end-of-recovery record, creates the next timeline, and removes standby.signal.
  - What it gives us: The promotion log lines and a false pg_is_in_recovery() value prove the role changed.
  - **-D** selects the standby data directory; **promote** selects the operation.
- **pg_promote()** (SQL promotion function)
  - What it is: The SQL equivalent of the pg_ctl promotion request.
  - What it does here: Offers an in-database way to trigger the same transition and returns whether the request was accepted.
  - What it gives us: Its boolean result tells the operator whether PostgreSQL accepted the request.
- **promote_trigger_file** (server setting)
  - What it is: An optional filename whose creation requests promotion.
  - What it does here: It is an alternative trigger, useful when an external failover tool cannot issue SQL.
  - What it gives us: The promotion log line and changed role confirm the trigger was observed.
- **timeline** and **.history file** (WAL history concepts)
  - What they are: A timeline is a branch identifier; its history file records the parent timeline and fork point.
  - What they do here: The new ID and history file prove that promotion created a distinct WAL branch.
  - What it gives us: The timeline number and parent/fork line explain which old history the new branch follows.
- **pg_control_checkpoint()** and **pg_walfile_name(pg_current_wal_lsn())** (inspection functions)
  - What they are: The first reads checkpoint metadata; the second formats the current WAL position as a segment filename.
  - What they do here: timeline_id and the filename's first eight hexadecimal digits should both show the promoted timeline.
  - What it gives us: The filename changes immediately; the control-file timeline catches up after CHECKPOINT.
- **standby.signal** (recovery marker)
  - What it is: The file that causes standby startup behavior.
  - What it does here: Its absence after promotion prevents the server from returning to recovery on restart.
  - What it gives us: Checking for the file after promotion verifies the next startup will remain a primary.
- **CHECKPOINT** (SQL checkpoint command)
  - What it is: Forces a checkpoint that rewrites control-file checkpoint metadata.
  - What it does here: Demonstrates why pg_control_checkpoint().timeline_id can remain one timeline behind immediately after promotion.
  - What it gives us: After it completes, timeline_id should agree with the timeline prefix in the WAL filename.
- **pg_walfile_name(pg_current_wal_lsn())** (WAL filename expression)
  - What it is: Formats the current log position as the segment file containing it.
  - What it does here: Shows the new timeline prefix immediately, before the next checkpoint updates the control file.
  - What it gives us: The first eight hexadecimal characters are direct evidence of the active WAL branch.
- **ls, cat, grep, and tail** (shell inspection commands)
  - What they are: List files, print files, filter matching lines, and keep the last matching lines.
  - What they do here: Inspect the .history file and promotion log; matching lines identify the new timeline and recovery completion.
  - What it gives us: The history contents and selected log messages make the promotion transition auditable.
`,
      caution: code`
This lesson leaves the lab with two divergent primaries on purpose, and the two lessons after it
put the lab back. Do not stop in the middle: the module ends with a single primary on 5440 again.

Note also that the promoted standby has archive_mode = off (from lesson build-a-streaming-standby),
so it does NOT write its new timeline's segments or its 00000002.history into $PGLAB/archive. That
is the whole point of turning it off: two divergent servers archiving into one directory produce an
archive from which neither history can be replayed.`,
      code: code`
export PATH=/usr/lib/postgresql/16/bin:$PATH
export PGLAB=$HOME/pglab

# 1. Before anything diverges: make the primary keep its recent WAL. pg_rewind
#    (next lesson) reads the rewound node's own WAL from the divergence point
#    forward, and a shutdown checkpoint would otherwise recycle those segments.
#    128 MB is 8 segments here. The next lesson's rewrite of
#    postgresql.auto.conf drops this setting again, and cascading-and-failback
#    resets everything either way.
psql -h /tmp -p 5440 -d lab -c "alter system set wal_keep_size = '128MB'"
psql -h /tmp -p 5440 -d lab -c 'select pg_reload_conf()'
psql -h /tmp -p 5440 -d lab -c 'show wal_keep_size'

# 2. A table whose rows say which node wrote them.
psql -h /tmp -p 5440 -d lab -c 'drop table if exists rep_split'
psql -h /tmp -p 5440 -d lab -c 'create table rep_split(id serial primary key, node text, at timestamptz default clock_timestamp())'
psql -h /tmp -p 5440 -d lab -c "insert into rep_split(node) values ('primary 5440, before promotion')"
sleep 1
psql -h /tmp -p 5441 -d lab -c 'select id, node from rep_split order by id'
psql -h /tmp -p 5441 -d lab -c 'select pg_is_in_recovery(), timeline_id from pg_control_checkpoint()'

# 3. The failover. One command, one second, no coordination with anybody.
pg_ctl -D "$PGLAB/standby" promote -w
sleep 2
grep -E 'received promote request|redo done|selected new timeline|ready to accept connections' "$PGLAB/standby.log" | tail -5
psql -h /tmp -p 5441 -d lab -c 'select pg_is_in_recovery(), timeline_id as control_file_timeline from pg_control_checkpoint()'
psql -h /tmp -p 5441 -d lab -c 'select pg_walfile_name(pg_current_wal_lsn()) as current_wal_file'
# The control file still says timeline 1: it is only rewritten by a checkpoint.
# The WAL file name changed the instant the promotion happened.
psql -h /tmp -p 5441 -d lab -c 'checkpoint'
psql -h /tmp -p 5441 -d lab -c 'select pg_is_in_recovery(), timeline_id from pg_control_checkpoint()'
ls "$PGLAB/standby/pg_wal/"*.history
cat "$PGLAB/standby/pg_wal/00000002.history"

# 4. Two primaries, same table, one sequence that has already forked.
psql -h /tmp -p 5441 -d lab -c "insert into rep_split(node) values ('NEW primary 5441, after promotion')"
psql -h /tmp -p 5440 -d lab -c "insert into rep_split(node) values ('OLD primary 5440, after promotion -- this write is doomed')"
echo '--- 5440 (old primary) ---'; psql -h /tmp -p 5440 -d lab -c 'select id, node from rep_split order by id'
echo '--- 5441 (new primary) ---'; psql -h /tmp -p 5441 -d lab -c 'select id, node from rep_split order by id'

# 5. Neither node is replicating to anything, and they are on different timelines.
psql -h /tmp -p 5440 -d lab -c 'select count(*) as standbys_connected, (select timeline_id from pg_control_checkpoint()) as timeline from pg_stat_replication'
psql -h /tmp -p 5441 -d lab -c 'select count(*) as standbys_connected, (select timeline_id from pg_control_checkpoint()) as timeline from pg_stat_replication'`,
      expectedResult: code`
The preparation is quiet: wal_keep_size becomes 128MB with a reload, no restart.

Before the promotion the row written on 5440 is on both nodes and 5441 is a standby on timeline 1:

   id | node
    1 | primary 5440, before promotion

  pg_is_in_recovery | timeline_id
  t                 |           1

The promotion takes about a second and the standby's log is four lines:

  LOG:  received promote request
  LOG:  redo done at 1/AE02EC88 system usage: CPU: user: 0.00 s, system: 0.00 s, elapsed: 3.27 s
  LOG:  selected new timeline ID: 2
  LOG:  database system is ready to accept connections

"selected new timeline ID: 2" is the entire failover. Immediately afterwards:

  pg_is_in_recovery | control_file_timeline        current_wal_file
  f                 |                     1        0000000200000001000000AE

which is worth a pause. pg_is_in_recovery() is already false and WAL is already being written with
a 00000002 prefix, but pg_control still says timeline 1, because the control file is only rewritten
by a checkpoint. Run CHECKPOINT and timeline_id becomes 2. Monitor failover with
pg_is_in_recovery(), not with pg_control_checkpoint(), or you will be a checkpoint behind reality.

The new timeline's history file records where it branched:

  $ cat $PGLAB/standby/pg_wal/00000002.history
  1	1/AE02ECB8	no recovery target specified

Now the split brain. Both INSERTs succeed and the two nodes disagree:

  --- 5440 (old primary) ---
   id | node
    1 | primary 5440, before promotion
    2 | OLD primary 5440, after promotion -- this write is doomed

  --- 5441 (new primary) ---
   id | node
    1 | primary 5440, before promotion
   34 | NEW primary 5441, after promotion

Look at the ids: they did not even collide. 5440 handed out 2 and 5441 handed out 34, because
sequence values are WAL-logged 32 at a time and the standby had replayed a record reserving up to
33. One logical table, two disjoint id ranges, no way to merge them.

Both nodes report standbys_connected = 0 -- the replication link died with the promotion -- on
timelines 1 and 2 respectively. There is no error anywhere. Neither server is unhappy. That is what
makes this failure mode dangerous: the only evidence is that two servers answer the same question
differently, and nobody is asking.`,
      systemsLens: code`
Promotion is the moment a replicated log system needs consensus and PostgreSQL does not have any.
Everything up to here was mechanically safe: one writer, one log, followers that can only replay
what the writer produced. The instant a second node decides it is the writer, safety depends
entirely on something outside the database making sure the first one has stopped.

The timeline ID is PostgreSQL's version of a term or epoch number, and it does the job it does in
Raft: it makes two divergent histories detectably different, so no server will ever replay the
wrong branch's records by accident. What it does not do -- and what a term number in Raft does --
is prevent the divergence in the first place, because nothing revokes the old primary's right to
write. In Raft a leader with a stale term cannot get a quorum to accept its entries, so it cannot
commit anything; here the old primary has a quorum of one, its own disk, and it commits happily.

That gap is why production failover always involves an external component -- Patroni with etcd,
repmgr with a witness, a cloud provider's control plane -- and why the very first thing that
component does is fence: STONITH, revoke the VIP, take the storage away, kill the process. Fencing
is not a nicety on top of failover; it is the part that makes failover correct, and everything else
is bookkeeping. Look at rep_split on the two nodes: 5440 has id 2 and 5441 has id 34,
both inserted after the split, and no algorithm can tell you which one was "right" -- both were, at
the time, on the node that thought it was in charge. The gap in the ids is its own small lesson:
sequences are WAL-logged 32 values at a time, so a promoted standby starts allocating from beyond
whatever the old primary had logged. Even the identifiers of the two histories cannot be merged,
only chosen between. Module 14's fencing-tokens lesson is the same problem solved at the
application level with a monotonic counter.`,
      challenge: code`
How long is the write window? Instrument it: promote, then immediately run a loop of inserts
against the old primary and see how many succeed before you notice. Then decide what your
application's health check would have to look at -- pg_is_in_recovery(), a VIP, a token in a table
-- to make those writes fail instead of succeed, and how it behaves during a network partition
where the old primary can still see its clients but not its standby.`,
    },

    {
      slug: "rewind-the-old-primary",
      tags: ["failover", "timelines", "recovery", "fencing", "split-brain"],
      title: "pg_rewind: rejoin a diverged primary without a new base backup",
      difficulty: "advanced",
      safetyLevel: "dangerous",
      runIn: "shell",
      estimatedMinutes: 30,
      prerequisites: ["promote-the-standby"],
      overview: code`
The old primary has a write the new primary never saw. It cannot simply start following the new
primary: their histories diverged, and physical replication has no way to un-apply a page change.
The safe, slow answer is to throw the old primary away and take a fresh base backup -- 350 MB here,
terabytes in production.

pg_rewind is the fast answer. It asks the new primary "where did our timelines diverge", then reads
the old primary's WAL from that point forward to find every block it touched afterwards, copies
just those blocks back from the new primary, and rewinds the control file to the divergence point.
What is left is a data directory that can replay the new primary's history. The doomed row from the
previous lesson disappears -- physically, silently, with no error anywhere -- which is what
"resolving split brain" always means: somebody's committed data is chosen for deletion.`,
      reading:
        'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".',
      syntaxBreakdown: code`
### In plain terms

After failover, the old primary may contain WAL that the promoted standby never received, so the two directories have diverged. **pg_rewind** finds the common history and copies only the changed blocks needed to make the old primary follow the new one. This is a repair step before rejoining it as a standby, not a way to merge two independent writers.

### What you are learning

- Rejoining a diverged server requires stopping it and finding a shared WAL history.
- Data checksums or wal_log_hints provide the block-change evidence pg_rewind needs.
- Rewind also copies configuration and removes target-only files, so settings must be restored afterward.

### Piece by piece

- **pg_rewind** (shell repair program)
  - What it is: Synchronizes a target data directory with a source after they diverged along related timelines.
  - What it does here: Rewrites the old primary so it can become a standby of the promoted server.
  - What it gives us: Its divergence LSN, copied-byte count, and Done message prove the target was repaired.
  - **--target-pgdata** names the stopped directory to repair; **--source-server** supplies a live source connection; **--source-pgdata** is the alternative for a stopped source.
  - **-R** writes standby.signal and primary_conninfo after the rewind; **--dry-run** reports work without changing files; **-P** prints progress.
- **clean shutdown** (server state requirement)
  - What it is: A shutdown that leaves the data directory consistent and records its final state.
  - What it does here: Allows pg_rewind to inspect the target; a crashed target must be started and stopped cleanly first.
  - What it gives us: pg_controldata reports Database cluster state: shut down, the prerequisite evidence.
- **data checksums** and **wal_log_hints** (block-change evidence)
  - What they are: Checksums detect page changes; wal_log_hints causes hint-bit changes to be WAL-logged.
  - What they do here: At least one must have been enabled when the cluster was initialized, otherwise pg_rewind cannot identify changed blocks.
  - What it gives us: The initialization setting explains why rewind can identify changed pages rather than copying the whole cluster.
- **postgresql.conf** and **postgresql.auto.conf** (data-directory configuration files)
  - What they are: Server settings stored inside the directory being synchronized.
  - What they do here: Source settings can overwrite target port and connection settings, so inspect and rewrite auto.conf before restarting the rejoined node.
  - What it gives us: cat output exposes the copied port and connection values that would otherwise start the node on the wrong socket.
- **standby.signal** and **primary_conninfo** (rejoin markers)
  - What they are: A marker and connection string that make the repaired directory follow its new source.
  - What they do here: -R creates them; the connection points at the promoted primary rather than the old 5440 role.
  - What it gives us: File existence plus the host=/tmp port=5441 line prove the old primary will follow the promoted source.
- **pg_controldata** (control-file shell reader)
  - What it is: Prints cluster state, timeline, and checkpoint location directly from a data directory.
  - What it does here: Confirms the target is shut down and shows the target/source histories before rewind.
  - What it gives us: Cluster state, TimeLineID, and Latest checkpoint location are the before-repair comparison.
- **--restore-target-wal / -c** (pg_rewind recovery option)
  - What it is: Allows rewind to fetch missing target WAL through restore_command instead of requiring it in pg_wal.
  - What it does here: The challenge names this fallback when wal_keep_size was too small and the required segment was recycled.
  - What it gives us: A successful fallback run proves restore_command supplied the missing history.
- **grep, tail, printf, cat, and ls** (shell file tools)
  - What they are: Filter lines, select the last match, write formatted text, print a file, and verify a file exists.
  - What they do here: Extract the newest primary_conninfo, rewrite auto.conf safely for the rejoined port, and verify standby.signal and startup log lines.
  - What it gives us: The final file and log output show exactly which source the restarted server follows.
`,
      caution: code`
pg_rewind deliberately destroys committed data on the target: everything the old primary wrote
after the divergence point is gone. In production you take a backup of the diverged node first if
the lost transactions might matter, because this is your only chance to read them.`,
      code: code`
export PATH=/usr/lib/postgresql/16/bin:$PATH
export PGLAB=$HOME/pglab

# 0. pg_rewind needs a cleanly shut down target. This is also, finally, the
#    fencing: the old primary stops writing.
psql -h /tmp -p 5440 -d lab -c 'select id, node from rep_split order by id'
pg_ctl -D "$PGLAB/primary" stop -m fast -w
pg_controldata -D "$PGLAB/primary" | grep -E 'cluster state|TimeLineID|Latest checkpoint location'
pg_controldata -D "$PGLAB/standby" | grep -E 'cluster state|TimeLineID|Latest checkpoint location'

# 1. Dry run first: it prints the divergence point without touching anything.
pg_rewind --target-pgdata="$PGLAB/primary" --source-server='host=/tmp port=5441 user=postgres dbname=postgres' --dry-run -P

# 2. For real, writing standby.signal and primary_conninfo on the way out.
pg_rewind --target-pgdata="$PGLAB/primary" --source-server='host=/tmp port=5441 user=postgres dbname=postgres' -R -P

# 3. Undo the footgun: the source's postgresql.auto.conf came along for the
#    ride and says port 5441, cluster_name lab-standby, archive_mode off. Keep
#    only the primary_conninfo line pg_rewind appended.
echo '--- postgresql.auto.conf as pg_rewind left it ---'
cat "$PGLAB/primary/postgresql.auto.conf"
# tail -1: there are two primary_conninfo lines now -- the source's, pointing at
# 5440, and the one pg_rewind just appended, pointing at 5441. The last wins.
CONNINFO=$(grep '^primary_conninfo' "$PGLAB/primary/postgresql.auto.conf" | tail -1)
printf '%s\n%s\n%s\n' '# Do not edit this file manually!' '# It will be overwritten by the ALTER SYSTEM command.' "$CONNINFO" > "$PGLAB/primary/postgresql.auto.conf"
echo '--- and as it must be ---'
cat "$PGLAB/primary/postgresql.auto.conf"
ls "$PGLAB/primary/standby.signal"

# 4. Start the old primary as a standby of the new one.
pg_ctl -D "$PGLAB/primary" -l "$PGLAB/primary.log" start -w
sleep 3
grep -E 'entering standby mode|new target timeline|consistent recovery state|started streaming' "$PGLAB/primary/log/postgresql.log" | tail -6
psql -h /tmp -p 5440 -d lab -x -c 'select pg_is_in_recovery(), (select timeline_id from pg_control_checkpoint()) as control_file_timeline, (select received_tli from pg_stat_wal_receiver) as streaming_timeline'
psql -h /tmp -p 5441 -d lab -x -c 'select application_name, state, sync_state, sent_lsn, replay_lsn from pg_stat_replication'

# 5. The doomed row is gone from the rewound node, and both nodes agree again.
echo '--- 5440 (rewound, now a standby) ---'; psql -h /tmp -p 5440 -d lab -c 'select id, node from rep_split order by id'
echo '--- 5441 (primary) ---'; psql -h /tmp -p 5441 -d lab -c 'select id, node from rep_split order by id'
psql -h /tmp -p 5441 -d lab -c "insert into rep_split(node) values ('written on 5441 while 5440 follows it')"
sleep 1
psql -h /tmp -p 5440 -d lab -c 'select id, node from rep_split order by id'`,
      expectedResult: code`
The old primary shuts down cleanly and pg_controldata shows the two histories side by side:

  target ($PGLAB/primary)   Database cluster state: shut down       TimeLineID: 1
                            Latest checkpoint location: 1/AF000028
  source ($PGLAB/standby)   Database cluster state: in production   TimeLineID: 2
                            Latest checkpoint location: 1/AE030D30

The dry run prints exactly what the real run will do, stopping just short of writing:

  pg_rewind: connected to server
  pg_rewind: servers diverged at WAL location 1/AE02ECB8 on timeline 1
  pg_rewind: rewinding from last common checkpoint at 1/AD000060 on timeline 1
  pg_rewind: reading source file list
  pg_rewind: reading target file list
  pg_rewind: reading WAL in target
  pg_rewind: need to copy 69 MB (total source directory size is 441 MB)
  71608/71608 kB (100%) copied
  pg_rewind: creating backup label and updating control file
  pg_rewind: syncing target data directory
  pg_rewind: Done!

"servers diverged at WAL location 1/AE02ECB8 on timeline 1" is the same LSN as the branch point in
00000002.history from the previous lesson; pg_rewind found it by reading the source's timeline
history, not by guessing. "need to copy 69 MB (total source directory size is 441 MB)" is the whole
value of the tool: 69 MB instead of 441 MB, and most of those 69 MB are the churn tables earlier
lessons left behind, not the one divergent row.

If you instead get "could not open file .../pg_wal/0000000100000001000000A9: No such file or
directory" followed by "could not find previous WAL record", the old primary recycled the WAL that
pg_rewind needs to read and the rewind is impossible. That is exactly what wal_keep_size in the
previous lesson prevents; pg_rewind -c (--restore-target-wal, which uses the target's
restore_command to fetch segments from the archive) is the other way out.

Then the configuration footgun, in full:

  --- postgresql.auto.conf as pg_rewind left it ---
  primary_conninfo = '... host=/tmp port=5440 ...'     <- copied from the source
  port = 5441                                          <- copied from the source
  cluster_name = 'lab-standby'                         <- copied from the source
  hot_standby = on
  archive_mode = off
  logging_collector = off
  primary_conninfo = '... host=/tmp port=5441 ...'     <- appended by pg_rewind -R

Started as it stands, the old primary would come up on port 5441 calling itself lab-standby. After
the rewrite the file holds only the primary_conninfo pointing at 5441, and standby.signal exists.

The restarted server is a standby of the node that replaced it:

  LOG:  entering standby mode
  LOG:  consistent recovery state reached at 1/AE035F88
  LOG:  started streaming WAL from primary at 1/AE000000 on timeline 2

  pg_is_in_recovery     | t
  control_file_timeline | 1     (still 1 until its first restartpoint)
  streaming_timeline    | 2

and from 5441 it looks like any other standby: application_name lab-primary, state streaming,
sent_lsn = replay_lsn = 1/AE035FC0.

The point of the lesson is one missing row:

  --- 5440 (rewound, now a standby) ---   --- 5441 (primary) ---
    1 | primary 5440, before promotion      1 | primary 5440, before promotion
   34 | NEW primary 5441, after promotion   34 | NEW primary 5441, after promotion

id 2, "OLD primary 5440, after promotion -- this write is doomed", is gone. It was committed, it
was fsynced, a client was told it had succeeded, and nothing anywhere raised an error when it was
deleted. The final INSERT on 5441 shows up on 5440 a second later as id 35: one history again.`,
      systemsLens: code`
pg_rewind is a log-diff-and-repair, and the reason it can exist is the same reason PITR can exist:
the WAL is a complete, ordered record of every block that changed, so "which blocks did I touch
after we diverged" is a question the log can answer exactly. It copies those blocks and nothing
else, which is why it takes seconds where a base backup takes hours. Merkle-tree repair in
Cassandra, rsync against a snapshot, and a Raft follower truncating its log to the leader's last
common index are all the same move: find the divergence point, and repair only the delta.

The important part is what it costs. Un-fencing a diverged node means deleting whatever it
committed alone, and there is no merge and no conflict resolution, because physical replication
does not know what a row is. Every operational consequence follows from that. It is why the old
primary must be stopped -- and stopped cleanly -- before you rewind it; why "just start it back up
and see" is the worst possible response to a failover; and why a system that lets two nodes accept
writes must either prevent divergence up front (a quorum, a lease, a fencing token) or accept that
recovering from it will delete someone's acknowledged data.

Notice the asymmetry that made this cheap: the divergence was seconds old. pg_rewind's cost is
proportional to how much the two nodes wrote after they split, not to database size, so a
split-brain caught in seconds is a seconds-long repair, and one caught in a day may be worse than a
full base backup. Detection latency is not just an availability metric; it is the thing that
decides which recovery procedure you get to use.`,
      challenge: code`
Read what pg_rewind actually did. Run it with --debug on a second divergence and count the blocks
it copied, then compare that with the size of the WAL between the divergence point and the old
primary's end of log. Then break it on purpose: crash the target with pg_ctl stop -m immediate
instead of -m fast and watch pg_rewind refuse with "target server must be shut down cleanly". Why
is that check not optional?`,
    },

    {
      slug: "cascading-and-failback",
      tags: [
        "failover",
        "streaming-replication",
        "timelines",
        "availability",
        "lab",
      ],
      title: "Cascade, fail back, and put the lab away",
      difficulty: "advanced",
      safetyLevel: "dangerous",
      runIn: "shell",
      estimatedMinutes: 35,
      prerequisites: ["rewind-the-old-primary"],
      overview: code`
Two things are left. The first is cascading: a standby is also a WAL sender, so you can chain
replicas, and 5440 -- which is currently a standby -- can feed a third node without the primary
knowing or caring. You will build one on port 5442, watch a write travel 5441 to 5440 to 5442, and
then throw it away.

The second is failback, and it is the whole reason this module can be run twice. The lab must end
exactly as module 01 built it: one primary on 5440 with its data in $PGLAB/primary, nothing on
5441, no standby directory, no replication slots, and a postgresql.auto.conf with no settings in
it. So you will reverse the roles one more time -- stop the primary on 5441 cleanly, confirm 5440
has replayed everything, promote it, and delete the rest. The only trace left is the timeline: the
lab started on timeline 1 and ends on timeline 3, one branch per promotion, which is exactly what
the .history files in pg_wal say.`,
      reading:
        'PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".',
      syntaxBreakdown: code`
### In plain terms

Replication does not have to be a star: one standby can forward WAL to another, creating a cascade. This lesson then performs a controlled failback, proving that the old primary is fully caught up before it is promoted or rejoined. The ordering prevents split brain, where two servers accept conflicting writes.

### What you are learning

- A cascading standby can receive and send WAL at the same time while still remaining in recovery.
- Failback is a sequencing problem: stop the writer, verify replay reached its final LSN, then promote or reconfigure.
- Resetting generated settings is part of cleanup because configuration files live with the data directory.

### Piece by piece

- **primary_conninfo** (standby connection setting)
  - What it is: Connection information naming the upstream PostgreSQL server.
  - What it does here: Pointing it at a standby makes that standby the middle node's WAL source.
  - What it gives us: The middle node can show a walreceiver connection upstream and a walsender connection downstream.
- **pg_is_in_recovery()** (role check)
  - What it is: Reports whether a server is still replaying WAL.
  - What it does here: It remains t on the cascading middle node even while that node serves another standby.
  - What it gives us: t plus a nonzero standbys_it_feeds count proves the middle node has both roles.
- **pg_stat_replication** (sender view)
  - What it is: Lists standbys connected to this server's walsender.
  - What it does here: Rows prove the middle node is forwarding WAL, not merely receiving it.
  - What it gives us: application_name, state, sent_lsn, and replay_lsn identify the downstream cascade and its progress.
- **pg_last_wal_replay_lsn()** (replay-position function)
  - What it is: Returns the latest WAL position applied by recovery.
  - What it does here: Compare it with the stopped primary's final LSN; equality or passage proves the old primary's changes are present before failback.
  - What it gives us: received and replayed values show whether it is safe to promote the node being failed back to.
- **pg_ctl stop -m fast** (controlled shutdown)
  - What it is: Stops a server after quickly terminating active sessions and flushing required state.
  - What it does here: Removes the old writer before promotion so no second writer can continue.
  - What it gives us: A clean shutdown state and a final WAL position establish the boundary for failback.
- **ALTER SYSTEM RESET ALL** (configuration cleanup command)
  - What it is: Removes all ALTER SYSTEM entries from postgresql.auto.conf.
  - What it does here: Clears inherited primary_conninfo and other temporary settings; inspect the file to confirm only comments remain.
  - What it gives us: An auto.conf containing only comments proves no old role or port override remains.
- **standby.signal** (role marker)
  - What it is: The file that requests recovery on the next startup.
  - What it does here: Promotion removes it, so a promoted node remains a primary after restart.
  - What it gives us: Its absence is the durable evidence that the final 5440 server will stay primary.
- **pg_basebackup** (replication backup program)
  - What it is: Copies a consistent data directory over a replication connection.
  - What it does here: Copies the middle standby into cascade, proving a standby can itself be a backup source.
  - What it gives us: Completion and the cascade startup log prove the third node joined the chain.
  - **-R, -D, -h, -p, -U, -c fast, -X stream, and -P** have the same meanings as the first lesson; here the source is port 5440 and the destination later listens on 5442.
- **cat >> ... <<CONF** (shell heredoc append)
  - What it is: Appends the lines between CONF markers to a file.
  - What it does here: Gives the cascade its own port, name, and log behavior after the base copy.
  - What it gives us: The resulting auto.conf values distinguish cascade port 5442 from its copied source.
- **pg_stat_wal_receiver** (receiver view)
  - What it is: Reports the upstream endpoint and WAL position for a standby receiver.
  - What it does here: sender_port 5440 and received_tli 2 prove the cascade follows the middle node's current timeline.
  - What it gives us: The receiver row identifies the upstream port and timeline actually in use.
- **rm -rf** (recursive shell removal)
  - What it is: Deletes a directory and its contents without prompting.
  - What it does here: Removes only the throwaway cascade and old standby directories after their servers are stopped; never aim it at an unknown path.
  - What it gives us: A later directory listing and socket check show the removed servers no longer exist or listen.
- **df -h** and **ss -ltn** (host checks)
  - What they are: Report filesystem capacity and listening TCP sockets.
  - What they do here: Confirm cleanup freed the expected directory and only port 5440 remains.
  - What it gives us: Filesystem and socket output are final operational evidence that the lab is reset.
`,
      caution: code`
This lesson is mandatory, not optional: it is what returns the lab to the layout every other module
assumes. When it finishes, check the list at the end -- 5440 in recovery = false, $PGLAB holding
only archive, backup1, primary and primary.log, nothing listening on 5441 or 5442, no replication
slots, and postgresql.auto.conf with no settings.

One thing does not come back: $PGLAB/archive is now a complete history of timeline 1 only. The
promoted standby ran with archive_mode = off (deliberately, see build-a-streaming-standby), so its
timeline-2 segments were never archived, and the only timeline-2 WAL that exists is inside
$PGLAB/primary. Point-in-time recovery from the archive can therefore still reach any moment on
timeline 1 but cannot follow the branch. In production each node archives to its own namespaced
location and you keep them all; in a lab with one archive directory, one writer is the only safe
rule.`,
      code: code`
export PATH=/usr/lib/postgresql/16/bin:$PATH
export PGLAB=$HOME/pglab

# ============ part 1: a cascading standby, 5441 -> 5440 -> 5442 ============
# Take the base backup from 5440, which is itself a standby. Nothing special is
# required for that: a standby serves replication connections like any node.
pg_basebackup -R -D "$PGLAB/cascade" -h /tmp -p 5440 -U postgres -c fast -X stream -P
cat >> "$PGLAB/cascade/postgresql.auto.conf" <<CONF
port = 5442
cluster_name = 'lab-cascade'
hot_standby = on
archive_mode = off
logging_collector = off
CONF
rm -f "$PGLAB/cascade/log/postgresql.log"
pg_ctl -D "$PGLAB/cascade" -l "$PGLAB/cascade.log" start -w
sleep 2
grep -E 'entering standby mode|consistent recovery state|started streaming' "$PGLAB/cascade.log"

# The middle node is a follower and a leader at the same time.
psql -h /tmp -p 5440 -d lab -c 'select pg_is_in_recovery() as node_5440_is_a_standby, (select count(*) from pg_stat_replication) as standbys_it_feeds'
psql -h /tmp -p 5440 -d lab -x -c 'select application_name, state, sent_lsn, replay_lsn from pg_stat_replication'
psql -h /tmp -p 5442 -d lab -x -c 'select status, sender_port, received_tli from pg_stat_wal_receiver'

# One write on the real primary reaches the end of the chain.
psql -h /tmp -p 5441 -d lab -c "insert into rep_split(node) values ('written on 5441, replicated through 5440 to 5442')"
sleep 2
psql -h /tmp -p 5442 -d lab -c 'select id, node from rep_split order by id'

# Take the cascade away again.
pg_ctl -D "$PGLAB/cascade" stop -m fast -w
rm -rf "$PGLAB/cascade" "$PGLAB/cascade.log"

# ==================== part 2: fail back to 5440 ====================
# Stop the primary FIRST. A fast shutdown writes a shutdown checkpoint and lets
# the walsender ship it, so the standby ends up holding every byte.
psql -h /tmp -p 5441 -d lab -c 'select pg_current_wal_lsn() as primary_lsn_before_shutdown'
pg_ctl -D "$PGLAB/standby" stop -m fast -w
sleep 2
psql -h /tmp -p 5440 -d lab -c 'select pg_last_wal_receive_lsn() as received, pg_last_wal_replay_lsn() as replayed'
pg_controldata -D "$PGLAB/standby" | grep -E 'cluster state|Latest checkpoint location'

# Now, and only now, promote the original node back into its original role.
pg_ctl -D "$PGLAB/primary" promote -w
sleep 2
grep -E 'received promote request|selected new timeline|ready to accept connections' "$PGLAB/primary/log/postgresql.log" | tail -4
psql -h /tmp -p 5440 -d lab -c 'select pg_is_in_recovery(), timeline_id from pg_control_checkpoint()'
psql -h /tmp -p 5440 -d lab -c "insert into rep_split(node) values ('written on 5440 after failback')"
psql -h /tmp -p 5440 -d lab -c 'select id, node from rep_split order by id'
cat "$PGLAB/primary/pg_wal/00000003.history"

# ================ part 3: put the lab back exactly as it was ================
rm -rf "$PGLAB/standby" "$PGLAB/standby.log"
psql -h /tmp -p 5440 -d lab -c 'alter system reset all'
psql -h /tmp -p 5440 -d lab -c 'select pg_reload_conf()'
psql -h /tmp -p 5440 -d lab -c 'select pg_drop_replication_slot(slot_name) from pg_replication_slots'
psql -h /tmp -p 5440 -d lab -c 'select count(*) as slots_left from pg_replication_slots'
psql -h /tmp -p 5440 -d lab -c "select pg_read_file('postgresql.auto.conf') as auto_conf"
psql -h /tmp -p 5440 -d lab -c "select name, setting from pg_settings where name in ('synchronous_standby_names','max_slot_wal_keep_size','wal_keep_size','primary_slot_name','max_standby_streaming_delay','archive_mode')"
psql -h /tmp -p 5440 -d lab -c 'select pg_is_in_recovery() as in_recovery, timeline_id, redo_lsn from pg_control_checkpoint()'
ls "$PGLAB"
ss -ltn | grep -E '5440|5441|5442'
df -h /var/lib/postgresql`,
      expectedResult: code`
PART 1, the cascade. pg_basebackup runs against 5440 -- itself a standby -- with no special flags,
copies 405 MB, and the third node starts:

  LOG:  entering standby mode
  LOG:  consistent recovery state reached at 1/AE0360F0
  LOG:  started streaming WAL from primary at 1/AE000000 on timeline 2

Note "from primary": the walreceiver's message does not care that its sender is a standby. The
middle node is both roles at once, which is the thing to see:

  node_5440_is_a_standby | standbys_it_feeds
  t                      |                 1

  application_name | lab-cascade
  state            | streaming
  sent_lsn         | 1/AE0360F0
  replay_lsn       | 1/AE0360F0

pg_is_in_recovery() is true on 5440 and pg_stat_replication has a row on it at the same time. On
5442, pg_stat_wal_receiver reports sender_port 5440 and received_tli 2 -- it is following timeline
2 through a node that is not on the end of it.

One insert on the real primary reaches the bottom of the chain within seconds:

   id | node
   36 | written on 5441, replicated through 5440 to 5442

PART 2, the failback. The primary's last LSN before shutdown is 1/AE036210; after the fast shutdown
the standby reports

  received   |  replayed
  1/AE036288 | 1/AE036288

which is past the number the primary printed, because a fast shutdown writes a shutdown checkpoint
and ships it to connected standbys before exiting. (The standby's own log records the other side of
that: "FATAL: could not send end-of-streaming message to primary: server closed the connection
unexpectedly", then a failed reconnect. Those two lines are the walreceiver noticing its source is
gone, not a problem.) received = replayed = the source's final
position is the check that means "promoting now loses nothing", and pg_controldata on the stopped
node confirms "Database cluster state: shut down".

The promotion is the same single command as the unplanned one, and produces the third timeline:

  LOG:  received promote request
  LOG:  selected new timeline ID: 3
  LOG:  database system is ready to accept connections

  pg_is_in_recovery | timeline_id
  f                 |           3

(timeline_id is 3 straight away this time: a standby that was already caught up runs its
end-of-recovery checkpoint immediately.) A write on 5440 succeeds and gets id 67, another 32-value
jump for the same reason as the first promotion. The history file now lists both branches:

  $ cat $PGLAB/primary/pg_wal/00000003.history
  1	1/AE02ECB8	no recovery target specified
  2	1/AE036288	no recovery target specified

Two lines, two promotions: timeline 2 branched from timeline 1 at the failover, timeline 3 branched
from timeline 2 at the failback. Note the second branch point is the same LSN the standby had
replayed to -- a switchover branches at the end of the history, not in the middle of it, which is
why no rewind was needed this time.

PART 3, the receipt. ALTER SYSTEM RESET ALL leaves postgresql.auto.conf with nothing but its two
comment lines, pg_drop_replication_slot returns 0 rows, slots_left is 0, and every setting this
module touched is back to its default:

  name                        | setting
  archive_mode                | on
  max_slot_wal_keep_size      | -1
  max_standby_streaming_delay | 30000
  primary_slot_name           |
  synchronous_standby_names   |
  wal_keep_size               | 0

  in_recovery | timeline_id |  redo_lsn
  f           |           3 | 1/AE0362B8

$PGLAB holds archive, backup1, primary and primary.log and nothing else; ss lists only 5440; df is
back where it was before the cascade. The lab is module 01's lab again, three timelines older.`,
      systemsLens: code`
Failback is failover run deliberately, and the difference between the two is the ordering. Here you
stopped the writer, verified the follower had caught up, and only then promoted -- three steps that
between them guarantee no divergence, which is why this lesson needed no pg_rewind afterwards. The
unplanned version two lessons ago skipped all three and cost a rewind and somebody's committed row.
Nearly every "controlled switchover" feature in every replicated system is that ordering wrapped in
a command: quiesce the leader, wait for the follower's log to match, transfer leadership, and only
then let the new leader accept writes.

Cascading is worth noticing for what it costs the primary: nothing. Replication here is pull-based
from the follower's side and stateless from the sender's, so a chain of ten replicas costs the
primary one connection, and fan-out is the follower's problem. That is why read replicas scale
reads and why they do not scale writes, and it is the same shape as a CDN or a Kafka follower-fetch
topology. It also carries the same tail-latency property: lag composes down the chain, so the
bottom of a cascade is behind by the sum of every hop.

The timeline history is the module's receipt. 00000003.history lists both branch points, so any
server or archive can tell exactly which history a WAL segment belongs to and refuse to mix them.
The lab now runs on timeline 3 and can never accidentally replay a timeline-1 or timeline-2 record
from after the branches, which is precisely the property an epoch number buys you in a consensus
protocol: not the prevention of divergence, but the permanent, unforgeable ability to detect it.`,
      challenge: code`
Do the switchover properly, with no promotion at all. Instead of stopping 5441 and promoting 5440,
try the sequence a tool like Patroni uses: pause writes, checkpoint, verify the standby's replay
LSN equals the primary's flush LSN, promote the standby, and rewind the old primary with pg_rewind
-- then measure how long the whole thing takes with a client running inserts in a loop, and count
how many of its transactions failed. That number is your real RTO for a planned switchover.`,
    },
  ],
};
