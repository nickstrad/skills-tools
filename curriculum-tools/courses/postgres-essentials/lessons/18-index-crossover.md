# An index can stop being the cheaper path

slug: index-crossover
category: query-evidence
difficulty: intermediate
tags: query-plans, indexes, cost-model, performance
prerequisites: statistics-and-estimates
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 25
revision: 1

## Overview
Run the same range query at narrow and broad selectivity against one analyzed table. PostgreSQL should use the B-tree to fetch a few heap rows, then prefer one sequential pass when most rows and their payload are needed. Predict the two access paths before revealing the plans, then use their row and buffer evidence to explain the choice.

## Syntax breakdown
### In plain terms
An index avoids examining most of a table when a predicate is selective, but each matching index
entry can lead to a heap-page visit for the requested payload. When a query needs most rows, one
sequential pass can cost less than many indexed visits. PostgreSQL estimates both alternatives and
chooses the cheaper plan; there is no fixed selectivity percentage at which every index loses.

### Mechanism map

```text
One table, two ranges, two ways to reach heap rows

narrow range -> B-tree finds a few row locations -> fetch a few heap pages
broad range  -> sequential scan reads the heap once -> discard nonmatches

The planner compares estimated work. The crossover depends on the table, row width,
correlation, cache assumptions and cost settings; it is not a universal percentage.
```

### Terminals and cleanup
Open one experiment terminal (Session A) and connect each psql session with:
```sh
psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off
```
The flags skip personal startup settings, select the learner socket, port, role and database, and
keep output in the terminal. Finish any earlier transaction with **ROLLBACK** before setup. Run every block in Session A in the order shown.
If you reach the fifteen-minute core limit or get stuck, ROLLBACK in the open sessions and follow
the lesson's exact cleanup command so its named pe_* table and session settings are removed.
### What you are learning
- Selectivity is the fraction of rows a predicate is expected to match.
- An Index Scan can cheaply locate a narrow range but still visits the heap for payload not stored
  in this index.
- A Seq Scan reads the heap in physical order and tests every row, which can be cheaper for a broad
  result.
- Plan choice is evidence about this table and cost model. It is not a disk-speed benchmark or a
  universal crossover rule.

### Piece by piece
- **SET lock_timeout = '3s'** bounds lock acquisition, and **SET statement_timeout = '30s'** bounds
  each statement. Keep them active until the table is dropped, then RESET their session defaults.
- **CREATE TABLE ... WITH (autovacuum_enabled = false)** confines background-maintenance control to
  this disposable fixture, keeping its statistics and visibility stable during the comparison.
- **generate_series(1, 100000)** creates a deterministic key range. **repeat('x', 500)** gives each
  heap row a payload wide enough to make broad heap access visible without exceeding the lab budget.
- **CREATE INDEX ... (id)** builds a B-tree containing the range key but not payload. An Index Scan
  therefore uses the index to find tuple locations and reads matching heap pages for payload.
- **ANALYZE** refreshes statistics used to estimate how many rows each predicate will return.
- **SET random_page_cost = 4**, **SET seq_page_cost = 1** and **SET effective_cache_size = '128MB'**
  state the local planner assumptions used to stabilize this small fixture. They affect estimated
  cost only, change no scan type directly, and are reset after the experiment. **random_page_cost**
  prices a nonsequential page fetch; **seq_page_cost** prices a sequential page fetch.
  **effective_cache_size** estimates cache capacity available to a query; setting it does not
  allocate memory or change shared_buffers.
- **EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)** executes the SELECT and reports estimated and actual
  rows, loops and shared-buffer hits/reads. TIMING OFF removes per-node clock overhead; total
  execution time may still print and is not the comparison here.
- **id BETWEEN 50000 AND 50009** is the narrow ten-row range. **id <= 95000** is the broad 95,000-row
  range. Both project payload, so this is not an index-only workload.
- **Rows Removed by Filter** on the sequential plan counts heap rows rejected by its predicate.
  Buffer counts show pages accessed through PostgreSQL's shared-buffer interface; a hit means the
  page was already cached there, not that no lower storage layer was involved earlier.
- **\echo phase_...** prints an unambiguous label immediately before each plan for review and
  automated evidence checks.
- **RESET** restores each session-level planner setting. **DROP TABLE** removes the table, index and
  table-local autovacuum setting.

## Caution
This fixture creates about 100,000 rows and disables autovacuum only on pe_index_crossover so a background worker cannot change the comparison. Run it only in the supplied lab. If interrupted, run ROLLBACK; DROP TABLE IF EXISTS pe_index_crossover; RESET random_page_cost; RESET seq_page_cost; RESET effective_cache_size; RESET lock_timeout; RESET statement_timeout.

## Setup
```sql
set lock_timeout = '3s';
set statement_timeout = '30s';
drop table if exists pe_index_crossover;
create table pe_index_crossover (id int not null, payload text not null)
  with (autovacuum_enabled = false);
insert into pe_index_crossover
select g, repeat('x', 500) from generate_series(1, 100000) g;
create index pe_index_crossover_id_idx on pe_index_crossover (id);
analyze pe_index_crossover;
set random_page_cost = 4;
set seq_page_cost = 1;
set effective_cache_size = '128MB';
```

## Run
```sql
-- Session A: compare two ranges without disabling any scan type.
\echo phase_narrow_range
explain (analyze, buffers, timing off)
select payload from pe_index_crossover where id between 50000 and 50009;

\echo phase_broad_range
explain (analyze, buffers, timing off)
select payload from pe_index_crossover where id <= 95000;

-- Session A: remove the fixture while the timeout guards still apply, then restore the session.
drop table pe_index_crossover;
reset random_page_cost;
reset seq_page_cost;
reset effective_cache_size;
reset lock_timeout;
reset statement_timeout;
```

## Expected result
phase_narrow_range shows an Index Scan using pe_index_crossover_id_idx. Its estimate is near 10 and actual
output is exactly 10 rows with one loop, and only a small number of index and heap buffers are accessed.

phase_broad_range shows a Seq Scan returning 95,000 rows with one loop and Rows Removed by Filter =
5,000. It touches the table's heap pages once rather than following 95,000 index entries to fetch
payload. On the validated PostgreSQL 16 fixture the narrow scan accessed 3 shared buffers and the
broad scan accessed 6,667. Buffer hit/read state and execution time
depend on cache history. The stable evidence is the
Index Scan versus Seq Scan choice and their 10 versus 95,000 actual rows under the stated fixture
and cost assumptions. Cleanup drops pe_index_crossover and restores the session settings.

## Systems lens
An index is an alternate access path with its own traversal and heap-fetch costs. Choose it from the workload's predicates, projected columns, distribution and measured plans rather than from a generic selectivity rule. Production decisions also need representative data volume, cache state, write cost and concurrency; this bounded fixture isolates only the access-path crossover.

## Optional variation
Optional medium-range variation, independently runnable. Predict the node, then run the whole block; the lesson does not require one fixed choice because small cost or version differences can move the crossover. Explain the chosen node from its estimate and buffers.

```sql
-- Session A: recreate the fixture and inspect an intermediate selectivity.
set lock_timeout = '3s';
set statement_timeout = '30s';
drop table if exists pe_index_crossover;
create table pe_index_crossover (id int not null, payload text not null)
  with (autovacuum_enabled = false);
insert into pe_index_crossover
select g, repeat('x', 500) from generate_series(1, 100000) g;
create index pe_index_crossover_id_idx on pe_index_crossover (id);
analyze pe_index_crossover;
set random_page_cost = 4;
set seq_page_cost = 1;
set effective_cache_size = '128MB';
\echo phase_medium_range
explain (analyze, buffers, timing off)
select payload from pe_index_crossover where id <= 20000;
drop table pe_index_crossover;
reset random_page_cost;
reset seq_page_cost;
reset effective_cache_size;
reset lock_timeout;
reset statement_timeout;
```

Mentally compare the scan node, actual rows and buffers. A different node from the validated run is a reason to inspect the cost estimates, not a failure of the experiment.
