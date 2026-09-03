import { code, type Module } from "../../../src/types.ts";

export const LOCKING: Module = {
  category: "locking",
  title: "Locks, queues, deadlocks, and DDL",
  lessons: [
    {
      slug: "row-locks-are-in-the-tuple",
      tags: ["locks", "row-locks", "pages-and-tuples"],
      title: "Row locks live in the tuple, not in a lock table",
      difficulty: "intermediate",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      prerequisites: ["install-lab-extensions", "process-model"],
      overview: code`
PostgreSQL keeps no in-memory table of row locks. Locking a row stamps the locker's transaction id
into the tuple header (xmax) plus a few infomask bits, so the number of locked rows is bounded by
disk, not by shared memory. A second writer that hits a locked row therefore does not wait on a
"row lock": it waits on the locker's transaction id. You will see both halves - the stamp in the
tuple via pgrowlocks, and the wait on a transactionid in pg_stat_activity.`,
      syntaxBreakdown: code`
SELECT ... FOR UPDATE takes the strongest row lock (blocks other writers and other FOR UPDATE).
pgrowlocks('t') scans a table and decodes every locked tuple: locked_row (the ctid), locker (the
xid), multi (whether it is a MultiXactId), xids, modes, pids. pg_current_xact_id() materialises the
current transaction's id. pg_stat_activity.wait_event_type / wait_event name what a backend is
waiting on; Lock / transactionid means "waiting for another transaction to end".`,
      setup: code`
create table if not exists lk_t(id int primary key, val text);
truncate lk_t;
insert into lk_t(id, val) select g, 'row ' || g from generate_series(1, 5) g;`,
      code: code`
-- Session A
begin;
select id, val from lk_t where id = 1 for update;
select pg_current_xact_id() as a_xid, pg_backend_pid() as a_pid;
-- Session B
select locked_row, locker, multi, modes, pids from pgrowlocks('lk_t');
-- Session B (blocks until A commits)
update lk_t set val = 'written by B' where id = 1;
-- Session A
select pg_sleep(1);
select pid, state, wait_event_type, wait_event, left(query, 40) as query
from pg_stat_activity
where wait_event_type = 'Lock';
select pid, locktype, transactionid, mode, granted
from pg_locks where locktype = 'transactionid' order by granted desc;
-- Session A
commit;
-- Session B
select id, val from lk_t where id = 1;
select count(*) as still_locked from pgrowlocks('lk_t');`,
      expectedResult: code`
pgrowlocks shows exactly one row: locked_row = (0,1), locker = A's xid (e.g. 842), multi = f,
modes = {"For Update"}, pids = {A's pid}. B's UPDATE then hangs. From A, pg_stat_activity shows B
as state = active with wait_event_type = Lock and wait_event = transactionid - B is waiting for a
transaction, not for a row. pg_locks lists three transactionid rows: each backend holds an
ExclusiveLock on its own xid (granted = t) and B additionally requests ShareLock on A's xid with
granted = f. After A commits, B's UPDATE completes immediately, the row reads 'written by B', and
pgrowlocks reports still_locked = 0.`,
      systemsLens: code`
Lock state that lives with the data instead of in a central table is what lets one transaction lock
a million rows without a memory budget - the same trade every storage system makes when it chooses
per-record metadata over a lock manager. The cost is that the waiter cannot be woken by "row 1 is
free"; it must wait on the whole transaction's outcome, which is why one slow transaction stalls
every writer that touches any row it holds.`,
      challenge: code`
Redo the experiment with SELECT ... FOR SHARE in both sessions and watch pgrowlocks report
modes = {"For Share"} with neither session blocking. Then have a third session FOR UPDATE the same
row and see multi flip to t: two sharers no longer fit in one xmax, so PostgreSQL allocates a
MultiXactId.`,
    },
    {
      slug: "lock-queue-and-blocking-pids",
      tags: ["locks", "row-locks", "lock-queue", "wait-events"],
      title: "Read the wait-for graph: lock queues are FIFO",
      difficulty: "intermediate",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 3,
      estimatedMinutes: 15,
      prerequisites: ["row-locks-are-in-the-tuple"],
      overview: code`
Three sessions want the same row. PostgreSQL does not hand it to whoever asks next; waiters queue
in arrival order, and pg_blocking_pids() reports the edges of the resulting wait-for graph. Watch
the queue drain one transaction at a time, and notice that the second waiter is still stuck after
the first holder commits.`,
      syntaxBreakdown: code`
pg_blocking_pids(pid) returns the array of backend PIDs that the given backend is waiting for -
this is the wait-for graph the deadlock detector walks. cardinality() gives an array's length.
Joining pg_stat_activity to it turns the graph into a human-readable queue.`,
      setup: code`
create table if not exists lk_t(id int primary key, val text);
truncate lk_t;
insert into lk_t(id, val) select g, 'row ' || g from generate_series(1, 5) g;`,
      code: code`
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
select id, val from lk_t where id = 2;`,
      expectedResult: code`
While A holds the row, the first observation lists two blocked backends with different wait
events: B waiting_for = {A pid} on Lock/transactionid, and C waiting_for = {B pid} on Lock/tuple.
That difference is the queue itself - only one waiter at a time holds the tuple lock that gives the
right to wait on the current holder's xid; C is parked behind B. After A commits, the second
observation still lists C, now on Lock/transactionid for {B pid}: the queue advanced by exactly one
and C did not skip ahead. When B commits, C's UPDATE finally runs and the row reads 'C', the last
writer in the queue.`,
      systemsLens: code`
A lock queue is a scheduler, and a FIFO scheduler converts one slow holder into unbounded latency
for everybody behind it - classic head-of-line blocking. pg_blocking_pids is the same wait-for
graph you would draw for a distributed deadlock detector; the difference is that here it is exact
and local, because every waiter is a process on one node.`,
      challenge: code`
Run the same three sessions but have B and C use SELECT ... FOR SHARE instead of UPDATE. Both
waiters are woken by A's commit and proceed together: the queue is only serial when the requested
modes actually conflict.`,
    },
    {
      slug: "deadlock-detection",
      tags: ["locks", "deadlocks"],
      title: "Cause a deadlock and read the detector's report",
      difficulty: "intermediate",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      prerequisites: ["lock-queue-and-blocking-pids"],
      overview: code`
PostgreSQL does not prevent deadlocks; it detects them. A backend that has waited deadlock_timeout
(1 s by default) stops waiting, walks the wait-for graph, and if it finds a cycle it aborts itself
with ERROR: deadlock detected. Build the textbook cycle - A holds row 1 and wants row 2, B holds
row 2 and wants row 1 - and read the DETAIL that names both processes and both statements.`,
      syntaxBreakdown: code`
deadlock_timeout is how long a backend waits before running the (relatively expensive) cycle check;
it is a latency knob, not a correctness knob. The victim is the backend that ran the check, so
which transaction dies depends on timing. ERRCODE 40P01 (deadlock_detected) is retryable: the
application is expected to redo the whole transaction.`,
      setup: code`
create table if not exists lk_t(id int primary key, val text);
truncate lk_t;
insert into lk_t(id, val) select g, 'row ' || g from generate_series(1, 5) g;`,
      code: code`
-- Session A
show deadlock_timeout;
begin;
update lk_t set val = 'A took 1' where id = 1;
-- Session B
begin;
update lk_t set val = 'B took 2' where id = 2;
-- Session A (blocks: A wants row 2, which B holds)
update lk_t set val = 'A wants 2' where id = 2;
-- Session B
select pg_sleep(1);
update lk_t set val = 'B wants 1' where id = 1;
-- Session B
rollback;
-- Session A
commit;
select id, val from lk_t where id in (1, 2) order by id;`,
      expectedResult: code`
Session B's second UPDATE waits one deadlock_timeout and then fails with
ERROR:  deadlock detected
DETAIL:  Process <B> waits for ShareLock on transaction <A's xid>; blocked by process <A>.
Process <A> waits for ShareLock on transaction <B's xid>; blocked by process <B>.
HINT:  See server log for query details.
CONTEXT:  while updating tuple (0,1) in relation "lk_t"
B is the victim because B is the backend whose timer expired and that ran the check. A is released
immediately and commits, so rows 1 and 2 read 'A took 1' and 'A wants 2'. The same DETAIL, plus
both full query texts, is written to the server log.`,
      systemsLens: code`
Detection instead of prevention is a deliberate trade: prevention would need a global lock ordering
or a wait-die scheme that aborts transactions that were never actually in a cycle. The price is
that deadlock is a normal, expected runtime error, so every client of a database - or of any system
with multi-resource locking - needs an idempotent retry loop. The cheap prevention that does work
is application-side lock ordering: always touch rows in a fixed key order and no cycle can form.`,
      challenge: code`
Rewrite both transactions to touch rows in ascending id order (A: 1 then 2, B: 1 then 2). The
second transaction now simply queues behind the first, and no deadlock is possible. Then try three
sessions in a ring to confirm the detector finds cycles longer than two.`,
      caution: code`
One of the two transactions is aborted on purpose. Do not run this against anything but the lab.`,
    },
    {
      slug: "lock-timeout-and-nowait",
      tags: ["locks", "timeouts", "skip-locked"],
      title: "Bound the wait: lock_timeout, NOWAIT, and SKIP LOCKED",
      difficulty: "intermediate",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 12,
      prerequisites: ["lock-queue-and-blocking-pids"],
      overview: code`
By default a blocked statement waits forever. Three mechanisms bound that wait, and they fail in
three different ways: lock_timeout cancels the statement after a deadline, NOWAIT errors out
immediately, and SKIP LOCKED silently returns the rows nobody else holds. Trigger all three against
the same locked row.`,
      syntaxBreakdown: code`
SET lock_timeout = '500ms' aborts any statement that has waited that long for a lock (ERRCODE
55P03, lock_not_available). FOR UPDATE NOWAIT raises the same error class without waiting at all.
FOR UPDATE SKIP LOCKED omits locked rows from the result instead of erroring. statement_timeout is
the blunter cousin: it also kills statements that are merely slow.`,
      setup: code`
create table if not exists lk_t(id int primary key, val text);
truncate lk_t;
insert into lk_t(id, val) select g, 'row ' || g from generate_series(1, 5) g;`,
      code: code`
-- Session A
begin;
select id, val from lk_t where id = 3 for update;
-- Session B
set lock_timeout = '500ms';
update lk_t set val = 'B' where id = 3;
-- Session B
reset lock_timeout;
select id from lk_t where id = 3 for update nowait;
-- Session B
select id, val from lk_t order by id for update skip locked;
-- Session B
select count(*) as visible_rows from lk_t;
-- Session A
commit;
-- Session B
select id from lk_t where id = 3 for update nowait;`,
      expectedResult: code`
The first UPDATE returns after roughly half a second with
ERROR:  canceling statement due to lock timeout
CONTEXT:  while updating tuple (0,3) in relation "lk_t"
The NOWAIT SELECT fails instantly with
ERROR:  could not obtain lock on row in relation "lk_t"
SKIP LOCKED succeeds and returns rows 1, 2, 4, 5 - row 3 is silently missing, which is why the plain
count(*) still reports 5: SKIP LOCKED changes which rows you may claim, not which rows exist. After
A commits, the same NOWAIT statement succeeds and returns id = 3.`,
      systemsLens: code`
These are the three answers to "what do I do when a resource is busy": wait with a deadline, fail
fast, or take different work. Migrations want lock_timeout plus retry so a schema change never
becomes an outage; job queues want SKIP LOCKED so workers steal work instead of queueing. The
dangerous default is the unbounded wait, because it converts contention into a connection leak -
every blocked backend still occupies a slot.`,
      challenge: code`
Set lock_timeout = '1ms' and run the SKIP LOCKED query again: it still succeeds, because it never
waits. Then compare with statement_timeout = '1ms', which kills it - timeouts on waiting and
timeouts on running are different controls.`,
    },
    {
      slug: "ddl-behind-a-long-query",
      tags: ["locks", "relation-locks", "ddl", "migrations"],
      title: "One ALTER TABLE behind one long query stops all readers",
      difficulty: "advanced",
      safetyLevel: "ddl",
      runIn: "tool",
      sessions: 3,
      estimatedMinutes: 15,
      prerequisites: ["lock-queue-and-blocking-pids"],
      overview: code`
Every SELECT takes an AccessShareLock on the tables it reads. ALTER TABLE wants AccessExclusiveLock,
which conflicts with everything - including AccessShareLock. Because the lock queue is fair, the
waiting ALTER also blocks every reader that arrives after it, even though those readers would not
have conflicted with the query that is actually running. This is how a one-line migration takes a
production database down.`,
      syntaxBreakdown: code`
pg_locks has one row per held or requested lock: relation (an oid, cast from 'lk_t'::regclass),
mode, and granted. granted = false means "queued". AccessShareLock is taken by SELECT,
RowExclusiveLock by INSERT/UPDATE/DELETE, AccessExclusiveLock by most forms of ALTER TABLE, TRUNCATE
and DROP. The lock modes and their conflict matrix are in the "Explicit Locking" chapter.`,
      setup: code`
create table if not exists lk_t(id int primary key, val text);
truncate lk_t;
insert into lk_t(id, val) select g, 'row ' || g from generate_series(1, 5) g;
alter table lk_t drop column if exists x;`,
      code: code`
-- Session A (blocks: an 8-second read holding AccessShareLock on lk_t)
begin;
select pg_sleep(8) from lk_t where id = 1;
-- Session B (blocks until A's transaction ends)
alter table lk_t add column if not exists x int;
-- Session C
select pg_sleep(2);
select a.pid, l.mode, l.granted, a.wait_event_type, a.wait_event, left(a.query, 32) as query
from pg_locks l join pg_stat_activity a using (pid)
where l.relation = 'lk_t'::regclass
order by l.granted desc, a.pid;
-- Session C (blocks: a harmless SELECT, now stuck behind the queued ALTER)
select count(*) from lk_t;
-- Session A
commit;
-- Session C
select count(*) as rows_now, count(x) as x_values from lk_t;
-- Session A
alter table lk_t drop column if exists x;`,
      expectedResult: code`
Two seconds in, the join over pg_locks prints exactly two rows for lk_t:
 pid   |        mode         | granted | wait_event_type | wait_event
 <A>   | AccessShareLock     | t       | Timeout         | PgSleep
 <B>   | AccessExclusiveLock | f       | Lock            | relation
A is not waiting for anything (it is just slow); B is queued on the relation lock. C's plain
SELECT, issued next, then hangs too - even though SELECT never conflicts with SELECT - because the
queue is fair and B is ahead of it. You see that as a stopwatch: C's count(*) does not return until
A's 8-second query has finished and A has committed, at which point the ALTER runs and C reports
rows_now = 5, x_values = 0. The 8 seconds is only to keep the experiment inside the 30-second
validation budget - in production the blocking query is whatever your slowest report or forgotten
"idle in transaction" session is, and the readers stay down for exactly that long.`,
      systemsLens: code`
A fair queue in front of an exclusive lock turns a compatible workload into a serial one: the
system is not slow because of the writer, it is slow because of everything the writer made wait.
The operational rule that follows is to never let a schema change wait: SET lock_timeout to a
second or two, run the ALTER, and retry on failure, so the worst case is a failed migration instead
of a stalled database. The same shape appears in any reader-writer lock, in rolling restarts, and
in any queue where a big item is allowed to hold the head.`,
      challenge: code`
Repeat with SET lock_timeout = '1s' in Session B. The ALTER now aborts with "canceling statement
due to lock timeout" and, crucially, Session C never blocks at all - bounding the writer's wait
protects the readers behind it. Then check which ALTER TABLE forms avoid the exclusive lock
entirely (ALTER TABLE ... ADD COLUMN with a non-volatile default is metadata-only in modern
PostgreSQL, and CREATE INDEX CONCURRENTLY exists for the same reason).`,
      caution: code`
This lesson deliberately blocks all readers of lk_t for about ten seconds.`,
    },
    {
      slug: "advisory-locks-as-leases",
      tags: ["locks", "advisory-locks", "leases", "leader-election"],
      title: "Advisory locks: mutual exclusion with no row attached",
      difficulty: "intermediate",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 12,
      prerequisites: ["row-locks-are-in-the-tuple"],
      overview: code`
Advisory locks are the lock manager with the data removed: you pick a 64-bit number, and PostgreSQL
guarantees only one session holds it. They are how people implement leader election, singleton
cron jobs and per-entity mutexes on top of a database they already have. Take one in two scopes -
session and transaction - and watch exactly when it is released.`,
      syntaxBreakdown: code`
pg_try_advisory_lock(key) returns true or false immediately and never waits; pg_advisory_lock(key)
waits. Session-scoped locks live until pg_advisory_unlock(key) or the session ends - not until
commit. pg_advisory_xact_lock(key) is released automatically at end of transaction and cannot be
unlocked early. In pg_locks they appear as locktype = 'advisory' with classid = 0 and the key in
objid; objsubid = 1 marks the single-bigint key space (2 marks the two-int form).`,
      code: code`
-- Session A
begin;
select pg_backend_pid() as a_pid, pg_try_advisory_lock(42) as a_got_the_lease;
-- Session B
select pg_backend_pid() as b_pid, pg_try_advisory_lock(42) as b_got_the_lease;
select locktype, classid, objid, objsubid, mode, granted, pid
from pg_locks where locktype = 'advisory' order by pid;
-- Session A
commit;
select pg_try_advisory_lock(42) as a_reacquired_after_commit;
select count(*) as a_holds from pg_locks where locktype = 'advisory' and pid = pg_backend_pid();
-- Session A
select pg_advisory_unlock_all();
select count(*) as a_holds_now from pg_locks where locktype = 'advisory' and pid = pg_backend_pid();
-- Session B
select pg_try_advisory_lock(42) as b_got_it_now;
select pg_advisory_unlock(42);
-- Session B
begin;
select pg_advisory_xact_lock(99);
select objid, mode from pg_locks where locktype = 'advisory' and pid = pg_backend_pid();
commit;
select count(*) as after_commit from pg_locks where locktype = 'advisory' and pid = pg_backend_pid();`,
      expectedResult: code`
A gets a_got_the_lease = t; B gets f, immediately, with no waiting. pg_locks shows a single advisory
row for A: classid = 0, objid = 42, objsubid = 1, mode = ExclusiveLock, granted = t. A's COMMIT does
not release it (session scope), and the second pg_try_advisory_lock(42) in A returns t again -
advisory locks are re-entrant per session and counted, so A now holds it twice and a_holds = 1 row.
pg_advisory_unlock_all() drops the whole count at once, after which B's try succeeds. The
transaction-scoped lock on key 99 shows up in pg_locks inside the transaction and is gone
(after_commit = 0) the moment B commits, with no unlock call.`,
      systemsLens: code`
This is a lease with no expiry and no fencing token. It is safe while the holder's TCP connection is
alive, because the lock dies with the session - but "the session ended" is decided by the database
server, so a partitioned holder can still believe it is the leader while the lock has already been
handed to someone else. Anything the old leader writes afterwards is accepted unless you version
the work yourself. If that matters, store an epoch counter in a row, bump it on acquisition, and
have every write check it: that is the fencing token advisory locks do not give you.`,
      challenge: code`
Kill A's session with pg_terminate_backend from B and confirm B's pg_try_advisory_lock succeeds
right after - then think about how long a TCP connection can stay half-open with no keepalives,
and what that means for the safety of this lease.`,
    },
    {
      slug: "skip-locked-work-queue",
      tags: ["locks", "skip-locked", "queues", "distributed-patterns"],
      title: "Build a work queue two workers can share",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      prerequisites: ["lock-timeout-and-nowait"],
      overview: code`
FOR UPDATE SKIP LOCKED turns a table into a job queue: each worker claims the first row nobody else
has claimed, and the claim is held by the transaction, so a crashed worker's job is automatically
released. Run two workers against the same table with and without SKIP LOCKED and see the
difference between a queue and a convoy.`,
      syntaxBreakdown: code`
SELECT ... ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1 is the claim: it locks and returns the first
unlocked candidate row. The lock lives until COMMIT or ROLLBACK, so "the worker died" and "the
worker rolled back" are the same event. pgrowlocks shows who currently holds each claim.`,
      setup: code`
create table if not exists lk_jobs(id int primary key, payload text, done boolean not null default false);
truncate lk_jobs;
insert into lk_jobs(id, payload) select g, 'job ' || g from generate_series(1, 4) g;`,
      code: code`
-- Session A
begin;
select id, payload from lk_jobs where not done order by id for update skip locked limit 1;
-- Session B
begin;
select id, payload from lk_jobs where not done order by id for update skip locked limit 1;
-- Session B
select locked_row, locker, modes, pids from pgrowlocks('lk_jobs') order by locked_row;
-- Session A
update lk_jobs set done = true where id = 1;
commit;
-- Session B
update lk_jobs set done = true where id = 2;
commit;
select id, payload, done from lk_jobs order by id;
-- Session A
begin;
select id, payload from lk_jobs where not done order by id for update limit 1;
-- Session B
begin;
-- Session B (blocks: no SKIP LOCKED, so B queues instead of stealing other work)
select id, payload from lk_jobs where not done order by id for update limit 1;
-- Session A
select pg_sleep(1);
select pid, wait_event_type, wait_event from pg_stat_activity where wait_event_type = 'Lock';
-- Session A
rollback;
-- Session B
rollback;`,
      expectedResult: code`
The two claims do not collide: A gets job 1 and B gets job 2, with no waiting at all. pgrowlocks
lists two locked tuples with different lockers, (0,1) held by A's xid and (0,2) held by B's xid,
both with modes = {"For Update"} and pids naming the two backends. After both commit the table
reads 1/t, 2/t, 3/f, 4/f. The second half shows the alternative: with plain FOR UPDATE, A claims
job 3 and B does not move on to job 4 - pg_stat_activity shows B's pid on Lock/transactionid, so
two workers behave like one. After A rolls back, B's query returns job 3, the row A gave up.`,
      systemsLens: code`
This is an at-least-once queue whose delivery guarantee comes from the transaction: a job is claimed
only while a transaction holds it, and it becomes visible as done only when that transaction
commits. That is the same commit-equals-visibility rule that makes the transactional outbox work,
and it is why a database queue does not need a separate broker to be correct - only to be fast. The
limits are real though: every claim is a write, so throughput is bounded by WAL, and the dead rows
from completed jobs make vacuum your queue's real bottleneck.`,
      challenge: code`
Add a status column and a claimed_at timestamp and turn the claim into
UPDATE ... SET status='running' WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *.
Then measure how the table bloats after ten thousand jobs, and compare deleting completed rows
against partitioning them away.`,
    },
    {
      slug: "unique-constraint-race",
      tags: ["locks", "row-locks", "btree", "unique-constraints"],
      title: "Two inserts, one key: where uniqueness is serialized",
      difficulty: "advanced",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      prerequisites: ["row-locks-are-in-the-tuple"],
      overview: code`
A unique index cannot decide anything until it knows whether the conflicting insert commits. So the
second inserter of the same key does not get an error and does not succeed - it waits on the first
inserter's transaction id, exactly like a row lock, and only then learns its fate. Watch the wait,
then the error, then repeat with ON CONFLICT DO NOTHING to see the same wait produce a different
outcome.`,
      syntaxBreakdown: code`
A B-tree unique index enforces uniqueness by inserting the index entry and then, if it finds a
conflicting entry from an in-progress transaction, waiting on that transaction's xid (a ShareLock on
transactionid, visible in pg_locks). ERRCODE 23505 is unique_violation. INSERT ... ON CONFLICT DO
NOTHING performs the same wait and then simply inserts zero rows.`,
      setup: code`
create table if not exists lk_uniq(k int primary key, who text);
truncate lk_uniq;`,
      code: code`
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
select k, who from lk_uniq order by k;`,
      expectedResult: code`
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
the other transaction's commit record.`,
      systemsLens: code`
Uniqueness is a global invariant, so somewhere it has to be serialized; PostgreSQL serializes it at
the index entry and pays for it with a wait that lasts as long as the other transaction. That is the
same reason "check then insert" is never safe in application code and why distributed systems that
want unique keys either route a key to a single owner (partitioning) or give up and use identifiers
that cannot collide (UUIDs, per-node sequences). Note also that ON CONFLICT DO NOTHING does not tell
you which happened, so read-back after the insert is part of the pattern.`,
      challenge: code`
Replace DO NOTHING with ON CONFLICT (k) DO UPDATE SET who = excluded.who and rerun: B now wins and
the row says 'B'. Then try the same race where A rolls back instead of committing, and confirm B's
plain INSERT succeeds - the error is not about the key, it is about the other transaction's fate.`,
    },
  ],
};
