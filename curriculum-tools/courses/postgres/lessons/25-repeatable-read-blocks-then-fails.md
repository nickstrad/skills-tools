# Repeatable read blocks, then refuses: SQLSTATE 40001

slug: repeatable-read-blocks-then-fails
category: isolation
difficulty: intermediate
tags: isolation, repeatable-read, snapshots, serialization-failure
prerequisites: lost-update-under-read-committed
safety: locking
run-in: tool
sessions: 2
min-version: 16
minutes: 15
revision: 4

## Overview
A repeatable-read transaction cannot silently re-read a row the way a read-committed one does: if
the row it wants to update changed after its snapshot, re-reading would break the snapshot. So the
server aborts the transaction instead. This is the error every retry loop is written for.

## Syntax breakdown
### In plain terms

This experiment asks what happens when a transaction tries to update a row after another transaction
has committed a newer version. Repeatable Read refuses to mix the old snapshot with the new row, so
the waiting writer fails instead of quietly changing its result. SQLSTATE 40001 identifies this
retryable serialization failure.

### What you are learning

- **Snapshot pinning** keeps all statements in one transaction consistent with one visibility point.
- **Serialization failure** deliberately aborts work that cannot fit the pinned snapshot.
- **Transaction cleanup** is mandatory: after an error, only ROLLBACK makes the connection usable.

### Piece by piece

- **BEGIN ISOLATION LEVEL REPEATABLE READ** (SQL transaction command): Starts a transaction with one stable snapshot after its first statement.
  - What it does here: Makes A retain a view from before B's update.
  - What it gives us: A's UPDATE must confront B's committed newer version.
- **SELECT balance ...** (SQL query): Reads the row and establishes A's snapshot.
  - What it does here: Records balance 100 before B changes it.
  - What it gives us: The baseline for detecting the later conflict.
- **UPDATE ... SET balance = balance + 5** (SQL data change): B creates and commits a newer row version.
  - What it does here: Holds the row lock until B commits.
  - What it gives us: A waits, then encounters a committed concurrent update.
- **\echo A woke up with SQLSTATE :SQLSTATE** (psql command): Prints the last server error code.
  - What it does here: Displays A's result after the wait.
  - What it gives us: 40001, distinguishing this from an ordinary SQL error.
- **ROLLBACK** (SQL transaction command): Ends the failed transaction and discards pending work.
  - What it does here: Clears A's aborted state so it can read again.
  - What it gives us: Balance 105, showing only B committed.

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
-- Session A
begin isolation level repeatable read;
select balance from iso_accounts where id = 1;

-- Session B
begin;
update iso_accounts set balance = balance + 5 where id = 1;

-- Session A (blocks until B commits)
update iso_accounts set balance = balance - 10 where id = 1;

-- Session B
commit;

-- Session A
\echo A woke up with SQLSTATE :SQLSTATE
select balance from iso_accounts where id = 1;
rollback;
select balance from iso_accounts where id = 1;
```

## Expected result
A's UPDATE waits on B's uncommitted row lock. The moment B commits, A does not proceed: it prints
"ERROR:  could not serialize access due to concurrent update" and psql echoes SQLSTATE 40001. The
next SELECT in A fails with "ERROR:  current transaction is aborted, commands ignored until end of
transaction block". After ROLLBACK the balance is 105: only B's update survived.

## Systems lens
Snapshot isolation trades blocking for aborting. A read-committed writer waits and then quietly
works on newer data; a repeatable-read writer waits and then refuses, because continuing would mean
its reads and its writes came from two different points in time. Optimistic concurrency control in
any distributed store makes the same bargain: no coordination on the read path, a possible abort at
commit, and the application owns the retry.

## Optional variation
Rerun with B never committing but issuing ROLLBACK instead. A's UPDATE unblocks and succeeds: the
abort is raised only against a committed conflicting version, not against a lock you merely waited
on.
