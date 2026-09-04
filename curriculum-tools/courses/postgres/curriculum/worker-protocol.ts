import { code, type Draft } from "../../../src/types.ts";

export const WORK_QUEUE: Draft = {
  slug: "skip-locked-work-queue",
  title: "Claim briefly, recover abandoned work, and reject a stale completion",
  difficulty: "advanced",
  prerequisites: ["lock-timeout-and-nowait"],
  tags: ["skip-locked", "queues", "fencing"],
  revision: 4,
  overview:
    "A row lock protects a short transaction; a job may run much longer than that transaction. You will commit two separate claims, let another worker take over an expired claim, and try to complete with the old ownership generation. Completion and its database result must agree even when a worker resumes late.",
  reading: 'PostgreSQL 14 Internals, Chapter 13 "Row-Level Locks" (section "No-Wait Locks")',
  readingNotes:
    "Chapter 13 explains how SKIP LOCKED avoids waiting for a row held by another transaction. Durable claims, expiry and generation-checked completion are application protocols added by this lesson; the book does not supply this queue. Read after observing the two claim transactions.",
  setup: code`
drop table if exists wq_results;
drop table if exists wq_jobs;
create table wq_jobs(
  id int primary key,
  status text not null default 'pending' check(status in ('pending','running','done')),
  owner text,
  generation bigint not null default 0,
  lease_until timestamptz
);
create table wq_results(job_id int primary key references wq_jobs(id),generation bigint not null,result text not null);
insert into wq_jobs(id) values(1),(2),(3);`,
  syntaxBreakdown: code`
### In plain terms

A durable claim is stored in the job row and survives the claim transaction. Each new owner gets a higher generation, a number identifying that ownership attempt. Finishing a job requires the same generation and running status; the result is inserted only from a successful state transition. The worker can therefore release locks while it performs work and still discover that its ownership was superseded.

### What you are learning

- SKIP LOCKED distributes available rows among concurrent claim transactions; it does not itself recover an abandoned committed claim.
- Short claim transactions let other database work proceed while a worker computes or waits elsewhere.
- Expiry makes a running job eligible for takeover. A generation check rejects an old worker after a new claim has committed.
- The completed-state update and result insert form one database transaction. This protects the local result; an external side effect needs its own protocol later.

### Piece by piece

- **status CHECK**, **generation bigint**, **lease_until timestamptz**, and **wq_results primary/foreign keys** represent state, ownership attempt, expiry and one result per existing job. The CHECK permits only the named states; it does not enforce every transition or replace the guarded write statements. The setup drops only this lesson's tables and recreates three pending jobs.
- **BEGIN/COMMIT** keep each claim's row lock only until its ownership metadata is durable. Session A intentionally delays its first COMMIT so Session B can demonstrate skipping. Both commit before the simulated work phase.
- **WITH candidate AS (...)**, **ORDER BY id**, **FOR UPDATE SKIP LOCKED LIMIT 1**, and **UPDATE ... FROM** select and claim one eligible row atomically. A locked row is skipped rather than waited on. The order chooses among available rows, not a global fairness or exactly-once execution guarantee.
- **RETURNING ... \gset a_/b_/takeover_/final_** captures the actual row and generation returned by a claim into named psql variables. These fixtures always supply one candidate; a production empty-queue path must handle zero rows instead of assuming \gset succeeded. Completion uses captured values, not a hard-coded ownership token.
- **clock_timestamp() and interval** set a five-minute claim deadline using the server's current clock. The lab explicitly moves A's deadline into the past to make takeover reproducible; that UPDATE represents elapsed time, not a crash detector or a measured failure timeout. It changes eligibility without silently incrementing ownership.
- **pgrowlocks** inspects tuple locks. row_locks_during_work is zero after both claims commit, despite two rows remaining running. Durable ownership and a held database lock are different facts.
- **The expired candidate predicate and generation=generation+1** make takeover a new short claim transaction. The update holds the candidate's row lock, so two simultaneous claimers cannot both change that version. Generation 2 replaces A's generation 1 on the first job.
- **WITH completed AS (UPDATE ... RETURNING ...)** changes only a running row whose generation matches the worker's token. **INSERT ... SELECT FROM completed** adds the business result only when that update returns a row. Both actions are in the same SQL statement/transaction. A failed INSERT would roll back the state change as well.
- **ROLLBACK** erases the uncommitted third claim's logical effect. The row returns to pending with generation 0. The next owner receives generation 1 because the earlier increment never committed.
- **Count and NOT EXISTS checks** verify three completed jobs, three unique result rows and no stale or duplicate completion text. Inspect both tables; success is their relationship, not a printed success label.`,
  code: code`
-- Session A: hold the first claim open so the other worker must skip its row.
begin;
with candidate as (
  select id from wq_jobs where status='pending'
  order by id for update skip locked limit 1
)
update wq_jobs j set status='running', owner='A', generation=generation+1,
  lease_until=clock_timestamp()+interval '5 minutes'
from candidate c where j.id=c.id returning j.id, j.generation \gset a_

-- Session B: atomically claim a different row and commit before doing work.
begin;
with candidate as (
  select id from wq_jobs where status='pending'
  order by id for update skip locked limit 1
)
update wq_jobs j set status='running', owner='B', generation=generation+1,
  lease_until=clock_timestamp()+interval '5 minutes'
from candidate c where j.id=c.id returning j.id, j.generation \gset b_
commit;

-- Session A
commit;
select id,status,owner,generation from wq_jobs order by id;
select count(*) as row_locks_during_work from pgrowlocks('wq_jobs');

-- Session B: controlled expiry represents time passing while A is unavailable.
-- This is a lab fixture, not the production expiry procedure or a network partition.
update wq_jobs set lease_until=clock_timestamp()-interval '1 second' where owner='A';
begin;
with candidate as (
  select id from wq_jobs
  where status='running' and lease_until < clock_timestamp()
  order by id for update skip locked limit 1
)
update wq_jobs j set owner='B', generation=generation+1,
  lease_until=clock_timestamp()+interval '5 minutes'
from candidate c where j.id=c.id returning j.id,j.generation \gset takeover_

-- Session A: a competing reclaimer cannot take B's still-locked expired row.
-- Do not use \gset on a deliberately empty result.
with candidate as (
  select id from wq_jobs
  where status='running' and lease_until < clock_timestamp()
  order by id for update skip locked limit 1
)
update wq_jobs j set owner='A-reclaimer', generation=generation+1,
  lease_until=clock_timestamp()+interval '5 minutes'
from candidate c where j.id=c.id returning j.id,j.generation;

-- Session B
commit;
select id,status,owner,generation from wq_jobs order by id;

-- Session A: the old worker resumes with its original generation.
with completed as (
  update wq_jobs set status='done'
  where id=:a_id and generation=:a_generation and status='running'
  returning id,generation
)
insert into wq_results(job_id,generation,result)
select id,generation,'stale A result' from completed returning *;
select count(*) as stale_results from wq_results;

-- Session B: current ownership permits completion and its result in one transaction.
with completed as (
  update wq_jobs set status='done'
  where id=:takeover_id and generation=:takeover_generation and status='running'
  returning id,generation
)
insert into wq_results(job_id,generation,result)
select id,generation,'B recovered job' from completed returning *;
with completed as (
  update wq_jobs set status='done'
  where id=:b_id and generation=:b_generation and status='running'
  returning id,generation
)
insert into wq_results(job_id,generation,result)
select id,generation,'B original job' from completed returning *;

-- Session A: an uncommitted claim disappears on rollback.
begin;
with candidate as (
  select id from wq_jobs where status='pending'
  order by id for update skip locked limit 1
)
update wq_jobs j set status='running',owner='A',generation=generation+1,
  lease_until=clock_timestamp()+interval '5 minutes'
from candidate c where j.id=c.id returning j.id,j.generation;

-- Session B: no available candidate while A holds the only pending row.
with candidate as (
  select id from wq_jobs where status='pending'
  order by id for update skip locked limit 1
)
update wq_jobs j set status='running',owner='B',generation=generation+1,
  lease_until=clock_timestamp()+interval '5 minutes'
from candidate c where j.id=c.id returning j.id,j.generation;

-- Session A
rollback;
select id,status,generation from wq_jobs where id=3;

-- Session B: the rolled-back claim is immediately available again.
with candidate as (
  select id from wq_jobs where status='pending'
  order by id for update skip locked limit 1
)
update wq_jobs j set status='running',owner='B',generation=generation+1,
  lease_until=clock_timestamp()+interval '5 minutes'
from candidate c where j.id=c.id returning j.id,j.generation \gset final_
with completed as (
  update wq_jobs set status='done'
  where id=:final_id and generation=:final_generation and status='running'
  returning id,generation
)
insert into wq_results(job_id,generation,result)
select id,generation,'B retried uncommitted claim' from completed returning *;

-- A duplicate completion with the current token is also a no-op: status is already done.
with completed as (
  update wq_jobs set status='done'
  where id=:final_id and generation=:final_generation and status='running'
  returning id,generation
)
insert into wq_results(job_id,generation,result)
select id,generation,'duplicate completion' from completed returning *;
select id,status,owner,generation from wq_jobs order by id;
select * from wq_results order by job_id;
select (select count(*) from wq_jobs where status='done')=3 as all_done,
       (select count(*) from wq_results)=3 as one_result_per_job,
       not exists(select 1 from wq_results where result like 'stale%' or result like 'duplicate%') as no_stale_or_duplicate;`,
  expectedResult:
    "A claims job 1 generation 1; B skips its locked row and claims job 2 generation 1. After both commits pgrowlocks reports zero row locks. The expiry fixture permits B to take job 1 at generation 2; A's competing takeover returns UPDATE 0 while B holds that row. After B commits, A's stale completion inserts zero rows and stale_results is 0. B completes jobs 1 and 2. While A holds the third claim open, B's first pending-claim attempt returns UPDATE 0: this is an empty result, not a SQL error. A's rollback leaves job 3 pending generation 0, then B's fresh claim attempt gets generation 1 and completes it. Repeating that completion inserts zero rows. Final all_done, one_result_per_job and no_stale_or_duplicate are all true. This proves guarded database completion after takeover, not that external work executed only once.",
  systemsLens:
    "The claim transaction and the work have different lifetimes. Durable ownership metadata bridges them, and a conditional completion closes the race with a superseded worker. The protected object here is the job/result state in this PostgreSQL database. A generation does not stop a worker from calling an external API, and a deadline does not prove the old worker has stopped. The later delivery and resource-fencing experiments address those boundaries. The protocol assumes cooperative writers use these guarded statements and retain the job generation; unrestricted SQL writers can bypass the application contract.",
  challenge:
    "After rerunning setup, claim job 1 in an open transaction in A, let B claim and commit job 2, then roll A back. List the pending set (including the never-claimed job 3). Then rerun the full core and explain why a duplicate database completion checks status as well as generation; use its supplied final statement to inspect the no-op. This says nothing about whether a worker repeated an external call.",
  caution:
    "Use only the disposable course lab and execute Session A/B blocks in order. The expiry UPDATE deliberately edits test ownership metadata; a real reclaimer checks time rather than rewriting another worker's deadline. Five-minute deadlines allow manual inspection; if you pause longer, rerun setup and the experiment. These SQL clients model workers and database results, not a real external service.",
  safetyLevel: "locking",
  runIn: "tool",
  sessions: 2,
  estimatedMinutes: 30,
};
