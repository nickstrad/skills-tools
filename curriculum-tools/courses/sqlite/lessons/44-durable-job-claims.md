# Release the writer while a job runs, then fence a late completion

slug: durable-job-claims
category: local-systems
difficulty: advanced
tags: queues, leases, fencing, optimistic-concurrency, locking
prerequisites: immediate-reserves-writer
safety: locking
run-in: tool
sessions: 2
min-version: 3.53.4
minutes: 25
revision: 3

## Overview
Use the single writer briefly to assign a job, then release it before doing the work. A second worker can claim another job while the first is running. When a lease expires, a higher token allows takeover while the completion predicate prevents the old worker from overwriting the new result.

## Syntax breakdown
### In plain terms

PostgreSQL's SKIP LOCKED queue lets workers claim different rows concurrently. SQLite instead
serializes the short ownership changes for this file. Holding its writer for the duration of a job
would block unrelated claims too. The experiment separates claim, work and completion, then advances
a logical test clock so takeover and a stale result happen in a deterministic order.

### What you are learning

- A lease permits recovery of abandoned work. Its deadline does not stop an old process from running.
- A token identifies the current ownership generation; a conditional completion is a compare-and-swap.
- The guarded row is the protected resource. An external effect would need its own identity/token check.

### Piece by piece

- **.timeout 100** (connection busy budget): Bound B's initial attempt to reserve the writer at
  100 ms. Read the busy error as failed admission, not proof that B owns any job.
- **BEGIN IMMEDIATE / COMMIT** (claim boundary): Reserve the writer while selecting and updating a
  job. The first COMMIT releases it before the simulated work interval.
- **UPDATE ... WHERE id=(SELECT ... LIMIT 1) RETURNING** (claim): Pick one queued row, record owner,
  increment token, and display the resulting ownership. ORDER BY makes the selection reproducible.
- **lease_until<=200** (logical deadline): The test treats 200 as now and 100 as expired. It avoids
  a timing race and says nothing about clock synchronization between real hosts.
- **WHERE owner=... AND token=... AND state='claimed'** (completion fence): Recheck ownership at
  the resource itself. A zero-row update is a stale result, not a successful completion.
- **changes()** (last write count): Query it immediately after each guarded write. One means the
  resource accepted the transition; zero means the expected owner/version no longer matched.

## Setup
```sql
PRAGMA journal_mode=WAL;
DROP TABLE IF EXISTS durable_jobs;
CREATE TABLE durable_jobs(id INTEGER PRIMARY KEY,state TEXT NOT NULL,owner TEXT,
 token INTEGER NOT NULL DEFAULT 0,lease_until INTEGER,result TEXT);
INSERT INTO durable_jobs(id,state) VALUES(1,'queued'),(2,'queued');
```

## Run
```sql
-- Session A
BEGIN IMMEDIATE;
UPDATE durable_jobs SET state='claimed',owner='a',token=token+1,lease_until=100
 WHERE id=(SELECT id FROM durable_jobs WHERE state='queued' ORDER BY id LIMIT 1)
 RETURNING id,owner,token;
-- Session B
.timeout 100
BEGIN IMMEDIATE;
-- Session A
COMMIT;
.print A is doing slow work with no open write transaction
-- Session B
BEGIN IMMEDIATE;
UPDATE durable_jobs SET state='claimed',owner='b',token=token+1,lease_until=300
 WHERE id=(SELECT id FROM durable_jobs WHERE state='queued' ORDER BY id LIMIT 1)
 RETURNING id,owner,token;
COMMIT;
UPDATE durable_jobs SET owner='b',token=token+1,lease_until=300
 WHERE id=1 AND state='claimed' AND lease_until<=200;
SELECT 'takeover',changes();
-- Session A
UPDATE durable_jobs SET state='done',result='late-a'
 WHERE id=1 AND owner='a' AND token=1 AND state='claimed';
SELECT 'stale_completion',changes();
-- Session B
UPDATE durable_jobs SET state='done',result='current-b'
 WHERE id=1 AND owner='b' AND token=2 AND state='claimed';
SELECT 'current_completion',changes();
SELECT id,state,owner,token,result FROM durable_jobs ORDER BY id;
```

## Expected result
A claims 1|a|1. B's first BEGIN reports database is locked after its bounded wait. After A commits, B claims 2|b|1 while A's work is unfinished. Takeover reports 1, stale_completion 0, current_completion 1; job 1 ends done|b|2|current-b, and job 2 remains claimed by b with token 1.

## Systems lens
The throughput cost of a single writer depends on the duration of serialized state transitions, not the duration of the jobs they describe. Lease expiry restores liveness; a predicate checked by the protected resource preserves safety after takeover.

## Optional variation
Hold A's claim transaction open while it does its work. Predict what happens to B even though B wants a different job. Then omit the token predicate from completion and demonstrate the stale-write failure on a disposable row.
