import { code, type Module } from "../../../src/types.ts";

export const WAL: Module = {
  category: "wal",
  title: "The write-ahead log: records, durability, crash redo",
  lessons: [
    {
      slug: "every-change-is-a-wal-record",
      tags: ["wal", "replicated-log", "durability", "transactions"],
      title: "Every change is a WAL record",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 20,
      prerequisites: ["install-lab-extensions", "update-writes-a-new-tuple"],
      overview: code`
Before a data page is allowed to reach disk, the change that produced it must already be in the
write-ahead log. That single rule is what makes PostgreSQL crash-safe, and it means the WAL, not
the heap, is the real record of what happened. In this lesson you bracket a transaction with two
LSNs, decode the bytes in between with pg_walinspect, and read back the exact sequence of records
the server appended: one per tuple change, one per index change, one COMMIT at the end. Then you
find two things that surprise people: a rolled-back transaction still leaves its work in the log,
and a plain SELECT can write megabytes of WAL.`,
      syntaxBreakdown: code`
An LSN (pg_lsn) is a byte offset into the infinite log, printed as hex/hex. pg_current_wal_lsn()
is how far the log has been written, pg_current_wal_flush_lsn() how far it is fsynced, and
pg_current_wal_insert_lsn() how far it has been reserved in memory. pg_wal_lsn_diff(a, b) is a
minus b in bytes. pg_get_wal_records_info(start, end) decodes every record in a range: start_lsn,
record_length, fpi_length, resource_manager (the subsystem that will replay it: Heap, Btree,
Transaction, XLOG), record_type and a human description. pg_get_wal_stats(start, end) aggregates
the same range. pg_get_wal_block_info(start, end) lists the pages each record touches, as
(reldatabase, relfilenode, relblocknumber); pg_filenode_relation(0, relfilenode) turns that back
into a table name. All of them can only read WAL that has already been flushed.`,
      setup: code`
drop table if exists wal_orders;
create table wal_orders(id int primary key, customer text, amount numeric)
  with (autovacuum_enabled = off);
insert into wal_orders select g, 'cust-' || g, g * 1.5 from generate_series(1,100) g;
vacuum wal_orders;
drop table if exists wal_hint;
create table wal_hint(id int, v text) with (autovacuum_enabled = off);
insert into wal_hint select g, 'x' from generate_series(1,5000) g;`,
      code: code`
-- Three LSNs: reserved, written, durable. They only ever move forward.
select pg_current_wal_insert_lsn() as insert_lsn,
       pg_current_wal_lsn()        as write_lsn,
       pg_current_wal_flush_lsn()  as flush_lsn;

-- A warm-up transaction over the pages we are about to change. The first write to
-- a page after a checkpoint carries a full copy of it (lesson 2); this gets that
-- out of the way so the measured transaction shows the small "delta" records.
begin;
update wal_orders set amount = amount where id = 1;
delete from wal_orders where id = 99;
commit;

-- Bracket one transaction with two LSNs and read the bytes in between.
select pg_current_wal_lsn() as start_lsn \gset
begin;
insert into wal_orders values (1002, 'ada', 10.00);
update wal_orders set amount = 99.00 where id = 1002;
delete from wal_orders where id = 6;
commit;
select pg_current_wal_lsn() as end_lsn \gset

select pg_wal_lsn_diff(:'end_lsn', :'start_lsn') as wal_bytes_for_that_txn;

select start_lsn, record_length, fpi_length, resource_manager, record_type, description
from pg_get_wal_records_info(:'start_lsn', :'end_lsn')
order by start_lsn;

-- Which page does each record change? relfilenode maps back to a relation.
select relfilenode, pg_filenode_relation(0, relfilenode) as relation,
       relforknumber as fork, relblocknumber as blk, record_type
from pg_get_wal_block_info(:'start_lsn', :'end_lsn', false)
order by start_lsn, block_id;

-- A transaction that is rolled back still wrote to the log.
select pg_current_wal_lsn() as abort_start \gset
begin;
insert into wal_orders values (2002, 'never-committed', 1.00);
rollback;
-- An aborted transaction never fsyncs, so force its bytes out with a real commit.
begin; insert into wal_orders values (2003, 'flusher', 1.00); commit;
select pg_current_wal_lsn() as abort_end \gset

select start_lsn, record_length, resource_manager, record_type
from pg_get_wal_records_info(:'abort_start', :'abort_end')
order by start_lsn;

-- And a pure SELECT can write WAL. Checksums are on in this lab, so setting a
-- hint bit on a page is a change that must be logged like any other.
checkpoint;
select pg_current_wal_lsn() as hint_start \gset
select count(*) from wal_hint;
begin; insert into wal_hint values (0, 'flusher'); commit;
select pg_current_wal_lsn() as hint_end \gset

select pg_wal_lsn_diff(:'hint_end', :'hint_start') as bytes_written_by_a_select;
select resource_manager, record_type, count(*), sum(record_length) as total_len
from pg_get_wal_records_info(:'hint_start', :'hint_end')
group by 1, 2 order by 3 desc;`,
      expectedResult: code`
The three LSNs are close together and ordered insert_lsn >= write_lsn >= flush_lsn.

The measured transaction costs 328 bytes of WAL and decodes into exactly five records, one per
physical change plus the commit:

  start_lsn  | record_length | fpi_length | resource_manager | record_type
  0/811F0E78 |            68 |          0 | Heap             | INSERT
  0/811F0EC0 |            64 |          0 | Btree            | INSERT_LEAF
  0/811F0F00 |            79 |          0 | Heap             | HOT_UPDATE
  0/811F0F50 |            64 |          0 | Heap             | DELETE
  0/811F0F90 |            46 |          0 | Transaction      | COMMIT

Note what is and is not there. The INSERT costs a heap record AND a btree record: the index is a
separate relation with its own WAL. The UPDATE is a HOT_UPDATE, so it needed no index record at
all. The DELETE is 64 bytes because it only stamps xmax, it does not move data. The COMMIT record
is 46 bytes and carries a timestamp -- committing is appending one small record, and the whole
transaction becomes visible the instant that record is durable. Your LSNs will differ; the record
types, the order, and the magnitudes (60-90 bytes each) will not.

pg_get_wal_block_info resolves the same records to pages, one row per (record, block):

  relfilenode |    relation     | fork | blk | record_type
        26290 | wal_orders      |    0 |   0 | INSERT
        26295 | wal_orders_pkey |    0 |   1 | INSERT_LEAF
        26290 | wal_orders      |    0 |   0 | HOT_UPDATE
        26290 | wal_orders      |    0 |   0 | DELETE

The rolled-back transaction is fully present in the log, followed by a 34-byte ABORT record:

  Heap        | INSERT        <- the row nobody will ever see
  Btree       | INSERT_LEAF
  Transaction | ABORT
  Heap        | INSERT        <- the flusher transaction
  Btree       | INSERT_LEAF
  Transaction | COMMIT

(a Heap2 PRUNE may appear at the front of that list if the page needed pruning first)

Finally, the plain "select count(*) from wal_hint" writes about 182 KB of WAL:

  bytes_written_by_a_select = 182488
  XLOG        | FPI_FOR_HINT |    23 |    181679
  Heap        | INSERT       |     1 |        67
  Transaction | COMMIT       |     1 |        46

23 FPI_FOR_HINT records, one per page of the table, each a full 8 KB page image. The scan set
hint bits (this xid committed, that one aborted) so future scans do not have to consult the commit
log; with data checksums on, even that bookkeeping bit changes the page's checksum and so must be
logged in full.`,
      systemsLens: code`
This is write-ahead logging in its pure form, and the same design shows up in every durable
system: an append-only, totally ordered stream of records is the source of truth, and the "real"
data structures (heap pages, indexes, memtables, SSTables) are derived state that can be rebuilt
by replaying it. The LSN is the sequence number of that stream, so it doubles as a version stamp
for a page, a progress marker for a replica, a restore point for PITR, and a consumption cursor
for CDC. Once you have that stream, replication is not a separate feature: it is another consumer
of the same log.

Two lessons from the surprises. First, the log records physical work, not committed outcomes, so
aborts cost you real bytes and real I/O -- "the transaction failed so nothing happened" is only
true logically. Second, reads are not free: cache warming, hint bits, and background maintenance
all mutate state, which is why a read-only replica still has write amplification and why a
read-heavy workload can still saturate a disk.`,
      challenge: code`
Wrap a single-row INSERT in its own transaction and measure it, then wrap 100 of them in one
transaction and measure that. Divide by 100. Which part of the cost is per-row and which is
per-commit? Lesson 7 measures this properly, so make a prediction first.`,
    },

    {
      slug: "full-page-writes-after-checkpoint",
      tags: ["wal", "full-page-writes", "checkpoints", "write-amplification", "checksums"],
      title: "Full-page writes: why the first change after a checkpoint costs 8 KB",
      difficulty: "intermediate",
      safetyLevel: "privileged",
      runIn: "tool",
      estimatedMinutes: 20,
      prerequisites: ["every-change-is-a-wal-record", "page-header-and-line-pointers"],
      overview: code`
A WAL record normally says "at page X, offset Y, change these bytes". That is only safe if the
copy of page X on disk is a page the server actually wrote -- but an 8 KB page is many disk
sectors, and a crash mid-write can leave a torn page that is half old and half new. Redo applied
to a torn page produces garbage. PostgreSQL's answer is the full-page image: the first time a page
is modified after a checkpoint, the entire page goes into the WAL record, and redo overwrites the
page instead of patching it. In this lesson you measure the cost: the same UPDATE, run three times
in a row, costs about 6 KB then about 200 bytes then about 200 bytes.`,
      syntaxBreakdown: code`
full_page_writes (on by default) controls this behaviour; it is a SIGHUP setting, so ALTER SYSTEM
plus pg_reload_conf() changes it without a restart. CHECKPOINT forces a checkpoint immediately,
which resets "first touch since checkpoint" for every page. In pg_get_wal_records_info,
record_length is the whole record and fpi_length is how much of it is full-page images; fpi_length
is usually less than 8192 because the unused hole between pd_lower and pd_upper is not stored.
wal_compression can compress those images. A table created with fillfactor = 70 leaves room for
HOT updates so the experiment stays on one page.`,
      caution: code`
This lesson turns full_page_writes off and back on. Between those two steps the cluster is NOT
crash safe. Run the ALTER SYSTEM block to the end; if you interrupt it, run
"alter system reset full_page_writes; select pg_reload_conf(); checkpoint;" before doing
anything else, and confirm "show full_page_writes" says on.`,
      setup: code`
drop table if exists wal_fpi;
create table wal_fpi(id int primary key, payload text)
  with (autovacuum_enabled = off, fillfactor = 70);
insert into wal_fpi select g, repeat('x',20) from generate_series(1,300) g;
vacuum wal_fpi;`,
      code: code`
show full_page_writes;
select name, setting from pg_settings where name in ('wal_compression','wal_log_hints');

-- Reset every page's "already imaged since the last checkpoint" flag.
checkpoint;

-- Now update the SAME row three times and price each update separately.
select pg_current_wal_lsn() as a \gset
update wal_fpi set payload = repeat('a',20) where id = 1;
select pg_current_wal_lsn() as b \gset
update wal_fpi set payload = repeat('b',20) where id = 1;
select pg_current_wal_lsn() as c \gset
update wal_fpi set payload = repeat('c',20) where id = 1;
select pg_current_wal_lsn() as d \gset

select 'update 1 (first touch after checkpoint)' as which,
       pg_wal_lsn_diff(:'b',:'a') as wal_bytes
union all select 'update 2', pg_wal_lsn_diff(:'c',:'b')
union all select 'update 3', pg_wal_lsn_diff(:'d',:'c');

-- The difference is one field: fpi_length.
select start_lsn, record_length, fpi_length, resource_manager, record_type
from pg_get_wal_records_info(:'a', :'d')
order by start_lsn;

-- Another checkpoint puts the page back in "must be imaged" state, so an
-- identical statement costs 30x more than the one before it.
checkpoint;
select pg_current_wal_lsn() as e \gset
update wal_fpi set payload = repeat('d',20) where id = 1;
select pg_current_wal_lsn() as f \gset
select 'update 4 (first touch after another checkpoint)' as which,
       pg_wal_lsn_diff(:'f',:'e') as wal_bytes;

-- What is the image actually buying? Turn the protection off and re-measure.
-- Run this whole block; it puts the setting back at the end.
alter system set full_page_writes = off;
select pg_reload_conf();
-- The checkpointer, not your backend, applies this change (it logs an
-- XLOG/FPW_CHANGE record). CHECKPOINT wakes it up so the change is live;
-- SHOW would say "off" even before that, because SHOW reads your own copy.
checkpoint;
select pg_sleep(2);
show full_page_writes;
checkpoint;
select pg_current_wal_lsn() as g \gset
update wal_fpi set payload = repeat('e',20) where id = 1;
select pg_current_wal_lsn() as h \gset
select 'first touch after checkpoint, full_page_writes = off' as which,
       pg_wal_lsn_diff(:'h',:'g') as wal_bytes;
select start_lsn, record_length, fpi_length, resource_manager, record_type
from pg_get_wal_records_info(:'g', :'h') order by start_lsn;
alter system reset full_page_writes;
select pg_reload_conf();
checkpoint;
select pg_sleep(2);
show full_page_writes;`,
      expectedResult: code`
full_page_writes is on, wal_compression is off, wal_log_hints is off (checksums already force
hint-bit logging, so wal_log_hints is redundant here).

The three identical updates do not cost the same:

  which                                   | wal_bytes
  update 1 (first touch after checkpoint) |      5952
  update 2                                |       208
  update 3                                |       208

and the record dump shows exactly where the 5952 went:

  start_lsn  | record_length | fpi_length | resource_manager | record_type
  0/8131B3A8 |          5880 |       5784 | Heap             | HOT_UPDATE
  0/8131CAB8 |            46 |          0 | Transaction      | COMMIT
  0/8131CAE8 |            59 |          0 | Heap2            | PRUNE
  0/8131CB28 |            91 |          0 | Heap             | HOT_UPDATE
  0/8131CB88 |            46 |          0 | Transaction      | COMMIT
  0/8131CBB8 |            61 |          0 | Heap2            | PRUNE
  0/8131CBF8 |            91 |          0 | Heap             | HOT_UPDATE
  0/8131CC58 |            46 |          0 | Transaction      | COMMIT

The first HOT_UPDATE is 5880 bytes of which 5784 are the page image; the next two are 91 bytes
each. fpi_length is 5784 rather than 8192 because the page is only about 70% full and the free
hole in the middle is not stored.

Checkpointing again re-arms the page: update 4, byte-for-byte the same statement, costs about
6000 bytes again (6048 and 6072 in two runs).

With full_page_writes = off, the total is still about 6072 bytes -- but for a completely
different reason, and the record dump is the point of the whole exercise:

  start_lsn  | record_length | fpi_length | resource_manager | record_type
  0/8870FFA0 |          5837 |       5788 | XLOG             | FPI_FOR_HINT
  0/88711688 |            61 |          0 | Heap2            | PRUNE
  0/887116C8 |            91 |          0 | Heap             | HOT_UPDATE
  0/88711728 |            46 |          0 | Transaction      | COMMIT

The HOT_UPDATE has collapsed from 5880 bytes to 91, with fpi_length 0: exactly the delta record
updates 2 and 3 produced. full_page_writes did what it says. The 5788-byte image that remains
belongs to an FPI_FOR_HINT on the index page the update probed -- a hint bit, and data checksums
force a full image for a hint-bit change regardless of full_page_writes, because the checksum
covers the whole page either way. Two independent reasons to copy a page, one setting each, and
turning off the one you can turn off buys you nothing while the other is in play. (If you also
disabled checksums, this update would cost about 250 bytes -- and the cluster would be one
badly-timed power loss away from silently corrupt pages, since redo would patch bytes into a page
that may be half-written.)

The block ends with "show full_page_writes" printing "on" again; if it does not, fix it before
continuing.`,
      systemsLens: code`
This is the classic torn-write problem, and every system that updates blocks in place has to solve
it: InnoDB has the doublewrite buffer, SQLite has the rollback journal, filesystems have journals.
The choice is where to pay: an extra full copy in the log (PostgreSQL), an extra copy in a side
file (InnoDB), or never updating in place at all (log-structured storage, which pays in compaction
instead). "Atomic" only means atomic at some layer -- a 4 KB sector, or a 512 B sector -- and
everything above that layer has to build its own atomicity on top.

Operationally this is why WAL volume is bursty rather than proportional to the workload: WAL
generation spikes right after every checkpoint and decays until the next one. Checkpointing more
often gives you faster recovery and more WAL; checkpointing less often gives you less WAL and a
longer outage after a crash. That is a straight availability-versus-cost dial, and it is the same
dial as snapshot frequency in a Raft log or any state-machine replication system.`,
      challenge: code`
Turn wal_compression on (it is also SIGHUP: alter system set wal_compression = 'pglz';
select pg_reload_conf();) and re-run the checkpoint-then-update measurement. How much of the 5784
bytes survives compression on a page of repeated 20-character strings? Reset it afterwards.`,
    },

    {
      slug: "commit-means-fsync",
      tags: ["wal", "fsync", "durability", "capacity"],
      title: "Commit means fsync: the durability latency floor",
      difficulty: "intermediate",
      safetyLevel: "privileged",
      runIn: "shell",
      estimatedMinutes: 25,
      prerequisites: ["every-change-is-a-wal-record", "build-lab-cluster"],
      overview: code`
A COMMIT record is 46 bytes, so why does a commit take milliseconds? Because returning from COMMIT
promises the record survives a power cut, and that promise costs one fsync of the WAL file. In
this lesson you measure the disk's fsync ceiling with pg_test_fsync, then run pgbench with
synchronous_commit on and off and watch throughput move by an order of magnitude, then run eight
clients with synchronous_commit still on and see the server beat the single-client rate by
amortising many commits into one fsync. Three numbers, one story: durability is a latency floor,
and batching is the only way around it that does not lose data.`,
      syntaxBreakdown: code`
pg_test_fsync measures the raw device: ops/sec and usecs/op for each wal_sync_method, with no
PostgreSQL involved. pgbench -i -s 1 loads a 100k-row TPC-B-like schema; pgbench -c N -j M -T S
-N -M prepared runs it for S seconds with N clients (-N skips the contended branches update and
-M prepared removes parse overhead, so the measurement is dominated by commit cost).
synchronous_commit is USERSET, so PGOPTIONS="-c synchronous_commit=off" changes it per connection
with no server change; off means the commit record is written but not waited on, so a crash can
lose a bounded window of recent commits (but can never corrupt anything). pg_stat_wal counts
wal_write (write calls) and wal_sync (fsync calls) cluster-wide, so the delta across a run tells
you how many commits shared an fsync.`,
      caution: code`
Run this as the postgres OS user. It creates its own database wal_bench and drops it at the end;
it never changes a server setting. Absolute tps numbers depend entirely on the storage under
$PGLAB -- on a laptop SSD, a cloud block volume, and a container overlay filesystem you will get
three completely different sets of numbers. The RATIOS are the result.`,
      code: code`
# Run as the postgres OS user, with the lab on PATH.
export PATH=/usr/lib/postgresql/16/bin:$PATH
export PGLAB=$HOME/pglab PGHOST=/tmp PGPORT=5440 PGUSER=postgres

# 1. What can the disk actually do? No database involved.
cd "$PGLAB/primary" && pg_test_fsync -s 2 | sed -n '1,10p'

# 2. A workload to measure. This is its own database so nothing else is touched.
createdb wal_bench
pgbench -i -s 1 wal_bench

sync_counter() { psql -X -Atc "select wal_sync from pg_stat_wal" wal_bench; }

# 3. One client, durable commits: every commit waits for an fsync.
echo "wal_sync before: $(sync_counter)"
pgbench -c 1 -T 5 -N -M prepared wal_bench | grep -E '^(latency|tps)'
echo "wal_sync after:  $(sync_counter)"

# 4. Same workload, same client count, commits not waited on.
echo "wal_sync before: $(sync_counter)"
PGOPTIONS="-c synchronous_commit=off" pgbench -c 1 -T 5 -N -M prepared wal_bench | grep -E '^(latency|tps)'
echo "wal_sync after:  $(sync_counter)"

# 5. Durable commits again, but eight clients. Watch commits per fsync.
echo "wal_sync before: $(sync_counter)"
pgbench -c 8 -j 2 -T 5 -N -M prepared wal_bench | grep -E '^(latency|tps)'
echo "wal_sync after:  $(sync_counter)"

# 6. Clean up.
dropdb wal_bench`,
      expectedResult: code`
On this lab (a container on shared storage) pg_test_fsync reported:

        open_datasync                       638.435 ops/sec    1566 usecs/op
        fdatasync                           644.976 ops/sec    1550 usecs/op
        fsync                               171.354 ops/sec    5836 usecs/op
        open_sync                            82.197 ops/sec   12166 usecs/op

The configured wal_sync_method is fdatasync, so about 645 durable 8 KB writes per second, about
1.55 ms each. That is the physical ceiling for "one commit, one fsync". (pgbench -i then prints a
few NOTICEs about pgbench_* tables that do not exist yet; that is normal on a fresh database.)
The three runs line up like this:

  run                        tps      avg latency   fsyncs during the run   commits per fsync
  1 client,  sync on         313.7    3.188 ms      11196-9630  = 1566      ~1.0
  1 client,  sync off       1094.8    0.913 ms      11222-11196 =   26      ~210
  8 clients, sync on        1557.0    5.138 ms      13890-11222 = 2668      ~2.9

Read the rows against each other:

- Row 1 is the fsync ceiling made visible. The 1566 fsyncs match the 1568 transactions the run
  processed: one commit, one fsync. tps lands at about half the raw fdatasync rate because each
  transaction also has to do its query work, and the 3.188 ms latency is the 1.55 ms flush plus
  that work. The database is not slow; the disk is.
- Row 2 removes the wait, not the work. The same WAL bytes are written, but nobody blocks on the
  flush: 5474 transactions cost 26 fsyncs, throughput goes up 3.5x and latency drops 3.5x. The
  price is a window of recent commits (roughly 3 * wal_writer_delay, 600 ms here) that a crash
  silently loses. Nothing is corrupted -- redo still stops at the last durable record -- you just
  lose transactions the client was already told had succeeded.
- Row 3 keeps full durability and beats row 2 anyway, by making concurrent commits share flushes:
  7785 transactions, 2668 fsyncs, about 3 commits per fsync. Note that 1557 commits per second is
  more than twice the 645 fsyncs per second the device can do -- durable throughput above the
  device's fsync rate is only possible because commits are batched. Per-commit latency got worse
  (5.138 ms) while aggregate throughput got 5x better.

Absolute numbers move a lot: across a single session on this lab, pg_test_fsync reported anywhere
from 207 to 920 fdatasync ops/sec and row 1 ranged from 121 to 482 tps. What should hold on any
storage: row 1's fsync count equals its transaction count and its tps is within a small factor of
the measured fdatasync rate, row 2 is several times faster with almost no fsyncs, and row 3's
fsync count is far smaller than its transaction count.`,
      systemsLens: code`
Group commit is the general answer to "durability is a per-operation latency floor": if the
expensive step is a fixed-cost flush, batch independent operations into it, trading a little
latency for a lot of throughput. Kafka's linger.ms and acks settings, a Raft leader batching
entries before an fsync, and a write-behind cache flushing every N ms are the same mechanism with
different names. Note the shape of the trade: latency per request gets slightly worse, throughput
gets much better, and the batch size is self-tuning because batches grow exactly when the system
is busy.

synchronous_commit = off is the other lever, and it is worth being precise about what it costs.
It does not weaken atomicity, consistency, or isolation, and it cannot corrupt anything -- it
weakens the D, and only for a bounded recent window. That makes it a legitimate choice for data
you can regenerate (analytics events, caches, bulk loads you would restart anyway) and a bad one
for anything a user was told succeeded. The same question -- "how much recently acknowledged work
may I lose?" -- is what acks=1 versus acks=all, or a quorum write versus a local write, is really
asking, and module 09 turns this same dial across the network with synchronous_standby_names.`,
      challenge: code`
Add commit_delay to the picture: alter system set commit_delay = 2000 (microseconds) and
commit_siblings = 2, reload, and rerun the 8-client test. Does forcing a small artificial wait
before flushing raise commits-per-fsync enough to pay for itself on this disk? Reset both
afterwards.`,
    },

    {
      slug: "wal-files-and-recycling",
      tags: ["wal", "backup", "durability", "capacity"],
      title: "Segments, recycling, and the archive",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "mixed",
      estimatedMinutes: 15,
      prerequisites: ["every-change-is-a-wal-record"],
      overview: code`
The infinite log lives in finite 16 MB files. In this lesson you look at pg_wal as a directory:
which file the current LSN is in, how the file name is derived from the LSN, how many files exist
compared to max_wal_size, and why files with names in the FUTURE are already sitting there. Then
you force a segment switch and watch the archiver copy the finished segment off the data
directory, which is the moment WAL stops being a crash-recovery detail and becomes a backup.`,
      syntaxBreakdown: code`
A WAL segment is wal_segment_size bytes (16 MB) and is named
TIMELINE(8 hex) + LSN-high(8 hex) + LSN-segment(8 hex). pg_walfile_name(lsn) gives the segment
containing an LSN and pg_walfile_name_offset(lsn) also gives the byte offset inside it; note that
for an LSN exactly on a segment boundary these return the PREVIOUS segment, because the usual
question is "which is the last segment I need". pg_switch_wal() finishes the current segment early
and returns the LSN where it stopped. pg_ls_waldir() lists pg_wal from SQL. max_wal_size is a soft
target that drives how often checkpoints happen; min_wal_size is how much space is kept
preallocated. pg_stat_archiver tracks archive_command's progress.`,
      setup: code`
drop table if exists wal_orders;
create table wal_orders(id int primary key, customer text, amount numeric)
  with (autovacuum_enabled = off);
insert into wal_orders select g, 'cust-' || g, g * 1.5 from generate_series(1,100) g;`,
      code: code`
select name, setting, unit from pg_settings
where name in ('wal_segment_size','min_wal_size','max_wal_size','wal_keep_size',
               'archive_mode','wal_level','wal_sync_method')
order by name;

-- The LSN is an offset; the file name is that offset, chopped up.
select pg_current_wal_lsn() as lsn,
       pg_walfile_name(pg_current_wal_lsn()) as segment,
       pg_walfile_name_offset(pg_current_wal_lsn()) as segment_and_offset;

-- pg_wal as a directory: how many files, how much space.
select count(*) as segments, pg_size_pretty(sum(size)) as bytes_in_pg_wal
from pg_ls_waldir();

-- Files whose names sort AFTER the current segment have not been written yet:
-- they are old segments renamed for future use.
select pg_walfile_name(pg_current_wal_lsn()) as current_segment,
       count(*) filter (where name > pg_walfile_name(pg_current_wal_lsn())) as future_recycled,
       count(*) filter (where name <= pg_walfile_name(pg_current_wal_lsn())) as already_written
from pg_ls_waldir();

\! ls -1 $PGLAB/primary/pg_wal | head -5
\! ls -1 $PGLAB/archive | wc -l

-- Force the current segment to end. Everything up to here is now archivable.
select pg_switch_wal() as switched_at;
select pg_walfile_name(pg_current_wal_lsn()) as name_of_lsn_after_switch;
-- (that is the segment we just finished: an LSN on a boundary names the previous file)

-- Write one row so the new segment is genuinely in use, then look again.
insert into wal_orders values (3001, 'after-switch', 1.00);
select pg_walfile_name(pg_current_wal_lsn()) as now_really_the_new_segment;

-- The archiver runs in the background; give it a moment and watch it catch up.
select last_archived_wal, last_archived_time, archived_count, failed_count
from pg_stat_archiver \watch i=2 c=2

\! ls -1 $PGLAB/archive | tail -3`,
      expectedResult: code`
wal_segment_size is 16777216 B, min_wal_size 80 MB, max_wal_size 1024 MB, wal_keep_size 0,
archive_mode on, wal_level logical, wal_sync_method fdatasync.

The LSN and the file name are the same number. With lsn = 0/88785E58 the segment is
000000010000000000000088 and the offset pair is (000000010000000000000088, 7888472): timeline 1,
high half 00000000, segment 0x88 = the 137th 16 MB chunk since the cluster was created, and
7888472 = 0x785E58 bytes into it.

pg_wal holds 19 segments = 304 MB, under max_wal_size. Of those, 18 sort AFTER the current
segment and only 1 (the current one) does not:

  current_segment          | future_recycled | already_written
  000000010000000000000088 |              18 |               1

PostgreSQL does not delete a finished segment, it renames it to the next name it will need and
keeps the 16 MB allocated. That is why "ls -l" on pg_wal shows files with old modification times
and future names, and why pg_wal does not shrink back to nothing when the system goes idle.

pg_switch_wal() returns something like 0/88787CE0. Right after the switch,
pg_walfile_name(pg_current_wal_lsn()) still prints 000000010000000000000088 -- the boundary rule
from the syntax notes -- and only after the INSERT does it move to 000000010000000000000089.

The two \watch iterations catch the archiver in the act. Two seconds apart:

  000000010000000000000087 | 2026-09-03 01:06:23 | archived_count 5 | failed_count 0
  000000010000000000000088 | 2026-09-03 01:23:33 | archived_count 6 | failed_count 0

last_archived_wal advances to the segment pg_switch_wal() just sealed, archived_count goes up by
one, failed_count stays 0, and the file appears in $PGLAB/archive (135 files at this point, since
nothing in this lab ever deletes them -- exactly the disk-space bomb module 15 lets you set off).
archived_count is small because pg_stat_archiver's counters reset when the cluster restarted in
the crash lesson; the file count in the directory is the cumulative number.`,
      systemsLens: code`
Two ideas worth carrying out of this directory listing. First, preallocation and recycling: the
cost of a WAL write should not include allocating a file or extending it, so the system keeps a
pool of correctly-sized files and renames them in a circle. Any latency-sensitive append-only
system ends up doing this (Kafka preallocates segments, etcd preallocates WAL files), because
filesystem metadata operations are the unpredictable part of a write.

Second, the archive is where the log stops being a crash-recovery mechanism and becomes a
durability boundary you can reason about. Local WAL survives a process crash; archived WAL
survives the machine. Everything downstream -- point-in-time recovery, rebuilding a replica,
restoring after a bad migration -- depends on segments being sealed and shipped, so archiver lag
is a real availability metric, and an archive_command that fails silently is one of the classic
ways to discover you have no backups at the worst possible moment.`,
      challenge: code`
Work out how much disk pg_wal can consume in the worst case: it is not max_wal_size. Look at
wal_keep_size, at any rows in pg_replication_slots (restart_lsn pins everything after it), and at
what happens if archive_command starts failing. Which of the three has no upper bound?`,
    },

    {
      slug: "crash-and-redo",
      tags: ["wal", "recovery", "durability", "transactions"],
      title: "Kill the server: redo, and what survives a crash",
      difficulty: "advanced",
      safetyLevel: "dangerous",
      runIn: "mixed",
      sessions: 2,
      estimatedMinutes: 25,
      prerequisites: ["every-change-is-a-wal-record", "commit-visibility-and-clog"],
      overview: code`
Now cash the promise. You commit rows, leave a second transaction uncommitted, and then kill the
server with SIGQUIT -- no shutdown checkpoint, dirty pages still in shared buffers, WAL flushed
only as far as the last commit. On restart the server notices it was not shut down cleanly, finds
the last checkpoint's redo point in pg_control, and replays every record from there. Committed
rows come back. The uncommitted row also comes back physically -- its INSERT record was in the WAL
and redo does not care about commit status -- but it is invisible forever, because no COMMIT
record for its xid was ever replayed. That distinction is the whole of ARIES-style recovery in one
experiment.`,
      syntaxBreakdown: code`
pg_ctl stop -m immediate sends SIGQUIT: backends are killed, no checkpoint is written, and the
cluster is left in state "in production" in pg_control. pg_controldata prints pg_control:
"Database cluster state" tells you whether the last shutdown was clean, and
"Latest checkpoint's REDO location" is where replay will start. pg_control_checkpoint() is the
same information from SQL. In the server log, recovery announces itself with "database system was
interrupted", "database system was not properly shut down; automatic recovery in progress",
"redo starts at LSN", and "redo done at LSN". heap_page_items() lets you see the physical tuple
that redo restored even though no snapshot will ever accept it.`,
      caution: code`
This lesson deliberately crashes the lab cluster. Only ever run it against $PGLAB, never against a
cluster you care about, and never against a packaged system cluster on port 5432. Both psql
sessions WILL lose their connections; that is part of the experiment.`,
      setup: code`
drop table if exists wal_crash;
create table wal_crash(id int primary key, note text);
insert into wal_crash select g, 'committed-' || g from generate_series(1,1000) g;`,
      code: code`
-- Session A: establish what is durable, then open a transaction and abandon it.
select count(*) as committed_rows from wal_crash;
select pg_current_wal_lsn() as lsn_after_commit;
select checkpoint_lsn, redo_lsn from pg_control_checkpoint();

begin;
insert into wal_crash values (99999, 'uncommitted, will vanish');
select count(*) as visible_inside_this_txn from wal_crash;
-- STOP HERE. Do not commit, do not quit psql. Leave this session sitting in its
-- open transaction and switch to Session B.

-- Session B: one committed row from a second session. Its commit fsyncs every
-- WAL byte written so far -- including Session A's uncommitted INSERT record,
-- which would otherwise still be sitting in a memory buffer when the server
-- dies, leaving redo nothing to restore.
insert into wal_crash values (99998, 'flusher-committed');
select pg_current_wal_flush_lsn() as everything_up_to_here_is_durable;

-- ==========================================================================
-- SHELL, in another terminal, as the postgres OS user. Run these by hand: no
-- lesson runner can follow the server across a restart.
--
--   export PATH=/usr/lib/postgresql/16/bin:$PATH PGLAB=$HOME/pglab
--
--   pg_ctl -D "$PGLAB/primary" stop -m immediate
--   pg_controldata -D "$PGLAB/primary" | head -8
--   pg_ctl -D "$PGLAB/primary" -l "$PGLAB/primary.log" start -w
--   grep -E 'interrupted|not properly|redo |invalid record' \
--        "$PGLAB/primary/log/postgresql.log" | tail -5
--
-- ==========================================================================

-- Session B: reconnect after the restart. Both old connections are gone.
select count(*) as rows_after_crash from wal_crash;
select count(*) as ghost_row_visible from wal_crash where id = 99999;

-- Recovery ended with a checkpoint, so the redo point is now "here".
select checkpoint_lsn, redo_lsn from pg_control_checkpoint();

-- The abandoned row IS on the page. Redo replayed its INSERT record; nothing
-- ever replayed a COMMIT for its xid, so no snapshot will accept it.
select blk, lp, t_xmin,
       heap_tuple_infomask_flags(t_infomask, t_infomask2) as flags
from generate_series(0, (pg_relation_size('wal_crash')/8192 - 1)::int) blk,
     lateral heap_page_items(get_raw_page('wal_crash', blk))
order by blk desc, lp desc limit 4;`,
      expectedResult: code`
Before the crash: 1000 committed rows, pg_current_wal_lsn() around 0/8A7C1530, and
pg_control_checkpoint() showing checkpoint_lsn 0/8A7C1530 with redo_lsn 0/8A7C1530 -- note that on
a busy cluster the redo point is usually far BEHIND the current LSN, and everything in between is
work that exists only in the log. Inside the open transaction, count(*) is 1001. Session B's
insert commits normally and pg_current_wal_flush_lsn() returns 0/8A8221F0.

The moment pg_ctl stop -m immediate runs, both psql sessions print:

  WARNING:  terminating connection due to immediate shutdown command
  server closed the connection unexpectedly
  psql: error: connection to server was lost

pg_controldata on the stopped cluster is the evidence that this was not a clean shutdown:

  Database cluster state:               in production
  Latest checkpoint location:           0/8A7C1530
  Latest checkpoint's REDO location:    0/8A7C1530

("in production" on a server that is not running means "nobody wrote a shutdown checkpoint".)

Restart takes a few seconds and the server log tells the whole story:

  LOG:  database system was interrupted; last known up at 2026-09-03 01:27:05 UTC
  LOG:  database system was not properly shut down; automatic recovery in progress
  LOG:  redo starts at 0/8A7C15A8
  LOG:  invalid record length at 0/8A8221F0: expected at least 24, got 0
  LOG:  redo done at 0/8A8221C0 system usage: CPU: user: 0.00 s, system: 0.00 s, elapsed: 0.00 s
  LOG:  checkpoint starting: end-of-recovery immediate wait
  LOG:  database system is ready to accept connections

redo starts at the REDO location pg_controldata printed and ends where the log ran out --
"invalid record length ... got 0" is not an error, it is how replay discovers the end of the
stream, and note that it stops at exactly the flush LSN Session B reported (0/8A8221F0). Anything
written after that point was still in memory and is simply gone. In an earlier run with more
pre-crash activity the same three lines read "redo starts at 0/8131CC88 ... redo done at
0/83055E30", 30 MB replayed in 0.31 s, with an end-of-recovery checkpoint writing 3053 buffers.

Session B, after reconnecting:

  rows_after_crash  = 1001     <- 1000 committed + Session B's flusher row
  ghost_row_visible = 0        <- the abandoned row is not among them
  checkpoint_lsn = 0/8A8221F0, redo_lsn = 0/8A8221F0   <- redo point caught up

and the last page of the heap still contains the abandoned tuple:

  blk | lp | t_xmin | flags
    6 | 59 |  84397 | {HEAP_HASVARWIDTH,HEAP_XMIN_COMMITTED,HEAP_XMAX_INVALID}
    6 | 58 |  84396 | {HEAP_HASVARWIDTH,HEAP_XMIN_INVALID,HEAP_XMAX_INVALID}
    6 | 57 |  84395 | {HEAP_HASVARWIDTH,HEAP_XMIN_COMMITTED,HEAP_XMAX_INVALID}
    6 | 56 |  84395 | {HEAP_HASVARWIDTH,HEAP_XMIN_COMMITTED,HEAP_XMAX_INVALID}

Line pointer 58, xid 84396, is the ghost: same page, same shape as its neighbours, sitting between
the last committed row (84395) and Session B's flusher (84397), but flagged XMIN_INVALID rather
than XMIN_COMMITTED. (It reads INVALID rather than blank because the count(*) above already
consulted the commit log, found the xid aborted, and cached that as a hint bit.) Redo restored the
bytes; visibility rejected them.`,
      systemsLens: code`
Commit means "the log is durable", not "the data files are durable". The heap pages for those
1000 rows were still dirty in shared buffers when the process died, and that was fine -- the WAL
already described them, so redo rebuilt them. This is the entire reason a log exists: it converts
many expensive random page writes into one cheap sequential append, and defers the random writes
to a checkpoint that can batch and reorder them.

Recovery here is redo-only, which is worth contrasting with textbook ARIES. There is no undo pass,
because PostgreSQL never overwrites a row in place: an uncommitted change is just a tuple version
whose xid is not marked committed, so "undo" costs nothing at recovery time and is paid later by
VACUUM instead. Systems that update in place (InnoDB, most non-MVCC engines) must run an undo pass
and keep undo logs; PostgreSQL trades that for bloat. Same invariant, different bill.

Finally, note what recovery time depends on: the distance from the last checkpoint's redo point to
the end of the log (here 30 MB, 0.31 s), not on database size. That is your RTO after a crash, and
it is exactly the dial the next module turns.`,
      challenge: code`
Repeat the experiment with synchronous_commit = off in Session A (set it, insert rows, commit,
then crash within a second). Do the "committed" rows survive? This is the failure mode you accept
when you take the throughput win from the previous lesson -- measure how much you actually lose.`,
    },

    {
      slug: "wal-replay-is-deterministic",
      tags: ["wal", "recovery", "replicated-log", "consistency"],
      title: "Read the log the server replayed",
      difficulty: "advanced",
      safetyLevel: "read-only",
      runIn: "mixed",
      estimatedMinutes: 20,
      prerequisites: ["crash-and-redo", "wal-files-and-recycling"],
      overview: code`
Redo is not magic and it is not opaque. The records the server replayed after the crash are
ordinary bytes in ordinary files, and pg_waldump prints them. In this lesson you take the "redo
starts at" and "redo done at" LSNs straight out of the server log and summarise exactly that range
with pg_waldump --stats. Then you cause a small, known transaction and dump it two ways -- through
pg_walinspect from SQL and through pg_waldump from the shell -- and confirm they print the same
records, in the same order, with the same lengths. The log is a replayable, inspectable stream,
and that is what makes a physical standby possible.`,
      syntaxBreakdown: code`
pg_waldump -p DIR reads segments out of a directory (pg_wal, or an archive), --start/--end bound
the LSN range, and --stats aggregates instead of printing every record. Each line carries rmgr,
len (rec/tot), tx, lsn, prev, a description, and blkref entries naming
tablespace/database/relfilenode and block -- prev is the previous record's LSN, so the log is a
backward-linked chain that replay validates as it goes. pg_walinspect's
pg_get_wal_records_info() reads the same records from SQL, but only from pg_wal and only up to the
flush LSN, which is why an older range has to come from the archive. pg_switch_wal() is what makes
a range archivable in the first place.`,
      setup: code`
drop table if exists wal_replay;
create table wal_replay(id int primary key, note text);
insert into wal_replay values (1,'one');`,
      code: code`
-- 1. What did recovery actually replay? Take the LSNs from the server's own log.
\! grep -E 'redo (starts|done)' $PGLAB/primary/log/postgresql.log | tail -2

-- 2. Cause a small, known transaction and bracket it.
select pg_current_wal_lsn() as s \gset
begin;
insert into wal_replay values (2,'two');
update wal_replay set note = 'ONE' where id = 1;
delete from wal_replay where id = 2;
commit;
select pg_current_wal_lsn() as e \gset
\echo range is :s to :e

-- 3. Read it from SQL.
select start_lsn, end_lsn, resource_manager, record_type, record_length
from pg_get_wal_records_info(:'s', :'e')
order by start_lsn;

-- 4. Seal the segment so the archiver ships it.
select pg_switch_wal();
select pg_sleep(3);
\! ls -1 $PGLAB/archive | tail -2

-- 5. Now read the SAME bytes from the archive with pg_waldump. Run these in a
--    shell as the postgres OS user, substituting the LSNs printed above for
--    START/END and the two LSNs from step 1 for REDO_START/REDO_DONE:
--
--      export PATH=/usr/lib/postgresql/16/bin:$PATH PGLAB=$HOME/pglab
--      pg_waldump -p "$PGLAB/archive" --start START --end END
--      pg_waldump -p "$PGLAB/archive" --start REDO_START --end REDO_DONE --stats`,
      expectedResult: code`
Step 1 prints the two lines the crash lesson produced:

  LOG:  redo starts at 0/8A822268
  LOG:  redo done at 0/8A881EE8 system usage: CPU: user: 0.00 s, ... elapsed: 0.00 s

Step 3, the four-statement transaction, decodes from SQL as five records:

  start_lsn  |  end_lsn   | resource_manager | record_type | record_length
  0/8A8C2768 | 0/8A8C27A8 | Heap             | INSERT      |            63
  0/8A8C27A8 | 0/8A8C27E8 | Btree            | INSERT_LEAF |            64
  0/8A8C27E8 | 0/8A8C2838 | Heap             | HOT_UPDATE  |            74
  0/8A8C2838 | 0/8A8C2878 | Heap             | DELETE      |            64
  0/8A8C2878 | 0/8A8C28A8 | Transaction      | COMMIT      |            46

and pg_waldump over the same range from the archive prints the same five, at the same LSNs, with
the same lengths, plus the detail SQL hides -- the xid, the backward prev pointer, and the exact
page each record touches:

  rmgr: Heap  len (rec/tot): 63/63, tx: 84406, lsn: 0/8A8C2768, prev 0/8A8C2738,
        desc: INSERT off: 2, flags: 0x08, blkref #0: rel 1663/19476/50820 blk 0
  rmgr: Btree len (rec/tot): 64/64, tx: 84406, lsn: 0/8A8C27A8, prev 0/8A8C2768,
        desc: INSERT_LEAF off: 2, blkref #0: rel 1663/19476/50825 blk 1
  rmgr: Heap  len (rec/tot): 74/74, tx: 84406, lsn: 0/8A8C27E8, prev 0/8A8C27A8,
        desc: HOT_UPDATE old_xmax: 84406, old_off: 1, ..., new_off: 3,
        blkref #0: rel 1663/19476/50820 blk 0
  rmgr: Heap  len (rec/tot): 64/64, tx: 84406, lsn: 0/8A8C2838, prev 0/8A8C27E8,
        desc: DELETE xmax: 84406, off: 2, infobits: [KEYS_UPDATED],
        blkref #0: rel 1663/19476/50820 blk 0
  rmgr: Transaction len (rec/tot): 46/46, tx: 84406, lsn: 0/8A8C2878, prev 0/8A8C2838,
        desc: COMMIT 2026-09-03 01:29:22.893138 UTC

Every record names one xid and one or more (tablespace/database/relfilenode, block) triples --
50820 is wal_replay's heap, 50825 its primary key index -- and each prev points back at the
previous record's lsn. That is all a replay loop needs: read the next record, find its page, apply
it if the page's LSN is older than the record's, repeat.

The --stats run over the recovery range summarises what the crash actually cost (rows that are all
zero omitted):

  WAL statistics between 0/8A822268 and 0/8A881EE8:
  Type            N       (%)      Record size    (%)      FPI size     (%)   Combined size
  XLOG           25 (  1.09)              1206 ( 0.73)       141192 (64.21)          142398
  Transaction    17 (  0.74)              5424 ( 3.30)            0 ( 0.00)            5424
  Storage         4 (  0.18)               168 ( 0.10)            0 ( 0.00)             168
  Standby        10 (  0.44)               440 ( 0.27)            0 ( 0.00)             440
  Heap2          90 (  3.94)              8098 ( 4.93)            0 ( 0.00)            8098
  Heap         1053 ( 46.08)             77711 (47.34)            0 ( 0.00)           77711
  Btree        1086 ( 47.53)             71124 (43.32)        78712 (35.79)          149836
  Total        2285                     164171 [42.74%]      219904 [57.26%]         384075

2285 records, 384 KB, replayed in well under a second. Note the FPI column: 57% of the replayed
bytes were full-page images (lesson 2), produced by only 25 XLOG records plus some btree ones. A
larger crash earlier in the lab replayed 97057 records and 25 MB with the same shape (Heap and
Heap2 dominating the record count, XLOG dominating the FPI bytes). Your counts depend entirely on
how much work happened between the last checkpoint and the crash; the shape does not.`,
      systemsLens: code`
The log is a public, self-describing format, and that is a design choice with consequences.
Because each record identifies its target page and carries a backward link, replay is a pure
function of (record stream, starting page state): the same records applied to the same pages
always yield the same result, on this machine or another one. That determinism is the whole basis
of physical streaming replication -- a standby is just a server stuck permanently in the redo loop
you watched run at startup, reading records over a socket instead of from a file. It is also the
basis of PITR: stop the replay at an arbitrary LSN or timestamp and you have the database as of
that instant.

The general pattern is state-machine replication: rather than shipping state, ship a totally
ordered stream of deterministic operations and let each replica derive the state. The hard part is
always determinism -- which is why WAL records reference a physical page and offset rather than
re-executing SQL, and why shipping statements instead ("statement-based replication") breaks the
first time a query calls now() or random(). Module 10 shows the other end of the spectrum:
decoding this same stream back into logical row changes, deliberately giving up the physical
layout in exchange for portability across versions and engines.`,
      challenge: code`
Run pg_waldump --stats=record over a range where you did a CREATE INDEX and a range where you
inserted the same number of rows. Which resource managers appear, and what fraction of the bytes
is FPI in each? Then predict what a standby's network link looks like during a big index build.`,
    },

    {
      slug: "wal-size-of-operations",
      tags: ["wal", "write-amplification", "hot-updates", "capacity"],
      title: "What things cost: measuring WAL per operation",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 25,
      prerequisites: ["every-change-is-a-wal-record", "hot-updates-and-fillfactor"],
      overview: code`
WAL volume is a first-class capacity number: it sets your archive bill, your replication
bandwidth, and how long recovery takes. It is also almost never proportional to the logical size
of the data. In this lesson you price four choices with pg_wal_lsn_diff -- batching rows into one
transaction, using COPY instead of INSERT, updating an indexed versus a non-indexed column, and
building an index -- and turn each into bytes per row so they can be compared directly.`,
      syntaxBreakdown: code`
pg_wal_lsn_diff(end, start) is the byte cost of everything that happened in between; wrapping
statements in \gset'd LSNs is the general recipe for pricing any operation. \gexec runs each row
of a result as its own statement, which is how you get N separate autocommit transactions out of
one query. COPY uses heap_multi_insert, which packs many tuples into one WAL record, while
INSERT ... SELECT logs one record per tuple. A HOT update writes only a heap record; an update
that changes an indexed column must also write index records, and pg_stat_user_tables.n_tup_upd
versus n_tup_hot_upd counts which happened (call pg_stat_force_next_flush() first, statistics are
buffered).`,
      setup: code`
drop table if exists wal_amp;
create table wal_amp(id int, v text) with (autovacuum_enabled = off);
drop table if exists wal_cols;
create table wal_cols(id int primary key, indexed int, plain int)
  with (autovacuum_enabled = off, fillfactor = 70);
insert into wal_cols select g, g, g from generate_series(1,200) g;
create index wal_cols_indexed_idx on wal_cols(indexed);
vacuum wal_cols;`,
      code: code`
-- A. The same 2000 rows, four ways.
select pg_current_wal_lsn() as a1 \gset
insert into wal_amp select g, 'v' from generate_series(1,2000) g;
select pg_current_wal_lsn() as a2 \gset

begin;
do $$ begin for i in 2001..4000 loop insert into wal_amp values (i,'v'); end loop; end $$;
commit;
select pg_current_wal_lsn() as a3 \gset

-- Session A
-- 2000 separate autocommit transactions. This takes several seconds: each one
-- is a commit, and each commit is an fsync.
select 'insert into wal_amp values (' || g || ', ''v'');'
from generate_series(4001,6000) g \gexec
select pg_current_wal_lsn() as a4 \gset

-- Session A
copy (select g, 'v' from generate_series(6001,8000) g) to '/tmp/wal_amp.csv' csv;
select pg_current_wal_lsn() as a5 \gset
copy wal_amp from '/tmp/wal_amp.csv' csv;
select pg_current_wal_lsn() as a6 \gset

select 'one multi-row INSERT, 1 txn' as how, pg_wal_lsn_diff(:'a2',:'a1') as wal_bytes,
       round(pg_wal_lsn_diff(:'a2',:'a1')/2000.0,1) as bytes_per_row
union all select '2000 INSERTs, 1 txn',     pg_wal_lsn_diff(:'a3',:'a2'),
                 round(pg_wal_lsn_diff(:'a3',:'a2')/2000.0,1)
union all select '2000 INSERTs, 2000 txns', pg_wal_lsn_diff(:'a4',:'a3'),
                 round(pg_wal_lsn_diff(:'a4',:'a3')/2000.0,1)
union all select 'COPY, 1 txn',             pg_wal_lsn_diff(:'a6',:'a5'),
                 round(pg_wal_lsn_diff(:'a6',:'a5')/2000.0,1);

-- Session A
-- B. The same 1000 updates to the same row, on a plain and an indexed column.
checkpoint;
update wal_cols set plain = plain + 1 where id = 1;   -- warm-up: this page pays its FPI here
select pg_current_wal_lsn() as u1 \gset
do $$ begin for i in 1..1000 loop update wal_cols set plain = plain+1 where id=1; end loop; end $$;
select pg_current_wal_lsn() as u2 \gset
do $$ begin for i in 1..1000 loop update wal_cols set indexed = indexed+1 where id=1; end loop; end $$;
select pg_current_wal_lsn() as u3 \gset

select '1000 updates of a NON-indexed column' as how, pg_wal_lsn_diff(:'u2',:'u1') as wal_bytes,
       round(pg_wal_lsn_diff(:'u2',:'u1')/1000.0,1) as bytes_per_update
union all select '1000 updates of an INDEXED column', pg_wal_lsn_diff(:'u3',:'u2'),
                 round(pg_wal_lsn_diff(:'u3',:'u2')/1000.0,1);

select 'non-indexed' as which, record_type, count(*), sum(record_length) as len
from pg_get_wal_records_info(:'u1',:'u2') group by 1,2 order by 4 desc limit 4;
select 'indexed' as which, record_type, count(*), sum(record_length) as len
from pg_get_wal_records_info(:'u2',:'u3') group by 1,2 order by 4 desc limit 4;

select pg_stat_force_next_flush();
select relname, n_tup_upd, n_tup_hot_upd from pg_stat_user_tables where relname = 'wal_cols';

-- Session A
-- C. Building an index: how does the WAL compare to the index itself?
select pg_current_wal_lsn() as i1 \gset
create index wal_amp_id_idx on wal_amp(id);
select pg_current_wal_lsn() as i2 \gset
select 'CREATE INDEX' as how, pg_wal_lsn_diff(:'i2',:'i1') as wal_bytes,
       pg_relation_size('wal_amp_id_idx') as index_bytes;`,
      expectedResult: code`
A. Inserting the same 2000 rows costs very different amounts depending on how you frame it:

  how                     | wal_bytes | bytes_per_row
  one multi-row INSERT    |    129968 |          65.0
  2000 INSERTs, 1 txn     |    128432 |          64.2
  2000 INSERTs, 2000 txns |    224712 |         112.4
  COPY, 1 txn             |     28944 |          14.5

Three separate findings. (1) Writing one INSERT statement for 2000 rows saves nothing over 2000
INSERT statements in the same transaction -- 64-65 bytes/row either way -- because INSERT logs one
Heap/INSERT record per tuple regardless of statement shape. (2) Committing 2000 times instead of
once adds 48 bytes/row of pure overhead (a 46-byte COMMIT record plus alignment), a 75% increase,
on top of 2000 fsyncs. (3) COPY is 4.4x cheaper per row than INSERT: it uses heap_multi_insert and
packs many tuples into a single record. Batching helps enormously, but only through the code path
that actually batches.

B. Updating the same row 1000 times:

  how                                  | wal_bytes | bytes_per_update
  1000 updates of a NON-indexed column |    117680 |            117.7
  1000 updates of an INDEXED column    |    219816 |            219.8

Nearly 2x, and the record breakdown says why:

  non-indexed | HOT_UPDATE   |  994 | 77532        indexed | INSERT_LEAF  | 1995 | 127680
  non-indexed | FPI_FOR_HINT |    3 | 24723        indexed | UPDATE       |  995 |  77610
  non-indexed | INSERT_LEAF  |   12 |  8866        indexed | SPLIT_L      |    2 |   3400
  non-indexed | UPDATE       |    1 |  3283        indexed | PRUNE        |    7 |   2389

The plain column produced 994 HOT_UPDATEs and only 12 index records; the indexed column produced
995 non-HOT UPDATEs and 1995 INSERT_LEAFs -- two index records per update -- plus page splits and
deduplication work. pg_stat_user_tables confirms it: n_tup_upd = 2001 with n_tup_hot_upd = 995,
so essentially all of the first loop was HOT and none of the second was. (A handful of records in
the non-indexed run are not HOT: once the free space that fillfactor 70 reserved is used up, the
row has to move to another page until pruning reclaims space, and that move triggers an index
insert and a fresh page image.)

C. CREATE INDEX on the 8000-row wal_amp cost 529464 bytes of WAL to produce a 196608-byte index --
about 2.7x the size of the thing it built, because the WAL carries the new index pages plus the
full-page images of everything the build dirtied. An index build is not a metadata change; it is a
full write of a new relation, logged.`,
      systemsLens: code`
Write amplification is the number that decides your storage and network bill, and this lesson
gives you the tool to measure it instead of guessing: bracket anything with two LSNs and divide.
The four results generalise cleanly. Per-operation overhead (the commit record, the fsync) is
amortised by batching, which is why every high-throughput ingestion path -- COPY here, batching
producers in Kafka, memtable writes in an LSM tree -- exists. Secondary indexes are not free
storage, they are a multiplier on every write that touches them, which is the real cost of "just
add an index". And bulk structural operations (index builds, table rewrites, mass updates)
generate WAL bursts that a replica must receive, an archive must store, and a recovery must
replay -- so the migration that is instant on your laptop is the one that saturates the
replication link at 3am.

The habit worth taking away: when you design a write path, ask what it costs in log bytes per
logical change, not just in rows. A queue table updated in place through an indexed status column
is cheap logically and expensive in WAL; the same queue as an append-only outbox with a
HOT-updatable flag is the same feature at a fraction of the write amplification. Module 14 builds
exactly that.`,
      challenge: code`
Price an UPDATE that changes nothing: "update wal_amp set v = v". PostgreSQL still writes a new
tuple version for every row. Now price the same statement with a "where v is distinct from 'v'"
guard. How many bytes of WAL, and how much replication bandwidth, does one WHERE clause save on a
million-row table?`,
    },
  ],
};
