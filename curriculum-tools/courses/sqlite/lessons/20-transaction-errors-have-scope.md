# Observe the scope of transaction errors

slug: transaction-errors-have-scope
category: concurrency
difficulty: intermediate
tags: error-scope, transactions, savepoints, constraints
prerequisites: batching-changes-the-cost
safety: writes-data
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 15
revision: 1

## Overview
Put a UNIQUE violation between successful statements and observe which surrounding writes survive. Then change the rollback boundary with explicit ROLLBACK, OR ROLLBACK and SAVEPOINT. This is a critical PostgreSQL contrast: the same instinct to 'catch an error and continue' has different transaction consequences in SQLite.

## Syntax breakdown
### In plain terms

Not every SQL error destroys the whole transaction. SQLite's default ABORT policy cancels the failing statement and leaves earlier work available; an explicit ROLLBACK or the OR ROLLBACK conflict policy abandons the surrounding transaction; a SAVEPOINT creates a smaller rollback boundary. This lesson runs each case against one ledger and counts the rows after each commit.

### What you are learning

- **Statement-scope ABORT** leaves a transaction usable after a constraint error.
- **Transaction-scope rollback** removes all pending writes, whether requested explicitly or by OR ROLLBACK.
- **Savepoints** provide nested application recovery without discarding the outer transaction.
- **PostgreSQL contrast**: a PostgreSQL error marks the whole transaction failed until ROLLBACK, whereas SQLite's default constraint error does not.

### Piece by piece

- **PRAGMA journal_mode=DELETE** (persistent setting): keeps this one-file error experiment in rollback mode.
- **UNIQUE(id)** (table constraint): creates the deterministic duplicate-key error.
- **BEGIN / COMMIT** (transaction statements): delimit the work whose surviving rows are counted.
- **INSERT** (default ABORT statement): the duplicate fails, but the transaction can execute the next insert and commit.
- **ROLLBACK** (explicit transaction end): discards all pending rows after the intentional error.
- **INSERT OR ROLLBACK** (conflict policy): changes the duplicate's scope so SQLite automatically rolls back the entire transaction.
- **SAVEPOINT unit** (nested transaction marker): names a partial rollback boundary.
- **ROLLBACK TO unit** (savepoint recovery): discards writes after the marker while retaining the outer transaction.
- **RELEASE unit** (savepoint end): removes the marker; the outer COMMIT remains responsible for durability.
- **count(*) and group_concat** (aggregates): expose committed row counts and identities after each case.
- **.bail off** (CLI dot command): lets expected duplicate errors flow to the following evidence queries.

## Caution
Each duplicate error is expected and intentionally followed by a scope-specific recovery. Do not generalize from the error text alone; the post-case committed row count is the authoritative evidence.

## Setup
```sql
.bail off
PRAGMA journal_mode = DELETE;

DROP TABLE IF EXISTS ledger;

CREATE TABLE ledger (id INTEGER PRIMARY KEY, note TEXT NOT NULL);
```

## Run
```sql
-- Default ABORT: only the duplicate statement is cancelled
BEGIN;

INSERT INTO
  ledger
VALUES
  (1, 'abort first');

INSERT INTO
  ledger
VALUES
  (1, 'abort duplicate');

INSERT INTO
  ledger
VALUES
  (2, 'abort continues');

COMMIT;

SELECT
  'after ABORT' AS case_name,
  count(*) AS committed_rows,
  group_concat(id) AS ids
FROM
  ledger;

-- Explicit ROLLBACK: the caller abandons the whole transaction
BEGIN;

INSERT INTO
  ledger
VALUES
  (3, 'explicit pending');

INSERT INTO
  ledger
VALUES
  (1, 'explicit duplicate');

ROLLBACK;

SELECT
  'after explicit ROLLBACK' AS case_name,
  count(*) AS committed_rows,
  group_concat(id) AS ids
FROM
  ledger;

-- OR ROLLBACK: the duplicate automatically aborts its transaction
BEGIN;

INSERT INTO
  ledger
VALUES
  (3, 'automatic pending');

INSERT OR ROLLBACK INTO
  ledger
VALUES
  (1, 'automatic duplicate');

SELECT
  'after OR ROLLBACK' AS case_name,
  count(*) AS committed_rows,
  group_concat(id) AS ids
FROM
  ledger;

-- SAVEPOINT: recover only the failed subunit, then commit the outer work
BEGIN;

INSERT INTO
  ledger
VALUES
  (3, 'savepoint before');

SAVEPOINT unit;

INSERT INTO
  ledger
VALUES
  (5, 'savepoint pending work');

INSERT INTO
  ledger
VALUES
  (1, 'savepoint duplicate');

ROLLBACK TO unit;

INSERT INTO
  ledger
VALUES
  (4, 'savepoint after');

RELEASE unit;

COMMIT;

SELECT
  'after SAVEPOINT' AS case_name,
  count(*) AS committed_rows,
  group_concat(id) AS ids
FROM
  ledger;
```

## Expected result
The duplicate under default ABORT prints a UNIQUE constraint error but the following insert commits: after ABORT has committed_rows = 2 and ids 1,2. Explicit ROLLBACK leaves the same 2 rows. OR ROLLBACK also leaves 2 rows and the following SELECT runs in autocommit. The SAVEPOINT case commits ids 1,2,3,4 with committed_rows = 4; its duplicate is rolled back only to unit.

## Systems lens
A transaction API is also an error-state machine. PostgreSQL generally leaves an explicit transaction failed after an error until recovery; SQLite's default constraint ABORT undoes the statement but leaves the transaction usable. Other errors can have wider scope, so an application must inspect its driver's transaction state and classify the failure before deciding what to repeat.

## Optional variation
Repeat Setup and Run, changing only the first duplicate statement to `INSERT OR FAIL INTO ledger VALUES (1, 'abort duplicate');`. It still fails, while the following insert and COMMIT succeed with ids 1,2. This single-row statement does not expose FAIL's ability to preserve earlier changes within a multi-row statement.

Repeat Setup and Run again with `RELEASE unit;` omitted. After ROLLBACK TO, the savepoint and outer transaction remain active; the existing outer COMMIT ends both and commits ids 1,2,3,4. Omitting RELEASE does not prevent that COMMIT.
