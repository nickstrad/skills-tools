import { code, type Module } from "../../../src/types.ts";
import { LOGICAL_BOOTSTRAP } from "./logical-bootstrap.ts";
import { SLOT_DELIVERY } from "./slot-delivery.ts";
import { LOGICAL_DECODING } from "./logical-decoding.ts";
import { ARCHIVE_PRUNING_REMINDER } from "./archive-reminder.ts";

export const LOGICAL: Module = {
  category: "logical-replication",
  title: "Logical decoding, CDC, and publications",
  lessons: [
    LOGICAL_DECODING,
    SLOT_DELIVERY,
    LOGICAL_BOOTSTRAP,
    {
      slug: "conflicts-stop-the-apply-worker",
      tags: ["logical-replication", "consistency", "retries", "observability"],
      title: "A conflict stops the apply worker, and nothing else notices",
      difficulty: "advanced",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 25,
      prerequisites: ["publication-and-subscription"],
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
