# Repair a misleading row estimate

slug: statistics-and-estimates
category: query-evidence
difficulty: intermediate
tags: analyze, statistics, query-plans, cardinality
prerequisites: read-a-plan-as-evidence
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 25
revision: 1

## Overview
Analyze a two-value distribution, then reverse most of its skew while table autovacuum is disabled. Execute the same predicate before and after explicit ANALYZE without changing the data between those plans. The comparison isolates how stale statistics misdescribe real cardinality and how refreshed statistics repair that input to planning.

## Syntax breakdown
### In plain terms
The planner does not inspect every table row before choosing a plan. It uses compact statistics that
describe an earlier sample of the data. When a workload changes a distribution faster than those
statistics refresh, the query can return far more or fewer rows than the planner estimated.

### Mechanism map

```text
The data changes; the planner's description does not change automatically

ANALYZE                 UPDATE changes the skew                 ANALYZE
   |                              |                                 |
stats describe 1,000 rare     9,000 rare rows exist          stats describe 9,000 rare
   |                              |                                 |
close estimate             stale estimate / actual gap         close estimate

The second ANALYZE repairs information. It does not change the query or table data.
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
- Column statistics are a sampled description of data, not live counters maintained per row.
- A most-common-value frequency lets PostgreSQL estimate equality predicates on a skewed column.
- Holding data fixed across two measured plans isolates statistics refresh as the changed input.
- ANALYZE repairs planner information; it neither builds an index nor reclaims dead row versions.

### Piece by piece
- **SET lock_timeout = '3s'** and **SET statement_timeout = '15s'** bound this session's waits and
  execution time.
- **WITH (autovacuum_enabled = false)** prevents this fixture from being auto-analyzed between our
  labelled samples. It affects only pe_plan_stats and disappears when the table is dropped.
- **generate_series(1, 10000)** supplies integer IDs; **repeat('s', 32)** gives each core row the
  same payload width.
- The setup's **CASE** creates 9,000 **common** rows and 1,000 **rare** rows. The first
  **ANALYZE** samples that known distribution and publishes planner statistics.
- **pg_stats** is a readable view of collected statistics. **most_common_vals** lists values seen
  often enough to store, and **most_common_freqs** gives their estimated fractions of the table.
  Array order aligns the values with their frequencies. **current_schema()** names the first schema
  in this session's search path, and **tablename / attname** select this fixture's kind column.
- **UPDATE ... WHERE id <= 8000** changes 8,000 formerly common rows to rare. The live table then
  has 9,000 rare and 1,000 common rows, while the published statistics still describe the old skew.
- Each **\echo** phase label identifies the EXPLAIN immediately below it.
- **EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)** executes the predicate and puts estimated **rows** and
  measured **actual rows** on the same scan node. The query returns all columns so no aggregate
  parent hides the predicate's output cardinality.
- The explicit second **ANALYZE pe_plan_stats** samples the unchanged 9,000/1,000 distribution and
  replaces the stale planner description. No table data changes between the two labelled plans.
- **DROP TABLE pe_plan_stats** removes the heap, its dead versions, statistics, and table setting.
  The subsequent **RESET** commands restore timeout defaults.

## Caution
Use the supplied learner lab only. Autovacuum is disabled only on pe_plan_stats so the stale interval is intentional and bounded. If interrupted, ROLLBACK, then run DROP TABLE IF EXISTS pe_plan_stats; RESET lock_timeout; RESET statement_timeout before restarting.

## Setup
```sql
set lock_timeout = '3s';
set statement_timeout = '15s';
drop table if exists pe_plan_stats;
create table pe_plan_stats (id int not null, kind text not null, payload text not null)
  with (autovacuum_enabled = false);
insert into pe_plan_stats
select g,
       case when g <= 9000 then 'common' else 'rare' end,
       repeat('s', 32)
from generate_series(1, 10000) g;
analyze pe_plan_stats;
```

## Run
```sql
-- Session A: record the statistics for the original 9,000/1,000 distribution.
select most_common_vals, most_common_freqs
from pg_stats
where schemaname = current_schema()
  and tablename = 'pe_plan_stats'
  and attname = 'kind';

-- Session A: change the live distribution without refreshing its planner statistics.
update pe_plan_stats set kind = 'rare' where id <= 8000;
select kind, count(*) from pe_plan_stats group by kind order by kind;
\echo stale_statistics
explain (analyze, buffers, timing off)
select * from pe_plan_stats where kind = 'rare';

-- Session A: repair only the statistics, then execute the identical predicate.
analyze pe_plan_stats;
select most_common_vals, most_common_freqs
from pg_stats
where schemaname = current_schema()
  and tablename = 'pe_plan_stats'
  and attname = 'kind';
\echo refreshed_statistics
explain (analyze, buffers, timing off)
select * from pe_plan_stats where kind = 'rare';
drop table pe_plan_stats;
reset lock_timeout;
reset statement_timeout;
```

## Expected result
The first pg_stats sample describes **common** near 0.9 and **rare** near 0.1. After the UPDATE, the
grouped live counts are exactly **common=1000** and **rare=9000**.

After **stale_statistics**, the Seq Scan materially underestimates rare rows but reports actual
rows=9000 and loops=1. It removes exactly 1,000 rows. PostgreSQL can scale the old frequency by its
new estimate of table size, so the stale estimate need not remain exactly 1,000. The large gap is
expected because the table changed after its statistics were collected.

The refreshed pg_stats sample reverses the common-value frequencies to approximately 0.9 for rare
and 0.1 for common. After **refreshed_statistics**, the identical query still reports actual
rows=9000, but its estimate is close to 9,000; on the validated deterministic PostgreSQL 16 fixture
it was exactly 9,000. Sampling can make a refreshed estimate differ slightly. The plan remains a
Seq Scan because ANALYZE created no index, and cleanup drops pe_plan_stats and its dead
versions before restoring session settings.

## Systems lens
A cost-based planner makes decisions from compressed, sampled state. Distribution drift creates an information lag even when every stored row is correct. Refreshing statistics can repair estimates without changing business data, but the resulting plan still depends on available access paths and cost assumptions. In production, compare estimates with actual row flow before changing indexes or memory, then ask whether skew, correlation, stale sampling, or parameter values explain the gap.

## Optional variation
Reverse the direction of drift and check whether the estimate gap follows the stale description. This variation is independently runnable and holds data fixed across its two plans. If interrupted, ROLLBACK, drop pe_plan_stats_variation and reset lock_timeout and statement_timeout.

```sql
set lock_timeout = '3s';
set statement_timeout = '15s';
drop table if exists pe_plan_stats_variation;
create table pe_plan_stats_variation (id int not null, kind text not null)
  with (autovacuum_enabled = false);
insert into pe_plan_stats_variation
select g, case when g <= 9000 then 'rare' else 'common' end
from generate_series(1, 10000) g;
analyze pe_plan_stats_variation;
update pe_plan_stats_variation set kind = 'common' where id <= 8000;
select kind, count(*) from pe_plan_stats_variation group by kind order by kind;
\echo variation_stale_statistics
explain (analyze, buffers, timing off)
select * from pe_plan_stats_variation where kind = 'rare';
analyze pe_plan_stats_variation;
\echo variation_refreshed_statistics
explain (analyze, buffers, timing off)
select * from pe_plan_stats_variation where kind = 'rare';
drop table pe_plan_stats_variation;
reset lock_timeout;
reset statement_timeout;
```

The live counts are exactly common=9,000 and rare=1,000. The first scan substantially overestimates the 1,000 rare rows because statistics still describe rare as the 90% value; after ANALYZE, the same unchanged data returns 1,000 with an estimate close to 1,000. Both scans remove exactly 9,000 rows.
