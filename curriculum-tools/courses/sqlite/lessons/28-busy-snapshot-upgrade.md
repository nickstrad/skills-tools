# A stale WAL snapshot cannot silently become a writer

slug: busy-snapshot-upgrade
category: wal
difficulty: advanced
tags: wal, snapshots, busy, optimistic-concurrency
prerequisites: reader-and-writer-overlap
safety: locking
run-in: tool
sessions: 2
min-version: 3.53.4
minutes: 15
revision: 2

## Overview
Read v1 in A, commit v2 in B, then try to write through A's old snapshot. The error is immediate even with a wait budget because time cannot make that snapshot current. Learn to restart the decision based on stale reads, not blindly retry the last SQL statement.

## Syntax breakdown
### In plain terms

A lock can eventually be released, but an old snapshot cannot become the latest history by waiting. SQLite rejects A's attempted read-to-write upgrade after B has committed. That distinction determines whether a retry should wait, repeat a statement, or rerun the entire read/decide/write transaction.

### What you are learning

- **Permanent conflict for this snapshot:** Releasing B is insufficient; B has already committed.
- **Error scope:** The failed UPDATE does not itself end A's read transaction.
- **Observed versus inferred codes:** This CLI prints a primary locked error; the extended SQLITE_BUSY_SNAPSHOT classification comes from the documented scenario.

### Piece by piece

- **PRAGMA journal_mode=WAL** makes the snapshot mechanism explicit.
- **.timeout 100** installs a 100 ms busy budget on A only. It is not a promise that all conflicts wait that long.
- **BEGIN and SELECT** fix A's v1 snapshot. B's autocommit **UPDATE** publishes v2 before A attempts its write.
- **.timer on/off** scopes elapsed reporting to the rejected UPDATE. Expect an immediate result relative to the budget, not a required literal zero on every machine.
- **SELECT after the error** still sees v1, proving A remains in the same read transaction.
- **ROLLBACK** discards that transaction; the next query sees v2. Production retry logic must recompute any decision derived from v1.
- **BEGIN IMMEDIATE** in the variation reserves writer admission before reading a new decision snapshot. Use it after rollback; it cannot repair the old transaction in place.

## Caution
The default CLI exposes the primary error text; bindings can inspect the extended SQLITE_BUSY_SNAPSHOT result code.

## Setup
```sql
PRAGMA journal_mode = WAL;

DROP TABLE IF EXISTS docs;

CREATE TABLE docs (id INTEGER PRIMARY KEY, body TEXT);

INSERT INTO
  docs
VALUES
  (1, 'v1');
```

## Run
```sql
-- Session A
.timeout 100
BEGIN;

SELECT
  'A read',
  body
FROM
  docs
WHERE
  id = 1;

-- Session B
UPDATE docs
SET
  body = 'v2'
WHERE
  id = 1;

SELECT
  'B committed',
  body
FROM
  docs
WHERE
  id = 1;

-- Session A
.timer on
UPDATE docs
SET
  body = 'A stale write'
WHERE
  id = 1;

.timer off
SELECT
  'A still snapshot',
  body
FROM
  docs
WHERE
  id = 1;

ROLLBACK;

SELECT
  'A retry view',
  body
FROM
  docs
WHERE
  id = 1;
```

## Expected result
A reads v1 and B commits v2. A's UPDATE prints database is locked promptly rather than waiting out the 100 ms budget; the exact timer value varies. The known ordering matches SQLite's documented SQLITE_BUSY_SNAPSHOT condition, but the default CLI does not display that extended code here. A still sees v1 after the error and sees v2 only after ROLLBACK and a fresh read.

## Systems lens
Carry forward PostgreSQL's rule that a retry must repeat the decision whose assumptions failed. Add SQLite's distinction between writer-admission contention and stale-snapshot refusal. A larger timeout addresses some admission waits; it cannot repair a stale decision or provide more writer capacity.

## Optional variation
After A's existing ROLLBACK and fresh read, run `BEGIN IMMEDIATE;`, repeat `SELECT body FROM docs WHERE id=1;`, and then run `UPDATE docs SET body='A fresh write' WHERE id=1; COMMIT;`. A reads v2 after admission and commits its new value without upgrading an old snapshot. Verify with the same SELECT. Reserving the writer before reading prevents another writer from advancing this decision's history in between.
