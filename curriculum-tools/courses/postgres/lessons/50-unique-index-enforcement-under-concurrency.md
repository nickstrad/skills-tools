# A partial unique index enforces one active owner row

slug: unique-index-enforcement-under-concurrency
category: indexes
difficulty: advanced
tags: unique-constraints, btree, optimistic-concurrency, concurrency, index-access-methods
prerequisites: unique-constraint-race, partial-and-covering-indexes
safety: writes-data
run-in: tool
sessions: 2
min-version: 16
minutes: 20
revision: 4

## Overview
Two clients can both observe no active owner before either commits. A partial unique index
arbitrates their inserts and enforces at most one active row for a nonnull resource, while allowing
released history. Exercise that boundary and an atomic handover; it provides neither expiry nor
protection against a stale writer at an external service.

## Syntax breakdown
### In plain terms

Two clients can both observe that a resource is free, so a check followed by an insert is not enough
to enforce one owner. A partial unique B-tree puts the rule inside the database's insert path: only
rows marked active participate, and one wins while the other waits for its transaction's outcome.
This lesson also demonstrates a safe release-and-claim handover in one transaction.

### What you are learning

- **Unique-index enforcement:** The index, not a separate check query, serializes competing claims.
- **Partial uniqueness:** A predicate limits the rule to active rows while allowing many released rows.
- **Transaction-ID wait:** A conflicting uncommitted entry makes the second insert wait before it errors.
- **Identity sequences:** Generated IDs are not rolled back, so failed attempts leave gaps.

### Piece by piece

- **GENERATED ALWAYS AS IDENTITY** (table column definition)
  - What it is: It obtains each id from a sequence managed by PostgreSQL.
  - What it does here: It labels rows without the sessions choosing IDs.
  - What it gives us: A visible hole after the blocked insert loses, because sequence allocation is not transactional.
- **CREATE UNIQUE INDEX ... WHERE state = 'active'** (partial unique-index DDL)
  - What it is: It enforces uniqueness only for rows satisfying the predicate.
  - What it does here: It permits at most one active row per resource.
  - What it gives us: The ix_uniq_one_active index that decides the race.
- **pg_constraint.conindid and pg_index.indisunique/indisprimary** (catalog columns)
  - What they are: conindid links a declared constraint to its backing index; the pg_index flags describe index properties.
  - What they do here: The catalog queries contrast the primary-key constraint with the bare partial unique index.
  - What they give us: Constraint name/type, backing index, uniqueness, primary status, and predicate.
- **pg_get_expr(indpred, indrelid)** (catalog expression function)
  - What it is: It reconstructs a stored index predicate as readable SQL.
  - What it does here: It prints state = active for the partial index.
  - What it gives us: The exact subset in which uniqueness applies.
- **BEGIN, COMMIT, and ROLLBACK** (transaction commands)
  - What they are: They start, publish, or abandon a transaction's changes.
  - What they do here: A holds the winning insert, B waits, then B rolls back; later release and claim are one transaction.
  - What they give us: The unblock event and an atomic handover with no two active owners.
- **pg_stat_activity** (activity view)
  - What it is: A live row for each backend and its wait state.
  - What it does here: Session A finds B waiting on the unique insert.
  - What it gives us: wait_event_type = Lock and wait_event = transactionid.
- **pg_stat_user_indexes** (index usage view)
  - What it is: Per-table index scan and tuple counters.
  - What it does here: It reports search counters, which can lag; enforcing uniqueness itself does not increment idx_scan.
  - What it gives us: idx_scan, idx_tup_read, and idx_tup_fetch for each index.

- **NOT NULL and CHECK** (schema boundaries)
  - What they are: Constraints requiring a resource and one of the two supported state values.
  - What they do here: They prevent a null resource or misspelled state from bypassing the intended ownership domain.
  - What they give us: The partial uniqueness rule applies to well-defined active resource rows.
- **DO with50 bounded polls, pg_blocking_pids and statement_timeout** (wait evidence)
  - What they are: A repeated condition check, a blocker lookup and a15-second statement deadline.
  - What they do here: A waits up to5 seconds to observe the specifically labelled B backend blocked by A; otherwise the trial fails.
  - What they give us: An observed conflict before commit rather than an assumed race based on sleeping.

## Setup
```sql
drop table if exists ix_uniq;
create table ix_uniq(id int generated always as identity primary key,
                     resource text not null, owner text not null, state text not null
                     check (state in ('active','released')));
create unique index ix_uniq_one_active on ix_uniq(resource) where state = 'active';
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-a', 'released');
```

## Run
```sql
-- Session A
select c.conname, c.contype, c.conindid::regclass as backing_index
from pg_constraint c where c.conrelid = 'ix_uniq'::regclass;
select indexrelid::regclass as index, indisunique, indisprimary,
       pg_get_expr(indpred, indrelid) as predicate
from pg_index where indrelid = 'ix_uniq'::regclass order by 1;
-- Session A
begin;
select count(*) as active_now from ix_uniq where resource = 'shard-1' and state = 'active';
-- Session B
set application_name='pgpivot_unique_b';
set statement_timeout='15s';
begin;
select count(*) as active_now from ix_uniq where resource = 'shard-1' and state = 'active';
-- Session A
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-a', 'active');
-- Session B (blocks until A commits)
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-b', 'active');
-- Session A
do $$
declare ready boolean := false;
begin
  for attempt in 1..50 loop
    perform pg_stat_clear_snapshot();
    select exists(select 1 from pg_stat_activity where datname=current_database()
      and application_name='pgpivot_unique_b' and pg_backend_pid()=any(pg_blocking_pids(pid)))
    into ready;
    exit when ready;
    perform pg_sleep(0.1);
  end loop;
  if not ready then raise exception 'competing insert wait not observed'; end if;
end $$;
select pid, state, wait_event_type, wait_event from pg_stat_activity
where datname=current_database() and application_name='pgpivot_unique_b';
-- Session A
commit;
-- Session B
rollback;
select id, resource, owner, state from ix_uniq order by id;
-- Session A
-- The rule only covers the indexed subset: any number of non-active rows may coexist.
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-b', 'released');
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-c', 'released');
select state, count(*) from ix_uniq where resource = 'shard-1' group by state order by state;
-- Session A
-- Handing ownership over is one transaction: release, then claim.
begin;
update ix_uniq set state = 'released' where resource = 'shard-1' and state = 'active';
insert into ix_uniq(resource, owner, state) values ('shard-1', 'node-b', 'active');
commit;
select id, owner, state from ix_uniq where resource = 'shard-1' and state = 'active';
-- Session A
select indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
from pg_stat_user_indexes where relname = 'ix_uniq' order by indexrelname;
select count(*) as active_count, min(owner) as owner from ix_uniq
where resource='shard-1' and state='active';
-- Session B
reset statement_timeout;
reset application_name;
```

## Expected result
The catalog distinguishes the primary-key constraint from the bare partial unique index. Both
clients initially read active_now=0, but B's conflicting active insert waits for A's transaction.
The bounded observation must identify that wait. After A commits, B receives23505 for
ix_uniq_one_active and rolls back. A failed identity allocation may leave a gap; IDs are not a
row count or a gapless commit ordering.

Released rows for the same resource coexist because they do not participate in the active
predicate. The handover transaction replaces the active row as one committed state transition:
other readers see the old or new committed state, while inside the transaction the two statements
still execute separately. Final active_count=1 and owner=node-b.

Uniqueness enforcement is not counted as an ordinary index scan. The table is tiny and planner
choices/statistics publication vary, so idx_scan need not be2 or any fixed value. A zero scan count
cannot justify dropping an index that enforces a correctness invariant.

## Systems lens
Move a race-sensitive invariant into the atomic write path when the database can express it.
The domain here is one database's resource key, with nonnull fields and a constrained state value.
A paused process may still issue external writes after ownership changes; that boundary requires
an enforcement protocol at the external resource, taught later. Neither a uniqueness constraint nor
an allocated sequence value alone establishes distributed authority.

## Optional variation
Add another released row for the same resource and then attempt two active rows. Use the unique
index to reject the second active insert, and finish with one active row plus retained history.
Do not add expiry or external-fencing claims to this local invariant.
