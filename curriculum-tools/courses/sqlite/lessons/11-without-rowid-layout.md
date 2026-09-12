# Compare WITHOUT ROWID layouts

slug: without-rowid-layout
category: pages
difficulty: intermediate
tags: without-rowid, btree, query-planner
prerequisites: rowid-storage
safety: ddl
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 15
revision: 3

## Overview
Give equivalent data a composite primary key in ordinary and WITHOUT ROWID tables, then compare the structures and lookup plans. The question is where the records are physically keyed, not whether a feature with 'optimization' in its description must always win. A secondary-index variation tests the other side of that choice.

## Syntax breakdown
### In plain terms

The same composite primary key can be represented two ways. A normal rowid table stores rows in a rowid B-tree and maintains a separate primary-key index; WITHOUT ROWID makes the declared key the table B-tree key. Comparing dbstat and plans exposes the locality trade-off without declaring one layout universally smaller.

### What you are learning

- **Rowid composite key** means the declared key is an additional unique access path.
- **WITHOUT ROWID** clusters table records by the declared composite key.
- **Clustering trade-off** depends on secondary lookups and update patterns, so measure both pages and plans.

### Piece by piece

- **PRAGMA journal_mode=DELETE, page_size=1024, VACUUM** (pager setup): supplies identical rollback-mode geometry for both tables.
- **PRIMARY KEY(a,b)** (composite constraint): requires unique pairs; on a rowid table it creates an autoindex.
- **WITHOUT ROWID** (table option): uses the composite key as the table's B-tree key instead of allocating a hidden rowid table.
- **WITH RECURSIVE and printf** (workload generator): insert 2000 deterministic pairs and payloads into each representation.
- **dbstat name, count(*), sum(pgsize)** (inspection): reports pages and bytes for table objects and the rowid table's sqlite_autoindex object.
- **EXPLAIN QUERY PLAN** (planner inspection): reports which table or index supplies the lookup for a=12 and b=34.
- **The two payload indexes** add the same search key to each representation. **pragma_index_xinfo** shows indexed and auxiliary locator columns: key=1 marks the declared search key, while key=0 marks additional stored locator fields. cid=-1 represents a rowid locator; the WITHOUT ROWID index instead carries a and b. Compare their extra page objects without assuming a universal size winner.

## Setup
```sql
PRAGMA journal_mode=DELETE;
PRAGMA page_size=1024;
VACUUM;
DROP TABLE IF EXISTS with_rowid;
DROP TABLE IF EXISTS without_rowid;
CREATE TABLE with_rowid(a INTEGER, b INTEGER, payload TEXT, PRIMARY KEY(a,b));
CREATE TABLE without_rowid(a INTEGER, b INTEGER, payload TEXT, PRIMARY KEY(a,b)) WITHOUT ROWID;
```

## Run
```sql
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 2000)
INSERT INTO with_rowid SELECT x / 100, x % 100, printf('payload-%05d', x) FROM n;
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 2000)
INSERT INTO without_rowid SELECT x / 100, x % 100, printf('payload-%05d', x) FROM n;
.headers on
.mode box
SELECT name, count(*) AS pages, sum(pgsize) AS bytes FROM dbstat WHERE name IN ('with_rowid', 'without_rowid', 'sqlite_autoindex_with_rowid_1') GROUP BY name ORDER BY name;
EXPLAIN QUERY PLAN SELECT payload FROM with_rowid WHERE a=12 AND b=34;
EXPLAIN QUERY PLAN SELECT payload FROM without_rowid WHERE a=12 AND b=34;
SELECT (SELECT count(*) FROM with_rowid) AS ordinary_rows, (SELECT count(*) FROM without_rowid) AS clustered_rows;
CREATE INDEX rowid_payload_idx ON with_rowid(payload);
CREATE INDEX clustered_payload_idx ON without_rowid(payload);
SELECT 'rowid secondary locator', cid, name, key FROM pragma_index_xinfo('rowid_payload_idx');
SELECT 'clustered secondary locator', cid, name, key FROM pragma_index_xinfo('clustered_payload_idx');
SELECT name, count(*) AS pages FROM dbstat WHERE name IN ('rowid_payload_idx', 'clustered_payload_idx') GROUP BY name;
```

## Expected result
Both tables contain 2000 rows. The rowid table has a table object plus a primary-key index, while WITHOUT ROWID has one table B-tree for the composite key. The two query plans name different physical paths. Both row counts are 2000; index_xinfo shows a rowid auxiliary locator for rowid_payload_idx and a/b auxiliary locators for clustered_payload_idx. Record actual page totals rather than assuming one layout always wins.

## Systems lens
WITHOUT ROWID trades the hidden integer table key for the declared primary key. That can remove one lookup structure for composite-key access, while secondary indexes must carry the primary-key columns needed to locate records. Unlike treating PostgreSQL CLUSTER as a durable ordering guarantee, this ordering is part of the SQLite table representation.

## Optional variation
Repeat Setup and Run to compare the secondary-index phase already supplied. Record the initial
table/primary-key page objects, then compare the additional payload-index pages and index_xinfo
locators after both CREATE INDEX statements. The ordinary table remains keyed by rowid; the
WITHOUT ROWID table remains keyed by(a,b), which its secondary index carries as the row locator.
Both tables still contain2,000 rows; extra page counts are measured layout costs.
