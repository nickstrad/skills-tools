# Row locks live in the tuple, not in a lock table

slug: row-locks-are-in-the-tuple
category: locking
difficulty: intermediate
tags: locks, row-locks, pages-and-tuples
prerequisites: install-lab-extensions, process-model
safety: locking
run-in: tool
sessions: 2
min-version: 16
minutes: 15
revision: 4

## Overview
PostgreSQL keeps no in-memory table of row locks. Locking a row stamps the locker's transaction id
into the tuple header (xmax) plus a few infomask bits, so the number of locked rows is bounded by
disk, not by shared memory. A second writer that hits a locked row therefore does not wait on a
"row lock": it waits on the locker's transaction id. You will see both halves - the stamp in the
tuple via pgrowlocks, and the wait on a transactionid in pg_stat_activity.

## Syntax breakdown
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
select count(*) as still_locked from pgrowlocks('lk_t');
```

## Expected result
pgrowlocks shows exactly one row: locked_row = (0,1), locker = A's xid (e.g. 842), multi = f,
modes = {"For Update"}, pids = {A's pid}. B's UPDATE then hangs. From A, pg_stat_activity shows B
as state = active with wait_event_type = Lock and wait_event = transactionid - B is waiting for a
transaction, not for a row. pg_locks lists three transactionid rows: each backend holds an
ExclusiveLock on its own xid (granted = t) and B additionally requests ShareLock on A's xid with
granted = f. After A commits, B's UPDATE completes immediately, the row reads 'written by B', and
pgrowlocks reports still_locked = 0.

## Systems lens
Lock state that lives with the data instead of in a central table is what lets one transaction lock
a million rows without a memory budget - the same trade every storage system makes when it chooses
per-record metadata over a lock manager. The cost is that the waiter cannot be woken by "row 1 is
free"; it must wait on the whole transaction's outcome, which is why one slow transaction stalls
every writer that touches any row it holds.

## Optional variation
Rerun setup. In both sessions run BEGIN followed by SELECT id FROM lk_t WHERE id=1 FOR SHARE.
Inspect pgrowlocks while both transactions remain open: both share the row, represented by a
MultiXactId when multiple holders are recorded. ROLLBACK both sessions afterward. Do not add
shared-to-exclusive lock upgrades without an explicit deadlock and cleanup schedule.
