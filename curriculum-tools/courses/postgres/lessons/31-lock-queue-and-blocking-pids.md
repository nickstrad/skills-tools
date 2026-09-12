# Read blockers and wait evidence from a lock queue

slug: lock-queue-and-blocking-pids
category: locking
difficulty: intermediate
tags: locks, row-locks, lock-queue, wait-events
prerequisites: row-locks-are-in-the-tuple
safety: locking
run-in: tool
sessions: 3
min-version: 16
minutes: 15
revision: 4

## Overview
Three sessions want the same row. PostgreSQL queues conflicting requests; compatible requests and lock-manager scheduling affect what
runs next, and pg_blocking_pids() reports the edges of the resulting wait-for graph. Watch
the queue drain one transaction at a time, and notice that the second waiter is still stuck after
the first holder commits.

## Syntax breakdown
### In plain terms

Three sessions queue for one row. The first waiter waits on the holder, while the next waiter waits
behind that first waiter, creating a wait-for graph (a directed list of who blocks whom). The query
turns that graph into rows you can read before and after the first transaction commits.

### What you are learning

- **Wait queues** retain conflicting requests; inspect the actual blocker chain rather than assuming a universal FIFO policy.
- **Wait-for graphs** show the immediate blocker for each waiting backend.
- **Head-of-line blocking** means releasing the first holder does not release everyone behind it.

### Piece by piece

- **SELECT ... FOR UPDATE** (SQL row-lock clause): Locks id 2 for Session A.
  - What it does here: Creates the initial holder that B must wait for.
  - What it gives us: A's backend PID as the first blocker.
- **UPDATE ... WHERE id = 2** (SQL data change): Requests the same row lock while changing val.
  - What it does here: B queues behind A, and C later queues behind B.
  - What it gives us: Lock/transactionid for B and Lock/tuple for C at the first observation.
- **pg_backend_pid()** (SQL function): Returns a connection's backend PID.
  - What it does here: Labels A, B, and C for matching graph edges.
  - What it gives us: a_pid, b_pid, and c_pid values in the waiting_for arrays.
- **pg_sleep(1)** (SQL function): Pauses a backend so the queue can settle.
  - What it does here: Gives B and C time to become blocked before inspection.
  - What it gives us: A stable snapshot of two waiting backends.
- **pg_blocking_pids(pid)** (SQL function): Returns the PIDs directly blocking the supplied backend.
  - What it does here: Builds the waiting_for array for every active backend.
  - What it gives us: B -> A first, then C -> B after A commits.
- **cardinality(pg_blocking_pids(pid)) > 0** (array function and filter): Tests whether the blocker array has any members.
  - What it does here: Keeps only backends that are actually waiting.
  - What it gives us: A compact view of the queue rather than unrelated sessions.
- **pg_stat_activity** (system view): Provides wait_event_type and wait_event alongside each PID.
  - What it does here: Adds the reason for each wait to the graph.
  - What it gives us: Lock/transactionid versus Lock/tuple as the queue advances.
- **COMMIT** (SQL transaction command): Releases the current holder's row lock.
  - What it does here: Wakes B, but C remains behind B until B commits.
  - What it gives us: The second observation proving one-step-at-a-time queue draining.

## Setup
```sql
create table if not exists lk_t(id int primary key, val text);
truncate lk_t;
insert into lk_t(id, val) select g, 'row ' || g from generate_series(1, 5) g;
```

## Run
```sql
-- Session A
begin;
select id, val from lk_t where id = 2 for update;
select pg_backend_pid() as a_pid;
-- Session B
begin;
select pg_backend_pid() as b_pid;
-- Session B (blocks until A commits)
update lk_t set val = 'B' where id = 2;
-- Session C
select pg_sleep(1);
begin;
select pg_backend_pid() as c_pid;
-- Session C (blocks until B commits)
update lk_t set val = 'C' where id = 2;
-- Session A
select pg_sleep(1);
select pid, pg_blocking_pids(pid) as waiting_for, wait_event_type, wait_event,
       left(query, 30) as query
from pg_stat_activity
where cardinality(pg_blocking_pids(pid)) > 0
order by pid;
-- Session A
commit;
-- Session A
select pg_sleep(1);
select pid, pg_blocking_pids(pid) as waiting_for, wait_event_type, wait_event
from pg_stat_activity
where cardinality(pg_blocking_pids(pid)) > 0
order by pid;
-- Session B
commit;
-- Session C
commit;
select id, val from lk_t where id = 2;
```

## Expected result
While A holds the row, the first observation lists two blocked backends with different wait
events: B waiting_for = {A pid} on Lock/transactionid, and C waiting_for = {B pid} on Lock/tuple.
That difference is the queue itself - only one waiter at a time holds the tuple lock that gives the
right to wait on the current holder's xid; C is parked behind B. After A commits, the second
observation still lists C, now on Lock/transactionid for {B pid}: the queue advanced by exactly one
and C did not skip ahead. When B commits, C's UPDATE finally runs and the row reads 'C', the last
writer in the queue.

## Systems lens
A lock queue is a scheduler, and conflicting requests can turn one slow holder into head-of-line
latency for everybody behind it. pg_blocking_pids is the same wait-for
graph you would draw for a distributed deadlock detector; the difference is that here it is exact
and local, because every waiter is a process on one node.

## Optional variation
Run the same three sessions but have B and C use SELECT ... FOR SHARE instead of UPDATE. Both
waiters are woken by A's commit and proceed together: the queue is only serial when the requested
modes actually conflict.
