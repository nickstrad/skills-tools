# An uncommitted write is private to its transaction

slug: committed-row-visibility
category: visibility-and-retention
difficulty: intermediate
tags: mvcc, isolation
safety: writes-data
run-in: tool
sessions: 2
min-version: 16
minutes: 25
revision: 1

## Overview
Change one account balance while another connection reads it. Observe the writer's own view, a different reader's view, and what commit or rollback makes visible. This is the starting point for reasoning about concurrent application requests.

## Syntax breakdown
### In plain terms
You already saw that UPDATE creates a new row version. PostgreSQL's multiversion concurrency
control (MVCC) chooses which version a read may use. A transaction sees its own writes, but another
transaction cannot see those writes before they commit. An ordinary SELECT can read the older
committed version while the writer is still open; it does not need to wait for this row update.

### Mechanism map

```text
One logical row, different visible versions

Session A: BEGIN --> UPDATE --> own SELECT --> COMMIT
                       |                        |
                 private version          accepted version
                       |                        |
Session B:       older committed row       fresh read can see it

ROLLBACK abandons A's change instead of publishing it.
```

### Terminals and cleanup
Open 2 experiment terminals, labelled Session A and Session B and connect each psql session with:
```sh
psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off
```
The flags skip personal startup settings, select the learner socket, port, role and database, and
keep output in the terminal. Finish any earlier transaction with **ROLLBACK** before setup. Run setup once in A, keep both connections open, and follow the Session A/B labels. If B is intentionally waiting, switch to A and run its next block.
If you reach the fifteen-minute core limit or get stuck, ROLLBACK in the open sessions and follow
the lesson's exact cleanup command so its named pe_* table and session settings are removed.
### What you are learning
- A transaction groups work between BEGIN and COMMIT or ROLLBACK. COMMIT accepts its changes;
  ROLLBACK discards their logical effects.
- Under Read Committed, a SELECT gets a snapshot of committed data as of that statement's start,
  plus its transaction's own changes. “Snapshot” means visibility rules, not a copy of the table.

### Piece by piece
- **SET default_transaction_isolation = 'read committed'** establishes the isolation level for
  subsequent transactions in each session, so a previous lesson's settings cannot change this one.
- **SET lock_timeout = '3s'** bounds time waiting for a conflicting lock. If it fires, finish an
  earlier open transaction before retrying setup; that error is not the intended result.
- **DROP TABLE IF EXISTS / CREATE TABLE / INSERT** reset only pe_visibility with one balance of 100.
  Setup runs once, in A, while neither session has an open transaction.
- **BEGIN / COMMIT / ROLLBACK** start, accept or abandon the writer's transaction. psql normally
  commits each standalone statement automatically, so B's separate SELECTs get fresh views.
- **AS a_private, b_before_commit, b_after_commit, a_aborted, b_after_rollback** label the output
  cells to compare. They are column aliases, not saved variables. Keep the A/B blocks in order.

## Setup
```sql
set lock_timeout = '3s';

set default_transaction_isolation = 'read committed';

drop table if exists pe_visibility;

create table pe_visibility (id int primary key, balance int not null);

insert into
  pe_visibility
values
  (1, 100);
```

## Run
```sql
-- Session A: write, then inspect your own uncommitted version. Leave A open.
begin;

update pe_visibility
set
  balance = 120
where
  id = 1;

select
  balance as a_private
from
  pe_visibility
where
  id = 1;

-- Session B: read from a separate connection while A is still open.
set default_transaction_isolation = 'read committed';

set lock_timeout = '3s';

select
  balance as b_before_commit
from
  pe_visibility
where
  id = 1;

-- Session A: make the first change committed.
commit;

-- Session B: take a fresh statement view after A's commit.
select
  balance as b_after_commit
from
  pe_visibility
where
  id = 1;

-- Session A: try a different value, but abandon this transaction.
begin;

update pe_visibility
set
  balance = 999
where
  id = 1;

select
  balance as a_aborted
from
  pe_visibility
where
  id = 1;

rollback;

-- Session B: check which value survived, then remove this lesson's table.
select
  balance as b_after_rollback
from
  pe_visibility
where
  id = 1;

drop table pe_visibility;
```

## Expected result
The labelled cells are a_private = 120, b_before_commit = 100, b_after_commit = 120,
a_aborted = 999 and b_after_rollback = 120. B's first SELECT returns while A is still open.

A's ability to read 999 did not mean another request could read it, nor that it would survive
ROLLBACK. The final SELECT proves the committed value remained 120. All transactions are finished
and the last command removes the experiment table.

## Systems lens
Commit changes which versions later statements may see; it does not cause every existing reader to adopt a new view. This run used fresh Read Committed statements. The next lesson tests an already-established stable snapshot. Ordinary SELECT behavior here does not imply that competing writes or DDL never wait.
