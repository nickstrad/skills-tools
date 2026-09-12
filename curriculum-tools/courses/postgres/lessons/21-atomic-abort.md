# Atomicity: what a ROLLBACK actually undoes

slug: atomic-abort
category: isolation
difficulty: beginner
tags: transactions, isolation, mvcc
prerequisites: install-lab-extensions
safety: writes-data
run-in: tool
sessions: 1
min-version: 16
minutes: 10
revision: 4

## Overview
A transaction is the unit of all-or-nothing. First you undo a two-row transfer deliberately; then
you make one statement fail and observe the connection's failed transaction state. The application
rule here is concrete: with no earlier savepoint to recover to, roll back the failed transaction
before issuing new business statements.

## Syntax breakdown
### In plain terms

This experiment asks what a client can rely on after a rollback or an error. You perform a transfer,
undo it, then trigger an error and observe that the transaction stays unusable until it is rolled
back. The physical tuple evidence is covered by the earlier MVCC lesson; this lesson concentrates on
the application-visible transaction boundary.

### What you are learning

- **Atomic transactions** mean all statements commit together or none become visible.
- **Aborted transactions** remain failed after an error; a rollback is required before another command.
- **Failed transaction state** rejects later statements until the client rolls the whole transaction back.

### Piece by piece

- **BEGIN** (SQL transaction command)
  - What it is: Starts a transaction block, grouping later writes into one atomic unit.
  - What it does here: Opens the transfer and the error demonstration.
  - What it gives us: Statements before COMMIT or ROLLBACK are provisional.
- **UPDATE ... SET ... WHERE** (SQL data-change statement)
  - What it is: Changes matching rows; PostgreSQL writes new row versions rather than editing old bytes in place.
  - What it does here: Moves 10 between accounts, then creates an update that will be aborted.
  - What it gives us: Balances 90 and 110 inside the first transaction, followed by 100 and 100 after rollback.
- **SELECT ... ORDER BY id** (SQL query with ordering)
  - What it is: Reads rows and sorts them by numeric id so the accounts are easy to compare.
  - What it does here: Compares provisional balances with restored balances.
  - What it gives us: 90/110 before rollback and 100/100 afterward.
- **ROLLBACK** (SQL transaction command)
  - What it is: Ends the current transaction without publishing its changes.
  - What it does here: Removes the transfer's visibility and clears the failed state.
  - What it gives us: Original balances, not proof that physical row versions were erased.
- **SELECT 1 / 0** (SQL expression that raises an error)
  - What it is: Integer division by zero, deliberately invalid.
  - What it does here: Aborts the open transaction.
  - What it gives us: The division-by-zero error that starts the failed state.
- **\echo :SQLSTATE** (psql command and variable)
  - What it is: psql prints a client variable; SQLSTATE stores the last server error code.
  - What it does here: Prints the code for the aborted-transaction state.
  - What it gives us: 25P02, identifying the failed transaction block.

## Setup
```sql
create table if not exists iso_accounts (
  id int primary key,
  owner text not null,
  balance int not null
);
truncate iso_accounts;
insert into iso_accounts (id, owner, balance) values (1, 'alice', 100), (2, 'bob', 100);
```

## Run
```sql
-- 1. An explicit rollback of a two-row transfer.
begin;
update iso_accounts set balance = balance - 10 where id = 1;
update iso_accounts set balance = balance + 10 where id = 2;
select id, owner, balance from iso_accounts order by id;
rollback;
select id, owner, balance from iso_accounts order by id;

-- 2. An error aborts the transaction; the rest of the block is refused.
begin;
update iso_accounts set balance = balance - 10 where id = 1;
select 1 / 0;
select id, balance from iso_accounts order by id;
\echo :SQLSTATE
rollback;
select id, owner, balance from iso_accounts order by id;
```

## Expected result
Inside the first transaction the balances read 90 and 110; after ROLLBACK they are 100 and 100.
In the second block the divide raises "ERROR:  division by zero", and the next SELECT fails with
"ERROR:  current transaction is aborted, commands ignored until end of transaction block"; psql
prints SQLSTATE 25P02 for that state. After the final rollback both balances are still 100.
The failed block does not partially publish its debit: the final balances remain 100 and 100.
Rollback is the required cleanup before the connection may serve another request.

## Systems lens
Atomicity gives a client a clean result: either the full transaction commits, or none of its
business changes are visible. PostgreSQL implements that result with MVCC visibility and transaction
status, but a request handler must still stop using a failed transaction and roll it back. Retrying
one later statement inside that failed block is not recovery.

## Optional variation
After rerunning setup, deliberately issue a second invalid statement after division by zero, then
ROLLBACK and begin a fresh transaction that reads both balances. The successful fresh read shows
that the connection remains usable after discarding its failed transaction. Commit the read-only
transaction to finish the comparison.
