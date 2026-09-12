# Bound the wait: lock_timeout, NOWAIT, and SKIP LOCKED

slug: lock-timeout-and-nowait
category: locking
difficulty: intermediate
tags: locks, timeouts, skip-locked
prerequisites: lock-queue-and-blocking-pids
safety: locking
run-in: tool
sessions: 2
min-version: 16
minutes: 12
revision: 4

## Overview
By default a blocked statement waits forever. Three mechanisms bound that wait, and they fail in
three different ways: lock_timeout cancels the statement after a deadline, NOWAIT errors out
immediately, and SKIP LOCKED silently returns the rows nobody else holds. Trigger all three against
the same locked row.

## Syntax breakdown
### In plain terms

This experiment compares three ways to handle a busy row: wait only briefly, fail immediately, or
choose other unlocked rows. lock_timeout limits time spent waiting; NOWAIT refuses instantly; SKIP
LOCKED omits busy rows. These choices matter because an unbounded wait can consume a connection even
when the application has useful work elsewhere.

### What you are learning

- **lock_timeout** limits lock acquisition time and returns an error when the limit is reached.
- **NOWAIT** fails immediately, while **SKIP LOCKED** succeeds with a partial result.
- **statement_timeout** measures total statement runtime, not just time waiting for a lock.

### Piece by piece

- **SET lock_timeout = '500ms'** (session setting command): Configures the maximum lock wait for this connection.
  - What it does here: Limits B's UPDATE against A's locked row.
  - What it gives us: “canceling statement due to lock timeout” after about half a second.
- **RESET lock_timeout** (session setting command): Restores the setting's default value.
  - What it does here: Removes the artificial timeout before testing NOWAIT and SKIP LOCKED.
  - What it gives us: Those clauses, rather than the setting, determine the result.
- **SELECT ... FOR UPDATE** (SQL row-lock clause): Reads and locks id 3.
  - What it does here: A holds the row that all B variants test.
  - What it gives us: A controlled conflict.
- **FOR UPDATE NOWAIT** (SQL locking option): Requests a row lock without waiting.
  - What it does here: B immediately tries locked id 3, then retries after A commits.
  - What it gives us: A lock-not-available error first and id = 3 after release.
- **FOR UPDATE SKIP LOCKED** (SQL locking option): Ignores rows whose locks cannot be acquired immediately.
  - What it does here: Reads all rows while silently omitting id 3.
  - What it gives us: ids 1, 2, 4, 5; the plain count remains 5 because no rows were deleted.
- **SET/RESET statement_timeout** (session setting in the challenge): Controls total runtime of a statement.
  - What it does here: Contrasts a runtime timeout with the lock-only timeout.
  - What it gives us: A slow query can be killed even when it is not waiting on a lock.
- **COMMIT** (SQL transaction command): Releases A's row lock.
  - What it does here: Lets B's final NOWAIT query succeed.
  - What it gives us: id = 3 is available after the commit.

## Setup
```sql
create table if not exists lk_t(id int primary key, val text);
truncate lk_t;
insert into lk_t(id, val) select g, 'row ' || g from generate_series(1, 5) g;
```

## Run
```sql
-- Session A
begin;
select id, val from lk_t where id = 3 for update;
-- Session B
set lock_timeout = '500ms';
update lk_t set val = 'B' where id = 3;
-- Session B
reset lock_timeout;
select id from lk_t where id = 3 for update nowait;
-- Session B
select id, val from lk_t order by id for update skip locked;
-- Session B
select count(*) as visible_rows from lk_t;
-- Session A
commit;
-- Session B
select id from lk_t where id = 3 for update nowait;
```

## Expected result
The first UPDATE returns after roughly half a second with
ERROR:  canceling statement due to lock timeout
CONTEXT:  while updating tuple (0,3) in relation "lk_t"
The NOWAIT SELECT fails instantly with
ERROR:  could not obtain lock on row in relation "lk_t"
SKIP LOCKED succeeds and returns rows 1, 2, 4, 5 - row 3 is silently missing, which is why the plain
count(*) still reports 5: SKIP LOCKED changes which rows you may claim, not which rows exist. After
A commits, the same NOWAIT statement succeeds and returns id = 3.

## Systems lens
These are the three answers to "what do I do when a resource is busy": wait with a deadline, fail
fast, or take different work. Migrations use lock_timeout and bounded retries to limit acquisition delay; job queues want SKIP LOCKED so workers steal work instead of queueing. The
dangerous default is the unbounded wait, because it converts contention into a connection leak -
every blocked backend still occupies a slot.

## Optional variation
In a fresh autocommit session, run:
set statement_timeout = '100ms';
select pg_sleep(1);
\echo timed_statement_SQLSTATE :SQLSTATE
reset statement_timeout;

Expect cancellation57014 for the deliberately slow statement. A fast SKIP LOCKED query may finish
within the same deadline. SKIP LOCKED avoids waiting for candidate row locks; it does not bypass
all relation locks or exempt execution from statement_timeout.
