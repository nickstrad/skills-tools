# Index less, or index more: partial and covering indexes

slug: partial-and-covering-indexes
category: indexes
difficulty: intermediate
tags: index-scans, query-planning, explain, btree
prerequisites: visibility-map-and-index-only-scans
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 20
revision: 4

## Overview
Compare a partial index for a small pending subset with a covering index that carries amount for
tenant reads. Keep the measured answer fixed while changing the access path, then request a column
that the covering index lacks. Finally, compare identical updates on matched small tables to expose
the HOT cost of indexing an updated payload.

## Syntax breakdown
### In plain terms

A partial index stores only rows matching a predicate, while a covering index stores extra columns
so a query can answer from the index alone. PostgreSQL uses a partial index only when it can prove
the query condition implies the index predicate; logically equivalent wording may fail that proof.
You will measure the saved index space, the I/O benefit of INCLUDE, and the write cost of carrying it.

### What you are learning

- **Partial indexes:** Indexing only a hot subset can save storage and maintenance work.
- **Predicate implication:** The planner needs a supported implication proof that the query is covered.
- **INCLUDE columns:** Payload columns can satisfy reads but cannot search or order the index.
- **Read/write trade-off:** Covering data reduces heap reads while adding storage and maintenance for indexed changes.

### Piece by piece

- **CREATE INDEX ... WHERE status = 'pending'** (partial-index DDL)
  - What it is: It stores entries only for rows satisfying the WHERE predicate.
  - What it does here: It keeps 1000 pending rows instead of all 100000 orders.
  - What it gives us: A small index that can answer matching pending queries.
- **EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)** (plan command and options)
  - What it is: It executes the query, reports buffers, and hides cost numbers.
  - What it does here: It tests when the partial and covering indexes are selected.
  - What it gives us: Index Only Scan or Seq Scan, Heap Fetches, and page totals.
- **Predicate implication** (planner reasoning)
  - What it is: A proof that every row requested by a query belongs to the indexed subset.
  - What it does here: status = 'pending' matches the predicate, while status <> 'done' is equivalent only on today's rows, not for all states the schema permits.
  - What it gives us: The presence or absence of the partial index in the plan.
- **CREATE INDEX ... INCLUDE (amount)** (covering-index DDL)
  - What it is: It adds amount as non-key payload on leaf entries.
  - What it does here: It lets sum(amount) be answered from ix_orders_tenant_cov.
  - What it gives us: Index Only Scan and lower buffers, at the cost of a larger index.
- **pg_relation_size and pg_size_pretty** (size functions)
  - What they are: The first returns bytes; the second formats bytes for people.
  - What they do here: They compare full, partial, key-only, and covering index sizes.
  - What they give us: Byte and kB totals that quantify storage and cache cost.
- **CREATE INDEX ... ON tenant** (key-only index DDL)
  - What it is: It indexes tenant without storing amount as payload.
  - What it does here: It finds matching rows but requires heap access for sum(amount).
  - What it gives us: The baseline Bitmap Heap Scan and its scattered page reads.
- **VACUUM (ANALYZE)** (maintenance command)
  - What it is: It marks visible pages and refreshes planner statistics.
  - What it does here: It makes the covering index's index-only result have zero Heap Fetches.
  - What it gives us: A fair buffer comparison between the two index designs.
- **INCLUDE columns and equality search** (index limitation)
  - What they are: Included fields are stored data, not ordering keys.
  - What they do here: amount = 700 cannot use the tenant index as a search structure.
  - What they give us: A Seq Scan proving that coverage is not the same as lookup ability.
- **generate_series, repeat, and SUM** (setup function and SQL aggregate)
  - What they are: generate_series creates rows, repeat supplies note padding, and SUM adds amount values.
  - What they do here: They build the measured table and the covering query's aggregate.
  - What they give us: Predictable 100000-row size and a query that needs the amount column.

- **LIKE ... INCLUDING ALL and fillfactor70** (matched write fixture)
  - What they are: LIKE copies the table definition and indexes; the fillfactor leaves space on heap pages at load time.
  - What they do here: Two small tables receive the same rows before one adds INCLUDE(amount) to its tenant index.
  - What they give us: Comparable update history and room for HOT where no indexed value changes.
- **pg_stat_xact_user_tables** (transaction-local counters)
  - What it is: This session's table activity in the current transaction.
  - What it does here: It reads n_tup_upd and n_tup_hot_upd before COMMIT, after two100-row updates.
  - What it gives us: Direct update evidence without asynchronous cumulative-statistics lag.
- **id % 20 = 0 and \gset** (selection and result capture)
  - What they are: Modulo picks every twentieth row; the psql command stores a one-row result in named variables.
  - What they do here: They distribute100 updates across available page space and capture the read aggregate before/after adding coverage.
  - What they give us: same_contents and unchanged_sum must be true alongside the physical-work comparison.

## Setup
```sql
drop table if exists ix_orders;
create table ix_orders(id int primary key, tenant int, status text, amount int, note text)
  with (autovacuum_enabled = off);
insert into ix_orders
select g, g % 100, case when g % 100 = 0 then 'pending' else 'done' end, g, repeat('n', 50)
from generate_series(1, 100000) g;
create index ix_orders_status on ix_orders(status);
create index ix_orders_pending on ix_orders(status) where status = 'pending';
create index ix_orders_tenant on ix_orders(tenant);
vacuum (analyze) ix_orders;
-- Matched write-cost fixtures: same history, rows and spare space; one index includes amount.
drop table if exists ix_hot_plain,ix_hot_cover;
create table ix_hot_plain(id int primary key,tenant int,amount int,note text)
  with(fillfactor=70,autovacuum_enabled=off);
create table ix_hot_cover(like ix_hot_plain including all)
  with(fillfactor=70,autovacuum_enabled=off);
insert into ix_hot_plain select g,g%100,g,repeat('n',20) from generate_series(1,2000) g;
insert into ix_hot_cover select * from ix_hot_plain;
create index ix_hot_plain_tenant on ix_hot_plain(tenant);
create index ix_hot_cover_tenant on ix_hot_cover(tenant) include(amount);
vacuum(analyze) ix_hot_plain;
vacuum(analyze) ix_hot_cover;
```

## Run
```sql
select indexrelid::regclass as index,pg_relation_size(indexrelid) as bytes
from pg_index where indrelid='ix_orders'::regclass order by indexrelid::regclass::text;
drop index ix_orders_status;
explain(analyze,buffers,costs off) select count(*) from ix_orders where status='pending';
-- These conditions differ: the first retains500 rows, the second1,000 in today's fixture.
explain(analyze,buffers,costs off) select count(*) from ix_orders where status='pending' and amount>50000;
explain(analyze,buffers,costs off) select count(*) from ix_orders where status<>'done';
select sum(amount) as before_sum from ix_orders where tenant=7 \gset
explain(analyze,buffers,costs off) select sum(amount) from ix_orders where tenant=7;
create index ix_orders_tenant_cov on ix_orders(tenant) include(amount);
vacuum(analyze) ix_orders;
explain(analyze,buffers,costs off) select sum(amount) from ix_orders where tenant=7;
select sum(amount) as after_sum from ix_orders where tenant=7 \gset
select :before_sum=:after_sum as unchanged_sum,:after_sum as tenant_sum;
select indexrelid::regclass as index,pg_relation_size(indexrelid) as bytes
from pg_index where indexrelid in ('ix_orders_tenant'::regclass,'ix_orders_tenant_cov'::regclass);
-- The missing column still requires heap access despite the amount covering index.
explain(analyze,buffers,costs off) select sum(length(note)) from ix_orders where tenant=7;
-- INCLUDE is payload; it does not make amount a searchable B-tree key.
explain(costs off) select id from ix_orders where amount=700;

-- Both updates commit the same100 logical changes with different HOT eligibility.
begin;
update ix_hot_plain set amount=amount+1 where id%20=0;
update ix_hot_cover set amount=amount+1 where id%20=0;
select relname,n_tup_upd,n_tup_hot_upd from pg_stat_xact_user_tables
where relid in ('ix_hot_plain'::regclass,'ix_hot_cover'::regclass) order by relname;
commit;
select (select count(*) from ix_hot_plain)=(select count(*) from ix_hot_cover)
   and (select sum(amount) from ix_hot_plain)=(select sum(amount) from ix_hot_cover) as same_contents;
```

## Expected result
The fixture contains1,000 pending orders out of100,000. Compare the full status index's bytes with
the partial index before dropping the full index. With freshly vacuumed pages, the pending COUNT
can use index-only access with zero heap fetches. The predicate with amount>50000 returns500;
status<>'done' returns1,000 for today's data but also permits future values outside the partial
predicate. Data coincidence does not prove that the partial index covers that query.

For tenant7, the before/after SUM is49,957,000 and unchanged_sum=true. Validation changed the
key-only bitmap heap path to covering index-only access, reducing about1,003 buffer accesses to6.
Sizes were about728KiB for the key-only tenant index and2,224KiB for INCLUDE(amount); exact values
vary. The comparison includes B-tree deduplication being unavailable with INCLUDE, so the size cost
is more than simply four extra bytes per row. Requesting note still needs heap data. Visibility
checks can also require heap fetches even when every requested column is covered.

The two2,000-row update fixtures have identical rows and fillfactor70. Both change amount on100
well-spaced rows in one transaction. The key-only fixture permits HOT; INCLUDE(amount) makes the
changed payload indexed and therefore prevents these HOT updates. Read pg_stat_xact_user_tables
inside that same transaction: validation should report100 updates and100 HOT for ix_hot_plain,
versus100 updates and0 HOT for ix_hot_cover. This direct transaction-local view avoids waiting for
cumulative statistics to publish. Row counts and amount sums must match after commit.

HOT eligibility is a mechanism result, not a throughput benchmark. Layout and free space still
matter, and the larger read index is justified only by the workload's reads, writes and footprint.

## Systems lens
An index is maintained derived state. Selecting fewer rows can reduce its scope; carrying more
columns can improve read locality while adding maintenance and cache demand. Keep the application
answer and data invariant fixed during that comparison. A small active subset and a read-mostly
payload may justify different designs from a frequently changing payload.

## Optional variation
Repeat the matched update trial, changing note instead of amount on the same100 spaced rows.
Because neither secondary index stores note, can both tables now use HOT? Compare transaction-local
counters and equal post-update contents. The hint recreates neither table beyond the supplied setup.
