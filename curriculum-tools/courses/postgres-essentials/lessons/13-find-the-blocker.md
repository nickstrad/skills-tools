# Find the transaction controlling a wait

slug: find-the-blocker
category: concurrency-control
difficulty: intermediate
tags: locks, wait-events, observability, transactions
prerequisites: durable-request-identity
safety: locking
run-in: tool
sessions: 2
min-version: 16
minutes: 25
revision: 1

## Overview
Hold a row change open in one session and watch another session wait for that row. Query PostgreSQL's live activity from the holder to prove the wait, follow the blocker PID edge to the responsible transaction, then commit the holder and observe the waiting update finish.

## Syntax breakdown
### In plain terms
A blocker is a database session whose unfinished transaction prevents another session from making
progress. PostgreSQL reports both the kind of wait and the process ID, or PID, of each blocker.
Use PostgreSQL's PID edge to identify which transaction controls B's progress; application names
label the clients but do not establish that blocking relationship.

### Mechanism map

```text
A holds a row lock                 B wants the same row

BEGIN -> UPDATE -> transaction open    UPDATE ----- waits -----+
       |                                                   |
       +-> pg_blocking_pids(B pid) = [A pid]               |
COMMIT ----------------------------------------------------+
                                                 B completes
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
- A waiting UPDATE exposes a Lock wait event. The event says where B is paused; it does not by
  itself identify the transaction that B needs.
- pg_blocking_pids follows PostgreSQL's actual lock queue and returns the blocking backend PID.
  application_name makes the actors readable, but names are labels and need not be unique.
- xact_start shows how long the blocker's current transaction has existed. Its state may be idle in
  transaction between commands, but A is active while it runs the diagnostic query.
- A wait is released by finishing the blocking transaction. Cancellation is unnecessary here.

### Piece by piece
- **SET application_name** (configuration setting) labels each connection in pg_stat_activity as
  pe_blocker_a or pe_blocker_b. It helps find the intended sessions; PID relationships remain the
  evidence for who blocks whom.
- **SET lock_timeout / SET statement_timeout** (configuration settings) bound accidental waits.
  lock_timeout applies while acquiring a lock, while statement_timeout bounds the whole statement.
- **pg_backend_pid()** (information function) returns the current connection's PID. The a_pid and
  b_pid columns let you recognize each actor without assuming a particular number.
- **BEGIN / COMMIT** (transaction commands) keep A's UPDATE and row lock open, then publish the
  change and release the lock. B's blocked statement can continue only after that release.
- **pg_stat_activity** (catalog view) gives one row per backend. wait_event_type = Lock and a
  non-null wait_event show B is waiting; state and xact_start describe each matched backend.
- **pg_blocking_pids(waiting.pid)** (information function) returns the PID array PostgreSQL
  identifies as blocking B. **unnest** expands it so it can join to the blocker activity row.
- **CROSS JOIN LATERAL** (SQL join clause) evaluates pg_blocking_pids for each waiting row and
  exposes its expanded blocker_pid values to the following join. Table functions such as unnest
  allow that reference even without the keyword; LATERAL makes the relationship explicit.
- **clock_timestamp() - blocker.xact_start** (time expression) measures the blocker transaction's
  age at display time. Exact timing and PID values vary; a positive interval is expected.
- **RESET / DROP TABLE** restore session settings and remove the fixture after both transactions
  finish. Run cleanup in A after B has committed.

## Caution
B is meant to pause at its UPDATE. Switch promptly to A for the diagnostic and COMMIT. The supplied 60-second lock timeout bounds an abandoned wait; if it fires unexpectedly, roll back both sessions, rerun setup in A, and begin again.

## Setup
```sql
set application_name = 'pe_blocker_a';
set lock_timeout = '60s';
set statement_timeout = '90s';
drop table if exists pe_blocker_account;
create table pe_blocker_account (id int primary key, balance int not null);
insert into pe_blocker_account values (1, 100);
```

## Run
```sql
-- Session A: change the row and deliberately leave the transaction open.
select pg_backend_pid() as a_pid;
begin;
update pe_blocker_account set balance = balance + 10 where id = 1;

-- Session B (blocks): label this connection, then request the same row.
set application_name = 'pe_blocker_b';
set lock_timeout = '60s';
set statement_timeout = '90s';
select pg_backend_pid() as b_pid;
begin;
update pe_blocker_account set balance = balance + 20 where id = 1;

-- Session A: while B waits, follow B's actual blocker PID edge.
select waiting.application_name as waiting_name,
       waiting.pid as waiting_pid,
       waiting.wait_event_type,
       waiting.wait_event,
       blocker.application_name as blocker_name,
       blocker.pid as blocker_pid,
       blocker.state as blocker_state,
       blocker.xact_start,
       clock_timestamp() - blocker.xact_start as blocker_xact_age
from pg_stat_activity as waiting
cross join lateral unnest(pg_blocking_pids(waiting.pid)) as edge(blocker_pid)
join pg_stat_activity as blocker on blocker.pid = edge.blocker_pid
where waiting.application_name = 'pe_blocker_b';

-- Session A: finish the controlling transaction and release B.
commit;

-- Session B: the UPDATE has now completed. Commit its change.
commit;
reset lock_timeout;
reset statement_timeout;
reset application_name;

-- Session A: verify both committed changes, then clean up.
select balance as final_balance from pe_blocker_account where id = 1;
reset lock_timeout;
reset statement_timeout;
reset application_name;
drop table pe_blocker_account;
```

## Expected result
A's UPDATE reports UPDATE 1. B's UPDATE prints no result while A remains open. The diagnostic
returns one edge with waiting_name = pe_blocker_b, wait_event_type = Lock, blocker_name =
pe_blocker_a, B's waiting_pid and A's blocker_pid. wait_event names the specific lock wait.
blocker_xact_age is positive and xact_start is populated. Exact PIDs, event detail, states and
timing vary; A can be active because it is executing this diagnostic.

After A commits, B reports UPDATE 1 and can commit. The independent final query reports
final_balance = 130. The fixture is dropped and both sessions restore their settings.

## Systems lens
Start diagnosis with the waiting backend, then follow PostgreSQL's blocker edges to the transaction that controls progress. A recognizable application_name helps ownership, while PID edges, transaction start time and current state supply the database evidence. A long transaction can block work while doing no current query; an active diagnostic can also make the holder appear active. Ending the right transaction releases the wait, but production cancellation or termination needs an ownership and impact decision this bounded lesson does not make.

## Optional variation
Optional, after the core time budget: compare the surviving balance when the holder rolls back. Run these self-contained labelled blocks:

```sql
-- Session A: recreate the independent fixture.
set application_name = 'pe_blocker_a';
set lock_timeout = '60s';
set statement_timeout = '90s';
drop table if exists pe_blocker_account;
create table pe_blocker_account (id int primary key, balance int not null);
insert into pe_blocker_account values (1, 100);

-- Session A: change the row and deliberately leave the transaction open.
select pg_backend_pid() as a_pid;
begin;
update pe_blocker_account set balance = balance + 10 where id = 1;

-- Session B (blocks): label this connection, then request the same row.
set application_name = 'pe_blocker_b';
set lock_timeout = '60s';
set statement_timeout = '90s';
select pg_backend_pid() as b_pid;
begin;
update pe_blocker_account set balance = balance + 20 where id = 1;

-- Session A: while B waits, follow B's actual blocker PID edge.
select waiting.application_name as waiting_name,
       waiting.pid as waiting_pid,
       waiting.wait_event_type,
       waiting.wait_event,
       blocker.application_name as blocker_name,
       blocker.pid as blocker_pid,
       blocker.state as blocker_state,
       blocker.xact_start,
       clock_timestamp() - blocker.xact_start as blocker_xact_age
from pg_stat_activity as waiting
cross join lateral unnest(pg_blocking_pids(waiting.pid)) as edge(blocker_pid)
join pg_stat_activity as blocker on blocker.pid = edge.blocker_pid
where waiting.application_name = 'pe_blocker_b';

-- Session A: roll back the controlling transaction and release B.
rollback;

-- Session B: the UPDATE has now completed. Commit its change.
commit;
reset lock_timeout;
reset statement_timeout;
reset application_name;

-- Session A: verify only B committed, then clean up.
select balance as rollback_holder_balance from pe_blocker_account where id = 1;
reset lock_timeout;
reset statement_timeout;
reset application_name;
drop table pe_blocker_account;
```

The same PID edge explains the wait. After A rolls back, B commits and rollback_holder_balance is 120; A's tentative +10 disappeared. Both sessions restore their settings and the table is removed.
