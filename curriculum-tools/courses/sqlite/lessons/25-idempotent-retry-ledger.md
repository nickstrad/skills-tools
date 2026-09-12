# Deduplicate retries within SQLite's one-file commit boundary

slug: idempotent-retry-ledger
category: concurrency
difficulty: intermediate
tags: idempotency, retries, atomicity, deduplication, transactions
prerequisites: busy-timeout-bounds-wait
safety: writes-data
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 15
revision: 3

## Overview
Apply an operation and its durable receipt in one local transaction, then replay it without changing the balance again. Also reuse the same identity with a different amount and require rejection. The extra SQLite-specific skills are targeted conflict handling, changes() adjacency and explicit transaction error scope.

## Syntax breakdown
### In plain terms

A deduplication key must mean one immutable operation, not 'ignore anything with this label'. The first op-42 adds 10 and records that amount; the replay is a no-op; op-42 with amount 99 is an identity conflict. All three decisions happen within one file's writer transaction.

### What you are learning

- **Atomic effect and receipt:** Neither may commit without the other.
- **Payload identity:** A repeated key is only a valid replay if its meaning agrees.
- **Targeted conflict handling:** Suppress only the intended duplicate-key case, not every constraint error.
- **Connection-local observation:** changes() belongs to the last data-changing statement on this connection.

### Piece by piece

- **operation_id TEXT PRIMARY KEY NOT NULL** supplies a non-null durable identity. **delta INTEGER NOT NULL** records the meaning associated with it; a timestamp alone would not detect changed-amount reuse.
- **CREATE TEMP TABLE identity_guard(ok CHECK(ok=1))** provides a compact assertion mechanism for this SQL-only lab. TEMP belongs to this connection, not the durable receipt state.
- **BEGIN IMMEDIATE** admits one writer before reading the existing receipt and choosing an effect.
- **INSERT OR ROLLBACK ... SELECT 0** writes an invalid guard value only when an existing op-42 has a different delta. CHECK rejects it, and OR ROLLBACK abandons the transaction. In production a driver can branch explicitly and roll back instead of using this assertion table.
- **INSERT ... ON CONFLICT(operation_id) DO NOTHING** inserts a new receipt or suppresses only that identity conflict. Unlike broad OR IGNORE, unrelated NOT NULL or CHECK violations remain errors.
- **changes()** after the receipt insert reports 1 for the first claim and 0 for the replay. An intervening SELECT does not replace that value, but another INSERT/UPDATE/DELETE would.
- **UPDATE ... AND changes()=1** uses that adjacent claim result to gate the account change. The fixture has exactly one target account; a general implementation must also validate that the intended effect exists and succeeded.
- **COMMIT** publishes receipt and effect together. The first and replay checks both show balance 110, and the ledger has one row.
- The final attempt's **delta<>99 guard** deliberately raises CHECK constraint failed and rolls back. Its subsequent read must still show 110 and one receipt; no second effect statement is run after that rejection.

## Caution
Keep the payload guard, receipt and domain effect in the same transaction. Do not insert a new data-changing statement between the receipt INSERT and its changes()-gated UPDATE. A duplicate key with changed meaning is an error, not successful deduplication.

## Setup
```sql
DROP TABLE IF EXISTS applied_operations;
DROP TABLE IF EXISTS account;
CREATE TABLE account(id INTEGER PRIMARY KEY, balance INTEGER NOT NULL);
CREATE TABLE applied_operations(operation_id TEXT PRIMARY KEY NOT NULL, delta INTEGER NOT NULL);
DROP TABLE IF EXISTS temp.identity_guard;
CREATE TEMP TABLE identity_guard(ok INTEGER CHECK(ok=1));
INSERT INTO account VALUES (1, 100);
```

## Run
```sql
-- Session A
BEGIN IMMEDIATE;
INSERT OR ROLLBACK INTO identity_guard
SELECT 0 FROM applied_operations WHERE operation_id='op-42' AND delta<>10;
INSERT INTO applied_operations VALUES ('op-42', 10) ON CONFLICT(operation_id) DO NOTHING;
SELECT 'claim 1', changes();
UPDATE account SET balance=balance+10 WHERE id=1 AND changes()=1;
COMMIT;
SELECT 'after first', balance FROM account;

BEGIN IMMEDIATE;
INSERT OR ROLLBACK INTO identity_guard
SELECT 0 FROM applied_operations WHERE operation_id='op-42' AND delta<>10;
INSERT INTO applied_operations VALUES ('op-42', 10) ON CONFLICT(operation_id) DO NOTHING;
SELECT 'claim 2', changes();
UPDATE account SET balance=balance+10 WHERE id=1 AND changes()=1;
COMMIT;
SELECT 'after replay', balance, (SELECT count(*) FROM applied_operations) FROM account;

BEGIN IMMEDIATE;
INSERT OR ROLLBACK INTO identity_guard
SELECT 0 FROM applied_operations WHERE operation_id='op-42' AND delta<>99;
SELECT 'different payload rejected', balance, (SELECT count(*) FROM applied_operations) FROM account;
```

## Expected result
The first claim reports 1 and balance 110. The replay reports claim 0 and balance 110 with one receipt. Reusing op-42 with amount 99 produces the expected CHECK constraint failed: ok=1; different payload rejected still reports balance 110 and one receipt.

## Systems lens
PostgreSQL can teach idempotency deeply once; SQLite adds the embedded one-file boundary and its particular conflict/error semantics. This ledger covers only local database effects. Lost acknowledgments across a second database, an email provider or another service need a protocol at that other system's commit boundary, developed in module 08.

## Optional variation
Repeat Setup and Run with only the first COMMIT changed to ROLLBACK after the account UPDATE. The first balance check is now 100: both the pending receipt and account change disappeared. The second attempt reports claim 2 = 1 and commits balance 110 with one receipt; the changed-payload attempt remains rejected. A local rollback cannot undo an email or payment already accepted by another service between the UPDATE and ROLLBACK. That service needs its own retry identity and outcome protocol.
