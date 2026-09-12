# The visibility map is what makes index-only scans possible

slug: visibility-map-and-index-only-scans
category: vacuum
difficulty: intermediate
tags: 
prerequisites: vacuum-reclaims-in-place
safety: writes-data
run-in: tool
sessions: 1
min-version: 16
minutes: 15
revision: 4

## Overview
An index entry does not know whether its row is visible to you - visibility lives in the heap tuple.
So an index-only scan is only possible when something else can vouch that every tuple on a page is
visible to everyone, and that something is the visibility map, one bit per page, set by VACUUM.
Here you will get Heap Fetches: 0, then dirty a scattered 1% of the rows and watch the bit clear for
those pages and the heap fetches come back - then vacuum again and watch it heal.

## Syntax breakdown
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

## Setup
```sql
create table if not exists vac_t(id int primary key, n int, pad text);
alter table vac_t set (autovacuum_enabled = off);
truncate vac_t;
insert into vac_t select g, g, repeat('x', 100) from generate_series(1, 20000) g;
create index if not exists vac_t_n_idx on vac_t(n);
vacuum (analyze) vac_t;
```

## Run
```sql
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
explain (analyze, buffers, costs off) select count(*) from vac_t where n between 1 and 5000;
```

## Expected result
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
table is still 345 pages throughout: the updates were HOT, so this was never about space.

## Systems lens
This is a coarse-grained visibility summary standing in for per-record metadata: one bit per 8 kB
page turns "is this row visible?" into "can I skip asking?", and answering yes is what collapses a
two-level lookup into one. The pattern is everywhere - Bloom filters in front of SSTables, zone
maps and min/max statistics in columnar files, dirty bits in a page cache - and it shares their
failure mode: a summary is only as good as the fraction of it that is still clean, and a small
number of scattered writes can invalidate a large fraction of it. That is why a table with a low
but constant write rate spread over every page can lose index-only scans entirely, and why vacuum
frequency is a query-plan concern and not just a disk-space concern.

## Optional variation
Concentrate the same 200 updates on a few adjacent pages (WHERE id <= 200) and
compare: the same number of dirtied rows costs a couple of hundred heap fetches instead of a few
thousand. Locality of writes, not their volume, decides how much of the summary survives.
