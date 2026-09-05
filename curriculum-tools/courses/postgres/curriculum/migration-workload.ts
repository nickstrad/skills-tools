import { code, type Draft } from "../../../src/types.ts";

export const RETENTION_VARIATION = code`
-- Session B: hold one eligible row while the retention worker proceeds.
begin;
select id from mig_jobs where id=1 for update;
-- Session A: autocommit; every generated DELETE is a separate transaction.
set statement_timeout='10s';
select pg_relation_size('mig_jobs') as bytes_before;
select $batch$
with candidate as (
  select id from mig_jobs where id<=200 order by id limit 25 for update skip locked
), removed as (
  delete from mig_jobs j using candidate c where j.id=c.id returning j.id
)
select count(*) as removed_this_batch from removed;
$batch$ from generate_series(1,11) \gexec
select count(*) as still_eligible from mig_jobs where id<=200;
-- Session B
commit;
-- Session A: reconcile the fixed cutoff after the lock holder leaves.
with candidate as (
  select id from mig_jobs where id<=200 order by id limit 25 for update skip locked
), removed as (
  delete from mig_jobs j using candidate c where j.id=c.id returning j.id
)
select count(*) as final_removed from removed;
select count(*) as remaining_rows,min(id) as first_id,
  count(*)=800 and count(*) filter(where id<=200)=0 as retained_expected_range
from mig_jobs;
select pg_relation_size('mig_jobs') as bytes_after;
reset statement_timeout;`;

export const MIGRATION: Draft = {
  slug: "bounded-online-migration",
  revision: 1,
  title: "Backfill in short transactions and prove the migration is complete",
  difficulty: "advanced",
  safetyLevel: "ddl",
  runIn: "tool",
  sessions: 2,
  estimatedMinutes: 35,
  tags: ["migrations", "ddl", "skip-locked", "constraints"],
  prerequisites: [
    "create-index-concurrently-and-invalid-indexes",
    "skip-locked-work-queue",
    "ddl-behind-a-long-query",
  ],
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 12 "Relation-Level Locks"; Chapter 13 "Row-Level Locks".`,
  overview: code`
Add a typed priority beside a legacy text field while writers continue using the old format. Bound
DDL waits, commit backfill batches independently and deliberately skip a locked historical row.
Only a reconciliation query and validated constraint establish completion; an empty batch does not.
The retained compatibility trigger makes the rollout boundary explicit.`,
  caution: code`
Run only on the supplied mig_jobs table in two dedicated lab sessions. Start with no open
transaction. The first DDL attempt, malformed write and premature validation deliberately fail;
follow their rollback/continuation steps. Do not wrap the whole script in BEGIN or use psql -1:
backfill batches must commit separately. If a deadline fails unexpectedly, end B's transaction and
rerun setup. The final bridge and legacy field remain until all application writers/readers have a
replacement contract; removing them is a separate deployment decision.`,
  syntaxBreakdown: code`
### In plain terms

A schema migration changes both stored data and the contract used by callers. You introduce a new
integer field without rewriting every row under the initial DDL lock. A trigger keeps new writes
compatible while old rows are filled in small commits. A held row creates a deliberate gap that the
migration must find before declaring success.

### What you are learning

- **Brief schema locks:** A metadata change still needs a table lock; a lock deadline bounds its
  wait and rollback leaves the failed attempt unpublished.
- **Compatibility during rollout:** The text field stays canonical while a trigger derives the new
  integer. This is a concrete database bridge, not proof that application clients have been upgraded.
- **Bounded partial progress:** Every backfill statement commits independently. An interruption
  preserves earlier batches, and the predicate selects rows still needing work on the next attempt.
- **Reconciliation after skipping locks:** SKIP LOCKED avoids waiting for a busy row but can return
  an empty batch while eligible rows remain. Count remaining work separately.
- **Constraint lifecycle:** NOT VALID postpones checking old rows while enforcing the check for
  new/changed rows. Validation establishes the condition over the existing relation.

### Piece by piece

- **priority_text and priority_int** (old and new representations)
  - What they are: A legacy text value and its integer interpretation.
  - What they do here: The fixture contains 1,000 convertible values; the new field starts null.
  - What they give us: A precise final invariant: every integer equals its corresponding text cast.
- **SELECT ... FOR UPDATE, lock_timeout and ROLLBACK** (lock experiment)
  - What they are: A row-locking read, a bounded lock-acquisition wait and transaction rollback.
  - What they do here: B's transaction also holds a relation lock that blocks A's ADD COLUMN.
    A's 250ms attempt fails with 55P03 and rolls back before retrying after B commits.
  - What they give us: A failed attempt with no published new column, not an assumed instant DDL.
- **pg_relation_filenode and pg_attribute** (physical identity and schema evidence)
  - What they are: The relation's file identifier and its column catalog.
  - What they do here: They check that the failed ADD left no live column and the successful nullable
    ADD did not replace the heap file in this trial.
  - What they give us: Limited evidence about this schema change; file identity is not an I/O counter.
- **CREATE FUNCTION ... RETURNS trigger, NEW and RETURN NEW** (compatibility bridge)
  - What they are: A PL/pgSQL trigger function and the row being written.
  - What they do here: NEW.priority_int is assigned from NEW.priority_text before each insert/update.
    A supplied integer is deliberately overwritten because text remains canonical in this phase.
  - What they give us: New legacy-format writes receive the integer atomically; malformed text raises
    22P02 and rejects that write rather than leaving inconsistent representations.
- **CREATE TRIGGER ... BEFORE INSERT OR UPDATE ... FOR EACH ROW** (write hook)
  - What it is: A row trigger invoked inside the caller's transaction.
  - What it does here: It is installed in the same short DDL transaction as the new column and check.
  - What it gives us: No committed schema phase exposes the new column without its compatibility hook.
- **ADD CONSTRAINT ... CHECK (...) NOT VALID** (deferred historical validation)
  - What it is: A check enforced for later inserts/updates without first scanning all old rows.
  - What it does here: It requires nonnull priority_int for changed rows while backfill is incomplete.
  - What it gives us: pg_constraint.convalidated remains false until a separate validation succeeds.
- **WITH candidate ... LIMIT 100 FOR UPDATE SKIP LOCKED** (bounded candidate selection)
  - What it is: An ordered row selection that locks up to 100 available candidates and skips locked ones.
  - What it does here: It selects null priorities without waiting for B's row 1.
  - What it gives us: A bounded transaction size, not proof that every candidate was examined or processed.
- **UPDATE ... FROM ... RETURNING and COUNT** (backfill and evidence)
  - What they are: An update joined to the selected IDs, a changed-row result and an aggregate.
  - What they do here: They fill those rows and report exactly how many the batch changed.
  - What they give us: Per-batch work counts; the final zero is compared with still_null=1.
- **Dollar-quoted batch text, generate_series and \gexec** (psql batch driver)
  - What they are: A literal SQL command, a bounded generator and a psql command executing each result.
  - What they do here: They emit 11 batch statements. In autocommit, each finishes its own transaction
    before the next begins; the generator does not wrap those writes into one large transaction.
  - What they give us: Runnable partial progress with a fixed maximum number of batches.
- **VALIDATE CONSTRAINT and SET NOT NULL** (completion and schema cutover)
  - What they are: A check of historical rows and a column nullability change.
  - What they do here: Premature validation fails 23514; after the skipped row is filled, validation
    succeeds. PostgreSQL can use that retained valid check to skip SET NOT NULL's normal table scan.
  - What they give us: convalidated=true and attnotnull=true. Scan avoidance is documented behavior;
    SET NOT NULL still needs its DDL lock, so the trial retains a short lock budget.
- **\echo and :SQLSTATE** (psql error evidence)
  - What they are: A client output command and the result code of the most recent SQL statement.
  - What they do here: They print 55P03, 22P02 and 23514 immediately after the deliberately failing statements.
  - What they give us: Classified outcomes before a later statement overwrites the status.
- **statement_timeout and SET LOCAL** (execution bounds)
  - What they are: A statement deadline and settings scoped to a transaction.
  - What they do here: Statements have a 10-second limit; DDL lock waits have short local budgets.
  - What they give us: Failure is bounded and session defaults are restored after the experiment.
- **Retention variation: DELETE USING, fixed cutoff and FILTER** (bounded deletion)
  - What they are: Deletion joined to candidate IDs, the explicit id<=200 policy and a conditional count.
  - What they do here: They reuse independent batches while B holds one eligible row, then reconcile.
  - What they give us: Exactly the intended 800 rows remain after reconciliation. Deleted rows do
    not imply reclaimed filesystem bytes, and this fixed lab cutoff is not an archival policy.`,
  setup: code`
drop table if exists mig_jobs;
drop function if exists mig_bridge();
create table mig_jobs(id int primary key,priority_text text not null)
  with(autovacuum_enabled=off);
insert into mig_jobs select g,(g%5)::text from generate_series(1,1000) g;
analyze mig_jobs;`,
  code: code`
-- Session A
set statement_timeout='10s';
select pg_relation_filenode('mig_jobs') as before_node \gset
-- Session B: a row lock also keeps this transaction's relation lock until commit.
begin;
select id from mig_jobs where id=1 for update;
-- Session A: expected 55P03; a nullable ADD COLUMN still needs its table lock.
begin;
set local lock_timeout='250ms';
alter table mig_jobs add column priority_int integer;
\echo ddl_sqlstate :SQLSTATE
rollback;
select count(*) as published_columns from pg_attribute
where attrelid='mig_jobs'::regclass and attname='priority_int' and not attisdropped;
-- Session B
commit;
-- Session A: install the compatibility boundary atomically under a short lock budget.
begin;
set local lock_timeout='500ms';
alter table mig_jobs add column priority_int integer;
create function mig_bridge() returns trigger language plpgsql as $$
begin
  new.priority_int := new.priority_text::integer;
  return new;
end $$;
create trigger mig_bridge before insert or update on mig_jobs
for each row execute function mig_bridge();
alter table mig_jobs add constraint mig_priority_present check(priority_int is not null) not valid;
commit;
select pg_relation_filenode('mig_jobs')=:before_node as same_heap_file;
-- Session B: legacy writer still supplies only the old representation.
insert into mig_jobs(id,priority_text) values(1001,'2');
select * from mig_jobs where id=1001;
-- Expected 22P02; this autocommit write is rejected as a unit.
insert into mig_jobs(id,priority_text) values(1002,'invalid');
\echo writer_sqlstate :SQLSTATE
begin;
select id from mig_jobs where id=1 for update;
-- Session A: no surrounding BEGIN. gexec runs these as independent committed batches.
select $batch$
with candidate as (
  select id from mig_jobs where priority_int is null order by id limit 100 for update skip locked
), changed as (
  update mig_jobs j set priority_int=j.priority_text::integer
  from candidate c where j.id=c.id returning j.id
)
select count(*) as filled_this_batch from changed;
$batch$ from generate_series(1,11) \gexec
select count(*) as still_null from mig_jobs where priority_int is null;
-- Session B: an independent reader can already see the committed historical batches.
select count(*) as committed_backfill_rows from mig_jobs where id<=1000 and priority_int is not null;
-- Session A
-- Expected 23514: the skipped historical row still violates the check.
begin;
set local lock_timeout='500ms';
alter table mig_jobs validate constraint mig_priority_present;
\echo validation_sqlstate :SQLSTATE
rollback;
select convalidated from pg_constraint where conrelid='mig_jobs'::regclass and conname='mig_priority_present';
-- Session B
commit;
-- Session A: finish the skipped work before retrying validation.
with candidate as (
  select id from mig_jobs where priority_int is null order by id limit 100 for update skip locked
), changed as (
  update mig_jobs j set priority_int=j.priority_text::integer
  from candidate c where j.id=c.id returning j.id
)
select count(*) as final_filled from changed;
begin;
set local lock_timeout='500ms';
alter table mig_jobs validate constraint mig_priority_present;
commit;
begin;
set local lock_timeout='500ms';
alter table mig_jobs alter column priority_int set not null;
commit;
select count(*) as rows,sum(priority_int) as priority_sum,
  count(*)=1001 and count(*) filter(where priority_int is distinct from priority_text::integer)=0 as consistent
from mig_jobs;
select attnotnull from pg_attribute where attrelid='mig_jobs'::regclass and attname='priority_int';
select convalidated from pg_constraint where conrelid='mig_jobs'::regclass and conname='mig_priority_present';
reset statement_timeout;`,
  expectedResult: code`
The first ADD COLUMN fails 55P03 while B's row transaction is open. After rollback,
published_columns=0. The successful bounded retry installs the column, bridge and unvalidated check;
same_heap_file=true in this trial. B's new id 1001 has priority_int=2 even though it supplied only
priority_text. Its malformed id 1002 insert fails 22P02 and creates no row.

With B holding historical row 1, the 11 batches fill 999 old rows: nine batches of 100, one of 99 and
one of 0. The separate query still reports still_null=1, while B sees committed_backfill_rows=999. Earlier batches are already committed;
premature validation fails 23514, rolls back that validation attempt and leaves convalidated=false.
An empty SKIP LOCKED batch has not established completion.

After B commits, final_filled=1. Validation succeeds and the column becomes NOT NULL. The final
invariants are rows=1001, priority_sum=2002, consistent=true, attnotnull=true and convalidated=true.
The legacy column and trigger remain active; the final schema supports legacy writers and typed
reads, not a completed application rollout that removes the old contract.

The retention variation starts from setup alone. It removes 199 eligible rows while id1 is locked,
reports still_eligible=1 after empty batches, then removes the last eligible row after release.
Final remaining_rows=800, first_id=201 and retained_expected_range=true. Inspect file size separately;
logical deletion is not evidence of immediate disk-space reclamation.`,
  systemsLens: code`
A long operation can make durable partial progress while preserving a compatibility invariant for
concurrent callers. Bound each unit of work, retain an idempotent remaining-work predicate, and
reconcile before declaring completion. Skip-on-contention mechanisms improve availability but weaken
what an empty poll means. Migration cutover and retiring a compatibility path are separate decisions
because database state alone cannot prove every external caller has adopted a new contract.`,
  challenge: code`
Apply the same batching discipline to a retention cutoff: remove only ids <= 200 while B holds id1.
Explain why an empty deletion batch cannot finish the job, then reconcile after B releases the row.
The runnable hint supplies the complete two-session schedule and final range assertions.`,
};
