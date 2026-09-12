# Write skew: two transactions that are each correct and jointly wrong

slug: write-skew
category: isolation
difficulty: advanced
tags: isolation, repeatable-read, snapshot-isolation, write-skew
prerequisites: repeatable-read-blocks-then-fails
safety: writes-data
run-in: tool
sessions: 2
min-version: 16
minutes: 15
revision: 4

## Overview
Snapshot isolation only detects conflicts on rows you wrote. If two transactions read the same set
of rows and each writes a different row of that set, nothing conflicts and both commit -- yet the
invariant they both checked is now false. The textbook case: at least one doctor must stay on
call, and both on-call doctors take themselves off at once.

## Syntax breakdown
### In plain terms

This experiment asks whether two individually sensible decisions can break a shared rule. Each
doctor sees two people on call and turns off a different row; both commits succeed because their
writes do not overlap. An invariant is a condition that should always hold, here “at least one row
have on_call = true.”

### What you are learning

- **Write skew** happens when transactions update different rows after reading a shared condition.
- **Repeatable Read** protects each snapshot but does not enforce arbitrary multi-row predicates.
- **Stronger locking or materialized constraints** are needed for rules spanning several rows.

### Piece by piece

- **BEGIN ISOLATION LEVEL REPEATABLE READ** (SQL transaction command): Starts each session with a stable snapshot.
  - What it does here: Lets A and B inspect the same initial roster.
  - What it gives us: Both sessions read on_call_now = 2.
- **SELECT count(*) ... WHERE on_call** (SQL aggregate with a filter): Counts rows whose boolean on_call value is true.
  - What it does here: Checks the invariant before either write.
  - What it gives us: The unsafe but apparently valid decision that one doctor may leave while two are on call.
- **UPDATE iso_oncall SET on_call = false WHERE doctor = ...** (SQL row update): Changes one named doctor's status.
  - What it does here: A updates alice and B updates bob, with disjoint write sets.
  - What it gives us: No blocking and no 40001 under Repeatable Read.
- **COMMIT** (SQL transaction command): Publishes a transaction's changes and ends its snapshot.
  - What it does here: Allows both incompatible decisions to become visible.
  - What it gives us: alice = f, bob = f, carol = f, and on_call_after = 0, violating the at-least-one rule.
- **ORDER BY doctor** (SQL ordering clause): Sorts the roster by doctor name.
  - What it does here: Makes each final row easy to inspect.
  - What it gives us: Stable evidence of which rows changed.

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
begin isolation level repeatable read;
select count(*) as on_call_now from iso_oncall where on_call;

-- Session B
begin isolation level repeatable read;
select count(*) as on_call_now from iso_oncall where on_call;

-- Session A
update iso_oncall set on_call = false where doctor = 'alice';

-- Session B
update iso_oncall set on_call = false where doctor = 'bob';

-- Session A
commit;

-- Session B
commit;

-- Session A
select doctor, on_call from iso_oncall order by doctor;
select count(*) as on_call_after from iso_oncall where on_call;
```

## Expected result
Both sessions read on_call_now = 2 and each concludes it is safe to go off call. Both UPDATEs touch
different rows, so neither blocks and neither raises 40001: both COMMITs succeed. The final table
shows alice = f, bob = f, carol = f and on_call_after = 0. The invariant is broken with no error
anywhere in the logs.

## Systems lens
This is why "snapshot isolation" is not "serializable". No serial order of these two transactions
produces this state: whichever ran second would have read a count of 1. The anomaly is invisible to
write-conflict detection because the conflict is between one transaction's writes and the other's
reads. Any system that validates only overlapping writes -- most optimistic CAS schemes, most
document stores' transactions -- has exactly this hole, and the usual application-level fix is to
make the read set into a write (lock the whole set, or materialize the invariant in a row you all
update).

## Optional variation
After rerunning setup, use this fresh READ COMMITTED schedule to protect the existing doctor rows:

-- Session A
begin;
select doctor, on_call from iso_oncall order by doctor for update;
select count(*) as on_call_before from iso_oncall where on_call;
update iso_oncall set on_call = false where doctor = 'alice';

-- Session B (the row read blocks until A commits)
begin;
select doctor, on_call from iso_oncall order by doctor for update;

-- Session A
commit;

-- Session B
select count(*) as on_call_after_wait from iso_oncall where on_call;
-- Keep bob on call because the count is now 1.
commit;

Which result proves B made its decision after A committed? These row locks cover these existing
doctor rows; they do not protect an absent overlapping booking row.
