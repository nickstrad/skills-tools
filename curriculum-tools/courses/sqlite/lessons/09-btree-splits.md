# Cause B-tree splits with ordered inserts

slug: btree-splits
category: pages
difficulty: intermediate
tags: btree, pages, write-amplification
prerequisites: pages-and-dbstat
safety: writes-data
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 15
revision: 1

## Overview
Insert three bounded batches and observe a larger B-tree with internal routing. The samples show structural growth, not a trace of every split or write. Focus on how a SQLite table maintains key order as it grows, carrying forward the B-tree model you learned in PostgreSQL.

## Syntax breakdown
### In plain terms

An SQLite B-tree cannot grow smoothly forever: when a page fills, the engine allocates or rewrites pages to preserve sorted search structure. Ordered batches make those discrete allocation steps visible. We sample after bounded batches and inspect ancestry depth, but do not infer a fixed amount of write amplification per insert.

### What you are learning

- **B-tree split** is structural maintenance caused by a full page.
- **Sampling boundaries** reveal page-allocation jumps without pretending to observe every internal write.
- **Path depth** is a shape observation, not a universal performance guarantee.

### Piece by piece

- **PRAGMA journal_mode=DELETE / page_size=1024 / VACUUM** (pager setup): create a fresh rollback-mode, 1024-byte layout so prior lessons cannot change geometry.
- **WITH RECURSIVE ... INSERT** (deterministic batch): inserts 100, then 900, then 4000 ordered rows; each bound identifies the sample point.
- **pragma_page_count** (table-valued PRAGMA): page_count after each commit is the allocation sample.
- **dbstat.path** (inspection column): encodes page ancestry; counting slash components gives an observed depth.
- **max(length(path) - length(replace(...)))** (SQL expression and aggregate): computes the deepest path without asserting how many splits caused it.

## Setup
```sql
PRAGMA journal_mode = DELETE;

PRAGMA page_size = 1024;

VACUUM;

DROP TABLE IF EXISTS ordered;

CREATE TABLE ordered (id INTEGER PRIMARY KEY, payload TEXT NOT NULL);
```

## Run
```sql
.headers on
WITH RECURSIVE
  n (x) AS (
    VALUES
      (1)
    UNION ALL
    SELECT
      x + 1
    FROM
      n
    WHERE
      x < 100
  )
INSERT INTO
  ordered
SELECT
  x,
  printf('batch-a-%04d', x)
FROM
  n;

SELECT
  'after_100' AS sample,
  page_count
FROM
  pragma_page_count;

WITH RECURSIVE
  n (x) AS (
    VALUES
      (101)
    UNION ALL
    SELECT
      x + 1
    FROM
      n
    WHERE
      x < 1000
  )
INSERT INTO
  ordered
SELECT
  x,
  printf('batch-b-%04d', x)
FROM
  n;

SELECT
  'after_1000' AS sample,
  page_count
FROM
  pragma_page_count;

WITH RECURSIVE
  n (x) AS (
    VALUES
      (1001)
    UNION ALL
    SELECT
      x + 1
    FROM
      n
    WHERE
      x < 5000
  )
INSERT INTO
  ordered
SELECT
  x,
  printf('batch-c-%04d', x)
FROM
  n;

SELECT
  'after_5000' AS sample,
  page_count
FROM
  pragma_page_count;

SELECT
  max(length(path) - length(replace(path, '/', ''))) AS observed_depth
FROM
  dbstat
WHERE
  name = 'ordered';
```

## Expected result
The three page_count values increase in discrete jumps rather than one byte at a time. observed_depth is greater than the single-leaf case (typically 2 or more slash components), showing an internal page/root. Exact thresholds can vary with payload and SQLite build details.

## Systems lens
Maintaining ordered physical structure creates work beyond the logical INSERT. These post-batch samples establish allocation and depth growth; they do not measure per-insert amplification or prove the timing of individual splits. For a write-cost claim, add instrumentation at the relevant layer.

## Optional variation
Insert the same keys in a random order in another file and compare page count and depth; explain any difference as locality, not a universal guarantee.
