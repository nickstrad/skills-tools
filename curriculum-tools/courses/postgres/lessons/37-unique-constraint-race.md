# Two inserts, one key: where uniqueness is serialized

slug: unique-constraint-race
category: locking
difficulty: advanced
tags: locks, row-locks, btree, unique-constraints
prerequisites: row-locks-are-in-the-tuple
safety: writes-data
run-in: tool
sessions: 2
min-version: 16
minutes: 15
revision: 4

## Overview
A unique index cannot decide anything until it knows whether the conflicting insert commits. So the
second inserter of the same key does not get an error and does not succeed - it waits on the first
inserter's transaction id, exactly like a row lock, and only then learns its fate. Watch the wait,
then the error, then repeat with ON CONFLICT DO NOTHING to see the same wait produce a different
outcome.

## Syntax breakdown
### In plain terms

This experiment asks how a unique constraint behaves when two sessions insert the same key at once.
The index cannot know whether the first insert will commit, so the second insert waits for that
transaction's decision. After commit it either reports duplicate key or, with ON CONFLICT DO
NOTHING, safely inserts zero rows.

### What you are learning

- **Unique indexes** serialize competing inserts at the index entry.
- **Transaction-ID waits** delay the second insert until the first transaction commits or rolls back.
- **ON CONFLICT DO NOTHING** turns a duplicate into an explicit no-op instead of an error.

### Piece by piece

- **lk_uniq(k int primary key, who text)** (table and primary-key constraint): Creates a unique index on k and records the writer.
  - What it does here: Provides the key whose duplicate insert will race.
  - What it gives us: A clean table and a uniqueness invariant.
- **INSERT INTO lk_uniq VALUES (1, 'A')** (SQL insert): Adds A's key inside an uncommitted transaction.
  - What it does here: Creates the in-progress index entry B must check.
  - What it gives us: A row that exists for A but is not yet committed for other transactions.
- **pg_backend_pid()** (SQL function): Returns the connection's backend process ID.
  - What it does here: Labels the two competing sessions.
  - What it gives us: a_pid and b_pid for activity and lock inspection.
- **pg_sleep(1)** (SQL function): Pauses A so B's wait remains visible.
  - What it does here: Creates time to inspect the waiting insert.
  - What it gives us: B remains active on Lock/transactionid.
- **pg_stat_activity** (system view): Lists backend state and wait event.
  - What it does here: Finds B's blocked insert.
  - What it gives us: wait_event_type = Lock and wait_event = transactionid.
- **pg_locks WHERE locktype = 'transactionid'** (system view and filter): Shows locks on transaction IDs.
  - What it does here: Exposes B's ShareLock request on A's xid.
  - What it gives us: B's granted = false request alongside each backend's granted ExclusiveLock.
- **COMMIT / ROLLBACK** (SQL transaction commands): Publish or discard A's candidate row and release its xid lock.
  - What they do here: A commits key 1, then rolls back B; A commits key 2 in the second round.
  - What they give us: A duplicate-key error in round one and a conflict no-op in round two.
- **INSERT ... ON CONFLICT DO NOTHING** (SQL conflict clause): Suppresses a uniqueness conflict without changing the existing row.
  - What it does here: B retries key 2 while A's insert is still uncommitted.
  - What it gives us: INSERT 0 0 after A commits and exactly one row for key 2.
- **ORDER BY k** (SQL ordering clause): Sorts the final key list.
  - What it does here: Makes the two winning A rows easy to compare.
  - What it gives us: (1, A) and (2, A), with no B row.

## Setup
```sql
create table if not exists lk_uniq(k int primary key, who text);
truncate lk_uniq;
```

## Run
```sql
-- Session A
begin;
insert into lk_uniq values (1, 'A');
select pg_backend_pid() as a_pid;
-- Session B
begin;
select pg_backend_pid() as b_pid;
-- Session B (blocks until A commits)
insert into lk_uniq values (1, 'B');
-- Session A
select pg_sleep(1);
select pid, state, wait_event_type, wait_event, left(query, 32) as query
from pg_stat_activity where wait_event_type = 'Lock';
select pid, locktype, mode, granted from pg_locks
where locktype = 'transactionid' order by granted desc;
-- Session A
commit;
-- Session B
rollback;
-- Session A
begin;
insert into lk_uniq values (2, 'A');
-- Session B (blocks until A commits again)
insert into lk_uniq values (2, 'B') on conflict do nothing;
-- Session A
select pg_sleep(1);
commit;
-- Session B
select k, who from lk_uniq order by k;
```

## Expected result
B's first INSERT blocks: pg_stat_activity shows it as state = active on Lock/transactionid, and
pg_locks lists three rows - each backend's ExclusiveLock on its own xid, granted = t, plus B's
ShareLock request on A's xid, granted = f. Nothing is decided yet. When A commits, B immediately
fails with
ERROR:  duplicate key value violates unique constraint "lk_uniq_pkey"
DETAIL:  Key (k)=(1) already exists.
The second round waits the same way, but ON CONFLICT DO NOTHING turns the loss into a no-op: B's
statement reports INSERT 0 0 (no error) and the final table holds exactly two rows, (1,A) and
(2,A) - B never got a row in. If A had
rolled back instead, B's insert would have succeeded - the waiter's outcome is decided entirely by
the other transaction's commit record.

## Systems lens
Uniqueness is a global invariant, so somewhere it has to be serialized; PostgreSQL serializes it at
the index entry and pays for it with a wait that lasts as long as the other transaction. That is the
same reason "check then insert" is never safe in application code and why distributed systems that
want unique keys either route a key to a single owner (partitioning) or give up and use identifiers
that cannot collide (UUIDs, per-node sequences). Note also that ON CONFLICT DO NOTHING does not tell
you which happened, so read-back after the insert is part of the pattern.

## Optional variation
Replace DO NOTHING with ON CONFLICT (k) DO UPDATE SET who = excluded.who and rerun: B now wins and
the row says 'B'. Then try the same race where A rolls back instead of committing, and confirm B's
plain INSERT succeeds - the error is not about the key, it is about the other transaction's fate.
