# Match an index to filtering and ordering

slug: composite-index-order
category: query-evidence
difficulty: intermediate
tags: query-plans, indexes, b-tree, performance
prerequisites: index-crossover
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 25
revision: 1

## Overview
Serve one tenant's newest ten events with two composite B-trees, installing only one at a time. Both index orders can emit descending event time without a sort, but only the tenant-first index can jump directly into that tenant's ordered slice. Compare identical queries by scan conditions and buffers touched before choosing the index order.

## Syntax breakdown
### In plain terms
A multicolumn B-tree is ordered first by its leading column, then by the next column within equal
leading values. For WHERE tenant_id = 1 ORDER BY event_time DESC LIMIT 10, an index beginning with
tenant_id reaches that tenant's newest entries directly. An index beginning with event_time can
still walk in time order and avoid sorting, but may test many other tenants before finding ten
matches.

### Mechanism map

```text
Identical request: tenant 1, newest 10 events

(event_time, tenant_id)        (tenant_id, event_time)
ordered across every tenant    grouped by tenant, ordered within tenant
        |                                  |
walk past other tenants                 jump to tenant 1
        |                                  |
many index entries tested                 10 entries returned

Both B-trees can provide reverse time order here. Leading-column order changes
how directly the index reaches the requested tenant.
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
- Column order determines which prefix of a composite B-tree can locate a contiguous slice.
- Equality on the leading tenant column leaves event_time ordered inside that tenant's slice.
- An ORDER BY-compatible index can stop at LIMIT, but avoiding a Sort does not prove efficient
  filtering.
- Similar node names and ten output rows can hide very different index traversal; buffers reveal
  the extra page accesses even when no heap-level Filter rejects rows.

### Piece by piece
- **SET lock_timeout / statement_timeout** bound lock waits and total statement time. The table's
  **autovacuum_enabled = false** prevents background maintenance on this fixture alone.
- **generate_series(1, 100000)** supplies IDs and **repeat('e', 120)** gives events fixed payloads.
  **ANALYZE pe_event** refreshes sampled planning statistics after loading and replacing the index.
- **tenant_id = ((g - 1) / 1000) + 1** uses integer division to create 100 contiguous tenants with 1,000 events each.
  **event_time = timestamptz '2026-01-01 00:00:00+00' + g * interval '1 second'** gives every event
  a unique, deterministic time: **timestamptz** is a time-zone-aware timestamp and **interval** is
  the one-second duration multiplied by the ID. LIMIT never has ambiguous ties.
- **CREATE INDEX ... (event_time, tenant_id)** orders the entire table by time first. PostgreSQL can
  scan it backward for DESC, testing tenant_id = 1 inside the index as it walks past later tenants.
  This check can avoid their heap fetches without skipping their index entries.
- **DROP INDEX** ensures the comparison installs only one candidate index at a time.
- **CREATE INDEX ... (tenant_id, event_time)** groups entries by tenant and orders times within each
  tenant. The equality condition forms the leading search boundary in Index Cond, and a backward scan starts at tenant 1's
  newest entry.
- **ORDER BY event_time DESC LIMIT 10** states the actual workload. The projected event_id is unique,
  and event_time is also unique in this fixture, so the returned order is stable.
- **EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)** executes the identical query and reports rows, loops,
  filtering and shared buffers. Look below Limit at the index scan; the Limit's ten output rows do
  not describe all work performed by its child.
- The time-first scan may display tenant_id in **Index Cond**, but a condition on a later B-tree
  column does not necessarily narrow the contiguous index range scanned. Compare buffers and scan
  work rather than interpreting the label alone. The tenant-first condition bounds one tenant's
  contiguous slice.
- **\echo phase_...** labels each immediately following plan. **DROP TABLE** removes the heap,
  remaining index and table-local autovacuum setting.

## Caution
This experiment creates and replaces indexes on a disposable 100,000-row pe_event table. Run it only in the supplied lab. If interrupted, run ROLLBACK; DROP TABLE IF EXISTS pe_event; RESET lock_timeout; RESET statement_timeout.

## Setup
```sql
set lock_timeout = '3s';
set statement_timeout = '30s';
drop table if exists pe_event;
create table pe_event (
  event_id int primary key,
  tenant_id int not null,
  event_time timestamptz not null,
  payload text not null
) with (autovacuum_enabled = false);
insert into pe_event
select g,
       ((g - 1) / 1000) + 1,
       timestamptz '2026-01-01 00:00:00+00' + g * interval '1 second',
       repeat('e', 120)
from generate_series(1, 100000) g;
analyze pe_event;
create index pe_event_time_tenant_idx on pe_event (event_time, tenant_id);
```

## Run
```sql
-- Session A: time first supplies order but examines entries beyond the requested tenant.
\echo phase_time_first
explain (analyze, buffers, timing off)
select event_id, event_time
from pe_event
where tenant_id = 1
order by event_time desc
limit 10;

-- Session A: replace it with tenant first and run the identical workload.
drop index pe_event_time_tenant_idx;
create index pe_event_tenant_time_idx on pe_event (tenant_id, event_time);
analyze pe_event;
\echo phase_tenant_first
explain (analyze, buffers, timing off)
select event_id, event_time
from pe_event
where tenant_id = 1
order by event_time desc
limit 10;

-- Session A: remove the fixture while the timeout guards still apply, then restore the session.
drop table pe_event;
reset lock_timeout;
reset statement_timeout;
```

## Expected result
Both labelled plans return ten rows through Limit with one loop, and neither needs an explicit Sort.
phase_time_first uses a backward scan of pe_event_time_tenant_idx. It cannot use tenant_id as the
leading search boundary. PostgreSQL may print tenant_id as an Index Cond, yet the scan still walks
past the later tenants before reaching tenant 1's final ten entries.

phase_tenant_first uses a backward scan of pe_event_tenant_time_idx with Index Cond: (tenant_id =
1). It returns the same ten-event result after visiting only that tenant's slice. On the validated
PostgreSQL 16 fixture, the time-first scan accessed 384 shared buffers and the tenant-first scan
accessed 4. Exact hit/read splits depend on cache history; the scan extent and large buffer difference
are the useful evidence.
Cleanup drops pe_event and restores the timeout settings.

## Systems lens
Composite index order encodes a workload hierarchy. Put columns constrained by equality before the column used for ordered range access when that matches the important query, then verify the plan and write overhead on representative data. A plan that avoids sorting can still scan or filter far more index entries than necessary, so inspect child-node work rather than stopping at the visible Limit.

## Optional variation
Optional reverse-order variation, independently runnable. Request tenant 100's oldest events: ASC reverses the direction and choosing the opposite tenant endpoint keeps the time-first traversal long. This changes both request parameters deliberately; run the block to inspect the forward scan.

```sql
-- Session A: recreate the fixture and compare forward scans.
set lock_timeout = '3s';
set statement_timeout = '30s';
drop table if exists pe_event;
create table pe_event (event_id int primary key, tenant_id int not null, event_time timestamptz not null, payload text not null) with (autovacuum_enabled = false);
insert into pe_event
select g, ((g - 1) / 1000) + 1, timestamptz '2026-01-01 00:00:00+00' + g * interval '1 second', repeat('e', 120)
from generate_series(1, 100000) g;
analyze pe_event;
create index pe_event_time_tenant_idx on pe_event (event_time, tenant_id);
\echo phase_time_first_ascending
explain (analyze, buffers, timing off) select event_id, event_time from pe_event where tenant_id = 100 order by event_time asc limit 10;
drop index pe_event_time_tenant_idx;
create index pe_event_tenant_time_idx on pe_event (tenant_id, event_time);
analyze pe_event;
\echo phase_tenant_first_ascending
explain (analyze, buffers, timing off) select event_id, event_time from pe_event where tenant_id = 100 order by event_time asc limit 10;
drop table pe_event;
reset lock_timeout;
reset statement_timeout;
```

Both plans should use forward index scans without Sort. Compare the time-first scan extent and buffers with the tenant-first bounded slice; direction alone does not repair a poor leading column.
