# Create overflow pages with large values

slug: overflow-pages
category: pages
difficulty: intermediate
tags: overflow-pages, pages, write-amplification
prerequisites: without-rowid-layout
safety: writes-data
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 12
revision: 1

## Overview
Insert 20 values larger than the deliberately small page size and inspect leaf versus overflow payload. Reuse your PostgreSQL TOAST intuition only at the level of out-of-line storage: SQLite uses overflow-page chains here and does not automatically compress these values. Distinguish logical value length from local page payload.

## Syntax breakdown
### In plain terms

SQLite keeps a record's local payload on its B-tree page when possible. A value larger than the page's local capacity spills into a linked chain of overflow pages. This lesson inserts high-entropy values and reads dbstat's payload and page-type columns to observe that physical chain; it is analogous to PostgreSQL needing out-of-line large-value storage, but SQLite's mechanism is not a compression claim.

### What you are learning

- **Overflow pages** extend a record beyond the local B-tree page.
- **Local versus overflow payload** separates bytes in the leaf from bytes in the chain.
- **High-entropy test data** avoids accidental small representation caused by repetition.

### Piece by piece

- **PRAGMA journal_mode=DELETE, page_size=1024, VACUUM** (pager setup): forces a small rollback-mode page so overflow appears with bounded values.
- **randomblob(5000)** (SQLite byte generator): returns 5000 pseudo-random bytes with poor compression opportunities.
- **hex(...)** (SQLite scalar function): converts bytes to text, so max_value_chars is about 10000 and the record is certainly large.
- **WITH RECURSIVE ... INSERT** (workload generator): makes 20 intentionally large records.
- **dbstat pagetype** (inspection column): distinguishes leaf from overflow pages.
- **dbstat payload and mx_payload** (inspection columns): show local payload bytes and the largest record payload observed for the object.
- **count(*) and max(length(value))** (aggregates): verify row count and logical value size before interpreting page counts.

## Caution
The values are intentionally large and the database is disposable. Do not run this workload against a production path or a synchronized folder.

## Setup
```sql
PRAGMA journal_mode = DELETE;

PRAGMA page_size = 1024;

VACUUM;

DROP TABLE IF EXISTS blobs;

CREATE TABLE blobs (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
```

## Run
```sql
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
      x < 20
  )
INSERT INTO
  blobs
SELECT
  x,
  hex(randomblob(5000))
FROM
  n;

.headers on
.mode box
SELECT
  count(*) AS rows,
  max(length(value)) AS max_value_chars
FROM
  blobs;

SELECT
  pagetype,
  count(*) AS pages,
  sum(payload) AS payload_bytes,
  max(mx_payload) AS max_payload
FROM
  dbstat
WHERE
  name = 'blobs'
GROUP BY
  pagetype
ORDER BY
  pagetype;

SELECT
  count(*) AS overflow_page_count
FROM
  dbstat
WHERE
  name = 'blobs'
  AND pagetype = 'overflow';
```

## Expected result
rows = 20 and max_value_chars is about 10000. dbstat reports one or more overflow pages for blobs and overflow_page_count > 0; the leaf payload is only the local portion of each large record.

## Systems lens
An apparently small point lookup can require traversing additional pages for a large record. SQLite's overflow chains and PostgreSQL's TOAST share that question about locality, not an identical storage or compression mechanism. Page structure predicts possible extra work; actual I/O still depends on access and cache state.
