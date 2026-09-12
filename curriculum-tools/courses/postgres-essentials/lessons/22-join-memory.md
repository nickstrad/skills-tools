# A join adds another memory consumer

slug: join-memory
category: query-execution
difficulty: intermediate
tags: query-execution, hash-joins, work-mem, temporary-io
prerequisites: sort-spill
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 25
revision: 1

## Overview
Run the same one-to-one hash join under two transaction-local memory allowances. The small allowance divides the build side into batches and uses temporary storage; the larger allowance keeps this bounded hash table in one batch. Read the equal row counts alongside Hash Batches and temporary-buffer evidence to size memory as a per-operation, concurrent demand.

## Syntax breakdown
### In plain terms
A hash join first reads one input, called the build side, into a hash table keyed by the join column.
It then reads the probe side and uses each key to find matches. If the hash table's allowance is too
small, PostgreSQL partitions both inputs into batches and revisits spilled batches from temporary
storage instead of allowing the operation's memory to grow without bound.

### Mechanism map

```text
One Hash Join, two transaction-local allowances

50,000 probe rows ---> Hash Join ---> 50,000 joined rows
                         ^
50,000 build rows --> Hash table
                         |
       work_mem=64kB     +--> many batches + temporary blocks
       work_mem=16MB     +--> one batch     + no temporary blocks

The allowance belongs to this hash operation; concurrent nodes, workers and queries multiply demand.
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
- A Hash node builds an in-memory lookup structure, while its Hash Join parent probes that structure.
- Batches greater than one show that this hash operation partitioned its work; temporary blocks show
  the resulting temporary I/O in this execution.
- Raising the allowance can keep this fixture in one batch, but it does not change the 50,000-row
  join result.
- work_mem is an allowance for each eligible executor operation. Hash operations multiply it by
  hash_mem_multiplier, and simultaneous nodes, workers and queries can each create demand.

### Piece by piece
- **SET lock_timeout = '3s'** bounds lock acquisition, and **SET statement_timeout = '60s'** bounds
  each statement. Cleanup runs while these guards apply, then RESET restores session defaults.
- **pe_join_accounts** is the build-side fixture: 50,000 unique account IDs and a deterministic
  200-character profile. **pe_join_orders** supplies exactly one probe row per account.
- **generate_series(1, 50000)** creates bounded integer keys. **repeat(md5(g::text), 7)** produces
  deterministic text; **left(..., 200)** fixes its projected width at 200 characters.
- **ANALYZE** collects planner statistics so the plan estimates both inputs from current data.
- **BEGIN / SET LOCAL / COMMIT** scopes each memory and plan setting to one comparison transaction.
- **work_mem** supplies the base allowance for this hash operation. **hash_mem_multiplier = 1** holds
  its multiplier constant, so 64kB versus 16MB is the changed condition in the core comparison.
- **max_parallel_workers_per_gather = 0** keeps workers from multiplying memory demand or obscuring
  the single Hash node. **enable_nestloop = off** and **enable_mergejoin = off** isolate hash-join
  behavior for this experiment; disabling alternatives is not a production planner recommendation.
- **sum(length(a.profile) + o.amount)** consumes columns from both inputs while returning one compact
  aggregate row. The Hash Join still reports its 50,000 joined rows beneath the Aggregate.
- **JOIN ... USING (account_id)** matches rows whose same-named account_id values are equal and
  exposes one account_id column in the joined result instead of two. It is equivalent here to an
  equality condition between the two qualified account_id columns.
- **EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF)** executes the query. The Hash line reports
  **Buckets**, **Batches** and **Memory Usage**. BUFFERS reports temporary 8 kB blocks read or written
  by the plan; TIMING OFF omits per-node timers and SUMMARY OFF omits the final summary.
- **Batches: 1** means this execution kept the build hash table in one batch. A larger batch count
  means partitions were used; positive **temp read** and **written** counts prove temporary traffic.
- **\echo phase=...** labels each plan, and **DROP TABLE** removes both fixtures after comparison.

## Caution
The fixture creates 100,000 rows across two disposable tables and executes the full join twice. Run every phase in order. If interrupted, run ROLLBACK; DROP TABLE IF EXISTS pe_join_orders, pe_join_accounts; RESET lock_timeout; RESET statement_timeout before rerunning setup.

## Setup
```sql
set lock_timeout = '3s';
set statement_timeout = '60s';
drop table if exists pe_join_orders, pe_join_accounts;
create table pe_join_accounts (account_id integer primary key, profile text not null);
create table pe_join_orders (order_id integer primary key, account_id integer not null, amount integer not null);
insert into pe_join_accounts
select g, left(repeat(md5(g::text), 7), 200)
from generate_series(1, 50000) as g;
insert into pe_join_orders
select g, g, g % 100
from generate_series(1, 50000) as g;
analyze pe_join_accounts;
analyze pe_join_orders;
```

## Run
```sql
-- Session A: force the build-side hash table to use multiple batches.
begin;
set local work_mem = '64kB';
set local hash_mem_multiplier = 1;
set local max_parallel_workers_per_gather = 0;
set local enable_nestloop = off;
set local enable_mergejoin = off;
\echo phase=small_hash_allowance
explain (analyze, buffers, timing off, summary off)
select sum(length(a.profile) + o.amount)
from pe_join_orders as o
join pe_join_accounts as a using (account_id);
commit;

-- Session A: repeat identical work with enough allowance for one batch.
begin;
set local work_mem = '16MB';
set local hash_mem_multiplier = 1;
set local max_parallel_workers_per_gather = 0;
set local enable_nestloop = off;
set local enable_mergejoin = off;
\echo phase=larger_hash_allowance
explain (analyze, buffers, timing off, summary off)
select sum(length(a.profile) + o.amount)
from pe_join_orders as o
join pe_join_accounts as a using (account_id);
commit;

drop table pe_join_orders, pe_join_accounts;
reset lock_timeout;
reset statement_timeout;
```

## Expected result
Both labelled plans contain a Hash Join with exactly 50000 actual rows and the Aggregate above it
returns one row. At phase=small_hash_allowance, the Hash node reports Batches greater than 1 and the
plan reports positive temporary blocks read and written. At phase=larger_hash_allowance, the Hash
node reports Batches: 1 and the plan has no temporary-buffer line. Bucket counts, memory usage and
temporary-block counts can vary by build and page layout; equal join rows, many batches plus temp
traffic versus one batch without temp traffic are the stable comparison. Cleanup drops both
pe_join_* tables and restores the timeout settings. On the validated PostgreSQL 16 lab, the small
allowance used 256 batches with temp read=1769 written=1769; the larger allowance used one batch.

## Systems lens
Bounded-memory operators exchange peak memory for extra I/O by partitioning work. Capacity planning is multiplicative: account for each eligible hash or sort node, its multiplier, parallel workers and concurrent queries. A larger local allowance can remove spill for measured work, but one successful plan does not justify a server-wide value.

## Optional variation
Optional multiplier variation, independently runnable. Hold work_mem at 64kB and change only hash_mem_multiplier from the core's value of 1 to 8. If interrupted, ROLLBACK, drop pe_join_variation_orders and pe_join_variation_accounts, and reset lock_timeout and statement_timeout:

```sql
set lock_timeout = '3s';
set statement_timeout = '60s';
drop table if exists pe_join_variation_orders, pe_join_variation_accounts;
create table pe_join_variation_accounts (account_id int primary key, profile text not null);
create table pe_join_variation_orders (order_id int primary key, account_id int not null, amount int not null);
insert into pe_join_variation_accounts
select g, left(repeat(md5(g::text), 7), 200) from generate_series(1, 50000) g;
insert into pe_join_variation_orders
select g, g, g % 100 from generate_series(1, 50000) g;
analyze pe_join_variation_accounts;
analyze pe_join_variation_orders;
begin;
set local work_mem = '64kB';
set local hash_mem_multiplier = 8;
set local max_parallel_workers_per_gather = 0;
set local enable_nestloop = off;
set local enable_mergejoin = off;
\echo phase=variation_hash_multiplier
explain (analyze, buffers, timing off, summary off)
select sum(length(a.profile) + o.amount)
from pe_join_variation_orders o
join pe_join_variation_accounts a using (account_id);
commit;
drop table pe_join_variation_orders, pe_join_variation_accounts;
reset lock_timeout;
reset statement_timeout;
```

Expect the Hash Join to return 50,000 rows and the Hash node to use fewer batches than the core 64kB/multiplier-1 plan, while it can still use more than one batch and temporary I/O. hash_mem_multiplier scales the base work_mem allowance for hash operations only; it does not reserve that memory in advance or create a process-wide cap. On the validated PostgreSQL 16 lab, the variation used 32 batches with temp read=1548 written=1548.
