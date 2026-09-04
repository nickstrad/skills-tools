import { code, type Module } from "../../../src/types.ts";

export const VACUUM: Module = {
  category: "vacuum",
  title: "Vacuum: dead tuples, visibility, bloat, and freezing",
  lessons: [
    {
      slug: "vacuum-reclaims-in-place",
      title: "VACUUM makes space reusable inside the table",
      difficulty: "beginner",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      estimatedMinutes: 12,
      prerequisites: ["install-lab-extensions", "process-model"],
      revision: 4,
      overview: code`
Plain VACUUM removes dead tuples and their index entries, records the freed space in the free space
map. It can truncate empty pages at the end, but cannot move live rows to consolidate interior holes.
In this fixture the file stays the same size. Observe reclaimed tuple space, then insert 10000 new
rows and measure whether they fit inside the existing allocation.`,
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
On the validated PostgreSQL16 run, the table was 1379 pages before vacuum. The following numbers
are sample evidence; allocation, pruning and index history can change them. Compare your own
before/after page counts, removed versions, advertised free bytes and logical row counts.

The verbose output for lab.public.vac_t reports:
  pages: 0 removed, 1379 remain, 1379 scanned (100.00% of total)
  tuples: 20010 removed, 20000 remain, 0 are dead but not yet removable
  index scan needed: 1035 pages from table (75.05% of total) had 59960 dead item identifiers removed
  index "vac_t_pkey": pages: 112 in total, 0 newly deleted, 0 currently deleted, 0 reusable
Note the two different numbers: 20010 whole dead tuples still had their data, but 59960 line
pointers (item identifiers) were left behind by earlier opportunistic pruning, and only VACUUM can
free those, because only VACUUM knows it has removed every index entry pointing at them. A second
INFO block does the same for the TOAST table, which is empty.

After vacuum: pages_after = 1379 - not one page was given back. pgstattuple reports
dead_tuple_count = 0 and free_percent = 74.83, and pg_freespace now advertises free space on all
1379 pages, 8449248 bytes in total, up to 8160 bytes in a single page.

The statistics estimate n_dead_tup can already be zero, or can retain a larger historical value
until the collector refreshes it; do not use it as the proof that cleanup completed. The exact scan
and free-space-map output are the evidence for this experiment.

Then 10000 fresh rows are inserted and the table is still 1379 pages: every new row fit in a hole.
Vacuum did not make the file smaller, it made the file reusable.`,
      systemsLens: code`
Reclamation and relocation solve different problems. Ordinary VACUUM makes eligible interior space
reusable; it can also truncate an empty file tail. VACUUM FULL instead rewrites live data and needs
an exclusive table lock. Neither operation makes an old snapshot stop needing history. First identify
whether growth comes from retained versions, insufficient cleanup capacity, a growing live dataset,
or unused allocation. Then decide whether to bound a reader, improve cleanup, change the workload,
or schedule a rewrite. A stable file size alone does not establish healthy latency or capacity.`,
      challenge: code`
Immediately after the first VACUUM and before the reinsertion step, run VACUUM (VERBOSE) again.
Compare tuples removed, scanned pages and index-cleanup decisions. With no intervening writes,
all-visible metadata can let it skip work; compare observed counts rather than requiring an exact
scan percentage.`,
    },
    {
      slug: "vacuum-full-rewrites-and-locks",
      title: "VACUUM FULL: a new file, and a queue behind it",
      revision: 4,
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
PostgreSQL's VACUUM FULL excludes concurrent table access while it replaces physical storage. This
is one relocation design, not a universal requirement that every storage engine stop readers for
all compaction. An online rewrite needs another coordination protocol to capture concurrent changes,
build replacement storage and switch readers safely. That trades the long exclusive interval for
extra storage, change tracking and a final synchronization point; it still needs measured bounds.`,
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
      revision: 4,
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
Concentrate the same 200 updates on a few adjacent pages (WHERE id <= 200) and
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
      revision: 4,
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
You observed version cleanup, in-place reuse, visibility information, and an autovacuum threshold.
Read these bounded sections to connect the safety horizon and the background control loop. Skip exact
autovacuum defaults, threshold numbers, and monitoring output; continue when you have the mechanism.
`,
      },
      overview: code`
Autovacuum schedules routine cleanup when a table's estimated dead tuples exceed
threshold + scale_factor * reltuples; manual VACUUM also has operational uses. This lesson sets a small table-local
threshold, then performs three modest independently committed write batches and measures the growing
dead-version backlog. A bounded poll may observe an autovacuum completion, but timing is not a
guarantee: if it does not appear, the diagnostics still prove eligibility and tell you what to inspect.`,
      reading:
        `PostgreSQL 14 Internals, Chapter 6 "Vacuum and Autovacuum" (sections "Automatic Vacuum and Analysis", "Monitoring")`,
      readingNotes: code`
Chapter 6 explains the dead-tuple threshold formula, the launcher and worker, and the monitoring views
that show completed or active vacuum work. This lesson lowers one table's threshold, creates bounded
write batches, and records the observed backlog and worker counters. Run it first, then read the
chapter to place an observed completion or the bounded diagnostic outcome in the control loop.`,
      syntaxBreakdown: code`
### In plain terms

Autovacuum is a background garbage collector that wakes periodically and checks whether each table
has crossed its cleanup threshold. This experiment sets a very small threshold for one table, creates
three batches of 1,000 updates, and polls for completion evidence. Estimates arrive asynchronously,
and scheduling depends on the launcher and available workers; neither eligibility nor completion
is guaranteed to appear in the first sample.

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
  - What it gives us: a changing dead-tuple estimate and an increase from the recorded initial
    autovacuum_count if a worker completes; neither initial value must be zero.
- **UPDATE vac_t SET n = n + 1 WHERE id <= 1000** (churn operation)
  - What it is: It creates replacement versions for the first 1,000 rows.
  - What it does here: It crosses the table threshold while leaving other rows alone.
  - What it gives us: A dirtied_at timestamp and a dead-tuple estimate far above 50.
- **now()::time(0)** (timestamp function and cast)
  - What it is: now() returns the current transaction time; the cast keeps time to whole seconds.
  - What it does here: It labels the update and each poll.
  - What it gives us: A readable delay between dirtied_at and last_autovacuum.
- **\\watch i=5 c=12** (psql polling meta-command)
  - What it is: It repeats the previous query every 5 seconds (i) for 12 cycles (c), then stops.
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
- **autovacuum_vacuum_cost_delay = 20** (challenge throttle)
  - What it is: A per-table delay limiting how aggressively vacuum consumes I/O resources.
  - What it does here: It adds a table-local 20-millisecond cost delay during the variation.
  - What it gives us: a controlled throttle, though a short worker can still finish between samples.
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
select format('update vac_t set n = n + 1 where id <= 1000;') from generate_series(1, 3) \gexec
select now()::time(0) as dirtied_at, n_dead_tup
from pg_stat_user_tables where relname = 'vac_t';
-- Session A
select now()::time(0) as t, n_dead_tup, autovacuum_count, last_autovacuum::time(0)
from pg_stat_user_tables where relname = 'vac_t' \watch i=5 c=12
-- Session A
select relid::regclass as relation, phase, heap_blks_total, heap_blks_scanned
from pg_stat_progress_vacuum where datid = (select oid from pg_database where datname=current_database())
  and relid = 'vac_t'::regclass;
alter table vac_t reset (autovacuum_vacuum_threshold, autovacuum_vacuum_scale_factor,
                         autovacuum_analyze_threshold);`,
      expectedResult: code`
The lab normally has autovacuum on and autovacuum_naptime = 1min; record your actual settings. After the ALTER, reloptions reads
{autovacuum_enabled=on,autovacuum_vacuum_threshold=50,autovacuum_vacuum_scale_factor=0,
autovacuum_analyze_threshold=1000000}. Record initial last_autovacuum and autovacuum_count;
rerunning the experiment can retain a previous timestamp and a nonzero count.

The three batches create roughly 3,000 updates, so n_dead_tup should exceed the threshold of 50 even
though the exact estimate reflects statistics timing and page pruning. The \watch output either shows
the useful transition--autovacuum_count increases, last_autovacuum advances, and the backlog falls--or
it ends with the table still eligible. The latter is not a failed lesson: record autovacuum,
autovacuum_naptime, reloptions, n_dead_tup, and pg_stat_progress_vacuum, then inspect worker slots
and server logs before deciding why a worker did not run.

pg_stat_progress_vacuum is often empty because a short worker can finish between samples. A live row
is extra evidence about phase and scanned pages, not a required outcome. The table settings are reset
at the end in either case.`,
      systemsLens: code`
Background reclamation is a control loop: a trigger says when work is eligible, and scheduling plus
worker capacity says when it happens. The three batches show why a small hot table can accumulate a
backlog while it waits for that loop. The operational signal is the direction of dead versions and
completed autovacuums over time, together with the oldest snapshot that might block cleanup; one
minute of polling is deliberately not a promise about a shared server.`,
      challenge: code`
Rerun setup, set autovacuum_vacuum_cost_delay = 20 on **vac_t**, and use the same three generated
batches. If pg_stat_progress_vacuum catches a worker, compare its phase and scanned blocks with the
normal run; always reset that table option afterwards.`,
    },
  ],
};
