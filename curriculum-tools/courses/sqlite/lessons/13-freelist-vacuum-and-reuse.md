# Observe freelist reuse and VACUUM compaction

slug: freelist-vacuum-and-reuse
category: pages
difficulty: intermediate
tags: freelist, vacuum, pages, capacity
prerequisites: overflow-pages
safety: writes-data
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 18
revision: 1

## Overview
Delete most rows, reuse some freed pages, then compact a lab copy and compare its length. This is an important naming trap after PostgreSQL: SQLite VACUUM is a database rewrite, not ordinary PostgreSQL VACUUM's routine reclamation of dead tuples. The freelist already supplies a different way to reuse space without shrinking the file.

## Syntax breakdown
### In plain terms

Deleting rows can release pages without shrinking the file. New inserts may reuse those pages, while VACUUM performs a separate rewrite that compacts a copy. We measure all three states and preserve the original evidence so a size improvement cannot hide data loss.

### What you are learning

- **Freelist reuse** recycles pages inside the file before allocating more.
- **VACUUM compaction** rewrites a database and is an availability/copy decision, not ordinary row deletion.
- **Evidence preservation** makes the compacted result comparable with the unmodified source.

### Piece by piece

- **PRAGMA journal_mode=DELETE, page_size=1024, VACUUM** (pager setup): creates a stable rollback-mode, small-page workload.
- **WITH RECURSIVE ... INSERT** (row generator): grows retained to 3000 rows so deleting most rows frees whole pages.
- **pragma_page_count and pragma_freelist_count** (table-valued PRAGMAs): report allocated pages and currently reusable free pages.
- **DELETE WHERE id > 500** (data change): removes 2500 rows while leaving file allocation available for reuse.
- **.shell stat -c** (host inspection): records byte length before and after deletion and vacuum.
- **.shell cp SOURCE DEST** (host copy): preserves the source before rewriting only the uniquely named vacuum copy.
- **VACUUM** (rewrite command): packs live rows into a new file; its post-rewrite freelist should be zero.

## Caution
The copy path is the reserved lab artifact TUTOR_SQLITE_DB-vacuum.db and a rerun overwrites that copy. The source is quiescent in DELETE mode at the copy step; this is not a generally safe recipe for copying a live WAL database.

## Setup
```sql
PRAGMA journal_mode = DELETE;

PRAGMA page_size = 1024;

VACUUM;

DROP TABLE IF EXISTS retained;

CREATE TABLE retained (id INTEGER PRIMARY KEY, payload TEXT);

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
      x < 3000
  )
INSERT INTO
  retained
SELECT
  x,
  printf('payload-%05d', x)
FROM
  n;
```

## Run
```sql
.headers on
.mode box
SELECT
  'before_delete' AS phase,
  page_count,
  freelist_count
FROM
  pragma_page_count,
  pragma_freelist_count;

.shell stat -c 'before_delete_bytes=%s' "$TUTOR_SQLITE_DB"
DELETE FROM retained
WHERE
  id > 500;

SELECT
  'after_delete' AS phase,
  page_count,
  freelist_count
FROM
  pragma_page_count,
  pragma_freelist_count;

.shell stat -c 'after_delete_bytes=%s' "$TUTOR_SQLITE_DB"
WITH RECURSIVE
  n (x) AS (
    VALUES
      (3001)
    UNION ALL
    SELECT
      x + 1
    FROM
      n
    WHERE
      x < 3100
  )
INSERT INTO
  retained
SELECT
  x,
  printf('replacement-%05d', x)
FROM
  n;

SELECT
  'after_reuse' AS phase,
  page_count,
  freelist_count
FROM
  pragma_page_count,
  pragma_freelist_count;

.shell cp "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB-vacuum.db"
.shell sqlite3 "$TUTOR_SQLITE_DB-vacuum.db" "VACUUM; SELECT page_count, freelist_count FROM pragma_page_count, pragma_freelist_count;"
.shell stat -c 'after_vacuum_bytes=%s' "$TUTOR_SQLITE_DB-vacuum.db"
```

## Expected result
after_delete has a positive freelist_count while page_count and file bytes remain at least as large as before deletion. after_reuse shows that inserts consume free pages before growing the file. The copied database remains valid and after_vacuum has freelist_count = 0 and fewer pages/bytes than the un-compacted source.

## Systems lens
Reusable space and returned filesystem space are different resources. SQLite's freelist can satisfy new allocations inside the existing file; VACUUM rewrites the database to compact it. Budget the rewrite's temporary storage and availability separately, much as PostgreSQL VACUUM FULL differs from ordinary vacuum.
