import { code, type Module } from "../../../src/types.ts";

export const VACUUM: Module = {
  category: "vacuum",
  title: "Vacuum: dead tuples, visibility, bloat, and freezing",
  lessons: [
    {
      slug: "dead-tuples-accumulate",
      title: "Every UPDATE leaves a corpse",
      difficulty: "beginner",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      estimatedMinutes: 12,
      prerequisites: ["install-lab-extensions", "process-model"],
      overview: code`
An UPDATE in PostgreSQL never overwrites a row. It writes a brand new tuple and marks the old one
dead, because some other transaction may still need to see the old version. Garbage collection is a
separate, asynchronous job. This lesson makes the garbage: update 20000 rows three times and measure
how much space the dead versions take, both from the statistics view (an estimate the server keeps
for free) and from pgstattuple (an exact count that costs a full scan).`,
      syntaxBreakdown: code`
pg_stat_user_tables.n_dead_tup is the planner/autovacuum estimate of dead tuples, incremented by
the statistics machinery on every update and delete; n_tup_hot_upd counts updates that fit on the
same page and needed no index change. pgstattuple('t') reads every page and returns exact counts:
tuple_count, dead_tuple_count, dead_tuple_percent, free_percent. pg_relation_size('t') is the main
fork's size in bytes; divide by 8192 (the page size) for pages. ALTER TABLE ... SET
(autovacuum_enabled = off) keeps the janitor out of the way while you look at the mess.`,
      setup: code`
create table if not exists vac_t(id int primary key, n int, pad text);
alter table vac_t set (autovacuum_enabled = off);
truncate vac_t;
insert into vac_t select g, g, repeat('x', 100) from generate_series(1, 20000) g;
vacuum (analyze) vac_t;`,
      code: code`
-- Session A
select pg_relation_size('vac_t') / 8192 as pages, pg_size_pretty(pg_relation_size('vac_t')) as size;
select n_live_tup, n_dead_tup from pg_stat_user_tables where relname = 'vac_t';
select tuple_count, dead_tuple_count, dead_tuple_percent, free_percent from pgstattuple('vac_t');
-- Session A
update vac_t set n = n + 1;
update vac_t set n = n + 1;
update vac_t set n = n + 1;
-- Session A
select pg_sleep(1);
select n_live_tup, n_dead_tup, n_tup_upd, n_tup_hot_upd
from pg_stat_user_tables where relname = 'vac_t';
select pg_relation_size('vac_t') / 8192 as pages, pg_size_pretty(pg_relation_size('vac_t')) as size;
select tuple_count, dead_tuple_count, dead_tuple_percent, free_percent from pgstattuple('vac_t');`,
      expectedResult: code`
The freshly loaded table is 345 pages (2760 kB), n_live_tup = 20000, n_dead_tup = 0, and pgstattuple
reports dead_tuple_count = 0 with free_percent = 0.59 - a densely packed heap.

Three whole-table updates later the file is 1379 pages (11 MB): four times the size for exactly the
same 20000 logical rows, because each pass appended a new version of every row. The statistics view
claims n_live_tup = 40000 and n_dead_tup = 60000 with n_tup_upd = 60000 and n_tup_hot_upd = 40 -
almost nothing was a HOT update, since the freshly packed pages had no room for a second version.

pgstattuple disagrees, and the disagreement is the point: it counts dead_tuple_count = 20010,
dead_tuple_percent = 23.56, free_percent = 48.66. Two thirds of the dead versions are already gone.
Ordinary page access prunes dead tuples opportunistically, so passes 2 and 3 cleaned up after passes
1 and 2 as they rewrote each page - but the space they freed stayed inside those pages, and the
counter in pg_stat_user_tables was never corrected. Half the file is now free space.`,
      systemsLens: code`
This is copy-on-write with deferred garbage collection, the same design as an LSM tree's obsolete
SSTables or a log-structured filesystem's stale blocks: writes are cheap and never block readers,
and the cost is moved into a background reclaimer plus the storage to hold garbage until it runs.
Two consequences follow everywhere this pattern appears. First, your steady-state footprint is a
function of write rate and reclaim latency, not of logical data size. Second, the accounting the
system shows you is an estimate maintained by the writers, so it drifts from reality - trust the
cheap estimate for triggering work and the expensive scan for diagnosing it.`,
      challenge: code`
Repeat with a table created at fillfactor 70 (ALTER TABLE vac_t SET (fillfactor = 70), then rebuild)
and watch n_tup_hot_upd jump: leaving room on each page lets updates stay put, keeps the index
pointing at the same line pointer, and stops the file from growing.`,
    },
    {
      slug: "vacuum-reclaims-in-place",
      title: "VACUUM is a compactor, not a shrinker",
      difficulty: "beginner",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      estimatedMinutes: 12,
      prerequisites: ["dead-tuples-accumulate"],
      overview: code`
Plain VACUUM removes dead tuples and their index entries, records the freed space in the free space
map, and then leaves the file exactly as long as it found it. Watch the verbose output account for
every dead version, watch the file size not move, and then watch 10000 new rows disappear into the
holes vacuum punched.`,
      syntaxBreakdown: code`
VACUUM (VERBOSE) t prints one INFO block per relation (the table and its TOAST table): "pages: R
removed, N remain", "tuples: D removed, L remain, U are dead but not yet removable", "index scan
needed: P pages ... had I dead item identifiers removed", and the removable cutoff (the oldest xmin
vacuum was allowed to use). pg_freespace('t') returns one row per page with avail, the bytes the
free space map advertises for that page. pgstattuple's free_percent measures the same thing by
reading pages directly.`,
      setup: code`
create table if not exists vac_t(id int primary key, n int, pad text);
alter table vac_t set (autovacuum_enabled = off);
truncate vac_t;
insert into vac_t select g, g, repeat('x', 100) from generate_series(1, 20000) g;
vacuum (analyze) vac_t;
update vac_t set n = n + 1;
update vac_t set n = n + 1;
update vac_t set n = n + 1;`,
      code: code`
-- Session A
select pg_relation_size('vac_t') / 8192 as pages_before;
select count(*) as pages_with_free_space, sum(avail) as free_bytes from pg_freespace('vac_t');
-- Session A
vacuum (verbose) vac_t;
-- Session A
select pg_relation_size('vac_t') / 8192 as pages_after;
select n_dead_tup from pg_stat_user_tables where relname = 'vac_t';
select dead_tuple_count, dead_tuple_percent, free_percent from pgstattuple('vac_t');
select count(*) as pages_with_free_space, sum(avail) as free_bytes, max(avail) as max_free
from pg_freespace('vac_t');
-- Session A
insert into vac_t select g, g, repeat('y', 100) from generate_series(20001, 30000) g;
select pg_relation_size('vac_t') / 8192 as pages_after_10k_more_rows, count(*) as rows from vac_t;`,
      expectedResult: code`
Before vacuum the table is 1379 pages and the free space map advertises nothing useful, because
nobody has told it about the holes.

The verbose output for lab.public.vac_t reports:
  pages: 0 removed, 1379 remain, 1379 scanned (100.00% of total)
  tuples: 20010 removed, 20000 remain, 0 are dead but not yet removable
  index scan needed: 1035 pages from table (75.05% of total) had 59960 dead item identifiers removed
  index "vac_t_pkey": pages: 112 in total, 0 newly deleted, 0 currently deleted, 0 reusable
Note the two different numbers: 20010 whole dead tuples still had their data, but 59960 line
pointers (item identifiers) were left behind by earlier opportunistic pruning, and only VACUUM can
free those, because only VACUUM knows it has removed every index entry pointing at them. A second
INFO block does the same for the TOAST table, which is empty.

After vacuum: pages_after = 1379 - not one page was given back. n_dead_tup = 0, pgstattuple reports
dead_tuple_count = 0 and free_percent = 74.83, and pg_freespace now advertises free space on all
1379 pages, 8449248 bytes in total, up to 8160 bytes in a single page.

Then 10000 fresh rows are inserted and the table is still 1379 pages: every new row fit in a hole.
Vacuum did not make the file smaller, it made the file reusable.`,
      systemsLens: code`
Reclaiming space in place and republishing it through an allocator (the free space map) is the
cheap half of compaction: it is incremental, interruptible, and never invalidates a physical
address, so concurrent readers and index entries stay valid. The expensive half - actually
returning space to the operating system - requires moving live data, which means rewriting
addresses, which means excluding everyone. Most storage engines make the same split (an LSM's
tombstone drop versus a full compaction, a filesystem's free list versus a defrag). The operational
rule that falls out of it: bloat that plateaus is fine, because the space is being recycled; bloat
that grows means reclamation is losing the race, and only then do you need the exclusive-lock tool.`,
      challenge: code`
Run VACUUM (VERBOSE) a second time with no intervening writes and watch "index scan not needed" and
"tuples: 0 removed" - and note it still scans far fewer pages, because the visibility map now marks
them all-visible and lets vacuum skip them entirely.`,
    },
    {
      slug: "vacuum-full-rewrites-and-locks",
      title: "VACUUM FULL: a new file, and a queue behind it",
      difficulty: "intermediate",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      prerequisites: ["vacuum-reclaims-in-place", "install-lab-extensions"],
      overview: code`
VACUUM FULL does give the space back, and the price is written on the tin: it copies the live rows
into a brand new file and takes an AccessExclusiveLock for the whole copy, so nothing - not even a
SELECT - may touch the table meanwhile. Here a plain reader gets in first and holds its
AccessShareLock; VACUUM FULL then queues behind it, and you can watch the ungranted lock row from
the reader's session. When the reader commits, the rewrite runs and pg_relation_filepath changes:
the table is now a different file on disk.`,
      syntaxBreakdown: code`
VACUUM FULL t rewrites the table and its indexes into new relfilenodes and truncates the old ones
away; it cannot run inside a transaction block. pg_relation_filepath('t') gives the path of the
main fork relative to the data directory, so it changes exactly when the relation is rewritten.
pg_locks joined to pg_stat_activity shows who holds and who wants a lock: granted = f is a waiter,
and wait_event_type = Lock with wait_event = relation names the queue it is parked in.`,
      setup: code`
create table if not exists vac_t(id int primary key, n int, pad text);
alter table vac_t set (autovacuum_enabled = off);
truncate vac_t;
insert into vac_t select g, g, repeat('x', 100) from generate_series(1, 20000) g;
vacuum (analyze) vac_t;
update vac_t set n = n + 1;
update vac_t set n = n + 1;
update vac_t set n = n + 1;
vacuum vac_t;`,
      code: code`
-- Session A
select pg_backend_pid() as a_pid;
select pg_relation_filepath('vac_t') as filepath_before,
       pg_relation_size('vac_t') / 8192 as pages_before;
-- Session B
begin;
select pg_backend_pid() as b_pid, count(*) as rows_b_can_see from vac_t;
-- Session A (blocks until B commits)
vacuum full vac_t;
-- Session B
select pg_sleep(1);
select l.pid, l.mode, l.granted, a.wait_event_type, a.wait_event, left(a.query, 20) as query
from pg_locks l join pg_stat_activity a on a.pid = l.pid
where l.relation = 'vac_t'::regclass
order by l.granted desc, l.pid;
-- Session B
commit;
-- Session A
select pg_relation_filepath('vac_t') as filepath_after,
       pg_relation_size('vac_t') / 8192 as pages_after;
select dead_tuple_count, free_percent from pgstattuple('vac_t');`,
      expectedResult: code`
Session B opens a transaction and counts 20000 rows, which leaves it holding an AccessShareLock on
vac_t. Session A's VACUUM FULL then hangs.

From B, the pg_locks join shows two rows for the vac_t relation: B's own AccessShareLock with
granted = t (state idle in transaction), and A's AccessExclusiveLock with granted = f, with A's
wait_event_type = Lock and wait_event = relation. A read of 20000 rows is holding the whole table
hostage - and note that the reverse is also true, since any statement arriving now would queue
behind A's pending exclusive lock.

The instant B commits, A's VACUUM FULL runs. Session A then reports a different path: filepath_before
was something like base/16409/17783 and filepath_after is base/16409/17800 - a new relfilenode,
which is to say a different file. pages_before was 1379 (vacuum had already emptied the dead tuples
but kept the file) and pages_after is 345, back to the size of a freshly loaded table, with
pgstattuple showing dead_tuple_count = 0 and free_percent about 0.59.`,
      systemsLens: code`
Compaction that relocates data cannot be done under a shared lock, because the addresses other
readers hold stop being valid. Every system that offers both an in-place reclaim and a rewrite
draws this line: online reclaim keeps availability and gives back nothing, offline rewrite gives
back everything and costs a full outage on that object plus a second copy of it on disk. When you
need the file smaller on a table that must stay available, the answer is a third design - copy the
live data into a new relation while replaying concurrent changes and swap at the end under a brief
lock, which is what pg_repack and most online schema-change tools do.`,
      caution: code`
VACUUM FULL needs room for a full second copy of the table and its indexes, and it blocks every
reader and writer for the whole rewrite. Never reach for it on a live table without knowing the
duration; the maintenance window is the size of the table, not the size of the bloat.`,
      challenge: code`
Repeat the experiment but have Session B run its SELECT after A's VACUUM FULL has started. B now
waits too, even though B only reads - proving that the exclusive lock request is not skippable and
that a rewrite converts into an outage for the whole table.`,
    },
    {
      slug: "visibility-map-and-index-only-scans",
      title: "The visibility map is what makes index-only scans possible",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      estimatedMinutes: 15,
      prerequisites: ["vacuum-reclaims-in-place"],
      overview: code`
An index entry does not know whether its row is visible to you - visibility lives in the heap tuple.
So an index-only scan is only possible when something else can vouch that every tuple on a page is
visible to everyone, and that something is the visibility map, one bit per page, set by VACUUM.
Here you will get Heap Fetches: 0, then dirty a scattered 1% of the rows and watch the bit clear for
those pages and the heap fetches come back - then vacuum again and watch it heal.`,
      syntaxBreakdown: code`
pg_visibility_map_summary('t') returns all_visible and all_frozen: how many pages carry each bit.
EXPLAIN (ANALYZE, BUFFERS) reports the plan node actually used and, for an Index Only Scan, the
Heap Fetches counter: the number of times the executor had to visit the heap anyway because the
page was not marked all-visible. SET enable_seqscan = off / enable_bitmapscan = off make the
planner pick the index-only plan on a table small enough that it would otherwise just scan it.`,
      setup: code`
create table if not exists vac_t(id int primary key, n int, pad text);
alter table vac_t set (autovacuum_enabled = off);
truncate vac_t;
insert into vac_t select g, g, repeat('x', 100) from generate_series(1, 20000) g;
create index if not exists vac_t_n_idx on vac_t(n);
vacuum (analyze) vac_t;`,
      code: code`
-- Session A
set enable_seqscan = off;
set enable_bitmapscan = off;
select all_visible, all_frozen from pg_visibility_map_summary('vac_t');
select pg_relation_size('vac_t') / 8192 as pages;
-- Session A
explain (analyze, buffers, costs off) select count(*) from vac_t where n between 1 and 5000;
-- Session A
update vac_t set pad = 'z' where id % 100 = 0;
select all_visible, all_frozen from pg_visibility_map_summary('vac_t');
explain (analyze, buffers, costs off) select count(*) from vac_t where n between 1 and 5000;
-- Session A
vacuum vac_t;
select all_visible from pg_visibility_map_summary('vac_t');
explain (analyze, buffers, costs off) select count(*) from vac_t where n between 1 and 5000;`,
      expectedResult: code`
After the load and VACUUM the table is 345 pages and pg_visibility_map_summary reports
all_visible = 345, all_frozen = 0 - every page vouched for. The first plan is an Index Only Scan
using vac_t_n_idx over 5000 rows with Heap Fetches: 0 and only 16 buffers touched: the query was
answered from the index alone.

Then 200 rows (id divisible by 100) get a new pad value. Those 200 rows are spread over 200 of the
345 pages, and one changed tuple is enough to clear a page's bit, so all_visible collapses to 145.
Re-running the same query still chooses an Index Only Scan, but now reports Heap Fetches: 2854 and
164 buffers: for every index entry landing on an unmarked page - not just for the 50 rows actually
changed in that range - the executor had to go read the heap tuple to decide visibility. Same plan,
same rows, an order of magnitude more work.

A plain VACUUM restores all_visible = 345 and the third plan is back to Heap Fetches: 0. Note the
table is still 345 pages throughout: the updates were HOT, so this was never about space.`,
      systemsLens: code`
This is a coarse-grained visibility summary standing in for per-record metadata: one bit per 8 kB
page turns "is this row visible?" into "can I skip asking?", and answering yes is what collapses a
two-level lookup into one. The pattern is everywhere - Bloom filters in front of SSTables, zone
maps and min/max statistics in columnar files, dirty bits in a page cache - and it shares their
failure mode: a summary is only as good as the fraction of it that is still clean, and a small
number of scattered writes can invalidate a large fraction of it. That is why a table with a low
but constant write rate spread over every page can lose index-only scans entirely, and why vacuum
frequency is a query-plan concern and not just a disk-space concern.`,
      challenge: code`
Concentrate the same 200 updates on one page instead of spreading them (WHERE id <= 200) and
compare: the same number of dirtied rows costs a couple of hundred heap fetches instead of a few
thousand. Locality of writes, not their volume, decides how much of the summary survives.`,
    },
    {
      slug: "autovacuum-triggers",
      title: "Autovacuum is a threshold, plus a delay you do not control",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      estimatedMinutes: 15,
      prerequisites: ["vacuum-reclaims-in-place"],
      overview: code`
Nobody runs VACUUM by hand in production; the autovacuum launcher does, when a table's estimated
dead tuples exceed threshold + scale_factor * reltuples. This lesson makes that formula fire on
demand by setting the threshold to 50 and the scale factor to 0 on one table, dirtying 1000 rows,
and then polling until the worker shows up. The second half of the lesson is the waiting: the
launcher only wakes every autovacuum_naptime seconds, so the reaction time is a minute even when
the trigger condition was met instantly.`,
      syntaxBreakdown: code`
ALTER TABLE t SET (autovacuum_vacuum_threshold = N, autovacuum_vacuum_scale_factor = F) overrides
the global trigger formula for one table; setting the scale factor to 0 makes the threshold an
absolute row count instead of a fraction of the table. autovacuum_analyze_threshold does the same
for autoanalyze - set it absurdly high here so the only worker you see is a vacuum.
pg_stat_user_tables.last_autovacuum and autovacuum_count record what the worker did.
\watch i=5 c=14 re-runs the previous query every 5 seconds, 14 times: a bounded poll.`,
      setup: code`
create table if not exists vac_t(id int primary key, n int, pad text);
alter table vac_t set (autovacuum_enabled = on);
truncate vac_t;
insert into vac_t select g, g, repeat('x', 100) from generate_series(1, 20000) g;
vacuum (analyze) vac_t;`,
      code: code`
-- Session A
show autovacuum;
show autovacuum_naptime;
alter table vac_t set (autovacuum_vacuum_threshold = 50,
                       autovacuum_vacuum_scale_factor = 0,
                       autovacuum_analyze_threshold = 1000000);
select reloptions from pg_class where relname = 'vac_t';
-- Session A
select last_autovacuum, autovacuum_count, n_dead_tup
from pg_stat_user_tables where relname = 'vac_t';
-- Session A
update vac_t set n = n + 1 where id <= 1000;
select now()::time(0) as dirtied_at, n_dead_tup
from pg_stat_user_tables where relname = 'vac_t';
-- Session A
select now()::time(0) as t, n_dead_tup, autovacuum_count, last_autovacuum::time(0)
from pg_stat_user_tables where relname = 'vac_t' \watch i=5 c=14
-- Session A
select relname, phase, heap_blks_total, heap_blks_scanned from pg_stat_progress_vacuum;
alter table vac_t reset (autovacuum_vacuum_threshold, autovacuum_vacuum_scale_factor,
                         autovacuum_analyze_threshold);`,
      expectedResult: code`
autovacuum is on and autovacuum_naptime is 1min. After the ALTER, reloptions reads
{autovacuum_enabled=on,autovacuum_vacuum_threshold=50,autovacuum_vacuum_scale_factor=0,
autovacuum_analyze_threshold=1000000}. Before the experiment last_autovacuum is empty and
autovacuum_count = 0.

The UPDATE dirties 1000 rows, so n_dead_tup jumps to about 1000 - already twenty times the
threshold of 50. Nothing happens for a while anyway. The \watch poll then prints the same row every
5 seconds with n_dead_tup = 1000 and autovacuum_count = 0, and somewhere in the first minute the
row flips: n_dead_tup = 0, autovacuum_count = 1, and last_autovacuum is a timestamp a few tens of
seconds after dirtied_at. On a lab cluster with nothing else to do, expect it to fire within about
a minute of the update - the trigger condition was met immediately, and the entire delay is the
launcher's naptime.

pg_stat_progress_vacuum is almost always empty by the time you look: vacuuming 1000 dead tuples in
a 345-page table takes milliseconds. The row you are chasing lives for less time than the wait for
it, which is the shape of every threshold-plus-poll system.`,
      systemsLens: code`
Background reclamation is a control loop, and this lesson exposes both of its constants: a trigger
(how much garbage before we care) and a period (how long before we notice). Tuning only the trigger
is the classic mistake. A small, extremely hot table can cycle its entire contents several times
within one naptime, so it is never more than a minute from being triggered and never less than a
minute from being cleaned - and it bloats regardless of how low you set the threshold. The fix is
the period, or a dedicated worker, or accepting that the table needs manual vacuum. The mirror
image is a huge table with the default scale factor of 0.2, which needs a fifth of itself to die
before anything happens; both failures come from expressing the trigger in the wrong units for the
workload.`,
      challenge: code`
Set autovacuum_vacuum_cost_delay high on the table (say 100ms) and repeat with a much larger churn:
the worker now shows up in pg_stat_progress_vacuum for long enough to watch heap_blks_scanned crawl.
That cost delay is the throttle that keeps autovacuum from saturating your I/O - and the reason a
badly throttled autovacuum can never catch up with a busy table.`,
    },
    {
      slug: "long-transaction-bloats-everyone",
      title: "One idle transaction, everybody's bloat",
      difficulty: "advanced",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      prerequisites: ["vacuum-reclaims-in-place", "dead-tuples-accumulate"],
      overview: code`
Vacuum may only remove a version that no possible snapshot can still need, so its cutoff is the
oldest snapshot in the whole cluster. One session sitting in an open transaction pins that cutoff,
and every other session's garbage piles up behind it - in tables the idle session has never even
read. Here Session B opens a repeatable-read transaction and does nothing else while Session A
churns a ten-row table 300 times. Ten logical rows will occupy two hundred pages, and vacuum will
tell you, in one line, exactly whose fault it is.`,
      syntaxBreakdown: code`
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ takes one snapshot and holds it for the whole
transaction, which is what pins the vacuum cutoff (a read committed transaction that has finished
its statement releases its snapshot and pins nothing). pg_stat_activity.backend_xmin is the oldest
transaction id a backend's snapshot still needs; the smallest one in the cluster becomes vacuum's
"removable cutoff". VACUUM (VERBOSE) reports blocked versions as "N are dead but not yet
removable". A DO block runs a plpgsql loop as a single transaction.`,
      setup: code`
create table if not exists vac_small(id int primary key, n int, pad text);
alter table vac_small set (autovacuum_enabled = off);
truncate vac_small;
insert into vac_small select g, 0, repeat('x', 500) from generate_series(1, 10) g;
vacuum vac_small;`,
      code: code`
-- Session A
select pg_relation_size('vac_small') / 8192 as pages_before, count(*) as rows from vac_small;
-- Session B
begin transaction isolation level repeatable read;
select count(*) from vac_small;
select pg_backend_pid() as b_pid;
-- Session A
do $$ begin for i in 1..300 loop update vac_small set n = n + 1; end loop; end $$;
select pg_relation_size('vac_small') / 8192 as pages_after_churn, count(*) as rows from vac_small;
-- Session A
vacuum (verbose) vac_small;
select pid, backend_xmin, state, left(query, 30) as query
from pg_stat_activity where backend_xmin is not null order by age(backend_xmin) desc;
-- Session B
commit;
-- Session A
select pg_sleep(1);
vacuum (verbose) vac_small;
-- Session A
select pg_relation_size('vac_small') / 8192 as pages_final, count(*) as rows from vac_small;
select dead_tuple_count, free_percent from pgstattuple('vac_small');`,
      expectedResult: code`
The table starts at 1 page with 10 rows. Session B opens a repeatable-read transaction, reads the
count, and then just sits there.

Session A's 300-iteration loop leaves the table at 201 pages - still 10 rows. Normally most of that
would have been pruned away while the loop ran; it could not be, because B's snapshot might still
need those versions.

The first VACUUM (VERBOSE) says so directly:
  pages: 0 removed, 201 remain, 201 scanned (100.00% of total)
  tuples: 0 removed, 3010 remain, 3000 are dead but not yet removable
  removable cutoff: 3091, which was 1 XIDs old when operation ended
  index scan not needed: 0 pages from table (0.00% of total) had 0 dead item identifiers removed
Zero reclaimed out of three thousand. pg_stat_activity confirms the culprit: B is "idle in
transaction" with backend_xmin = 3091, the exact cutoff vacuum reported.

B commits. The very next VACUUM (VERBOSE) reports:
  tuples: 3000 removed, 10 remain, 0 are dead but not yet removable
  index scan needed: 200 pages from table (99.50% of total) had 2000 dead item identifiers removed
The garbage is gone - and the file is still 201 pages, with free_percent near 99. B's idleness cost
20x permanent disk footprint on a table B never touched, and only a rewrite will give it back.`,
      systemsLens: code`
A global GC horizon turns any long-lived reader into a cluster-wide liability: the reclaimer's
progress is min() over every participant, so the slowest one sets the rate for all. This is the
same hazard as a stuck replication slot pinning WAL, an unacknowledged consumer pinning a Kafka
segment, or one long JVM thread holding a reference into an old generation. Two lessons transfer.
First, bound the horizon rather than trusting clients: idle_in_transaction_session_timeout kills
sessions that hold a transaction open without doing work, and
transaction_timeout / statement_timeout bound the honest ones - these are availability settings, not
hygiene. Second, watch the horizon itself, not its symptoms: alert on the age of the oldest
backend_xmin (and of the oldest replication slot and prepared transaction), because by the time you
notice the bloat the space is already spent and only an exclusive-lock rewrite returns it.`,
      caution: code`
On a replica-facing cluster the same horizon can be pinned remotely by hot_standby_feedback and by
inactive replication slots, so a completely idle primary can still fail to reclaim anything.`,
      challenge: code`
Set idle_in_transaction_session_timeout = '5s' in Session B before its BEGIN, redo the experiment,
and watch B get killed with "FATAL: terminating connection due to idle-in-transaction timeout"
while A's next vacuum reclaims everything. Then measure how many pages the loop leaves behind when
nothing is pinning the horizon - it should be a handful, not two hundred.`,
    },
  ],
};
