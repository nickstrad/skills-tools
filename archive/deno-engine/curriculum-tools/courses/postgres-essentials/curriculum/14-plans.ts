import { code, type Module } from "../../../src/types.ts";

export const PLANS: Module = {
  category: "query-evidence",
  title: "Read plans and repair their inputs",
  lessons: [
    {
      slug: "read-a-plan-as-evidence",
      title: "Read a plan as measured work",
      difficulty: "intermediate",
      prerequisites: ["timeout-and-transaction-state"],
      tags: ["explain", "query-plans", "buffers", "cardinality"],
      estimatedMinutes: 25,
      revision: 1,
      sessions: 1,
      safetyLevel: "ddl",
      runIn: "tool",
      overview:
        "Run one aggregate query first as a planner prediction and then as measured execution. Read the aggregate parent separately from its sequential-scan child, and connect estimated rows, actual rows, rejected rows, loops, and buffer accesses to the work PostgreSQL performed. This is evidence about one controlled execution, not a storage-speed benchmark.",
      caution:
        "Use the supplied learner lab only. The experiment creates and drops pe_plan_read and changes no server-wide settings. If interrupted, ROLLBACK, then run DROP TABLE IF EXISTS pe_plan_read; RESET lock_timeout; RESET statement_timeout before restarting.",
      syntaxBreakdown: code`
### In plain terms
A query plan is a tree of work; cardinality means the number of rows a node emits. Plain EXPLAIN shows what the planner expects; EXPLAIN ANALYZE runs
the query and adds what the executor actually observed. Comparing those two kinds of evidence helps
you decide whether a surprising query spent work where the planner expected it to.

### Mechanism map

${"```text"}
One query, two kinds of plan evidence

EXPLAIN                         EXPLAIN (ANALYZE, BUFFERS)
planner prediction             prediction + measured execution
       |                                  |
Aggregate  estimated rows=1    Aggregate  actual rows=1
  Seq Scan estimated rows=?      Seq Scan actual rows=100
                                            rows removed=9,900
                                            buffers accessed

Read parent and child separately: one count result can require scanning many rows.
${"```"}

### Terminals and cleanup
Open one experiment terminal (Session A) and connect each psql session with:
${"```sh"}
psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off
${"```"}
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
`,
      setup: code`
set lock_timeout = '3s';
set statement_timeout = '15s';
drop table if exists pe_plan_read;
create table pe_plan_read (id int not null, payload text not null)
  with (autovacuum_enabled = false);
insert into pe_plan_read
select g, repeat('p', 32) from generate_series(1, 10000) g;
analyze pe_plan_read;`,
      code: code`
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
reset statement_timeout;`,
      expectedResult: code`
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
`,
      systemsLens:
        "Treat a plan as structured evidence about a particular query, data state, statistics state, configuration, and execution. Cardinality flows up the tree: a node can emit little while its descendants do much more work. Buffer counters locate page access within PostgreSQL's shared-buffer accounting, while elapsed time also includes machine and cache conditions. Use the estimate-versus-actual gap and observed work to form the next hypothesis; one plan does not establish production disk latency or a universal tuning rule.",
      challenge:
        "Change only predicate selectivity and predict which row counters must change. This " +
        "variation is independently runnable; it creates and removes its own fixture. If interrupted, ROLLBACK, drop pe_plan_read_variation and reset lock_timeout and statement_timeout.\n\n```sql\n" +
        "set lock_timeout = '3s';\nset statement_timeout = '15s';\n" +
        "drop table if exists pe_plan_read_variation;\n" +
        "create table pe_plan_read_variation (id int not null, payload text not null)\n" +
        "  with (autovacuum_enabled = false);\n" +
        "insert into pe_plan_read_variation\n" +
        "select g, repeat('v', 32) from generate_series(1, 10000) g;\n" +
        "analyze pe_plan_read_variation;\n\\echo variation_broader_predicate\n" +
        "explain (analyze, buffers, timing off)\n" +
        "select count(*) from pe_plan_read_variation where id % 10 = 0;\n" +
        "drop table pe_plan_read_variation;\n" +
        "reset lock_timeout;\nreset statement_timeout;\n```\n\n" +
        "The Aggregate still emits one row. The Seq Scan now emits exactly 1,000 rows and " +
        "removes 9,000, with one loop. The broader predicate changes row flow but still requires " +
        "the unindexed scan to test all 10,000 rows.",
    },
    {
      slug: "statistics-and-estimates",
      title: "Repair a misleading row estimate",
      difficulty: "intermediate",
      prerequisites: ["read-a-plan-as-evidence"],
      tags: ["analyze", "statistics", "query-plans", "cardinality"],
      estimatedMinutes: 25,
      revision: 1,
      sessions: 1,
      safetyLevel: "ddl",
      runIn: "tool",
      overview:
        "Analyze a two-value distribution, then reverse most of its skew while table autovacuum is disabled. Execute the same predicate before and after explicit ANALYZE without changing the data between those plans. The comparison isolates how stale statistics misdescribe real cardinality and how refreshed statistics repair that input to planning.",
      caution:
        "Use the supplied learner lab only. Autovacuum is disabled only on pe_plan_stats so the stale interval is intentional and bounded. If interrupted, ROLLBACK, then run DROP TABLE IF EXISTS pe_plan_stats; RESET lock_timeout; RESET statement_timeout before restarting.",
      syntaxBreakdown: code`
### In plain terms
The planner does not inspect every table row before choosing a plan. It uses compact statistics that
describe an earlier sample of the data. When a workload changes a distribution faster than those
statistics refresh, the query can return far more or fewer rows than the planner estimated.

### Mechanism map

${"```text"}
The data changes; the planner's description does not change automatically

ANALYZE                 UPDATE changes the skew                 ANALYZE
   |                              |                                 |
stats describe 1,000 rare     9,000 rare rows exist          stats describe 9,000 rare
   |                              |                                 |
close estimate             stale estimate / actual gap         close estimate

The second ANALYZE repairs information. It does not change the query or table data.
${"```"}

### Terminals and cleanup
Open one experiment terminal (Session A) and connect each psql session with:
${"```sh"}
psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off
${"```"}
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
`,
      setup: code`
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
analyze pe_plan_stats;`,
      code: code`
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
reset statement_timeout;`,
      expectedResult: code`
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
`,
      systemsLens:
        "A cost-based planner makes decisions from compressed, sampled state. Distribution drift creates an information lag even when every stored row is correct. Refreshing statistics can repair estimates without changing business data, but the resulting plan still depends on available access paths and cost assumptions. In production, compare estimates with actual row flow before changing indexes or memory, then ask whether skew, correlation, stale sampling, or parameter values explain the gap.",
      challenge:
        "Reverse the direction of drift and check whether the estimate gap follows the stale " +
        "description. This variation is independently runnable and holds data fixed across its " +
        "two plans. If interrupted, ROLLBACK, drop pe_plan_stats_variation and reset lock_timeout and statement_timeout.\n\n```sql\nset lock_timeout = '3s';\n" +
        "set statement_timeout = '15s';\ndrop table if exists pe_plan_stats_variation;\n" +
        "create table pe_plan_stats_variation (id int not null, kind text not null)\n" +
        "  with (autovacuum_enabled = false);\ninsert into pe_plan_stats_variation\n" +
        "select g, case when g <= 9000 then 'rare' else 'common' end\n" +
        "from generate_series(1, 10000) g;\nanalyze pe_plan_stats_variation;\n" +
        "update pe_plan_stats_variation set kind = 'common' where id <= 8000;\n" +
        "select kind, count(*) from pe_plan_stats_variation group by kind order by kind;\n" +
        "\\echo variation_stale_statistics\nexplain (analyze, buffers, timing off)\n" +
        "select * from pe_plan_stats_variation where kind = 'rare';\n" +
        "analyze pe_plan_stats_variation;\n\\echo variation_refreshed_statistics\n" +
        "explain (analyze, buffers, timing off)\n" +
        "select * from pe_plan_stats_variation where kind = 'rare';\n" +
        "drop table pe_plan_stats_variation;\n" +
        "reset lock_timeout;\nreset statement_timeout;\n```\n\n" +
        "The live counts are exactly common=9,000 and rare=1,000. The first scan substantially " +
        "overestimates the 1,000 rare rows because statistics still describe rare as the 90% " +
        "value; after ANALYZE, the same unchanged data returns 1,000 with an estimate close to " +
        "1,000. Both scans remove exactly 9,000 rows.",
    },
  ],
};
