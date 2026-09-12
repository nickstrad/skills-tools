# Cause a deadlock and explain the cycle

slug: deadlock-cycle
category: concurrency-control
difficulty: intermediate
tags: deadlocks, locks, sqlstate, transaction-retry
prerequisites: find-the-blocker
safety: locking
run-in: tool
sessions: 2
min-version: 16
minutes: 25
revision: 1

## Overview
Make two complete transaction attempts acquire the same two rows in opposite order. Observe PostgreSQL detect the resulting wait cycle, abort one attempt with SQLSTATE 40P01, and allow the other to finish. Then prevent the cycle by choosing one lock order.

## Syntax breakdown
### In plain terms
A deadlock is a cycle of transactions that are each waiting for another in the same cycle. Waiting
longer cannot solve it, so PostgreSQL aborts one transaction. Before running, predict whether the
server promises that A or B will be chosen.

### Mechanism map

```text
A holds row 1 ---- wants row 2
     ^                    |
     |                    v
B wants row 1 <---- holds row 2

PostgreSQL breaks the cycle: one whole attempt gets 40P01 and rolls back.
The survivor acquires both rows and commits; either session may be the victim.
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
- Opposite lock order can create a cycle even when every individual UPDATE is ordinary.
- SQLSTATE 40P01 classifies the chosen transaction's complete attempt as failed. PostgreSQL may
  choose either participant, so correct handling cannot depend on a fixed victim.
- Aborting one transaction releases every lock from that attempt. The survivor then completes and
  commits both changes, leaving exactly one attempt's effects.
- A consistent row order prevents this cycle. Contention may still make one transaction wait.

### Piece by piece
- **SET application_name** labels the actors for observation. It does not affect detection or
  choose the victim.
- **SET lock_timeout / SET statement_timeout** bound abandoned work. Their values exceed the
  detector's response window; 55P03 or 57014 is unexpected here.
- **BEGIN** starts each complete attempt. A first increments row 1; B first increments row 2.
  Neither increment is durable, and each transaction keeps its row lock.
- **UPDATE ... WHERE id = 1 / id = 2** requests the other transaction's row on the second step.
  Enter B's request first so it waits, then enter A's request to close the cycle.
- **\echo ... :SQLSTATE** (psql command and variable) prints the five-character status from the
  immediately preceding SQL command. One second_update value is 40P01 and the other is 00000.
- **\set VERBOSITY terse / default** (psql commands) stabilize the expected error line, then
  restore normal error detail in both sessions.
- **COMMIT** publishes the survivor's increments. In the transaction PostgreSQL aborted, COMMIT
  reports ROLLBACK because the whole attempt has already failed; both sessions then finish.
- **array_agg(value ORDER BY id)** (aggregate with ordering) produces final_values. A healthy core
  result is {10,10} or {1,1}, proving one complete attempt survived rather than a mixed result.
- **RESET / DROP TABLE** restore settings and remove the fixture.

## Caution
The deadlock error is expected only on one of the two second UPDATE statements. Enter B's second UPDATE, switch to A while B waits, and enter A's second UPDATE. Do not wait for B to return first. The 30-second lock and 45-second statement bounds leave time for PostgreSQL's detector; if another error occurs, roll back both sessions and restart from setup.

## Setup
```sql
set application_name = 'pe_deadlock_a';
set lock_timeout = '30s';
set statement_timeout = '45s';
\set VERBOSITY terse
drop table if exists pe_deadlock_item;
create table pe_deadlock_item (id int primary key, value int not null);
insert into pe_deadlock_item values (1, 0), (2, 0);
```

## Run
```sql
-- Session A: attempt A locks row 1 first.
begin;
update pe_deadlock_item set value = value + 10 where id = 1;

-- Session B: attempt B locks row 2 first.
set application_name = 'pe_deadlock_b';
set lock_timeout = '30s';
set statement_timeout = '45s';
\set VERBOSITY terse
begin;
update pe_deadlock_item set value = value + 1 where id = 2;

-- Session B (blocks): request A's row. Switch to A without waiting for output.
update pe_deadlock_item set value = value + 1 where id = 1;
\echo b_second_update_sqlstate :SQLSTATE

-- Session A: request B's row, closing the cycle. Capture its result immediately.
update pe_deadlock_item set value = value + 10 where id = 2;
\echo a_second_update_sqlstate :SQLSTATE

-- Session A: finish. This commits the survivor or ends the already-aborted attempt.
commit;
\echo a_finish_sqlstate :SQLSTATE
\set VERBOSITY default

-- Session B: its blocked command has now returned. Finish it too.
commit;
\echo b_finish_sqlstate :SQLSTATE
\set VERBOSITY default
reset lock_timeout;
reset statement_timeout;
reset application_name;

-- Session A: prove one complete attempt survived, then clean up.
select array_agg(value order by id) as final_values,
       sum(value) as total_committed_increment
from pe_deadlock_item;
reset lock_timeout;
reset statement_timeout;
reset application_name;
drop table pe_deadlock_item;
```

## Expected result
B's second UPDATE waits. After A requests row 2, PostgreSQL reports “deadlock detected” in exactly
one session. The SQLSTATE printed immediately after the victim's second UPDATE is 40P01; the
survivor's second_update_sqlstate is 00000. Either A or B may be the victim.

The victim's finish ends with ROLLBACK and the survivor commits. Both finish SQLSTATE values are
normally 00000 because COMMIT on the already-aborted transaction performs the rollback. The final
query reports either final_values = {10,10} with total_committed_increment = 20, or {1,1} with a
total of 2. The distinct amounts identify which complete attempt survived and reject a mixed
partial result. No 55P03, 57014, or other SQL error is expected.

## Systems lens
Deadlock detection restores progress by sacrificing an attempt, not by preserving every statement that ran before the cycle. Treat 40P01 as retryable only when the whole transaction can safely start again and the retry policy is bounded. A stable resource order removes this cycle and is usually the first prevention rule. It can still queue callers, and larger transactions can contain less obvious cycles.

## Optional variation
Optional consistent-order comparison. Run these labelled blocks with the same terminal switching as the core:

```sql
-- Session A: create the independent fixture and lock row 1.
set application_name = 'pe_deadlock_a';
set lock_timeout = '30s';
set statement_timeout = '45s';
drop table if exists pe_deadlock_item;
create table pe_deadlock_item (id int primary key, value int not null);
insert into pe_deadlock_item values (1, 0), (2, 0);
begin;
update pe_deadlock_item set value = value + 10 where id = 1;

-- Session B (blocks): request row 1 first.
set application_name = 'pe_deadlock_b';
set lock_timeout = '30s';
set statement_timeout = '45s';
begin;
update pe_deadlock_item set value = value + 1 where id = 1;
\echo b_first_sqlstate :SQLSTATE

-- Session A: take row 2 in the same order and commit, releasing B.
update pe_deadlock_item set value = value + 10 where id = 2;
commit;

-- Session B: after its first UPDATE returns, take row 2 and finish.
update pe_deadlock_item set value = value + 1 where id = 2;
\echo b_second_sqlstate :SQLSTATE
commit;
reset lock_timeout;
reset statement_timeout;
reset application_name;

-- Session A: verify and clean up.
select array_agg(value order by id) as ordered_final_values from pe_deadlock_item;
reset lock_timeout;
reset statement_timeout;
reset application_name;
drop table pe_deadlock_item;
```

B prints 00000 twice and ordered_final_values is {11,11}; no 40P01 occurs. The wait remains, but the shared row order leaves no cycle.
