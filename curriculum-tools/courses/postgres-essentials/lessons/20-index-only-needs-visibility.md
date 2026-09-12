# Covering the columns is only half an index-only scan

slug: index-only-needs-visibility
category: query-execution
difficulty: intermediate
tags: indexes, mvcc, visibility-map, query-plans
prerequisites: composite-index-order
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 25
revision: 1

## Overview
Run the same selective covering-index query after vacuum, after a committed update, and after vacuum again. The plan remains an Index Only Scan, but Heap Fetches reveal when the executor must visit the heap to establish MVCC visibility. Use that evidence when deciding whether a covering index will actually avoid heap work under writes.

## Syntax breakdown
### In plain terms
A B-tree can contain every column a query needs and still be unable to prove that an index entry is
visible to the current transaction. PostgreSQL records an all-visible bit for each heap page. When
that bit is clear, an Index Only Scan checks the heap even though it gets the values from the index.

### Mechanism map

```text
A covering index still needs visibility evidence

covering B-tree: predicate + projected columns
          |
          +-- heap page all-visible? -- yes --> return index tuple (Heap Fetches: 0)
                                  +-- no  --> check heap tuple (Heap Fetches: positive)

VACUUM can mark eligible pages all-visible again; coverage and visibility do different jobs.
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
- Index coverage answers whether values are available in the index; the visibility map answers
  whether the executor may skip the heap's MVCC check.
- A committed UPDATE clears all-visible state for affected heap pages. Its next index-only query can
  therefore report positive Heap Fetches.
- VACUUM can mark eligible pages all-visible again, returning the same plan to zero Heap Fetches.
- The visibility bit applies to a whole heap page, so changing some qualifying rows can make other
  index entries on those pages require heap checks too.

### Piece by piece
- **SET lock_timeout / statement_timeout** bound fixture locks and each statement. They are guards,
  not expected outcomes, and RESET restores the session defaults.
- **WITH (autovacuum_enabled = false)** affects only pe_visibility_cover. It prevents an automatic
  vacuum from changing the three labelled observations.
- **generate_series(1, 20000)** builds enough fixed-shape rows for a clear selective index path.
  **g % 100** assigns account IDs cyclically; **g::text** casts each integer for **md5**, which
  creates deterministic text, and **repeat(..., 4)** widens each payload without random input.
- **INCLUDE (status, payload)** stores projected columns as non-key index columns. They can be
  returned by the index but do not change the key order (account_id, id).
- **VACUUM (ANALYZE)** removes eligible dead versions, updates planner statistics and marks eligible
  heap pages all-visible. It runs outside an explicit transaction.
- **EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF)** executes the SELECT. ANALYZE adds actual
  rows and loops, BUFFERS adds buffer activity, TIMING OFF omits per-node timers, and SUMMARY OFF
  omits the final planning/execution summary. EXPLAIN output is evidence; it does not return the
  query's rows to the client.
- **Index Only Scan** means all selected values are available from the index. **Heap Fetches** counts
  index entries for which the executor still visited the heap for visibility in this execution.
- **UPDATE ... SET status = status || '-changed'** creates committed row versions for the exact
  queried range. Because status is included in the index, PostgreSQL also maintains index entries.
- **\echo phase=...** prints a stable label immediately before each plan so the three observations
  cannot be confused.
- **DROP TABLE** removes the table, its covering index and its table-local autovacuum setting.

## Caution
This experiment disables autovacuum only on pe_visibility_cover so a background worker cannot repair the evidence between phases. Run every phase in order in one session. If interrupted, run ROLLBACK; DROP TABLE IF EXISTS pe_visibility_cover; RESET lock_timeout; RESET statement_timeout before rerunning setup.

## Setup
```sql
set lock_timeout = '3s';
set statement_timeout = '60s';
drop table if exists pe_visibility_cover;
create table pe_visibility_cover (
  id integer primary key,
  account_id integer not null,
  status text not null,
  payload text not null
) with (autovacuum_enabled = false);
insert into pe_visibility_cover
select g, g % 100, 'ready', repeat(md5(g::text), 4)
from generate_series(1, 20000) as g;
create index pe_visibility_cover_lookup
  on pe_visibility_cover (account_id, id) include (status, payload);
vacuum (analyze) pe_visibility_cover;
```

## Run
```sql
-- Session A: coverage plus all-visible pages avoids heap checks.
\echo phase=vacuumed_baseline
explain (analyze, buffers, timing off, summary off)
select id, status, payload
from pe_visibility_cover
where account_id = 7 and id between 1 and 10000;

-- Session A: commit new versions on pages used by the same query.
begin;
update pe_visibility_cover
set status = status || '-changed'
where account_id = 7 and id between 1 and 10000;
commit;
\echo phase=after_update
explain (analyze, buffers, timing off, summary off)
select id, status, payload
from pe_visibility_cover
where account_id = 7 and id between 1 and 10000;

-- Session A: restore visibility-map evidence and repeat unchanged SQL.
vacuum pe_visibility_cover;
\echo phase=after_vacuum
explain (analyze, buffers, timing off, summary off)
select id, status, payload
from pe_visibility_cover
where account_id = 7 and id between 1 and 10000;

drop table pe_visibility_cover;
reset lock_timeout;
reset statement_timeout;
```

## Expected result
All three labelled plans contain Index Only Scan using pe_visibility_cover_lookup and return exactly
100 actual rows. At phase=vacuumed_baseline the scan reports Heap Fetches: 0. The committed UPDATE
affects 100 rows, and phase=after_update reports a positive Heap Fetches count because affected heap
pages are no longer all-visible. After explicit VACUUM, phase=after_vacuum reports Heap Fetches: 0
again. Buffer counts and the positive middle count can vary with page layout and cache state; the
zero / positive / zero sequence with the unchanged node type and row count is the stable evidence.
On the validated PostgreSQL 16 lab, the middle plan reported Heap Fetches: 200.
Cleanup drops pe_visibility_cover and restores the session settings.

## Systems lens
A secondary structure can contain the answer's values while still depending on metadata maintained elsewhere for correctness. PostgreSQL's visibility map is page-level proof that lets an index-only executor omit tuple-level heap checks. Update rate, page locality and vacuum progress therefore affect the realized benefit of a covering index, while INCLUDE columns also add write and storage cost. Treat plan shape together with Heap Fetches as workload evidence rather than assuming coverage guarantees heap-free reads.

## Optional variation
Optional non-covering variation, independently runnable. If interrupted, ROLLBACK, drop pe_visibility_variation and reset lock_timeout and statement_timeout. Compare the node type and heap work with the covering-index core:

```sql
set lock_timeout = '3s';
set statement_timeout = '60s';
drop table if exists pe_visibility_variation;
create table pe_visibility_variation (id int primary key, account_id int not null, payload text not null);
insert into pe_visibility_variation
select g, g % 100, repeat(md5(g::text), 4) from generate_series(1, 20000) g;
create index pe_visibility_variation_lookup on pe_visibility_variation (account_id, id);
vacuum (analyze) pe_visibility_variation;
\echo phase=variation_noncovering
explain (analyze, buffers, timing off, summary off)
select id, payload from pe_visibility_variation
where account_id = 7 and id between 1 and 10000;
drop table pe_visibility_variation;
reset lock_timeout;
reset statement_timeout;
```

The index omits payload, so the plan must use heap access (normally an Index Scan or Bitmap Heap Scan) even after VACUUM. Coverage is a prerequisite for Index Only Scan; all-visible pages cannot supply a value absent from the index. A Bitmap Heap Scan first collects matching tuple locations from the index, then visits heap pages in physical order; an ordinary Index Scan follows index entries to their heap tuples.
