# An old snapshot turns ordinary churn into retained history

slug: xmin-horizon-blocks-cleanup
category: mvcc
difficulty: advanced
tags: 
prerequisites: commit-visibility-and-clog
safety: locking
run-in: tool
sessions: 2
min-version: 16
minutes: 20
revision: 4

## Overview
Dead versions can only be reclaimed once no snapshot could still need them. This experiment runs the
same bounded, separately committed update churn twice. In the baseline, VACUUM reclaims old versions.
In the pinned run, Session B holds a repeatable-read snapshot, so the same cleanup must retain them.
You will match VACUUM's removable cutoff to B's exact backend_xmin, release B, and measure that
logical rows never changed while dead versions became reusable space.

## Syntax breakdown
### In plain terms

The baseline and pinned cases run the same separately committed updates. In one case VACUUM can
remove old versions immediately; in the other, B's old snapshot means it must retain them. The row
count stays fixed, so the changed dead-tuple and free-space measurements isolate reclamation.

### What you are learning

- **Snapshot horizon:** An old snapshot can make a logically dead version still unsafe to remove.
- **Matched experiment:** A no-reader baseline separates normal page pruning from retention caused by B.
- **Reusable space:** Plain VACUUM frees bytes inside the table; it does not normally shrink its file.

### Piece by piece

- **CREATE TABLE, ALTER TABLE, TRUNCATE, and INSERT** (setup commands)
  - What they are: They create the disposable table, disable only its autovacuum, reset it, and load
    ten padded rows.
  - What they do here: They give both cases identical logical starting data.
  - What they give us: A fair comparison without cleanup from an earlier run.
- **format, generate_series, and \gexec** (psql-generated SQL)
  - What they are: generate_series emits 100 rows, format creates one UPDATE string per row, and
    \gexec executes each generated string as a separate statement.
  - What they do here: They create independently committed churn instead of one giant transaction.
  - What they give us: Old versions from a bounded sequence of completed writes.
- **VACUUM (VERBOSE, ANALYZE)** (maintenance command)
  - What it is: It removes eligible versions, prints its removable cutoff and tuple accounting, and
    refreshes tuple estimates.
  - What it does here: It runs after baseline churn, while B pins the second case, and after B commits.
  - What it gives us: The before-release and after-release reclamation evidence.
- **pg_relation_size and pgstattuple** (physical inspection functions)
  - What they are: The first reports allocated main-fork bytes; the second scans live, dead, and free
    tuple space exactly.
  - What they do here: They compare page allocation and dead/reusable bytes across both cases.
  - What they give us: Ten logical rows with different retained-dead and free-space outcomes.
- **SET application_name** (session setting)
  - What it is: It labels B's backend in server activity views.
  - What it does here: It gives A a stable identity for the snapshot holder.
  - What it gives us: A query that identifies this reader without guessing among other sessions.
- **BEGIN ISOLATION LEVEL REPEATABLE READ and SELECT** (transaction and snapshot)
  - What they are: The first SELECT fixes B's snapshot for the transaction's life.
  - What they do here: B sees the ten rows before A's pinned churn and remains open.
  - What they give us: A backend_xmin that prevents old versions becoming removable.
- **pg_stat_activity.backend_xmin** (activity-view field)
  - What it is: The oldest xid B's advertised snapshot may still need.
  - What it does here: A reads B's state, xmin, and transaction start before its first pinned VACUUM.
  - What it gives us: The exact xid to compare with VACUUM's removable cutoff.
- **COMMIT** (transaction control)
  - What it is: It ends B's snapshot-holding transaction.
  - What it does here: It releases the blocker before A's final VACUUM.
  - What it gives us: Retained dead tuples becoming removable while row count remains ten.

## Caution
This lesson disables autovacuum only on its disposable table. Do not copy that setting to an
application table. In production, find the actual blocker before terminating a session: it may be a
valid report or migration, and cancelling it changes application behaviour.

## Setup
```sql
create table if not exists mv_horizon (
  id int primary key,
  n int not null,
  pad text not null
);
alter table mv_horizon set (autovacuum_enabled = off);
truncate mv_horizon;
insert into mv_horizon select g, 0, repeat('x', 500) from generate_series(1, 10) g;
vacuum (analyze) mv_horizon;
```

## Run
```sql
-- Session A: baseline. Each generated UPDATE commits independently.
select pg_relation_size('mv_horizon') / 8192 as baseline_pages_before, count(*) as baseline_rows
from mv_horizon;
select format('update mv_horizon set n = n + 1;') from generate_series(1, 100) \gexec
vacuum (verbose, analyze) mv_horizon;
select count(*) as baseline_rows_after, pg_relation_size('mv_horizon') / 8192 as baseline_pages_after
from mv_horizon;
select tuple_count as baseline_live, dead_tuple_count as baseline_dead, free_percent as baseline_free
from pgstattuple('mv_horizon');

-- Session A: reset to the matched starting state.
truncate mv_horizon;
insert into mv_horizon select g, 0, repeat('x', 500) from generate_series(1, 10) g;
vacuum (analyze) mv_horizon;

-- Session B: take and hold the old snapshot.
set application_name = 'mvcc-horizon-reader';
begin isolation level repeatable read;
select count(*) as b_sees_before_churn from mv_horizon;

-- Session A: the same independently committed updates now run behind B's snapshot.
select format('update mv_horizon set n = n + 1;') from generate_series(1, 100) \gexec
select count(*) as pinned_rows, pg_relation_size('mv_horizon') / 8192 as pinned_pages_before_vacuum
from mv_horizon;
select pid, state, backend_xmin, xact_start
from pg_stat_activity where application_name = 'mvcc-horizon-reader';
vacuum (verbose, analyze) mv_horizon;
select tuple_count as pinned_live, dead_tuple_count as pinned_dead, free_percent as pinned_free
from pgstattuple('mv_horizon');

-- Session B
commit;

-- Session A
vacuum (verbose, analyze) mv_horizon;
select count(*) as released_rows, pg_relation_size('mv_horizon') / 8192 as released_pages
from mv_horizon;
select tuple_count as released_live, dead_tuple_count as released_dead, free_percent as released_free
from pgstattuple('mv_horizon');
```

## Expected result
The baseline starts and ends with 10 logical rows. Its 100 separately committed updates may grow the
heap while they run, but VACUUM reports old tuples removed and pgstattuple reports baseline_dead = 0.
The table may retain allocated pages; baseline_free is evidence that their bytes are reusable.

The reset also starts with 10 rows. Session B reports b_sees_before_churn = 10, then the activity
query identifies exactly one **mvcc-horizon-reader** backend with a non-NULL backend_xmin. The pinned
run still reports pinned_rows = 10, but its first verbose VACUUM reports old tuples that are dead but
not yet removable. Its **removable cutoff** is B's backend_xmin; absolute xid values and retained
physical-version counts vary with page pruning and server version.

After B commits, the next VACUUM reports those old versions removed. released_rows remains 10,
released_dead becomes 0, and released_free rises. released_pages commonly stays at the pinned size:
plain VACUUM made bytes reusable inside the relation; it did not promise to return pages to the OS.

## Systems lens
Garbage collection in a multi-version system is bounded by its oldest relevant observer. The baseline
and pinned cases have the same writes and logical data; the old snapshot alone changes whether
versions can be reclaimed. PostgreSQL combines several horizon inputs for different cleanup duties,
so treat a user-table blocker as evidence about this relation's cleanup, not a complete inventory of
every cluster-wide retention source. Operations should bound transaction lifetime and alert on old
active snapshots before retention turns into capacity pressure.

## Optional variation
Repeat only the pinned case with B running **begin;** but no query. Run the same generated updates,
inspect B in pg_stat_activity, and then VACUUM. If B has no snapshot/backend_xmin, cleanup should
match the baseline. That variation distinguishes an open connection from an old snapshot.
