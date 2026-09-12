# Read a plan as measured work

slug: read-a-plan-as-evidence
category: query-evidence
difficulty: intermediate
tags: explain, query-plans, buffers, cardinality
prerequisites: timeout-and-transaction-state
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 25
revision: 1

## Overview
Run one aggregate query first as a planner prediction and then as measured execution. Read the aggregate parent separately from its sequential-scan child, and connect estimated rows, actual rows, rejected rows, loops, and buffer accesses to the work PostgreSQL performed. This is evidence about one controlled execution, not a storage-speed benchmark.

## Syntax breakdown
### In plain terms
A query plan is a tree of work; cardinality means the number of rows a node emits. Plain EXPLAIN shows what the planner expects; EXPLAIN ANALYZE runs
the query and adds what the executor actually observed. Comparing those two kinds of evidence helps
you decide whether a surprising query spent work where the planner expected it to.

### Mechanism map

```text
One query, two kinds of plan evidence

EXPLAIN                         EXPLAIN (ANALYZE, BUFFERS)
planner prediction             prediction + measured execution
       |                                  |
Aggregate  estimated rows=1    Aggregate  actual rows=1
  Seq Scan estimated rows=?      Seq Scan actual rows=100
                                            rows removed=9,900
                                            buffers accessed

Read parent and child separately: one count result can require scanning many rows.
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
- A parent and child each report their own output rows; rejected rows need a separate counter.
- Estimated **rows** and measured **actual rows** answer different questions.
- Rows removed, loops, and buffers describe work that elapsed time alone can hide.
- A second execution can find pages already cached, so this bounded run is not a disk benchmark.

### Piece by piece
- **SET lock_timeout = '3s'** and **SET statement_timeout = '15s'** bound accidental waiting and
  total statement runtime. They apply only to this session.
- **CREATE TABLE pe_plan_read ... WITH (autovacuum_enabled = false)** makes an unindexed heap and
  prevents background analysis from changing this short experiment. The setting disappears with
  the table.
- **generate_series(1, 10000)** creates a deterministic 10,000-row fixture. The filter
  **id % 100 = 0** uses the remainder operator: it accepts exactly 100 IDs divisible by 100 and
  rejects 9,900. **count(*)** then reduces those 100 scan outputs to one aggregate result row.
- **repeat('p', 32)** gives each row a 32-character payload, holding its shape constant.
- **ANALYZE pe_plan_read** samples the table and publishes statistics for planning. It does not add
  an index, execute the SELECT, or reclaim dead tuples.
- **\echo plan_prediction** and the later phase labels are psql markers. They make it clear which
  following plan is being interpreted; they are not SQL sent to the server.
- **EXPLAIN SELECT count(*) ...** plans without running the SELECT. Each node's estimated **rows**
  is its output per execution of that node, so the Aggregate estimates one count row while the scan
  estimates qualifying table rows.
- **EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)** executes the SELECT. **TIMING OFF** avoids per-node
  clock calls while retaining actual row and loop counters. This still runs the query and reports
  overall execution time.
- A node's **cost=startup..total** is the planner's unitless comparison score, not milliseconds.
  **width** is its estimated average output-row bytes. Both are predictions, even in an analyzed
  plan; the parent cost includes work requested from its child.
- **actual rows** is output per loop, and **loops** is the number of executions of that node. For a
  repeatedly executed node, multiply them to reason about total row flow.
- **Rows Removed by Filter** counts rows rejected by this scan's filter, per loop. It is executor
  evidence and therefore absent from plain EXPLAIN.
- **Buffers: shared hit=...** counts accesses to shared-buffer pages already resident for this
  execution. A **read=...** counter, if present, counts pages brought into shared buffers. Neither
  counter by itself proves physical disk I/O. Parent buffer totals include accesses attributed to
  descendants, so do not add the Aggregate and Seq Scan figures together.
- **DROP TABLE pe_plan_read** removes the bounded fixture and its table-local autovacuum setting.
- **RESET lock_timeout** and **RESET statement_timeout** restore the session guards after cleanup.

## Caution
Use the supplied learner lab only. The experiment creates and drops pe_plan_read and changes no server-wide settings. If interrupted, ROLLBACK, then run DROP TABLE IF EXISTS pe_plan_read; RESET lock_timeout; RESET statement_timeout before restarting.

## Setup
```sql
set lock_timeout = '3s';
set statement_timeout = '15s';
drop table if exists pe_plan_read;
create table pe_plan_read (id int not null, payload text not null)
  with (autovacuum_enabled = false);
insert into pe_plan_read
select g, repeat('p', 32) from generate_series(1, 10000) g;
analyze pe_plan_read;
```

## Run
```sql
-- Session A: inspect the planner's prediction without executing the SELECT.
\echo plan_prediction
explain
select count(*) from pe_plan_read where id % 100 = 0;

-- Session A: execute the identical SELECT and add row-flow and buffer evidence.
\echo measured_execution
explain (analyze, buffers, timing off)
select count(*) from pe_plan_read where id % 100 = 0;

-- Session A: repeat once to expose cache sensitivity, then clean up.
\echo repeated_execution
explain (analyze, buffers, timing off)
select count(*) from pe_plan_read where id % 100 = 0;
drop table pe_plan_read;
reset lock_timeout;
reset statement_timeout;
```

## Expected result
After **plan_prediction**, the plan has an Aggregate parent with estimated rows=1 above a Seq Scan.
There is no **actual**, **Rows Removed by Filter**, or **Buffers** evidence because plain EXPLAIN did
not execute the SELECT.

After **measured_execution**, the Aggregate reports actual rows=1 and loops=1: one count result.
Its Seq Scan child reports actual rows=100 and loops=1, plus **Rows Removed by Filter: 9900**. That
child evidence proves that producing one aggregate row required testing all 10,000 heap rows. The
validated PostgreSQL 16 fixture accessed 84 shared buffers in both measured runs; buffer placement
can vary, so the stable claims are the exact row counts and the presence of buffer evidence.

After **repeated_execution**, the row-flow counters remain 1 aggregate row, 100 qualifying scan
rows, and 9,900 removed rows. Buffer hit/read details may differ because the first execution can
warm shared buffers or the operating-system cache. Cleanup drops pe_plan_read and restores session settings.

## Systems lens
Treat a plan as structured evidence about a particular query, data state, statistics state, configuration, and execution. Cardinality flows up the tree: a node can emit little while its descendants do much more work. Buffer counters locate page access within PostgreSQL's shared-buffer accounting, while elapsed time also includes machine and cache conditions. Use the estimate-versus-actual gap and observed work to form the next hypothesis; one plan does not establish production disk latency or a universal tuning rule.

## Optional variation
Change only predicate selectivity and predict which row counters must change. This variation is independently runnable; it creates and removes its own fixture. If interrupted, ROLLBACK, drop pe_plan_read_variation and reset lock_timeout and statement_timeout.

```sql
set lock_timeout = '3s';
set statement_timeout = '15s';
drop table if exists pe_plan_read_variation;
create table pe_plan_read_variation (id int not null, payload text not null)
  with (autovacuum_enabled = false);
insert into pe_plan_read_variation
select g, repeat('v', 32) from generate_series(1, 10000) g;
analyze pe_plan_read_variation;
\echo variation_broader_predicate
explain (analyze, buffers, timing off)
select count(*) from pe_plan_read_variation where id % 10 = 0;
drop table pe_plan_read_variation;
reset lock_timeout;
reset statement_timeout;
```

The Aggregate still emits one row. The Seq Scan now emits exactly 1,000 rows and removes 9,000, with one loop. The broader predicate changes row flow but still requires the unindexed scan to test all 10,000 rows.
