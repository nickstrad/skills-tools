# Observe a rollback journal lifecycle

slug: rollback-journal-lifecycle
category: journals
difficulty: intermediate
tags: rollback-journal, transactions, atomicity
prerequisites: freelist-vacuum-and-reuse
safety: locking
run-in: tool
sessions: 2
min-version: 3.53.4
minutes: 15
revision: 1

## Overview
Hold an uncommitted update and compare its physical journal with what a second connection can read. Then contrast rollback and commit of the same 150-row change. PostgreSQL's transaction guarantees are familiar; the new evidence is SQLite's per-file before-image protocol.

## Syntax breakdown
### In plain terms

A rollback journal holds original page contents so SQLite can undo an interrupted change to the main database. Its existence does not mean those changes are committed or visible to another connection. We observe both files and rows because neither alone explains the transaction state.

### What you are learning

- **Undo evidence:** Journal pages describe the old state, not an application event history.
- **Visibility:** Another connection sees committed rows, not A's pending updates.
- **Commit protocol:** File cleanup has transactional meaning, not merely housekeeping.

### Piece by piece

- **journal_mode=DELETE** selects rollback journaling with journal removal after successful completion. The returned delete confirms the mode.
- **WITH RECURSIVE** generates a bounded 200-row baseline.
- **BEGIN IMMEDIATE** reserves A's writer position; the 150-row UPDATE creates the journal before-images.
- **.shell ls -l** shows named file sizes and metadata while A is open. **TUTOR_SQLITE_DB** supplies the same owned path to every connection.
- **.shell sqlite3 FILE SQL** opens a short-lived independent reader. The count and concatenated label expose zero pending values before publication.
- **ROLLBACK** discards the first change. **COMMIT** publishes the second; the final independent query must count 150 committed-update rows.
- **test -e, stat -c and echo** distinguish an absent journal from a zero/nonzero length. %s is bytes; journal size is physical evidence, not a count of changed rows.

## Setup
```sql
PRAGMA journal_mode = DELETE;

DROP TABLE IF EXISTS journal_rows;

CREATE TABLE journal_rows (id INTEGER PRIMARY KEY, payload TEXT);

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
      x < 200
  )
INSERT INTO
  journal_rows
SELECT
  x,
  'baseline'
FROM
  n;
```

## Run
```sql
-- Session A
PRAGMA journal_mode = DELETE;

BEGIN IMMEDIATE;

UPDATE journal_rows
SET
  payload = 'uncommitted-update'
WHERE
  id <= 150;

-- Session B
.shell ls -l "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB-journal"
.shell sqlite3 "$TUTOR_SQLITE_DB" "SELECT 'b_visible_uncommitted=' || count(*) FROM journal_rows WHERE payload='uncommitted-update';"

-- Session A
ROLLBACK;

-- Session B
.shell if [ -e "$TUTOR_SQLITE_DB-journal" ]; then stat -c 'after_rollback journal_bytes=%s' "$TUTOR_SQLITE_DB-journal"; else echo 'after_rollback journal_absent'; fi
.shell sqlite3 "$TUTOR_SQLITE_DB" "SELECT 'b_after_rollback_uncommitted=' || count(*) FROM journal_rows WHERE payload='uncommitted-update';"

-- Session A
BEGIN IMMEDIATE;

UPDATE journal_rows
SET
  payload = 'committed-update'
WHERE
  id <= 150;

COMMIT;

-- Session B
.shell if [ -e "$TUTOR_SQLITE_DB-journal" ]; then stat -c 'after_commit journal_bytes=%s' "$TUTOR_SQLITE_DB-journal"; else echo 'after_commit journal_absent'; fi
.shell sqlite3 "$TUTOR_SQLITE_DB" "SELECT 'b_committed_update=' || count(*) FROM journal_rows WHERE payload='committed-update';"
```

## Expected result
While A's transaction is open, B sees a nonempty journal and b_visible_uncommitted = 0. After rollback, b_after_rollback_uncommitted = 0; after a committed update, b_committed_update = 150. In DELETE mode the sidecar is normally absent after rollback and commit.

## Systems lens
PostgreSQL already taught atomicity; SQLite shows a different physical implementation. In rollback mode, before-images, file locks and journal invalidation cooperate to make an ordinary file transactional. A shell observer must interpret the coordinated file state, not assume that bytes visible in the main file are committed.

## Optional variation
Repeat with one updated page and then many updated pages; compare journal size and explain why the journal tracks before-images.
