import { code, type Module } from "../../../src/types.ts";

export const INDEXES: Module = {
  category: "indexes",
  title: "Indexes: B-tree internals, concurrent builds, and bloat",
  lessons: [
    {
      slug: "btree-page-anatomy",
      tags: [
        "btree",
        "index-access-methods",
        "pages-and-tuples",
        "index-scans",
      ],
      title: "Open a B-tree: metapage, root, internal pages, leaves",
      difficulty: "intermediate",
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 20,
      prerequisites: [
        "page-header-and-line-pointers",
        "install-lab-extensions",
      ],
      overview: code`
An index is a file of 8 KB pages, like a table, but the pages are arranged as a tree: block 0 is a
metapage that names the root, internal pages hold downlinks, and the leaf level is a doubly linked
list holding (key, heap ctid) pairs. In this lesson you build two indexes over the same 100k rows -
one on a 4-byte int, one on a 40-byte text - read their metapages, count their levels, and then
find, by hand, the exact leaf page and item that points at one particular heap tuple.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 25 "B-tree" (sections "Overview", "Page Layout")`,
      readingNotes: code`
Chapter 25 explains the B-tree levels, page layout, high keys, and leaf links that this lesson
opens with pageinspect. The experiment adds a size comparison between integer and wide text keys,
and uses amcheck to verify the structure. Read the chapter before or after; the block-by-block
inspection is a useful concrete companion to its diagrams.`,
      syntaxBreakdown: code`
### In plain terms

This experiment opens an index file as a tree of 8 KB pages. You compare a narrow integer key with a
wide text key, identify the root and leaf levels, and follow one key to the heap row it references.
The output turns the abstract idea of an index into pages, links, item offsets, and physical row
addresses that can be checked for consistency.

### What you are learning

- **B-tree fanout:** Wider keys fit fewer entries per page, increasing index size and sometimes height.
- **Internal versus leaf pages:** Internal pages choose child blocks; leaves hold searchable keys and heap addresses.
- **High keys and sibling links:** Boundary entries and links let scans move between leaf pages in key order.
- **Structural checking:** amcheck validates ordering and downlink invariants rather than returning query results.

### Piece by piece

- **pg_relation_size(...) / 8192** (size function and page conversion)
  - What it is: pg_relation_size returns relation bytes; dividing by 8192 converts them to PostgreSQL pages.
  - What it does here: It compares heap and index footprints for equal row counts.
  - What it gives us: Page counts showing the storage cost of wide keys.
- **bt_metap(index)** (pageinspect function)
  - What it is: It decodes block zero, the B-tree metapage.
  - What it does here: It identifies root, level, fastroot, fastlevel, and allequalimage for each index.
  - What it gives us: Tree height and root block; level 1 means root plus leaves.
- **bt_page_stats(index, blkno)** (pageinspect function)
  - What it is: It summarizes one B-tree page by block number.
  - What it does here: It groups the wide index by btpo_level and inspects root and leaf blocks.
  - What it gives us: type, live_items, avg_item_size, free_size, btpo_prev, btpo_next, and btpo_level.
- **bt_page_items(index, blkno)** (pageinspect function)
  - What it is: It lists individual items stored on one index page.
  - What it does here: It shows internal downlinks, leaf heap tuple addresses, item lengths, and key bytes.
  - What it gives us: itemoffset, ctid, itemlen, and data; item 1 is a high key except on the rightmost page.
- **generate_series and LATERAL** (SQL row generator and per-row subquery)
  - What they are: generate_series emits candidate block numbers; LATERAL lets page inspection use each number.
  - What they do here: They census every non-metapage block and search all leaves for one heap ctid.
  - What they give us: A per-level page count and the exact leaf/item containing id 50000.
- **ctid** (system column)
  - What it is: A physical tuple address written as block and item offset.
  - What it does here: The heap ctid is matched to the index item's ctid.
  - What it gives us: The bridge from an indexed key to its table page and tuple slot.
- **\gset and :leaf** (psql variable capture and substitution)
  - What they are: \gset saves a single-row query's columns as psql variables; :leaf substitutes one later.
  - What they do here: They capture the discovered leaf block instead of hard-coding it.
  - What they give us: Repeatable inspection of the exact page found by the search.
- **bt_index_check(index)** (amcheck function)
  - What it is: It checks B-tree ordering and link invariants and returns void on success.
  - What it does here: It validates both indexes after manual inspection.
  - What it gives us: A successful statement with blank values; corruption would raise an error.
- **generate_series and lpad** (SQL functions)
  - What they are: generate_series emits the 100000 test IDs; lpad left-pads text to a fixed width.
  - What they do here: They create equal-sized narrow and wide index keys.
  - What they give us: A controlled key-width comparison.
- **VACUUM (ANALYZE)** (maintenance command)
  - What it is: It cleans eligible tuples and refreshes planner statistics.
  - What it does here: It prepares the index inspection with current row counts.
  - What it gives us: A stable, analyzed table without changing the index layout.
`,
      setup: code`
drop table if exists ix_btree;
create table ix_btree(id int primary key, wide text, payload text) with (autovacuum_enabled = off);
insert into ix_btree
select g, 'key-' || lpad(g::text, 36, '0'), 'row-' || g from generate_series(1, 100000) g;
create index ix_btree_wide_idx on ix_btree(wide);
vacuum (analyze) ix_btree;`,
      code: code`
-- Two indexes over exactly the same 100000 rows, differing only in key width.
select pg_relation_size('ix_btree') / 8192 as heap_pages,
       pg_relation_size('ix_btree_pkey') / 8192 as pkey_pages,
       pg_relation_size('ix_btree_wide_idx') / 8192 as wide_pages;

-- The metapage (block 0) says where the root is and how tall the tree is.
select 'pkey (int)' as index, root, level, fastroot, fastlevel, allequalimage
from bt_metap('ix_btree_pkey')
union all
select 'wide (text)', root, level, fastroot, fastlevel, allequalimage
from bt_metap('ix_btree_wide_idx');

-- Every page of the wide index, grouped by its level. Level 0 is the leaf level.
select btpo_level, type, count(*) as pages,
       round(avg(live_items)) as avg_items, round(avg(free_size)) as avg_free_bytes
from generate_series(1, pg_relation_size('ix_btree_wide_idx') / 8192 - 1) blk,
     lateral bt_page_stats('ix_btree_wide_idx', blk::int)
group by 1, 2 order by 1 desc;

-- The root of the int index: one downlink per leaf page.
select blkno, type, live_items, avg_item_size, free_size, btpo_level
from bt_page_stats('ix_btree_pkey', 3);

select itemoffset, ctid as downlink, itemlen, data as key_bytes
from bt_page_items('ix_btree_pkey', 3) order by itemoffset limit 4;

-- A leaf page: item 1 is the high key, the rest are real entries, and btpo_prev /
-- btpo_next chain the leaf level together in key order.
select blkno, type, live_items, btpo_prev, btpo_next, btpo_level
from bt_page_stats('ix_btree_pkey', 2);

select itemoffset, ctid as heap_tuple, itemlen, data as key_bytes
from bt_page_items('ix_btree_pkey', 2) order by itemoffset limit 3;

-- Now descend by hand. Where does id = 50000 live, physically?
select ctid as heap_ctid from ix_btree where id = 50000;

select b.blkno as leaf_page, i.itemoffset, i.ctid as heap_tuple, i.data as key_bytes
from generate_series(1, pg_relation_size('ix_btree_pkey') / 8192 - 1) b(blkno),
     lateral bt_page_items('ix_btree_pkey', b.blkno::int) i
where i.ctid = (select ctid from ix_btree where id = 50000);

-- Capture that leaf's block number so the next queries do not hard-code it.
select b.blkno as leaf
from generate_series(1, pg_relation_size('ix_btree_pkey') / 8192 - 1) b(blkno),
     lateral bt_page_items('ix_btree_pkey', b.blkno::int) i
where i.ctid = (select ctid from ix_btree where id = 50000) \gset

select blkno, type, live_items, btpo_prev, btpo_next from bt_page_stats('ix_btree_pkey', :leaf);
select itemoffset, ctid as heap_tuple, data as key_bytes
from bt_page_items('ix_btree_pkey', :leaf) order by itemoffset limit 2;

-- amcheck asserts the invariants you just read by eye.
select bt_index_check('ix_btree_pkey') as pkey_checked,
       bt_index_check('ix_btree_wide_idx') as wide_checked;`,
      expectedResult: code`
The heap is 1031 pages. The int index is 276 pages (2.2 MB) and the text index over the same rows
is 831 pages (6.5 MB): key width, not row count, decides how tall and how fat a B-tree is.

bt_metap confirms it. The int index has root = 3, level = 1: two levels, one root page plus the
leaf level. The wide index has root = 101, level = 2: three levels. allequalimage is t for both.
Every lookup in the int index is 2 page reads plus the metapage; in the wide index it is 3.

The per-level census of the wide index reads:
  btpo_level | type | pages | avg_items | avg_free_bytes
           2 | r    |     1 |         9 |           7656
           1 | i    |     9 |        92 |           2676
           0 | l    |   820 |       123 |            771
9 downlinks at the top fan out to 9 internal pages of ~92 downlinks each, which fan out to 820
leaves of ~123 entries. That is the whole point of a B-tree: the fanout is set by how many keys fit
in 8 KB, and the height is log(fanout) of the row count - 100k rows in 3 levels, and the same tree
would hold millions in 4.

The int index's root (block 3) holds 274 items of 15 bytes with 2676 bytes free. Its first four
items are the downlinks:
  itemoffset | downlink | itemlen | key_bytes
           1 | (1,0)    |       8 |
           2 | (2,1)    |      16 | 6f 01 00 00 00 00 00 00
           3 | (4,1)    |      16 | dd 02 00 00 00 00 00 00
           4 | (5,1)    |      16 | 4b 04 00 00 00 00 00 00
Item 1 has no key at all: it is the "minus infinity" downlink to the leftmost child, block 1.
Item 2 points at block 2 and carries the key 0x0000016f = 367, meaning "everything from 367 lives
under block 2". Item 3's key is 0x000002dd = 733. So block 1 holds ids 1-366, block 2 holds
367-732, and so on: 274 downlinks for 274 leaf pages.

Leaf block 2 is type l, 367 live items, btpo_prev = 1 and btpo_next = 4 - the leaf level is a
doubly linked list, and its order has nothing to do with block order. Its items start:
  itemoffset | heap_tuple | itemlen | key_bytes
           1 | (7,1)      |      16 | dd 02 00 00 00 00 00 00
           2 | (3,76)     |      16 | 6f 01 00 00 00 00 00 00
Item 1 is the high key, 733 - the first key that belongs on the NEXT page, not on this one. Item 2
is the first real entry, key 367, pointing at heap tuple (3,76).

The descent: id = 50000 is heap tuple (515,45). Exactly one index item anywhere in the file points
at it - leaf page 138, itemoffset 225, key bytes 50 c3 00 00 = 0x0000c350 = 50000. That leaf has
367 live items, btpo_prev = 137 and btpo_next = 139, and its high key is 0x0000c3df = 50143. So a
lookup for 50000 reads block 0 (meta), block 3 (root, whose downlinks bracket 50000 into block
138), and block 138 - three page reads to turn a key into a heap address.

bt_index_check returns void, so both columns print as blank and the statement simply succeeds:
the ordering, the high keys and the downlinks are all consistent. It raises an ERROR instead if
they are not - that is the whole interface.`,
      systemsLens: code`
A B-tree is a shallow, wide, sorted map whose shape is dictated by one number: how many keys fit in
a block. Fanout is what makes the structure cheap - three block reads for 100k keys, four for
millions - and it is why every disk-oriented index (InnoDB's clustered index, LMDB, SQLite, the
index blocks of an SSTable) is a wide tree rather than a binary one. Two consequences carry over to
any system you build: bigger keys cost you fanout, so they cost you height and cache footprint on
every lookup, which is why hashed or truncated keys are common; and the sorted, linked leaf level
is why a B-tree can answer range and ordered queries at all, unlike a hash index. The index stores
a physical address (the heap ctid), not the row - the classic trade between a clustered store
(fewer hops, expensive updates) and a heap plus secondary indexes (cheap updates, one extra hop).`,
      challenge: code`
Predict the height of an index on (wide, payload) before you build it, then check with bt_metap.
Then re-read the wide index's leaf item size and work out how many rows it would take to add a
fourth level - and confirm that the int index would need tens of millions.`,
    },
    {
      slug: "index-only-scan-needs-visibility-map",
      tags: ["index-scans", "visibility-map", "explain", "btree", "vacuum"],
      title: "Index-only scans: covering the columns is only half of it",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 15,
      prerequisites: [
        "btree-page-anatomy",
        "visibility-map-and-index-only-scans",
      ],
      overview: code`
An index-only scan needs two independent things to be true: the index must contain every column the
query touches, and the heap pages behind the entries must be marked all-visible. Break either one
and the executor goes to the heap. Here you will watch the same 2000-row query cost 8 buffers, then
1340 buffers when you add a column the index does not carry, then 144 buffers when a plain INSERT
leaves fresh pages unmarked - three very different queries that all say "index" in the plan.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 20 "Index Scans" (section "Index-Only Scans"); Chapter 6 "Vacuum and Autovacuum" (section "Vacuum")`,
      readingNotes: code`
Chapter 20 explains index-only scans and their need to verify heap visibility; Chapter 6 explains
VACUUM's role in setting visibility information. This experiment holds the index constant while
changing covered columns and visibility-map bits, then measures Heap Fetches and buffers. Read the
chapters before running it or use them afterward to interpret the page-level evidence.`,
      syntaxBreakdown: code`
### In plain terms

An index-only scan can answer a query without visiting the table only when the index contains every
needed column and PostgreSQL already knows the heap page is all-visible. This lesson breaks each
condition separately: first by asking for an uncovered column, then by inserting fresh rows without
vacuuming. Heap Fetches and buffer counts show exactly when the executor must return to the table.

### What you are learning

- **Covering indexes:** An index can carry extra payload columns so a query need not fetch the heap.
- **Visibility map:** PostgreSQL records which heap pages need no per-row visibility checks.
- **Heap Fetches:** An index-only plan may still visit the heap for pages lacking the all-visible bit.
- **VACUUM coupling:** Vacuum restores visibility bits after writes, changing I/O without changing the index.

### Piece by piece

- **CREATE INDEX ix_ios_tenant_amount ON ... (tenant, amount)** (B-tree DDL)
  - What it is: It creates a searchable index whose key columns are tenant and amount.
  - What it does here: It covers count(amount) for a tenant filter but not count(note).
  - What it gives us: A possible Index Only Scan for the first query and a heap-requiring path for the second.
- **VACUUM (ANALYZE)** (maintenance command)
  - What it is: VACUUM marks eligible pages all-visible; ANALYZE refreshes planner statistics.
  - What it does here: It prepares the initial table and later restores bits after inserting rows.
  - What it gives us: all_visible near heap_pages and Heap Fetches of zero when coverage is complete.
- **pg_visibility_map_summary(rel)** (extension function)
  - What it is: It counts heap pages marked all_visible and all_frozen.
  - What it does here: It measures the visibility state before and after INSERT and VACUUM.
  - What it gives us: all_visible and all_frozen counts to compare with heap_pages.
- **EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)** (plan command and options)
  - What it is: It executes the query, reports page activity, and hides planner cost numbers.
  - What it does here: It compares index-only and heap-fetching executions.
  - What it gives us: Index Only Scan or Index Scan, Heap Fetches, and shared buffer totals.
- **enable_seqscan and enable_bitmapscan = off** (session planner settings)
  - What they are: Path controls that discourage sequential and bitmap scans.
  - What they do here: They keep all comparisons on the index path.
  - What they give us: An apples-to-apples view of whether the heap must be visited.
- **Heap Fetches** (EXPLAIN metric)
  - What it is: The number of index entries requiring a heap visit for visibility or uncovered data.
  - What it does here: It is zero for fully visible covered pages, then rises after the insert.
  - What it gives us: Direct evidence that an index-only plan still depends on the visibility map.
- **generate_series and repeat** (SQL functions)
  - What they are: generate_series emits IDs; repeat creates 60-character note values.
  - What they do here: They load the table with predictable rows and page density.
  - What they give us: Enough heap pages to compare all-visible and fresh-page behavior.
`,
      setup: code`
drop table if exists ix_ios;
create table ix_ios(id int primary key, tenant int, amount int, note text)
  with (autovacuum_enabled = off);
insert into ix_ios select g, g % 50, g, repeat('n', 60) from generate_series(1, 100000) g;
create index ix_ios_tenant_amount on ix_ios(tenant, amount);
vacuum (analyze) ix_ios;`,
      code: code`
set enable_seqscan = off;
set enable_bitmapscan = off;

select pg_relation_size('ix_ios') / 8192 as heap_pages, all_visible, all_frozen
from pg_visibility_map_summary('ix_ios');

-- 1. Every column the query mentions is in the index, and every page is all-visible.
explain (analyze, buffers, costs off) select count(amount) from ix_ios where tenant = 7;

-- 2. Same rows, same index, one extra column that the index does not carry.
explain (analyze, buffers, costs off) select count(note) from ix_ios where tenant = 7;

-- 3. Now break the other half: insert rows and do not vacuum.
insert into ix_ios select g, g % 50, g, repeat('n', 60) from generate_series(100001, 110000) g;
select pg_relation_size('ix_ios') / 8192 as heap_pages, all_visible
from pg_visibility_map_summary('ix_ios');
explain (analyze, buffers, costs off) select count(amount) from ix_ios where tenant = 7;

-- 4. VACUUM sets the bits and the same plan gets cheap again.
vacuum ix_ios;
select all_visible from pg_visibility_map_summary('ix_ios');
explain (analyze, buffers, costs off) select count(amount) from ix_ios where tenant = 7;`,
      expectedResult: code`
After the load and VACUUM the heap is 1334 pages and all_visible = 1334 (all_frozen 0): every page
vouched for.

1. The first query is an Index Only Scan using ix_ios_tenant_amount, rows = 2000, Heap Fetches: 0,
   Buffers: shared hit=1 read=7 - eight 8 KB pages for 2000 rows, because the index alone answered
   it. (The hit/read split depends on what is already cached; the total is what matters.)

2. Adding count(note) changes one thing: note is not in the index. The plan becomes a plain
   Index Scan using the same index over the same 2000 rows, with Buffers: shared hit=1340 and
   roughly twice the execution time. The 1332 extra buffers are 2000 separate visits to the heap,
   one per matching row, scattered over the table. Same index, same rows, 160x the I/O.

3. INSERT of 10000 rows grows the heap to 1467 pages, and all_visible drops to 1333: the new pages
   have never been vacuumed, and the page the insert first appended to lost its bit. The query is
   still an Index Only Scan, but now reports Heap Fetches: 200 and Buffers: shared hit=144.
   Exactly the 200 new tenant = 7 rows landed on unmarked pages, and each one forced a heap read.

4. VACUUM restores all_visible = 1467, and the identical query is back to Heap Fetches: 0 with
   about 10 buffers. Nothing about the index changed between step 3 and step 4 - only the
   visibility map did.`,
      systemsLens: code`
"Index-only" is not a property of the index; it is a property of the index plus a cache of
visibility decisions. That is the general shape of every covering-index or materialised-projection
optimisation: you can serve a read from a summary only while a second structure vouches that the
summary is not stale. The failure mode is the same everywhere - the summary decays under writes,
and it decays by page, not by row, so a trickle of scattered writes can revoke a large fraction of
it. It also explains the operational coupling that surprises people: vacuum frequency is a query
latency knob, because a table that stops being vacuumed silently converts its cheapest plans into
its most expensive ones without the plan shape changing at all.`,
      challenge: code`
Add note to the index with INCLUDE (note) and rerun query 2. It becomes an Index Only Scan, and the
index grows several times over. Then compute the break-even: how many of those queries per second
justify the extra bytes on every insert and every buffer-cache page?`,
    },
    {
      slug: "create-index-concurrently-and-invalid-indexes",
      tags: [
        "index-access-methods",
        "ddl",
        "migrations",
        "relation-locks",
        "btree",
      ],
      title: "CREATE INDEX CONCURRENTLY: build, wait, validate, flip",
      difficulty: "advanced",
      safetyLevel: "ddl",
      runIn: "tool",
      sessions: 3,
      estimatedMinutes: 20,
      prerequisites: ["btree-page-anatomy", "ddl-behind-a-long-query"],
      overview: code`
CREATE INDEX takes a lock that blocks every writer for the whole build, so production migrations use
CREATE INDEX CONCURRENTLY instead. The price is that CIC is not one operation but a small protocol:
create the catalog entry, wait, build, wait, validate, then mark valid. Every one of those waits is
a wait for other people's transactions - and if the statement dies in the middle, the half-built
index survives in the catalog with indisvalid = false. In this lesson Session B holds a snapshot
open and you watch Session A's build park in "waiting for old snapshots" with the index already
built but not yet usable; then you make a build fail outright and inspect the wreckage.`,
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 12 "Relation-Level Locks".`,
      syntaxBreakdown: code`
### In plain terms

CREATE INDEX CONCURRENTLY is an online-build protocol rather than one instant operation. One session
holds a repeatable-read snapshot while another builds, so you can watch the builder wait and inspect
the index catalog entry before it becomes valid. A deliberately duplicated value then makes a unique
build fail, leaving an invalid index that must be removed safely.

### What you are learning

- **Concurrent index phases:** Build, validation, and catalog state changes happen in separate phases.
- **Snapshot waits:** An old transaction can delay the moment an index becomes valid for queries.
- **Invalid-index cleanup:** A failed build can leave a physical index entry behind.
- **Online DDL trade-off:** Concurrent builds reduce blocking but require more time, state, and disk.

### Piece by piece

- **CREATE INDEX CONCURRENTLY** (online DDL command)
  - What it is: It builds an index while allowing ordinary reads and writes, using multiple transactions.
  - What it does here: Session A waits for Session B's old snapshot, then completes after B commits.
  - What it gives us: A usable index after the wait, or an invalid catalog row after the duplicate failure.
- **BEGIN ISOLATION LEVEL REPEATABLE READ and COMMIT** (transaction commands)
  - What they are: BEGIN opens a transaction with one stable snapshot; COMMIT ends it and releases resources.
  - What they do here: Session B keeps an old snapshot alive until Session A's build is observable.
  - What they give us: A reproducible waiting phase and the unblocking event.
- **pg_index.indisready and indisvalid** (catalog columns)
  - What they are: Flags saying whether an index is maintained for new writes and valid for query planning.
  - What they do here: They reveal the half-finished state and the failed unique build.
  - What they give us: indisready true with indisvalid false means maintenance happens but the planner cannot trust it.
- **pg_stat_progress_create_index** (progress view)
  - What it is: A live view of index-build phases and progress.
  - What it does here: It identifies the current phase and locker PID while the build waits.
  - What it gives us: phase, current_locker_pid, blocks_done, and blocks_total.
- **pg_stat_activity** (activity view)
  - What it is: One row per backend and its current state or wait event.
  - What it does here: It finds the CREATE INDEX CONCURRENTLY backend waiting on the old snapshot.
  - What it gives us: pid, state, wait_event_type, wait_event, and a shortened query text.
- **pg_relation_size(indexrelid)** (size function)
  - What it is: It returns an index's physical size in bytes.
  - What it does here: It confirms a half-built or invalid index occupies disk.
  - What it gives us: bytes for comparing finished and failed catalog entries.
- **CREATE UNIQUE INDEX CONCURRENTLY** (unique online DDL)
  - What it is: It builds a concurrent index while enforcing uniqueness.
  - What it does here: The duplicate email causes the build to error.
  - What it gives us: An invalid index visible through pg_index and \d output.
- **DROP INDEX CONCURRENTLY** (online cleanup DDL)
  - What it is: It removes an invalid index without taking the blocking lock of an ordinary drop.
  - What it does here: It cleans up ix_cic_email_uk after the failed build.
  - What it gives us: A safe final state; it also cannot run inside a transaction block.
- **\d ix_cic** (psql relation description command)
  - What it is: It prints columns, indexes, and constraints for a table.
  - What it does here: It exposes the failed index in a human-readable table summary.
  - What it gives us: A quick deployment-style check alongside the catalog query.
- **generate_series and ::regclass** (SQL function and cast)
  - What they are: generate_series creates the initial rows; the regclass cast resolves a relation name to its catalog identity.
  - What they do here: They create the build input and let pg_index filters name ix_cic safely.
  - What they give us: A repeatable table and catalog lookups tied to that table.
- **pg_sleep and ILIKE** (SQL function and pattern operator)
  - What they are: pg_sleep pauses a backend; ILIKE performs case-insensitive pattern matching.
  - What they do here: The pause keeps the build wait visible and ILIKE locates its query in activity.
  - What they give us: A window to inspect phase, locker PID, and state.
`,
      setup: code`
drop table if exists ix_cic;
create table ix_cic(id int, email text);
insert into ix_cic select g, 'user' || g || '@example.com' from generate_series(1, 5000) g;
analyze ix_cic;`,
      code: code`
-- Session A
select count(*) as indexes_on_ix_cic from pg_index where indrelid = 'ix_cic'::regclass;
-- Session B
begin isolation level repeatable read;
select count(*) as rows_b_can_see from ix_cic;
-- Session A (blocks until B commits)
create index concurrently ix_cic_email_idx on ix_cic(email);
-- Session B
select pg_sleep(2);
select pid, state, wait_event_type, wait_event, left(query, 42) as query
from pg_stat_activity
where query ilike 'create index concurrently%' and pid <> pg_backend_pid();
-- Session B
select phase, current_locker_pid, blocks_done, blocks_total
from pg_stat_progress_create_index;
-- B's own snapshot predates the catalog row, so B cannot see the index at all.
select indexrelid::regclass as index, indisvalid, indisready,
       pg_relation_size(indexrelid) as bytes
from pg_index where indrelid = 'ix_cic'::regclass;
-- Session C
-- A session with a fresh snapshot sees the half-finished index.
select indexrelid::regclass as index, indisvalid, indisready,
       pg_relation_size(indexrelid) as bytes
from pg_index where indrelid = 'ix_cic'::regclass;
-- Session B
commit;
-- Session A
select indexrelid::regclass as index, indisvalid, indisready,
       pg_relation_size(indexrelid) as bytes
from pg_index where indrelid = 'ix_cic'::regclass;
-- Session A
-- Now make a concurrent build fail: add a duplicate, then demand uniqueness.
insert into ix_cic values (5001, 'user1@example.com');
create unique index concurrently ix_cic_email_uk on ix_cic(email);
-- Session A
select indexrelid::regclass as index, indisvalid, indisready,
       pg_relation_size(indexrelid) as bytes
from pg_index where indrelid = 'ix_cic'::regclass;
\d ix_cic
-- A deploy check: anything invalid left behind?
select indexrelid::regclass as index, indisvalid, indisready
from pg_index where not indisvalid;
-- Session A
drop index concurrently ix_cic_email_uk;
select indexrelid::regclass as index, indisvalid from pg_index where indrelid = 'ix_cic'::regclass;`,
      expectedResult: code`
Session B opens a REPEATABLE READ transaction and reads 5000 rows, which pins a snapshot. Session
A's CREATE INDEX CONCURRENTLY then hangs. Two seconds later pg_stat_activity shows it as
  state = active, wait_event_type = Lock, wait_event = virtualxid
- it is waiting on a virtual transaction id, not on a table lock, which is why it does not show up
in the usual "who is blocking my DDL" queries. pg_stat_progress_create_index names the phase:
  phase = waiting for old snapshots, current_locker_pid = <B's pid>, blocks_done = 35 of 36

Now the two catalog queries. B's returns (0 rows): B's snapshot was taken before the index's
pg_index row existed, and an ordinary query reads the catalog through the transaction snapshot, so
the very transaction that is blocking the build cannot see what it is blocking. Session C, with a
fresh snapshot, sees it:
  index            | indisvalid | indisready | bytes
  ix_cic_email_idx | f          | t          | 221184
That state is the important one: the index is fully built (221184 bytes) and is already being
maintained by every writer (indisready = t), but no query may use it (indisvalid = f), because A
cannot prove that B's older snapshot would agree with its contents.

The moment B commits, A's statement returns and the same query shows indisvalid = t. One idle
transaction in another session held a production index build hostage for as long as it stayed open.

The unique build fails instead:
  ERROR:  could not create unique index "ix_cic_email_uk"
  DETAIL:  Key (email)=(user1@example.com) is duplicated.
and the failed index is still in the catalog: indisvalid = f, indisready = f, 0 bytes. \d ix_cic
prints it as
  "ix_cic_email_uk" UNIQUE, btree (email) INVALID
The "where not indisvalid" query - the check every deploy should run after a failed migration -
returns exactly that one row. This build died before indisready was set, so it costs nothing on
writes; a CIC cancelled later, in the validation wait, leaves indisvalid = f with indisready = t,
an index that every INSERT pays for and no SELECT may use. DROP INDEX CONCURRENTLY removes it and
leaves only the valid ix_cic_email_idx.`,
      systemsLens: code`
CIC is an online schema change, and it shows the standard recipe: build the new structure beside
the old one, keep it up to date with live writes, then flip a visibility bit once you can prove
every in-flight reader agrees. Every online migration system - a rolling index build, a
double-write to a new column, a shadow table, a repartitioning job - has this same
build/backfill/validate/flip shape, and the same weakness: the flip must wait for the oldest
concurrent reader, so a single long-running or forgotten transaction can stall it indefinitely.
The invalid index is the other lesson: a multi-step protocol that is not a transaction leaves
partial states behind, so the catalog needs a flag for "exists but do not use it yet", and your
runbook needs a step that looks for those flags after a failed deploy.`,
      challenge: code`
Repeat the first experiment but cancel A with pg_cancel_backend from B while A is in "waiting for
old snapshots", and confirm you are left with indisready = t, indisvalid = f - the expensive kind
of leftover, an index that costs every writer and serves no reader. Then try to fix it two ways:
REINDEX INDEX CONCURRENTLY (which revalidates it) and DROP INDEX CONCURRENTLY plus a fresh build.`,
      caution: code`
The second half deliberately fails a DDL statement and leaves an invalid index until the final DROP.
Run it only in the lab.`,
    },
    {
      slug: "partial-and-covering-indexes",
      tags: ["index-scans", "query-planning", "explain", "btree"],
      title: "Index less, or index more: partial and covering indexes",
      difficulty: "intermediate",
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 20,
      prerequisites: ["index-only-scan-needs-visibility-map"],
      overview: code`
Two ways to change what an index costs. A partial index stores only the rows matching a predicate -
here 1% of the table, for 1/43 of the bytes - but the planner may only use it when it can prove your
WHERE clause implies that predicate. A covering index (INCLUDE) stores extra columns in the leaf
entries so the heap never has to be visited, and charges you for them on every insert. You will
measure both: sizes in bytes, and the same query at 1003 buffers and at 6.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 19 "Index Access Methods" (section "Indexing Engine Interface"); Chapter 20 "Index Scans" (section "Index-Only Scans")`,
      readingNotes: code`
Chapter 19 explains index access-method properties and Chapter 20 explains index-only scans. This
lesson applies those ideas to partial predicates and INCLUDE payload columns, measuring both the
smaller hot-set index and the wider covering index. Read the chapters before or after; the plan and
size comparisons show the trade-off the book describes.`,
      syntaxBreakdown: code`
### In plain terms

A partial index stores only rows matching a predicate, while a covering index stores extra columns
so a query can answer from the index alone. PostgreSQL uses a partial index only when it can prove
the query condition implies the index predicate; logically equivalent wording may fail that proof.
You will measure the saved index space, the I/O benefit of INCLUDE, and the write cost of carrying it.

### What you are learning

- **Partial indexes:** Indexing only a hot subset can save storage and maintenance work.
- **Predicate implication:** The planner needs a syntactic proof that the query is covered.
- **INCLUDE columns:** Payload columns can satisfy reads but cannot search or order the index.
- **Read/write trade-off:** Covering data reduces heap reads while enlarging every index update.

### Piece by piece

- **CREATE INDEX ... WHERE status = 'pending'** (partial-index DDL)
  - What it is: It stores entries only for rows satisfying the WHERE predicate.
  - What it does here: It keeps 1000 pending rows instead of all 100000 orders.
  - What it gives us: A small index that can answer matching pending queries.
- **EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)** (plan command and options)
  - What it is: It executes the query, reports buffers, and hides cost numbers.
  - What it does here: It tests when the partial and covering indexes are selected.
  - What it gives us: Index Only Scan or Seq Scan, Heap Fetches, and page totals.
- **Predicate implication** (planner reasoning)
  - What it is: A proof that every row requested by a query belongs to the indexed subset.
  - What it does here: status = 'pending' matches the predicate, while status <> 'done' is logically equivalent for this data but not proved syntactically.
  - What it gives us: The presence or absence of the partial index in the plan.
- **CREATE INDEX ... INCLUDE (amount)** (covering-index DDL)
  - What it is: It adds amount as non-key payload on leaf entries.
  - What it does here: It lets sum(amount) be answered from ix_orders_tenant_cov.
  - What it gives us: Index Only Scan and lower buffers, at the cost of a larger index.
- **pg_relation_size and pg_size_pretty** (size functions)
  - What they are: The first returns bytes; the second formats bytes for people.
  - What they do here: They compare full, partial, key-only, and covering index sizes.
  - What they give us: Byte and kB totals that quantify storage and cache cost.
- **CREATE INDEX ... ON tenant** (key-only index DDL)
  - What it is: It indexes tenant without storing amount as payload.
  - What it does here: It finds matching rows but requires heap access for sum(amount).
  - What it gives us: The baseline Bitmap Heap Scan and its scattered page reads.
- **VACUUM (ANALYZE)** (maintenance command)
  - What it is: It marks visible pages and refreshes planner statistics.
  - What it does here: It makes the covering index's index-only result have zero Heap Fetches.
  - What it gives us: A fair buffer comparison between the two index designs.
- **INCLUDE columns and equality search** (index limitation)
  - What they are: Included fields are stored data, not ordering keys.
  - What they do here: amount = 700 cannot use the tenant index as a search structure.
  - What they give us: A Seq Scan proving that coverage is not the same as lookup ability.
- **generate_series, repeat, and SUM** (setup function and SQL aggregate)
  - What they are: generate_series creates rows, repeat supplies note padding, and SUM adds amount values.
  - What they do here: They build the measured table and the covering query's aggregate.
  - What they give us: Predictable 100000-row size and a query that needs the amount column.
`,
      setup: code`
drop table if exists ix_orders;
create table ix_orders(id int primary key, tenant int, status text, amount int, note text)
  with (autovacuum_enabled = off);
insert into ix_orders
select g, g % 100, case when g % 100 = 0 then 'pending' else 'done' end, g, repeat('n', 50)
from generate_series(1, 100000) g;
create index ix_orders_status on ix_orders(status);
create index ix_orders_pending on ix_orders(status) where status = 'pending';
create index ix_orders_tenant on ix_orders(tenant);
vacuum (analyze) ix_orders;`,
      code: code`
-- 1000 of the 100000 rows are 'pending'. Compare the full index with the partial one.
select relname, pg_relation_size(oid) as bytes, pg_size_pretty(pg_relation_size(oid)) as pretty
from pg_class where relname like 'ix_orders%' order by relname;

-- Drop the full index so the partial one is the only candidate.
drop index ix_orders_status;

explain (analyze, buffers, costs off) select count(*) from ix_orders where status = 'pending';

-- The proof has to succeed syntactically. The first two ask for the same 1000 rows.
explain (costs off) select count(*) from ix_orders where status = 'pending' and amount > 50000;
explain (costs off) select count(*) from ix_orders where status <> 'done';
explain (costs off) select count(*) from ix_orders where status = 'done';

-- Covering: the same query with a key-only index, then with INCLUDE.
explain (analyze, buffers, costs off) select sum(amount) from ix_orders where tenant = 7;

create index ix_orders_tenant_cov on ix_orders(tenant) include (amount);
vacuum (analyze) ix_orders;

explain (analyze, buffers, costs off) select sum(amount) from ix_orders where tenant = 7;

select relname, pg_relation_size(oid) as bytes, pg_size_pretty(pg_relation_size(oid)) as pretty
from pg_class where relname in ('ix_orders_tenant', 'ix_orders_tenant_cov') order by relname;

-- INCLUDE columns are payload, not keys: they cannot drive a search or an ordering.
explain (costs off) select id from ix_orders where amount = 700;`,
      expectedResult: code`
Sizes first. The full index on status is 712704 bytes (696 kB) because it holds all 100000 entries;
the partial index holding only the 1000 'pending' rows is 16384 bytes (16 kB). Same column, same
usefulness for the query you actually run, 43x less to build, cache, and vacuum. (The heap is
9880 kB and the primary key 2208 kB, for scale.)

With the full index dropped, count(*) where status = 'pending' is an Index Only Scan using
ix_orders_pending, rows = 1000, Heap Fetches: 0, Buffers: shared hit=1 read=1 - the whole answer is
two pages. Note there is no Index Cond line at all: the planner proved the query's restriction
implies the predicate, so nothing is left to check at runtime.

The proofs then split:
  status = 'pending' and amount > 50000  ->  Index Scan using ix_orders_pending,
                                             Filter: (amount > 50000)
  status <> 'done'                       ->  Seq Scan, Filter: (status <> 'done'::text)
  status = 'done'                        ->  Seq Scan, Filter: (status = 'done'::text)
The middle one is the interesting failure: <> 'done' selects exactly the same 1000 rows as
= 'pending', but the planner reasons syntactically about implication and will not use the index.
A partial index is only as good as the queries whose text matches its predicate.

Covering next. With only ix_orders_tenant(tenant), sum(amount) where tenant = 7 is a
Bitmap Heap Scan, Heap Blocks: exact=1000, Buffers: shared hit=1000 read=3, Execution Time ~2.5 ms:
1000 matching rows scattered one per page, so a thousand page reads. Adding INCLUDE (amount) turns
the same query into an Index Only Scan using ix_orders_tenant_cov, Heap Fetches: 0, Buffers:
shared hit=1 read=5, ~0.6 ms - 1003 buffers down to 6, roughly four times faster.

The bill: ix_orders_tenant is 745472 bytes (728 kB), ix_orders_tenant_cov is 2277376 bytes
(2224 kB). Carrying a 4-byte payload tripled the index, and every insert and update now maintains
both. Finally, amount = 700 is a Seq Scan: an INCLUDE column is stored, not indexed, so it can
answer a query but never find one.`,
      systemsLens: code`
These are the two directions of the same dial: an index is a materialised, sorted projection of
your table, and you choose how many rows and how many columns of the projection to keep. Narrow it
with a predicate and you pay almost nothing for a "find the 1000 interesting rows" query - which is
exactly how work queues, outboxes, and soft-delete tables should be indexed, since the hot set is
tiny and permanent. Widen it with payload columns and you buy read locality with write
amplification, the same trade a columnar store makes when it duplicates a column into a sorted
projection or a NoSQL store makes when it denormalises a view into its own table. The partial
index's implication proof is worth internalising: any system with a rewrite-based optimiser can
only use a materialisation it can prove is applicable, so two logically identical queries can have
wildly different costs, and the fix is to make the query text match the structure.`,
      challenge: code`
Widen the predicate: rebuild the partial index WHERE status in ('pending','retry') and check that
status = 'pending' still uses it (a narrower query implies a wider predicate) while status <>
'done' still does not. Then measure the write side: time 10000 inserts with and without the
covering index in place.`,
    },
    {
      slug: "index-bloat-from-churn",
      tags: [
        "bloat",
        "rebuilding-tables-and-indexes",
        "btree",
        "vacuum",
        "write-amplification",
      ],
      title: "Index bloat is a steady state, and REINDEX is how you leave it",
      difficulty: "intermediate",
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 20,
      prerequisites: ["btree-page-anatomy", "vacuum-reclaims-in-place"],
      overview: code`
Update an indexed column and the B-tree cannot update in place either: it inserts a new entry, and
the old one stays until VACUUM removes it, by which point the page has split. Here you churn the
same 100000 rows twice and watch the index double in size while its leaf pages end up less than
half full, then watch the second round of exactly the same churn cost nothing more - bloat
converges instead of growing without bound. Then REINDEX CONCURRENTLY packs it back down, into a
new file.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 5 "Page Pruning and HOT Updates" (section "Page Pruning for Indexes"); Chapter 8 "Rebuilding Tables and Indexes" (sections "Full Vacuuming", "Other Rebuilding Methods"); Chapter 25 "B-tree" (section "Page Layout")`,
      readingNotes: code`
Chapter 5 explains dead index entries and page pruning, Chapter 8 explains rebuilding, and Chapter
25 supplies B-tree page-layout context. This experiment measures bloat after indexed-column churn,
shows why VACUUM cannot shrink the file, and then uses REINDEX CONCURRENTLY to replace it. Read the
chapters after the first measurements so density and fragmentation have visible examples.`,
      syntaxBreakdown: code`
### In plain terms

Updating an indexed value adds a new index entry; it cannot simply overwrite the old entry because
other transactions may still need the old row version. Vacuum can remove dead entries, but it does
not generally return the already-sized index file to the operating system. You will measure the
steady-state holes caused by churn and then watch a concurrent rebuild pack a fresh copy.

### What you are learning

- **Index bloat:** Dead entries and page splits leave a larger, less dense structure after updates.
- **Density versus file size:** Removing dead entries does not necessarily reduce the relation's bytes.
- **Fragmentation:** Leaf links can visit pages in an order that is no longer sequential on disk.
- **Concurrent rebuilding:** REINDEX CONCURRENTLY creates and swaps a replacement while allowing access.

### Piece by piece

- **pgstatindex('ix_churn_k')** (pgstattuple extension function)
  - What it is: It scans a B-tree and reports structural and density metrics.
  - What it does here: It measures the fresh index, both churn rounds, and the rebuilt result.
  - What it gives us: index_size, tree_level, leaf_pages, empty_pages, deleted_pages, avg_leaf_density, and leaf_fragmentation.
- **UPDATE of indexed column k** (DML operation)
  - What it is: It changes the value used as an index key.
  - What it does here: It rewrites half the keys to scattered positions, causing new entries and page splits.
  - What it gives us: A larger, lower-density index for pgstatindex to measure.
- **VACUUM** (index cleanup command)
  - What it is: It removes index entries whose row versions are no longer needed.
  - What it does here: It clears dead entries between churn rounds but leaves the relation file size.
  - What it gives us: A clean measure of persistent empty space rather than live dead tuples.
- **pg_class.relfilenode** (catalog column)
  - What it is: The physical file identity for a relation.
  - What it does here: It is read before and after the rebuild.
  - What it gives us: A changed number proving the index was replaced by a new file.
- **REINDEX INDEX CONCURRENTLY** (online rebuild command)
  - What it is: It constructs a packed replacement index and swaps it in through a concurrent protocol.
  - What it does here: It reduces the bloated index to its original page count without blocking reads and writes.
  - What it gives us: Smaller index_size, higher avg_leaf_density, low fragmentation, and a new relfilenode.
- **pg_index.indisvalid** (catalog flag)
  - What it is: It says whether the planner may trust an index.
  - What it does here: The final query verifies the rebuilt index is valid.
  - What it gives us: indisvalid = true for the surviving index.
- **generate_series and repeat** (SQL functions)
  - What they are: generate_series emits IDs; repeat creates fixed-width padding text.
  - What they do here: They create 100000 keys and predictable row sizes for the churn test.
  - What they give us: A repeatable baseline for index size and leaf density.
`,
      setup: code`
drop table if exists ix_churn;
create table ix_churn(id int primary key, k int, pad text) with (autovacuum_enabled = off);
insert into ix_churn
select g, (g * 7919) % 100000, repeat('p', 40) from generate_series(1, 100000) g;
create index ix_churn_k on ix_churn(k);
vacuum (analyze) ix_churn;`,
      code: code`
select index_size, tree_level, leaf_pages, empty_pages, deleted_pages,
       avg_leaf_density, leaf_fragmentation
from pgstatindex('ix_churn_k');

-- Round 1: rewrite the indexed column of half the rows to scattered new values.
update ix_churn set k = (k * 31 + 17) % 100000 where id % 2 = 0;
vacuum ix_churn;
select index_size, leaf_pages, deleted_pages, avg_leaf_density, leaf_fragmentation
from pgstatindex('ix_churn_k');

-- Round 2: exactly the same amount of churn again.
update ix_churn set k = (k * 31 + 17) % 100000 where id % 2 = 0;
vacuum ix_churn;
select index_size, leaf_pages, deleted_pages, avg_leaf_density, leaf_fragmentation
from pgstatindex('ix_churn_k');

-- Rebuild it. Note that the file identity changes.
select relfilenode from pg_class where relname = 'ix_churn_k';
reindex index concurrently ix_churn_k;
select relfilenode from pg_class where relname = 'ix_churn_k';

select index_size, leaf_pages, deleted_pages, avg_leaf_density, leaf_fragmentation
from pgstatindex('ix_churn_k');
select indexrelid::regclass as index, indisvalid from pg_index where indrelid = 'ix_churn'::regclass;`,
      expectedResult: code`
Freshly built, the index is 2260992 bytes, tree_level 1, 274 leaf pages, 0 empty and 0 deleted
pages, avg_leaf_density 89.83 and leaf_fragmentation 0: a bulk build packs leaves to the 90%
fillfactor and lays them out in key order.

After round 1 (50000 updates, then VACUUM) it is 4513792 bytes with 547 leaf pages:
  index_size | leaf_pages | deleted_pages | avg_leaf_density | leaf_fragmentation
     4513792 |        547 |             0 |            43.92 |              49.91
The index doubled and the density halved. Every update inserted a new entry at a random point,
splitting a full page into two half-full ones; VACUUM then removed the dead entries but left the
pages exactly where they were, so the same 100000 live entries now occupy twice the pages at 44%
occupancy. leaf_fragmentation 49.91 says the leaf chain jumps backwards through the file about half
the time, so a range scan no longer reads the file sequentially. (avg_leaf_density counts index
tuples still on the page, so if another long transaction is open and VACUUM cannot remove the dead
entries yet, this number reads much higher for the same 547 pages.)

After round 2 - the same 50000 updates again - nothing gets worse:
     4513792 |        547 |             0 |            45.15 |              49.91
This is the point of the lesson. Bloat is not a leak; it converges. The holes round 1 opened are
exactly what round 2 reuses, so a table under steady random churn settles at some multiple of its
packed size (here 2x, half of it holes) and stays there.

REINDEX INDEX CONCURRENTLY moves the index to a new relfilenode (a small integer change, e.g.
18936 -> 18937: it is a new file, built beside the old one and swapped in) and returns it to
2260992 bytes, 274 leaf pages, avg_leaf_density 89.83, leaf_fragmentation 0, indisvalid = t. Half
the file was recoverable, and recovering it needed a full rebuild - VACUUM alone never gives index
bytes back to the filesystem.`,
      systemsLens: code`
Any structure that cannot overwrite in place converges to a steady state where a fixed fraction of
its space is garbage: B-tree pages here, SSTable levels in an LSM tree, the free lists of a slab
allocator, a JVM heap between collections. The engineering questions are always the same two - what
is the steady-state multiple, and does the reclaim path require rewriting the structure? For a
PostgreSQL B-tree the answers are "roughly 2x under random churn" and "yes, REINDEX", which is why
capacity planning should budget for the bloated size rather than the packed one, and why the
concurrent variant matters: the only way to compact is to build a second copy, so you need the disk
headroom and an online swap protocol. The fragmentation number is the hidden cost: the tree is
still correct and still shallow, but its leaves stopped being sequential, so range scans quietly
turn from streaming reads into random ones.`,
      challenge: code`
Repeat the churn with an append-only pattern instead (set k = k + 100000, three times, vacuuming
between): the index still grows to about 4x, but VACUUM reports hundreds of deleted_pages with only
274 live leaves and density back at 89.83. Whole ranges of keys died at once, so the waste shows up
as whole empty pages rather than as low density. Which of the two shapes does your workload have?`,
    },
    {
      slug: "unique-index-enforcement-under-concurrency",
      tags: [
        "unique-constraints",
        "btree",
        "optimistic-concurrency",
        "leases",
        "index-access-methods",
      ],
      title: "Uniqueness is a B-tree property: a partial unique index as a lease",
      difficulty: "advanced",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 20,
      prerequisites: ["unique-constraint-race", "partial-and-covering-indexes"],
      overview: code`
A UNIQUE constraint has no storage of its own: it is a row in pg_constraint pointing at a unique
B-tree index, and the index is what actually decides. Because the decision lives in the index, it
can be scoped by a predicate - a partial unique index enforces "at most one active row per
resource", which is a single-holder lease. Here two sessions both check that a shard is free, both
try to claim it, and the index - not the check - is what stops the second one.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 19 "Index Access Methods" (section "Indexing Engine Interface"); Chapter 12 "Relation-Level Locks" (section "Locks on Transaction IDs")`,
      readingNotes: code`
Chapter 19 explains the indexing-engine uniqueness property, and Chapter 12 explains waits on a
transaction ID when a conflicting change is uncommitted. This experiment makes a partial unique
index act as a one-holder lease and observes the losing insert wait and error. Read both chapters
before or after; use the live wait to connect the index invariant to transaction locking.`,
      syntaxBreakdown: code`
### In plain terms

Two clients can both observe that a resource is free, so a check followed by an insert is not enough
to enforce one owner. A partial unique B-tree puts the rule inside the database's insert path: only
rows marked active participate, and one wins while the other waits for its transaction's outcome.
This lesson also demonstrates a safe release-and-claim handover in one transaction.

### What you are learning

- **Unique-index enforcement:** The index, not a separate check query, serializes competing claims.
- **Partial uniqueness:** A predicate limits the rule to active rows while allowing many released rows.
- **Transaction-ID wait:** A conflicting uncommitted entry makes the second insert wait before it errors.
- **Identity sequences:** Generated IDs are not rolled back, so failed attempts leave gaps.

### Piece by piece

- **GENERATED ALWAYS AS IDENTITY** (table column definition)
  - What it is: It obtains each id from a sequence managed by PostgreSQL.
  - What it does here: It labels rows without the sessions choosing IDs.
  - What it gives us: A visible hole after the blocked insert loses, because sequence allocation is not transactional.
- **CREATE UNIQUE INDEX ... WHERE state = 'active'** (partial unique-index DDL)
  - What it is: It enforces uniqueness only for rows satisfying the predicate.
  - What it does here: It permits at most one active row per resource.
  - What it gives us: The ix_uniq_one_active index that decides the race.
- **pg_constraint.conindid and pg_index.indisunique/indisprimary** (catalog columns)
  - What they are: conindid links a declared constraint to its backing index; the pg_index flags describe index properties.
  - What they do here: The catalog queries contrast the primary-key constraint with the bare partial unique index.
  - What they give us: Constraint name/type, backing index, uniqueness, primary status, and predicate.
- **pg_get_expr(indpred, indrelid)** (catalog expression function)
  - What it is: It reconstructs a stored index predicate as readable SQL.
  - What it does here: It prints state = active for the partial index.
  - What it gives us: The exact subset in which uniqueness applies.
- **BEGIN, COMMIT, and ROLLBACK** (transaction commands)
  - What they are: They start, publish, or abandon a transaction's changes.
  - What they do here: A holds the winning insert, B waits, then B rolls back; later release and claim are one transaction.
  - What they give us: The unblock event and an atomic handover with no two active owners.
- **SELECT ... FOR UPDATE** (not used; challenge variation)
  - What it is: A row-locking read that blocks competing writers.
  - What it does here: The challenge can compare explicit locking with the index-invariant approach.
  - What it gives us: A different serialization mechanism to contrast with unique enforcement.
- **pg_stat_activity** (activity view)
  - What it is: A live row for each backend and its wait state.
  - What it does here: Session A finds B waiting on the unique insert.
  - What it gives us: wait_event_type = Lock and wait_event = transactionid.
- **pg_stat_user_indexes** (index usage view)
  - What it is: Per-table index scan and tuple counters.
  - What it does here: It reports the two explicit probes and confirms enforcement itself is not an idx_scan.
  - What it gives us: idx_scan, idx_tup_read, and idx_tup_fetch for each index.
- **ON CONFLICT DO NOTHING** (challenge clause)
  - What it is: It turns a uniqueness conflict into a skipped insert instead of an error.
  - What it does here: It provides a lease-claim variation where no inserted row signals a lost race.
  - What it gives us: An idempotent claim primitive to compare with the blocking insert.
- **expires_at and a sequence-backed token** (challenge lease fields)
  - What they are: expires_at records a time limit; a monotonically increasing token identifies claim order.
  - What they do here: They support reclaiming an expired lease and fencing stale owners.
  - What they give us: A token downstream services can compare before accepting work.
`,
      setup: code`
drop table if exists ix_uniq;
create table ix_uniq(id int generated always as identity primary key,
                     resource text, owner text, state text);
create unique index ix_uniq_one_active on ix_uniq(resource) where state = 'active';
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-a', 'released');`,
      code: code`
-- Session A
select c.conname, c.contype, c.conindid::regclass as backing_index
from pg_constraint c where c.conrelid = 'ix_uniq'::regclass;
select indexrelid::regclass as index, indisunique, indisprimary,
       pg_get_expr(indpred, indrelid) as predicate
from pg_index where indrelid = 'ix_uniq'::regclass order by 1;
-- Session A
begin;
select count(*) as active_now from ix_uniq where resource = 'shard-1' and state = 'active';
-- Session B
begin;
select count(*) as active_now from ix_uniq where resource = 'shard-1' and state = 'active';
-- Session A
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-a', 'active');
-- Session B (blocks until A commits)
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-b', 'active');
-- Session A
select pg_sleep(1);
select pid, state, wait_event_type, wait_event from pg_stat_activity
where wait_event_type = 'Lock' and query ilike 'insert into ix_uniq%';
-- Session A
commit;
-- Session B
rollback;
select id, resource, owner, state from ix_uniq order by id;
-- Session A
-- The rule only covers the indexed subset: any number of non-active rows may coexist.
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-b', 'released');
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-c', 'released');
select state, count(*) from ix_uniq where resource = 'shard-1' group by state order by state;
-- Session A
-- Handing the lease over is one transaction: release, then claim.
begin;
update ix_uniq set state = 'released' where resource = 'shard-1' and state = 'active';
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-b', 'active');
commit;
select id, owner, state from ix_uniq where resource = 'shard-1' and state = 'active';
-- Session A
select indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
from pg_stat_user_indexes where relname = 'ix_uniq' order by indexrelname;`,
      expectedResult: code`
The catalog shows one constraint, ix_uniq_pkey (contype p), backed by the index of the same name -
and ix_uniq_one_active is a unique index with no constraint row at all, carrying the predicate
(state = 'active'::text). Both have indisunique = t. The constraint is bookkeeping; the index is
the mechanism.

Both sessions then read active_now = 0 - a correct answer to a question that is already stale.
A inserts and returns immediately. B's insert does not fail and does not succeed: it blocks, and
pg_stat_activity shows it as wait_event_type = Lock, wait_event = transactionid. The B-tree found a
conflicting entry belonging to an uncommitted transaction, so the only thing it can do is wait for
that transaction's fate. When A commits, B gets

  ERROR:  duplicate key value violates unique constraint "ix_uniq_one_active"
  DETAIL:  Key (resource)=(shard-1) already exists.

Note the "constraint" named in the error is a bare partial index with no pg_constraint row at all.
After B's rollback the table holds id 1 (node-a, released, from setup) and id 2 (node-a, active) -
and B's id 3 is gone forever, because identity values come from a sequence and a sequence does not
roll back. The next successful insert is id 4, so the surviving ids have a hole in them: never read
them as a count or as a gapless order.

Two more released rows for the same resource insert without complaint (released 3, active 1): rows
outside the predicate are not in the index, so the rule does not apply to them. The handover then
works because both statements are in one transaction - the update removes the old index entry and
the insert adds the new one atomically, so there is no instant at which shard-1 has two active
owners, and none at which it has zero. Afterwards the single active row is id 6, owner node-b.

pg_stat_user_indexes ends with idx_scan = 2 on ix_uniq_one_active - the two count(*) probes, both
of which read nothing (idx_tup_read = 0), since at their snapshots there was no active row - and
idx_scan = 0 on ix_uniq_pkey, which nothing in this lesson searched. Every insert in the lesson
consulted the unique index, yet enforcement contributes nothing to idx_scan: it is not a scan, it
happens inside the insert path when the new entry is placed on its leaf page.`,
      systemsLens: code`
This is mutual exclusion built out of a data invariant rather than a lock manager, and it is the
most robust way to do leader election or resource ownership in a system that already has a
database. The winner is decided by whoever gets their entry onto the leaf page first, and the loser
finds out by getting an error rather than by reading state - which is the crucial difference from
check-then-act, whose check was already stale when it returned. Two things carry over. First, "at
most one" is a global invariant, so it has to be serialized somewhere: here it is serialized per
key at one index page, which is why unique constraints are cheap locally and why they are the
hardest thing to keep when you shard a table across nodes - if the key is not part of the
partitioning key, no node can decide alone. Second, a lease needs more than uniqueness to be safe:
add an expiry column and a monotonically increasing fencing token, because a holder that is merely
paused still owns the row long after its lease has expired in real time.`,
      challenge: code`
Turn the partial unique index into a real lease: add expires_at and a token column defaulting from
a sequence, and write the claim as INSERT ... ON CONFLICT DO NOTHING plus a reclaim that releases
expired rows. Then race two would-be owners to reclaim the same expired lease and confirm the
loser's token is the lower one - that token is what a downstream service should reject.`,
    },
  ],
};
