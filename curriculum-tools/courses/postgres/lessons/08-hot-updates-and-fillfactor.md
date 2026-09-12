# HOT updates: how reserved page space can make writes cheaper

slug: hot-updates-and-fillfactor
category: storage
difficulty: advanced
tags: storage, hot-updates, fillfactor, write-amplification, indexes
prerequisites: update-writes-a-new-tuple
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 20
revision: 4

## Overview
A Heap-Only Tuple (HOT) update can put a replacement row version on the old row's page without a
new index entry, but it needs page space and unchanged indexed columns. Compare matched tables at
fillfactor 100 and 70, first with one long transaction and then with separately committed updates.
The counters, page counts, and tuple pointers show why both free space and transaction shape matter.

## Syntax breakdown
### In plain terms

These matched tables receive the same logical updates, but one reserves 30 percent of each page at
initial load. PostgreSQL can make a HOT update when a non-indexed change fits on the old page.
You will compare one transaction with separate autocommit statements, because commit boundaries
change when an old version can become removable during later page access.

### What you are learning

- Fillfactor reserves page room for future updates, exchanging initial density for an opportunity
  to avoid index maintenance.
- HOT requires an unchanged indexed key and room for the replacement version on its old heap page.
- Transaction boundaries affect when old versions become removable; counters and page pointers are
  evidence, rather than a promise of a fixed HOT percentage.

### Piece by piece

- **fillfactor = 100 / fillfactor = 70** (table storage parameter)
  - What it is: the target percentage of each heap page filled by initial inserts.
  - What it does here: compares a packed table with one reserving space.
  - What it gives us: different starting page counts and HOT capacity.
- **DO ... FOR ... LOOP** (PL/pgSQL block)
  - What it is: an anonymous server-side procedure with a loop.
  - What it does here: repeats the non-indexed tag update 20 times for 100 rows in each table.
  - What it gives us: 2000 updates per table for a fair comparison.
- **CREATE TABLE ... (LIKE ... INCLUDING ALL)** (DDL copying clause)
  - What it is: creates a new table from another table's definition and copies its constraints and
    indexes as well as its columns.
  - What it does here: gives the separately committed case fresh tables with the same primary-key
    index as the first case.
  - What it gives us: a fair indexed-id phase; a plain LIKE would omit that index.
- **\\gexec** (psql query-result execution command)
  - What it is: sends each SQL command returned by the preceding query back to PostgreSQL.
  - What it does here: runs each generated UPDATE as its own psql statement, so normal autocommit
    gives every round a separate transaction.
  - What it gives us: a controlled contrast with the DO block, which is one transaction.
- **pg_stat_force_next_flush() and pg_stat_clear_snapshot()** (statistics functions)
  - What they are: the first requests a statistics flush; the second discards this session's cached
    statistics snapshot.
  - What they do here: make the following pg_stat_user_tables read as fresh as the server can provide.
  - What they give us: counters that can be compared without relying on an arbitrary sleep.
- **pg_stat_user_tables** (statistics view)
  - What it is: per-table update counters.
  - What it does here: reports n_tup_upd, n_tup_hot_upd, and pages.
  - What it gives us: total updates, HOT updates, their ratio, and page counts for each matched table.
- **round(..., 1) and nullif(..., 0)** (SQL functions)
  - What they are: round formats the percentage to one decimal place, and nullif changes a zero
    denominator to NULL instead of raising a division-by-zero error.
  - What they do here: calculate hot_pct safely from the cumulative counters.
  - What they give us: a readable percentage even if statistics have not flushed yet.
- **pg_relation_size(rel) / 8192** (size calculation)
  - What it is: relation bytes divided by one page.
  - What it does here: compares page growth after updates.
  - What it gives us: heap-page cost of write amplification.
- **heap_page_items and get_raw_page** (pageinspect functions)
  - What they are: decode each block's item slots.
  - What they do here: inspect line-pointer state and a tuple's physical target after the workload.
  - What they give us: flag 1 normal, 2 redirect, 3 dead, or 0 unused; redirects and changed t_ctid
    are qualitative chain evidence, while ordinary page pruning can affect other dead tuples too.
- **UPDATE ... SET id = id + 1000** (indexed-column update)
  - What it is: an update of the primary-key column, whose B-tree entry must change.
  - What it does here: provides a phase that cannot qualify as HOT.
  - What it gives us: total-update growth while the HOT counter remains unchanged.
- **DROP TABLE IF EXISTS / CREATE TABLE / INSERT ... generate_series** (challenge reset)
  - What they are: idempotent lab cleanup followed by the same primary-key schema and 100-row load
    used in the controlled cases.
  - What they do here: create fresh matched fillfactor-100 and fillfactor-80 histories.
  - What they give us: a comparison not distorted by the preceding twenty-round cases.
- **pg_stat_force_next_flush() followed by pg_stat_clear_snapshot()** (challenge statistics read)
  - What they are: a standalone request for the updater to publish counters, followed by discarding
    this session's cached statistics snapshot before reading it.
  - What they do here: occur after the ten separate update rounds and before the comparison query.
  - What they give us: fresh total and HOT counter deltas for just the variation tables.

## Setup
```sql
drop table if exists st_hot_tx_100, st_hot_tx_70, st_hot_commit_100, st_hot_commit_70;
create table st_hot_tx_100(id int primary key, tag text, payload text)
  with (fillfactor = 100, autovacuum_enabled = off);
create table st_hot_tx_70(id int primary key, tag text, payload text)
  with (fillfactor = 70, autovacuum_enabled = off);
insert into st_hot_tx_100 select g, 'a', repeat('p', 200) from generate_series(1, 100) g;
insert into st_hot_tx_70  select g, 'a', repeat('p', 200) from generate_series(1, 100) g;
```

## Run
```sql
select relname, reloptions, pg_relation_size(oid) / current_setting('block_size')::int as pages
from pg_class where relname in ('st_hot_tx_100','st_hot_tx_70') order by relname;

-- Controlled case 1: the complete loop is one transaction.
do $sql$
begin
  for i in 1..20 loop
    update st_hot_tx_100 set tag = 'tx-' || i;
    update st_hot_tx_70  set tag = 'tx-' || i;
  end loop;
end
$sql$;
select pg_stat_force_next_flush();
select pg_stat_clear_snapshot();
select relname, n_tup_upd, n_tup_hot_upd,
       round(100.0 * n_tup_hot_upd / nullif(n_tup_upd,0), 1) as hot_pct,
       pg_relation_size(relid) / current_setting('block_size')::int as pages
from pg_stat_user_tables where relname in ('st_hot_tx_100','st_hot_tx_70') order by relname;

-- Controlled case 2 uses fresh matched tables, not the first case's history.
create table st_hot_commit_100 (like st_hot_tx_100 including all)
  with (fillfactor = 100, autovacuum_enabled = off);
create table st_hot_commit_70  (like st_hot_tx_70 including all)
  with (fillfactor = 70, autovacuum_enabled = off);
insert into st_hot_commit_100 select g, 'a', repeat('p', 200) from generate_series(1, 100) g;
insert into st_hot_commit_70  select g, 'a', repeat('p', 200) from generate_series(1, 100) g;

-- Each result is an UPDATE. psql's normal autocommit commits every \gexec command separately.
select format('update %I set tag = %L', relname, 'commit-' || round_no)
from generate_series(1, 20) round_no
cross join (values ('st_hot_commit_100'), ('st_hot_commit_70')) as t(relname)
order by round_no, relname
\gexec

select pg_stat_force_next_flush();
select pg_stat_clear_snapshot();
select relname, n_tup_upd, n_tup_hot_upd,
       round(100.0 * n_tup_hot_upd / nullif(n_tup_upd,0), 1) as hot_pct,
       pg_relation_size(relid) / current_setting('block_size')::int as pages
from pg_stat_user_tables where relname in ('st_hot_commit_100','st_hot_commit_70') order by relname;

-- An indexed-key change cannot be HOT. The total grows; the HOT counter does not.
select n_tup_upd as total_before, n_tup_hot_upd as hot_before
from pg_stat_user_tables where relname = 'st_hot_commit_70';
update st_hot_commit_70 set id = id + 1000;
select pg_stat_force_next_flush();
select pg_stat_clear_snapshot();
select n_tup_upd as total_after, n_tup_hot_upd as hot_after
from pg_stat_user_tables where relname = 'st_hot_commit_70';

-- Flags and t_ctid are physical chain evidence, not fixed quotas.
select lp, lp_flags, t_ctid
from heap_page_items(get_raw_page('st_hot_commit_70', 0))
where lp_flags <> 0
order by lp
limit 25;
```

## Expected result
Each controlled case reports 2,000 total non-indexed updates for each table. The fillfactor-70 table
starts with at least as many pages as its fillfactor-100 mate because it reserves room. Its HOT ratio
will often be higher, but neither a packed table's ratio nor either page count has a universal fixed
value: tuple size, page history, and opportunistic pruning all affect the outcome.

The second pair is fresh, so its separately committed rounds are not contaminated by the long
transaction's history. Compare its HOT ratio and pages with the first pair. A committed old version
can become removable before a later statement, while versions made earlier in one still-open
transaction cannot; page access and pruning determine how much of that opportunity is used.

For st_hot_commit_70, total_after is 100 greater than total_before after the indexed-id phase, while
hot_after equals hot_before. The page sample may contain normal, redirect, dead, or unused slots;
a redirect and a changed t_ctid show an in-page chain. Other dead tuples may be pruned too, so flags
are evidence to interpret with the counters, not a HOT-only census.

## Systems lens
Reserved page space can lower update work when the workload repeatedly changes non-indexed columns,
but it costs density and can hurt read locality or cache use. The appropriate fillfactor depends on
the row width, update pattern, indexes, and space budget. This resembles B-tree fillfactor and slack
in other write-optimized structures: capacity reserved for future change is valuable only when that
change actually arrives.

## Optional variation
Reset a fresh matched pair, then run the same ten separately committed tag-update rounds at
fillfactor 100 and 80. This is independent of the earlier tables:

drop table if exists st_hot_var_100, st_hot_var_80;
create table st_hot_var_100(id int primary key, tag text, payload text)
  with (fillfactor = 100, autovacuum_enabled = off);
create table st_hot_var_80(id int primary key, tag text, payload text)
  with (fillfactor = 80, autovacuum_enabled = off);
insert into st_hot_var_100 select g, 'a', repeat('p', 200) from generate_series(1, 100) g;
insert into st_hot_var_80  select g, 'a', repeat('p', 200) from generate_series(1, 100) g;
select format('update %I set tag = %L', relname, 'variation-' || round_no)
from generate_series(1, 10) round_no
cross join (values ('st_hot_var_100'), ('st_hot_var_80')) as t(relname)
order by round_no, relname
\gexec

-- Issue this as its own updater statement, then read a fresh statistics snapshot.
select pg_stat_force_next_flush();
select pg_stat_clear_snapshot();
select relname, n_tup_upd, n_tup_hot_upd,
       round(100.0 * n_tup_hot_upd / nullif(n_tup_upd, 0), 1) as hot_pct,
       pg_relation_size(relid) / current_setting('block_size')::int as pages
from pg_stat_user_tables
where relname in ('st_hot_var_100', 'st_hot_var_80')
order by relname;

Each table should show 1,000 total updates. Compare their HOT counters and pages as a workload
measurement, not a fixed promise. For a workload that mostly reads rows after a one-time load,
would the extra reserved pages still be a good trade?
