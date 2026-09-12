# Choose a fresh statement view or a stable transaction view

slug: statement-versus-transaction-snapshot
category: visibility-and-retention
difficulty: intermediate
tags: mvcc, snapshots, isolation
prerequisites: committed-row-visibility
safety: writes-data
run-in: tool
sessions: 2
min-version: 16
minutes: 25
revision: 1

## Overview
Run the same read–writer commit–read schedule twice, changing only the reader's isolation level. Decide whether a multi-query operation needs fresh data at each statement or a view that stays consistent across its reads.

## Syntax breakdown
### In plain terms
A snapshot defines which committed row versions a read can use. Read Committed takes a fresh
snapshot for each statement. Repeatable Read keeps the snapshot established by its first ordinary
query for the rest of that transaction. Merely typing BEGIN is not when this snapshot is established.
Another session can commit meanwhile; the stable reader continues using an older version.

### Mechanism map

```text
Same schedule: A reads --> B commits an update --> A reads again

READ COMMITTED:   [snapshot 1]                 [snapshot 2]
REPEATABLE READ:  [snapshot 1 ----------------------------]
                  first SELECT                 same view

After A ends its transaction, its next read takes a fresh view.
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
- Two SELECTs inside one Read Committed transaction can see different committed values.
- Repeatable Read keeps this read-only transaction's view fixed until it ends. Stable does not mean
  latest, and it does not mean every multi-row application invariant is protected from other writers.

### Piece by piece
- **SET lock_timeout = '3s'** bounds accidental lock waits during setup; **SET
  default_transaction_isolation** makes standalone reset/update statements use a known default.
- **DROP TABLE IF EXISTS / CREATE TABLE / INSERT** prepare pe_snapshot with balance 100. The
  between-round UPDATE restores 100, giving both rounds the same initial data.
- **BEGIN ISOLATION LEVEL READ COMMITTED / REPEATABLE READ** choose the reader's snapshot lifetime
  for that one transaction. A's first SELECT establishes the starting observation.
- **B's UPDATE without BEGIN** is an automatically committed statement. Finish that block before
  returning to A; both rounds test visibility after a successful writer commit.
- **AS rc_before, rc_after, rr_before, rr_after, fresh_after_end** name the five cells to compare.
  **COMMIT** ends each read transaction; the final standalone SELECT gets a fresh view.

## Setup
```sql
set lock_timeout = '3s';
set default_transaction_isolation = 'read committed';
drop table if exists pe_snapshot;
create table pe_snapshot (id int primary key, balance int not null);
insert into pe_snapshot values (1, 100);
```

## Run
```sql
-- Session A: first round, Read Committed. Leave the reader transaction open.
begin isolation level read committed;
select balance as rc_before from pe_snapshot where id = 1;

-- Session B: commit a change between A's reads.
set default_transaction_isolation = 'read committed';
set lock_timeout = '3s';
update pe_snapshot set balance = 120 where id = 1;

-- Session A: read again inside the SAME transaction, then end it.
select balance as rc_after from pe_snapshot where id = 1;
commit;

-- Session B: restore the starting value before the second round.
update pe_snapshot set balance = 100 where id = 1;

-- Session A: second round, Repeatable Read. The SELECT establishes its snapshot.
begin isolation level repeatable read;
select balance as rr_before from pe_snapshot where id = 1;

-- Session B: make the same committed change.
update pe_snapshot set balance = 120 where id = 1;

-- Session A: read in the stable view, then finish and take a fresh view.
select balance as rr_after from pe_snapshot where id = 1;
commit;
select balance as fresh_after_end from pe_snapshot where id = 1;
drop table pe_snapshot;
```

## Expected result
Read Committed reports rc_before = 100 and rc_after = 120 within one transaction.
Repeatable Read reports rr_before = 100 and rr_after = 100 despite B committing 120.
After A commits, fresh_after_end = 120. Both runs allowed B's update to finish.

The controlled difference was A's isolation level. BEGIN alone did not give Read Committed a
stable transaction-wide view. In the second round, an unchanged value did not mean B's commit
failed: the final fresh read proves it was accepted. The final DROP removes the experiment table.

## Systems lens
For a report whose separate reads must reconcile, a stable snapshot can be useful. For a request that should observe recent commits at each statement, fresh views may be appropriate. Both have a freshness tradeoff; neither demonstration establishes serializable execution. Holding the stable view also creates a retention obligation, which the next lesson measures.
