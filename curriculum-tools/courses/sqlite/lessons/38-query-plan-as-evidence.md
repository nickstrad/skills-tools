# Read SQLite's SCAN, SEARCH, and covering-index evidence

slug: query-plan-as-evidence
category: performance
difficulty: intermediate
tags: query-planner, indexes, observability
prerequisites: recover-damaged-copy
safety: ddl
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 20
revision: 3

## Overview
Compare the same 200-row answer before and after indexing a 20,000-row table. You already know why indexes exist from PostgreSQL; here the new skill is separating SQLite's plan vocabulary from actual virtual-machine work. A covering SEARCH and falling Fullscan Steps are stronger evidence than one shorter warm-cache time.

## Syntax breakdown
### In plain terms

A plan is a proposed route through data, not a record of everything execution did. This experiment keeps the answer fixed and changes the available route, then uses SQLite's statement counters to check that the work changed. Unlike PostgreSQL EXPLAIN ANALYZE, EXPLAIN QUERY PLAN does not execute and instrument the query.

### What you are learning

- **Access path:** SCAN walks broadly; SEARCH restricts the traversal using a key. Either may involve a table or an index.
- **Covering:** All columns needed by this query are in the index, so SQLite need not fetch the corresponding table records.
- **Evidence levels:** A plan, statement counters, and elapsed time answer different questions. None alone measures device I/O.

### Piece by piece

- **WITH RECURSIVE n(x), printf, and %** generate 20,000 deterministic rows. The remainder operator spreads them evenly across 100 tenant names; tenant-37 therefore matches 200 rows.
- **DROP ... IF EXISTS** makes reruns recreate the intended pre-index baseline. **PRAGMA optimize** requests opportunistic planner maintenance; no competing index exists at this stage.
- **EXPLAIN QUERY PLAN** prints a tree whose detail text names SCAN, SEARCH, and the selected index. Read the access path, not node numbers or exact formatting, which are not a stable application interface.
- **CREATE INDEX ... (tenant, event_id, payload)** places the equality key first, then the requested ordering and projected value. That ordering lets one index satisfy both filtering and ordered payload retrieval.
- **.stats on/off** brackets each count statement. Compare **Fullscan Steps** and **Virtual Machine Steps** in the two reports; page-cache hits/misses describe SQLite's cache, not necessarily physical storage reads. Statistics are off during index construction so construction is not confused with query execution.
- **.timer on/off** adds real, user, and system time. The same answer can have different work yet similar elapsed time when the small fixture is cached.
- **tenant >= 'tenant-50'** in the variation widens the predicate to 10,000 rows. Tenant-first index ordering does not automatically provide global event_id order across many tenants; look for a temporary sort.

## Caution
Do not infer a universal speedup from one warm-cache run. Keep the data size, SQLite build, cache state, and predicate visible when recording a result.

## Setup
```sql
DROP TABLE IF EXISTS plan_events;

CREATE TABLE plan_events (event_id INTEGER PRIMARY KEY, tenant TEXT NOT NULL, payload TEXT NOT NULL);

WITH RECURSIVE
  n (x) AS (
    SELECT
      1
    UNION ALL
    SELECT
      x + 1
    FROM
      n
    WHERE
      x < 20000
  )
INSERT INTO
  plan_events (event_id, tenant, payload)
SELECT
  x,
  'tenant-' || printf('%02d', x % 100),
  'payload-' || printf('%06d', x)
FROM
  n;

DROP INDEX IF EXISTS plan_events_tenant_idx;

PRAGMA optimize;
```

## Run
```sql
.timer on
EXPLAIN QUERY PLAN
SELECT
  payload
FROM
  plan_events
WHERE
  tenant = 'tenant-37'
ORDER BY
  event_id;

.stats on
SELECT
  count(*) AS matching_rows
FROM
  plan_events
WHERE
  tenant = 'tenant-37';

.stats off
CREATE INDEX plan_events_tenant_idx ON plan_events (tenant, event_id, payload);

EXPLAIN QUERY PLAN
SELECT
  payload
FROM
  plan_events
WHERE
  tenant = 'tenant-37'
ORDER BY
  event_id;

.stats on
SELECT
  count(*) AS matching_rows
FROM
  plan_events
WHERE
  tenant = 'tenant-37';

.stats off
.timer off
```

## Expected result
Both count queries return 200. The first plan scans plan_events; the second searches the covering plan_events_tenant_idx. The count's Fullscan Steps fall from approximately 19,999 to 0, and Virtual Machine Steps fall substantially. Exact instruction totals, plan formatting and timings depend on the build. The ordered payload plan and the separately measured count are related queries, not a runtime profile of the same statement.

## Systems lens
Use PostgreSQL's indexing intuition, but learn SQLite's observability boundary. A covering SQLite index avoids a table-B-tree lookup without PostgreSQL's heap visibility-map condition for index-only scans. That is a concrete storage-engine difference, not permission to infer physical reads or universal speedups from the word covering.

## Optional variation
After index creation, repeat the indexed EXPLAIN and count queries with `WHERE tenant >= 'tenant-50'` replacing the equality predicate in both. The count is 10000. An index SEARCH can still restrict tenant keys, but tenant-first order does not supply global event_id order across those keys; an indexed plan needs a temporary sort for the ordered payload query. Record the actual chosen path if the planner prefers a table scan instead. Compare plan text first and timer output only as supporting evidence; the separately measured count does not profile the ordered payload query.
