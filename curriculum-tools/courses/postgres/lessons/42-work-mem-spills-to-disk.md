# work_mem: quicksort, top-N heapsort, external merge, and hash spill

slug: work-mem-spills-to-disk
category: query-planning
difficulty: intermediate
tags: work-mem, sorting-and-merging, hashing, capacity
prerequisites: join-strategies
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 20
revision: 4

## Overview
Run the same bounded sort at three memory budgets and observe when it writes temporary files.
Contrast a full sort with top-N sorting, then inspect a spilling hash aggregate. Relate the measured
work to per-operation and per-worker budgets before making a concurrency decision.

## Syntax breakdown
### In plain terms

work_mem is a memory allowance for each executor node, not a single allowance for the whole query.
This lesson sorts the same rows with plenty of memory, limited memory, and almost no memory, then
groups rows with a hash table under the same pressure. PostgreSQL switches algorithms and writes
temporary files while still returning the correct answer instead of raising an error.

### What you are learning

- **In-memory sorting:** Quicksort keeps all rows in RAM when the node fits its allowance.
- **Top-N sorting:** LIMIT lets PostgreSQL keep only the best N rows rather than sort the whole result.
- **External sorting:** An undersized sort writes sorted runs to temporary files and merges them.
- **Spill observability:** EXPLAIN and database counter deltas expose temporary-file work.

### Piece by piece

- **work_mem** (executor memory setting)
  - What it is: A base allowance for memory-using operations; hashes use hash_mem_multiplier and concurrent nodes or workers have separate demands.
  - What it does here: It compares 32MB, 4MB and 64kB for a fixed sort, then demonstrates hash spill. These are controlled lab values, not tuning recommendations.
  - What it gives us: Sort Method and temporary block evidence without a query failure.
- **generate_series and autovacuum_enabled = off** (setup tools)
  - What they are: generate_series creates the synthetic rows; the table option disables background cleanup.
  - What they do here: They make the sort input stable and keep the fixture stable between measurements.
  - What they give us: 100000 rows and a controlled workload for each memory setting.
- **ORDER BY amount, id** (SQL ordering clause)
  - What it is: It requests amount order and uses id to break ties.
  - What it does here: It makes sorting 100000 rows necessary before OFFSET can discard rows.
  - What it gives us: Sort Method, Memory or Disk size, and temp buffers.
- **OFFSET 99999 and LIMIT 10** (result-window clauses)
  - What they are: OFFSET skips rows; LIMIT caps returned rows.
  - What they do here: OFFSET forces almost the entire sort while LIMIT enables top-N heapsort.
  - What they give us: A direct contrast between full/external sorting and a 10-row heap.
- **EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF)** (plan command and options)
  - What it is: It executes the statement, reports shared and temporary pages, hides timing, and omits the footer.
  - What it does here: It shows Sort Method, Disk, Memory, temp read/written, and HashAggregate batching.
  - What it gives us: Evidence that a node crossed from RAM to temporary files.
- **HashAggregate** (plan node)
  - What it is: It groups rows by storing group keys in a hash table.
  - What it does here: It groups 5000 customer IDs with only 64kB available.
  - What it gives us: Planned Partitions, actual Batches, Memory Usage, Disk Usage, and temp buffers.
- **enable_indexscan and enable_indexonlyscan** (session planner settings)
  - What they are: Controls that discourage index paths.
  - What they do here: They keep grouping from choosing an ordered index plan that would not spill.
  - What they give us: A fair hash-spill demonstration; reset restores normal planning.
- **pg_stat_database.temp_files and temp_bytes** (database statistics columns)
  - What they are: Cumulative counts and bytes for temporary files created in the database.
  - What they do here: Before and after readings show that the sort created files.
  - What they give us: Eventually consistent counters; the difference can lag the statement.
- **hash_mem_multiplier** (memory setting)
  - What it is: The multiplier applied to work_mem for hash-operation budgets.
  - What it does here: A session value of 2 makes the base allowance explicit; actual node memory can exceed that target.
  - What it gives us: A reason a hash node's reported memory need not equal work_mem.
- **pg_stat_force_next_flush() and pg_stat_clear_snapshot()** (statistics functions)
  - What they are: The first requests that this backend publish pending statistics at its next idle boundary; the second discards this session's cached statistics snapshot.
  - What they do here: Separate autocommit statements place a reporting boundary before each database-counter read.
  - What they give us: A more useful before/after measurement; other backends' contributions remain possible.
- **\gset and result comparisons** (psql capture and SQL checks)
  - What they are: One-row results become variables for later comparisons.
  - What they do here: They retain the input count, amount sum and initial temporary-file counters.
  - What they give us: unchanged_input plus temporary-file count and byte deltas.

## Setup
```sql
drop table if exists pl_orders;
create table pl_orders(
  id int primary key,
  customer_id int not null,
  status text not null,
  amount numeric(10,2) not null,
  created_at timestamptz not null,
  note text
) with (autovacuum_enabled = off);
insert into pl_orders
select g,
       (g % 5000) + 1,
       case when g % 1000 = 0 then 'cancelled' when g % 10 = 0 then 'shipped' else 'paid' end,
       (g % 10000)::numeric / 100,
       timestamptz '2025-01-01' + (g % 365) * interval '1 day',
       'note for order ' || g
from generate_series(1,100000) g;
analyze pl_orders;
```

## Run
```sql
set max_parallel_workers_per_gather = 0;
select count(*) as rows_before, sum(amount) as amount_before from pl_orders \gset

select pg_stat_force_next_flush();
select pg_stat_clear_snapshot();
select temp_files as temp_files_before, temp_bytes as temp_bytes_before
from pg_stat_database where datname = current_database() \gset

-- 1. Enough memory: one in-memory quicksort. OFFSET 99999 forces the whole
-- sort to happen without printing 100000 rows.
set work_mem = '32MB';
explain (analyze, buffers, timing off, summary off)
  select * from pl_orders order by amount, id offset 99999;

-- 2. The lab default. Not enough.
set work_mem = '4MB';
explain (analyze, buffers, timing off, summary off)
  select * from pl_orders order by amount, id offset 99999;

-- 3. Sixty times less memory. Same algorithm, more passes over the tapes.
set work_mem = '64kB';
explain (analyze, buffers, timing off, summary off)
  select * from pl_orders order by amount, id offset 99999;

-- 4. A smaller result window enables bounded top-N sorting.
explain (analyze, buffers, timing off, summary off)
  select * from pl_orders order by amount, id limit 10;

-- 5. Hash aggregation spills differently: it partitions instead of merging.
set hash_mem_multiplier = 2;
set enable_indexscan = off;
set enable_indexonlyscan = off;
explain (analyze, buffers, timing off, summary off)
  select customer_id, count(*) from pl_orders group by customer_id offset 4999;
reset enable_indexscan;
reset enable_indexonlyscan;

-- 6. Publish this backend's counters before the scoped database read.
reset work_mem;
reset hash_mem_multiplier;
select pg_stat_force_next_flush();
select pg_stat_clear_snapshot();
select temp_files - :temp_files_before as temp_files_delta,
       temp_bytes - :temp_bytes_before as temp_bytes_delta
from pg_stat_database where datname = current_database();
select count(*) as rows_after, sum(amount) as amount_after from pl_orders \gset
select :rows_before = :rows_after and :amount_before = :amount_after as unchanged_input;
reset max_parallel_workers_per_gather;
```

## Expected result
The input remains 100,000 rows and the final unchanged_input check is true. In validation, 32MB
used quicksort (about 10.6MB of memory), 4MB used external merge (about 6MB on disk), and 64kB used
external merge with more temporary block traffic. Disk and in-memory representations have different
overhead, so their sizes need not match. Timing, spill sizes and thresholds vary by row shape.

The LIMIT 10 query still examines the input but retains a small top-N heap; it returned 10 rows
without spilling in validation. It deliberately asks for a different result from OFFSET 99999.
The 5,000-group hash aggregate used 21 batches and about 3.3MB of disk with a 64kB work_mem base and
hash_mem_multiplier = 2. Read its actual plan: work_mem is not a hard process-wide memory ceiling.

The session forces a statistics flush at a statement boundary and clears its cached statistics
snapshot before reading database counter deltas. temp_files_delta and temp_bytes_delta should be
positive; unrelated work in the same database can contribute. EXPLAIN provides the direct evidence
for each individual operation. Server-log correlation belongs to the later observability lesson.

The final resets restore planner and memory defaults. Spilling can keep a query running, but it
still consumes space and I/O and can hit other resource limits.

## Systems lens
An algorithm can trade memory for temporary storage while preserving its result. That changes its
resource demand and latency; it does not establish a fixed slowdown factor. Budget across operations
that can overlap, workers and active requests. Raising a per-operation allowance may help one query
while increasing memory pressure for the workload as a whole.

## Optional variation
Keep the sorted query and its projection fixed while changing work_mem from 64kB to 32MB. Capture
the final ordered id under both settings and compare it as well as Sort Method and temp blocks.
Use the evidence to distinguish a changed resource path from a changed query answer.
