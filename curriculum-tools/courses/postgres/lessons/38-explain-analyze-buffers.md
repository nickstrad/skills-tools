# Read a plan: estimate vs actual, cost vs time, buffers vs rows

slug: explain-analyze-buffers
category: query-planning
difficulty: beginner
tags: query-planning, explain, buffer-cache, observability
prerequisites: shell-and-psql-toolkit, table-is-a-file
safety: writes-data
run-in: tool
sessions: 1
min-version: 16
minutes: 15
revision: 4

## Overview
Compare the estimated and observed work of one bounded query, then add an index while keeping its
answer fixed. Read rows, loops and buffer activity as separate measurements. Finally, execute an
UPDATE through EXPLAIN ANALYZE and prove which effects a transaction rollback removes.

## Syntax breakdown
### In plain terms

This experiment asks whether PostgreSQL's prediction of a query matches what actually happens. You
will compare a full table scan with a primary-key lookup, count the pages each one touches, and
then deliberately run an UPDATE inside a transaction to prove that EXPLAIN ANALYZE executes work.
The result is a practical way to distinguish planner cost units from elapsed time and physical I/O.

### What you are learning

- **Estimated versus actual rows:** The planner predicts a result size from statistics; execution
  reports what it really returned, so their gap is a diagnostic signal.
- **Plan cost versus time:** Cost is an internal comparison number, not milliseconds or bytes; the
  actual time lines measure the run on this machine.
- **Buffers as page evidence:** Shared hits and reads count 8 KB PostgreSQL pages and show whether
  the work came from PostgreSQL's shared cache or the operating system.
- **EXPLAIN ANALYZE side effects:** ANALYZE runs the statement, including writes, so a rollback is
  needed when the experiment must leave the table unchanged.

### Piece by piece

- **EXPLAIN** (plan-inspection command)
  - What it is: It asks the planner for the plan it would use without executing the query.
  - What it does here: It prints the sequential-scan estimate for the cancelled orders.
  - What it gives us: Read cost, rows, and width as estimates, and the Filter line as the condition applied.
- **EXPLAIN (ANALYZE)** (executing plan-inspection command)
  - What it is: EXPLAIN with ANALYZE executes the statement and records observed results.
  - What it does here: It compares estimated rows with actual rows for scans, aggregation, and UPDATE.
  - What it gives us: Actual time, rows, loops, Rows Removed by Filter, and Execution Time; actual rows is the count returned by that node.
- **BUFFERS** (EXPLAIN option)
  - What it is: An option that reports buffer-page activity for the plan.
  - What it does here: It distinguishes the 1031-page table scan from the few pages needed by the primary-key lookup.
  - What it gives us: shared hit means an 8 KB page was already in shared_buffers; shared read means PostgreSQL had to obtain it from the OS; dirtied and written indicate changed pages; these counters are accesses rather than unique-page counts.
- **COSTS OFF, TIMING OFF, and SUMMARY OFF** (EXPLAIN options)
  - What they are: Output controls that hide cost numbers, per-node timing, or the summary footer.
  - What they do here: They are useful when comparing plan shape or reducing noisy output; the main steps leave them enabled.
  - What they give us: A smaller plan whose remaining node and buffer lines are easier to compare.
- **seq_page_cost, random_page_cost, cpu_tuple_cost, and cpu_operator_cost** (planner settings)
  - What they are: Relative prices used by the planner for page access, row processing, and expression evaluation.
  - What they do here: Their defaults combine with pg_class.relpages and pg_class.reltuples to reproduce a sequential-scan cost.
  - What they give us: The arithmetic behind the total cost; cost= startup..total is a planner-unit range, not a duration.
- **current_setting('setting_name')** (SQL function)
  - What it is: Reads a session setting as text.
  - What it does here: It supplies the four planner constants to the hand calculation, which casts them to float8 for multiplication.
  - What it gives us: The exact values used by this session rather than assumed defaults.
- **pg_class.relpages and pg_class.reltuples** (system catalog columns)
  - What they are: PostgreSQL's table-level estimates of pages and rows.
  - What they do here: They provide the scan size and row count used in the cost formula.
  - What they give us: relpages near 1031 and reltuples near 100000; compare them with Buffers and actual rows.
- **COUNT(*)** (aggregate function)
  - What it is: Counts rows without returning each row.
  - What it does here: It adds an Aggregate node above a full scan.
  - What it gives us: A simple tree showing that parent-node buffers include pages read by child nodes.
- **BEGIN and ROLLBACK** (transaction commands)
  - What they are: BEGIN opens a transaction; ROLLBACK abandons its changes.
  - What they do here: They contain the UPDATE that ANALYZE executes.
  - What they give us: rows_actually_updated proves the write ran, while rows_after_rollback proves no change remains.
- **SET max_parallel_workers_per_gather = 0** (session setting)
  - What it is: A per-connection limit on workers for one parallel query.
  - What it does here: It keeps the plan a simple single-process scan so page and cost arithmetic are easy to read.
  - What it gives us: Reproducible plan nodes without a Gather wrapper.
- **generate_series(1,100000)** (SQL row-producing function)
  - What it is: It emits one integer per step in an inclusive range.
  - What it does here: It creates the synthetic orders used for repeatable page and row counts.
  - What it gives us: The g value used to derive each order's fields.
- **autovacuum_enabled = off** (table storage option)
  - What it is: A relation option that disables routine automatic vacuum and analysis for this table; anti-wraparound vacuum can still run.
  - What it does here: It keeps background maintenance from changing measured pages.
  - What it gives us: A controlled experiment whose maintenance is explicit ANALYZE only.
- **CREATE INDEX / DROP INDEX and \gset** (controlled access-path change)
  - What they are: index DDL and a psql command that saves a one-row query result as a variable.
  - What they do here: They record the cancelled-order answer before and after adding a status index,
    then compare the same bounded query's plan and remove the test index.
  - What they give us: proof that a changed access path did not change query semantics.

## Caution
Use only the supplied lab tables. EXPLAIN ANALYZE executes supported statements, including writes.
ROLLBACK undoes this UPDATE's logical row changes; it does not undo its WAL, page work, sequence
advances or external effects from arbitrary functions. A transaction is not a general sandbox.

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

-- 1. The estimate alone. rows and width are guesses; cost is in planner units.
explain select * from pl_orders where status = 'cancelled';

-- 2. Rebuild that total cost by hand. A seq scan pays seq_page_cost per page,
-- cpu_tuple_cost per row examined, and cpu_operator_cost per filter evaluation.
select relpages, reltuples,
       relpages * current_setting('seq_page_cost')::float8      as page_cost,
       reltuples * current_setting('cpu_tuple_cost')::float8    as tuple_cost,
       reltuples * current_setting('cpu_operator_cost')::float8 as filter_cost,
       relpages * current_setting('seq_page_cost')::float8
     + reltuples * current_setting('cpu_tuple_cost')::float8
     + reltuples * current_setting('cpu_operator_cost')::float8 as predicted_total_cost
from pg_class where relname = 'pl_orders';

-- 3. Now run it. Compare rows= (estimate) with actual rows=, and note the pages.
explain (analyze, buffers) select * from pl_orders where status = 'cancelled';

-- 3b. A controlled access-path change must preserve the answer.
select count(*) as cancelled_before from pl_orders where status = 'cancelled' \gset
create index pl_orders_status_idx on pl_orders(status);
analyze pl_orders;
select count(*) as cancelled_after from pl_orders where status = 'cancelled' \gset
select :cancelled_before = :cancelled_after as unchanged_answer;
explain (analyze, buffers) select * from pl_orders where status = 'cancelled';
drop index pl_orders_status_idx;

-- 4. The same table by primary key: three buffers instead of a thousand.
explain (analyze, buffers) select * from pl_orders where id = 42424;

-- 5. Aggregation adds a node; each node reports its own subtree's buffers.
explain (analyze, buffers) select count(*) from pl_orders;

-- 6. EXPLAIN ANALYZE runs the statement. Prove it and undo it.
begin;
explain (analyze) update pl_orders set note = 'x' where status = 'cancelled';
select count(*) as rows_actually_updated from pl_orders where note = 'x';
rollback;
select count(*) as rows_after_rollback from pl_orders where note = 'x';
reset max_parallel_workers_per_gather;
```

## Expected result
The cancelled predicate returns 100 rows and rejects 99,900 during a sequential scan. Its estimate
comes from a sample and need not equal 100. On the validated 8 KiB-page fixture, relpages was 1,031,
reltuples was 100,000, and the simple scan cost was 2,281 with the lab defaults. Compare the formula
with your printed plan; these are cost units, not elapsed time or device reads.

The index experiment prints unchanged_answer = true. In validation it changed the cancelled query
from 1,031 shared buffer hits to an index scan with 102. The primary-key lookup needed three buffer
accesses. Cache state, sampling and physical layout can change the exact figures or selected path.
Buffer counters include repeated accesses; parent counters include child work, so do not sum the
tree or interpret hits as distinct pages. Shared reads can be satisfied by the OS cache.

The COUNT plan returns one aggregate row above a 100,000-row scan. A node's actual rows and time
are per-loop averages when loops exceeds one; buffers already accumulate the work. EXPLAIN omits
normal transmission of query results, so its execution time is not application response latency.

rows_actually_updated = 100 inside the transaction, then rows_after_rollback = 0. The rows are
restored logically, while the write's resource consumption still happened. The final RESET restores
the session's default parallel-worker limit.

## Systems lens
An optimizer chooses using a model; execution supplies evidence for that model. Separate a wrong
cardinality estimate, an expensive access path and time spent outside the database before choosing
a remedy. The same distinction matters for schedulers and distributed query engines: returning the
right answer is a correctness condition, while measured resource use supports a performance choice.
