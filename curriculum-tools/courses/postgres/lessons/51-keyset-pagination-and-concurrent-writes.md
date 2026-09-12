# Continue from a key boundary while new rows arrive

slug: keyset-pagination-and-concurrent-writes
category: indexes
difficulty: advanced
tags: btree, pagination, concurrency, index-scans
prerequisites: partial-and-covering-indexes
safety: writes-data
run-in: tool
sessions: 2
min-version: 16
minutes: 20
revision: 1

## Overview
OFFSET asks PostgreSQL to walk past every earlier result, while keyset pagination seeks from a saved
ordered key. This lesson uses a nonunique timestamp plus id tie-breaker, compares a deep OFFSET with
a keyset page from the same boundary, and then inserts a row before that boundary. In READ COMMITTED,
OFFSET 5 repeats a row after the insert; the keyset predicate continues after the saved pair.

## Syntax breakdown
### In plain terms

A cursor boundary is the last sort key a client actually saw. With a composite index on created_at
and id, a query using **(created_at, id) > boundary** can seek after that pair. OFFSET has no such
boundary: it discards the first N rows of the current result, so an earlier insert changes which row
is N+1.

### What you are learning

- **Tie-breaker:** A nonunique timestamp needs id in both ORDER BY and the cursor predicate.
- **Keyset seek:** A composite B-tree can continue after a supplied pair without visiting every prior row.
- **Read Committed drift:** Separate statements take fresh snapshots, so neither pagination form alone
  creates a stable view across inserted, deleted, or re-sorted rows.

### Piece by piece

- **CREATE INDEX ... (created_at, id)** creates the ordered access path used by both pagination queries.
  It lets PostgreSQL seek on the complete ordering rather than sorting 100,000 rows.
- **OFFSET 50005 LIMIT 5** discards a deep prefix before returning five rows. EXPLAIN reports rows
  visited and buffers; the returned answer is compared with the keyset result.
- **\gset** saves the actual fifth row of the first page as **:boundary_created_at** and
  **:boundary_id**. The later predicate uses this observed value, not an invented timestamp.
- **(created_at, id) > (...)** is a row comparison matching the composite sort order. It returns rows
  strictly after the saved cursor pair.
- **INSERT** in Session B adds a row sorting before A's first five rows. It is committed before A's
  next READ COMMITTED statements, deliberately changing their snapshot.
- **BEGIN ISOLATION LEVEL REPEATABLE READ** in the variation fixes one snapshot. It prevents this
  insert from changing later pages in that transaction, but does not let a keyset cursor jump to an
  arbitrary deep page for free.

## Setup
```sql
drop table if exists ix_page;
create table ix_page(id bigint primary key, created_at timestamptz not null, body text not null);
insert into ix_page
select g, timestamptz '2026-01-01 00:00:00+00' + (g / 10) * interval '1 second', repeat('x', 80)
from generate_series(1, 100000) g;
create index ix_page_created_id on ix_page(created_at, id);
vacuum (analyze) ix_page;
```

## Run
```sql
-- Session A: use autocommit READ COMMITTED with no pre-existing transaction.
set default_transaction_isolation='read committed';
select id, created_at from ix_page order by created_at, id limit 5;
select created_at as boundary_created_at, id as boundary_id
from ix_page order by created_at, id offset 4 limit 1 \gset

-- Acquire a separate deep boundary, then compare the same next five rows two ways.
select created_at as deep_created_at, id as deep_id
from ix_page order by created_at, id offset 50004 limit 1 \gset
explain (analyze, buffers, costs off)
select id, created_at from ix_page order by created_at, id offset 50005 limit 5;
explain (analyze, buffers, costs off)
select id, created_at from ix_page
where (created_at, id) > (:'deep_created_at'::timestamptz, :deep_id)
order by created_at, id limit 5;
select array_agg(id order by id) as offset_ids from (
  select id from ix_page order by created_at, id offset 50005 limit 5
) s \gset
select array_agg(id order by id) as keyset_ids from (
  select id from ix_page where (created_at, id) > (:'deep_created_at'::timestamptz, :deep_id)
  order by created_at, id limit 5
) s \gset
select :'offset_ids' as offset_ids, :'keyset_ids' as keyset_ids,
  :'offset_ids'::bigint[]=:'keyset_ids'::bigint[] as same_deep_page;

-- Session B: commit a row that sorts before A's saved first-page boundary.
insert into ix_page values (100001, timestamptz '2025-12-31 23:59:59+00', repeat('n', 80));

-- Session A: a fresh READ COMMITTED OFFSET repeats id 5; keyset continues after the saved pair.
select id as offset_after_insert from ix_page order by created_at, id offset 5 limit 1;
select id as keyset_after_insert from ix_page
where (created_at, id) > (:'boundary_created_at'::timestamptz, :boundary_id)
order by created_at, id limit 1;
delete from ix_page where id = 100001;
reset default_transaction_isolation;
```

## Expected result
Before B inserts, both deep result arrays contain ids 50006 through 50010. The deep OFFSET plan visits 50,010 index entries to return its five rows, while the keyset plan visits five after a composite index
condition; buffers and exact plan labels vary by cache state. After B commits id 100001 before the
first page, OFFSET 5 returns id 5 again, while the saved keyset predicate returns id 6. The cleanup
removes the inserted row. These are separate READ COMMITTED statements: deleting a row or updating a
sort key can still change a later keyset page, and acquiring a cursor is separate from jumping to an
arbitrary page.

## Systems lens
A keyset is an ordered continuation token, not a snapshot or a page number. The same distinction
appears in change-feed offsets and object-listing cursors: a stable ordering plus a tie-breaker makes
continuation efficient, while consistency across a changing collection needs an explicit snapshot or
application policy.

## Optional variation
Rerun setup. In A begin isolation level repeatable read, acquire the first-page boundary, then let B
insert id 100001 before it. Repeat OFFSET 5 and the keyset query inside A before COMMIT: both retain
the original snapshot. Delete id 100001 after A commits.
