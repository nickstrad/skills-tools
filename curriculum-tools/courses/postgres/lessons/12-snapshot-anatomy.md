# A snapshot is xmin, xmax, and the in-progress list

slug: snapshot-anatomy
category: mvcc
difficulty: intermediate
tags: 
prerequisites: xids-and-the-transaction-counter
safety: writes-data
run-in: tool
sessions: 2
min-version: 16
minutes: 14
revision: 2

## Overview
Visibility is decided by a snapshot, and a snapshot is a tiny data structure you can print. It is
three things: a low water mark (every xid below it has finished), a high water mark (every xid at or
above it started after us and is invisible), and the list of xids in between that were still running
when the snapshot was taken. You will watch a second session's xid appear in that in-progress list
and then vanish from it when it commits.

## Syntax breakdown
### In plain terms

This experiment opens one writer and lets another session take snapshots around it. You will see the
writer's xid listed as in progress, making its changed row invisible, and then see a fresh snapshot
after commit where that xid is no longer listed and the new balance is visible. A snapshot is the
reader's timestamp-like view of which transactions are finished, active, or from the future.

### What you are learning

- **xmin and xmax:** xmin is the lower settled boundary; xmax is the first xid that is too new for
  this snapshot to see.
- **In-progress list:** Xids between those boundaries that were still running need an explicit
  visibility check.
- **Statement snapshots:** READ COMMITTED takes a new snapshot for each statement, so two SELECTs
  can see different committed states.

### Piece by piece

- **pg_current_snapshot()** (snapshot inspection function)
  - What it is: It returns a snapshot in **xmin:xmax:xip_list** form, where xip means xids in progress.
  - What it does here: It is called before B starts, while B runs, and after B commits.
  - What it gives us: The same shape with B's xid appearing in the middle list only while B is open.
- **BEGIN** (transaction control)
  - What it is: It opens a transaction whose statements can hold locks and snapshots.
  - What it does here: B keeps its UPDATE uncommitted while A observes it; A also wraps a short
    write so B is no longer the newest xid.
  - What it gives us: The concurrency needed for a non-empty in-progress list.
- **UPDATE ... WHERE** (row-versioning write)
  - What it is: It changes the selected account row and creates a new version under the writer's xid.
  - What it does here: B changes Carol by 10; A changes Alice by 1 and commits to advance the xid
    boundaries.
  - What it gives us: A known row whose new version remains invisible to A while B is uncommitted.
- **pg_current_xact_id()** (xid inspection function)
  - What it is: It returns B's current xid8, allocating it if necessary.
  - What it does here: B records the xid that should later appear in the snapshot's xip list.
  - What it gives us: The number to match against **in_progress**.
- **pg_snapshot_xmin() and pg_snapshot_xmax()** (snapshot accessor functions)
  - What they are: They extract the lower and upper xid boundaries from a snapshot value.
  - What they do here: They are applied to a freshly captured snapshot in one SELECT.
  - What they give us: Named **snap_xmin** and **snap_xmax** columns that explain the printed snapshot.
- **pg_snapshot_xip()** (set-returning snapshot accessor)
  - What it is: It emits one xid per transaction listed as in progress.
  - What it does here: A scalar subquery feeds its rows to **array_agg**.
  - What it gives us: An **in_progress** array containing B's xid while B is open and empty after commit.
- **array_agg(...)** (aggregate function)
  - What it is: It collects multiple rows into one SQL array.
  - What it does here: It keeps the set-returning xip output beside xmin and xmax in one result row.
  - What it gives us: A compact list that is easy to compare with B's xid.
- **SELECT ... WHERE id = 3** (visibility observation)
  - What it is: A normal filtered read of Carol's row.
  - What it does here: It runs once while B is in progress and once after B commits.
  - What it gives us: Balance 100 first and 110 later, tying snapshot metadata to row visibility.
- **COMMIT** (transaction control)
  - What it is: It finishes a transaction and publishes its changes.
  - What it does here: B's commit removes its xid from future snapshots and makes Carol's new version
    visible.
  - What it gives us: The before/after comparison for the snapshot experiment.
- **REPEATABLE READ** (transaction isolation level, in the challenge)
  - What it is: An isolation mode that keeps one snapshot for the entire transaction.
  - What it does here: Repeated **pg_current_snapshot()** calls retain the same text despite another
    transaction committing.
  - What it gives us: Evidence of a stable view.
- **READ COMMITTED** (transaction isolation level, in the challenge)
  - What it is: PostgreSQL's default mode, which takes a snapshot for each statement.
  - What it does here: Repeating the same query allows xmax to advance after another commit.
  - What it gives us: A direct contrast with REPEATABLE READ.

## Setup
```sql
create table if not exists mv_accounts (
  id int primary key,
  owner text not null,
  balance int not null
);
truncate mv_accounts;
insert into mv_accounts (id, owner, balance)
values (1, 'alice', 100), (2, 'bob', 100), (3, 'carol', 100);
```

## Run
```sql
-- Session A
select pg_current_snapshot() as snapshot_before_b;

-- Session B
begin;
update mv_accounts set balance = balance + 10 where id = 3;
select pg_current_xact_id() as b_xid;

-- Session A
-- one more transaction starts and finishes after B, so B is no longer the newest xid
begin;
update mv_accounts set balance = balance + 1 where id = 1;
commit;
select pg_current_snapshot() as snapshot_while_b_runs;
select pg_snapshot_xmin(pg_current_snapshot()) as snap_xmin,
       pg_snapshot_xmax(pg_current_snapshot()) as snap_xmax,
       (select array_agg(x) from pg_snapshot_xip(pg_current_snapshot()) as x) as in_progress;
select id, balance from mv_accounts where id = 3;

-- Session B
commit;

-- Session A
select pg_current_snapshot() as snapshot_after_b_commits;
select id, balance from mv_accounts where id = 3;
```

## Expected result
Before B starts, A's snapshot has an empty in-progress list and xmin = xmax, for example
3121:3121:. B then takes xid 3123 and stays open, and A's throwaway transaction (3124) starts and
commits after it, so A's next snapshot is
  snapshot_while_b_runs
  -----------------------
   3123:3125:3123
that is snap_xmin = 3123, snap_xmax = 3125, in_progress = {3123}. B is the only xid in the middle
band, so it is the only one that needs checking; its row is invisible to A, which still reads
balance 100 for carol.
After B commits, A's next statement takes a fresh snapshot, 3126:3126: with an empty in-progress
list, and reads balance 110. B's xid did not move; it simply fell below the new xmin.
Note why A's own commit was needed: xmax is "last completed xid + 1", so while B held the newest
xid it sat at or above xmax and never made it into the list at all.

## Systems lens
This is the general shape of a consistent read in any versioned store: a pair of watermarks plus an
exception list. Everything below xmin is settled, everything at or above xmax is from the future,
and the finite list in the middle is the only thing that needs per-item checking. The same structure
shows up as version vectors, read timestamps with a "pending" set, and GC horizons. Note the cost
model: the list is O(concurrent write transactions), which is why thousands of long-running writers
make snapshot taking itself expensive.

## Optional variation
Run "begin isolation level repeatable read; select pg_current_snapshot();" twice in the same
transaction with a write committing in between: the snapshot text does not change. Then do the same
under read committed and watch xmax advance on every statement.
