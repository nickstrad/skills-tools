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
      reading:
        `PostgreSQL 14 Internals, Chapter 3 "Pages and Tuples" (section "Operations on Tuples"); Chapter 6 "Vacuum and Autovacuum" (section "Automatic Vacuum and Analysis")`,
      readingNotes: code`
Chapter 3 explains why UPDATE creates new tuple versions, while Chapter 6 describes the statistics
used to decide when automatic vacuuming is needed. This lesson measures those versions through both
pg_stat_user_tables and an exact pgstattuple scan, showing where the cheap estimate diverges. Run it
before reading the chapters, then use them to interpret pruning and autovacuum decisions.`,
      syntaxBreakdown: code`
### In plain terms

This experiment makes PostgreSQL's copy-on-update behavior visible at scale. Three updates of 20,000
rows create many replacement versions; the logical row count stays the same while the heap grows and
dead versions accumulate. You compare a fast statistics estimate with an exact full-table scan so you
can tell operational signals from a diagnostic measurement.

### What you are learning

- **Dead tuples:** Old row versions remain until cleanup because another snapshot might need them.
- **HOT updates:** A heap-only update can reuse a page without changing an index entry when the row
  fits and indexed columns are unchanged.
- **Estimated versus exact metrics:** PostgreSQL statistics are cheap and approximate; pgstattuple
  reads every page for exact counts.

### Piece by piece

- **CREATE TABLE IF NOT EXISTS** (SQL DDL)
  - What it is: It creates the lab table if absent; the primary key on id indexes the identifier.
  - What it does here: It defines the table used for repeated update churn.
  - What it gives us: A stable relation for measuring heap growth.
- **ALTER TABLE ... SET (autovacuum_enabled = off)** (relation setting)
  - What it is: It changes options stored for one table; disabling autovacuum stops background cleanup
    from removing evidence during this lesson.
  - What it does here: It keeps dead-version counts and free space observable until the explicit scan.
  - What it gives us: A controlled before/after comparison.
- **TRUNCATE** (table reset)
  - What it is: It removes all rows efficiently.
  - What it does here: It makes setup repeatable before loading 20,000 rows.
  - What it gives us: A known starting relation size.
- **generate_series(1, 20000)** and **repeat('x', 100)** (SQL functions)
  - What they are: generate_series emits integers in a range; repeat creates a 100-character filler.
  - What they do here: They supply IDs, values, and row padding.
  - What they give us: Rows large enough to make page growth and reuse measurable.
- **VACUUM (ANALYZE)** (maintenance command and option)
  - What it is: VACUUM reclaims eligible dead space; ANALYZE refreshes planner statistics.
  - What it does here: It starts measurements from a clean, analyzed table.
  - What it gives us: n_live_tup near 20,000 and n_dead_tup at zero.
- **pg_relation_size('vac_t') / 8192** and **pg_size_pretty(...)** (size functions)
  - What they are: pg_relation_size returns main-fork bytes; dividing by 8192 converts them to heap
    pages, while pg_size_pretty formats bytes as kB or MB.
  - What they do here: They measure the file before and after updates in machine- and human-readable
    forms.
  - What they give us: Physical growth even though the logical row count is unchanged.
- **pg_stat_user_tables** (statistics view)
  - What it is: It reports approximate per-table activity and tuple counters.
  - What it does here: It reads n_live_tup, n_dead_tup, n_tup_upd, and n_tup_hot_upd for vac_t.
  - What it gives us: A cheap estimate of live/dead rows and how many updates were HOT.
- **pgstattuple('vac_t')** (extension inspection function)
  - What it is: It scans the whole table and counts physical live tuples, dead tuples, and free bytes.
  - What it does here: It supplies an exact check before and after the three UPDATE passes.
  - What it gives us: tuple_count, dead_tuple_count, dead_tuple_percent, and free_percent.
- **UPDATE ... SET n = n + 1** (data-change statement)
  - What it is: It changes every row's non-indexed integer value and creates a new tuple version.
  - What it does here: Running it three times creates three rounds of churn.
  - What it gives us: Larger relation size, update counters, and dead/free tuple evidence.
- **pg_sleep(1)** (delay function)
  - What it is: It pauses the current session for one second.
  - What it does here: It gives the statistics collector time to expose update counters.
  - What it gives us: More reliable post-update statistics without changing table data.
- **n_tup_hot_upd** (statistics column)
  - What it is: The count of updates using heap-only chains without new index entries.
  - What it does here: It is compared with total updates after packed pages leave little room.
  - What it gives us: Evidence that almost all updates needed ordinary new index pointers.
- **ALTER TABLE ... SET (fillfactor = 70)** (challenge relation option)
  - What it is: Fillfactor reserves roughly 30% of each new heap page for future updates; old pages
    need a rebuild to acquire that room.
  - What it does here: The variation repeats churn with spare page capacity.
  - What it gives us: A higher HOT-update count and less file growth.
`,
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
      reading:
        `PostgreSQL 14 Internals, Chapter 6 "Vacuum and Autovacuum" (sections "Vacuum", "Vacuum Phases"); Chapter 8 "Rebuilding Tables and Indexes" (section "Full Vacuuming")`,
      readingNotes: code`
Chapter 6 describes vacuum's heap, index, and free-space phases, while Chapter 8 contrasts ordinary
vacuum with rewriting operations that can reduce the file. This lesson watches the file remain the
same size while its holes become reusable, then fills those holes with new rows. Run it before the
chapters so the phase accounting has visible evidence to explain.`,
      syntaxBreakdown: code`
### In plain terms

Plain VACUUM cleans up dead row versions and index pointers, but it normally does not shorten the
table file. Instead it publishes the empty space to PostgreSQL's free space map, allowing later
INSERTs to reuse holes. This experiment measures the unchanged file, the newly advertised free bytes,
and the subsequent 10,000 rows fitting without file growth.

### What you are learning

- **In-place reclamation:** VACUUM makes existing pages reusable without relocating live rows.
- **Free space map:** A compact per-page summary tells future writes where enough room exists.
- **Vacuum phases:** Heap cleanup and index cleanup must agree before a dead line pointer is reusable.

### Piece by piece

- **CREATE TABLE IF NOT EXISTS / ALTER TABLE / TRUNCATE** (setup commands)
  - What they are: They create the lab table, disable autovacuum for controlled observations, and
    clear old rows.
  - What they do here: They establish a repeatable 20,000-row table before three update passes.
  - What they give us: Predictable dead tuples and pages.
- **generate_series(...) and repeat(...)** (row-generation functions)
  - What they are: They emit integer IDs and fixed-size text padding.
  - What they do here: They load rows large enough to produce measurable holes.
  - What they give us: A table whose pages contain dead versions before vacuum.
- **VACUUM (ANALYZE)** (maintenance command)
  - What it is: It cleans eligible space and refreshes planner statistics.
  - What it does here: Setup makes the initial table known; the three UPDATEs then create garbage.
  - What it gives us: A clean starting point for the pre-vacuum page and free-space queries.
- **UPDATE ... SET n = n + 1** (version-producing write)
  - What it is: It creates replacement versions for all rows.
  - What it does here: Three passes create dead versions and free holes inside the 1,379-page file.
  - What it gives us: A dead-tuple baseline for VACUUM.
- **pg_relation_size('vac_t') / 8192** (relation-size measurement)
  - What it is: It converts the table's main-fork bytes into 8 KiB page count.
  - What it does here: It runs before and after VACUUM and after inserting new rows.
  - What it gives us: Equal pages_before and pages_after, proving ordinary vacuum did not shrink.
- **pg_freespace('vac_t')** (free-space-map inspection function)
  - What it is: It emits each page's advertised **avail** free bytes.
  - What it does here: COUNT, SUM, and MAX summarize pages with reusable space.
  - What it gives us: Little useful space before vacuum, then free bytes on nearly every page afterward.
- **VACUUM (VERBOSE)** (maintenance command with output option)
  - What it is: VERBOSE prints heap and index cleanup counts, including pages and tuples removed.
  - What it does here: It removes dead tuples, removes their index item identifiers, and updates the
    free-space map.
  - What it gives us: “tuples: 20010 removed”, zero not-removable tuples, and index-scan lines; the
    additional TOAST block can be ignored.
- **pgstattuple('vac_t')** (exact physical scan)
  - What it is: It reads every page instead of trusting approximate statistics.
  - What it does here: It verifies dead tuples are gone and free space is high after VACUUM.
  - What it gives us: dead_tuple_count = 0, free_percent near 75%, and an independent check of FSM data.
- **INSERT ... SELECT generate_series(20001, 30000)** (bulk insert)
  - What it is: It inserts 10,000 generated rows; repeat('y', 100) supplies their padding.
  - What it does here: New rows are allocated into holes vacuum published.
  - What it gives us: More rows while pages_after_10k_more_rows remains 1,379.
- **VACUUM a second time (challenge)** (maintenance variation)
  - What it is: A no-write vacuum tests whether visibility metadata allows work to be skipped.
  - What it does here: It may report “index scan not needed” and zero tuples removed.
  - What it gives us: Evidence that a clean visibility map reduces later vacuum work.
`,
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
      reading:
        `PostgreSQL 14 Internals, Chapter 8 "Rebuilding Tables and Indexes" (section "Full Vacuuming"); Chapter 12 "Relation-Level Locks" (sections "Relation-Level Locks", "Wait Queue")`,
      readingNotes: code`
Chapter 8 explains that VACUUM FULL rebuilds a relation, while Chapter 12 explains the
AccessExclusiveLock and wait queue that make the rebuild block readers. This lesson holds an
AccessShareLock first, observes VACUUM FULL waiting, and then compares relfilenodes before and after
the rewrite. Run it before reading the lock and rebuild sections so their operational cost is clear.`,
      syntaxBreakdown: code`
### In plain terms

VACUUM FULL actually makes a bloated table file smaller by copying live rows into a new file. Because
physical addresses change during that copy, PostgreSQL takes an exclusive table lock: even SELECT
must wait. This experiment lets a reader enter first, starts the rewrite behind it, and shows the
waiting lock and the changed relation file after the reader commits.

### What you are learning

- **Rewrite versus in-place cleanup:** VACUUM FULL returns unused disk space but needs a second copy
  and an outage for that table.
- **Lock compatibility:** A reader's AccessShareLock conflicts with the rewrite's AccessExclusiveLock.
- **Wait queues:** pg_locks and pg_stat_activity reveal both the granted lock and the waiting request.

### Piece by piece

- **CREATE TABLE / ALTER TABLE / TRUNCATE / INSERT / VACUUM** (setup)
  - What they are: These commands create and reset the lab table, disable background cleanup, load
    20,000 rows, and create dead versions through updates and ordinary vacuum.
  - What they do here: They leave a 1,379-page table with reusable holes but the original file intact.
  - What they give us: A relation large enough for VACUUM FULL to rewrite visibly.
- **pg_backend_pid()** (session identity function)
  - What it is: It returns this connection's server-process ID.
  - What it does here: Session A and B print their IDs for correlating activity rows.
  - What it gives us: Values to identify the waiter and lock holder if output includes other sessions.
- **pg_relation_filepath('vac_t')** (relation-file function)
  - What it is: It returns the relation's main-fork path relative to PostgreSQL's data directory.
  - What it does here: It runs before and after VACUUM FULL.
  - What it gives us: A changed relfilenode path, proving a new physical file replaced the old one.
- **pg_relation_size('vac_t') / 8192** (size measurement)
  - What it is: It converts main-fork bytes to 8 KiB pages.
  - What it does here: It compares bloat before rewriting with the compact post-rewrite file.
  - What it gives us: Roughly 1,379 pages before and 345 pages afterward.
- **BEGIN** (transaction control)
  - What it is: It starts B's transaction and keeps its AccessShareLock until COMMIT.
  - What it does here: B performs a SELECT and then remains idle in transaction.
  - What it gives us: A reader that holds the table open while A requests an exclusive lock.
- **SELECT count(*) FROM vac_t** (reader)
  - What it is: It counts table rows without changing them.
  - What it does here: B's read acquires an AccessShareLock on vac_t.
  - What it gives us: 20,000 visible rows and the lock that blocks the rewrite.
- **VACUUM FULL** (exclusive rewrite command)
  - What it is: It copies live rows and indexes into new files, swaps them in, and discards the old
    storage; it must run outside an explicit transaction block.
  - What it does here: A waits until B releases its reader lock, then performs the rewrite.
  - What it gives us: A blocked command followed by a smaller table and a new filepath.
- **pg_locks** (lock system view)
  - What it is: It lists lock requests and whether each has been granted.
  - What it does here: The query filters rows for vac_t and sorts granted locks first.
  - What it gives us: B's granted AccessShareLock and A's ungranted AccessExclusiveLock.
- **pg_stat_activity** (activity view)
  - What it is: It reports backend state and wait information.
  - What it does here: It is joined by PID to annotate the lock rows; **wait_event_type = 'Lock'** and
    **wait_event = 'relation'** identify A waiting on a relation lock.
  - What it gives us: The queued VACUUM FULL request and its waiting reason.
- **left(a.query, 20)** (text function)
  - What it is: It returns the first 20 characters of a query string.
  - What it does here: It keeps the activity report readable while still identifying VACUUM FULL.
  - What it gives us: A short query label beside each PID.
- **COMMIT** (transaction control)
  - What it is: It ends B's transaction and releases the reader lock.
  - What it does here: A's waiting rewrite proceeds immediately afterward.
  - What it gives us: The transition from queued to completed VACUUM FULL.
- **pgstattuple('vac_t')** (exact scan)
  - What it is: It counts physical dead tuples and free space after the rewrite.
  - What it does here: It verifies the compact replacement relation.
  - What it gives us: dead_tuple_count = 0 and free_percent near the tightly packed starting value.
- **VACUUM FULL in the challenge** (lock variation)
  - What it is: The same exclusive rewrite started before a new SELECT arrives.
  - What it does here: The new reader queues behind A even though it only wants to read.
  - What it gives us: Direct evidence that the exclusive request turns the table into a temporary outage.
`,
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
      reading:
        `PostgreSQL 14 Internals, Chapter 6 "Vacuum and Autovacuum" (section "Vacuum"); Chapter 20 "Index Scans" (section "Index-Only Scans")`,
      readingNotes: code`
Chapter 6 explains VACUUM's visibility work, and Chapter 20 explains how an index-only scan avoids
heap visits when visibility is known. This lesson uses pg_visibility_map_summary and EXPLAIN to show
Heap Fetches at zero, then dirties scattered pages and watches fetches return. Run it before the
chapters, then read Chapter 20 to relate the all-visible map bits to the executor's plan.`,
      syntaxBreakdown: code`
### In plain terms

An index stores keys and row addresses, but it cannot by itself prove that a row is visible to the
current snapshot. VACUUM records one all-visible bit per heap page; an index-only scan can skip the
heap when that bit is set. This experiment starts with zero heap fetches, updates scattered rows to
clear many bits, and vacuums again to restore the fast path.

### What you are learning

- **Visibility map:** Page-level bits summarize whether all tuples are visible (and optionally frozen).
- **Index-only scans:** The executor can answer from an index only when the visibility map vouches for
  the heap page.
- **Write locality:** A few scattered updates can invalidate many pages and increase heap work.

### Piece by piece

- **CREATE TABLE / ALTER TABLE / TRUNCATE / INSERT** (setup)
  - What they are: They create the lab table, disable autovacuum, clear it, and load 20,000 padded
    rows; CREATE INDEX adds a lookup structure on n.
  - What they do here: They create a stable table large enough to have many visibility-map pages.
  - What they give us: A repeatable pre-vacuum relation and index.
- **CREATE INDEX ... ON vac_t(n)** (index DDL)
  - What it is: It builds a sorted structure mapping n values to heap tuple locations.
  - What it does here: It supplies the index-only plan for the range query.
  - What it gives us: The vac_t_n_idx index named in EXPLAIN output.
- **VACUUM (ANALYZE)** (maintenance command)
  - What it is: It marks eligible pages all-visible and refreshes planner statistics.
  - What it does here: It prepares the initial index-only scan.
  - What it gives us: all_visible = 345 and a plan with Heap Fetches: 0.
- **SET enable_seqscan = off** and **SET enable_bitmapscan = off** (planner settings)
  - What they are: Session-local switches that discourage sequential and bitmap scans.
  - What they do here: They make the planner choose the index-only path even for a small table.
  - What they give us: A consistent plan so changes in Heap Fetches expose visibility-map effects.
- **pg_visibility_map_summary('vac_t')** (extension inspection function)
  - What it is: It counts heap pages with the all-visible and all-frozen bits set.
  - What it does here: It runs before updates, after scattered updates, and after vacuum.
  - What it gives us: all_visible falling from 345 to about 145 and returning to 345; all_frozen is a
    separate, stricter bit count.
- **pg_relation_size('vac_t') / 8192** (page-count measurement)
  - What it is: It converts relation bytes to 8 KiB pages.
  - What it does here: It confirms updates did not change file size.
  - What it gives us: 345 pages throughout, separating visibility effects from bloat.
- **EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)** (plan-and-run command)
  - What it is: EXPLAIN displays the plan; ANALYZE executes it and reports actual rows; BUFFERS adds
    buffer-read counts; COSTS OFF hides estimates to keep evidence focused.
  - What it does here: It runs the same count range query before, during, and after dirty pages.
  - What it gives us: An Index Only Scan, its Heap Fetches count, and buffer totals.
- **WHERE n BETWEEN 1 AND 5000** (range predicate)
  - What it is: BETWEEN includes both endpoints and filters indexed n values.
  - What it does here: It selects 5,000 rows for the comparable count query.
  - What it gives us: The same logical result while heap work changes.
- **UPDATE ... WHERE id % 100 = 0** (scattered write)
  - What it is: % computes remainder; the predicate selects every 100th ID, and SET changes pad.
  - What it does here: It dirties roughly 200 rows spread across many pages without changing indexed n.
  - What it gives us: all-visible pages drop and Heap Fetches rise.
- **VACUUM vac_t** (visibility repair)
  - What it is: It revisits changed pages and can set their all-visible bits once safe.
  - What it does here: It runs after the updates.
  - What it gives us: all_visible returns to 345 and Heap Fetches returns to zero.
- **WHERE id <= 200** (challenge locality predicate)
  - What it is: It concentrates the same number of changed rows at the beginning of the table.
  - What it does here: It dirties fewer pages than the modulo pattern.
  - What it gives us: Fewer heap fetches, demonstrating that page locality matters more than row count.
`,
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
      reading:
        `PostgreSQL 14 Internals, Chapter 6 "Vacuum and Autovacuum" (sections "Automatic Vacuum and Analysis", "Monitoring")`,
      readingNotes: code`
Chapter 6 explains the dead-tuple threshold formula, the launcher and worker, and the monitoring views
that show completed or active vacuum work. This lesson lowers one table's threshold, creates 1,000
dead tuples, and polls until the worker resets the count. Run it first, then read the chapter to place
the observed naptime delay and progress view in the larger autovacuum control loop.`,
      syntaxBreakdown: code`
### In plain terms

Autovacuum is a background garbage collector that wakes periodically and checks whether each table
has crossed its cleanup threshold. This experiment sets a very small threshold for one table, creates
1,000 dead tuples, and polls until the worker appears to clean them. The wait demonstrates that
meeting a threshold is immediate but noticing it depends on the launcher's schedule.

### What you are learning

- **Threshold formula:** A table triggers vacuum after its estimated dead tuples exceed a fixed
  threshold plus a fraction of its estimated size.
- **Launcher versus worker:** The launcher notices eligible tables; a worker performs the scan, so
  progress and completion are separate observations.
- **Bounded polling:** psql's watch command can sample a changing view without running forever.

### Piece by piece

- **SHOW autovacuum** and **SHOW autovacuum_naptime** (configuration inspection)
  - What they are: SHOW returns effective server settings for the current session.
  - What they do here: They establish that autovacuum is enabled and show the launcher interval.
  - What they give us: The schedule explaining why cleanup does not start at UPDATE itself.
- **ALTER TABLE ... SET (autovacuum_vacuum_threshold = 50, autovacuum_vacuum_scale_factor = 0)**
  (per-table settings)
  - What it is: It overrides global vacuum trigger settings for vac_t; scale factor 0 removes the
    size-proportional term, leaving an absolute threshold of 50 dead tuples.
  - What it does here: It makes 1,000 dead tuples immediately eligible.
  - What it gives us: reloptions output recording the exact trigger values.
- **autovacuum_analyze_threshold = 1000000** (per-table analyze setting)
  - What it is: It is the threshold for automatic statistics analysis.
  - What it does here: The high value prevents autoanalyze competing with the vacuum event.
  - What it gives us: A cleaner observation of last_autovacuum and autovacuum_count.
- **pg_class.reloptions** (catalog column)
  - What it is: It stores table-specific options as text entries.
  - What it does here: The SELECT confirms ALTER TABLE settings were applied to vac_t.
  - What it gives us: A visible list containing enabled, threshold, scale-factor, and analyze values.
- **pg_stat_user_tables** (statistics view)
  - What it is: It reports approximate tuple counters and maintenance timestamps.
  - What it does here: It reads last_autovacuum, autovacuum_count, and n_dead_tup before and after
    churn.
  - What it gives us: n_dead_tup near 1,000 before cleanup, then zero and count 1 after the worker.
- **UPDATE vac_t SET n = n + 1 WHERE id <= 1000** (churn operation)
  - What it is: It creates replacement versions for the first 1,000 rows.
  - What it does here: It crosses the table threshold while leaving other rows alone.
  - What it gives us: A dirtied_at timestamp and a dead-tuple estimate far above 50.
- **now()::time(0)** (timestamp function and cast)
  - What it is: now() returns the current transaction time; the cast keeps time to whole seconds.
  - What it does here: It labels the update and each poll.
  - What it gives us: A readable delay between dirtied_at and last_autovacuum.
- **\\watch i=5 c=14** (psql polling meta-command)
  - What it is: It repeats the previous query every 5 seconds (i) for 14 cycles (c), then stops.
  - What it does here: It observes n_dead_tup and autovacuum_count until a worker completes.
  - What it gives us: Repeated rows showing count 0, then n_dead_tup near zero and count 1.
- **pg_stat_progress_vacuum** (progress view)
  - What it is: It reports currently running vacuum workers and heap totals/scans.
  - What it does here: The query checks whether the short vacuum is still active.
  - What it gives us: Often no rows because cleanup finishes between polls; a live row exposes phase,
    heap_blks_total, and heap_blks_scanned.
- **ALTER TABLE ... RESET (...)** (relation-setting reset)
  - What it is: RESET removes table-specific options and returns to inherited defaults.
  - What it does here: It cleans up the lab after the experiment.
  - What it gives us: Future runs are not permanently affected by this lesson's low threshold.
- **autovacuum_vacuum_cost_delay = 100ms** (challenge throttle)
  - What it is: A per-table delay limiting how aggressively vacuum consumes I/O resources.
  - What it does here: It slows a larger cleanup enough for progress to be observable.
  - What it gives us: heap_blks_scanned increasing slowly and a concrete view of throttling.
`,
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
      reading:
        `PostgreSQL 14 Internals, Chapter 4 "Snapshots" (section "Transaction Horizon"); Chapter 6 "Vacuum and Autovacuum" (section "Database Horizon Revisited"); Chapter 8 "Rebuilding Tables and Indexes" (section "Precautions")`,
      readingNotes: code`
Chapter 4 defines the oldest-observer horizon, Chapter 6 shows how it limits vacuum, and Chapter 8
describes the operational precautions around rebuilding bloated relations. This lesson pins a tiny
table with a repeatable-read transaction, measures the resulting 201 pages, and then shows cleanup
after the blocker commits. Run it before the chapters, then use the three discussions to connect a
local idle session to the global cost of retained history.`,
      revision: 3,
      studyCheckpoint: {
        core: [
          {
            source: "PostgreSQL 14 Internals",
            locator: `Chapter 4 §4.5 "Transaction Horizon" (printed pp. 87–89)`,
          },
          {
            source: "PostgreSQL 14 Internals",
            locator: `Chapter 6 §§6.1–6.3 (printed pp. 102–109)`,
          },
          {
            source: "PostgreSQL 14 Internals",
            locator:
              `Chapter 6 §6.5, subheadings "About the Autovacuum Mechanism", "Which Tables Need to be Vacuumed?", and "Which Tables Need to Be Analyzed?" (printed pp. 110–113)`,
          },
        ],
        rationale: code`
You observed dead versions, VACUUM cleanup, visibility information, autovacuum thresholds, and a
long transaction pinning cleanup in lessons 18–23. Read these sections to consolidate the horizon as
the safety boundary for garbage collection and the vacuum/autovacuum control loop. Skip from the PG14
text: exact autovacuum defaults, threshold numbers, and monitoring output; resume with lesson 24 when
you finish.
`,
      },
      syntaxBreakdown: code`
### In plain terms

This experiment shows how one long-lived reader can make a small table retain hundreds of pages of
old versions. Session B takes a repeatable-read snapshot and does no more work; Session A updates the
same ten rows 300 times, then vacuum reports every old version as blocked. Once B commits, vacuum can
reclaim the tuples, although the file remains large until a rewrite.

### What you are learning

- **Snapshot pinning:** A snapshot held open is an observer that keeps old row versions potentially
  visible, so vacuum must preserve them.
- **Global horizon:** The oldest backend xmin determines how far cleanup can advance.
- **Bloat and reuse:** Reclamation frees space inside the existing file; returning it to the OS needs
  a separate rewrite such as VACUUM FULL.

### Piece by piece

- **CREATE TABLE / ALTER TABLE / TRUNCATE / INSERT** (setup)
  - What they are: They create the small table, disable autovacuum, clear old contents, and insert
    ten rows with 500-character padding.
  - What they do here: They establish a one-page starting point and prevent background cleanup.
  - What they give us: A controlled relation whose growth is easy to measure.
- **generate_series(1, 10)** and **repeat('x', 500)** (SQL functions)
  - What they are: They generate ten integer IDs and padded text values.
  - What they do here: They make each replacement version large enough to consume pages.
  - What they give us: A visible size change from one page to about 201 pages.
- **VACUUM vac_small** (maintenance command)
  - What it is: It reclaims eligible dead tuples and updates reusable-space metadata.
  - What it does here: Setup cleans the initial table; the later runs demonstrate blocked and released
    cleanup.
  - What it gives us: Before/after dead-tuple evidence.
- **pg_relation_size('vac_small') / 8192** (size measurement)
  - What it is: It converts relation bytes to 8 KiB page count.
  - What it does here: It runs before churn, after 300 updates, and after cleanup.
  - What it gives us: One page initially, roughly 201 during the pin, and still 201 after vacuum.
- **BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ** (transaction setup)
  - What it is: It starts a transaction with a snapshot fixed for its lifetime.
  - What it does here: B reads once and stays idle, preserving the old snapshot while A writes.
  - What it gives us: The horizon holder that prevents vacuum from removing old versions.
- **SELECT count(*) FROM vac_small** (snapshot-establishing read)
  - What it is: It counts the ten rows without changing data.
  - What it does here: B's first statement creates the repeatable-read snapshot.
  - What it gives us: A visible count and a backend_xmin that can pin cleanup.
- **pg_backend_pid()** (session identity function)
  - What it is: It returns B's backend process ID.
  - What it does here: It labels the idle session in case multiple activity rows are present.
  - What it gives us: A PID to correlate with pg_stat_activity.
- **DO $$ ... $$** (anonymous PL/pgSQL block)
  - What it is: It runs procedural code as one transaction.
  - What it does here: **FOR i IN 1..300** executes UPDATE vac_small 300 times.
  - What it gives us: About 3,000 old versions retained because B's snapshot may need them.
- **pg_stat_activity** (backend activity view)
  - What it is: It reports session state and snapshot metadata.
  - What it does here: The query selects non-NULL backend_xmin, orders by xid age, and shows **state**
    and a boolean derived from **xact_start**.
  - What it gives us: B as idle in transaction with backend_xmin equal to vacuum's cutoff.
- **age(backend_xmin)** (xid-age expression)
  - What it is: It compares an xid's age to the current counter without treating xid as an ordinary
    sortable integer.
  - What it does here: It orders horizon holders from oldest to newest.
  - What it gives us: The session with greatest cleanup impact first.
- **VACUUM (VERBOSE)** (maintenance command and output option)
  - What it is: VERBOSE prints pages, tuple counts, index cleanup, and the removable cutoff.
  - What it does here: The first run attempts cleanup while B is idle; the second runs after COMMIT.
  - What it gives us: First “0 removed ... 3000 are dead but not yet removable”; later “3000 removed”.
- **COMMIT** (transaction control)
  - What it is: It ends B's transaction and releases its snapshot.
  - What it does here: It lets A's next vacuum treat the old versions as removable.
  - What it gives us: The transition from blocked cleanup to successful reclamation.
- **pgstattuple('vac_small')** (exact physical scan)
  - What it is: It counts live/dead tuples and free space by reading the relation directly.
  - What it does here: It verifies that dead tuples disappear while the file page count remains high.
  - What it gives us: dead_tuple_count near zero and free_percent near 99 after cleanup.
- **idle_in_transaction_session_timeout = '5s'** (challenge setting)
  - What it is: A session setting that terminates a connection idle inside an open transaction for the
    specified duration.
  - What it does here: It kills B automatically, releasing the pinned snapshot.
  - What it gives us: A FATAL timeout message and a vacuum that can reclaim without waiting manually.
- **READ COMMITTED with BEGIN only** (challenge isolation variation)
  - What it is: The default isolation mode; merely opening it does not create a snapshot until a query.
  - What it does here: B runs no SELECT, so it publishes no backend_xmin.
  - What it gives us: A contrast showing that snapshots, not open transactions alone, hold the horizon.
`,
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
