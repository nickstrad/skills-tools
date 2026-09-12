# The crossover: when an index stops being worth it

slug: index-scan-vs-seq-scan-crossover
category: query-planning
difficulty: intermediate
tags: index-scans, query-planning, index-access-methods, explain
prerequisites: statistics-drive-plans
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 20
revision: 4

## Overview
An index is not "faster". It is a random-access strategy that wins below some selectivity and loses
above it, and the crossover point is a function of how many rows match, how well the heap is
ordered, and what the planner believes about your disks. Here you sweep the selectivity of one
predicate from 0.1% to 80%, watch the plan change shape, force the losing plan to see what it would
have cost, and then move the crossover by changing a single hardware constant.

## Syntax breakdown
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
create index if not exists pl_orders_cust_idx on pl_orders(customer_id);
analyze pl_orders;
```

## Run
```sql
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
reset max_parallel_workers_per_gather;
```

## Expected result
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
session planner controls are reset. No global setting was changed.

## Systems lens
An access path trades index traversal and scattered row fetches against reading a larger region in
order. Selectivity, physical correlation, covering access and caching all influence that tradeoff;
there is no universal percentage at which indexes stop helping. Diagnostic planner switches let you
measure a hypothesis. A production setting needs representative workload evidence, including the
queries it makes worse.

## Optional variation
Change only the matching customer range from 5 to 4000 using the same projection. Record rows
returned, plan shape and buffer work at both bounds. Explain why differing answers are intentional
in a selectivity sweep, whereas comparing two access paths at one bound must preserve the answer.
