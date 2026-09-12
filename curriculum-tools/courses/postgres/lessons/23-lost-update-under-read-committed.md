# Lose an update, then stop losing it three ways

slug: lost-update-under-read-committed
category: isolation
difficulty: intermediate
tags: isolation, read-committed, lost-update, row-locks
prerequisites: read-committed-sees-each-statement
safety: locking
run-in: tool
sessions: 2
min-version: 16
minutes: 20
revision: 4

## Overview
The classic bug: two sessions read a balance, both subtract 10 in application code, and one of the
decrements disappears. You will cause it, then fix it twice -- with an atomic read-modify-write in
SQL, and with SELECT ... FOR UPDATE -- and watch the second session block and recompute in both
fixes.

## Syntax breakdown
### In plain terms

This experiment reproduces a lost update: two workers read 100, both calculate 90 outside the
database, and the second write silently overwrites the first. Then it compares two repairs that keep
the calculation next to the row or lock the row before reading it. A row lock means conflicting
writers must wait for the current transaction to finish.

### What you are learning

- **Read-modify-write races** lose updates when a value is read and written in separate steps.
- **Atomic server-side updates** calculate from the row version protected by the UPDATE.
- **FOR UPDATE** locks the row during the read, forcing a competing worker to wait and reread.

### Piece by piece

- **\gset** (psql command): Stores columns from a one-row query result as psql variables.
  - What it does here: Saves the selected balance as :balance, simulating an application variable.
  - What it gives us: Both naive sessions echo 100; a lock-aware read later echoes the current value.
- **\echo :balance** (psql command): Prints text after psql substitutes the variable value.
  - What it does here: Makes each session's read visible before it writes.
  - What it gives us: Evidence that both naive sessions started from 100.
- **UPDATE ... SET balance = :balance - 10** (SQL data change): Writes arithmetic based on a client value.
  - What it does here: Deliberately creates the lost-update bug.
  - What it gives us: after_naive = 90 instead of 80.
- **UPDATE ... SET balance = balance - 10** (server-side data change): Computes from the row while taking its update lock.
  - What it does here: Makes B wait, then apply its decrement to A's committed 90.
  - What it gives us: after_atomic_update = 80.
- **SELECT ... FOR UPDATE** (SQL locking clause): Reads matching rows and takes a lock suitable for a later update.
  - What it does here: Causes B's SELECT to block until A commits.
  - What it gives us: B wakes and reads 90, proving the read was serialized.
- **COMMIT** (SQL transaction command): Publishes changes and releases transaction-held row locks.
  - What it does here: Wakes the waiting UPDATE or SELECT in Session B.
  - What it gives us: A deterministic handoff between workers.
- **FOR NO KEY UPDATE** (alternative row-lock clause in the challenge): Uses a weaker mode that still conflicts with the competing non-key writer.
  - What it does here: Lets you test which reader/writer combinations can coexist.
  - What it gives us: A direct observation of the lock compatibility rules.

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
update iso_accounts set balance = 100 where id = 1;
begin;
select balance from iso_accounts where id = 1 \gset
\echo A read balance :balance

-- Session B
begin;
select balance from iso_accounts where id = 1 \gset
\echo B read balance :balance

-- Session A
update iso_accounts set balance = :balance - 10 where id = 1;
commit;

-- Session B
update iso_accounts set balance = :balance - 10 where id = 1;
commit;

-- Session A
select balance as after_naive from iso_accounts where id = 1;

-- Fix 1: let the server do the arithmetic on the row it locks.
-- Session A
update iso_accounts set balance = 100 where id = 1;
begin;
update iso_accounts set balance = balance - 10 where id = 1;

-- Session B (blocks until A commits)
begin;
update iso_accounts set balance = balance - 10 where id = 1;

-- Session A
commit;

-- Session B
commit;

-- Session A
select balance as after_atomic_update from iso_accounts where id = 1;

-- Fix 2: take the row lock at read time, so the read itself is serialized.
-- Session A
update iso_accounts set balance = 100 where id = 1;
begin;
select balance from iso_accounts where id = 1 for update \gset
\echo A locked and read :balance

-- Session B (blocks until A commits)
begin;
select balance from iso_accounts where id = 1 for update \gset

-- Session A
update iso_accounts set balance = :balance - 10 where id = 1;
commit;

-- Session B
\echo B woke up and read :balance
update iso_accounts set balance = :balance - 10 where id = 1;
commit;

-- Session A
select balance as after_for_update from iso_accounts where id = 1;
```

## Expected result
Naive read-modify-write: both sessions echo "read balance 100", both write 90, and after_naive is
90. Ten units vanished and no error was raised anywhere.
Fix 1: B's UPDATE waits on A's row lock, then re-reads the committed row and subtracts from 90, so
after_atomic_update is 80.
Fix 2: B's SELECT ... FOR UPDATE is the statement that waits; when A commits, B echoes "woke up and
read 90" and after_for_update is 80.

## Systems lens
Read committed does not detect write-write races -- it only serializes the instant of the write. A
lost update is a compare-and-swap you never performed. The three shapes here are the three shapes
everywhere: do the mutation atomically in the store (a server-side increment, a CAS), take a lock
that covers read and write, or use an isolation level that aborts you (next lesson). Anything that
reads in one round trip and writes in another needs one of them.

## Optional variation
Rerun the supplied setup and locking stage with FOR NO KEY UPDATE in place of both FOR UPDATE
reads. Keep the same commit ordering and compare the final balance. The weaker mode is sufficient
for these non-key changes; it still serializes the two competing writers.
