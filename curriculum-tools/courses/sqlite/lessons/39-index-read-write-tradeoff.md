# Measure the read and write cost of indexes

slug: index-read-write-tradeoff
category: performance
difficulty: intermediate
tags: indexes, pages, write-amplification, capacity
prerequisites: query-plan-as-evidence
safety: writes-data
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 25
revision: 3

## Overview
Give one of two identical tables three indexes, then measure the new page objects and the work of changing an indexed column. The useful contrast is not another introduction to indexes: SQLite's single writer means extra maintenance also consumes the admission capacity shared by unrelated writes to that file.

## Syntax breakdown
### In plain terms

An index is a stored copy of a particular ordering of your data. Read savings are visible in the lookup plan; its maintenance cost is visible when an update must keep that ordering correct. We compare equal data and equal updates, rather than compare two unrelated timing samples.

### What you are learning

- **Read versus write amplification:** A faster lookup can require extra stored pages and more work per update.
- **Measurement scope:** dbstat attributes pages to objects; page_count measures the entire database.
- **Serialization cost:** More work inside SQLite's write transaction keeps the file's writer position occupied longer.

### Piece by piece

- **WITH RECURSIVE, printf, %, and CASE** generate 12,000 reproducible rows with account, state, and amount distributions. **INSERT ... SELECT** copies the exact rows to the comparison table.
- **PRAGMA optimize** requests planner maintenance. It is not a benchmark timer and does not create an index.
- **dbstat** is an optional page-inspection virtual table enabled in this lab. Grouping by **name** and counting rows measures pages assigned to each named table or index, not the whole file's allocated/free space.
- **EXPLAIN QUERY PLAN** describes the account lookup. Look for SCAN on the unindexed table and SEARCH using trade_account_idx on the indexed one; the two sums should agree.
- **CREATE INDEX** makes independent account, state, and amount B-trees. These are not a single covering index: the account index still needs table lookups for amount.
- **BEGIN/COMMIT** make each 4,000-row update one transaction. Only amount changes, so trade_amount_idx needs key maintenance while account and state keys remain unchanged.
- **.stats on/off** scopes the statement work reports to each UPDATE. Compare Virtual Machine Steps, not all prior statements' cumulative work. **.timer on/off** supplies supporting elapsed times, which need not separate reliably on a cached fixture.
- **pragma_page_count and pragma_page_size** expose PRAGMA results as tables. Their product is main-database logical size; it is not a per-table cost or live WAL-size measurement.
- **DROP INDEX trade_amount_idx** in the variation removes the index whose key changes. Repeat equivalent update ranges and compare which work disappears before interpreting timing.

## Caution
The two tables share one database, so page_count is a database-wide measure rather than an exact per-table size. Use dbstat when that optional virtual table is available and label the limitation.

## Setup
```sql
DROP TABLE IF EXISTS trade_no_index;

DROP TABLE IF EXISTS trade_with_indexes;

CREATE TABLE trade_no_index (
  id INTEGER PRIMARY KEY,
  account TEXT NOT NULL,
  state TEXT NOT NULL,
  amount INTEGER NOT NULL
);

CREATE TABLE trade_with_indexes (
  id INTEGER PRIMARY KEY,
  account TEXT NOT NULL,
  state TEXT NOT NULL,
  amount INTEGER NOT NULL
);

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
      x < 12000
  )
INSERT INTO
  trade_no_index
SELECT
  x,
  'acct-' || printf('%04d', x % 1000),
  CASE
    WHEN x % 7 = 0 THEN 'open'
    ELSE 'closed'
  END,
  x % 10000
FROM
  n;

INSERT INTO
  trade_with_indexes
SELECT
  *
FROM
  trade_no_index;

PRAGMA optimize;
```

## Run
```sql
.timer on
SELECT
  'before_indexes' AS observation,
  name,
  count(*) AS pages
FROM
  dbstat
WHERE
  name IN ('trade_no_index', 'trade_with_indexes')
GROUP BY
  name
ORDER BY
  name;

EXPLAIN QUERY PLAN
SELECT
  sum(amount)
FROM
  trade_no_index
WHERE
  account = 'acct-0042';

SELECT
  sum(amount)
FROM
  trade_no_index
WHERE
  account = 'acct-0042';

CREATE INDEX trade_account_idx ON trade_with_indexes (account);

CREATE INDEX trade_state_idx ON trade_with_indexes (state);

CREATE INDEX trade_amount_idx ON trade_with_indexes (amount);

EXPLAIN QUERY PLAN
SELECT
  sum(amount)
FROM
  trade_with_indexes
WHERE
  account = 'acct-0042';

SELECT
  sum(amount)
FROM
  trade_with_indexes
WHERE
  account = 'acct-0042';

SELECT
  'after_indexes' AS observation,
  name,
  count(*) AS pages
FROM
  dbstat
WHERE
  name IN (
    'trade_no_index',
    'trade_with_indexes',
    'trade_account_idx',
    'trade_state_idx',
    'trade_amount_idx'
  )
GROUP BY
  name
ORDER BY
  name;

BEGIN;

.stats on
UPDATE trade_no_index
SET
  amount = amount + 1
WHERE
  id BETWEEN 1 AND 4000;

.stats off
COMMIT;

BEGIN;

.stats on
UPDATE trade_with_indexes
SET
  amount = amount + 1
WHERE
  id BETWEEN 1 AND 4000;

.stats off
COMMIT;

SELECT
  'after_index_maintenance' AS observation,
  page_count,
  page_size
FROM
  pragma_page_count,
  pragma_page_size;

.timer off
```

## Expected result
The tables begin with equivalent contents and their account-0042 sums agree. After index creation, dbstat includes three additional named B-trees and the account lookup uses trade_account_idx. The indexed UPDATE reports more Virtual Machine Steps than the otherwise equivalent unindexed UPDATE. Exact pages, instruction totals and elapsed times vary; database-wide page_count cannot attribute growth to one table.

## Systems lens
PostgreSQL also pays for index maintenance, but SQLite funnels writes to all these objects through one file-wide writer. An index can improve read latency while reducing the write workload your embedded application can admit. Measure the affected columns and transaction duration before calling a larger index set an optimization.

## Optional variation
After Run, execute `DROP INDEX trade_amount_idx;` and repeat both BEGIN-through-COMMIT update blocks on the same id range. Both tables receive one more increment, preserving their logical equivalence. Compare Virtual Machine Steps before interpreting timing: amount no longer has an index key to maintain, while account and state keys are unchanged by these updates. Repeat the dbstat and database-page queries; the dropped index object disappears, but its freed pages need not shrink the database file.
