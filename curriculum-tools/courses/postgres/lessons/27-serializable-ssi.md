# SERIALIZABLE: predicate locks, rw-dependencies, and a commit that fails

slug: serializable-ssi
category: isolation
difficulty: advanced
tags: isolation, serializable, predicate-locks, serialization-failure
prerequisites: write-skew
safety: writes-data
run-in: tool
sessions: 2
min-version: 16
minutes: 18
revision: 4

## Overview
Run the exact same on-call race under SERIALIZABLE. PostgreSQL's SSI tracks what each transaction
read, as SIReadLock entries in pg_locks, and aborts one of the pair when the read/write
dependencies between them cannot correspond to any serial order. You will see the predicate locks
while the transactions are open, and the second COMMIT fail.

## Syntax breakdown
### In plain terms

This repeats write skew with PostgreSQL's strongest transaction isolation. A predicate is a
condition such as “rows where on_call is true”; SERIALIZABLE remembers that A and B read it, then
aborts one when their writes cannot fit any serial order. The predicate record is not a blocking
lock, so the conflict appears as a commit-time error.

### What you are learning

- **Serializable Snapshot Isolation (SSI)** detects dangerous read/write dependency cycles.
- **SIReadLock** entries describe what a transaction read at relation, page, or tuple granularity.
- **COMMIT can fail**, so it belongs inside the retryable operation.

### Piece by piece

- **BEGIN ISOLATION LEVEL SERIALIZABLE** (SQL transaction command): Requests serializable results while retaining nonblocking reads.
  - What it does here: Runs both on-call decisions under SSI tracking.
  - What it gives us: One transaction can be canceled as a pivot at commit.
- **SELECT count(*) ... WHERE on_call** (SQL aggregate and predicate): Reads the true on-call set.
  - What it does here: Creates the read dependency SSI remembers.
  - What it gives us: on_call_now = 2 and predicate locks.
- **UPDATE ... WHERE doctor = ...** (SQL row update): Writes one different row in each session.
  - What it does here: Creates opposing read/write dependencies without row blocking.
  - What it gives us: The dangerous structure SSI must resolve.
- **pg_locks** (system view): Lists held and requested locks and lock-like entries.
  - What it does here: Exposes SSI's predicate-read records.
  - What it gives us: locktype, relation, page, and tuple, revealing tracking granularity.
- **mode = 'SIReadLock'** (pg_locks filter): Selects predicate records, not ordinary blocking locks.
  - What it does here: Limits the observation to dependencies from the count query.
  - What it gives us: Relation/page records for each backend on the tiny table.
- **COMMIT** (SQL transaction command): Attempts to publish changes and complete SSI validation.
  - What it does here: A succeeds; B is canceled as a pivot.
  - What it gives us: SQLSTATE 40001 and the read/write-dependencies error.
- **\echo B commit returned SQLSTATE :SQLSTATE** (psql command): Prints the code after COMMIT fails.
  - What it does here: Makes the commit-time failure explicit.
  - What it gives us: 40001, the signal to retry the whole transaction.

## Caution
Under SERIALIZABLE a transaction can fail at COMMIT even when every statement in it succeeded. Never
treat COMMIT as an operation that cannot fail.

## Setup
```sql
create table if not exists iso_oncall (
  doctor text primary key,
  on_call boolean not null
);
truncate iso_oncall;
insert into iso_oncall (doctor, on_call) values ('alice', true), ('bob', true), ('carol', false);
```

## Run
```sql
-- Session A
begin isolation level serializable;
select count(*) as on_call_now from iso_oncall where on_call;
update iso_oncall set on_call = false where doctor = 'alice';

-- Session B
begin isolation level serializable;
select count(*) as on_call_now from iso_oncall where on_call;
update iso_oncall set on_call = false where doctor = 'bob';

-- Session A
select locktype, mode, relation::regclass::text as rel, page, tuple
from pg_locks where mode = 'SIReadLock' order by locktype, page, tuple;
commit;

-- Session B
commit;
\echo B commit returned SQLSTATE :SQLSTATE

-- Session A
select doctor, on_call from iso_oncall order by doctor;
select count(*) as on_call_after from iso_oncall where on_call;
```

## Expected result
While both transactions are open, pg_locks shows four SIReadLock rows, two per backend: a relation
level predicate lock on iso_oncall (the count scanned the whole tiny table) and a page level one on
iso_oncall_pkey. Predicate locks are records of what was read; they never block anyone.
A's COMMIT succeeds. B's COMMIT fails with
  ERROR:  could not serialize access due to read/write dependencies among transactions
  DETAIL:  Reason code: Canceled on identification as a pivot, during commit attempt.
  HINT:  The transaction might succeed if retried.
and psql echoes SQLSTATE 40001. B's update is gone: alice = f, bob = t, carol = f, and
on_call_after = 1. The invariant survives because one transaction was thrown away.

## Systems lens
SSI keeps snapshot isolation's cheap reads (no shared locks, readers never block writers) and adds
a detector for the one structure that snapshot isolation gets wrong: a transaction that is a pivot
with an incoming and an outgoing read-write dependency. The cost is aborts that can appear at commit
time. SSI already preserves the safety of committed results when an application reports a 40001;
retry policy is a separate liveness decision for callers that need eventual completion.

## Optional variation
After rerunning setup, use the same fresh READ COMMITTED ordered row-lock schedule from write-skew:
select the actual iso_oncall rows FOR UPDATE, count them only after the locks are held, let A turn
alice off call and commit, then let B count again before deciding whether bob may leave. Compare its
blocking handoff with SSI's nonblocking reads and abort. This lock schedule protects existing doctor
rows only; it does not claim to protect an absent booking that another transaction could insert.
