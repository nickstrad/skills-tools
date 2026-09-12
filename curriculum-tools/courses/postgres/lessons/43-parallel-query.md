# Parallel query: Gather, workers planned vs launched, and when it hurts

slug: parallel-query
category: query-planning
difficulty: intermediate
tags: parallel-query, query-planning, process-model, capacity
prerequisites: process-model, explain-analyze-buffers
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 20
revision: 4

## Overview
A parallel plan requests workers and combines their results with a Gather or Gather Merge node.
Compare the requested worker count with the number actually launched, then measure the same answer
with serial and parallel execution. Worker availability and coordination overhead are part of the
experiment, so neither speedup nor slowdown is predetermined.

## Syntax breakdown
### In plain terms

Parallel query divides one scan among several PostgreSQL worker processes and gathers their answers.
This lesson shows the difference between workers the planner requests and workers the server can
actually launch, and shows that ordered results need a sorted gather. On this small machine the
extra processes and messages can make the parallel version slower.

### What you are learning

- **Gather versus Gather Merge:** Gather combines arriving rows; Gather Merge preserves sorted order.
- **Planned versus launched workers:** Capacity limits can silently reduce parallelism below the plan.
- **Leader participation:** The leader may process part of the subplan in addition to workers.
- **Parallel safety and overhead:** One unsafe function forbids parallelism, and process startup is not free.

### Piece by piece

- **Gather and Gather Merge** (parallel plan nodes)
  - What they are: Gather collects worker output; Gather Merge combines already-sorted streams.
  - What they do here: The count uses Gather and the ordered query uses the merge variant.
  - What they give us: Workers Planned and Workers Launched, plus per-participant Sort details.
- **max_parallel_workers_per_gather** (session setting)
  - What it is: The maximum workers one Gather may use; zero disables parallel query.
  - What it does here: It permits four workers and later forces serial timing.
  - What it gives us: A per-query worker cap visible in the plan and timing comparison.
- **max_parallel_workers and max_worker_processes** (cluster worker limits)
  - What they are: The first limits parallel workers a session may obtain from the shared pool; the second is the startup-time worker slot limit.
  - What they do here: Reducing max_parallel_workers to one makes four planned workers compete for one slot.
  - What they give us: Workers Planned greater than Workers Launched, the key capacity signal.
- **min_parallel_table_scan_size** (parallel-planning setting)
  - What it is: Minimum table size for considering a parallel scan.
  - What it does here: The lab table exceeds the threshold, so parallelism can be considered.
  - What it gives us: A size comparison explaining why a tiny table stays serial.
- **parallel_setup_cost and parallel_tuple_cost** (planner costs)
  - What they are: Prices for starting workers and passing rows through the tuple queue.
  - What they do here: Setting them to zero exposes a parallel shape that default costs reject.
  - What they give us: Cost changes without changing data or results.
- **loops** (EXPLAIN field)
  - What it is: The number of times a plan node ran.
  - What it does here: In the observed partial aggregate, loops counts launched workers plus the participating leader; inspect the actual plan rather than assuming equal work.
  - What it gives us: Actual rows and time per participant; multiply by loops for total work.
- **PARALLEL UNSAFE** (function property)
  - What it is: A declaration that a function cannot safely execute in a parallel worker.
  - What it does here: pl_unsafe makes the entire count serial.
  - What it gives us: A plain Aggregate and Seq Scan with no Gather.
- **\timing on/off** (psql meta-command)
  - What it is: It toggles client-side elapsed-time display.
  - What it does here: It measures serial and parallel count executions.
  - What it gives us: Comparable timings; record which form is faster here without assuming a winner.
- **pg_stat_activity.backend_type** (activity view column)
  - What it is: The kind of backend process represented by an activity row.
  - What it does here: The final query filters parallel workers by leader_pid = pg_backend_pid(), so other sessions do not affect the cleanup check.
  - What it gives us: A cleanup check, normally zero after the queries finish.
- **pg_relation_size and pg_size_pretty** (size functions)
  - What they are: The first returns relation bytes; the second formats a byte count.
  - What they do here: They show why the lab table is large enough to consider parallel scanning.
  - What they give us: A human-readable table_size beside the parallel thresholds.
- **CREATE FUNCTION ... LANGUAGE sql VOLATILE** (function DDL)
  - What it is: It defines a SQL function whose result may change between calls and runs the supplied SQL body.
  - What it does here: Marking it PARALLEL UNSAFE prevents a query that calls pl_unsafe from using workers.
  - What it gives us: A controlled proof that one unsafe function can remove the Gather node.
- **generate_series and ANALYZE** (setup tools)
  - What they are: generate_series emits test rows; ANALYZE refreshes planner statistics.
  - What they do here: They create the stable 100000-row workload used by the parallel scans.
  - What they give us: A table large enough for the threshold and a known row count.

## Caution
Every setting here is changed with a per-session SET. Do not use ALTER SYSTEM on a shared lab: the
worker pool is cluster-wide and you would be changing it for everyone.

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
drop function if exists pl_unsafe(int);
```

## Run
```sql
select count(*) as parallel_answer_before from pl_orders \gset
select current_setting('max_parallel_workers_per_gather') as per_gather,
       current_setting('max_parallel_workers') as pool,
       current_setting('max_worker_processes') as slots,
       current_setting('min_parallel_table_scan_size') as min_scan_size,
       current_setting('parallel_setup_cost') as setup_cost,
       pg_size_pretty(pg_relation_size('pl_orders')) as table_size;

-- 1. Default settings, 8 MB table: the planner declines.
explain (analyze, buffers, timing off, summary off) select count(*) from pl_orders;

-- 2. Tell the planner workers are free and see the shape it wanted.
set max_parallel_workers_per_gather = 4;
set min_parallel_table_scan_size = 0;
set parallel_setup_cost = 0;
set parallel_tuple_cost = 0;
explain (analyze, buffers, timing off, summary off) select count(*) from pl_orders;

-- 3. Lower this session's limit on workers it can obtain from the shared pool.
set max_parallel_workers = 1;
explain (analyze, buffers, timing off, summary off) select count(*) from pl_orders;
reset max_parallel_workers;

-- 4. Ordered output needs Gather Merge, and each worker sorts its own slice
-- with its own work_mem.
set work_mem = '32MB';
explain (analyze, timing off, summary off)
  select * from pl_orders order by amount, id offset 99999;
reset work_mem;

-- 5. One parallel-unsafe function poisons the whole query.
create function pl_unsafe(int) returns int as 'select $1' language sql volatile parallel unsafe;
explain (costs off) select count(pl_unsafe(id)) from pl_orders;
drop function pl_unsafe(int);

-- 6. Does it actually help on this machine? Time it both ways.
\timing on
set max_parallel_workers_per_gather = 0;
select count(*) from pl_orders;
select count(*) from pl_orders;
set max_parallel_workers_per_gather = 4;
select count(*) from pl_orders;
select count(*) from pl_orders;
\timing off

reset max_parallel_workers_per_gather;
reset min_parallel_table_scan_size;
reset parallel_setup_cost;
reset parallel_tuple_cost;
select count(*) as parallel_answer_after from pl_orders \gset
select :parallel_answer_before = :parallel_answer_after as unchanged_answer;
select count(*) as running_parallel_workers from pg_stat_activity
where backend_type = 'parallel worker' and leader_pid = pg_backend_pid();
```

## Expected result
The default plan was serial in validation. Lowering the session's parallel cost thresholds exposed
a plan with four requested and four launched workers. Its partial count ran with five participants
including the leader and combined to the same 100,000-row answer. Actual row figures are averages
and can be rounded; work need not divide equally among participants.

Setting max_parallel_workers = 1 in this session still planned four workers but launched one in
validation. This limits what this leader can obtain from the shared pool; it does not change other
sessions' configuration. Global worker availability can reduce the launched count further, even to
zero. Read both fields rather than treating a requested degree of parallelism as reserved capacity.

The ordered query used Gather Merge and separate participant sorts. The unsafe-function query had
no Gather. The serial/parallel count pairs return the same answer while client timings vary. The
small validation workload sometimes ran slower with parallel workers; a few local samples cannot
establish a general performance policy or latency percentile.

unchanged_answer is true. The final activity query counts only workers associated with this
session's leader PID, normally zero once its queries finish. Other sessions may still have workers.
All changed settings are reset and the temporary demonstration function is dropped.

## Systems lens
Planning for parallel work and acquiring resources to execute it are separate events. A fan-out
service or distributed query may receive less capacity than its plan assumed. Measure launch counts,
coordination cost and available resources alongside elapsed time. Per-worker memory demand also
matters: improving one request's latency can reduce how many requests the system sustains.

## Optional variation
Compare one and four requested workers with the same query and the same parallel cost settings.
Record workers actually launched and the unchanged count. What evidence would you need before
increasing parallelism for a service that runs many queries concurrently?
