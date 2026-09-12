# Three ways to join, and the memory that decides between them

slug: join-strategies
category: query-planning
difficulty: intermediate
tags: nested-loop, hashing, sorting-and-merging, work-mem, query-planning
prerequisites: index-scan-vs-seq-scan-crossover
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 25
revision: 4

## Overview
Compare PostgreSQL's nested-loop, hash and merge joins over the same tables. Read the inner node's
loops to distinguish repeated probes from cached lookups, then lower the memory budget and inspect
hash batches. Use the known join answer to keep the experiment about execution work.

## Syntax breakdown
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
drop table if exists pl_customers;
create table pl_customers(id int primary key, name text not null, region text not null)
  with (autovacuum_enabled = off);
insert into pl_customers
select g, 'customer ' || g, (array['us-east','us-west','eu-west','ap-south'])[1 + g % 4]
from generate_series(1,5000) g;
analyze pl_orders;
analyze pl_customers;
```

## Run
```sql
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
reset max_parallel_workers_per_gather;
```

## Expected result
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
variable exact sizes. unchanged_join_answer is true; all session controls are reset.

## Systems lens
The useful choice is how to match rows while bounding repeated work and memory demand. A local
nested-loop index probe is not itself a network N+1 request; remote probes add a different latency
boundary. Distributed joins add data placement and transfer costs too. Hash partitioning can make
an oversized working set manageable, while sorted inputs or repeated keys may favor other paths.
Measure the actual inputs and retained state instead of memorizing one preferred algorithm.

## Optional variation
Hold the full nested-loop join fixed and toggle only Memoize. Compare inner index loops and
buffers, and check that both runs return 100,000. Decide what repeated-key distribution makes the
cache useful and what an eviction would mean.
