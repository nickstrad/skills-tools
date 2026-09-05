import { code, type Module } from "../../../src/types.ts";

export const PLANNER: Module = {
  category: "query-planning",
  title: "The planner, statistics, and execution",
  lessons: [
    {
      slug: "explain-analyze-buffers",
      tags: ["query-planning", "explain", "buffer-cache", "observability"],
      title: "Read a plan: estimate vs actual, cost vs time, buffers vs rows",
      difficulty: "beginner",
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 15,
      sessions: 1,
      prerequisites: ["shell-and-psql-toolkit", "table-is-a-file"],
      revision: 4,
      overview: code`
Compare the estimated and observed work of one bounded query, then add an index while keeping its
answer fixed. Read rows, loops and buffer activity as separate measurements. Finally, execute an
UPDATE through EXPLAIN ANALYZE and prove which effects a transaction rollback removes.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 16 "Query Execution Stages" (section "Simple Query Protocol"); Chapter 18 "Table Access Methods" (section "Sequential Scans"); Chapter 9 "Buffer Cache" (section "Cache Hits")`,
      readingNotes: code`
Chapter 16 supplies the parse, plan, and execution vocabulary that this lesson reads in EXPLAIN;
Chapter 18 explains why the sequential scan visits every heap page, and Chapter 9 explains shared
buffer hits. The experiment adds a hands-on comparison of estimates, actual rows, and buffer counts,
plus a rollback proof that EXPLAIN ANALYZE executes writes. Read the chapters before or after; run
the experiment first if you want the plan lines to provide the examples.`,
      syntaxBreakdown: code`
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
- **SET LOCAL seq_page_cost** (variation setting)
  - What it is: A change to the modeled sequential-page price that lasts only until the transaction ends.
  - What it does here: It tests cost estimates without changing the data or hardware.
  - What it gives us: A changed cost beside the same predicate and actual row count.
- **CREATE INDEX / DROP INDEX and \gset** (controlled access-path change)
  - What they are: index DDL and a psql command that saves a one-row query result as a variable.
  - What they do here: They record the cancelled-order answer before and after adding a status index,
    then compare the same bounded query's plan and remove the test index.
  - What they give us: proof that a changed access path did not change query semantics.
`,
      caution: code`
Use only the supplied lab tables. EXPLAIN ANALYZE executes supported statements, including writes.
ROLLBACK undoes this UPDATE's logical row changes; it does not undo its WAL, page work, sequence
advances or external effects from arbitrary functions. A transaction is not a general sandbox.`,
      setup: code`
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
analyze pl_orders;`,
      code: code`
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
reset max_parallel_workers_per_gather;`,
      expectedResult: code`
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
the session's default parallel-worker limit.`,
      systemsLens: code`
An optimizer chooses using a model; execution supplies evidence for that model. Separate a wrong
cardinality estimate, an expensive access path and time spent outside the database before choosing
a remedy. The same distinction matters for schedulers and distributed query engines: returning the
right answer is a correctness condition, while measured resource use supports a performance choice.`,
      challenge: code`
Change only seq_page_cost inside a transaction and compare the same cancelled query before and
after. Predict which estimate will change and whether that alone changes the executor's page work.
The coaching hint supplies the commands and rolls back the local setting.`,
    },
    {
      slug: "statistics-drive-plans",
      tags: ["statistics", "query-planning", "explain"],
      title: "Where row estimates come from, and three ways they go wrong",
      difficulty: "intermediate",
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 35,
      sessions: 1,
      prerequisites: ["explain-analyze-buffers"],
      overview: code`
Planner statistics summarize data that may be missing, stale or correlated. Cause each case and
compare estimated rows with known answers before choosing a statistics fix. Then hold a skewed
tenant workload fixed while comparing parameter-specific and generic prepared plans.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 17 "Statistics" (sections "Basic Statistics", "Most Common Values", "Multivariate Statistics")`,
      readingNotes: code`
Chapter 17 explains sampled column summaries, most-common-value lists, histograms, and multivariate
statistics. This lesson makes those structures visible through pg_stats and pg_statistic_ext_data,
then demonstrates missing, stale, and correlated statistics. Read the chapter after the first run
so the estimates you see have a concrete explanation.`,
      revision: 4,
      studyCheckpoint: {
        core: [
          {
            source: "PostgreSQL 14 Internals",
            locator:
              `Chapter 16 §16.2, subheadings "Planning" and "Execution" (printed pp. 257–265)`,
          },
          {
            source: "PostgreSQL 14 Internals",
            locator: `Chapter 17 §§17.1–17.5 (printed pp. 271–282; stop before §17.6 on p. 283)`,
          },
        ],
        rationale: code`
You observed EXPLAIN estimates versus actuals, buffer evidence, and several ways statistics produce
bad row estimates in these two experiments. Read these focused sections to consolidate the planner pipeline
and the sampled evidence behind estimates before the next lessons turn to access paths, joins,
memory, and parallelism. Skip from the PG14 text: exact estimates, sample contents, default
statistics targets, and version-specific planner output/API names; continue to the access-path
experiment when you finish.
`,
      },
      syntaxBreakdown: code`
### In plain terms

The planner does not inspect every row each time it chooses a plan; it consults summaries produced
by ANALYZE. You will see how missing or stale summaries lead to bad row guesses, and how a known
relationship between two columns defeats the default assumption that they are independent. This
matters because a wrong row count can make PostgreSQL choose an expensive join or scan strategy.

### What you are learning

- **Sampling:** ANALYZE examines a sample rather than the entire table, trading exactness for a cheap refresh.
- **Column statistics:** Frequencies, histograms, distinct counts, and physical correlation describe a column's shape.
- **Stale statistics:** Data can change long before the planner's stored summary does, so estimates can lag reality.
- **Extended statistics:** Dependencies and distinct-count information teach the planner about correlated columns.

### Piece by piece

- **ANALYZE** (statistics-maintenance command)
  - What it is: It samples table rows and stores planner statistics.
  - What it does here: It first analyzes pl_orders and later refreshes pl_fresh and pl_geo after data changes or extended-statistics creation.
  - What it gives us: Updated reltuples and entries in pg_stats; the sample means estimates can vary slightly.
- **default_statistics_target** (planner-statistics setting)
  - What it is: A target controlling the amount of statistics collected.
  - What it does here: Its default value determines the usual sample size; the challenge raises it to test accuracy and planning overhead.
  - What it gives us: Larger MCV and histogram summaries, at the cost of more analysis and possibly planning work.
- **pg_class.relpages and reltuples** (system catalog columns)
  - What they are: Approximate physical page and row counts for a relation.
  - What they do here: They reveal reltuples = -1 before pl_fresh is analyzed and show how ANALYZE refreshes the table estimate.
  - What they give us: The baseline row count the planner multiplies by selectivity.
- **EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)** (plan command and options)
  - What it is: It runs the query, suppresses per-node timing, and omits the footer.
  - What it does here: It keeps attention on estimated rows versus actual rows for missing, stale, and extended statistics.
  - What it gives us: The rows= estimate beside actual rows, plus filter rows removed.
- **pg_stats** (readable statistics view)
  - What it is: A view over PostgreSQL's per-column statistics catalog.
  - What it does here: It shows null_frac, avg_width, n_distinct, most_common_vals, most_common_freqs, histogram_bounds, and correlation for selected columns.
  - What it gives us: The stored evidence behind an estimate; MCV frequency multiplied by reltuples approximates expected rows.
- **most_common_vals and most_common_freqs** (pg_stats arrays)
  - What they are: Matching arrays of frequently observed values and their fractions.
  - What they do here: They expose the sampled frequency of cancelled and support the hand estimate.
  - What they give us: Find cancelled in most_common_vals, then use the same position in most_common_freqs.
- **histogram_bounds** (pg_stats array)
  - What it is: Ordered boundaries for equal-frequency buckets outside the MCV list.
  - What it does here: It shows how amount and created_at ranges are summarized without listing every value.
  - What it gives us: A compact view of distribution; left truncates its text for readability.
- **CREATE STATISTICS ... (dependencies, ndistinct)** (extended-statistics DDL)
  - What it is: It defines a multi-column summary object for relationships ordinary per-column stats miss.
  - What it does here: pl_geo_stx records that city determines country and counts distinct city/country combinations.
  - What it gives us: A named object that ANALYZE fills and the final catalog query inspects.
- **pg_statistic_ext and pg_statistic_ext_data** (system catalogs)
  - What they are: Catalogs for extended-statistics definitions and collected data.
  - What they do here: The join finds pl_geo_stx and reads stxddependencies and stxdndistinct.
  - What they give us: Dependency strength such as 1.0 and the observed number of combinations.
- **array_position and left** (SQL functions)
  - What they are: array_position finds an array element's position; left keeps the first characters of text.
  - What they do here: They locate cancelled's frequency and shorten histogram output.
  - What they give us: A readable estimate and bounded terminal output.
- **\x auto** (psql display command)
  - What it is: It selects expanded output automatically when rows are too wide.
  - What it does here: It keeps the statistics columns readable while inspecting pg_stats.
  - What it gives us: One field per line when needed instead of a wrapped wide table.
- **generate_series and array subscripting** (SQL data-building tools)
  - What they are: generate_series creates test rows; array subscripting chooses a value by position.
  - What they do here: They build controlled order and city/country distributions.
  - What they give us: Known data relationships against which estimates can be checked.
- **md5, repeat and length** (payload fixture functions)
  - What they are: md5 produces a hexadecimal digest, repeat copies it and length counts characters.
  - What they do here: They create 128-character payloads for 100,000 tenant rows; the tenant-only index cannot return that payload without heap access.
  - What they give us: A controlled row width and an explicit reason that a frequent tenant may make many heap accesses.
- **PREPARE / EXECUTE / DEALLOCATE** (prepared-statement commands)
  - What they are: They store a parameterized query, run it with a supplied tenant key, and release it.
  - What they do here: They compare the frequent tenant and a rare tenant without changing query semantics.
  - What they give us: Plan and buffer evidence for parameter sensitivity; both query values are checked
    against the same payload-returning statement.
- **plan_cache_mode = force_custom_plan / force_generic_plan** (session planner controls)
  - What they are: Test-only controls that require parameter-specific or parameter-independent plans.
  - What they do here: They make the contrast explicit rather than claiming PostgreSQL's automatic
    heuristic always picks either policy.
  - What they give us: Four comparable EXPLAIN EXECUTE outputs; RESET restores ordinary behavior.
`,
      setup: code`
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
drop table if exists pl_fresh;
drop table if exists pl_geo;
drop table if exists pl_tenant;
create table pl_tenant(id int primary key, tenant_id int not null, payload text not null)
  with (autovacuum_enabled = off);
insert into pl_tenant
select g, case when g <= 90000 then 1 else 2 + (g % 999) end, repeat(md5(g::text), 4)
from generate_series(1,100000) g;
create index pl_tenant_key_idx on pl_tenant(tenant_id);
analyze pl_tenant;`,
      code: code`
set max_parallel_workers_per_gather = 0;
\x auto

-- A. No statistics at all.
create table pl_fresh (id int, customer_id int, status text, amount numeric(10,2))
  with (autovacuum_enabled = off);
insert into pl_fresh
select g, (g % 5000) + 1,
       case when g % 1000 = 0 then 'cancelled' when g % 10 = 0 then 'shipped' else 'paid' end,
       (g % 10000)::numeric / 100
from generate_series(1,100000) g;

select relpages, reltuples from pg_class where relname = 'pl_fresh';
explain (analyze, timing off, summary off) select count(*) from pl_fresh;
explain (analyze, timing off, summary off) select * from pl_fresh where status = 'cancelled';

analyze pl_fresh;
select relpages, reltuples from pg_class where relname = 'pl_fresh';
explain (analyze, timing off, summary off) select count(*) from pl_fresh;
explain (analyze, timing off, summary off) select * from pl_fresh where status = 'cancelled';

-- B. What ANALYZE actually stored.
select attname, null_frac, avg_width, n_distinct, most_common_vals, most_common_freqs, correlation
from pg_stats where tablename = 'pl_orders' and attname in ('id','status','customer_id')
order by attname;

select attname, n_distinct, left(histogram_bounds::text, 60) as first_histogram_bounds
from pg_stats where tablename = 'pl_orders' and attname in ('amount','created_at')
order by attname;

-- The 'cancelled' estimate is just its sampled frequency times reltuples.
select (most_common_freqs)[array_position(most_common_vals::text::text[], 'cancelled')] as freq,
       (most_common_freqs)[array_position(most_common_vals::text::text[], 'cancelled')]
         * (select reltuples from pg_class where relname = 'pl_orders') as estimated_rows
from pg_stats where tablename = 'pl_orders' and attname = 'status';

-- C. Stale statistics: change the data, do not tell the planner.
delete from pl_fresh where status <> 'cancelled';
explain (analyze, timing off, summary off) select count(*) from pl_fresh;
analyze pl_fresh;
explain (analyze, timing off, summary off) select count(*) from pl_fresh;

-- D. The independence assumption: city determines country.
create table pl_geo(id int, city text, country text) with (autovacuum_enabled = off);
insert into pl_geo
select g,
       (array['paris','lyon','berlin','munich','madrid','sevilla','rome','milan','tokyo','osaka'])[1 + g % 10],
       (array['fr','fr','de','de','es','es','it','it','jp','jp'])[1 + g % 10]
from generate_series(1,100000) g;
analyze pl_geo;

explain (analyze, timing off, summary off)
  select count(*) from pl_geo where city = 'paris';
explain (analyze, timing off, summary off)
  select count(*) from pl_geo where city = 'paris' and country = 'fr';

create statistics pl_geo_stx (dependencies, ndistinct) on city, country from pl_geo;
analyze pl_geo;
explain (analyze, timing off, summary off)
  select count(*) from pl_geo where city = 'paris' and country = 'fr';

select stxname, stxddependencies, stxdndistinct
from pg_statistic_ext join pg_statistic_ext_data on oid = stxoid
where stxname = 'pl_geo_stx';

-- E. Plan sensitivity under skew. Both parameter values return the same shaped
-- answer, but tenant 1 needs almost every heap row while tenant 999 is rare.
select tenant_id, count(*) as answer_rows, min(length(payload)) as payload_characters
from pl_tenant where tenant_id in (1, 999) group by tenant_id order by tenant_id;
prepare pl_tenant_q(int) as select payload from pl_tenant where tenant_id = $1;
set plan_cache_mode = force_custom_plan;
explain (analyze, buffers, timing off, summary off) execute pl_tenant_q(1);
explain (analyze, buffers, timing off, summary off) execute pl_tenant_q(999);
set plan_cache_mode = force_generic_plan;
explain (analyze, buffers, timing off, summary off) execute pl_tenant_q(1);
explain (analyze, buffers, timing off, summary off) execute pl_tenant_q(999);
reset plan_cache_mode;
deallocate pl_tenant_q;
reset max_parallel_workers_per_gather;`,
      expectedResult: code`
Before ANALYZE, pl_fresh has no collected row statistics (reltuples = -1). PostgreSQL can still
estimate using physical size and fallback selectivity. In the validated fixture it estimated about
61,789 total rows and 309 cancelled rows, against actual counts of 100,000 and 100. ANALYZE refreshes
the total and gives a sampled cancelled estimate near 100; exact samples and estimates vary.

pg_stats exposes the summary behind those estimates. Negative n_distinct is a fraction of table
rows: -1 describes a unique column, while approximately -0.1 predicts distinct values growing with
row count. It does not mean a fixed 10,000 values forever. Physical correlation describes agreement
between key order and heap order; it is different from dependence between two columns.

After deleting 99,900 rows, pl_fresh still has an old row estimate until ANALYZE refreshes it.
The remaining actual count is 100. For pl_geo, both Paris predicates return 10,000 rows. Without
extended statistics, adding country='fr' typically lowers the estimate toward 2,000 by multiplying
marginal frequencies. The dependencies object plus ANALYZE brings the estimate closer to 10,000.
This repairs a supported estimation case; it does not prove every correlation is modeled correctly.

The prepared-plan fixture has 90,000 tenant-1 payload rows and 10 tenant-999 payload rows. Compare
actual rows in all four EXPLAIN EXECUTE outputs against these answers. Validation used a custom
sequential scan for tenant 1 and custom index scan for tenant 999; a generic index plan served both,
estimating about 102 rows per value. That generic estimate is especially poor for the frequent
value. Compare buffers as well as estimates; the experiment does not predict the automatic policy.
The payload is 128 ASCII characters; the index covers tenant_id but not payload.

RESET and DEALLOCATE restore defaults and release the prepared statement. The retained pl_tenant
fixture is recreated by setup, so the variation can also run in a fresh session.`,
      systemsLens: code`
Missing data, stale data and a poor model need different interventions. A larger statistics sample
may improve a noisy frequency estimate without fixing a wrong independence assumption. Likewise,
one reusable generic plan can hide important workload classes behind an average. Identify the input
that failed, then measure the chosen remedy on frequent and rare requests before adopting it.`,
      challenge: code`
Raise default_statistics_target for one analysis of pl_orders, then compare the cancelled estimate
with the known 100-row answer. Restore the setting and re-analyze afterwards. Does a better estimate
necessarily change the plan, and what extra analysis work did you buy?`,
    },
    {
      slug: "index-scan-vs-seq-scan-crossover",
      tags: [
        "index-scans",
        "query-planning",
        "index-access-methods",
        "explain",
      ],
      title: "The crossover: when an index stops being worth it",
      difficulty: "intermediate",
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 20,
      sessions: 1,
      prerequisites: ["statistics-drive-plans"],
      revision: 4,
      overview: code`
An index is not "faster". It is a random-access strategy that wins below some selectivity and loses
above it, and the crossover point is a function of how many rows match, how well the heap is
ordered, and what the planner believes about your disks. Here you sweep the selectivity of one
predicate from 0.1% to 80%, watch the plan change shape, force the losing plan to see what it would
have cost, and then move the crossover by changing a single hardware constant.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 20 "Index Scans" (sections "Regular Index Scans", "Comparison of Various Access Methods"); Chapter 18 "Table Access Methods" (section "Sequential Scans")`,
      readingNotes: code`
Chapter 20 compares regular, bitmap, and index-only access paths, while Chapter 18 explains the
sequential scan and its cost. This experiment sweeps selectivity, disables paths for comparison,
and changes random_page_cost to show how the hardware model moves the crossover. Read the chapters
after running the sweep so the plan changes have concrete examples.`,
      syntaxBreakdown: code`
### In plain terms

An index can avoid reading most table pages, but it may become more expensive than reading the table
straight through when many rows match. This lesson varies the percentage of matching rows, compares
index, bitmap, and sequential plans, and then changes the planner's belief about random I/O. You
will see that a plan change can come from the cost model even when the data never changes.

### What you are learning

- **Selectivity:** The fraction of rows a condition keeps determines whether random lookups are worthwhile.
- **Bitmap access:** PostgreSQL can collect matching row addresses and visit each heap page once.
- **Correlation:** Physical ordering changes how many pages an index lookup must fetch.
- **Planner switches:** enable settings bias path selection for diagnosis; they do not remove an operation.

### Piece by piece

- **EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF)** (plan command and options)
  - What it is: It executes the query, reports buffers, suppresses timing, and omits the footer.
  - What it does here: It compares actual rows and page counts at 0.1%, 50%, and 80% selectivity.
  - What it gives us: Node shape, estimated and actual rows, Heap Blocks: exact, and shared buffer totals.
- **Index Scan** (plan node)
  - What it is: It walks the B-tree and fetches each matching heap tuple as it finds the index entry.
  - What it does here: The forced half-table plan performs many heap visits.
  - What it gives us: Index Scan in the plan and a high buffer count when matching rows are scattered.
- **Bitmap Index Scan and Bitmap Heap Scan** (plan nodes)
  - What they are: The first collects tuple addresses; the second groups those addresses by heap page.
  - What they do here: They reduce repeated visits for the 100-row and 50000-row predicates.
  - What they give us: Heap Blocks: exact counts distinct pages; Recheck Cond shows the predicate checked at the heap.
- **Seq Scan** (plan node)
  - What it is: A sequential scan reads every table page and tests the filter on each row.
  - What it does here: It wins when the predicate keeps most rows.
  - What it gives us: Rows Removed by Filter and shared hit near the table's page count.
- **enable_seqscan and enable_bitmapscan** (session planner settings)
  - What they are: Debugging controls that add a large cost penalty to a path when set off.
  - What they do here: They expose the losing alternative for an apples-to-apples buffer comparison.
  - What they give us: A forced plan, but not a prohibition; PostgreSQL can still use the disabled path if necessary.
- **random_page_cost** (planner setting)
  - What it is: The modeled price of a random page relative to a sequential page.
  - What it does here: Values 4 and 1.1 make the same query prefer different plans with identical data.
  - What it gives us: A visible crossover caused by the storage assumption, not by runtime measurements.
- **pg_stats.correlation** (statistics column)
  - What it is: A value from -1 to 1 describing agreement between logical key order and physical row order.
  - What it does here: It explains why id ranges are cheaper than scattered customer_id matches.
  - What it gives us: The correlation values for id and customer_id to connect physical layout to plan cost.
- **CREATE INDEX and ANALYZE** (index and statistics commands)
  - What they are: CREATE INDEX builds a searchable B-tree; ANALYZE refreshes planner summaries.
  - What they do here: The customer_id index supplies index and bitmap paths, and statistics supply selectivity estimates.
  - What they give us: A repeatable plan comparison over generated orders.
- **\gset and equality comparison** (psql result capture and SQL predicate)
  - What they are: \gset saves one count into a psql variable; equality compares the before and after values.
  - What they do here: They check that planner controls changed the path, not the rows selected by the
    small-selectivity predicate.
  - What they give us: unchanged_answer = true after the compared queries, followed by resetting session settings.
`,
      setup: code`
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
create index if not exists pl_orders_cust_idx on pl_orders(customer_id);
analyze pl_orders;`,
      code: code`
set max_parallel_workers_per_gather = 0;

select count(*) as small_before from pl_orders where customer_id <= 5 \gset

-- 1. 0.1% of the table: 100 rows out of 100000.
explain (analyze, buffers, timing off, summary off)
  select * from pl_orders where customer_id <= 5;

-- 2. 50%.
explain (analyze, buffers, timing off, summary off)
  select * from pl_orders where customer_id <= 2500;

-- 3. 80%: the plan changes.
explain (analyze, buffers, timing off, summary off)
  select * from pl_orders where customer_id <= 4000;

-- 4. What the index path would have cost at 80%. enable_seqscan=off does not
-- forbid the seq scan, it just makes it look enormously expensive.
set enable_seqscan = off;
explain (costs on, timing off, summary off)
  select * from pl_orders where customer_id <= 4000;
reset enable_seqscan;

-- 5. Why the bitmap exists. Force a plain index scan over half the table and
-- count the buffers.
set enable_seqscan = off;
set enable_bitmapscan = off;
explain (analyze, buffers, timing off, summary off)
  select * from pl_orders where customer_id <= 2500;
reset enable_seqscan;
reset enable_bitmapscan;

-- 6. Move the crossover by changing one hardware assumption. Same data, same
-- statistics, same query: only the disk model changes.
set enable_bitmapscan = off;
set random_page_cost = 4;
explain (costs on, timing off, summary off)
  select * from pl_orders where customer_id <= 50;
set random_page_cost = 1.1;
explain (costs on, timing off, summary off)
  select * from pl_orders where customer_id <= 50;
reset random_page_cost;
reset enable_bitmapscan;

-- 7. Physical order is the other input: correlation decides how many heap
-- pages a given number of rows costs you.
select attname, correlation from pg_stats
where tablename = 'pl_orders' and attname in ('id','customer_id') order by attname;
select count(*) as small_after from pl_orders where customer_id <= 5 \gset
select :small_before = :small_after as unchanged_answer;
reset max_parallel_workers_per_gather;`,
      expectedResult: code`
The predicates return exactly 100, 50,000 and 80,000 rows. In the validated fixture the default paths
were bitmap, bitmap and sequential respectively. Small matches used 23 buffer accesses; the half
range used about 584; the broad scan visited the 1,031-page heap. Sampling, cost settings and cache
state can move the crossover, so report your plan instead of treating these thresholds as universal.

The forced plain index scan returned the same 50,000 half-range rows but counted about 50,049 buffer
accesses. These are repeated visits, not 50,049 distinct pages or device operations. The bitmap path
groups tuple locations by heap page. At very low bitmap memory, lossy pages also require rechecks.

With bitmap scans disabled, changing only random_page_cost from 4 to 1.1 changed the 1% predicate
from sequential to index access in validation. That is a change in the model, not a hardware
measurement. Record whether your plan changes. The final unchanged_answer check is true and all
session planner controls are reset. No global setting was changed.`,
      systemsLens: code`
An access path trades index traversal and scattered row fetches against reading a larger region in
order. Selectivity, physical correlation, covering access and caching all influence that tradeoff;
there is no universal percentage at which indexes stop helping. Diagnostic planner switches let you
measure a hypothesis. A production setting needs representative workload evidence, including the
queries it makes worse.`,
      challenge: code`
Change only the matching customer range from 5 to 4000 using the same projection. Record rows
returned, plan shape and buffer work at both bounds. Explain why differing answers are intentional
in a selectivity sweep, whereas comparing two access paths at one bound must preserve the answer.`,
    },
    {
      slug: "join-strategies",
      tags: [
        "nested-loop",
        "hashing",
        "sorting-and-merging",
        "work-mem",
        "query-planning",
      ],
      title: "Three ways to join, and the memory that decides between them",
      difficulty: "intermediate",
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 25,
      sessions: 1,
      prerequisites: ["index-scan-vs-seq-scan-crossover"],
      revision: 4,
      overview: code`
Compare PostgreSQL's nested-loop, hash and merge joins over the same tables. Read the inner node's
loops to distinguish repeated probes from cached lookups, then lower the memory budget and inspect
hash batches. Use the known join answer to keep the experiment about execution work.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 21 "Nested Loop" (section "Nested Loop Joins"); Chapter 22 "Hashing" (section "Hash Joins"); Chapter 23 "Sorting and Merging" (sections "Merge Joins", "Comparison of Join Methods")`,
      readingNotes: code`
Chapters 21–23 describe the three join algorithms that this lesson forces over the same tables.
The experiment adds EXPLAIN buffer evidence, Memoize hit counts, and a deliberately undersized
work_mem so a hash join spills into batches. Read the chapters before or after; the forced plans
make the trade-offs especially easy to compare with the book's diagrams.`,
      syntaxBreakdown: code`
### In plain terms

A join must match rows from two tables, and PostgreSQL has three different ways to do it. This
experiment runs the same join as a hash join, merge join, and nested loop, then reduces work_mem so
the hash table no longer fits in memory. The plan tells you not only which method won, but whether
it repeatedly probed an index, reused a cache, or wrote temporary batches to disk.

### What you are learning

- **Nested loop:** Repeats an inner lookup for each outer row, whose cost depends on outer rows, inner access and repeated-key reuse.
- **Hash join:** Builds an in-memory key table for one side and probes it with the other side.
- **Merge join:** Consumes two inputs in key order and avoids sorting when both already provide that order.
- **Memory-driven batching:** A hash table that exceeds its work_mem-based allowance is partitioned into temporary batches rather than failing.

### Piece by piece

- **EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF)** (plan command and options)
  - What it is: It executes the join, reports page activity, hides timing, and omits the footer.
  - What it does here: It makes each forced join shape and its resource use visible.
  - What it gives us: Node names, actual rows, loops, shared buffers, and temporary blocks.
- **enable_hashjoin, enable_mergejoin, enable_nestloop, and enable_memoize** (session settings)
  - What they are: Planner switches used to discourage a join algorithm or the inner-result cache.
  - What they do here: They isolate one strategy at a time and remove Memoize for the small nested-loop comparison.
  - What they give us: Comparable plans; reset restores normal planning.
- **Nested Loop** (join plan node)
  - What it is: It runs the inner plan once for every row from the outer plan.
  - What it does here: It repeats primary-key probes for selective and full joins.
  - What it gives us: The inner node's rows and time are per-loop averages; multiply by loops for total work.
- **Hash Join and Hash** (join and build nodes)
  - What they are: Hash Join probes a hash table; Hash builds that table from the selected build input.
  - What they do here: The 5000 customer rows become the build side, then 100000 orders probe them.
  - What they give us: Buckets, Batches, and Memory Usage; Batches greater than 1 proves disk partitioning.
- **Merge Join** (join plan node)
  - What it is: It advances two sorted inputs and emits matching keys.
  - What it does here: Existing indexes provide order, avoiding Sort nodes.
  - What it gives us: Ordered index scans and their Heap Fetches and buffers.
- **Memoize** (inner-result cache node)
  - What it is: A cache keyed by values from the outer row.
  - What it does here: It remembers each customer lookup while 100000 orders repeat 5000 customer IDs.
  - What it gives us: Hits, Misses, Evictions, and Memory Usage; inner loops reveal misses.
- **hash_mem_multiplier** (hash budget multiplier)
  - What it is: A factor applied to work_mem for hash operations.
  - What it does here: The low-memory trial sets it to 2 and resets it afterwards.
  - What it gives us: An explicit hash budget rather than assuming it equals work_mem.
- **LATERAL ... OFFSET 0** (variation's correlated subquery)
  - What it is: LATERAL lets the inner query refer to the current outer order; OFFSET 0 is a deliberate optimization barrier in this PostgreSQL experiment.
  - What it does here: It keeps the customer lookup inside the nested loop while only Memoize changes. Without it, the planner may reverse the join order.
  - What it gives us: A clearer comparison of 5,000 cached misses versus 100,000 uncached customer probes; this barrier is not a production tuning recommendation.
- **work_mem** (per-node memory setting)
  - What it is: A base allowance for sorts and other memory-using operations; hash operations apply hash_mem_multiplier. Multiple nodes and workers can consume memory concurrently.
  - What it does here: 64kB forces the customer hash table into multiple batches.
  - What it gives us: A changed Batches value and temp read/written blocks in BUFFERS.
`,
      setup: code`
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
create index if not exists pl_orders_cust_idx on pl_orders(customer_id);
drop table if exists pl_customers;
create table pl_customers(id int primary key, name text not null, region text not null)
  with (autovacuum_enabled = off);
insert into pl_customers
select g, 'customer ' || g, (array['us-east','us-west','eu-west','ap-south'])[1 + g % 4]
from generate_series(1,5000) g;
analyze pl_orders;
analyze pl_customers;`,
      code: code`
set max_parallel_workers_per_gather = 0;
select count(*) as full_join_before
from pl_orders o join pl_customers c on c.id = o.customer_id \gset

-- 1. Join 100 of the 100000 orders. Default plan.
explain (analyze, buffers, timing off, summary off)
  select o.id, c.name from pl_orders o join pl_customers c on c.id = o.customer_id
  where o.customer_id <= 5;

-- 2. The same selective join as a pure nested loop: inner side re-probed once
-- per outer row.
set enable_hashjoin = off;
set enable_mergejoin = off;
set enable_memoize = off;
explain (analyze, buffers, timing off, summary off)
  select o.id, c.name from pl_orders o join pl_customers c on c.id = o.customer_id
  where o.customer_id <= 5;
reset enable_hashjoin;
reset enable_mergejoin;
reset enable_memoize;

-- 3. Join everything. Default plan.
explain (analyze, buffers, timing off, summary off)
  select count(*) from pl_orders o join pl_customers c on c.id = o.customer_id;

-- 4. The same full join as a merge join.
set enable_hashjoin = off;
set enable_nestloop = off;
explain (analyze, buffers, timing off, summary off)
  select count(*) from pl_orders o join pl_customers c on c.id = o.customer_id;
reset enable_hashjoin;
reset enable_nestloop;

-- 5. The same full join as a nested loop, with the planner's cache in front of
-- the inner index scan.
set enable_hashjoin = off;
set enable_mergejoin = off;
explain (analyze, buffers, timing off, summary off)
  select count(*) from pl_orders o join pl_customers c on c.id = o.customer_id;
reset enable_hashjoin;
reset enable_mergejoin;

set hash_mem_multiplier = 2;
-- 6. Now starve the hash table. 5000 build rows need about 240 kB.
set work_mem = '64kB';
explain (analyze, buffers, timing off, summary off)
  select count(*) from pl_orders o join pl_customers c on c.id = o.customer_id;
reset work_mem;
reset hash_mem_multiplier;
select count(*) as full_join_after
from pl_orders o join pl_customers c on c.id = o.customer_id \gset
select :full_join_before = :full_join_after as unchanged_join_answer;
reset max_parallel_workers_per_gather;`,
      expectedResult: code`
The selective join returns 100 rows. In validation its default hash path used about 60 buffer
accesses; the forced nested loop used about 323. Its inner index scan reported actual rows=1 and
loops=100: approximately 100 returned inner rows in total, with buffers already accumulated.

The full COUNT query returns 100,000 under every tested policy. Its default hash build had 5,000
customer rows and one batch. The forced merge path used ordered indexes; because the fresh tables
had not been vacuumed, their index-only scans still fetched heap tuples for visibility. This makes
the comparison conditional on that physical state, not a universal ranking of join algorithms.

The full nested loop used Memoize in validation: 95,000 hits, 5,000 misses and no evictions. The
inner index scan ran 5,000 times, while Memoize ran 100,000 times. Distinguish those two loops before
estimating work. A different plan or smaller cache requires interpreting its actual counters.

At work_mem = 64kB with hash_mem_multiplier = 2, the hash join used four batches and 236 temporary
blocks read/written. It partitions build and probe rows, then processes matching partitions; it does
not rescan the entire probe relation for every batch. Batches and temp I/O establish spilling, with
variable exact sizes. unchanged_join_answer is true; all session controls are reset.`,
      systemsLens: code`
The useful choice is how to match rows while bounding repeated work and memory demand. A local
nested-loop index probe is not itself a network N+1 request; remote probes add a different latency
boundary. Distributed joins add data placement and transfer costs too. Hash partitioning can make
an oversized working set manageable, while sorted inputs or repeated keys may favor other paths.
Measure the actual inputs and retained state instead of memorizing one preferred algorithm.`,
      challenge: code`
Hold the full nested-loop join fixed and toggle only Memoize. Compare inner index loops and
buffers, and check that both runs return 100,000. Decide what repeated-key distribution makes the
cache useful and what an eviction would mean.`,
    },
    {
      slug: "work-mem-spills-to-disk",
      tags: ["work-mem", "sorting-and-merging", "hashing", "capacity"],
      title: "work_mem: quicksort, top-N heapsort, external merge, and hash spill",
      difficulty: "intermediate",
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 20,
      sessions: 1,
      prerequisites: ["join-strategies"],
      revision: 4,
      overview: code`
Run the same bounded sort at three memory budgets and observe when it writes temporary files.
Contrast a full sort with top-N sorting, then inspect a spilling hash aggregate. Relate the measured
work to per-operation and per-worker budgets before making a concurrency decision.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 23 "Sorting and Merging" (section "Sorting"); Chapter 22 "Hashing" (section "Hash Joins"); Chapter 16 "Query Execution Stages" (section "Simple Query Protocol")`,
      readingNotes: code`
Chapter 23 describes in-memory and external sorting, and Chapter 22 describes hash operations that
partition when memory is insufficient. Chapter 16 provides execution-stage context. This lesson
adds work_mem threshold experiments and scoped temporary-file counter deltas. Read the
chapters after the run to connect Sort Method and Batches lines to the algorithms.`,
      syntaxBreakdown: code`
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
`,
      setup: code`
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
analyze pl_orders;`,
      code: code`
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
reset max_parallel_workers_per_gather;`,
      expectedResult: code`
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
still consumes space and I/O and can hit other resource limits.`,
      systemsLens: code`
An algorithm can trade memory for temporary storage while preserving its result. That changes its
resource demand and latency; it does not establish a fixed slowdown factor. Budget across operations
that can overlap, workers and active requests. Raising a per-operation allowance may help one query
while increasing memory pressure for the workload as a whole.`,
      challenge: code`
Keep the sorted query and its projection fixed while changing work_mem from 64kB to 32MB. Capture
the final ordered id under both settings and compare it as well as Sort Method and temp blocks.
Use the evidence to distinguish a changed resource path from a changed query answer.`,
    },
    {
      slug: "parallel-query",
      tags: ["parallel-query", "query-planning", "process-model", "capacity"],
      title: "Parallel query: Gather, workers planned vs launched, and when it hurts",
      difficulty: "intermediate",
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 20,
      sessions: 1,
      prerequisites: ["process-model", "explain-analyze-buffers"],
      revision: 4,
      overview: code`
A parallel plan requests workers and combines their results with a Gather or Gather Merge node.
Compare the requested worker count with the number actually launched, then measure the same answer
with serial and parallel execution. Worker availability and coordination overhead are part of the
experiment, so neither speedup nor slowdown is predetermined.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 18 "Table Access Methods" (sections "Parallel Plans", "Parallel Sequential Scans", "Parallel Execution Limitations")`,
      readingNotes: code`
Chapter 18 explains parallel plans, parallel sequential scans, worker limits, and restrictions.
This lesson makes those limits visible through Workers Planned versus Workers Launched, Gather
Merge, and an unsafe function, then measures the overhead on the local lab. Read the chapter before
or afterward; the plan output is a useful live companion to its parallel diagrams.`,
      syntaxBreakdown: code`
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
`,
      caution: code`
Every setting here is changed with a per-session SET. Do not use ALTER SYSTEM on a shared lab: the
worker pool is cluster-wide and you would be changing it for everyone.`,
      setup: code`
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
drop function if exists pl_unsafe(int);`,
      code: code`
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
where backend_type = 'parallel worker' and leader_pid = pg_backend_pid();`,
      expectedResult: code`
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
All changed settings are reset and the temporary demonstration function is dropped.`,
      systemsLens: code`
Planning for parallel work and acquiring resources to execute it are separate events. A fan-out
service or distributed query may receive less capacity than its plan assumed. Measure launch counts,
coordination cost and available resources alongside elapsed time. Per-worker memory demand also
matters: improving one request's latency can reduce how many requests the system sustains.`,
      challenge: code`
Compare one and four requested workers with the same query and the same parallel cost settings.
Record workers actually launched and the unchanged count. What evidence would you need before
increasing parallelism for a service that runs many queries concurrently?`,
    },
    {
      slug: "pg-stat-statements-as-tracing",
      tags: [
        "pg-stat-statements",
        "observability",
        "query-planning",
        "explain",
      ],
      title: "pg_stat_statements: normalized aggregate workload telemetry",
      difficulty: "intermediate",
      safetyLevel: "privileged",
      runIn: "tool",
      estimatedMinutes: 20,
      sessions: 1,
      prerequisites: ["install-lab-extensions", "explain-analyze-buffers"],
      revision: 4,
      overview: code`
EXPLAIN tells you about one query you already suspect. pg_stat_statements tells you which normalized
query shape accumulated work. It keeps counters per fingerprint, user, database and top-level status; this lesson
captures scoped before/after counters around a bounded workload and compares them with client timing.
It cannot reconstruct request order, a trace, or a p99 distribution.`,
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 16 "Query Execution Stages".`,
      syntaxBreakdown: code`
### In plain terms

This lesson turns query history into aggregate workload telemetry. PostgreSQL replaces literal values with
placeholders and accumulates counts, times, rows, and page activity for each normalized query shape.
You will rank a workload, then create a fast and a slow case that share one fingerprint and two
similar-looking IN queries that do not, exposing what aggregate observability hides.

### What you are learning

- **Normalization:** Literal values become placeholders so repeated query shapes share one row.
- **Capacity ranking:** Total execution time shows aggregate cost better than call count or mean time.
- **Distribution loss:** A mean can hide a bimodal workload; min, max, and standard deviation help.
- **Fingerprint boundaries:** Different IN-list lengths can create separate entries and fragment monitoring.

### Piece by piece

- **CREATE EXTENSION pg_stat_statements** (extension setup)
  - What it is: It installs the view and functions that collect normalized statement statistics; shared_preload_libraries must load it at server start.
  - What it does here: The lab setup makes the extension available before the workload runs.
  - What it gives us: The pg_stat_statements view.
- **temporary baseline table and queryid** (delta capture)
  - What they are: A session-local table holding counters before the workload and the normalized
    statement identifier that joins later counters to it.
  - What they do here: They calculate owned user/database deltas without resetting shared telemetry.
  - What they give us: Calls and execution-time increments for this scope during the interval; another session
    using the same role and database can contribute.
- **pg_stat_statements** (statistics view)
  - What it is: A cluster-wide view with one aggregate row per normalized statement fingerprint, role, database and top-level status.
  - What it does here: It ranks statements by total time and displays min, mean, max, standard deviation, planning time, and I/O counters.
  - What it gives us: calls, total_exec_time, mean_exec_time, rows, shared_blks_hit/read, temp blocks, and query text.
- **dbid and current_database()** (database identity expressions)
  - What they are: dbid identifies the database in the view; current_database returns this connection's name.
  - What they do here: They scope baselines and reports so unrelated databases do not pollute the lesson.
  - What they give us: A filter matching the OID selected from pg_database.
- **pg_database.oid** (system catalog column)
  - What it is: PostgreSQL's internal identifier for a database.
  - What it does here: The scalar subquery supplies the database-specific baseline and report filter.
  - What it gives us: The numeric dbid used by pg_stat_statements.
- **round, coalesce, and left** (SQL functions)
  - What they are: round formats numbers; coalesce treats a newly seen queryid's prior counter as zero; left shortens query text.
  - What they do here: They make deltas and fingerprints readable.
  - What they give us: Stable terminal columns for bounded counter increments.
- **pg_stat_statements.track_planning** (extension setting)
  - What it is: A switch for collecting planning-time totals in addition to execution time.
  - What it does here: SHOW reports whether new planning times are collected; stored totals can include earlier periods with tracking enabled.
  - What it gives us: A setting value explaining whether planning overhead is represented.
- **toplevel and pg_stat_statements_info** (scope and retention evidence)
  - What they are: toplevel distinguishes direct client statements from nested statements; the info view reports full resets and entry deallocations.
  - What they do here: Baselines and reports select only top-level statements. A final reset timestamp and deallocation comparison checks for visible retention changes.
  - What they give us: interval_retained must be true before interpreting deltas. It cannot detect every targeted reset; coordinate with other users of this lab.
- **pg_stat_statements.max** (extension capacity setting)
  - What it is: The maximum number of statement entries retained.
  - What it does here: SHOW exposes the finite cardinality budget.
  - What it gives us: The eviction limit to consider when query text creates many fingerprints.
- **\x auto** (psql display command)
  - What it is: It switches to expanded output when a row is too wide for the terminal.
  - What it does here: It keeps wide statistics rows readable.
  - What it gives us: One field per line when needed and compact output otherwise.
- **\timing on/off** (psql display command)
  - What it is: It toggles client-side elapsed-time display.
  - What it does here: It bounds the observed workload with timings from this psql client.
  - What it gives us: Per-command elapsed time alongside aggregate server counters.
- **generate_series, CREATE INDEX, and ANALYZE** (setup tools)
  - What they are: The function emits test rows; the command builds the customer index; ANALYZE refreshes estimates.
  - What they do here: They create the repeatable workload whose statements are recorded by the extension.
  - What they give us: Known scan and join shapes to rank by calls, time, and buffers.
`,
      caution: code`
pg_stat_statements is shared by every database in the cluster. Do not reset it for this lesson:
snapshot the current user's counters in the current database and calculate a delta instead.`,
      setup: code`
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
create index if not exists pl_orders_cust_idx on pl_orders(customer_id);
drop table if exists pl_customers;
create table pl_customers(id int primary key, name text not null, region text not null)
  with (autovacuum_enabled = off);
insert into pl_customers
select g, 'customer ' || g, (array['us-east','us-west','eu-west','ap-south'])[1 + g % 4]
from generate_series(1,5000) g;
analyze pl_orders;
analyze pl_customers;`,
      code: code`
\x auto
set max_parallel_workers_per_gather = 0;

-- Capture only this user's counters in this database; do not reset shared telemetry.
drop table if exists pg_temp.pl_stmt_before;
select stats_reset as reset_before, dealloc as evictions_before
from pg_stat_statements_info \gset
create temp table pl_stmt_before as
select queryid, calls, total_exec_time
from pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
  and userid = (select usesysid from pg_user where usename = current_user)
  and toplevel;

-- A tiny workload: the same shape three times with different literals, one
-- expensive scan, one join.
\timing on
select count(*) from pl_orders where customer_id = 7;
select count(*) from pl_orders where customer_id = 42;
select count(*) from pl_orders where customer_id = 99;
select count(*) from pl_orders where status = 'cancelled';
select sum(amount) from pl_orders o join pl_customers c on c.id = o.customer_id
  where c.region = 'eu-west';
\timing off

-- Rank this bounded workload by its scoped execution-time delta.
select s.queryid, s.calls - coalesce(b.calls, 0) as calls_delta,
       round((s.total_exec_time - coalesce(b.total_exec_time, 0))::numeric, 2) as exec_ms_delta,
       left(s.query, 58) as query
from pg_stat_statements s left join pl_stmt_before b using (queryid)
where s.dbid = (select oid from pg_database where datname = current_database())
  and s.userid = (select usesysid from pg_user where usename = current_user)
  and s.toplevel
  and s.query like '%pl_orders%'
  and s.calls > coalesce(b.calls, 0)
order by exec_ms_delta desc;

-- Start a second bounded interval. min/mean/max below remain lifetime aggregates for a fingerprint.
truncate pl_stmt_before;
insert into pl_stmt_before
select queryid, calls, total_exec_time
from pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
  and userid = (select usesysid from pg_user where usename = current_user)
  and toplevel;

\timing on
select count(*) from pl_orders where customer_id <= 1;
select count(*) from pl_orders where customer_id <= 1;
select count(*) from pl_orders where customer_id <= 1;
select count(*) from pl_orders where customer_id <= 5000;

-- Second: the fingerprint. These operations have different list lengths and return different counts.
select count(*) from pl_orders where id in (1,2);
select count(*) from pl_orders where id in (1,2,3);
\timing off

select s.calls - coalesce(b.calls, 0) as calls_delta,
       round(min_exec_time::numeric, 2) as min_ms,
       round(mean_exec_time::numeric, 2) as mean_ms,
       round(max_exec_time::numeric, 2) as max_ms,
       round(stddev_exec_time::numeric, 2) as stddev_ms,
       round(total_plan_time::numeric, 2) as plan_ms,
       left(s.query, 55) as query
from pg_stat_statements s left join pl_stmt_before b using (queryid)
where s.dbid = (select oid from pg_database where datname = current_database())
  and s.userid = (select usesysid from pg_user where usename = current_user)
  and s.toplevel
  and s.query like '%pl_orders%'
  and s.calls > coalesce(b.calls, 0)
order by s.total_exec_time - coalesce(b.total_exec_time, 0) desc;

show pg_stat_statements.track_planning;
show pg_stat_statements.max;
select stats_reset = :'reset_before'::timestamptz
  and dealloc = :evictions_before as interval_retained
from pg_stat_statements_info;
drop table pl_stmt_before;
reset max_parallel_workers_per_gather;`,
      expectedResult: code`
Use a quiet scratch database: another session using the same role and tables can
contribute to these scoped counters. interval_retained must be true; a visible reset or entry eviction makes
the before/after comparison unreliable and calls for a fresh interval.

No reset runs. The first \timing output is the psql client's elapsed time for each of the five
commands. It bounds this client-observed workload; pg_stat_statements is an aggregate server view
and cannot supply a request order, a trace, or a percentile distribution.

The first report contains only statements whose counters increased after the baseline, scoped to
the current user and database. Expect three rows: the normalized customer lookup with
calls_delta = 3, the cancelled-status count with calls_delta = 1, and the join with calls_delta = 1.
Their execution-time deltas vary with cache state and concurrent work. The three customer literals
collapse to a query containing customer_id = $1, demonstrating normalization. Rank this bounded
set by exec_ms_delta when deciding which shape consumed capacity in this interval.

The second report again contains only queryids whose calls increased after its new baseline. The
customer_id <= $1 fingerprint has calls_delta = 4; the two IN-list lengths appear as separate
fingerprints, each with calls_delta = 1. Its min_ms, mean_ms, max_ms, and stddev_ms are lifetime
aggregates for that fingerprint, not four individually recorded requests and not interval
percentiles. A large spread can suggest mixed behavior, but it cannot reconstruct the order or
distribution of executions. Different IN-list lengths can fragment one logical application query
across many entries.

The SHOW values report this server's extension configuration. With track_planning off, new planning
time is not collected; previously retained totals need not be zero. pg_stat_statements.max is the
finite entry budget.`,
      systemsLens: code`
pg_stat_statements is normalized aggregate workload telemetry. Query text identifies a fingerprint,
and literal normalization avoids creating a row for every user id or order id. Snapshot-and-delta
turns its counters into an interval measurement without erasing other users' evidence, provided
the retained state stays intact.
That supports capacity ranking: a cheap statement called often can cost more than one slow report.

It does not retain individual requests, ordering, histograms, or percentiles. Its min, mean, max,
and standard deviation summarize the fingerprint's retained aggregate state, so use them as clues
and combine them with bounded client timings and other telemetry when you need latency behavior.
Fingerprint boundaries are also a design constraint: varying IN-list lengths can split one logical
operation into many entries and consume the finite statement budget.`,
      challenge: code`
Snapshot the view into a table, run a workload, snapshot again, and difference the two by queryid
to get a real per-interval rate. Keep the dbid and userid filters, and compare the delta with the
client's \timing output. Then inspect SHOW pg_stat_statements.track_planning and explain whether this
server can report planning totals without a configuration change.`,
    },
  ],
};
