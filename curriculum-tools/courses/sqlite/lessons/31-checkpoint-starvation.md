# A slow reader can grow the WAL indefinitely

slug: checkpoint-starvation
category: wal
difficulty: advanced
tags: wal, checkpoints, backpressure, capacity, snapshots
prerequisites: automatic-checkpoint-cost
safety: locking
run-in: tool
sessions: 2
min-version: 3.53.4
minutes: 20
revision: 1

## Overview
Pin a reader, append six small commits and observe partial checkpoint progress alongside growing WAL bytes. Then release only the reader and reclaim the log without deleting any committed rows. The point is to identify the resource owner that makes maintenance ineffective.

## Syntax breakdown
### In plain terms

A system can continue accepting writes while accumulating a maintenance debt it cannot pay yet. Here an old read transaction is that constraint: it needs page versions that checkpointing cannot overwrite. We use six bounded commits to demonstrate a mechanism that could otherwise keep growing.

### What you are learning

- **Retention horizon:** The oldest needed version limits safe reclamation.
- **Hidden backpressure:** Reader lifetime can consume storage even when writer latency looks healthy.
- **Diagnostic intervention:** Releasing the pin, not deleting log files, restores progress.

### Piece by piece

- **PRAGMA journal_mode=WAL and wal_autocheckpoint=0** establish explicit maintenance control. A repeats the threshold setting in the connection performing writes.
- **B's BEGIN and SELECT** pin the initial one-row snapshot. Merely opening a connection without an active read transaction would not create the same pin.
- **Six separate INSERT statements** are six autocommit transactions. PASSIVE checkpoint calls after the first and second group expose a growing log with frames still blocked by B.
- **wal_checkpoint(PASSIVE)** does not wait for B. Compare log frames with checkpointed frames rather than treating first-column 0 as complete success.
- **.shell stat -c '%n %s bytes'** records file growth while connections remain open.
- **B's COMMIT** releases the old snapshot. A's **wal_checkpoint(TRUNCATE)** can now finish and reduce the WAL to zero bytes; the current count must still be 7.
- **A WAL alert policy** needs an operational threshold and an allowed response. Cancelling a long reader may be appropriate, but a WAL-size alert alone does not identify which connection owns the pin.

## Caution
WAL is same-host coordination, not replication or consensus; do not place the files on NFS, SMB, or a synchronized cloud directory.

## Setup
```sql
PRAGMA journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;
DROP TABLE IF EXISTS queue;
CREATE TABLE queue(id INTEGER PRIMARY KEY, payload TEXT);
INSERT INTO queue(payload) VALUES ('anchor');
```

## Run
```sql
-- Session B
BEGIN;
SELECT 'old reader', count(*) FROM queue;

-- Session A
PRAGMA wal_autocheckpoint=0;
INSERT INTO queue(payload) VALUES ('batch-1');
INSERT INTO queue(payload) VALUES ('batch-2');
INSERT INTO queue(payload) VALUES ('batch-3');
PRAGMA wal_checkpoint(PASSIVE);
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB-wal"
INSERT INTO queue(payload) VALUES ('batch-4');
INSERT INTO queue(payload) VALUES ('batch-5');
INSERT INTO queue(payload) VALUES ('batch-6');
PRAGMA wal_checkpoint(PASSIVE);
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB-wal"

-- Session B
COMMIT;

-- Session A
PRAGMA wal_checkpoint(TRUNCATE);
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB-wal";
SELECT 'current rows', count(*) FROM queue;
```

## Expected result
While B's snapshot is open, passive checkpoints report a WAL backlog and the sidecar grows after each batch. After B commits, TRUNCATE can reclaim the WAL; current rows then total 7.

## Systems lens
The general lesson transfers to replication lag, retained queue offsets and version garbage collection: a slow observer can control reclamation. SQLite makes the ownership local and concrete. Your application's transaction lifetimes are part of its storage-capacity contract, even if its queries are read-only.

## Optional variation
Use the two pre-release byte measurements and checkpoint backlogs to interpret a WAL-size alert. An application policy can allow bounded growth within available headroom, cancel an identified overlong read transaction, or restart that read from a fresh snapshot when its semantics permit. In this fixture B is the known owner; its COMMIT demonstrates the release needed for reclamation. A byte threshold alone cannot identify that owner or make a restart safe.
