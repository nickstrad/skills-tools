# Deferred transactions discover contention at the write

slug: deferred-write-race
category: concurrency
difficulty: intermediate
tags: transactions, locking, busy, isolation
prerequisites: transaction-errors-have-scope
safety: locking
run-in: tool
sessions: 2
min-version: 3.53.4
minutes: 15
revision: 2

## Overview
Let both sessions read before either reserves the writer, then make them compete to upgrade. B is refused promptly despite a two-second timeout because its retained read lock can block A's eventual commit. Distinguish this lock-cycle refusal from an ordinary wait-budget expiry.

## Syntax breakdown
### In plain terms

Two DEFERRED transactions may both read before either reserves SQLite's single writer slot. The second connection then tries to upgrade its existing read transaction and receives SQLITE_BUSY immediately: waiting would deadlock the writer ahead of it. The experiment measures that boundary and shows that releasing the conflicting writer lets the still-open reader retry; an application may instead restart to obtain a fresh snapshot.

### What you are learning

- **DEFERRED admission** delays writer reservation until the first write.
- **Busy-handler bypass** is different from a timeout expiring; an impossible lock upgrade fails immediately.
- **Retry choice** depends on semantics: this controlled run retries the still-open snapshot after the holder rolls back, while applications that need fresh data should end and restart the transaction.

### Piece by piece

- **BEGIN DEFERRED** (transaction start): opens a transaction without taking RESERVED; both sessions can read first.
- **.timeout 2000** (CLI setting): installs a 2000 ms busy wait for lock conflicts; it cannot help an impossible upgrade.
- **.timer on/off** (CLI display setting): prints elapsed time around B's UPDATE; near-zero time is the key evidence.
- **UPDATE value=value+1** (data change): asks each reader to become the writer; A succeeds, B conflicts.
- **changes()** (SQLite scalar function): reports rows changed by A's successful UPDATE.
- **ROLLBACK** (transaction end): releases A's writer state, allowing B's still-open read transaction to retry its upgrade.
- **SELECT from counter** (read): B's value remains its original snapshot while its failed transaction is still open.

## Caution
The exact busy error text is CLI/version dependent; the lock boundary and the measured zero wait, not the wording, are the evidence.

## Setup
```sql
.print -- close every other sqlite3 session first: the next line must print delete
PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS counter;
CREATE TABLE counter(id INTEGER PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO counter VALUES (1, 0);
```

## Run
```sql
-- Session A
.timeout 2000
BEGIN DEFERRED;
SELECT 'A snapshot', value FROM counter WHERE id=1;

-- Session B
.timeout 2000
BEGIN DEFERRED;
SELECT 'B snapshot', value FROM counter WHERE id=1;

-- Session A
UPDATE counter SET value=value+1 WHERE id=1;
SELECT 'A changes', changes();

-- Session B
.timer on
UPDATE counter SET value=value+1 WHERE id=1;
.timer off
SELECT 'B still inside its read transaction', value FROM counter WHERE id=1;

-- Session A
ROLLBACK;

-- Session B
UPDATE counter SET value=value+1 WHERE id=1;
COMMIT;
SELECT 'committed value', value FROM counter WHERE id=1;
```

## Expected result
Both readers initially see 0 and A changes one row. B's UPDATE reports database is locked promptly, far short of its two-second budget; a validated run took under 0.001 s. B still reads 0. A then rolls back, allowing B's still-open transaction to retry the update and commit value 1. Exact timing is not an invariant.

## Systems lens
There are two valid lessons here, not one universal retry recipe. In this controlled schedule A abandons its write, so B's retained read transaction can upgrade afterward. In a general read/decide/write retry, ending the losing transaction and rereading is often the appropriate policy; endlessly retrying while retaining the read lock can prevent the other writer from making progress.

## Optional variation
Repeat with A running COMMIT instead of ROLLBACK while B still holds its read transaction. A's commit needs an EXCLUSIVE lock that B's SHARED lock blocks. Predict which side waits for its full timeout, which side fails instantly, and which one must give up for either to finish.
