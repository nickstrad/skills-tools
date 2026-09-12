# Make a sort spill, then bring it back into memory

slug: sort-spill
category: query-execution
difficulty: intermediate
tags: query-execution, sorting, work-mem, temporary-io
prerequisites: index-only-needs-visibility
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 25
revision: 1

## Overview
Execute one full ordering of a modest wide table under two transaction-local memory budgets. Read the Sort Method and temporary-buffer evidence to distinguish an external merge from in-memory quicksort, then use the comparison to make a query-scoped memory decision without turning it into a global setting recommendation.

## Syntax breakdown
### In plain terms
A Sort node uses its memory allowance to decide when to write working tuples to temporary files.
The allowance is not an exact process-memory ceiling; tuple bookkeeping can add overhead. You will hold the query and data constant while changing only a transaction-local work_mem.
The plan names the chosen algorithm and reports temporary block traffic when the small budget spills.

### Mechanism map

```text
One Sort node, two transaction-local budgets

20,000 input rows -> Sort -> 20,000 ordered rows
                       |
        work_mem=64kB  +--> external merge + temporary blocks
        work_mem=32MB  +--> quicksort in memory + no temporary blocks

The allowance belongs to this sort operation; concurrent nodes, workers and queries multiply demand.
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
- This fixture's full ORDER BY has no usable preordered input or matching index, so it sorts every
  input row before returning the result. Other plans can exploit full or partial input order.
- A 64 kB allowance forces this fixture into external merge; a 32 MB allowance permits quicksort.
- work_mem is an allowance per memory-consuming executor operation. Several sort/hash nodes, parallel
  workers and concurrent queries can each receive an allowance.
- One successful larger setting supports a bounded query decision. It does not establish a safe
  server-wide value under production concurrency.

### Piece by piece
- **SET lock_timeout = '3s'** bounds lock acquisition; **SET statement_timeout = '60s'** bounds each
  statement. Cleanup drops the table while these guards still apply, then RESET restores defaults.
- **SET max_parallel_workers_per_gather = 0** keeps one visible Sort consumer so worker multiplication
  does not obscure this comparison. RESET restores the session default.
- **generate_series(1, 20000)** supplies the IDs. **20001 - g** reverses their numeric order,
  **::text** converts the number to text, and **lpad(..., 6, '0')** makes a unique fixed-width
  sort_key. **md5(g::text)** supplies deterministic text and **repeat(..., 24)** widens payloads.
  No index matches sort_key, so both executions use the same sequential-input-plus-sort shape.
- **ANALYZE** collects planner statistics after loading the fixture.
- **BEGIN / SET LOCAL work_mem / COMMIT** scope each allowance to exactly one transaction. 64kB is
  PostgreSQL's minimum accepted value; 32MB is a bounded comparison value.
- **ORDER BY sort_key** uses ascending order by default. With no LIMIT, the executor returns all
  20,000 sorted rows; the optional **LIMIT 20** keeps only the best 20 candidates after consuming
  the unsorted scan input.
- **EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF)** executes the full SELECT. ANALYZE reports
  actual rows and the sort method, BUFFERS reports shared and temporary blocks, TIMING OFF omits
  per-node timers, and SUMMARY OFF omits the final planning/execution summary. Instrumentation adds
  overhead, so this is mechanism evidence rather than a latency benchmark.
- **Sort Method: external merge Disk: ...** means the sort wrote runs to temporary storage and
  merged them. **temp read=... written=...** counts temporary 8 kB blocks used by the plan.
- **Sort Method: quicksort Memory: ...** means this sort completed in memory. Its plan has no temp
  buffer line.
- **\echo phase=...** labels each immediately following plan for deterministic validation.
- **DROP TABLE** releases the experiment's heap after both transactions have committed.

## Caution
The table is about 17 MB and both plans really execute the full sort. Keep the supplied statement timeout, use SET LOCAL only inside each BEGIN block, and COMMIT each block so its memory setting expires. If interrupted, run ROLLBACK; DROP TABLE IF EXISTS pe_sort_budget; RESET max_parallel_workers_per_gather; RESET lock_timeout; RESET statement_timeout before rerunning setup.

## Setup
```sql
set lock_timeout = '3s';
set statement_timeout = '60s';
set max_parallel_workers_per_gather = 0;
drop table if exists pe_sort_budget;
create table pe_sort_budget (id integer primary key, sort_key text not null, payload text not null);
insert into pe_sort_budget
select g, lpad((20001 - g)::text, 6, '0'), repeat(md5(g::text), 24)
from generate_series(1, 20000) as g;
analyze pe_sort_budget;
```

## Run
```sql
-- Session A: constrain this Sort node enough to force temporary I/O.
begin;
set local work_mem = '64kB';
\echo phase=small_work_mem
explain (analyze, buffers, timing off, summary off)
select id, sort_key, payload from pe_sort_budget order by sort_key;
commit;

-- Session A: repeat identical work with a bounded in-memory allowance.
begin;
set local work_mem = '32MB';
\echo phase=larger_work_mem
explain (analyze, buffers, timing off, summary off)
select id, sort_key, payload from pe_sort_budget order by sort_key;
commit;

drop table pe_sort_budget;
reset max_parallel_workers_per_gather;
reset lock_timeout;
reset statement_timeout;
```

## Expected result
Both labelled plans contain one Sort above a sequential scan and report exactly 20000 actual rows at
the Sort. At phase=small_work_mem, Sort Method is external merge with a positive Disk amount; the
plan also reports positive temporary blocks read and written. At phase=larger_work_mem, Sort Method
is quicksort with a positive Memory amount and no temporary-buffer line. Disk, memory and buffer
counts vary by build and page layout; the algorithm names, presence versus absence of temporary I/O,
and equal actual row counts are the stable comparison. On the validated PostgreSQL 16 lab,
external merge used 15584kB of disk with temp read=7774 written=8165; quicksort used 16550kB of
memory. Cleanup drops pe_sort_budget and restores the session settings.

## Systems lens
Memory limits turn excess working state into I/O instead of letting one operation grow without bound. The capacity calculation is multiplicative: count eligible sort and hash nodes, parallel workers and concurrent queries rather than treating work_mem as a connection-wide ceiling. Raise it locally when measured spill costs justify the peak allocation and concurrency budget; a single plan cannot justify changing the global default.

## Optional variation
Optional bounded-LIMIT variation, independently runnable. If interrupted, ROLLBACK, drop pe_sort_variation and reset max_parallel_workers_per_gather, lock_timeout and statement_timeout:

```sql
set lock_timeout = '3s';
set statement_timeout = '60s';
set max_parallel_workers_per_gather = 0;
drop table if exists pe_sort_variation;
create table pe_sort_variation (id int primary key, sort_key text not null, payload text not null);
insert into pe_sort_variation
select g, lpad((20001 - g)::text, 6, '0'), repeat(md5(g::text), 24)
from generate_series(1, 20000) g;
analyze pe_sort_variation;
begin;
set local work_mem = '64kB';
\echo phase=variation_top_n
explain (analyze, buffers, timing off, summary off)
select id, sort_key, payload from pe_sort_variation order by sort_key limit 20;
commit;
drop table pe_sort_variation;
reset max_parallel_workers_per_gather;
reset lock_timeout;
reset statement_timeout;
```

Expect a Limit over a Sort whose method is top-N heapsort and whose actual output is 20 rows, while its sequential-scan child still reads 20,000 rows. Holding work_mem at the core's 64 kB isolates the effect of LIMIT: it lets the sort retain only the best bounded set but does not avoid consuming all unsorted input. The measured top-N plan reported Memory: 65kB; bookkeeping and rounding mean work_mem is not an exact byte ceiling.
