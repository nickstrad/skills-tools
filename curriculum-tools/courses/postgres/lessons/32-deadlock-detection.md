# Cause a deadlock and read the detector's report

slug: deadlock-detection
category: locking
difficulty: intermediate
tags: locks, deadlocks
prerequisites: lock-queue-and-blocking-pids
safety: locking
run-in: tool
sessions: 2
min-version: 16
minutes: 15
revision: 4

## Overview
PostgreSQL does not prevent deadlocks; it detects them. A backend that has waited deadlock_timeout
(1 s by default) stops waiting, walks the wait-for graph, and if it finds a cycle it aborts itself
with ERROR: deadlock detected. Build the textbook cycle - A holds row 1 and wants row 2, B holds
row 2 and wants row 1 - and read the DETAIL that names both processes and both statements.

## Syntax breakdown
### In plain terms

This experiment creates a cycle: A holds row 1 and requests row 2 while B holds row 2 and requests
row 1. A deadlock is a wait where nobody can proceed, so PostgreSQL waits briefly, detects the cycle,
and aborts one transaction. The surviving transaction can commit, while the client must retry the
aborted unit of work.

### What you are learning

- **Deadlocks** are cycles in a wait-for graph, not merely long waits.
- **deadlock_timeout** controls when PostgreSQL checks for a cycle; it does not prevent one.
- **40P01** identifies a retryable deadlock victim and the whole transaction must be redone.

### Piece by piece

- **SHOW deadlock_timeout** (SQL inspection command): Reads the server/session deadlock-check delay.
  - What it does here: Establishes the wait threshold before the detector runs.
  - What it gives us: Usually 1s, though the lab's configured value is authoritative.
- **UPDATE lk_t ... WHERE id = 1 or 2** (SQL row update): Takes a row lock while changing a row.
  - What it does here: Gives A row 1 and B row 2, then makes each request the other's row.
  - What it gives us: The two edges needed for a cycle.
- **deadlock_timeout** (server/session setting): Sets how long a lock wait lasts before a deadlock search.
  - What it does here: Determines when a waiting backend checks for a cycle.
  - What it gives us: A roughly one-second delay before ERROR: deadlock detected.
- **ROLLBACK** (SQL transaction command): Aborts the victim and releases its locks.
  - What it does here: Cleans up whichever client recorded ERROR=true after its second UPDATE.
  - What it gives us: No failed transaction left in the session after the experiment.
- **COMMIT** (SQL transaction command): Publishes the surviving transaction and releases its locks.
  - What it does here: Finishes whichever client recorded ERROR=false.
  - What it gives us: Both final rows contain the surviving transaction's values.
- **\set, :ERROR, :SQLSTATE and \if** (psql control flow): Save the last statement's error flag, report its SQLSTATE and choose ROLLBACK or COMMIT in that same client. A backend error releases its transaction locks, allowing the survivor to finish; the explicit rollback then clears the failed client state.

## Caution
One of the two transactions is aborted on purpose. Do not run this against anything but the lab.

## Setup
```sql
create table if not exists lk_t(id int primary key, val text);
truncate lk_t;
insert into lk_t(id, val) select g, 'row ' || g from generate_series(1, 5) g;
```

## Run
```sql
-- Session A
show deadlock_timeout;
begin;
update lk_t set val = 'A took 1' where id = 1;
-- Session B
begin;
update lk_t set val = 'B took 2' where id = 2;
-- Session A (blocks: A wants row 2, which B holds)
update lk_t set val = 'A wants 2' where id = 2;
\set a_failed :ERROR
\echo A update SQLSTATE :SQLSTATE
-- Session B
update lk_t set val = 'B wants 1' where id = 1;
\set b_failed :ERROR
\echo B update SQLSTATE :SQLSTATE
\if :b_failed
rollback;
\else
commit;
\endif
-- Session A
\if :a_failed
rollback;
\else
commit;
\endif
select id, val from lk_t where id in (1, 2) order by id;
```

## Expected result
One second UPDATE receives SQLSTATE40P01 and ERROR: deadlock detected. DETAIL identifies the two
processes and opposing transaction-lock waits; exact PIDs, victim, tuple location and timing vary.
Each client saves its own ERROR boolean immediately after the UPDATE. The failed client rolls back;
the successful client commits. Final rows are either (1,'A took 1'),(2,'A wants 2') or
(1,'B wants 1'),(2,'B took 2'), depending on the victim. They cannot mix both transactions' values.
Compare both SQLSTATE lines and the server's cycle report rather than predicting a fixed victim.

## Systems lens
Detection instead of prevention is a deliberate trade: prevention would need a global lock ordering
or a wait-die scheme that aborts transactions that were never actually in a cycle. The price is
that deadlock is a normal, expected runtime error, so clients need a policy for retrying a known-aborted transaction within a deadline or reporting its failure. The cheap prevention that does work
is consistent acquisition order for all contended resources. Sorting these two row requests removes
this cycle; additional tables, triggers or advisory locks must follow a compatible policy too.

## Optional variation
Rewrite both transactions to touch rows in ascending id order (A: 1 then 2, B: 1 then 2). The
second transaction now simply queues behind the first, and no deadlock is possible. Then try three
sessions in a ring to confirm the detector finds cycles longer than two.
