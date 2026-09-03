import { code, type Module } from "../../../src/types.ts";

export const INCIDENTS: Module = {
  category: "reliability",
  title: "Capstone incidents: read the symptom, find the cause, get the cluster back",
  lessons: [
    {
      slug: "abandoned-slot-fills-the-disk",
      tags: ["replication-slots", "wal", "capacity", "incident", "observability"],
      title: "Incident: an abandoned replication slot eats the disk",
      difficulty: "advanced",
      safetyLevel: "privileged",
      runIn: "mixed",
      estimatedMinutes: 35,
      prerequisites: [
        "wal-files-and-recycling",
        "replication-slot-retains-wal",
        "slot-lag-and-disk",
      ],
      overview: code`
03:07. The page says "db-primary root filesystem 91% and climbing, 40 minutes to full". Nobody
deployed anything. The database is serving traffic normally. This is the most common way a healthy
PostgreSQL server kills itself: a replication slot whose consumer went away, holding every WAL
segment written since it left.

You will run the incident end to end. First the three queries that identify it in under a minute.
Then a controlled reproduction: a slot nobody consumes, and enough writes to walk it through all
four values of pg_replication_slots.wal_status -- reserved, extended, unreserved, lost -- with
safe_wal_size counting down to a negative number and then the server taking the promise back in
the log. Then the recovery (drop the slot), then the revert.

The reproduction bounds the damage with max_slot_wal_keep_size instead of actually filling the
disk, because filling the disk on a PostgreSQL primary is not a drill you can take back: the WAL
writer PANICs and the server dies. The real failure text is quoted below so you know it when you
see it.`,
      syntaxBreakdown: code`
pg_replication_slots.wal_status is the whole diagnosis in one column:
  reserved   - the WAL this slot needs is within max_wal_size; normal.
  extended   - past max_wal_size, still on disk because the slot (or wal_keep_size) demands it.
  unreserved - past max_slot_wal_keep_size; the files are still there but the next checkpoint
               will remove them. safe_wal_size goes negative here.
  lost       - the files are gone. restart_lsn is null. The consumer can never resume.
safe_wal_size is bytes of WAL you may still write before this slot enters unreserved; it is null
when max_slot_wal_keep_size is -1, because with no limit there is nothing to be close to.

max_slot_wal_keep_size (default -1 = unlimited) caps what all slots together may pin. It is
SIGHUP, so a reload is enough. max_wal_size is also SIGHUP; this lesson lowers it to 64MB so that
"extended" is reachable with a small amount of WAL instead of a gigabyte.

pg_ls_waldir() lists pg_wal; pg_current_wal_lsn() - restart_lsn is the retention per slot, and it,
not the size of pg_wal, is the number to alert on. pg_drop_replication_slot(name) is the only
thing that ever removes a slot.`,
      caution: code`
This lesson writes about 120 MB of WAL into $PGLAB and the archive, and changes two settings with
ALTER SYSTEM. The last steps drop the slot, reset both settings and drop the table; do not stop
before them, or you will leave a slot behind on your own lab. Do NOT try to reproduce the real
incident by filling the disk.`,
      setup: code`
drop table if exists inc_churn;
create table inc_churn(id int primary key, pad text);
select name, setting, unit from pg_settings
where name in ('max_wal_size', 'max_slot_wal_keep_size', 'wal_keep_size', 'archive_mode')
order by name;
select count(*) as slots_before from pg_replication_slots;`,
      code: code`
-- 1. THE SYMPTOM. Three queries, in this order, every time.
select current_setting('data_directory') as datadir \gset
\setenv DATADIR :datadir
\! df -h $DATADIR | tail -2
select count(*) as wal_files, pg_size_pretty(sum(size)) as pg_wal_bytes from pg_ls_waldir();
select slot_name, slot_type, active, active_pid, wal_status,
       pg_size_pretty(pg_current_wal_lsn() - restart_lsn) as wal_retained,
       pg_size_pretty(safe_wal_size) as safe_wal_size
from pg_replication_slots order by pg_current_wal_lsn() - restart_lsn desc nulls last;

-- 2. Reproduce it in miniature. Shrinking max_wal_size to its 32MB minimum and bounding all
--    slots at 96MB means the whole life cycle fits in about 120 MB of WAL instead of the many
--    gigabytes it would take on the real defaults. Nothing about the mechanism changes.
alter system set max_wal_size = '32MB';
alter system set max_slot_wal_keep_size = '96MB';
select pg_reload_conf();
select pg_sleep(1);   -- SIGHUP is asynchronous; without this, SHOW still prints the old values
show max_wal_size;
show max_slot_wal_keep_size;
select (pg_stat_file('log/postgresql.log')).size as log_mark \gset

-- The consumer that will never come back. immediately_reserve = true makes it start holding
-- WAL now, exactly like a standby that connected once and then died.
select pg_create_physical_replication_slot('inc_ghost', true) as created;
select slot_name, active, restart_lsn, pg_walfile_name(restart_lsn) as oldest_needed_file,
       wal_status, pg_size_pretty(safe_wal_size) as safe_wal_size
from pg_replication_slots where slot_name = 'inc_ghost';

-- 3. RESERVED: normal writes, and a checkpoint that behaves normally.
insert into inc_churn select g, repeat('s', 200) from generate_series(1, 50000) g;
checkpoint;
select slot_name, pg_walfile_name(restart_lsn) as oldest_needed_file,
       pg_size_pretty(pg_current_wal_lsn() - restart_lsn) as wal_retained,
       wal_status, pg_size_pretty(safe_wal_size) as safe_wal_size
from pg_replication_slots where slot_name = 'inc_ghost';
select count(*) as wal_files, pg_size_pretty(sum(size)) as pg_wal_bytes from pg_ls_waldir();

-- 4. EXTENDED: past max_wal_size, still retained because the slot says so. Three forced
--    segment switches are a deterministic 48 MB of WAL -- the same effect as three minutes of
--    an application writing, without depending on how fast this machine is.
select pg_logical_emit_message(false, 'inc', 'churn'), pg_switch_wal();
select pg_logical_emit_message(false, 'inc', 'churn'), pg_switch_wal();
select pg_logical_emit_message(false, 'inc', 'churn'), pg_switch_wal();
checkpoint;
select slot_name, pg_walfile_name(restart_lsn) as oldest_needed_file,
       pg_size_pretty(pg_current_wal_lsn() - restart_lsn) as wal_retained,
       wal_status, pg_size_pretty(safe_wal_size) as safe_wal_size
from pg_replication_slots where slot_name = 'inc_ghost';
select count(*) as wal_files, pg_size_pretty(sum(size)) as pg_wal_bytes from pg_ls_waldir();

-- 5. UNRESERVED, then LOST. Three more segments puts the slot past its 96 MB budget. Look at
--    wal_status BEFORE the next checkpoint and after it: the files are condemned first and
--    deleted second.
select pg_logical_emit_message(false, 'inc', 'churn'), pg_switch_wal();
select pg_logical_emit_message(false, 'inc', 'churn'), pg_switch_wal();
select pg_logical_emit_message(false, 'inc', 'churn'), pg_switch_wal();
select pg_size_pretty(pg_current_wal_lsn() - restart_lsn) as wal_retained,
       wal_status, pg_size_pretty(safe_wal_size) as safe_wal_size
from pg_replication_slots where slot_name = 'inc_ghost';
checkpoint;
checkpoint;
select slot_name, active, restart_lsn, wal_status,
       pg_size_pretty(safe_wal_size) as safe_wal_size, conflicting
from pg_replication_slots where slot_name = 'inc_ghost';
select count(*) as wal_files, pg_size_pretty(sum(size)) as pg_wal_bytes from pg_ls_waldir();

-- 5b. The server said what it did. These are the lines to alert on.
select l from regexp_split_to_table(
         pg_read_file('log/postgresql.log', :log_mark, 400000), chr(10))
         with ordinality as t(l, n)
where l ~ 'replication slot|restart_lsn|max_slot_wal_keep_size'
order by n;

-- 6. RECOVERY. There is exactly one cure for a slot, and it is not restarting the server.
select pg_drop_replication_slot('inc_ghost');
select count(*) as slots_left from pg_replication_slots;

-- 7. REVERT. Put the lab back before you walk away.
alter system reset max_slot_wal_keep_size;
alter system reset max_wal_size;
select pg_reload_conf();
drop table inc_churn;
checkpoint;
checkpoint;
select count(*) as wal_files, pg_size_pretty(sum(size)) as pg_wal_bytes from pg_ls_waldir();
select pg_read_file('postgresql.auto.conf') as auto_conf;
\! df -h $DATADIR | tail -1`,
      expectedResult: code`
Step 1 on a healthy lab is the shape of the answer you want: df shows the filesystem with room to
spare, pg_ls_waldir() returns a steady-state number like 7 files / 64 MB, and pg_replication_slots
returns ZERO ROWS. Zero rows is the good outcome. In the real incident that third query is the one
that ends the investigation: one row, active = f, wal_retained in the tens of gigabytes, and you
have your cause inside a minute.

Step 2. After the reload and the one-second sleep, SHOW reports 32MB and 96MB. If you skip the
sleep, SHOW still prints the OLD values -- pg_reload_conf() only sends SIGHUP, and your backend
re-reads its configuration at the next command boundary. Then the ghost:

  created
  (inc_ghost,1/E16EC1D0)

  slot_name | active | restart_lsn | oldest_needed_file       | wal_status | safe_wal_size
  inc_ghost | f      | 1/E16EC1D0  | 0000000300000001000000E1 | reserved   | 105 MB

active = f from birth. safe_wal_size is the budget it has not spent yet.

Step 3, 50000 rows and a CHECKPOINT -- the ordinary case:

  slot_name | oldest_needed_file       | wal_retained | wal_status | safe_wal_size
  inc_ghost | 0000000300000001000000E1 | 16 MB        | reserved   | 89 MB

  wal_files | pg_wal_bytes
  7         | 64 MB

Step 4, three forced segment switches (each pg_switch_wal returns the LSN at the start of the next
segment: 1/E26E32C8, 1/E3000080, 1/E4000080) and another CHECKPOINT:

  slot_name | oldest_needed_file       | wal_retained | wal_status | safe_wal_size
  inc_ghost | 0000000300000001000000E1 | 57 MB        | extended   | 48 MB

  wal_files | pg_wal_bytes
  8         | 80 MB

Read those two blocks together. oldest_needed_file has not moved -- segment E1 is pinned, and it
will stay pinned forever. wal_retained climbs at exactly the rate you write. safe_wal_size counts
down. And pg_wal GREW from 7 files to 8 across two CHECKPOINTs, which is the part that surprises
people: a checkpoint is supposed to release segments, and this one could not release a byte older
than E1. "extended" is the server saying it is now keeping WAL past max_wal_size purely because
something asked it to.

Step 5, three more segments, before the next checkpoint:

  wal_retained | wal_status | safe_wal_size
  105 MB       | unreserved | 0 bytes

The countdown has finished. The slot is past its 96 MB budget and the files it needs are living on
borrowed time -- they still exist, so a consumer that reconnected in this window would still work.
Two CHECKPOINTs later it is over:

  slot_name | active | restart_lsn | wal_status | safe_wal_size | conflicting
  inc_ghost | f      |             | lost       |               |

  wal_files | pg_wal_bytes
  5         | 32 MB

restart_lsn is null: the server took the promise back. The slot is still a catalog row but it no
longer means anything, and any consumer that comes back must be rebuilt from a new base backup. And
pg_wal immediately collapses from 8 files to 5, which is the disk space the slot had been holding.

Step 5b prints exactly the three lines your monitoring should be watching for:

  LOG:  invalidating obsolete replication slot "inc_ghost"
  DETAIL:  The slot's restart_lsn 1/E16EC1D0 exceeds the limit by 9518640 bytes.
  HINT:  You might need to increase max_slot_wal_keep_size.

If the slot still has a walsender attached when the limit is crossed, the server kills the consumer
first. Captured on this same lab with a pg_receivewal attached to the slot and then frozen with
SIGSTOP so it could not keep up:

  LOG:  terminating process 146200 to release replication slot "inc_live"
  DETAIL:  The slot's restart_lsn 1/BC000000 exceeds the limit by 16777216 bytes.
  HINT:  You might need to increase max_slot_wal_keep_size.
  FATAL:  terminating connection due to administrator command      <- the walsender dying

and the consumer's own stderr:

  pg_receivewal: error: unexpected termination of replication stream:
    FATAL:  terminating connection due to administrator command

WHAT IT LOOKS LIKE WITH NO LIMIT SET -- the real incident, which you must not reproduce. With
max_slot_wal_keep_size = -1 (the default) there is no invalidation, no warning, and safe_wal_size
is null, because with no limit there is nothing to be close to. pg_wal grows until the filesystem
is full and the server dies on its next WAL write. These are the message formats from the
PostgreSQL 16 sources, quoted, not produced by this lesson:

  src/backend/access/transam/xlog.c, XLogWrite():
    PANIC:  could not write to log file %s at offset %u, length %zu: %m
  src/backend/storage/smgr/md.c and storage/file/fd.c:
    ERROR:  could not extend file "%s": %m
    HINT:  Check free disk space.

with %m filled in by the OS as "No space left on device". A PANIC in the WAL path takes the whole
postmaster down, and the cluster then crash-recovers into the same full disk. Recovery means
finding bytes to delete OUTSIDE pg_wal (never inside it -- deleting WAL segments by hand is how a
disk-full incident becomes a data-loss incident), starting the server, and dropping the slot.

Steps 6 and 7: pg_drop_replication_slot returns an empty result, slots_left = 0, the two ALTER
SYSTEM RESETs plus a reload put max_wal_size back to 1GB and max_slot_wal_keep_size back to -1, and
postgresql.auto.conf prints with nothing in it but its two comment lines. If it still contains a
setting, you stopped too early.`,
      systemsLens: code`
A replication slot is a lease with no expiry, granted to a consumer you do not control, paid for
by the producer's disk. That is a strictly worse deal than it looks, because the resource being
consumed is invisible: no dashboard has a "WAL pinned by slots" panel until someone adds one, and
the failure is not gradual -- the server is completely healthy at 99% full and dead at 100%.

Every log-based system faces this and has to pick a side. Kafka bounds retention by time and size
and lets a slow consumer fall off the end with OFFSET_OUT_OF_RANGE: the broker's availability wins.
PostgreSQL's default is unbounded retention: the consumer's completeness wins, because losing a
standby's position costs a full base backup. max_slot_wal_keep_size lets you buy Kafka's answer,
and wal_status = lost is literally PostgreSQL's OFFSET_OUT_OF_RANGE.

The general rule is worth stating plainly: any promise made to an absent party must have a bound,
and the bound has to be enforced by whoever pays for it. Unbounded retry queues, unbounded undo
logs, unbounded snapshot pins, unbounded S3 multipart uploads -- same shape, same 3 a.m. page. The
second rule is that the metric you alert on must be the one that moves early. pg_wal size moves
last, when it is already too late; pg_current_wal_lsn() - restart_lsn per slot moves from the
first minute the consumer is gone.`,
      challenge: code`
Write the monitoring query you would actually page on and decide its two thresholds. Something
like: select slot_name, active, pg_current_wal_lsn() - restart_lsn as retained_bytes,
coalesce(safe_wal_size, 9e18) as headroom from pg_replication_slots. Then answer the harder
question: is your max_slot_wal_keep_size larger than the longest standby outage you are willing to
recover from without a rebuild? If you cannot answer that, the limit is not a policy, it is a
guess.`,
    },

    {
      slug: "corrupt-a-page-and-detect-it",
      tags: ["checksums", "corruption", "pages-and-tuples", "incident", "backup"],
      title: "Incident: a corrupt page, and the difference between detecting and repairing it",
      difficulty: "advanced",
      safetyLevel: "dangerous",
      runIn: "mixed",
      estimatedMinutes: 40,
      prerequisites: [
        "table-is-a-file",
        "visibility-map-and-index-only-scans",
        "point-in-time-recovery",
      ],
      overview: code`
A query that worked yesterday now returns
"ERROR: invalid page in block 3 of relation base/76357/76561" and nothing else in the system looks
wrong. That message means one 8 KB block on disk no longer matches its checksum: firmware, a bad
cable, a filesystem bug, a stray write. PostgreSQL noticed only because this lab was initdb'd with
--data-checksums; without them the same page would have been handed to the executor as data.

You will cause it on purpose -- dd a block of random bytes into one block of your own table's
file while the server is down -- and then run the whole incident: detect it from SQL, confirm and
scope it with pg_checksums while the server is stopped, discover the trap that checksums do not
catch, make the table readable again with zero_damaged_pages, count exactly which rows died, and
restore them from a copy you took before the damage.

The last part is the honest part. zero_damaged_pages does not repair anything; it throws the block
away. The rows are gone, and the only reason this lesson can put them back is that you copied the
table first. In production that copy is your base backup plus WAL, and the recovery is the PITR
from module 08.`,
      syntaxBreakdown: code`
pg_relation_filepath('t') gives the path of a table's file relative to the data directory; the
ctid of a row is (block, line pointer), so (ctid::text::point)[0] is the block number and lets you
list exactly which rows live in the block you are about to destroy.

dd ... bs=8192 seek=N count=1 conv=notrunc overwrites block N in place and nothing else.
conv=notrunc is essential: without it dd truncates the rest of the file.

pg_checksums --check -D DIR verifies every block of every relation with the server STOPPED (it
refuses to run against a live cluster). It exits 1 and names file and block on failure.

zero_damaged_pages (superuser, session-level) turns the ERROR into a WARNING and hands the reader
an empty page instead. It only zeroes the copy in shared buffers -- the bad bytes stay on disk
until something rewrites the file, which is why the repair here is VACUUM FULL, which rewrites the
whole relation into a new relfilenode.

pg_surgery's heap_force_kill(relation, tid[]) removes tuples by ctid with no regard for
visibility, and heap_force_freeze() forces them visible. They are for damaged tuple headers, not
damaged pages, and they can destroy data silently: this lesson uses one only to show its NOTICE.`,
      caution: code`
This lesson deliberately corrupts a data file. Run it ONLY against $PGLAB, only against the table
it creates, and never against a file under base/ that you did not identify with
pg_relation_filepath on your own table -- writing garbage into a catalog file makes the whole
database unopenable. The server is stopped and started twice. Do not skip the restore step, or
your lab will fail pg_checksums forever.`,
      setup: code`
show data_checksums;
drop table if exists inc_pages;
drop table if exists inc_pages_backup;
create table inc_pages(id int primary key, payload text);
insert into inc_pages select g, 'row-' || g || '-' || repeat('p', 60) from generate_series(1,5000) g;
vacuum (analyze) inc_pages;`,
      code: code`
-- 1. Take the "backup" first, and find out exactly what you are about to lose.
create table inc_pages_backup as select * from inc_pages;
select count(*) as rows_now, pg_relation_size('inc_pages')/8192 as blocks from inc_pages;
select pg_relation_filepath('inc_pages') as relpath;
select min(id) as first_id, max(id) as last_id, count(*) as rows_in_block_3
from inc_pages where (ctid::text::point)[0] = 3;
checkpoint;   -- make sure block 3 is really on disk before you go behind the server's back

-- ==========================================================================
-- SHELL, as the postgres OS user. Substitute the relpath printed above.
--
--   export PATH=/usr/lib/postgresql/16/bin:$PATH PGLAB=$HOME/pglab
--   RELPATH=base/76357/76561          # <- from pg_relation_filepath, YOURS WILL DIFFER
--
--   pg_ctl -D "$PGLAB/primary" stop -m fast -w
--   dd if=/dev/urandom of="$PGLAB/primary/$RELPATH" bs=8192 seek=3 count=1 conv=notrunc
--
--   # The offline scan. It refuses to run on a live cluster, and it scans everything.
--   pg_checksums --check -D "$PGLAB/primary"; echo "exit=$?"
--
--   pg_ctl -D "$PGLAB/primary" -l "$PGLAB/primary.log" start -w
--
-- ==========================================================================

-- 2. THE SYMPTOM, from the application's point of view.
select count(*) as rows_now from inc_pages;

-- 3. THE TRAP. Ask for a row that lives in the broken block, but only for a column
--    the index already has. The heap is never touched, so nothing is detected.
explain (costs off) select id from inc_pages where id = 250;
select id from inc_pages where id = 250;
select id, payload from inc_pages where id = 250;   -- same row, now with a heap fetch

-- 4. MAKE IT READABLE. This is triage, not repair: it discards the block.
set zero_damaged_pages = on;
select count(*) as rows_readable from inc_pages;
select count(*) as rows_lost from inc_pages_backup b
  where not exists (select 1 from inc_pages p where p.id = b.id);
select min(id) as lost_from, max(id) as lost_to from inc_pages_backup b
  where not exists (select 1 from inc_pages p where p.id = b.id);

-- 5. The damage is wider than the heap. The index still has entries pointing into the
--    block you just threw away, and the visibility map still says the block is all-visible,
--    so an index-only scan happily returns rows that no longer exist.
select count(*) as phantom_index_rows from inc_pages where id between 233 and 307;

-- 6. REPAIR. VACUUM FULL rewrites the relation into a fresh file and rebuilds every index,
--    which is what actually gets the bad bytes off the disk. zero_damaged_pages must still
--    be on, because the rewrite has to read the damaged block one last time.
vacuum full inc_pages;
reset zero_damaged_pages;
select pg_relation_filepath('inc_pages') as new_relpath;
select count(*) as rows_after_rewrite from inc_pages;
select count(*) as phantom_index_rows from inc_pages where id between 233 and 307;

-- 7. RESTORE the rows from the copy taken in step 1. In production this line is
--    "restore the base backup and replay WAL to just before the corruption" -- module 08.
insert into inc_pages select * from inc_pages_backup b
  where not exists (select 1 from inc_pages p where p.id = b.id);
select count(*) as rows_restored from inc_pages;
select count(*) as still_missing from inc_pages_backup b
  where not exists (select 1 from inc_pages p where p.id = b.id);
checkpoint;

-- 8. pg_surgery, for the other kind of damage: a readable page with a broken tuple.
--    Aim it at an address that does not exist, because aiming it at one that DOES exist
--    deletes that row immediately, with no confirmation and no visibility check.
select heap_force_kill('inc_pages'::regclass, ARRAY['(9999,1)']::tid[]);
select heap_force_kill('inc_pages'::regclass, ARRAY['(3,99)']::tid[]);
select count(*) as rows_final from inc_pages;

-- ==========================================================================
-- SHELL again: prove the cluster is clean.
--
--   pg_ctl -D "$PGLAB/primary" stop -m fast -w
--   pg_checksums --check -D "$PGLAB/primary"; echo "exit=$?"
--   pg_ctl -D "$PGLAB/primary" -l "$PGLAB/primary.log" start -w
--
-- ==========================================================================
drop table inc_pages_backup;`,
      expectedResult: code`
Setup prints data_checksums = on. If it says off, stop: nothing in this lesson will be detected,
which is itself the lesson about clusters initdb'd without --data-checksums.

Three numbers below will differ on every run and that is expected: the relfilenode in the path
(76561 here, 76683 on the next run), the pair of checksum values (dd writes fresh random bytes each
time), and the total blocks scanned. Everything else -- block 3, ids 233 to 307, 75 rows lost,
4925 readable, 1 bad checksum -- is deterministic.

Step 1: 5000 rows in 67 blocks, a path like base/76357/76561, and block 3 holds ids 233 to 307 --
75 rows. Write those numbers down; they are the blast radius.

The dd is silent (1+0 records in / out, 8192 bytes copied), and the offline scan finds it
immediately:

  pg_checksums: error: checksum verification failed in file
    "/var/lib/postgresql/pglab/primary/base/76357/76561", block 3:
    calculated checksum 4629 but block contains 32E
  Checksum operation completed
  Files scanned:   5676
  Blocks scanned:  51324
  Bad checksums:  1
  Data checksum version: 1
  exit=1

Fifty thousand blocks scanned, one bad, and it names the file and the block. That exit code 1 is what a
weekly cron job would alert on.

Step 2, from SQL, the symptom the application reports:

  WARNING:  page verification failed, calculated checksum 17961 but expected 814
  ERROR:  invalid page in block 3 of relation base/76357/76561

Two lines, in that order, every time: the WARNING is the checksum comparison, the ERROR is the
buffer manager refusing to hand the page to the executor.

Step 3 is the trap:

  QUERY PLAN
  Index Only Scan using inc_pages_pkey on inc_pages
    Index Cond: (id = 250)

   id
  250

  ...then, with payload added:
  WARNING:  page verification failed, calculated checksum 17961 but expected 814
  ERROR:  invalid page in block 3 of relation base/76357/76561

Row 250 lives in the corrupt block, and the first query returned it anyway. The index-only scan
answered from the index because the visibility map said block 3 was all-visible, so the heap was
never read and the checksum was never checked. Corruption is only detected on the paths that
actually read the damaged bytes; your smoke test can pass while your data is gone.

Step 4:

  WARNING:  page verification failed, calculated checksum 17961 but expected 814
  WARNING:  invalid page in block 3 of relation base/76357/76561; zeroing out page
   rows_readable
            4925
   rows_lost
          75
   lost_from | lost_to
         233 |     307

4925 = 5000 - 75. Exactly the rows you predicted from the ctid query, and no others.

Step 5:

   phantom_index_rows
                   75

That is the quiet horror. The heap has 4925 rows, the index still has 5000 entries, the visibility
map still marks the zeroed block all-visible, and an index-only scan therefore returns 75 rows that
do not exist. select count(*) and select count(*) where id between 233 and 307 disagree with each
other, in the same table, in the same transaction.

Step 6: VACUUM FULL succeeds, pg_relation_filepath returns a NEW path (base/76357/76576 -- a new
relfilenode; the damaged file is unlinked at commit), rows_after_rewrite is 4925, and
phantom_index_rows is now 0, because the rewrite rebuilt the index from the surviving heap.

Step 7: INSERT 0 75, rows_restored = 5000, still_missing = 0.

Step 8:

  NOTICE:  skipping block 9999 for relation "inc_pages" because the block number is out of range
  NOTICE:  skipping tid (3, 99) for relation "inc_pages" because the item number is out of range
   rows_final
         5000

Both addresses are refused and the row count is untouched. That is the only safe way to meet this
tool. Point it at a tid that DOES exist and it removes that tuple immediately, with no
confirmation, no visibility check and no undo: on this lab, heap_force_kill on '(3,1)' after the
rewrite silently took count(*) from 5000 to 4999. pg_surgery exists to make an unreadable table
readable when a tuple header is damaged -- a "could not access status of transaction" error, not a
checksum error -- and every use of it is data loss you chose. It is not a repair.

Final shell block:

  Checksum operation completed
  Files scanned:   5676
  Blocks scanned:  51264
  Bad checksums:  0
  Data checksum version: 1
  exit=0

Zero bad checksums and exit 0. Note that this is only true because of the VACUUM FULL: if you stop
after zero_damaged_pages, pg_checksums still reports block 3 bad, because zeroing happened in
shared buffers and was never written back. Detection and repair are different operations, and
"the query works again" is not evidence that the disk is clean.`,
      systemsLens: code`
Checksums are an end-to-end argument. The filesystem checksums its metadata, the disk has ECC, the
controller has its own CRC -- and none of them can tell you that the block PostgreSQL is holding is
the block PostgreSQL wrote, because the failure modes that matter (a lost write, a misdirected
write, a torn write, an off-by-one in firmware) all produce a block that is internally perfect and
simply wrong. Only the layer that owns the meaning of the data can verify it, which is why ZFS,
Ceph, Kafka and PostgreSQL all ended up computing their own.

Detection is cheap and repair is not, and every storage system draws that line differently based on
what redundancy it has. ZFS and Ceph can self-heal because a second copy exists. PostgreSQL has no
second copy of a heap page, so its entire repair story is "go get the copy you made earlier":
a streaming replica, a base backup plus WAL, or nothing. That is the actual reason module 08
exists, and the reason the honest answer to "can you fix this page" is a question about your backup
policy rather than about PostgreSQL.

The index-only-scan trap generalizes past databases. Any system with a cache, a summary, or a
secondary index has states where the derived structure and the source of truth disagree, and the
cheap read path is precisely the one that will not notice. When you validate a recovery, force the
expensive path -- read the actual bytes, not the index that claims to describe them.`,
      challenge: code`
Do it again, but corrupt a block of the primary key index instead of the heap (find it with
pg_relation_filepath('inc_pages_pkey')). Which queries break, and what does
bt_index_check('inc_pages_pkey'::regclass) from amcheck say? Then work out why an index is the
much better thing to have corrupted: what is the repair, and how long does it take?`,
    },

    {
      slug: "wraparound-drill",
      tags: ["wraparound", "freezing", "autovacuum", "xid", "incident"],
      title: "Incident: transaction id wraparound, on a schedule you control",
      difficulty: "advanced",
      safetyLevel: "privileged",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 35,
      prerequisites: ["wraparound-and-freezing", "autovacuum-triggers", "read-the-server-log"],
      overview: code`
The transaction id is 32 bits. Every tuple's visibility is decided by comparing xids modulo 2^31,
so a tuple whose xmin falls more than 2 billion transactions behind the current xid would suddenly
appear to be in the future and vanish. PostgreSQL will shut down writes rather than let that
happen, and the last hour before it does is one of the worst incidents you can have: the fix is a
VACUUM that takes hours on the table that is already too big to vacuum.

You cannot burn 2 billion xids on a laptop -- at the ~70000 xids/second this lab manages, it would
take eight hours and hundreds of gigabytes of WAL. So this is an honest scale model: set
autovacuum_freeze_max_age to its minimum of 100000 on ONE table, burn 150000 real transactions in
about two seconds, and watch the real anti-wraparound machinery fire with the real log line. Every
mechanism is the production one; only the constant is shrunk.

Then, because the interesting part of a real wraparound incident is watching a vacuum you cannot
cancel, you will throttle a manual freeze with vacuum_cost_delay and read
pg_stat_progress_vacuum from a second session while it crawls.`,
      syntaxBreakdown: code`
age(relfrozenxid) is how many transactions have happened since this relation was last guaranteed
frozen; it is the metric. pg_class.relfrozenxid is per relation, pg_database.datfrozenxid is the
minimum over a database, and the cluster's oldest one is what counts.

Per-table storage parameters (ALTER TABLE ... SET) let you make one table behave as if the cluster
were near the wall:
  autovacuum_freeze_max_age    - age at which an anti-wraparound autovacuum is forced. Minimum
                                 100000. The GUC default is 200000000.
  autovacuum_freeze_min_age    - how old a tuple must be for that autovacuum to freeze it.
  autovacuum_freeze_table_age  - age at which the autovacuum becomes AGGRESSIVE, meaning it
                                 refuses to skip all-visible pages. This is what changes the log
                                 line from "automatic vacuum" to "automatic aggressive vacuum".
  log_autovacuum_min_duration  - 0 logs every autovacuum of this table, whatever the GUC says.
  autovacuum_vacuum_cost_delay / _limit - throttle, so you can watch it work.

vacuum_failsafe_age (default 1600000000) is the point at which VACUUM stops being polite: it
abandons cost delays and index cleanup to get relfrozenxid moving at any cost.

pg_stat_progress_vacuum reports one row per running vacuum: phase, heap_blks_total,
heap_blks_scanned, index_vacuum_count. It is the only way to answer "how much longer".`,
      caution: code`
This burns 150000 real transaction ids on the whole cluster (they are global, not per-table) and
writes a few tens of MB of WAL. It is harmless at this scale -- the cluster's own
autovacuum_freeze_max_age is 200000000 -- but the per-table settings must be reset at the end, or
this table will keep triggering anti-wraparound vacuums forever.`,
      setup: code`
drop table if exists inc_freeze;
create table inc_freeze(id int primary key, pad text)
  with (autovacuum_freeze_max_age = 100000,
        autovacuum_freeze_min_age = 20000,
        autovacuum_freeze_table_age = 50000,
        log_autovacuum_min_duration = 0,
        autovacuum_vacuum_cost_delay = 20,
        autovacuum_vacuum_cost_limit = 100);
insert into inc_freeze select g, 'f-' || g from generate_series(1,200000) g;
vacuum (analyze) inc_freeze;`,
      code: code`
-- Session A. 1. THE METRIC. This is the query to put on a dashboard on day one; it is
-- also the query you will wish you had had when the pager goes off.
select current_setting('autovacuum_freeze_max_age') as cluster_trigger,
       current_setting('vacuum_freeze_min_age') as freeze_min_age,
       current_setting('vacuum_failsafe_age') as failsafe_age,
       current_setting('autovacuum_naptime') as naptime;
select datname, age(datfrozenxid) as xid_age,
       round(100.0 * age(datfrozenxid) / 2147483647, 4) as pct_of_the_wall
from pg_database order by age(datfrozenxid) desc limit 5;
select c.relname, age(c.relfrozenxid) as xid_age,
       c.reloptions
from pg_class c where c.relname = 'inc_freeze';

-- Session A. 2. Burn transactions. Each loop iteration is a real transaction with a real
-- xid: COMMIT inside a DO block is allowed because the block is not inside an explicit
-- transaction. Time it -- the rate is what tells you how long you actually have.
select (pg_stat_file('log/postgresql.log')).size as log_mark \gset
\timing on
do $$ begin for i in 1..150000 loop perform txid_current(); commit; end loop; end $$;
\timing off
select c.relname, age(c.relfrozenxid) as xid_age,
       age(c.relfrozenxid) - 100000 as past_the_trigger
from pg_class c where c.relname = 'inc_freeze';

-- Session B. 3. Watch for the anti-wraparound worker. The launcher wakes every
-- autovacuum_naptime, so this can take up to a minute; run the step again if it is
-- still 0 rows.
select now()::time(0) as at,
       (select age(relfrozenxid) from pg_class where relname = 'inc_freeze') as xid_age,
       (select count(*) from pg_stat_activity
         where backend_type = 'autovacuum worker') as workers,
       (select coalesce(last_autovacuum::text, 'never') from pg_stat_user_tables
         where relname = 'inc_freeze') as last_autovacuum
\watch i=3 c=10

-- Session A. 4. It ran, and it said so. This is the log line to alert on.
select l from regexp_split_to_table(
         pg_read_file('log/postgresql.log', :log_mark, 400000), chr(10))
         with ordinality as t(l, n)
where n between (select min(n) from regexp_split_to_table(
                   pg_read_file('log/postgresql.log', :log_mark, 400000), chr(10))
                   with ordinality as t2(l2, n) where l2 like '%prevent wraparound%')
            and (select min(n) + 11 from regexp_split_to_table(
                   pg_read_file('log/postgresql.log', :log_mark, 400000), chr(10))
                   with ordinality as t3(l3, n) where l3 like '%prevent wraparound%')
order by n;
select c.relname, age(c.relfrozenxid) as xid_age_after from pg_class c
where c.relname = 'inc_freeze';

-- Session A. 5. Now watch a freeze that you cannot cancel. Throttling a manual VACUUM
-- with vacuum_cost_delay is the only honest way to see, on a 13 MB table, what a
-- 500 GB anti-wraparound vacuum looks like from the outside.
set vacuum_cost_delay = 50;
set vacuum_cost_limit = 10;
-- Session A (blocks for about 11 seconds while Session B watches):
vacuum (freeze, disable_page_skipping) inc_freeze;

-- Session B. 6. The progress view, while it runs.
select p.phase, p.heap_blks_scanned, p.heap_blks_total,
       round(100.0 * p.heap_blks_scanned / nullif(p.heap_blks_total, 0), 1) as pct,
       a.wait_event_type, a.wait_event
from pg_stat_progress_vacuum p join pg_stat_activity a using (pid)
\watch i=1 c=8

-- Session A. 7. Revert. Leave nothing behind that keeps forcing vacuums.
reset vacuum_cost_delay;
reset vacuum_cost_limit;
alter table inc_freeze reset (autovacuum_freeze_max_age, autovacuum_freeze_min_age,
                              autovacuum_freeze_table_age, log_autovacuum_min_duration,
                              autovacuum_vacuum_cost_delay, autovacuum_vacuum_cost_limit);
select relname, reloptions from pg_class where relname = 'inc_freeze';
drop table inc_freeze;`,
      expectedResult: code`
Step 1 on the lab:

  cluster_trigger | freeze_min_age | failsafe_age | naptime
  200000000       | 50000000       | 1600000000   | 1min

  datname     | xid_age | pct_of_the_wall
  lab         | 1040163 |          0.0484
  template1   | 1040163 |          0.0484
  template0   | 1040163 |          0.0484
  lab_storage | 1040163 |          0.0484
  postgres    | 1040163 |          0.0484

Every database shows the same age, which is the first thing to understand: transaction ids are
allocated from ONE cluster-wide counter, so a runaway id consumer in one database ages every other
database in the cluster, including template0. 0.05% of the way to the wall is a healthy lab. Then
inc_freeze, at xid_age 1 or 2, with the six storage parameters listed in reloptions.

Step 2 is the shock:

  Time: 2093.891 ms (00:02.094)

  relname    | xid_age | past_the_trigger
  inc_freeze |  150002 |            50002

150000 transactions in 2.1 seconds: about 72000 xids per second from ONE session doing nothing but
allocating them. At that rate 2.1 billion xids is a little over eight hours. A busy application
with short transactions is not far off that, which is why wraparound is a real production incident
and not a curiosity.

Step 3 samples every three seconds. The first several rows are the same:

  at       | xid_age | workers | last_autovacuum
  12:30:57 |  150002 |       0 | never

and then, somewhere between a few seconds and one autovacuum_naptime later, it snaps:

  at       | xid_age | workers | last_autovacuum
  12:31:12 |       1 |       0 | 2026-09-03 12:31:10.801188+00

If it is still 150002 when the \watch ends, run the step again: the launcher had not come round
yet. Note workers = 0 in every sample. The anti-wraparound vacuum on a 13 MB table finishes in
under half a second even throttled, so you will almost never catch it in the act -- which is
exactly why step 5 exists, and why in production you read the log rather than poll.

Step 4 prints the log record of the whole event:

  LOG:  automatic aggressive vacuum to prevent wraparound of table "lab_inc.public.inc_freeze": index scans: 0
        pages: 0 removed, 1082 remain, 1082 scanned (100.00% of total)
        tuples: 0 removed, 200000 remain, 0 are dead but not yet removable
        removable cutoff: 1040879, which was 0 XIDs old when operation ended
        new relfrozenxid: 1040879, which is 150002 XIDs ahead of previous value
        frozen: 1082 pages from table (100.00% of total) had 200000 tuples frozen
        index scan not needed: 0 pages from table (0.00% of total) had 0 dead item identifiers removed
        buffer usage: 2209 hits, 0 misses, 0 dirtied
        WAL usage: 2165 records, 0 full page images, 534600 bytes
        system usage: CPU: user: 0.03 s, system: 0.00 s, elapsed: 0.48 s

Read it word by word. "automatic AGGRESSIVE vacuum TO PREVENT WRAPAROUND" is two independent facts:
it was forced by age rather than by dead tuples, and it scanned 100% of the table instead of
skipping all-visible pages. "new relfrozenxid ... 150002 XIDs ahead of previous value" is the
counter being reclaimed. "200000 tuples frozen" and "2165 WAL records, 534600 bytes" are the price:
every tuple header rewritten and WAL-logged for a table nobody touched. Scale that to 500 GB and it
is hours of full-table I/O you did not schedule and cannot cancel.

Without autovacuum_freeze_table_age set low, the same trigger produces the non-aggressive variant,
"automatic vacuum to prevent wraparound ... 1 scanned (0.09% of total)", which finishes instantly
because the visibility map lets it skip everything already frozen. Both lines mean "wraparound
pressure"; only one of them means "this will take all night".

xid_age_after is back to 1.

Steps 5 and 6, the throttled freeze. Session A blocks for about 11 seconds; Session B, once per
second:

  phase         | heap_blks_scanned | heap_blks_total | pct  | wait_event_type | wait_event
  scanning heap |                 0 |            1082 |  0.0 | Timeout         | VacuumDelay
  scanning heap |                95 |            1082 |  8.8 | Timeout         | VacuumDelay
  scanning heap |               190 |            1082 | 17.6 | Timeout         | VacuumDelay
  scanning heap |               290 |            1082 | 26.8 | Timeout         | VacuumDelay
  ...
  scanning heap |               690 |            1082 | 63.8 | Timeout         | VacuumDelay

Almost exactly 100 blocks per second, because vacuum_cost_limit = 10 buys ten page hits per 50 ms
nap. That ratio is the arithmetic to do during a real incident: (heap_blks_total -
heap_blks_scanned) / rate is your ETA, and raising vacuum_cost_limit or setting vacuum_cost_delay
to 0 is the dial that changes it. wait_event = VacuumDelay is the process telling you it is
sleeping on purpose -- if you see that on a vacuum you are waiting for, you are throttling yourself.

WHAT HAPPENS IF NOBODY DOES ANY OF THIS. Three escalations, none of which this lesson triggers.
Quoted from the PostgreSQL 16 sources:

  at 40 million xids from the wall, on every new transaction (varsup.c):
    WARNING:  database "%s" must be vacuumed within %u transactions
    HINT:  To avoid a database shutdown, execute a database-wide VACUUM in that database.
           You might also need to commit or roll back old prepared transactions, or drop
           stale replication slots.

  at vacuum_failsafe_age (1.6 billion), every VACUUM abandons throttling and index cleanup
  (vacuumlazy.c):
    WARNING:  bypassing nonessential maintenance of table "%s.%s.%s" as a failsafe after %d index scans

  at 3 million xids from the wall, the database stops accepting writes entirely (varsup.c):
    ERROR:  database is not accepting commands to avoid wraparound data loss in database "%s"
    HINT:  Stop the postmaster and vacuum that database in single-user mode.
           You might also need to commit or roll back old prepared transactions, or drop
           stale replication slots.

That ERROR is a full write outage on a database that is up, healthy, and answering SELECTs. Note
what both HINTs blame: old prepared transactions and stale replication slots -- the same two things
that hold back the xmin horizon, and the second of which is the incident in
abandoned-slot-fills-the-disk.

Step 7: reloptions comes back empty and the table is dropped.`,
      systemsLens: code`
This is garbage collection with a hard deadline, and it has the two properties that make GC
dangerous in every system that has it: the work is proportional to how long you deferred it, and
the deadline is not negotiable. PostgreSQL's twist is that the resource being exhausted is a
32-bit counter -- an identifier space, not memory or disk -- so no amount of hardware helps and the
only currency is I/O you must spend before the counter laps.

The design decision behind it is worth naming: 4 bytes per tuple header field instead of 8 was a
1990s space optimization that PostgreSQL has been paying for ever since, with freezing, the
visibility map, aggressive vacuums, failsafe modes, and an entire class of production outage. 64-bit
xids are still not in a release. Identifier width is a durability decision, and choosing it too
small buys you a background process whose job is to hide the mistake -- until the day it cannot.
Anyone who has run out of 32-bit auto-increment primary keys, or Ethernet MAC space, or Kafka
partition ids, has met the same bill.

Operationally, the transferable rule is: alert on the age of the oldest thing, not on the rate of
the newest. age(datfrozenxid) is a leading indicator with hours of warning; "writes are failing" is
a trailing one with none. And the two things that most often block the horizon are not the
database's fault at all -- an application that left a transaction open, and a consumer that left a
slot behind.`,
      challenge: code`
Find out what actually stops freezing from working. Open a second session, run
BEGIN; SELECT txid_current(); and leave it, then repeat this lesson. The autovacuum will fire, but
relfrozenxid will refuse to advance past that open transaction's xid, and the log line will say so.
Now you have the real shape of the incident: the vacuum is not slow, it is forbidden, and the fix
is on the application side.`,
    },

    {
      slug: "runaway-query-and-cancel",
      tags: ["timeouts", "connections", "incident", "observability", "transactions"],
      title: "Incident: a runaway query, and the difference between cancel and terminate",
      difficulty: "intermediate",
      safetyLevel: "privileged",
      runIn: "tool",
      sessions: 3,
      estimatedMinutes: 25,
      prerequisites: ["lock-queue-and-blocking-pids", "idle-in-transaction-kills-you"],
      overview: code`
One query is pinning a CPU, the queue behind it is growing, and somebody in the incident channel
says "just kill it". There are two ways to do that and they are not interchangeable:
pg_cancel_backend stops the statement and leaves the session, pg_terminate_backend destroys the
whole connection. This lesson runs both against the same workload so you can see exactly what the
client gets, what pg_stat_activity says afterwards, and what happens to the uncommitted rows the
transaction had already written.

Then it installs the guardrail that means nobody has to make this decision at 3 a.m.:
statement_timeout, which is the same cancel, applied automatically, by the server, before anyone is
paged.`,
      syntaxBreakdown: code`
pg_cancel_backend(pid) sends SIGINT: the backend aborts the current statement at its next
interrupt check and stays connected. The client gets ERROR: canceling statement due to user
request. Inside an explicit transaction, the transaction survives in the aborted state.

pg_terminate_backend(pid) sends SIGTERM: the backend rolls back, disconnects and exits. The client
gets FATAL: terminating connection due to administrator command and its socket closes.

Both return boolean true if the signal was sent -- that is all it means; true is not "it stopped".
Both need superuser, pg_signal_backend, or ownership of the target session.

statement_timeout aborts any statement that runs too long, with
ERROR: canceling statement due to statement timeout. Set it per session, per role
(ALTER ROLE ... SET) or per database. Its two siblings are lock_timeout (waiting for a lock) and
idle_in_transaction_session_timeout (holding a transaction open while doing nothing).

pg_stat_activity.state is the evidence: active, idle, idle in transaction, and
idle in transaction (aborted) -- the last one is what a cancelled transaction becomes.`,
      setup: code`
drop table if exists inc_runaway;
create table inc_runaway(id int primary key, note text);`,
      code: code`
-- Session A. 1. A transaction that has already done real work, then a query that will not end.
begin;
insert into inc_runaway select g, 'a-' || g from generate_series(1,1000) g;
select count(*) as rows_written_but_not_committed from inc_runaway;
select pg_backend_pid() as session_a_pid;

-- Session A (blocks until Session B cancels it):
select count(*) /* inc-runaway-1 */ from generate_series(1, 2000000000) g where g % 7 = 0;

-- Session B. 2. The on-call view. query_age is how long this statement has run; xact_age is
-- how long the transaction has been open, which is the number that matters for bloat.
select pid, state, wait_event_type, wait_event,
       date_trunc('second', now() - xact_start) as xact_age,
       date_trunc('second', now() - query_start) as query_age,
       left(query, 44) as query
from pg_stat_activity
where backend_type = 'client backend' and pid <> pg_backend_pid() and state = 'active';

-- Session B. 3. Cancel it: stop the statement, keep the session.
select pid, pg_cancel_backend(pid) as signal_sent
from pg_stat_activity
where query like '%inc-runaway-1%' and pid <> pg_backend_pid();
select pg_sleep(1);
select pid, state, left(query, 44) as last_query
from pg_stat_activity
where query like '%inc-runaway-1%' and pid <> pg_backend_pid();

-- Session A. 4. What the client saw, and what is left of the transaction.
select 'is my transaction still usable?' as question;
rollback;
select count(*) as rows_after_cancel from inc_runaway;

-- Session C. 5. Round two, in a THIRD terminal, because this one is not coming back.
-- Same shape: a transaction with uncommitted work, then a runaway.
begin;
insert into inc_runaway select g, 'c-' || g from generate_series(2001,3000) g;
select pg_backend_pid() as session_c_pid;

-- Session C (blocks until Session B terminates it):
select count(*) /* inc-runaway-2 */ from generate_series(1, 2000000000) g where g % 11 = 0;

-- Session B. 6. Terminate it: destroy the connection, not just the statement.
select pid, pg_terminate_backend(pid) as signal_sent
from pg_stat_activity
where query like '%inc-runaway-2%' and pid <> pg_backend_pid();
select pg_sleep(1);
select count(*) as session_c_rows_in_pg_stat_activity
from pg_stat_activity
where query like '%inc-runaway-2%' and pid <> pg_backend_pid();

-- Session A. 7. The data outcome is identical to the cancel: nothing Session C wrote survived.
select count(*) as rows_after_terminate from inc_runaway;

-- Session A. 8. THE GUARDRAIL. Same runaway query, nobody paged.
set statement_timeout = '2s';
select count(*) /* inc-runaway-3 */ from generate_series(1, 2000000000) g where g % 13 = 0;
reset statement_timeout;
show lock_timeout;
show idle_in_transaction_session_timeout;
drop table inc_runaway;`,
      expectedResult: code`
Step 1: rows_written_but_not_committed = 1000 (visible only inside this transaction) and a pid.
The runaway then sits there; on this lab it runs for several minutes.

Step 2, from Session B:

  pid    | state  | wait_event_type | wait_event | xact_age | query_age | query
  156445 | active |                 |            | 00:00:00 | 00:00:00  | select count(*) /* inc-runaway-1 */ from gen

state = active with wait_event_type and wait_event both EMPTY is the signature of a CPU-bound
runaway: it is not blocked on anything, it is just doing pointless work. (Contrast with the lock
waits from module 06, where those two columns say Lock / transactionid.) The two ages are 00:00:00
here only because Session B ran a second after Session A; when you do this in two real terminals
they are minutes, and xact_age will be larger than query_age, because the transaction has been open
-- holding its snapshot and its 1000 uncommitted rows -- since before this statement started.

Step 3:

  pid    | signal_sent
  156445 | t

and one second later:

  pid    | state                         | last_query
  156445 | idle in transaction (aborted) | select count(*) /* inc-runaway-1 */ from gen

The backend is still there. The connection is still there. The transaction is still there -- and it
is poisoned: state is "idle in transaction (aborted)", which means it still holds its resources but
will reject every command until it ends. Note that signal_sent = t only means the signal was
delivered; it is not a promise that anything stopped.

Step 4, in Session A, the client's view:

  ERROR:  canceling statement due to user request
  ERROR:  current transaction is aborted, commands ignored until end of transaction block
   rows_after_cancel
                   0

Two errors, saying different things. The first is the cancel. The second is the price of cancelling
inside a transaction: the session survived but the transaction did not, and every subsequent
statement fails until you ROLLBACK. The 1000 inserted rows are gone -- a cancel aborts the whole
transaction, not just the statement, so partial work is never kept. (An application that catches the
cancel and retries the next statement without rolling back gets that second error forever; it is a
very common bug.)

Step 6:

  pid    | signal_sent
  156451 | t

  session_c_rows_in_pg_stat_activity
                                   0

The row is not in a different state -- it is gone. The process no longer exists. Session C sees:

  FATAL:  terminating connection due to administrator command
  server closed the connection unexpectedly
          This probably means the server terminated abnormally
          before or while processing the request.
  connection to server was lost

FATAL rather than ERROR, and the socket is closed. What happens next depends entirely on the
client: psql reading from a script or a pipe exits right there (which is why this round needs its
own terminal), while an interactive psql prints "The connection to the server was lost. Attempting
reset: Succeeded." and comes back with a NEW backend pid. A connection pool is the interesting case:
it hands the application a dead connection and the retry lands on a different session, with none of
the session state -- GUCs, temp tables, prepared statements, advisory locks -- that the old one had.

Step 7, from Session A: rows_after_terminate = 0. Identical data outcome to the cancel. Both of
Session C's 1000 rows and Session A's 1000 rows are gone, because in both cases the transaction
aborted.

Step 8, the guardrail:

  ERROR:  canceling statement due to statement timeout
   lock_timeout                        = 0
   idle_in_transaction_session_timeout = 0

Identical mechanism to step 3 -- the server cancelled its own statement -- with no human involved
and a bounded blast radius. The two zeros underneath are the two guardrails this lab does NOT set,
and they cover the failure modes statement_timeout misses: a statement waiting forever for a lock,
and a session holding a transaction open while running nothing at all.

If a cancel or terminate returns zero rows, the runaway had already finished, or your LIKE pattern
matched the killing session's own query text -- the pid <> pg_backend_pid() clause is what stops
you from terminating yourself, and the /* inc-runaway-N */ comment is what makes the query findable
at all.`,
      systemsLens: code`
Cancel versus terminate is the difference between aborting a request and closing a connection, and
every RPC system eventually grows both. The interesting part is who owns the decision. Doing it by
hand means a human, under time pressure, chooses between "stop the work" and "destroy the session",
usually without knowing what state that session was carrying. statement_timeout moves the same
decision to a policy set in advance, at the layer that can actually see how long things take.

The deeper point is that a timeout is a distributed-systems primitive, not a database setting. A
query with no timeout is an unbounded resource commitment made by whoever typed it, and unbounded
commitments are how one slow component takes down everything upstream: the query holds a
connection, the connection holds a pool slot, the pool holds a request thread, and the outage
propagates backwards through every service in the chain. That is the same failure that makes
circuit breakers and deadline propagation standard in RPC frameworks; PostgreSQL gives you
statement_timeout, lock_timeout and idle_in_transaction_session_timeout as the three deadlines it
can enforce for you, and the right place to set them is ALTER ROLE, not the incident channel.

Finally, note what did NOT differ: in both rounds the uncommitted rows vanished completely. That is
atomicity doing its job, and it is why "kill it" is a safe instruction for correctness and a
dangerous one for availability. The risk of terminate is never lost data; it is the client's
inability to cope with a connection that disappeared mid-transaction.`,
      challenge: code`
Set statement_timeout permanently for a role -- ALTER ROLE app SET statement_timeout = '30s' --
then work out which statements must be allowed to exceed it (a nightly report? CREATE INDEX
CONCURRENTLY? pg_dump?) and how they should ask for the exception. Then answer the question that
decides the value: if a query takes longer than the client's own HTTP timeout, who is still waiting
for the answer?`,
    },

    {
      slug: "postmortem-from-the-log",
      tags: ["postmortem", "logging", "recovery", "timelines", "failover"],
      title: "Postmortem: reconstruct the crash and the failover from the log alone",
      difficulty: "advanced",
      safetyLevel: "read-only",
      runIn: "tool",
      estimatedMinutes: 30,
      prerequisites: [
        "crash-and-redo",
        "timeline-history",
        "read-the-server-log",
        "cascading-and-failback",
      ],
      overview: code`
The incident is over. Somebody has to write down what happened, and all you have is what the
servers wrote down themselves: $PGLAB/primary/log/postgresql.log and the .history files in
$PGLAB/archive. No metrics, no traces, nobody's memory.

This lesson turns those two sources into a timeline of timestamp, event, LSN and timeline id --
for the crash you caused in module 07 and the promote / rewind / failback you ran in module 09.
Nothing here writes anything. The skill being taught is which twenty lines out of ten thousand are
the ones that carry state transitions, and how to read an LSN and a timeline id as the two
coordinates that place every event in the cluster's history.

It also teaches the most uncomfortable lesson in postmortem work: some of your evidence is
destroyed by the recovery itself, and you have to notice that rather than conclude nothing
happened.`,
      syntaxBreakdown: code`
pg_read_file('log/postgresql.log') reads a file relative to the data directory; superusers may
also pass an absolute path, which is how you reach $PGLAB/archive. pg_stat_file(...).size gives
its length, and pg_read_file(path, offset, length) reads a window -- important, because the log is
too big to hand to regexp_split_to_table whole on a busy server.

regexp_split_to_table(text, chr(10)) WITH ORDINALITY turns a file into numbered rows, after which
the log is just a table: filter with ~, extract with substring(x from 'pattern').

The events that mark state transitions, and the phase each belongs to:
  crash        was interrupted / was not properly shut down / redo starts at /
               invalid record length / redo done at
  standby      entering standby mode / consistent recovery state reached /
               started streaming WAL from primary at LSN on timeline N
  disconnect   replication terminated by primary server / invalid resource manager ID
  promotion    received promote request / selected new timeline ID: N /
               archive recovery complete
  open         database system is ready to accept [read-only] connections

A .history file is written once per timeline, names its parent timelines and the exact LSN of each
branch, and is the only durable record of a failover. pg_ls_dir + pg_read_file will print them.`,
      setup: code`
select current_setting('data_directory') as datadir,
       pg_size_pretty((pg_stat_file('log/postgresql.log')).size) as log_size;
select timeline_id as current_timeline, checkpoint_lsn from pg_control_checkpoint();
select pg_is_in_recovery() as still_a_standby;`,
      code: code`
-- 1. THE RECONSTRUCTION. One query, and it is the deliverable: every state transition the
--    server logged, with its LSN and the timeline it names.
with lines as (
  select n, l from regexp_split_to_table(pg_read_file('log/postgresql.log'), chr(10))
       with ordinality as t(l, n)
), events as (
  select n,
         substring(l from '^[0-9-]+ ([0-9:]+)') as at,
         substring(l from '[A-Z]+:  .*') as msg
  from lines
  where l ~ ('was interrupted|not properly shut down|entering standby mode|redo starts at'
          || '|redo done at|consistent recovery state reached|started streaming WAL'
          || '|received promote request|selected new timeline|archive recovery complete'
          || '|ready to accept|replication terminated|invalid record length'
          || '|invalid resource manager')
    and l ~ '^[0-9]{4}-'          -- a real log line, not a continuation line
    and l !~ 'statement:'         -- not the text of a logged query (this one, for instance)
)
select n, at,
       substring(msg from '[0-9A-F]+/[0-9A-F]+') as lsn,
       coalesce(substring(msg from 'timeline(?: ID)?:? ([0-9]+)'), '') as tli,
       left(msg, 74) as event
from events order by n;

-- 2. THE OTHER SOURCE. A .history file is written once, at the moment of a failover, and
--    it outlives every log rotation. Column 1 is the parent timeline, column 2 is the exact
--    LSN where the child branched off it.
select f as history_file
from pg_ls_dir(current_setting('data_directory') || '/../archive') f
where f like '%.history' order by f;
select pg_read_file(current_setting('data_directory') || '/../archive/00000003.history')
       as tli3_history;
select f as in_pg_wal from pg_ls_dir('pg_wal') f where f like '%.history' order by f;
select pg_read_file('pg_wal/00000002.history') as tli2_local,
       pg_read_file(current_setting('data_directory') || '/../archive/00000002.history')
       as tli2_archived;

-- 3. CROSS-CHECK the story against the control file and the WAL file names on disk.
select timeline_id, checkpoint_lsn, redo_lsn from pg_control_checkpoint();
select name from pg_ls_waldir() where name ~ '^[0-9A-F]{24}$' order by name limit 4;

-- 4. WHAT IS NOT THERE. Count how far back the log actually goes, and compare that with
--    when this cluster was created.
select min(substring(l from '^[0-9-]+ [0-9:]+')) as oldest_line_in_log
from regexp_split_to_table(pg_read_file('log/postgresql.log'), chr(10)) as t(l)
where l ~ '^[0-9]{4}-';
select pg_postmaster_start_time() as this_postmaster_started,
       (pg_control_init()).max_data_alignment is not null as control_file_readable;
select (pg_stat_file('pg_wal/00000002.history')).modification as timeline2_created,
       (pg_stat_file('pg_wal/00000003.history')).modification as timeline3_created;`,
      expectedResult: code`
Step 1 on this lab prints the failover, in order, with nothing else in the way:

    n | at       | lsn        | tli | event
    5 | 11:52:23 |            |     | LOG:  database system was interrupted while in recovery at log time
    7 | 11:52:23 |            |     | LOG:  entering standby mode
    9 | 11:52:23 | 1/AD000028 |     | LOG:  redo starts at 1/AD000028
   11 | 11:52:23 | 1/AE035F88 |     | LOG:  consistent recovery state reached at 1/AE035F88
   12 | 11:52:23 | 1/AE035F88 |     | LOG:  invalid record length at 1/AE035F88: expected at least 24, got 0
   13 | 11:52:23 |            |     | LOG:  database system is ready to accept read-only connections
   14 | 11:52:23 | 1/AE000000 | 2   | LOG:  started streaming WAL from primary at 1/AE000000 on timeline 2
   19 | 11:53:19 |            |     | LOG:  replication terminated by primary server
   25 | 11:53:19 | 1/AE036288 |     | LOG:  invalid resource manager ID 32 at 1/AE036288
   30 | 11:53:21 |            |     | LOG:  received promote request
   31 | 11:53:21 | 1/AE036210 |     | LOG:  redo done at 1/AE036210 system usage: CPU: user: 0.00 s,
   33 | 11:53:21 |            | 3   | LOG:  selected new timeline ID: 3
   34 | 11:53:21 |            |     | LOG:  archive recovery complete
   36 | 11:53:21 |            |     | LOG:  database system is ready to accept connections
  299 | 12:07:13 |            |     | LOG:  database system is ready to accept connections
  349 | 12:08:09 |            |     | LOG:  database system is ready to accept connections

Read as a narrative: at 11:52:23 this data directory came up as a STANDBY (line 7) even though it
is the node on port 5440 that started the course as the primary -- that is the pg_rewind from
module 09, which turned the old primary into a follower of the promoted node. It replayed from
1/AD000028, reached consistency at 1/AE035F88, opened read-only, and started streaming from the new
primary on TIMELINE 2. Fifty-six seconds later the upstream went away (line 19), replay hit the end
of the stream (line 25 -- "invalid resource manager ID" is a garbage-bytes-past-the-end message,
not corruption), and two seconds after that somebody promoted this node: timeline 3 is selected at
11:53:21 and it opens for writes. Total write outage: two seconds. Total time as a standby: 58
seconds. That is the module-09 failback, reconstructed from nothing but the log.

Your own log will show your run's timestamps and LSNs. What must be the same is the SHAPE: standby
mode -> consistent recovery state -> streaming on timeline N -> promote request -> selected new
timeline N+1 -> ready to accept connections.

Step 2, the durable record:

  history_file
  00000002.history
  00000003.history

  tli3_history
  1   1/AE02ECB8   no recovery target specified
  2   1/AE036288   no recovery target specified

Timeline 3's file names both of its ancestors: timeline 2 branched from timeline 1 at 1/AE02ECB8,
and timeline 3 branched from timeline 2 at 1/AE036288 -- which is exactly the LSN on line 25 above,
where replay stopped. Two independent sources, same number.

The last four "ready to accept connections" rows, hours later with no recovery lines before them,
are clean restarts -- on this lab, the stop/start pairs from corrupt-a-page-and-detect-it. A
restart with no "was interrupted" line above it is a graceful shutdown; that absence is a finding
in its own right.

Then the trap. The archive's 00000002.history says something different from the copy in pg_wal:

  tli2_local                              | tli2_archived
  1  1/AE02ECB8  no recovery target ...   | 1  0/A4030270  before 2026-09-03 01:39:24.451439+00

These are two DIFFERENT timeline 2s. The archived one was created by the point-in-time recovery in
module 08 (note "before <timestamp>" -- a recovery target, not a promotion). The local one was
created by the standby promotion in module 09, on a server with archive_mode = off, so it never
reached the archive. One archive directory, two histories that both claim the name 00000002, and
only the local copy agrees with the timeline 3 that actually exists. This is the exact hazard
module 09 warned about, visible as an artifact three lessons later, and it is why a real archive
belongs to exactly one lineage.

Step 3 corroborates: pg_control_checkpoint() reports timeline_id 3, and every WAL segment on disk
is named 0000000300000001000000D4, ...D5, ...D6 -- the 8-hex-digit prefix of a segment name IS the
timeline, so the file names alone tell you which branch of history you are on.

Step 4 is the uncomfortable part:

  oldest_line_in_log
  2026-09-03 11:52:23

The log begins at the moment of the rewind. Module 07's crash -- "database system was not properly
shut down; automatic recovery in progress", "redo starts at", "redo done at" -- happened hours
earlier on this same data directory and is NOT in this file. It was not rotated away: pg_rewind
does not exclude the log directory, so when it made this data directory a copy of the promoted
node, it overwrote log/postgresql.log with the other server's log. The recovery action destroyed
the evidence of the thing it was recovering from.

You can still prove that the earlier history existed, which is the point of step 4's last two
queries: the modification times of 00000002.history and 00000003.history are the timestamps of two
promotions, and the control file, the archive and the .history files all survived. When the log
cannot answer, the file system usually can.

So the postmortem you can actually defend has two sections: a minute-by-minute reconstruction of
the failover, and an explicit statement that the crash window is unrecoverable from this host
because the rewind overwrote it -- with the action item that log_directory must live outside the
data directory, or be shipped off the box, before you need it.`,
      systemsLens: code`
A postmortem is an exercise in reading a log you did not design for the question you now have, and
PostgreSQL is unusually generous here: its recovery log is a state machine transcript. Every line
above is a transition -- follower to consistent, consistent to streaming, streaming to leader --
and each carries the two coordinates that make the transitions comparable across machines: an LSN
(position in the log) and a timeline (which branch of history). That pair is the same (index, term)
that Raft writes into every entry for the same reason: without it you cannot tell a node that is
behind from a node that is on a different branch.

The .history file is the durable, cross-node version of that fact. Logs rotate, disks get
reimaged, containers vanish; the history file is small, written once, and shipped to the archive,
which makes it the artifact you actually want during an incident. The generalisable habit: when a
system changes epochs, write one immutable record that names the old epoch, the new epoch, and the
exact position of the switch -- and put it somewhere other than the thing that just failed.

The overwritten log is the real lesson though. Recovery tools are destructive by construction --
pg_rewind, restore-from-snapshot, reimage-and-rejoin all replace local state with remote state, and
local state includes your evidence. Ship logs off the host, keep them outside the directory the
recovery tool owns, and treat "the logs start exactly when the incident ended" as a finding rather
than an absence of findings.`,
      challenge: code`
Turn step 1 into something you would actually run under pressure: add pg_stat_file(...).size and
read only the last megabyte, so it works on a 4 GB log. Then extend the event list to cover the
incidents from the rest of this module -- "invalidating obsolete replication slot",
"terminating process", "to prevent wraparound", "page verification failed" -- and you have a single
query that reconstructs any of them from a log you have never seen before.`,
    },
  ],
};
