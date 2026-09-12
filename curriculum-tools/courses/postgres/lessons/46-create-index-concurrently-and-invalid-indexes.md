# CREATE INDEX CONCURRENTLY: build, wait, validate, flip

slug: create-index-concurrently-and-invalid-indexes
category: indexes
difficulty: advanced
tags: index-access-methods, ddl, migrations, relation-locks, btree
prerequisites: btree-page-anatomy, ddl-behind-a-long-query
safety: ddl
run-in: tool
sessions: 3
min-version: 16
minutes: 20
revision: 4

## Overview
A concurrent index build keeps ordinary writes possible while advancing through several phases.
Hold an old snapshot, observe the builder waiting, and distinguish an index maintained for writes
from one valid for planning. Then cause a duplicate-key failure, inspect the invalid artifact and
repair the data before a successful rebuild.

## Syntax breakdown
### In plain terms

CREATE INDEX CONCURRENTLY is an online-build protocol rather than one instant operation. One session
holds a repeatable-read snapshot while another builds, so you can watch the builder wait and inspect
the index catalog entry before it becomes valid. A deliberately duplicated value then makes a unique
build fail, leaving an invalid index that must be removed safely.

### What you are learning

- **Concurrent index phases:** Build, validation, and catalog state changes happen in separate phases.
- **Snapshot waits:** An old transaction can delay the moment an index becomes valid for queries.
- **Invalid-index cleanup:** A failed build can leave a physical index entry behind.
- **Online DDL trade-off:** Concurrent builds reduce blocking but require more time, state, and disk.

### Piece by piece

- **CREATE INDEX CONCURRENTLY** (online DDL command)
  - What it is: It builds an index while allowing ordinary reads and writes, using multiple transactions.
  - What it does here: Session A waits for Session B's old snapshot, then completes after B commits.
  - What it gives us: A usable index after the wait, or an invalid catalog row after the duplicate failure.
- **BEGIN ISOLATION LEVEL REPEATABLE READ and COMMIT** (transaction commands)
  - What they are: BEGIN opens a transaction with one stable snapshot; COMMIT ends it and releases transaction resources.
  - What they do here: Session B keeps an old snapshot alive until Session A's build is observable.
  - What they give us: A reproducible waiting phase and the unblocking event.
- **pg_index.indisready and indisvalid** (catalog columns)
  - What they are: Flags saying whether an index is maintained for new writes and valid for query planning.
  - What they do here: They reveal the half-finished state and the failed unique build.
  - What they give us: indisready true with indisvalid false means maintenance happens but the planner cannot trust it.
- **pg_stat_progress_create_index** (progress view)
  - What it is: A live view of index-build phases and progress.
  - What it does here: It identifies the current phase and locker PID while the build waits.
  - What it gives us: phase, current_locker_pid, blocks_done, and blocks_total.
- **pg_stat_activity** (activity view)
  - What it is: One row per backend and its current state or wait event.
  - What it does here: It finds the CREATE INDEX CONCURRENTLY backend waiting on the old snapshot.
  - What it gives us: pid, state, wait_event_type, wait_event, and a shortened query text.
- **pg_relation_size(indexrelid)** (size function)
  - What it is: It returns an index's physical size in bytes.
  - What it does here: It confirms a half-built or invalid index occupies disk.
  - What it gives us: bytes for comparing finished and failed catalog entries.
- **CREATE UNIQUE INDEX CONCURRENTLY** (unique online DDL)
  - What it is: It builds a concurrent index while enforcing uniqueness.
  - What it does here: The duplicate email causes the build to error.
  - What it gives us: An invalid index visible through pg_index and \d output.
- **DROP INDEX CONCURRENTLY** (online cleanup DDL)
  - What it is: It removes an invalid index while allowing ordinary access, but still acquiring locks and potentially waiting.
  - What it does here: It cleans up ix_cic_email_uk after the failed build.
  - What it gives us: A safe final state; it also cannot run inside a transaction block.
- **\d ix_cic** (psql relation description command)
  - What it is: It prints columns, indexes, and constraints for a table.
  - What it does here: It exposes the failed index in a human-readable table summary.
  - What it gives us: A quick deployment-style check alongside the catalog query.
- **generate_series and ::regclass** (SQL function and cast)
  - What they are: generate_series creates the initial rows; the regclass cast resolves a relation name to its catalog identity.
  - What they do here: They create the build input and let pg_index filters name ix_cic safely.
  - What they give us: A repeatable table and catalog lookups tied to that table.
- **DO, FOR, EXISTS, pg_sleep and RAISE EXCEPTION** (bounded readiness observation)
  - What they are: An anonymous procedural block repeats a condition check with short pauses and fails when its budget expires.
  - What they do here: C checks up to50 times at0.1-second intervals for this table's old-snapshot phase; sleep alone is not the evidence.
  - What they give us: Either the expected phase is observed or the trial explicitly fails.
- **statement_timeout and application_name** (session controls)
  - What they are: A statement deadline and a client label.
  - What they do here: They bound and identify A's build; both reset at the end.
  - What they give us: A hung schedule terminates within15 seconds rather than waiting indefinitely.
- **pg_blocking_pids** (blocker lookup function)
  - What it is: It returns processes blocking the selected backend's lock acquisition.
  - What it does here: It connects the progress row to the old transaction. Each poll clears the cached statistics snapshot so a phase transition can become visible.
  - What it gives us: A blocker array; a virtual transaction wait is still a diagnosable lock wait.

## Caution
The second half deliberately fails a DDL statement and leaves an invalid index until the final DROP.
Run it only in the lab. If the readiness check or15-second deadline fails, end B's transaction,
inspect and drop only the named invalid index, then rerun setup before continuing.

## Setup
```sql
drop table if exists ix_cic;
create table ix_cic(id int, email text);
insert into ix_cic select g, 'user' || g || '@example.com' from generate_series(1, 5000) g;
analyze ix_cic;
```

## Run
```sql
-- Session A
set application_name='pgpivot_cic_builder';
set statement_timeout='15s';
select count(*) as indexes_on_ix_cic from pg_index where indrelid='ix_cic'::regclass;
-- Session B
begin isolation level repeatable read;
select count(*) as rows_b_can_see from ix_cic;
-- Session A (blocks until B commits)
create index concurrently ix_cic_email_idx on ix_cic(email);
-- Session C: wait for evidence, with a five-second observation budget.
do $$
declare ready boolean := false;
begin
  for attempt in 1..50 loop
    perform pg_stat_clear_snapshot();
    select exists(select 1 from pg_stat_progress_create_index
      where datid=(select oid from pg_database where datname=current_database())
        and relid='ix_cic'::regclass and phase='waiting for old snapshots') into ready;
    exit when ready;
    perform pg_sleep(0.1);
  end loop;
  if not ready then raise exception 'old-snapshot phase not observed; stop this trial'; end if;
end $$;
select p.phase,p.current_locker_pid,a.wait_event_type,a.wait_event,pg_blocking_pids(a.pid) as blockers
from pg_stat_progress_create_index p join pg_stat_activity a using(pid)
where p.datid=(select oid from pg_database where datname=current_database()) and p.relid='ix_cic'::regclass;
select indexrelid::regclass as index,indisready,indisvalid,pg_relation_size(indexrelid) as bytes
from pg_index where indrelid='ix_cic'::regclass;
-- Session B: this transaction's catalog snapshot predates the index.
select indexrelid::regclass as index,indisready,indisvalid
from pg_index where indrelid='ix_cic'::regclass;
commit;
-- Session A
select indexrelid::regclass as index,indisready,indisvalid
from pg_index where indrelid='ix_cic'::regclass;
insert into ix_cic values(5001,'user1@example.com');
-- Expected23505: continue with the catalog observation and owned cleanup below.
create unique index concurrently ix_cic_email_uk on ix_cic(email);
select indexrelid::regclass as invalid_index,indisready,indisvalid
from pg_index where indrelid='ix_cic'::regclass and not indisvalid;
\d ix_cic
drop index concurrently ix_cic_email_uk;
delete from ix_cic where id=5001;
create unique index concurrently ix_cic_email_uk on ix_cic(email);
select indexrelid::regclass as index,indisready,indisvalid
from pg_index where indrelid='ix_cic'::regclass;
select count(*) as rows,count(distinct email) as unique_emails from ix_cic;
reset statement_timeout;
reset application_name;
```

## Expected result
B's repeatable-read snapshot sees5,000 rows before A creates the index. C's bounded observation
must find A in waiting for old snapshots; otherwise stop and investigate the schedule. The progress
row and pg_blocking_pids connect the wait to a transaction. In validation it was a virtualxid wait.

B's ordinary pg_index query cannot see the later catalog row in its fixed snapshot. C can see
ix_cic_email_idx with indisready=true and indisvalid=false. Ending B's transaction allows A to
finish; both flags then become true. The index size and progress counters are observations, not
stable values or a readiness test by themselves.

The deliberate duplicate makes CREATE UNIQUE INDEX CONCURRENTLY raise23505 and leave an invalid
ix_cic_email_uk. Its ready state depends on the failure phase; inspect it. A ready-but-invalid
index can still impose maintenance or uniqueness costs. The owned invalid-artifact query must name
ix_cic, not unrelated indexes in the database.

Cleanup drops the failed artifact, removes only the inserted id5001 duplicate and retries the unique
build. The retry finishes with both flags true and5,000 rows with5,000 distinct emails. Concurrent
DDL still uses locks, takes resources and can wait; it does not mean a migration is nonblocking.

## Systems lens
A multi-phase operation can leave durable intermediate state after an error. Recovery must identify
that state and decide whether to resume, replace or clean it up. A catalog row existing is weaker
than being usable. This transfers to migration orchestration, but each protocol has its own reader,
writer and activation conditions; do not assume every online change waits on the same boundary.
