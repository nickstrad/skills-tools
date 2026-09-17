# Checkpoint modes trade progress for coordination

slug: checkpoint-modes
category: wal
difficulty: advanced
tags: wal, checkpoints, backpressure, observability
prerequisites: busy-snapshot-upgrade
safety: locking
run-in: tool
sessions: 2
min-version: 3.53.4
minutes: 20
revision: 2

## Overview
Hold a reader behind a later commit and compare four checkpoint modes. The experiment separates copying eligible log frames, waiting for readers, making the log reusable, and shrinking its file. Those are different maintenance outcomes even when application queries return the same rows.

## Syntax breakdown
### In plain terms

A checkpoint copies safe WAL page versions into the main database. It cannot overwrite a page version that an active reader still needs. The three result columns and the physical file length let you distinguish partial progress from complete reclamation.

### What you are learning

- **Apply versus reclaim:** Checkpointed frames do not imply a zero-length WAL.
- **Coordination cost:** Stronger checkpoint modes can wait for readers or writers.
- **Result interpretation:** A successful request can still leave a backlog; PASSIVE's first column is not a completeness flag.

### Piece by piece

- **wal_autocheckpoint=0** on A keeps the foreground inserts from automatically doing the maintenance we want to request explicitly.
- **B's BEGIN and count** pin the one-row snapshot. A then commits eight new rows, creating frames that cannot all be applied while B needs the older state.
- **.timeout 100** bounds the stronger modes' busy-handler wait on A.
- **wal_checkpoint(PASSIVE)** applies what it can without waiting for readers or writers. Read its three columns as **busy | log frames | checkpointed frames**; 0 with log greater than checkpointed is partial progress.
- **FULL** waits within its budget to checkpoint all frames. **RESTART** additionally waits for readers to leave the WAL so a future writer can restart it. **TRUNCATE** additionally reduces the WAL file to zero bytes on success.
- **.shell stat -c '%n %s bytes'** inspects the live WAL length. A large file can contain reusable space, so size alone is not the backlog.
- **B's COMMIT** ends the pin. Repeating FULL, RESTART and TRUNCATE should permit complete progress; successful TRUNCATE returns 0|0|0 and zero bytes.

## Caution
Checkpoint results and exact sidecar sizes vary with page size and scheduling; compare the busy/log/checkpointed relationship rather than relying on one literal triple.

## Setup
```sql
PRAGMA journal_mode = WAL;

PRAGMA wal_autocheckpoint = 0;

DROP TABLE IF EXISTS frames;

CREATE TABLE frames (id INTEGER PRIMARY KEY, note TEXT);

INSERT INTO
  frames (note)
VALUES
  ('base');
```

## Run
```sql
-- Session A
PRAGMA wal_autocheckpoint = 0;

-- Session B
BEGIN;

SELECT
  'reader pins snapshot',
  count(*)
FROM
  frames;

-- Session A
INSERT INTO
  frames (note)
VALUES
  ('frame-1'),
  ('frame-2'),
  ('frame-3'),
  ('frame-4'),
  ('frame-5'),
  ('frame-6'),
  ('frame-7'),
  ('frame-8');

.timeout 100
PRAGMA wal_checkpoint (PASSIVE);

PRAGMA wal_checkpoint (FULL);

PRAGMA wal_checkpoint (RESTART);

PRAGMA wal_checkpoint (TRUNCATE);

.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB-wal"
-- Session B
COMMIT;

-- Session A
PRAGMA wal_checkpoint (FULL);

PRAGMA wal_checkpoint (RESTART);

PRAGMA wal_checkpoint (TRUNCATE);

.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB-wal";
```

## Expected result
With B open, PASSIVE reports first column 0 but log > checkpointed; FULL, RESTART and TRUNCATE report busy=1 with incomplete progress. One isolated 4 KiB run gave 0|4|3 then 1|4|3. After B commits, FULL/RESTART report equal log and checkpointed counts, then TRUNCATE reports 0|0|0 and zero WAL bytes. Earlier course state can change frame counts; these relationships, not 4 and 3, are the invariant.

## Systems lens
PostgreSQL checkpoint and vacuum experience gives useful questions about writeback and retention, but SQLite's APIs expose different boundaries. Here the oldest local reader constrains safe page replacement and log reuse. Monitor reader age, checkpoint progress and WAL size together before choosing a remedy.

## Optional variation
Repeat Setup and Run while omitting B's BEGIN, SELECT and COMMIT. A's first PASSIVE can now checkpoint all frames, with log equal to checkpointed; FULL and RESTART can also finish without waiting for B. TRUNCATE additionally reduces WAL length to zero. PASSIVE remains useful when maintenance should make available progress without waiting on concurrent readers or writers; complete progress here follows from the controlled absence of contention.
