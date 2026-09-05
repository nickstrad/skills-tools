import { code, type Module } from "../../../src/types.ts";
import { LOGICAL_CONFLICTS } from "./logical-conflicts.ts";
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
    LOGICAL_CONFLICTS,
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
