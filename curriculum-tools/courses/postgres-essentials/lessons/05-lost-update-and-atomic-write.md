# Lose an update, then keep arithmetic in the database

slug: lost-update-and-atomic-write
category: concurrent-writes
difficulty: intermediate
tags: isolation, read-committed, lost-update, concurrency
prerequisites: reusable-space-versus-file-size
safety: locking
run-in: tool
sessions: 2
min-version: 16
minutes: 25
revision: 1

## Overview
Make two requests read the same balance and prepare different replacement values. Commit both replacements and watch one intended increment disappear, then repeat with arithmetic inside UPDATE while the statements deliberately overlap. This separates a client-side read-modify-write race from a single-row operation PostgreSQL can serialize safely.

## Syntax breakdown
### In plain terms
A lost update occurs when two requests read the same old value, calculate replacements separately,
and both successfully write: the later replacement can erase the earlier change. An atomic UPDATE
keeps the arithmetic with the row. If another transaction is changing that row, PostgreSQL waits,
then applies the arithmetic to the committed current version rather than the stale one.

Before the second round, predict whether B will leave 120 or 130. You do not need to record an
answer; the pause and the final labelled value will test the model directly.

### Mechanism map

```text
Two requests both intend to add to 100

Client-side replacement
A reads 100 -> computes 110 -> writes 110 -> COMMIT
B reads 100 ----------------------------> writes 120 -> COMMIT
                                                    final: 120
                                          A's intended +10 is lost

Database arithmetic
A: UPDATE +10 holds row -----------------> COMMIT
B: UPDATE +20 waits ---------------------> uses 110 -> final: 130
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
- A Read Committed transaction does not make a value saved by an application refresh itself.
  Writing that stale replacement can silently discard another committed change.
- **SET balance = balance + amount** expresses a single-row change from the database's current
  value. A competing UPDATE waits for the row and then rechecks the updated row before applying it.
- Atomic arithmetic fits changes that are a direct function of one current row. It does not by
  itself protect a decision made from earlier reads or an invariant spanning several rows.

### Piece by piece
- **SET lock_timeout = '60s' / SET statement_timeout = '90s'** bound lock acquisition and total
  statement time respectively. The longer limits leave time to switch from B's waiting terminal
  to A and commit. A timeout is not the intended result; roll back both sessions and restart.
- **DROP TABLE IF EXISTS / CREATE TABLE / INSERT** reset only pe_atomic_write to balance 100.
  Setup runs once in A while neither session has an open transaction.
- **BEGIN ISOLATION LEVEL READ COMMITTED / COMMIT** start a transaction with fresh statement
  snapshots, then accept its changes and release its row locks. Both stale readers start before
  either writes; in the second round, A holds its write open until B is waiting.
- **SELECT balance AS ..., balance + amount AS ... \gset** returns the stored value and a
  calculated replacement. **\gset** saves the one-row result as psql variables named by the
  column aliases, instead of printing a result table. A saves 100 and 110; B saves 100 and 120.
  These are separate client values, like the values held by two application requests.
- **\echo ... :a_read / :a_replacement / :b_read / :b_replacement** prints those saved values.
  psql substitutes each colon-prefixed variable in its own terminal. The two printed lines show
  that both calculations started from 100, and the variables stay unchanged after another commit.
- **UPDATE ... SET balance = :a_replacement / :b_replacement RETURNING** sends the saved client
  value as a whole replacement balance. **RETURNING** prints the row version just written. A
  writes 110 and commits; B then writes its still-saved 120. Compare after_stale_replacement with
  the intended combined increase of 30.
- **UPDATE ... SET balance = balance + 10 / + 20 RETURNING** computes from the row PostgreSQL
  actually updates. A writes 110 and stays open; B waits. After A commits, Read Committed rechecks
  the updated row and applies B's arithmetic to 110. This recheck concerns the conflicting row,
  not a restart of the entire statement with a new snapshot.
- **RESET lock_timeout / RESET statement_timeout** restore the configured timeout defaults once
  each transaction ends. **DROP TABLE pe_atomic_write** removes this lesson's table.

## Caution
The second atomic UPDATE is supposed to wait briefly. Run its whole Session B block, confirm that the prompt does not return, then switch to A and commit. The 60-second lock timeout and 90-second statement timeout leave time to switch terminals but prevent an abandoned wait from running indefinitely. If interrupted, ROLLBACK in both sessions before rerunning setup.

## Setup
```sql
set lock_timeout = '60s';
set statement_timeout = '90s';
drop table if exists pe_atomic_write;
create table pe_atomic_write (id int primary key, balance int not null);
insert into pe_atomic_write values (1, 100);
```

## Run
```sql
-- Session A: read 100 and prepare the supplied replacement 110. Leave A open.
begin isolation level read committed;
select balance as a_read, balance + 10 as a_replacement
from pe_atomic_write where id = 1 \gset
\echo A read :a_read and computed replacement :a_replacement

-- Session B: read the same 100 and prepare the supplied replacement 120. Leave B open.
set lock_timeout = '60s';
set statement_timeout = '90s';
begin isolation level read committed;
select balance as b_read, balance + 20 as b_replacement
from pe_atomic_write where id = 1 \gset
\echo B read :b_read and computed replacement :b_replacement

-- Session A: write the replacement calculated from A's earlier read, then commit.
update pe_atomic_write set balance = :a_replacement where id = 1
returning balance as a_replacement_written;
commit;

-- Session B: write B's stale replacement after A commits, then commit.
update pe_atomic_write set balance = :b_replacement where id = 1
returning balance as b_replacement_written;
commit;

-- Session A: observe the lost increment, then reset for atomic arithmetic.
select balance as after_stale_replacement from pe_atomic_write where id = 1;
update pe_atomic_write set balance = 100 where id = 1;
begin isolation level read committed;
update pe_atomic_write set balance = balance + 10 where id = 1
returning balance as a_atomic_written;

-- Session B (blocks until A commits; switch to A while this waits)
begin isolation level read committed;
update pe_atomic_write set balance = balance + 20 where id = 1
returning balance as b_atomic_written;

-- Session A: release the row after B has started waiting.
commit;

-- Session B: the UPDATE has resumed with A's committed row. Finish B.
commit;
reset lock_timeout;
reset statement_timeout;

-- Session A: inspect the combined arithmetic, restore settings and clean up.
select balance as after_atomic_arithmetic from pe_atomic_write where id = 1;
reset lock_timeout;
reset statement_timeout;
drop table pe_atomic_write;
```

## Expected result
The first round prints that A read 100 and computed 110, while B also read 100 and computed 120.
Both replacement writes succeed: A returns 110, B returns 120, and after_stale_replacement = 120.
The intended increases totalled 30, but the final increase is only 20; B's stale replacement erased
A's committed increment without raising an error.

After the reset, A's atomic UPDATE returns 110 and remains uncommitted. B's atomic UPDATE does not
return while A holds the row; switch to A and COMMIT. B then returns 130, and
after_atomic_arithmetic = 130. This proves B applied +20 to A's committed 110 rather than to the
original 100. No timeout error is expected. Both transactions finish, both sessions restore their
timeouts, and the final DROP removes pe_atomic_write.

## Systems lens
Move a single-row mutation into the system that serializes access to that row when the new value is purely a function of its current value: counters, debits already authorized elsewhere and bounded accumulators are common shapes. A client read followed by a replacement write has a concurrency gap even if both statements use transactions. When the operation must first decide whether a change is valid, atomic arithmetic may be too weak; the next lesson keeps that read and decision inside a short row-locked critical section.
