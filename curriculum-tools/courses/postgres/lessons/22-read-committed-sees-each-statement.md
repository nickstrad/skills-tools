# Read committed takes a new snapshot for every statement

slug: read-committed-sees-each-statement
category: isolation
difficulty: beginner
tags: isolation, read-committed, snapshots
prerequisites: atomic-abort
safety: writes-data
run-in: tool
sessions: 2
min-version: 16
minutes: 12
revision: 4

## Overview
PostgreSQL's default isolation level is READ COMMITTED, and its rule is per statement, not per
transaction: each statement sees everything committed before that statement started. Two identical
SELECTs in one transaction can therefore return different rows. The earlier
two-sessions-see-different-versions experiment supplies the full Repeatable Read contrast.

## Syntax breakdown
### In plain terms

This experiment asks when a transaction decides what committed data it may see. Read Committed takes
a fresh snapshot for each statement. Two psql sessions let one commit a change between the other
session's two SELECT statements; compare the result with two-sessions-see-different-versions for
the pinned Repeatable Read view.

### What you are learning

- **Read Committed** gives each statement its own view and can reveal a committed change mid-transaction.
- **Snapshots** are visibility rules, not copies of every row; a new transaction gets a new snapshot.

### Piece by piece

- **BEGIN** (SQL transaction command): Starts a transaction using the configured default isolation level.
  - What it does here: Starts Session A's Read Committed comparison.
  - What it gives us: Each later statement may use a new snapshot.
- **default_transaction_isolation** (server/session setting): Supplies an isolation level when BEGIN names none.
  - What it does here: Selects PostgreSQL's default, Read Committed.
  - What it gives us: A's second SELECT sees B's committed +500.
- **current_setting('transaction_isolation')** (SQL configuration function): Returns a named setting as text.
  - What it does here: Reports the active level in each transaction.
  - What it gives us: read committed for the statement-snapshot race.
- **UPDATE ... SET balance = balance + 500** (SQL data change): Creates B's newer row version using server-side arithmetic.
  - What it does here: Commits a change between A's reads.
  - What it gives us: 600 on A's second statement.
- **COMMIT** (SQL transaction command): Publishes changes and ends the transaction snapshot.
  - What it does here: Lets B's update become visible and gives A a fresh snapshot.
  - What it gives us: The boundary after which the transaction ends.
- **Session A / Session B** (independent psql connections): Separate backends with separate snapshots.
  - What it does here: Coordinates a controlled reader/writer interleaving.
  - What it gives us: A can observe B's commit between statements.

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
begin;
select current_setting('transaction_isolation') as level;
select id, balance from iso_accounts where id = 1;

-- Session B
update iso_accounts set balance = balance + 500 where id = 1;

-- Session A
select id, balance from iso_accounts where id = 1;
\echo A is still in the same transaction and already sees the new value
commit;
```

## Expected result
A reads 100, B commits +500, and A's second SELECT inside the very same transaction reads 600.
Read Committed gives a new statement snapshot, not a repeatable transaction view. Compare this with
two-sessions-see-different-versions, where Repeatable Read retains the earlier visible version.

## Systems lens
"Isolation level" determines when a transaction takes its visibility snapshot. Read Committed is
useful when each statement can accept fresh committed data; a request that needs decisions from one
consistent view needs a different contract. The same trade appears in distributed systems between
reading latest state each RPC and pinning one read timestamp for a whole operation.

## Optional variation
After rerunning setup, have B insert account id 3 between two A statements that select all account
ids under Read Committed. Which new id appears in A's second result, and why is that the same
per-statement rule rather than a dirty read?
