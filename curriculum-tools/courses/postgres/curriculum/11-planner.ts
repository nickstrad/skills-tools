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
      syntaxBreakdown: code`
EXPLAIN prints the chosen plan; EXPLAIN (ANALYZE) really runs the query and adds actual time,
rows, and loops. BUFFERS reports shared hit (page found in shared_buffers), read (asked the OS),
dirtied and written; with track_io_timing on it also prints I/O Timings. Node cost is
"startup..total" in arbitrary units built from seq_page_cost (1.0), random_page_cost (4.0),
cpu_tuple_cost (0.01) and cpu_operator_cost (0.0025) applied to pg_class.relpages and
pg_class.reltuples. "Rows Removed by Filter" is what the scan threw away. COSTS OFF, TIMING OFF and
SUMMARY OFF trim the output when you only care about shape.`,
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
      syntaxBreakdown: code`
ANALYZE samples default_statistics_target * 300 = 30000 rows and stores per-column stats.
pg_stats is the readable view over pg_statistic: null_frac, avg_width, n_distinct (a count, or a
negative fraction of the row count when distinctness scales with size), most_common_vals /
most_common_freqs (the MCV list), histogram_bounds (equal-frequency buckets for everything not in
the MCV list), and correlation (how well physical order matches logical order, -1..1).
pg_class.relpages / reltuples are the table-level counters; reltuples = -1 means "never analyzed".
CREATE STATISTICS ... (dependencies, ndistinct) ON a, b FROM t builds a multi-column statistics
object, read back from pg_statistic_ext_data.`,
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
      tags: ["index-scans", "query-planning", "index-access-methods", "explain"],
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
      syntaxBreakdown: code`
An Index Scan walks the btree and fetches each matching heap tuple immediately: one random page per
row, in index order. A Bitmap Index Scan collects all matching TIDs into a bitmap first, then the
Bitmap Heap Scan visits the heap in physical order, once per page - "Heap Blocks: exact=N" counts
those pages, and "Recheck Cond" is re-applied because a lossy bitmap may only remember pages. A Seq
Scan reads every page and filters. enable_seqscan, enable_bitmapscan and enable_indexscan are
per-session switches that add a huge penalty to a path rather than truly removing it; they are
debugging tools, not tuning. random_page_cost is the planner's belief about the cost of a random
page relative to a sequential one (default 4.0; on SSDs people set 1.1).`,
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
      tags: ["nested-loop", "hashing", "sorting-and-merging", "work-mem", "query-planning"],
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
      syntaxBreakdown: code`
"loops=N" on a node means the node was executed N times, and its "actual rows" and "actual time"
are PER LOOP averages - always multiply. A Hash node reports "Buckets: N  Batches: M  Memory
Usage: kB"; Batches > 1 means the build side did not fit in work_mem and both inputs were
partitioned to temporary files, which show up as "temp read=/written=" blocks. Memoize is a cache
in front of a nested loop's inner side, reporting Hits/Misses/Evictions. enable_nestloop,
enable_hashjoin, enable_mergejoin and enable_memoize let you force a shape. work_mem is per node
per execution, not per query and not per backend.`,
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
      syntaxBreakdown: code`
"Sort Method: quicksort  Memory: NkB" means it all fit. "top-N heapsort" is the LIMIT special case:
only the best N rows are ever kept, so a huge sort can run in kilobytes. "external merge  Disk:
NkB" means the input was cut into sorted runs written to temporary files and merged. A HashAggregate
reports "Planned Partitions: N  Batches: M  Memory Usage: kB  Disk Usage: kB" when it spills.
temp read=/written= in BUFFERS counts 8 kB temp blocks. pg_stat_database.temp_files and temp_bytes
are cumulative counters per database; log_temp_files = 0 logs every temporary file the session
creates, and pg_current_logfile() plus pg_read_file() read the log back without leaving psql.`,
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
      syntaxBreakdown: code`
A Gather node collects rows from workers in arrival order; Gather Merge keeps them sorted. "Workers
Planned" is what the planner asked for, "Workers Launched" is what the worker pool actually gave.
Under a Gather, loops = launched workers + 1 because the leader also runs the subplan, and actual
rows is the PER LOOP average. max_parallel_workers_per_gather caps one Gather (0 disables
parallelism), max_parallel_workers is the cluster-wide pool, max_worker_processes is the hard slot
limit fixed at startup. min_parallel_table_scan_size (8MB) is the size below which a scan is not
worth splitting; parallel_setup_cost (1000) and parallel_tuple_cost (0.1) are the modelled price of
starting workers and shipping rows through the queue. A function declared PARALLEL UNSAFE forbids
parallelism for any query that calls it.`,
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
      tags: ["pg-stat-statements", "observability", "query-planning", "explain"],
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
      syntaxBreakdown: code`
pg_stat_statements requires shared_preload_libraries (already set in this lab) and CREATE EXTENSION.
pg_stat_statements_reset(userid, dbid, queryid) zeroes counters; passing 0 for a parameter means
"all", so reset(0, <this database oid>, 0) leaves other databases alone. Columns: queryid (the
fingerprint hash), calls, total_exec_time / mean_exec_time / min_exec_time / max_exec_time /
stddev_exec_time in ms, rows (total rows returned across all calls), shared_blks_hit and
shared_blks_read, temp_blks_read/written, and total_plan_time (zero unless
pg_stat_statements.track_planning is on). The view holds pg_stat_statements.max entries and evicts
the least-used, so a workload with unbounded distinct query texts can push out the entries you
care about.`,
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
