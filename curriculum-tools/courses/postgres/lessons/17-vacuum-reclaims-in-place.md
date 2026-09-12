# VACUUM makes space reusable inside the table

slug: vacuum-reclaims-in-place
category: vacuum
difficulty: beginner
tags: 
prerequisites: install-lab-extensions, process-model
safety: writes-data
run-in: tool
sessions: 1
min-version: 16
minutes: 12
revision: 4

## Overview
Plain VACUUM removes dead tuples and their index entries, records the freed space in the free space
map. It can truncate empty pages at the end, but cannot move live rows to consolidate interior holes.
In this fixture the file stays the same size. Observe reclaimed tuple space, then insert 10000 new
rows and measure whether they fit inside the existing allocation.

## Syntax breakdown
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
- **VACUUM a second time** (maintenance variation)
  - What it is: A no-write vacuum tests whether visibility metadata allows work to be skipped.
  - What it does here: It may report “index scan not needed” and zero tuples removed.
  - What it gives us: Evidence that a clean visibility map reduces later vacuum work.

## Setup
```sql
create table if not exists vac_t(id int primary key, n int, pad text);
alter table vac_t set (autovacuum_enabled = off);
truncate vac_t;
insert into vac_t select g, g, repeat('x', 100) from generate_series(1, 20000) g;
vacuum (analyze) vac_t;
update vac_t set n = n + 1;
update vac_t set n = n + 1;
update vac_t set n = n + 1;
```

## Run
```sql
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
select pg_relation_size('vac_t') / 8192 as pages_after_10k_more_rows, count(*) as rows from vac_t;
```

## Expected result
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
Vacuum did not make the file smaller, it made the file reusable.

## Systems lens
Reclamation and relocation solve different problems. Ordinary VACUUM makes eligible interior space
reusable; it can also truncate an empty file tail. VACUUM FULL instead rewrites live data and needs
an exclusive table lock. Neither operation makes an old snapshot stop needing history. First identify
whether growth comes from retained versions, insufficient cleanup capacity, a growing live dataset,
or unused allocation. Then decide whether to bound a reader, improve cleanup, change the workload,
or schedule a rewrite. A stable file size alone does not establish healthy latency or capacity.

## Optional variation
Immediately after the first VACUUM and before the reinsertion step, run VACUUM (VERBOSE) again.
Compare tuples removed, scanned pages and index-cleanup decisions. With no intervening writes,
all-visible metadata can let it skip work; compare observed counts rather than requiring an exact
scan percentage.
