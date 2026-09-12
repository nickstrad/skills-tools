# Advisory locks: mutual exclusion with no row attached

slug: advisory-locks-as-leases
category: locking
difficulty: intermediate
tags: locks, advisory-locks, coordination, leader-election
prerequisites: row-locks-are-in-the-tuple
safety: locking
run-in: tool
sessions: 2
min-version: 16
minutes: 12
revision: 4

## Overview
Advisory locks are the lock manager with the data removed: you pick a 64-bit number, and PostgreSQL
guarantees only one session holds it. They are how people implement leader election, singleton
cron jobs and per-entity mutexes on top of a database they already have. Take one in two scopes -
session and transaction - and watch exactly when it is released.

## Syntax breakdown
### In plain terms

An advisory lock is a coordination token chosen by the application, not a lock attached to a table
row. Here key 42 is a cooperative lock key: one session gets it, another immediately learns it is busy, and a
session-scoped lock survives COMMIT. A transaction-scoped lock on key 99 instead disappears at the
transaction boundary.

### What you are learning

- **Session-scoped advisory locks** live until explicit unlock or connection end.
- **Transaction-scoped advisory locks** release automatically at COMMIT or ROLLBACK.
- **try versus blocking acquisition** lets applications fail fast or wait deliberately.

### Piece by piece

- **pg_try_advisory_lock(42)** (SQL advisory-lock function): Attempts an exclusive session lock without waiting.
  - What it does here: A succeeds and B returns false immediately for the same key.
  - What it gives us: a_got_the_lock = t and b_got_the_lock = f.
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

## Run
```sql
-- Session A
begin;
select pg_backend_pid() as a_pid, pg_try_advisory_lock(42) as a_got_the_lock;
-- Session B
select pg_backend_pid() as b_pid, pg_try_advisory_lock(42) as b_got_the_lock;
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
select count(*) as after_commit from pg_locks where locktype = 'advisory' and pid = pg_backend_pid();
```

## Expected result
A gets a_got_the_lock = t; B gets f, immediately, with no waiting. pg_locks shows a single advisory
row for A: classid = 0, objid = 42, objsubid = 1, mode = ExclusiveLock, granted = t. A's COMMIT does
not release it (session scope), and the second pg_try_advisory_lock(42) in A returns t again -
advisory locks are re-entrant per session and counted, so A now holds it twice while pg_locks still shows one lock row.
pg_advisory_unlock_all() drops the whole count at once, after which B's try succeeds. The
transaction-scoped lock on key 99 shows up in pg_locks inside the transaction and is gone
(after_commit = 0) the moment B commits, with no unlock call.

## Systems lens
This is cooperative mutual exclusion with no expiry and no fencing token. It is safe while the holder's TCP connection is
alive, because the lock dies with the session - but "the session ended" is decided by the database
server, so a partitioned holder can still believe it is the leader while the lock has already been
handed to someone else. Anything the old leader writes afterwards is accepted unless you version
the work yourself. If that matters, store an epoch counter in a row, bump it on acquisition, and
have every write check it: that is the fencing token advisory locks do not give you.

## Optional variation
The core has released A's lock, so reacquire it before testing session loss:
-- Session A
set application_name='lk-advisory-variation';
select pg_advisory_lock(42);
-- Session B
select pg_try_advisory_lock(42) as busy_must_be_false;
select pid as victim_pid from pg_stat_activity
where datname=current_database() and application_name='lk-advisory-variation' \gset
select pg_terminate_backend(:victim_pid,2000) as terminated;
select pg_try_advisory_lock(42) as acquired_after_session_end;
select pg_advisory_unlock(42);

Expect false, successful termination, then true for the try-lock results. This fixture identifies
only the dedicated A session; do not substitute an arbitrary PID. Reconnect A afterward. Killing a
database session proves release at session end, not detection timing for a half-open TCP connection
or safety of writes to an external resource.
