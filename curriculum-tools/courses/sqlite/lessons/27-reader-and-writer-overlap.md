# WAL readers and the writer overlap safely

slug: reader-and-writer-overlap
category: wal
difficulty: intermediate
tags: wal, snapshots, isolation, transactions
prerequisites: wal-sidecar-files
safety: locking
run-in: tool
sessions: 2
min-version: 3.53.4
minutes: 15
revision: 1

## Overview
Keep A's read transaction open while B commits a second row. A sees a stable old answer until it ends the transaction; the next read sees B's change. Focus on how SQLite supplies that snapshot from the main file plus WAL versions, rather than relearning transaction isolation from scratch.

## Syntax breakdown
### In plain terms

A snapshot is the database state a transaction is allowed to observe. A's first read fixes its WAL end mark, the last commit it can see, while B is free to append a later commit. A does not have to read B's new state simply because that state is durable or visible to other connections.

### What you are learning

- **Snapshot establishment:** BEGIN alone is deferred; the first read establishes this reader's view.
- **Overlap:** A reader and a writer can proceed concurrently in WAL mode.
- **Remaining serialization:** Reader/writer overlap does not create multiple concurrent writers.

### Piece by piece

- **PRAGMA journal_mode=WAL** establishes the required mechanism. **wal_autocheckpoint=0** keeps the setup connection's automatic maintenance out of the observation.
- **BEGIN followed by SELECT** makes A hold a read transaction, rather than run two unrelated autocommit reads.
- **count(*) and group_concat(value)** expose both how many rows A sees and whether new content entered its snapshot. With the initial single row the concatenated value must be old.
- **B's INSERT without BEGIN** is an autocommit write. Its count 2 proves publication while A remains open.
- **A's second SELECT before COMMIT** must still report 1 and old. **COMMIT** ends the read transaction; the following autocommit count gets a fresh view and reports 2.
- **A second concurrent writer** in the variation competes for file-wide admission even if it targets an unrelated row; short writer transactions still matter.

## Caution
Readers must actually keep a transaction open; two autocommit SELECT statements can observe different snapshots.

## Setup
```sql
PRAGMA journal_mode = WAL;

PRAGMA wal_autocheckpoint = 0;

DROP TABLE IF EXISTS items;

CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT);

INSERT INTO
  items
VALUES
  (1, 'old');
```

## Run
```sql
-- Session A
BEGIN;

SELECT
  'A before',
  count(*),
  group_concat(value)
FROM
  items;

-- Session B
INSERT INTO
  items
VALUES
  (2, 'new');

SELECT
  'B committed',
  count(*)
FROM
  items;

-- Session A
SELECT
  'A snapshot after B commit',
  count(*),
  group_concat(value)
FROM
  items;

COMMIT;

SELECT
  'A current',
  count(*)
FROM
  items;
```

## Expected result
B commits and reports count 2 while A remains in its transaction. A's second query still reports count 1 and only old; after COMMIT, A's new query reports count 2.

## Systems lens
The PostgreSQL analogy is snapshot isolation, but SQLite does not keep PostgreSQL-style heap tuple-version chains for this observation. It reconstructs page versions relative to the reader's WAL end mark. That makes reader lifetime an input to checkpoint and log-space policy, which the next experiments expose.

## Optional variation
After the completed run, use the same two sessions to compare writer admission. In B run `BEGIN IMMEDIATE;`. In A run `.timeout 100` and then `BEGIN IMMEDIATE;`: A waits roughly 100 ms and reports busy while B owns the writer reservation. Run `ROLLBACK;` in B, then retry `BEGIN IMMEDIATE;` in A and end it with `ROLLBACK;`. The two rows remain unchanged. WAL permits the earlier reader/writer overlap, but still coordinates one local writer; it does not transport or agree on changes between hosts.
