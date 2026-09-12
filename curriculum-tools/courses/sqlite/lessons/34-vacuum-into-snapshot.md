# VACUUM INTO creates an independent compact snapshot

slug: vacuum-into-snapshot
category: recovery
difficulty: intermediate
tags: backup, vacuum, pages, integrity-check
prerequisites: online-cli-backup
safety: writes-data
run-in: mixed
sessions: 1
min-version: 3.53.4
minutes: 15
revision: 1

## Overview
Delete most of a large-value fixture, then create an engine-coordinated compact copy with VACUUM INTO. Compare bytes only after checking the retained rows and structure. This is useful when SQLite is an artifact you ship or archive, but a smaller file does not by itself imply a better backup policy.

## Syntax breakdown
### In plain terms

Deleting rows can leave pages on SQLite's free list even though the logical table is small. This experiment asks what a compact, independent snapshot costs and preserves. VACUUM INTO rewrites the source into a new file; it does not compact the source in place.

### What you are learning

- **Free pages** — deleted space may be reusable without immediately shrinking the file.
- **Rewrite snapshot** — compaction and backup can be combined, at the cost of I/O and temporary space.
- **Validation before comparison** — logical row counts and integrity checks accompany byte measurements.

### Piece by piece

- **PRAGMA journal_mode=DELETE** (SQL setting)
  - What it is: rollback-journal mode, used here for deterministic local-file inspection.
  - What it does here: makes this lesson independent of WAL sidecars left by earlier lessons.
  - What it gives us: a self-contained source file to measure.
- **hex(randomblob(1000))** (SQL function expression)
  - What it is: generates 1,000 random bytes and renders them as hexadecimal text.
  - What it does here: creates payloads large enough to occupy multiple pages.
  - What it gives us: visible fragmentation after deletion.
- **PRAGMA freelist_count** (SQL diagnostic)
  - What it is: reports pages currently available for reuse.
  - What it does here: measures the space released by deleting 80 rows.
  - What it gives us: a nonzero free-page count to compare with file bytes.
- **VACUUM INTO FILE** (SQL command)
  - What it is: builds a new compact database at the supplied filename.
  - What it does here: writes the uniquely named destination without changing the source.
  - What it gives us: an independent file whose size and contents can be checked.
- **stat -c '%n %s bytes'** (shell program and format flag)
  - What it is: reports each path and its byte size; percent-n is the name and percent-s is size.
  - What it does here: compares source and compact destination bytes.
  - What it gives us: measured space trade-off, not an assumed ratio.

## Caution
The reserved lab destination TUTOR_SQLITE_DB.vacuum.db is removed before rerun because VACUUM INTO needs an absent or empty destination. Never redirect that cleanup to a valuable file. Verify the output before using it as a restore candidate.

## Setup
```text
.print -- close every other sqlite3 session first: the next line must print delete
PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS blobs;
CREATE TABLE blobs(id INTEGER PRIMARY KEY, payload TEXT);
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100)
INSERT INTO blobs SELECT x, hex(randomblob(1000)) FROM n;
```

## Run
```text
-- Session A
DELETE FROM blobs WHERE id>20;
SELECT 'source rows/free pages', count(*), (SELECT freelist_count FROM pragma_freelist_count) FROM blobs;
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB"
.shell rm -f "$TUTOR_SQLITE_DB.vacuum.db"
.shell sqlite3 "$TUTOR_SQLITE_DB" "VACUUM INTO '$TUTOR_SQLITE_DB.vacuum.db'"
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB.vacuum.db"
.shell sqlite3 "$TUTOR_SQLITE_DB.vacuum.db" "PRAGMA integrity_check; SELECT 'copy rows', count(*) FROM blobs;"
```

## Expected result
The source has 20 rows and a nonzero freelist after deleting 80 approximately 2,000-byte payloads. VACUUM INTO produces an independent file whose integrity_check is ok and whose count is 20; its byte size is smaller than the fragmented source.

## Systems lens
SQLite can package a consistent logical rewrite as an independent file. That combines snapshot creation and compaction, while still leaving freshness, atomic publication of the destination, temporary space and restore verification to the application. An interrupted output must not be published as a known-good backup.

## Optional variation
Repeat Setup and Run with `randomblob(1000)` changed to `randomblob(2000)`, retaining the 100 source rows and deletion above id 20. Both source and compact copy still contain 20 rows, and the copy must pass integrity_check. Compare the measured byte difference with the earlier run. Larger payloads change rewrite I/O and reclaimable space; a useful compaction policy also depends on available temporary space and how soon that space would be reused.
