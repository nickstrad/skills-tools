# Observe pages with dbstat

slug: pages-and-dbstat
category: pages
difficulty: beginner
tags: pages, btree, file-format
prerequisites: strict-storage-contracts
safety: writes-data
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 15
revision: 1

## Overview
Grow a SQLite table and inspect its leaf and internal pages. The PostgreSQL course already establishes pages as storage units; the new difference is that this table is itself a B-tree rather than a heap reached through a separate index. Use object-level evidence to keep that physical model concrete.

## Syntax breakdown
### In plain terms

This experiment grows one table until its logical rows occupy many fixed-size pages. SQLite's dbstat inspection table lets us correlate the page count with B-tree roles, while rollback mode keeps the main file representation straightforward. The exact page counts are evidence from this build, not constants to memorize.

### What you are learning

- **Page geometry** is the pager's allocation and I/O unit.
- **B-tree roles** distinguish leaf pages holding table cells from internal pages routing searches.
- **Runtime measurements** such as dbstat counts should be reported without claiming a universal shape.

### Piece by piece

- **PRAGMA journal_mode=DELETE** (persistent setting): selects rollback mode so the main file is the committed representation; WAL would require inspecting sidecars too.
- **PRAGMA page_size=1024** (database setting): requests 1024-byte pages before the rebuild.
- **VACUUM** (rewrite command): applies the requested page size and clears prior layout before setup.
- **WITH RECURSIVE** (SQL row generator): emits 2000 deterministic integers; the recursive bound controls workload size.
- **printf** (SQLite scalar function): formats each value as a fixed-width string, making row payloads comparable.
- **pragma_page_size and pragma_page_count** (table-valued PRAGMAs): expose page size and allocated page count; their product is the expected file bytes.
- **dbstat** (virtual table): exposes one row per B-tree page; name identifies the object and pagetype identifies leaf/internal/overflow.
- **sum(ncell) and count(*)** (SQL aggregates): count cells and pages in each role; exact totals are build evidence.
- **.headers on / .mode box** (CLI display commands): label columns and make the grouped output readable.

## Setup
```sql
PRAGMA journal_mode=DELETE;
PRAGMA page_size=1024;
VACUUM;
DROP TABLE IF EXISTS samples;
CREATE TABLE samples(id INTEGER PRIMARY KEY, value TEXT NOT NULL);
```

## Run
```sql
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 2000) INSERT INTO samples SELECT x, printf('row-%05d', x) FROM n;
.headers on
.mode box
SELECT page_size, page_count, page_size * page_count AS file_bytes FROM pragma_page_size, pragma_page_count;
SELECT name, pagetype, count(*) AS pages, sum(ncell) AS cells FROM dbstat WHERE name='samples' GROUP BY name, pagetype ORDER BY pagetype;
```

## Expected result
file_bytes equals page_size multiplied by page_count and is page-aligned. dbstat reports samples occupying leaf pages and at least one internal page once the table is large enough; the exact counts depend on SQLite's page layout but are concrete in the output.

## Systems lens
A rowid table stores rows in a B-tree keyed by integer identity. That differs from PostgreSQL's heap plus index indirection, and it changes what a primary-key lookup traverses. dbstat describes page structure, not a count of physical disk reads or the engine's cumulative writes.

## Optional variation
Repeat with page_size=4096 and predict whether the table needs fewer pages for the same rows.
