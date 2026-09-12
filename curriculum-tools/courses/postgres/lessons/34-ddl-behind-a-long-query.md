# A queued metadata change can delay later readers

slug: ddl-behind-a-long-query
category: locking
difficulty: advanced
tags: locks, relation-locks, ddl, migrations
prerequisites: lock-queue-and-blocking-pids
safety: ddl
run-in: tool
sessions: 3
min-version: 16
minutes: 15
revision: 4

## Overview
Every SELECT takes an AccessShareLock on the tables it reads. ALTER TABLE wants AccessExclusiveLock,
which conflicts with everything - including AccessShareLock. Once an incompatible request is queued, the
waiting ALTER also blocks every reader that arrives after it, even though those readers would not
have conflicted with the query that is actually running. This is why a metadata-only change still needs a bounded acquisition policy.

## Syntax breakdown
### In plain terms

This experiment asks why a harmless-looking SELECT can be delayed by a schema change. A long SELECT
holds a shared table lock; ALTER TABLE requests an exclusive lock and queues; later readers queue
behind that writer even though they would be compatible with the first SELECT. This is head-of-line
blocking: the queued exclusive request makes the whole line wait.

### What you are learning

- **AccessShareLock** protects a table while SELECT reads it.
- **AccessExclusiveLock** conflicts with every table lock and is used by many ALTER TABLE operations.
- **Queued incompatible requests** can make compatible readers wait behind an incompatible request.

### Piece by piece

- **SELECT pg_sleep(8) FROM lk_t WHERE id = 1** (SQL query and sleep function): Reads the table while pausing for eight seconds.
  - What it does here: Keeps A's AccessShareLock held during the inspection.
  - What it gives us: A with wait_event Timeout/PgSleep, showing it is slow rather than lock-blocked.
- **ALTER TABLE ... ADD COLUMN IF NOT EXISTS x int** (DDL statement and idempotent clause): Requests a schema change, creating x only if absent.
  - What it does here: B queues for AccessExclusiveLock behind A.
  - What it gives us: B's pg_locks row with mode AccessExclusiveLock and granted = false.
- **DROP COLUMN IF EXISTS x** (DDL statement and conditional clause)
  - What it is: Removes x only when it exists, avoiding a setup error on reruns.
  - What it does here: Resets the table before and after the experiment.
  - What it gives us: A repeatable lab with no extra column left behind.
- **pg_locks** (system view): Lists held and requested lock records.
  - What it does here: Shows relation, mode, and granted for lk_t.
  - What it gives us: granted = true for A's AccessShareLock and false for B's AccessExclusiveLock.
- **'lk_t'::regclass** (PostgreSQL catalog-name cast): Resolves the table name to its relation OID.
  - What it does here: Filters pg_locks to this table rather than every relation.
  - What it gives us: Only lock rows for lk_t.
- **pg_stat_activity** (system view): Reports each backend's PID and wait state.
  - What it does here: Joins lock rows to the query and wait information.
  - What it gives us: B waiting on Lock/relation and A waiting on Timeout/PgSleep.
- **COMMIT** (SQL transaction command): Ends A's transaction and releases its table lock.
  - What it does here: Lets B's ALTER run, then allows C's queued SELECT to run.
  - What it gives us: rows_now = 5 and x_values = 0 after the column exists.

## Caution
This lesson deliberately queues readers of the disposable lk_t table; finish or roll back the labeled transactions to release them.

## Setup
```sql
create table if not exists lk_t(id int primary key, val text);
truncate lk_t;
insert into lk_t(id, val) select g, 'row ' || g from generate_series(1, 5) g;
alter table lk_t drop column if exists x;
```

## Run
```sql
-- Session A (blocks: an 8-second read holding AccessShareLock on lk_t)
begin;
select pg_sleep(8) from lk_t where id = 1;
-- Session B (blocks until A's transaction ends)
alter table lk_t add column if not exists x int;
-- Session C
select pg_sleep(2);
select a.pid, l.mode, l.granted, a.wait_event_type, a.wait_event, left(a.query, 32) as query
from pg_locks l join pg_stat_activity a using (pid)
where l.relation = 'lk_t'::regclass
order by l.granted desc, a.pid;
-- Session C (blocks: a harmless SELECT, now stuck behind the queued ALTER)
select count(*) from lk_t;
-- Session A
commit;
-- Session C
select count(*) as rows_now, count(x) as x_values from lk_t;
-- Session A
alter table lk_t drop column if exists x;
```

## Expected result
Two seconds in, the join over pg_locks prints exactly two rows for lk_t:
 pid   |        mode         | granted | wait_event_type | wait_event
 <A>   | AccessShareLock     | t       | Timeout         | PgSleep
 <B>   | AccessExclusiveLock | f       | Lock            | relation
A is not waiting for anything (it is just slow); B is queued on the relation lock. C's plain
SELECT, issued next, then hangs too - even though SELECT never conflicts with SELECT - because the
queued incompatible request is ahead of it. You see that as a stopwatch: C's count(*) does not return until
A's 8-second query has finished and A has committed, at which point the ALTER runs and C reports
rows_now = 5, x_values = 0. The 8 seconds is only to keep the experiment inside the 30-second
validation budget - in production the blocking query is whatever your slowest report or forgotten
"idle in transaction" session is, and the readers stay down for exactly that long.

## Systems lens
A queued AccessExclusive request can turn a compatible workload into a serial one: the
system is not slow because of the writer, it is slow because of everything the writer made wait.
Set an acquisition timeout that fits the workload, inspect blockers and retry within a bounded
budget. Readers can still wait while the exclusive request is queued, and successful acquisition
does not bound the DDL execution time; acquisition and execution need separate consideration. The same shape appears in any reader-writer lock, in rolling restarts, and
in any queue where a big item is allowed to hold the head.

## Optional variation
After the core finishes, use this bounded metadata-only change:
-- Session A
begin;
select count(*) from lk_t;
-- Session B (blocks until its acquisition timeout)
set lock_timeout='1s';
alter table lk_t add column bounded_trial int default 0;
-- Session C (may briefly block behind B, then resumes when B times out)
select count(*) from lk_t;
-- Session B: wait for the first ALTER to finish before releasing A.
\echo ddl_acquisition_SQLSTATE :SQLSTATE
-- Session A
commit;
-- Session B
reset lock_timeout;
alter table lk_t add column bounded_trial int default 0;
select count(bounded_trial) as populated from lk_t;
alter table lk_t drop column bounded_trial;

The first ALTER must fail with lock-timeout cancellation while A holds its transaction; the retry
after release succeeds and populated=5. Adding a nonvolatile default avoids a table rewrite here,
but still requires AccessExclusiveLock. C can wait while B is queued; a bounded wait is not zero wait.
For an independent rerun, drop bounded_trial before starting if a previous interrupted run left it.
