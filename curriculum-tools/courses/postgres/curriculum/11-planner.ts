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
      overview: code`
A plan node prints two triples: what the planner predicted (cost, rows, width) and what execution
actually did (time, rows, loops). Everything else in this module is about the gap between them. In
this lesson you take one seq scan apart, reproduce its total cost by hand from the cost constants
and pg_class, watch the row estimate miss by a third, and see the buffer counts that are the real
currency of I/O.`,
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
  - What it gives us: shared hit means an 8 KB page was already in shared_buffers; shared read means PostgreSQL had to obtain it from the OS; dirtied and written indicate changed pages.
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
  - What it is: A relation option that prevents automatic vacuum and analysis for this table.
  - What it does here: It keeps background maintenance from changing measured pages.
  - What it gives us: A controlled experiment whose maintenance is explicit ANALYZE only.
- **SET seq_page_cost and enable_seqscan = off** (challenge settings)
  - What they are: The first changes the modeled sequential-page price; the second penalizes sequential paths.
  - What they do here: They test cost and the index alternative without changing data.
  - What they give us: A changed cost and a forced comparison plan.
`,
      caution: code`
EXPLAIN ANALYZE executes the statement, including INSERT, UPDATE, DELETE and DDL. The last step
below proves it, inside a transaction that rolls back. Never run EXPLAIN ANALYZE on a writing
statement in production without a surrounding transaction you intend to abort.`,
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

-- 4. The same table by primary key: three buffers instead of a thousand.
explain (analyze, buffers) select * from pl_orders where id = 42424;

-- 5. Aggregation adds a node; each node reports its own subtree's buffers.
explain (analyze, buffers) select count(*) from pl_orders;

-- 6. EXPLAIN ANALYZE runs the statement. Prove it and undo it.
begin;
explain (analyze) update pl_orders set note = 'x' where status = 'cancelled';
select count(*) as rows_actually_updated from pl_orders where note = 'x';
rollback;
select count(*) as rows_after_rollback from pl_orders where note = 'x';`,
      expectedResult: code`
Step 1: "Seq Scan on pl_orders  (cost=0.00..2281.00 rows=73 width=47)" with
"Filter: (status = 'cancelled'::text)". The 100000-row table really contains 100 'cancelled' rows;
the rows= estimate is a sampled one and lands somewhere around 70-120 depending on which 30000 rows
ANALYZE happened to look at, so your number will differ from 73. The COST, on the other hand, is
exactly reproducible.

Step 2 reproduces that number exactly: relpages 1031, reltuples 100000, page_cost 1031,
tuple_cost 1000, filter_cost 250, predicted_total_cost 2281. The cost is not milliseconds and not
bytes; it is 1031 sequential pages plus 100000 rows examined plus 100000 filter evaluations, in
units where one sequential page read is 1.0.

Step 3 adds the actual side:

  Seq Scan on pl_orders  (cost=0.00..2281.00 rows=73 width=47)
    (actual time=0.172..18.559 rows=100 loops=1)
    Filter: (status = 'cancelled'::text)
    Rows Removed by Filter: 99900
    Buffers: shared hit=1031
  Execution Time: about 19 ms

Estimated 73 rows, got 100: a 27% miss on this run, and the miss changes size every time you
ANALYZE, because the estimate is a sampled frequency (lesson 2 of this module derives it).
shared hit=1031 is exactly relpages: the scan touched every page of the table and found all of them
in shared_buffers, so read=0. "Rows Removed by Filter: 99900" is the work the plan did to return
100 rows.

Step 4: "Index Scan using pl_orders_pkey ... (cost=0.29..8.31 rows=1) (actual rows=1 loops=1)" with
"Buffers: shared hit=3" - two btree levels plus one heap page. Same table, same server, 1031
buffers versus 3. A small "Planning: Buffers:" block also appears (single digits here, a few dozen
the very first time a fresh session plans against this table): planning itself reads the catalog
and the statistics.

Step 5 shows the tree: "Aggregate (cost=2281.00..2281.01 rows=1)" over
"Seq Scan (cost=0.00..2031.00 rows=100000 width=0)". Without a filter the scan costs 2031 =
1031 + 1000, the missing 250 being the filter evaluations, and the Aggregate adds 250 of its own
for 100000 cpu_operator_cost transitions. Both nodes report Buffers: shared hit=1031, because a
node's buffer counts include its children.

Step 6: the plan is "Update on pl_orders  (cost=0.00..2281.00 rows=0)" over a seq scan with
"Rows Removed by Filter: 99900", and rows_actually_updated is 100 - EXPLAIN ANALYZE really did the
UPDATE. After ROLLBACK, rows_after_rollback is 0.`,
      systemsLens: code`
A cost model is a portable performance simulator built from four constants and two cached counters.
That is a deliberate trade: the planner must decide in microseconds, so it approximates rather than
measures. Every optimizer you will meet - a query planner, a JIT's inliner, a scheduler placing
tasks on nodes - has the same structure: a cheap analytical model over stale statistics, chosen
because measuring the real thing costs more than the decision is worth. The engineering job is to
know which of the model's inputs is wrong when the plan is wrong: the constants (hardware
assumptions), the statistics (staleness), or the model itself (independence assumptions).`,
      challenge: code`
Set seq_page_cost to 10 for your session and re-run step 1. The plan does not change, but the cost
does. Now work out from step 2's arithmetic what value of seq_page_cost would make a full index
scan of pl_orders_pkey cheaper than the seq scan, and check your prediction with
"set enable_seqscan = off".`,
    },
    {
      slug: "statistics-drive-plans",
      tags: ["statistics", "query-planning", "explain"],
      title: "Where row estimates come from, and three ways they go wrong",
      difficulty: "intermediate",
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 20,
      sessions: 1,
      prerequisites: ["explain-analyze-buffers"],
      overview: code`
The planner never looks at your data; it looks at a sampled summary of your data in pg_statistic.
This lesson makes that summary visible and then breaks it three ways: a table that has never been
analyzed (default selectivity constants), a table whose statistics are stale (a snapshot of a
population that has changed), and two columns that are correlated (the independence assumption).
The third one is the failure mode that ruins real production plans.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 17 "Statistics" (sections "Basic Statistics", "Most Common Values", "Multivariate Statistics")`,
      readingNotes: code`
Chapter 17 explains sampled column summaries, most-common-value lists, histograms, and multivariate
statistics. This lesson makes those structures visible through pg_stats and pg_statistic_ext_data,
then demonstrates missing, stale, and correlated statistics. Read the chapter after the first run
so the estimates you see have a concrete explanation.`,
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
drop table if exists pl_geo;`,
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
where stxname = 'pl_geo_stx';`,
      expectedResult: code`
A. Straight after the INSERT, pg_class says relpages 0, reltuples -1: the table has never been
analyzed. This does NOT make the planner guess "1 row". It falls back to the current physical file
size and an average-width guess, so count(*) estimates "rows=61789" against 100000 actual - and for
the equality predicate it uses the hard-coded default selectivity DEFAULT_EQ_SEL = 0.005:

  Seq Scan on pl_fresh  (cost=0.00..1409.36 rows=309 width=56) (actual rows=100 loops=1)
    Rows Removed by Filter: 99900

309 = 0.005 * 61789. After ANALYZE, relpages 637 and reltuples 100000, count(*) estimates exactly
rows=100000, and the filter estimate becomes rows=107 (actual 100) - a sampled frequency instead of
a constant. Re-run ANALYZE and that 107 moves around inside roughly 70-130; the estimated width
also corrects, 56 -> 19.

B. pg_stats for pl_orders (your exact numbers will differ slightly - they are a sample):

  status      n_distinct 3        MCV {paid,shipped,cancelled}
                                  freqs {0.9002,0.09853333,0.0012666667}   correlation 0.821
  customer_id n_distinct 5001     MCV only {1107,2306,3277,3466}, freqs about 0.00043
                                  correlation 0.049
  id          n_distinct -1       no MCV list at all                       correlation 1

n_distinct = -1 for id means "distinct values scale 1:1 with row count", i.e. unique - a fraction,
not a count, so it survives the table growing (amount likewise gets -0.10005: about 10000 distinct
values however big the table becomes). correlation 1 on id says the heap is in id order;
correlation 0.05 on customer_id says it is not, which decides bitmap versus index scan in the next
lesson. customer_id has almost no MCV list because no value is common - 20 rows each out of 100000
- so the estimator falls back to 1/n_distinct. amount and created_at get histogram_bounds:
equal-frequency bucket edges starting {0.00,1.06,2.02,3.01,...} and
{"2025-01-01 00:00:00+00","2025-01-04 00:00:00+00",...}.

The arithmetic check prints freq 0.0012666667 and estimated_rows 126.66667 - exactly the rows=
figure lesson 1's seq scan showed. ANALYZE sampled 30000 of the 100000 rows and found 38 cancelled;
38/30000 * 100000 = 126.7. The whole error is sampling error.

C. After deleting 99900 of the 100000 rows, the aggregate's scan node still says "rows=100000"
while actual rows=100, and the cost is unchanged at 1637: the estimate is a cached summary and
DELETE does not invalidate it (nor does it shrink the file - relpages stays 637). After ANALYZE the
estimate snaps to rows=100 and the cost drops to 638.

D. pl_geo: city='paris' alone estimates rows=10300 (actual 10000) - one column, one MCV, accurate.
Adding the redundant "and country='fr'" makes it five times worse:

  Seq Scan on pl_geo  (cost=0.00..2041.00 rows=2075 width=0) (actual rows=10000 loops=1)

2075 instead of 10000, because the planner multiplied about 0.1 (city) by about 0.2 (country) as if
the columns were independent. After CREATE STATISTICS + ANALYZE the same query estimates rows=10003.
pg_statistic_ext_data shows what it learned: stxddependencies {"2 => 3": 1.000000} (column 2 fully
determines column 3) and stxdndistinct {"2, 3": 10} (the pair has 10 combinations, not 10 x 5).`,
      systemsLens: code`
Three general failure modes of any model-driven scheduler, in ascending order of nastiness.
(1) No data: you fall back to constants, and constants are wrong by definition.
(2) Stale data: the summary describes a population that no longer exists. This is the same hazard
as a load balancer routing on a stale health check or an admission controller reading a stale
queue depth, and the fix is the same - refresh cheaply and often (autovacuum's ANALYZE), or make
the consumer tolerant.
(3) A wrong model: independence assumptions are the classic one. Correlated inputs multiply into
absurd estimates, and errors compound multiplicatively up a join tree, so a 5x error two joins deep
becomes a 100x error and a nested loop where you wanted a hash join. Extended statistics is
PostgreSQL admitting the model needs help; the systems lesson is that you must know which of your
estimator's assumptions your workload violates.`,
      challenge: code`
Set default_statistics_target to 1000 for your session, re-run ANALYZE pl_orders, and check the
'cancelled' estimate again. How much sampling buys how much accuracy, and what does the larger MCV
list cost you at planning time (watch the "Planning Time" line)?`,
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
- **CLUSTER ... USING** (table-rewrite command in the challenge)
  - What it is: It rewrites a table in an index's order.
  - What it does here: It makes customer_id physically correlated with the index.
  - What it gives us: Fewer Heap Blocks and a changed pg_stats correlation after ANALYZE.
- **pg_stats.correlation** (statistics column)
  - What it is: A value from -1 to 1 describing agreement between logical key order and physical row order.
  - What it does here: It explains why id ranges are cheaper than scattered customer_id matches.
  - What it gives us: The correlation values for id and customer_id to connect physical layout to plan cost.
- **CREATE INDEX and ANALYZE** (index and statistics commands)
  - What they are: CREATE INDEX builds a searchable B-tree; ANALYZE refreshes planner summaries.
  - What they do here: The customer_id index supplies index and bitmap paths, and statistics supply selectivity estimates.
  - What they give us: A repeatable plan comparison over generated orders.
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
where tablename = 'pl_orders' and attname in ('id','customer_id') order by attname;`,
      expectedResult: code`
1. 0.1% -> a bitmap, and it is cheap:

  Bitmap Heap Scan on pl_orders  (cost=5.07..302.44 rows=100) (actual rows=100 loops=1)
    Recheck Cond: (customer_id <= 5)
    Heap Blocks: exact=21
    Buffers: shared hit=23
    ->  Bitmap Index Scan on pl_orders_cust_idx (cost=0.00..5.04 rows=100) (actual rows=100)
          Buffers: shared hit=2

23 buffers for 100 rows. Those 100 rows landed on 21 distinct pages - customer_id has correlation
about 0.04, so the matches are scattered.

2. 50% (customer_id <= 2500) is still a Bitmap Heap Scan: cost about 582..2237, Heap Blocks:
exact=535, about 584 buffers, actual rows=50000. It only just wins - the seq scan alternative costs
2281.

3. 80% (customer_id <= 4000) flips to "Seq Scan on pl_orders (cost=0.00..2281.00 rows=79999)" with
"Rows Removed by Filter: 20000" and Buffers: shared hit=1031. The crossover for this table and this
correlation is somewhere between 50% and 80% of the rows.

4. Forced off the seq scan at 80%, the best remaining path is the same bitmap shape at
cost=932.28..2963.27 - about 30% more than the seq scan's 2281. That gap is what the planner was
weighing. (enable_seqscan = off did not remove the seq scan; it just made it lose.)

5. The reason bitmaps exist. A plain Index Scan over 50% of the table:

  Index Scan using pl_orders_cust_idx on pl_orders  (cost=0.29..5187.61 rows=49881)
    (actual rows=50000 loops=1)
    Buffers: shared hit=50049

50049 buffers versus the bitmap's 584 for the identical 50000 rows: without the sort-by-page step
the executor pins one heap page per row and re-pins the same page over and over. Cost 5187 against
the bitmap's 2237.

6. Same query (customer_id <= 50, about 1% of the table), bitmaps disabled, only random_page_cost
changed:

  random_page_cost = 4    ->  Seq Scan on pl_orders  (cost=0.00..2281.00 rows=996)
  random_page_cost = 1.1  ->  Index Scan using pl_orders_cust_idx  (cost=0.29..756.89 rows=996)

The plan flipped because the planner's belief about the disk changed, not because anything about
the data did. This is the single most common misconfiguration on flash storage.

7. correlation: id 1, customer_id about 0.04. A range on id would need far fewer heap pages for the
same row count, which is why the same selectivity gives a different answer on a clustered column.`,
      systemsLens: code`
This is the sequential-versus-random access trade that shows up at every layer: an index seek
versus a table scan, a point lookup versus a range scan in an LSM, a partition prune versus a full
shuffle in a distributed query engine. Two things generalize. First, the crossover is remarkably
low - by the time you want more than a few percent of a dataset, reading all of it in order is
usually cheaper, which is why analytics systems barely use indexes. Second, the optimizer's
decision is only as good as its hardware model: random_page_cost is a hand-set constant describing
a spinning disk, and leaving it at 4.0 on NVMe systematically biases every plan in the cluster
toward scans. Any cost-based scheduler you build will have the same fragile bridge between a model
constant and physical reality.`,
      challenge: code`
CLUSTER pl_orders USING pl_orders_cust_idx (it rewrites the heap in index order), ANALYZE, and
re-run steps 1, 2 and 5. With correlation near 1, how far does the crossover move, and what happens
to "Heap Blocks: exact=" and to the forced index scan's buffer count?`,
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
      overview: code`
PostgreSQL has exactly three join algorithms and they are the same three every database has: nested
loop (probe the inner side once per outer row), hash join (build a hash table on the smaller side,
stream the larger through it), merge join (consume both sides in sorted order and zip). Which one
wins depends on the row estimates from lesson 2 and on work_mem. Here you force all three over the
same two tables, read the per-node evidence for each, and then shrink work_mem until the hash table
no longer fits and the join splits into batches.`,
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

- **Nested loop:** Repeats an inner lookup for each outer row, so it is best when the outer side is small.
- **Hash join:** Builds an in-memory key table for one side and probes it with the other side.
- **Merge join:** Consumes two inputs in key order and avoids sorting when both already provide that order.
- **Memory-driven batching:** A hash table that exceeds work_mem is partitioned into temporary batches rather than failing.

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
  - What they are: Hash Join probes a hash table; Hash builds that table from the smaller input.
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
- **work_mem** (per-node memory setting)
  - What it is: Memory available to one sort, hash, or similar executor node for one execution.
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

-- 6. Now starve the hash table. 5000 build rows need about 240 kB.
set work_mem = '64kB';
explain (analyze, buffers, timing off, summary off)
  select count(*) from pl_orders o join pl_customers c on c.id = o.customer_id;
reset work_mem;`,
      expectedResult: code`
1. Even for 100 rows the planner picks a Hash Join, because building a 5000-row hash table costs
almost nothing:

  Hash Join  (cost=154.54..444.22 rows=97) (actual rows=100 loops=1)  Buffers: shared hit=60
    ->  Bitmap Heap Scan on pl_orders o ... (actual rows=100)  Buffers: shared hit=23
    ->  Hash  (actual rows=5000)  Buckets: 8192  Batches: 1  Memory Usage: 318kB

2. Forced to a nested loop, the same answer costs five times the buffers:

  Nested Loop  (cost=5.33..529.36 rows=95) (actual rows=100 loops=1)  Buffers: shared hit=323
    ->  Bitmap Heap Scan on pl_orders o  (actual rows=100)  Buffers: shared hit=23
    ->  Index Scan using pl_customers_pkey on pl_customers c
          (cost=0.28..2.53 rows=1) (actual rows=1 loops=100)  Buffers: shared hit=300

Read the inner node carefully: "rows=1 loops=100" means 100 index descents, 3 buffers each, 300
buffers total. Per-loop numbers are the most common misreading of an EXPLAIN.

3. The full join is a Hash Join, and the hash fits:

  Hash Join  (cost=149.50..2443.22 rows=99920) (actual rows=100000 loops=1)
    Buffers: shared hit=1068
    ->  Seq Scan on pl_orders o  (actual rows=100000)  Buffers: shared hit=1031
    ->  Hash  (actual rows=5000)  Buckets: 8192  Batches: 1  Memory Usage: 240kB

1068 buffers = 1031 heap pages + 37 for pl_customers. The build side is the small table, as it
should be.

4. Merge join. Both indexes already deliver sorted output, so there is no Sort node at all - but
100000 index-order heap fetches are brutal:

  Merge Join  (cost=0.57..7444.88 rows=99920) (actual rows=100000)
    Buffers: shared hit=100055 read=93
    ->  Index Only Scan using pl_orders_cust_idx on pl_orders o  Heap Fetches: 100000
    ->  Index Only Scan using pl_customers_pkey on pl_customers c  Heap Fetches: 5000

Cost 7445 versus the hash join's 2443, and about 100148 buffers versus 1068. (Heap Fetches is
100000 because these lab tables were created with autovacuum_enabled = off, so the visibility map
is empty and the "index only" scan must check every tuple's visibility in the heap.)

5. Nested loop over the full join, with Memoize:

  Nested Loop  (cost=0.29..6042.77 rows=99920) (actual rows=100000)  Buffers: shared hit=16031
    ->  Seq Scan on pl_orders o  (actual rows=100000)
    ->  Memoize  (actual rows=1 loops=100000)
          Cache Key: o.customer_id  Cache Mode: logical
          Hits: 95000  Misses: 5000  Evictions: 0  Overflows: 0  Memory Usage: 508kB
          ->  Index Only Scan using pl_customers_pkey on pl_customers c
                (actual rows=1 loops=5000)  Heap Fetches: 5000

The inner index scan ran 5000 times, not 100000: Memoize absorbed 95000 of the probes. Note the two
different loops counts on adjacent lines - that is the cache hit rate made physical.

6. work_mem = 64kB. The 240 kB hash table no longer fits:

  Hash Join  (cost=169.50..3265.22 rows=99920) (actual rows=100000)
    Buffers: shared hit=1068, temp read=236 written=236
    ->  Hash  (actual rows=5000)
          Buckets: 4096  Batches: 4  Memory Usage: 75kB
          Buffers: shared hit=37, temp written=9

Batches: 4, and the bucket count halved from 8192 to 4096. The join now runs in four passes: the
build side is partitioned by hash bits into temp files, and the 100000-row probe side is
partitioned too and re-read once per batch - that is the 236 temp blocks read and written on the
join node against only 9 written by the build. The estimated cost rose from 2443 to 3265.`,
      systemsLens: code`
These are the same three strategies as a distributed join: broadcast the small side and probe
(hash), co-partition both sides by key and merge (sort-merge / shuffle join), or look up the inner
side per row (nested loop, i.e. an N+1 query). The trade-offs transfer exactly - hash is the
default when one side fits in memory, merge wins when the data is already ordered by the join key
(which is why co-partitioning is worth so much), and nested loop is only sane when the outer side
is tiny. Grace hash partitioning (Batches > 1) is the general answer to "the working set exceeds
memory": partition by a hash of the key so each partition can be processed independently, which is
also exactly how you shard. And note where the danger is: the planner chose the batch count from an
ESTIMATE. Underestimate the build side and you get a hash join that thrashes, which is the standard
production incident behind "the query was fast yesterday".`,
      challenge: code`
Tell the planner to stop collecting statistics on the join key (ALTER TABLE pl_customers ALTER
COLUMN id SET STATISTICS 0; ANALYZE pl_customers), then re-run steps 3 and 6 and compare the
planned "Buckets/Batches" against the actual rows. What happens to Batches when the build side
turns out to be much bigger than planned?`,
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
      overview: code`
work_mem is the single most misunderstood PostgreSQL setting: it is a limit per plan node per
execution, not per query and not per connection, and crossing it does not fail - it silently
switches the algorithm and starts writing temporary files. Here you run the same sort at three
memory sizes, watch it move between three different algorithms, do the same for a hash aggregate,
and then find the evidence a DBA would actually see: temp_files in pg_stat_database and a line in
the server log.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 23 "Sorting and Merging" (section "Sorting"); Chapter 22 "Hashing" (section "Hash Joins"); Chapter 16 "Query Execution Stages" (section "Simple Query Protocol")`,
      readingNotes: code`
Chapter 23 describes in-memory and external sorting, and Chapter 22 describes hash operations that
partition when memory is insufficient. Chapter 16 provides execution-stage context. This lesson
adds work_mem threshold experiments, cumulative temp counters, and log_temp_files evidence. Read the
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
- **Spill observability:** EXPLAIN, database counters, and server logs expose work that moved to disk.

### Piece by piece

- **work_mem** (executor memory setting)
  - What it is: Memory available per plan node per execution.
  - What it does here: 32MB fits the sort, 4MB spills, and 64kB creates more merge passes; the hash aggregate also spills.
  - What it gives us: Sort Method and temporary block evidence without a query failure.
- **generate_series and autovacuum_enabled = off** (setup tools)
  - What they are: generate_series creates the synthetic rows; the table option disables background cleanup.
  - What they do here: They make the sort input stable and keep maintenance from hiding temporary-file evidence.
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
- **log_temp_files = 0** (logging setting)
  - What it is: It logs every temporary file, with zero meaning no minimum size.
  - What it does here: It enables logging for one sort, then reset turns it off.
  - What it gives us: File path and byte size in the server log.
- **pg_current_logfile and pg_read_file** (SQL functions)
  - What they are: The first returns the active log path; the second reads a server-readable file.
  - What they do here: They read the recent log tail inside psql and filter temporary-file lines.
  - What they give us: Backend PID and temporary-file size without opening a shell.
- **regexp_split_to_table, right, WITH ORDINALITY, and \t on/off** (SQL and psql output tools)
  - What they are: They split log text into numbered lines, keep its tail, and toggle tuples-only output.
  - What they do here: They print the newest temporary-file entries in reverse order.
  - What they give us: One readable log line per row with ordinality for recency.
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

select temp_files, pg_size_pretty(temp_bytes) as temp_bytes
from pg_stat_database where datname = current_database();

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

-- 4. Add a LIMIT and the sort stops being a sort.
explain (analyze, buffers, timing off, summary off)
  select * from pl_orders order by amount, id limit 10;

-- 5. Hash aggregation spills differently: it partitions instead of merging.
set enable_indexscan = off;
set enable_indexonlyscan = off;
explain (analyze, buffers, timing off, summary off)
  select customer_id, count(*) from pl_orders group by customer_id offset 4999;
reset enable_indexscan;
reset enable_indexonlyscan;

-- 6. The evidence outside EXPLAIN: counters and the log.
set log_temp_files = 0;
select count(*) from (select * from pl_orders order by amount, id) s;
reset log_temp_files;
reset work_mem;

select temp_files, pg_size_pretty(temp_bytes) as temp_bytes
from pg_stat_database where datname = current_database();

\t on
select line from regexp_split_to_table(right(pg_read_file(pg_current_logfile()), 40000), '\n')
  with ordinality t(line, n)
where line like '%' || current_database() || '%temporary file%'
order by n desc limit 3;
\t off`,
      expectedResult: code`
The first temp_files reading is whatever earlier work in this database left behind (0 on a fresh
one).

1. work_mem = 32MB: "Sort Method: quicksort  Memory: 10885kB", Buffers: shared hit=1031 and no temp
line at all. 100000 rows of width 47 need about 10.6 MB of sort memory - already 2.5x the lab's
4 MB default.

2. work_mem = 4MB: "Sort Method: external merge  Disk: 6160kB", with
"Buffers: shared hit=1031, temp read=770 written=772" and I/O Timings for the temp files. Note the
paradox: 6160 kB on disk for data that took 10885 kB in memory - the tape format is packed, while
the in-memory representation carries per-tuple overhead. The Sort node's cost went from 10335 to
13412.

3. work_mem = 64kB: still "external merge", still about "Disk: 6208kB", but temp read=2320
written=2514 instead of 770/772 - three times the temp I/O for the same sort, because tiny runs
need more merge passes. Cost 19565. The algorithm degrades gracefully rather than failing, which is
exactly why work_mem starvation is so hard to notice.

4. Same 64kB, plus LIMIT 10: "Sort Method: top-N heapsort  Memory: 26kB", no temp files at all. The
executor keeps a 10-element heap and discards everything else, so a 100000-row sort runs in 26 kB.

5. HashAggregate with 5000 groups in 64kB:

  HashAggregate  (cost=12781.00..14393.54 rows=5004) (actual rows=5000)
    Planned Partitions: 4  Batches: 21  Memory Usage: 169kB  Disk Usage: 3368kB
    Buffers: shared hit=1031, temp read=356 written=706

Planned 4 partitions, needed 21 batches: spilled partitions get re-partitioned recursively when
they still do not fit. That "planned N, actually M" gap is the same estimate risk as the hash
join's batches. (The index scans are disabled here only to stop the planner using the customer_id
index for a cheaper GroupAggregate that would never spill.)

6. The second temp_files reading is higher than the first, but by less than you expect - about
+1 file and +2 MB - because a backend only reports its accumulated statistics at transaction
boundaries and the collector lags. Run the lesson again and you can watch the counter catch up:
46 -> 51 -> 52 files, 69 MB -> 87 MB -> 89 MB over three runs. The counters are eventually
consistent, which matters if you alert on them.

The log tail shows the temporary file itself:

  2026-09-03 00:44:03.252 UTC [8928] postgres@lab LOG:  temporary file:
    path "base/pgsql_tmp/pgsql_tmp8928.4", size 2146304

8928 is the backend PID and the file lives in base/pgsql_tmp inside the data directory. Only the
last file is logged here because log_temp_files was only turned on for that one statement. This log
line, and temp_files climbing in pg_stat_database, are how you find a work_mem problem in
production - there is no error and no warning anywhere else.`,
      systemsLens: code`
Two ideas worth stealing. First, graceful degradation with a silent cliff: every one of these
operators has an in-memory fast path and an external slow path, and crossing the line costs 10x
without producing a single error. Systems that degrade instead of failing need explicit telemetry
for the degradation (here: temp_files, log_temp_files, "Sort Method"), or the failure is invisible
until it is an outage. Second, the admission-control trap: work_mem is per node per execution, so a
plan with three sorts running on 100 connections can reserve 300x work_mem. There is no global
budget. Any resource limit expressed per-unit-of-work rather than per-system has this
multiplication bug, and it is why memory limits in query engines, thread pools and container
schedulers all end up needing a second, global admission gate.`,
      challenge: code`
Run step 1's query with work_mem at 8MB, 9MB, 10MB and 11MB and find the exact threshold where
quicksort takes over from external merge. Then give the query two sorts (a UNION ALL of two
differently ordered scans) and check whether they share one work_mem or get one each.`,
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
      overview: code`
A parallel plan is scatter-gather inside one query: the leader starts N background worker
processes, each scans a disjoint slice of the same table, and a Gather node merges their output.
Three separate limits decide how many workers you actually get, and the plan tells you when each
one bit. On this single-CPU lab you will also see the honest result: the workers launch, do their
share, and the query gets SLOWER.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 18 "Table Access Methods" (sections "Parallel Plans", "Parallel Sequential Scans", "Parallel Execution Limitations")`,
      readingNotes: code`
Chapter 18 explains parallel plans, parallel sequential scans, worker limits, and restrictions.
This lesson makes those limits visible through Workers Planned versus Workers Launched, Gather
Merge, and an unsafe function, then measures the overhead on a one-CPU lab. Read the chapter before
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
  - What they are: The first limits the shared worker pool; the second is the startup-time hard slot limit.
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
  - What it does here: A parallel subplan includes the leader, so loops is workers launched plus one.
  - What it gives us: Actual rows and time per participant; multiply by loops for total work.
- **PARALLEL UNSAFE** (function property)
  - What it is: A declaration that a function cannot safely execute in a parallel worker.
  - What it does here: pl_unsafe makes the entire count serial.
  - What it gives us: A plain Aggregate and Seq Scan with no Gather.
- **\timing on/off** (psql meta-command)
  - What it is: It toggles client-side elapsed-time display.
  - What it does here: It measures serial and parallel count executions.
  - What it gives us: Comparable timings; this one-CPU lab should show parallel overhead.
- **pg_stat_activity.backend_type** (activity view column)
  - What it is: The kind of backend process represented by an activity row.
  - What it does here: The final query counts any still-running parallel workers.
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

-- 3. Starve the cluster-wide pool: planned 4, launched fewer.
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
select count(*) as running_parallel_workers from pg_stat_activity
where backend_type = 'parallel worker';`,
      expectedResult: code`
The settings row: per_gather 2, pool 8, slots 8, min_scan_size 8MB, setup_cost 1000, table_size
8248 kB.

1. No Gather node: a plain "Aggregate (cost=2281.00..2281.01) -> Seq Scan on pl_orders
(cost=0.00..2031.00 rows=100000)", Buffers: shared hit=1031. The table (8248 kB) does clear
min_parallel_table_scan_size, so parallelism was CONSIDERED and rejected on cost: the parallel plan
costs about 1343 plus parallel_setup_cost 1000, which is more than 2281. The defaults are tuned so
that small queries never pay for process startup.

2. With the setup costs zeroed, the shape appears:

  Finalize Aggregate  (cost=1343.52..1343.53 rows=1) (actual rows=1 loops=1)
    ->  Gather  (cost=1343.50..1343.51 rows=4) (actual rows=5 loops=1)
          Workers Planned: 4
          Workers Launched: 4
          ->  Partial Aggregate  (actual rows=1 loops=5)
                ->  Parallel Seq Scan on pl_orders  (cost=0.00..1281.00 rows=25000)
                      (actual rows=20000 loops=5)

Read the arithmetic: loops=5 is four workers plus the leader, and actual rows=20000 is the average
slice, so 5 x 20000 = 100000 rows, each scanned exactly once. The Gather returns 5 rows (one
partial aggregate per participant) which Finalize Aggregate sums. Buffers: shared hit=1031 - the
same 1031 pages, just divided up. Aggregation splits into Partial + Finalize because count() is
associative; that is why not every aggregate can be parallelised.

3. With max_parallel_workers = 1 the pool is exhausted after one:

  Workers Planned: 4
  Workers Launched: 1
  ->  Partial Aggregate  (actual rows=1 loops=2)
        ->  Parallel Seq Scan on pl_orders  (actual rows=50000 loops=2)

The plan was costed for 5 participants and executed with 2, each doing 50000 rows - and the printed
cost is still 1343, unchanged. Nothing warns you; "Workers Planned > Workers Launched" is the only
signal, and it is the classic cause of "the same query is sometimes 4x slower" on a busy server.

4. Ordered output uses Gather Merge, and each participant sorts independently:

  Gather Merge  (cost=3107.26..4580.73 rows=100000)  Workers Planned: 4  Workers Launched: 4
    ->  Sort  (actual rows=20000 loops=5)
          Sort Method: quicksort  Memory: 4333kB
          Worker 0:  Sort Method: quicksort  Memory: 518kB
          Worker 1:  Sort Method: quicksort  Memory: 407kB
          Worker 2:  Sort Method: quicksort  Memory: 2799kB
          Worker 3:  Sort Method: quicksort  Memory: 3117kB

Five separate sorts of about 20000 rows each fit in memory where the single 100000-row sort of the
previous lesson did not - and five separate work_mem allocations were made, one per participant.
The per-worker memory numbers differ wildly (about 400 kB to 4 MB) because on one CPU the
participants do not get equal slices; the leader, which starts first, takes the largest share.

5. "select count(pl_unsafe(id)) from pl_orders" plans as plain "Aggregate -> Seq Scan": no Gather.
One PARALLEL UNSAFE function anywhere in the query disables parallelism for the entire plan, not
just the node that calls it.

6. The timings on this one-CPU lab:

  serial   (max_parallel_workers_per_gather = 0):  17.5 ms, 13.9 ms
  parallel (4 workers launched):                   26.2 ms, 21.9 ms

Parallel is roughly 1.5-2x SLOWER. The work is unchanged, there is exactly one core to run it on,
and the extra time is process startup, the shared-memory tuple queue, and five processes
time-slicing that core. Nothing in the plan says this - "Workers Launched: 4" looks like success.
The final count of parallel workers in pg_stat_activity is 0: workers exist only for the duration
of one query.`,
      systemsLens: code`
Parallel query is map-reduce with a scheduler that has no idea how loaded the machine is. Three
things generalize. (1) Planned versus launched: any system that reserves a degree of parallelism at
plan time and acquires it at run time will sometimes get less, and the plan is not re-costed. Same
bug as a Spark job costed for 200 executors that gets 40, or a fan-out request budgeted for 10
replicas when 3 are down. (2) Speedup requires an idle resource. Amdahl plus one CPU means the only
possible outcome is overhead, and the optimizer's model contains no term for current system load.
Real schedulers need feedback (admission control, queueing), which PostgreSQL deliberately does not
have. (3) Per-worker resource limits multiply: work_mem is granted per participant, so raising the
degree of parallelism silently multiplies memory demand - the same trap as per-shard buffers in a
scatter-gather service.`,
      challenge: code`
Open a second psql, run a long parallel query there (set parallel_setup_cost = 0 and sort a big
table), and while it runs re-run step 2 here. Watch Workers Launched drop as the two queries
compete for the pool of 8, and check pg_stat_activity where backend_type = 'parallel worker' to see
which leader owns each one.`,
    },
    {
      slug: "pg-stat-statements-as-tracing",
      tags: [
        "pg-stat-statements",
        "observability",
        "query-planning",
        "explain",
      ],
      title: "pg_stat_statements: normalized queries as aggregate tracing",
      difficulty: "intermediate",
      safetyLevel: "privileged",
      runIn: "tool",
      estimatedMinutes: 20,
      sessions: 1,
      prerequisites: ["install-lab-extensions", "explain-analyze-buffers"],
      overview: code`
EXPLAIN tells you about one query you already suspect. pg_stat_statements tells you which query to
suspect. It normalizes every statement into a fingerprint - literals replaced by $1, $2 - and keeps
running totals per fingerprint: calls, total and mean and stddev execution time, rows, and the
shared-buffer hit and read counts. In this lesson you reset it, run a small workload, rank it, and
then find the two ways an aggregate view lies to you: means that hide bimodal distributions, and
fingerprints that split when they should not.`,
      reading:
        code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 16 "Query Execution Stages".`,
      syntaxBreakdown: code`
### In plain terms

This lesson turns query history into a small tracing table. PostgreSQL replaces literal values with
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
  - What it gives us: The pg_stat_statements view and reset function.
- **pg_stat_statements_reset(0, database_oid, 0)** (extension function)
  - What it is: It clears counters, with zero meaning all users or all query IDs for that argument.
  - What it does here: It resets only the current database by looking up its OID.
  - What it gives us: An empty baseline; the function returns void, so a blank result is expected.
- **pg_stat_statements** (statistics view)
  - What it is: A cluster-wide view with one aggregate row per normalized statement fingerprint.
  - What it does here: It ranks statements by total time and displays min, mean, max, standard deviation, planning time, and I/O counters.
  - What it gives us: calls, total_exec_time, mean_exec_time, rows, shared_blks_hit/read, temp blocks, and query text.
- **dbid and current_database()** (database identity expressions)
  - What they are: dbid identifies the database in the view; current_database returns this connection's name.
  - What they do here: They scope resets and reports so unrelated databases do not pollute the lesson.
  - What they give us: A filter matching the OID selected from pg_database.
- **pg_database.oid** (system catalog column)
  - What it is: PostgreSQL's internal identifier for a database.
  - What it does here: The scalar subquery supplies the database-specific reset and report filter.
  - What it gives us: The numeric dbid used by pg_stat_statements.
- **round, nullif, and left** (SQL functions)
  - What they are: round formats numbers; nullif avoids division by zero; left shortens query text.
  - What they do here: They make milliseconds, hit percentage, and fingerprints readable.
  - What they give us: Stable terminal columns instead of long raw values.
- **pg_stat_statements.track_planning** (extension setting)
  - What it is: A switch for collecting planning-time totals in addition to execution time.
  - What it does here: SHOW demonstrates why total_plan_time remains zero by default.
  - What it gives us: A setting value explaining whether planning overhead is represented.
- **pg_stat_statements.max** (extension capacity setting)
  - What it is: The maximum number of statement entries retained.
  - What it does here: SHOW exposes the finite cardinality budget.
  - What it gives us: The eviction limit to consider when query text creates many fingerprints.
- **\x auto** (psql display command)
  - What it is: It switches to expanded output when a row is too wide for the terminal.
  - What it does here: It keeps wide statistics rows readable.
  - What it gives us: One field per line when needed and compact output otherwise.
- **generate_series, CREATE INDEX, and ANALYZE** (setup tools)
  - What they are: The function emits test rows; the command builds the customer index; ANALYZE refreshes estimates.
  - What they do here: They create the repeatable workload whose statements are recorded by the extension.
  - What they give us: Known scan and join shapes to rank by calls, time, and buffers.
`,
      caution: code`
pg_stat_statements is shared by every database in the cluster. Always scope the reset with the
database OID, as below, so you do not erase someone else's measurements.`,
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

-- Scope the reset to this database only: the view is cluster-wide.
select pg_stat_statements_reset(0,
  (select oid from pg_database where datname = current_database()), 0);

-- A tiny workload: the same shape three times with different literals, one
-- expensive scan, one join.
select count(*) from pl_orders where customer_id = 7;
select count(*) from pl_orders where customer_id = 42;
select count(*) from pl_orders where customer_id = 99;
select count(*) from pl_orders where status = 'cancelled';
select sum(amount) from pl_orders o join pl_customers c on c.id = o.customer_id
  where c.region = 'eu-west';

-- Rank by total time, which is what actually costs you capacity.
select calls, round(total_exec_time::numeric, 1) as total_ms,
       round(mean_exec_time::numeric, 2) as mean_ms, rows,
       shared_blks_hit, shared_blks_read,
       round(100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0), 1) as hit_pct,
       left(query, 58) as query
from pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
  and query like '%pl_orders%'
order by total_exec_time desc;

-- Now the two lies. First: the mean.
select pg_stat_statements_reset(0,
  (select oid from pg_database where datname = current_database()), 0);

select count(*) from pl_orders where customer_id <= 1;
select count(*) from pl_orders where customer_id <= 1;
select count(*) from pl_orders where customer_id <= 1;
select count(*) from pl_orders where customer_id <= 5000;

-- Second: the fingerprint. These two are the same query to a human.
select count(*) from pl_orders where id in (1,2);
select count(*) from pl_orders where id in (1,2,3);

select calls,
       round(min_exec_time::numeric, 2) as min_ms,
       round(mean_exec_time::numeric, 2) as mean_ms,
       round(max_exec_time::numeric, 2) as max_ms,
       round(stddev_exec_time::numeric, 2) as stddev_ms,
       round(total_plan_time::numeric, 2) as plan_ms,
       left(query, 55) as query
from pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
  and query like '%pl_orders%'
order by total_exec_time desc;

show pg_stat_statements.track_planning;
show pg_stat_statements.max;`,
      expectedResult: code`
Both resets print an empty value: pg_stat_statements_reset returns void.

The ranking, ordered by total_exec_time:

  calls total_ms mean_ms rows hit  read hit_pct query
      1     37.1   37.05    1 1068    0   100.0 select sum(amount) from pl_orders o join pl_cust...
      1     20.2   20.19    1 1031    0   100.0 select count(*) from pl_orders where status = $1
      3      0.3    0.09    3   63     3    95.5 select count(*) from pl_orders where customer_id = $1

Three observations. The three customer_id queries collapsed into ONE row with calls=3 and the
literal replaced by $1: that is normalization, and it is what makes the view usable at all. Ranking
by total time puts the join first even though it ran once, while the query with the most calls is
last - total time is the capacity unit, not call count and not mean. And shared_blks_hit tracks the
plan exactly: 1031 blocks for the seq scan (the whole table), 1068 for the join (the table plus
pl_customers), 66 for three index lookups. On this warm lab the hit ratio is 95-100%; the 3 reads
in the last row are index pages that had aged out of shared_buffers. Per-statement hit ratio is a
far better signal than the database-wide one.

The second table shows both failure modes:

  calls min_ms mean_ms max_ms stddev_ms plan_ms query
      4   0.03    5.63  22.38      9.67    0.00 ...where customer_id <= $1
      1   0.06    0.06   0.06      0.00    0.00 ...where id in ($1,$2)
      1   0.03    0.03   0.03      0.00    0.00 ...where id in ($1,$2,$3)

Lie 1: mean_ms 5.63 describes no execution that ever happened. Three calls took about 0.03 ms
(20 rows via the index) and one took 22.38 ms (a full seq scan). The mean sits in the empty space
between two clusters; stddev_ms 9.67, nearly twice the mean, is the only clue, and it is why you
alert on max or on a percentile rather than a mean.

Lie 2: "id in (1,2)" and "id in (1,2,3)" are two separate fingerprints in PostgreSQL 16 - a
different number of literals is a different normalized text. An ORM that builds IN lists of varying
length will scatter one logical query across hundreds of entries and can evict everything else from
the 5000-entry table.

plan_ms is 0.00 for everything because pg_stat_statements.track_planning is off (the default), so
this view measures execution only - a query whose PLANNING is slow is invisible here.
pg_stat_statements.max is 5000.`,
      systemsLens: code`
This is a trace aggregator with the cardinality problem already solved: the query text is the span
name, the literals are the attributes, and normalization is exactly the "do not put user ids in
your metric labels" rule, enforced by the database itself. What it keeps and what it throws away is
the whole design. It keeps counters that let you rank by total cost, which is the right unit for
capacity: a 0.1 ms query called a million times beats a 30 s report. It throws away the time
dimension and the distribution, so you get a mean and a stddev instead of a histogram, and you
cannot ask "what was slow at 14:03" - which is why production setups snapshot the view on a timer
and difference the counters. And the fingerprint boundary is a design choice you inherit: too fine
(varying IN lists) and the table thrashes, too coarse and you cannot tell the fast and slow
variants apart. Every observability system you build makes the same three trades.`,
      challenge: code`
Snapshot the view into a table, run a workload, snapshot again, and difference the two by queryid
to get a real per-interval rate - that is what every monitoring integration does. Then turn on
pg_stat_statements.track_planning for your session, re-run the queries, and find a statement whose
planning time is a significant fraction of its execution time.`,
    },
  ],
};
