# Decode the database header

slug: decode-database-header
category: lab-file
difficulty: beginner
tags: file-format, pages, observability
prerequisites: connection-settings-are-local
safety: ddl
run-in: mixed
sessions: 1
min-version: 3.53.4
minutes: 12
revision: 2

## Overview
Create a committed rollback-mode layout, then compare its page metadata with actual header bytes and file length. SQLite's stable file format is part of why it works as an application artifact. Learn which evidence is durable on disk before applying file tools to a live WAL database.

## Syntax breakdown
### In plain terms

SQLite stores a file header before its pages, and the header records compatibility facts such as page size and schema state. This experiment sets a known page size, commits twenty rows, and compares SQL metadata with filesystem length and a hexadecimal header dump. The arithmetic checks that a complete rollback-mode database occupies an integer number of pages.

### What you are learning

- **Page geometry** determines the unit of allocation and I/O.
- **Header bytes** are a durable compatibility contract.
- **Cross-layer checks** catch a mismatched file or page-size assumption.

### Piece by piece

- **PRAGMA journal_mode=DELETE** (persistent setting): uses rollback mode so the main file is stable during inspection.
- **PRAGMA page_size=4096** (page-size setting): requests 4096-byte pages before rebuilding; an existing geometry may require VACUUM.
- **VACUUM** (rewrite command): rebuilds the database and applies the requested page size.
- **pragma_page_size and pragma_page_count** (table-valued PRAGMAs): expose geometry; their product is expected_bytes.
- **stat -c %s FILE** (shell query): reports actual_bytes for comparison with the SQL product.
- **xxd -l 100 -g 1 FILE** (hex dump and flags): limits output to 100 bytes in one-byte groups; the first bytes should spell SQLite format 3.
- **WITH RECURSIVE** (SQL row generator): creates deterministic rows so the file extends beyond the header.

## Setup
```text
.print -- The wrapper has already opened $TUTOR_SQLITE_DB
PRAGMA journal_mode=DELETE;
PRAGMA page_size=4096;
VACUUM;
DROP TABLE IF EXISTS records;
CREATE TABLE records(k INTEGER PRIMARY KEY, v TEXT);
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x + 1 FROM n WHERE x < 20) INSERT INTO records SELECT x, 'value-' || x FROM n;
```

## Run
```text
.headers on
.mode box
SELECT page_size, page_count, page_size * page_count AS expected_bytes FROM pragma_page_size, pragma_page_count;
.shell stat -c 'actual_bytes=%s' "$TUTOR_SQLITE_DB"
.shell xxd -l 100 -g 1 "$TUTOR_SQLITE_DB"
```

## Expected result
The query reports page size 4096 and page_count > 1. actual_bytes equals page_size multiplied by page_count. The hex dump starts with ASCII SQLite format 3 followed by a NUL; remaining header bytes include page size and schema metadata.

## Systems lens
The contrast with PostgreSQL is packaging and responsibility: a SQLite file is a documented, portable application format, but its current live state can still depend on sidecars. Header fields help identify and validate an artifact; they do not replace an engine-coordinated snapshot.

## Optional variation
Change the page size to 1024 in a new database and compare the first 20 header bytes and file length.
