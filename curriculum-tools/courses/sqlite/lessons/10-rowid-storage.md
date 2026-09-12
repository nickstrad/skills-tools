# Compare rowid and indexed identity

slug: rowid-storage
category: pages
difficulty: intermediate
tags: rowid, btree, pages
prerequisites: btree-splits
safety: writes-data
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 15
revision: 1

## Overview
Compare an implicit rowid table, an INTEGER PRIMARY KEY alias, and a text-key table with a unique secondary index. All hold 1,000 logical records, but the identity representation and object count differ. This is a layout choice, not an equal-byte encoding benchmark.

## Syntax breakdown
### In plain terms

SQLite rowid tables already have an internal integer identity. Declaring INTEGER PRIMARY KEY aliases that rowid, while a separate unique index creates another B-tree that points back to table rows. This experiment inserts equivalent records and uses dbstat to make the extra object and its pages visible.

### What you are learning

- **Rowid aliasing** can store an integer identity directly in the table B-tree.
- **Secondary index indirection** adds a maintained B-tree and a lookup hop.
- **Object-level accounting** separates table pages from index pages.

### Piece by piece

- **PRAGMA journal_mode=DELETE, page_size=1024, VACUUM** (pager setup): stabilizes rollback mode and page geometry for comparable counts.
- **CREATE TABLE normal / alias / indexed** (SQL definitions): normal has an implicit rowid, alias names it with INTEGER PRIMARY KEY, and indexed keeps a text logical key.
- **CREATE UNIQUE INDEX indexed_key** (index definition): creates a second B-tree enforcing uniqueness on indexed.logical_key.
- **WITH RECURSIVE and printf** (row generator and formatter): produce the same 1000-key workload and similar payload lengths for all tables.
- **dbstat name, count(*), sum(pgsize)** (inspection columns and aggregates): count pages and bytes per table/index object.
- **EXPLAIN QUERY PLAN** (query-plan command in the challenge): names SCAN or SEARCH paths and exposes use of the separate indexed_key B-tree.

## Setup
```sql
PRAGMA journal_mode=DELETE;
PRAGMA page_size=1024;
VACUUM;
DROP TABLE IF EXISTS normal;
DROP TABLE IF EXISTS alias;
DROP TABLE IF EXISTS indexed;
CREATE TABLE normal(logical_key TEXT, payload TEXT);
CREATE TABLE alias(id INTEGER PRIMARY KEY, payload TEXT);
CREATE TABLE indexed(logical_key TEXT, payload TEXT);
CREATE UNIQUE INDEX indexed_key ON indexed(logical_key);
```

## Run
```sql
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 1000)
INSERT INTO normal SELECT printf('key-%05d', x), printf('payload-%05d', x) FROM n;
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 1000)
INSERT INTO alias SELECT x, printf('payload-%05d', x) FROM n;
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 1000)
INSERT INTO indexed SELECT printf('key-%05d', x), printf('payload-%05d', x) FROM n;
.headers on
.mode box
SELECT name, count(*) AS pages, sum(pgsize) AS bytes FROM dbstat WHERE name IN ('normal', 'alias', 'indexed', 'indexed_key') GROUP BY name ORDER BY name;
SELECT (SELECT count(*) FROM normal) AS normal_rows, (SELECT count(*) FROM alias) AS alias_rows, (SELECT count(*) FROM indexed) AS indexed_rows;
```

## Expected result
All three row counts are 1000. dbstat shows the alias table stores its integer key in the table B-tree, while indexed has a separate indexed_key object with pages in addition to its table; normal has only its table object. The exact bytes depend on page size and payload.

## Systems lens
SQLite's exact INTEGER PRIMARY KEY declaration can alias physical row identity, unlike PostgreSQL's usual primary-key index over a heap. A text logical key plus unique index preserves a different representation and adds an access structure. Separate the cost of encoding the key from the cost of maintaining the extra B-tree.

## Optional variation
Use EXPLAIN QUERY PLAN to look up one key in normal and indexed and identify the extra B-tree used by the indexed table.
