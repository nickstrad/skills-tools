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
### In plain terms

This experiment asks where PostgreSQL stores a row lock. Locking row 1 records transaction
information in the row's tuple header, while a competing writer waits for that transaction's final
decision. You will inspect the stamp with pgrowlocks and inspect the wait with the activity and lock
views, so “waiting for a row” becomes a concrete transaction-id wait.

### What you are learning

- **Tuple-level lock state** is stored with row versions rather than in one lock table.
- **Transaction-ID waits** let a writer wait for the locker's commit or rollback.
- **pgrowlocks and system views** expose the tuple, backend, and wait evidence from different angles.

### Piece by piece

- **SELECT ... FOR UPDATE** (SQL row-locking clause): Reads matching rows and takes the strongest ordinary row lock.
  - What it does here: Session A locks id 1 and keeps the lock until COMMIT.
  - What it gives us: One locked tuple that blocks B's UPDATE.
- **pgrowlocks('lk_t')** (extension function): Scans a table and decodes row-lock metadata.
  - What it does here: Session B inspects the locked row while A's transaction is open.
  - What it gives us: locked_row (ctid), locker (xid), multi, xids, modes, and pids; modes = {For Update} names the lock.
- **pg_current_xact_id()** (SQL function): Returns the current transaction's ID.
  - What it does here: Gives A's xid for comparison with pgrowlocks and pg_locks.
  - What it gives us: a_xid, which should match locker.
- **pg_backend_pid()** (SQL function): Returns this connection's server process ID.
  - What it does here: Identifies A and lets you match it to activity rows.
  - What it gives us: a_pid and the pids array in pgrowlocks.
- **pg_sleep(1)** (SQL function): Pauses the current backend for one second.
  - What it does here: Keeps the lock and B's wait visible long enough to inspect.
  - What it gives us: A wait_event of Timeout/PgSleep for A, not a lock wait.
- **pg_stat_activity** (system view): Lists one row per connected backend and its current state.
  - What it does here: Filters for backends waiting on locks.
  - What it gives us: B as active with wait_event_type = Lock and wait_event = transactionid.
- **pg_locks** (system view): Lists held and requested lock records.
  - What it does here: Shows each backend's own xid lock and B's request on A's xid.
  - What it gives us: transactionid, mode, and granted = false for B's ShareLock request.
- **COMMIT** (SQL transaction command): Publishes A's work and releases its transaction locks.
  - What it does here: Lets B's blocked UPDATE finish.
  - What it gives us: B writes the row and pgrowlocks reports still_locked = 0.
`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 13 "Row-Level Locks" (sections "Lock Design", "Row-Level Locking Modes"); Chapter 12 "Relation-Level Locks" (section "Locks on Transaction IDs")`,
      readingNotes: code`
Chapters 12 and 13 explain that row locks are represented through tuple metadata and waits on the
locker transaction ID. This lesson shows the same mechanism live through pgrowlocks, pg_stat_activity,
and pg_locks; read the chapters before running it to recognize the xid and lock-mode vocabulary.`,
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
### In plain terms

Three sessions queue for one row. The first waiter waits on the holder, while the next waiter waits
behind that first waiter, creating a wait-for graph (a directed list of who blocks whom). The query
turns that graph into rows you can read before and after the first transaction commits.

### What you are learning

- **Wait queues** preserve arrival order when conflicting lock requests compete.
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
`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 13 "Row-Level Locks" (section "Wait Queue"); Chapter 12 "Relation-Level Locks" (section "Wait Queue")`,
      readingNotes: code`
The wait-queue sections of Chapters 12 and 13 explain why a blocked lock request has a blocker and
why later requests remain queued. This lesson adds pg_blocking_pids and wait-event output as an
operational view of that graph; read the chapters first, then use this experiment to practice
identifying the current head of the queue.`,
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
### In plain terms

This experiment creates a cycle: A holds row 1 and requests row 2 while B holds row 2 and requests
row 1. A deadlock is a wait where nobody can proceed, so PostgreSQL waits briefly, detects the cycle,
and aborts one transaction. The surviving transaction can commit, while the client must retry the
aborted unit of work.

### What you are learning

- **Deadlocks** are cycles in a wait-for graph, not merely long waits.
- **deadlock_timeout** controls when PostgreSQL checks for a cycle; it does not prevent one.
- **40P01** identifies a retryable deadlock victim and the whole transaction must be redone.

### Piece by piece

- **SHOW deadlock_timeout** (SQL inspection command): Reads the server/session deadlock-check delay.
  - What it does here: Establishes the wait threshold before the detector runs.
  - What it gives us: Usually 1s, though the lab's configured value is authoritative.
- **UPDATE lk_t ... WHERE id = 1 or 2** (SQL row update): Takes a row lock while changing a row.
  - What it does here: Gives A row 1 and B row 2, then makes each request the other's row.
  - What it gives us: The two edges needed for a cycle.
- **pg_sleep(1)** (SQL function): Pauses B while A's conflicting request is already queued.
  - What it does here: Makes the deadlock ordering reproducible.
  - What it gives us: Enough elapsed time for the detector to report the cycle.
- **deadlock_timeout** (server/session setting): Sets how long a lock wait lasts before a deadlock search.
  - What it does here: Determines when B's second UPDATE is checked.
  - What it gives us: A roughly one-second delay before ERROR: deadlock detected.
- **ROLLBACK** (SQL transaction command): Aborts the victim and releases its locks.
  - What it does here: Cleans up B after the error so A can proceed.
  - What it gives us: A's updates can commit; B's pending change disappears.
- **COMMIT** (SQL transaction command): Publishes the surviving transaction and releases its locks.
  - What it does here: Lets A finish after B is aborted.
  - What it gives us: Rows 1 and 2 contain A's values.
`,
      reading: code`PostgreSQL 14 Internals, Chapter 13 "Row-Level Locks" (section "Deadlocks")`,
      readingNotes: code`
Chapter 13's deadlock section explains the cycle formed by conflicting row updates and the detector's
victim behavior. This lesson reproduces that cycle and records the DETAIL and CONTEXT diagnostics;
read the section before running it, then compare its abstract graph with the two concrete statements.`,
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
### In plain terms

This experiment compares three ways to handle a busy row: wait only briefly, fail immediately, or
choose other unlocked rows. lock_timeout limits time spent waiting; NOWAIT refuses instantly; SKIP
LOCKED omits busy rows. These choices matter because an unbounded wait can consume a connection even
when the application has useful work elsewhere.

### What you are learning

- **lock_timeout** limits lock acquisition time and returns an error when the limit is reached.
- **NOWAIT** fails immediately, while **SKIP LOCKED** succeeds with a partial result.
- **statement_timeout** measures total statement runtime, not just time waiting for a lock.

### Piece by piece

- **SET lock_timeout = '500ms'** (session setting command): Configures the maximum lock wait for this connection.
  - What it does here: Limits B's UPDATE against A's locked row.
  - What it gives us: “canceling statement due to lock timeout” after about half a second.
- **RESET lock_timeout** (session setting command): Restores the setting's default value.
  - What it does here: Removes the artificial timeout before testing NOWAIT and SKIP LOCKED.
  - What it gives us: Those clauses, rather than the setting, determine the result.
- **SELECT ... FOR UPDATE** (SQL row-lock clause): Reads and locks id 3.
  - What it does here: A holds the row that all B variants test.
  - What it gives us: A controlled conflict.
- **FOR UPDATE NOWAIT** (SQL locking option): Requests a row lock without waiting.
  - What it does here: B immediately tries locked id 3, then retries after A commits.
  - What it gives us: A lock-not-available error first and id = 3 after release.
- **FOR UPDATE SKIP LOCKED** (SQL locking option): Ignores rows whose locks cannot be acquired immediately.
  - What it does here: Reads all rows while silently omitting id 3.
  - What it gives us: ids 1, 2, 4, 5; the plain count remains 5 because no rows were deleted.
- **SET/RESET statement_timeout** (session setting in the challenge): Controls total runtime of a statement.
  - What it does here: Contrasts a runtime timeout with the lock-only timeout.
  - What it gives us: A slow query can be killed even when it is not waiting on a lock.
- **COMMIT** (SQL transaction command): Releases A's row lock.
  - What it does here: Lets B's final NOWAIT query succeed.
  - What it gives us: id = 3 is available after the commit.
`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 13 "Row-Level Locks" (section "No-Wait Locks")`,
      readingNotes: code`
Chapter 13 describes no-wait row-lock behavior and the alternatives to blocking. This lesson
compares NOWAIT and SKIP LOCKED with the operational lock_timeout setting, which the book does not
demonstrate as a timeout policy. Read the chapter before running it, then treat the output as a
decision table for contention handling.`,
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
### In plain terms

This experiment asks why a harmless-looking SELECT can be delayed by a schema change. A long SELECT
holds a shared table lock; ALTER TABLE requests an exclusive lock and queues; later readers queue
behind that writer even though they would be compatible with the first SELECT. This is head-of-line
blocking: the queued exclusive request makes the whole line wait.

### What you are learning

- **AccessShareLock** protects a table while SELECT reads it.
- **AccessExclusiveLock** conflicts with every table lock and is used by many ALTER TABLE operations.
- **Fair lock queues** can make compatible readers wait behind an incompatible request.

### Piece by piece

- **SELECT pg_sleep(8) FROM lk_t WHERE id = 1** (SQL query and sleep function): Reads the table while pausing for eight seconds.
  - What it does here: Keeps A's AccessShareLock held during the inspection.
  - What it gives us: A with wait_event Timeout/PgSleep, showing it is slow rather than lock-blocked.
- **ALTER TABLE ... ADD COLUMN IF NOT EXISTS x int** (DDL statement and idempotent clause): Requests a schema change, creating x only if absent.
  - What it does here: B queues for AccessExclusiveLock behind A.
  - What it gives us: B's pg_locks row with mode AccessExclusiveLock and granted = false.
- **DROP COLUMN IF EXISTS x** (DDL statement and conditional clause)
  - What it is: Removes x only when it exists, avoiding a setup error on reruns.
  - What it does here: Resets the table before and after the experiment.
  - What it gives us: A repeatable lab with no extra column left behind.
- **pg_locks** (system view): Lists held and requested lock records.
  - What it does here: Shows relation, mode, and granted for lk_t.
  - What it gives us: granted = true for A's AccessShareLock and false for B's AccessExclusiveLock.
- **'lk_t'::regclass** (PostgreSQL catalog-name cast): Resolves the table name to its relation OID.
  - What it does here: Filters pg_locks to this table rather than every relation.
  - What it gives us: Only lock rows for lk_t.
- **pg_stat_activity** (system view): Reports each backend's PID and wait state.
  - What it does here: Joins lock rows to the query and wait information.
  - What it gives us: B waiting on Lock/relation and A waiting on Timeout/PgSleep.
- **COMMIT** (SQL transaction command): Ends A's transaction and releases its table lock.
  - What it does here: Lets B's ALTER run, then allows C's queued SELECT to run.
  - What it gives us: rows_now = 5 and x_values = 0 after the column exists.
`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 12 "Relation-Level Locks" (sections "Relation-Level Locks", "Wait Queue")`,
      readingNotes: code`
Chapter 12 explains relation-level lock modes and the wait queue that makes an AccessExclusiveLock
request block later readers. This lesson demonstrates the operational head-of-line effect with
pg_locks and pg_stat_activity; read the chapter first, then use the three sessions to see why a
queued migration can affect queries that do not conflict with the original reader.`,
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
### In plain terms

An advisory lock is a coordination token chosen by the application, not a lock attached to a table
row. Here key 42 acts as a lease: one session gets it, another immediately learns it is busy, and a
session-scoped lock survives COMMIT. A transaction-scoped lock on key 99 instead disappears at the
transaction boundary.

### What you are learning

- **Session-scoped advisory locks** live until explicit unlock or connection end.
- **Transaction-scoped advisory locks** release automatically at COMMIT or ROLLBACK.
- **try versus blocking acquisition** lets applications fail fast or wait deliberately.

### Piece by piece

- **pg_try_advisory_lock(42)** (SQL advisory-lock function): Attempts an exclusive session lock without waiting.
  - What it does here: A succeeds and B returns false immediately for the same key.
  - What it gives us: a_got_the_lease = t and b_got_the_lease = f.
- **pg_advisory_lock(key)** (SQL advisory-lock function): Takes a session-scoped lock and waits if needed.
  - What it does here: It is the blocking counterpart described for variations of this experiment.
  - What it gives us: A lock held until explicit unlock or connection termination, not COMMIT.
- **pg_locks WHERE locktype = 'advisory'** (system view and filter): Lists advisory lock records.
  - What it does here: Shows key 42's metadata and owner PID.
  - What it gives us: classid = 0, objid = 42, objsubid = 1, mode ExclusiveLock, granted = true.
- **pg_advisory_unlock_all()** (SQL advisory-lock function): Releases all session advisory locks for this connection.
  - What it does here: Drops A's re-entrant lock count at once.
  - What it gives us: a_holds_now = 0 and B can acquire key 42.
- **pg_advisory_unlock(42)** (SQL advisory-lock function): Releases one acquisition of a session lock.
  - What it does here: Lets B clean up its key after acquiring it.
  - What it gives us: No lingering session lock for key 42.
- **BEGIN / COMMIT** (SQL transaction commands): Open and finish a transaction.
  - What they do here: Scope the lock on key 99 to B's transaction.
  - What they give us: after_commit = 0 without an unlock call.
- **pg_advisory_xact_lock(99)** (SQL transaction-scoped advisory function): Takes an exclusive lock released automatically at transaction end.
  - What it does here: Holds key 99 only while B's transaction is open.
  - What it gives us: A pg_locks row inside the transaction and none afterward.
`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 14 "Miscellaneous Locks" (section "Advisory Locks")`,
      readingNotes: code`
Chapter 14 describes advisory locks as application-chosen lock keys and distinguishes their scope
from ordinary relation or row locks. This lesson makes session and transaction scope visible in
pg_locks and adds the nonblocking try function; read the chapter before running it, then consider
the lease failure modes described in the lesson's systems lens.`,
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
### In plain terms

This experiment turns a table into a small work queue. Each worker selects and locks the first
unfinished row it can get, while SKIP LOCKED makes a second worker move to another job instead of
waiting. A claim lasts only until COMMIT or ROLLBACK, so a rolled-back or crashed worker leaves its
job available again.

### What you are learning

- **SKIP LOCKED** lets competing workers take different jobs without queueing behind a busy row.
- **Transaction-held claims** become durable only when the worker commits its done flag.
- **Plain FOR UPDATE** creates a convoy when workers choose the same first unlocked row.

### Piece by piece

- **WHERE not done** (SQL boolean filter): Keeps only jobs whose done flag is false.
  - What it does here: Selects work that has not been completed.
  - What it gives us: Jobs 1–4 initially, then only jobs 3–4 after the first pair commits.
- **ORDER BY id** (SQL ordering clause): Sorts candidates by their numeric job id.
  - What it does here: Makes “first job” deterministic.
  - What it gives us: A normally gets 1 and B gets 2 when SKIP LOCKED is used.
- **FOR UPDATE SKIP LOCKED LIMIT 1** (SQL locking, skip, and limit clauses): Locks one candidate and ignores candidates already locked.
  - What it does here: Claims one different row per worker without waiting.
  - What it gives us: Two locked tuples with different pids and no blocking.
- **pgrowlocks('lk_jobs')** (extension function): Decodes row-lock metadata for the queue table.
  - What it does here: Shows who holds each live claim.
  - What it gives us: locked_row, locker, modes, and pids for jobs 1 and 2.
- **UPDATE lk_jobs SET done = true WHERE id = ...** (SQL data change): Marks a claimed job complete.
  - What it does here: Changes each worker's selected row before commit.
  - What it gives us: Final states 1/t, 2/t, 3/f, 4/f.
- **COMMIT / ROLLBACK** (SQL transaction commands): Publish or discard the claim and its done update.
  - What they do here: First pair commits; the plain-FOR-UPDATE comparison rolls back.
  - What they give us: Committed jobs stay done, while job 3 becomes available after A rolls back.
- **FOR UPDATE LIMIT 1** (SQL locking without SKIP LOCKED): Locks the first candidate and waits if it is busy.
  - What it does here: Makes B queue behind A rather than choosing another job.
  - What it gives us: B waits on Lock/transactionid and later receives job 3.
- **pg_stat_activity** (system view): Reports backend wait events.
  - What it does here: Confirms the plain-lock worker is blocked.
  - What it gives us: B's PID with wait_event_type = Lock.
`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 13 "Row-Level Locks" (section "No-Wait Locks"); Chapter 8 "Rebuilding Tables and Indexes" (section "Precautions")`,
      readingNotes: code`
Chapter 13 covers no-wait row-lock variants, including the behavior behind SKIP LOCKED; Chapter 8's
precautions discuss the operational consequences of holding locks while work proceeds. The lesson
extends those mechanisms into a transactional queue pattern and shows pgrowlocks evidence. Read
Chapter 13 first, then run the experiment; use Chapter 8 as an operational follow-up.`,
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
`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 12 "Relation-Level Locks" (section "Locks on Transaction IDs"); Chapter 19 "Index Access Methods" (section "Indexing Engine Interface")`,
      readingNotes: code`
Chapter 12 explains waits on transaction IDs, and Chapter 19 describes index access-method properties
including uniqueness enforcement. This lesson combines those mechanisms in a two-inserter race and
adds the user-facing ON CONFLICT outcome, which the book does not present as a full exercise. Read
the chapters before running it, then use pg_locks to connect the index decision to xid state.`,
      revision: 3,
      studyCheckpoint: {
        core: [
          {
            source: "PostgreSQL 14 Internals",
            locator: `Chapter 12 §12.5 "Wait Queue" (printed pp. 206–209)`,
          },
          {
            source: "PostgreSQL 14 Internals",
            locator: `Chapter 13 §13.1 "Lock Design" (printed pp. 210–211)`,
          },
          {
            source: "PostgreSQL 14 Internals",
            locator:
              `Chapter 13 §13.4 "Wait Queue", subheading "Exclusive Modes" (printed pp. 215–220)`,
          },
          {
            source: "PostgreSQL 14 Internals",
            locator: `Chapter 13 §13.6 "Deadlocks" (printed pp. 225–230)`,
          },
        ],
        rationale: code`
You observed tuple row locks, blocking queues, and deadlocks in lessons 31–38. Read these selected
sections to consolidate row-lock storage, queued ownership, and deadlock detection. Keep the lessons
as your primary treatment of NOWAIT/SKIP LOCKED, advisory locks, and unique-key races; the assigned
excerpts do not cover those workflows. Skip from the PG14 text: multixact internals, exact lock
catalog rows, and version-specific output/API details; resume with lesson 39 when you finish.
`,
      },
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
