# VACUUM FULL: a new file, and a queue behind it

slug: vacuum-full-rewrites-and-locks
category: vacuum
difficulty: intermediate
tags: 
prerequisites: vacuum-reclaims-in-place, install-lab-extensions
safety: locking
run-in: tool
sessions: 2
min-version: 16
minutes: 15
revision: 4

## Overview
VACUUM FULL does give the space back, and the price is written on the tin: it copies the live rows
into a brand new file and takes an AccessExclusiveLock for the whole copy, so nothing - not even a
SELECT - may touch the table meanwhile. Here a plain reader gets in first and holds its
AccessShareLock; VACUUM FULL then queues behind it, and you can watch the ungranted lock row from
the reader's session. When the reader commits, the rewrite runs and pg_relation_filepath changes:
the table is now a different file on disk.

## Syntax breakdown
### In plain terms

VACUUM FULL actually makes a bloated table file smaller by copying live rows into a new file. Because
physical addresses change during that copy, PostgreSQL takes an exclusive table lock: even SELECT
must wait. This experiment lets a reader enter first, starts the rewrite behind it, and shows the
waiting lock and the changed relation file after the reader commits.

### What you are learning

- **Rewrite versus in-place cleanup:** VACUUM FULL returns unused disk space but needs a second copy
  and an outage for that table.
- **Lock compatibility:** A reader's AccessShareLock conflicts with the rewrite's AccessExclusiveLock.
- **Wait queues:** pg_locks and pg_stat_activity reveal both the granted lock and the waiting request.

### Piece by piece

- **CREATE TABLE / ALTER TABLE / TRUNCATE / INSERT / VACUUM** (setup)
  - What they are: These commands create and reset the lab table, disable background cleanup, load
    20,000 rows, and create dead versions through updates and ordinary vacuum.
  - What they do here: They leave a 1,379-page table with reusable holes but the original file intact.
  - What they give us: A relation large enough for VACUUM FULL to rewrite visibly.
- **pg_backend_pid()** (session identity function)
  - What it is: It returns this connection's server-process ID.
  - What it does here: Session A and B print their IDs for correlating activity rows.
  - What it gives us: Values to identify the waiter and lock holder if output includes other sessions.
- **pg_relation_filepath('vac_t')** (relation-file function)
  - What it is: It returns the relation's main-fork path relative to PostgreSQL's data directory.
  - What it does here: It runs before and after VACUUM FULL.
  - What it gives us: A changed relfilenode path, proving a new physical file replaced the old one.
- **pg_relation_size('vac_t') / 8192** (size measurement)
  - What it is: It converts main-fork bytes to 8 KiB pages.
  - What it does here: It compares bloat before rewriting with the compact post-rewrite file.
  - What it gives us: Roughly 1,379 pages before and 345 pages afterward.
- **BEGIN** (transaction control)
  - What it is: It starts B's transaction and keeps its AccessShareLock until COMMIT.
  - What it does here: B performs a SELECT and then remains idle in transaction.
  - What it gives us: A reader that holds the table open while A requests an exclusive lock.
- **SELECT count(*) FROM vac_t** (reader)
  - What it is: It counts table rows without changing them.
  - What it does here: B's read acquires an AccessShareLock on vac_t.
  - What it gives us: 20,000 visible rows and the lock that blocks the rewrite.
- **VACUUM FULL** (exclusive rewrite command)
  - What it is: It copies live rows and indexes into new files, swaps them in, and discards the old
    storage; it must run outside an explicit transaction block.
  - What it does here: A waits until B releases its reader lock, then performs the rewrite.
  - What it gives us: A blocked command followed by a smaller table and a new filepath.
- **pg_locks** (lock system view)
  - What it is: It lists lock requests and whether each has been granted.
  - What it does here: The query filters rows for vac_t and sorts granted locks first.
  - What it gives us: B's granted AccessShareLock and A's ungranted AccessExclusiveLock.
- **pg_stat_activity** (activity view)
  - What it is: It reports backend state and wait information.
  - What it does here: It is joined by PID to annotate the lock rows; **wait_event_type = 'Lock'** and
    **wait_event = 'relation'** identify A waiting on a relation lock.
  - What it gives us: The queued VACUUM FULL request and its waiting reason.
- **left(a.query, 20)** (text function)
  - What it is: It returns the first 20 characters of a query string.
  - What it does here: It keeps the activity report readable while still identifying VACUUM FULL.
  - What it gives us: A short query label beside each PID.
- **COMMIT** (transaction control)
  - What it is: It ends B's transaction and releases the reader lock.
  - What it does here: A's waiting rewrite proceeds immediately afterward.
  - What it gives us: The transition from queued to completed VACUUM FULL.
- **pgstattuple('vac_t')** (exact scan)
  - What it is: It counts physical dead tuples and free space after the rewrite.
  - What it does here: It verifies the compact replacement relation.
  - What it gives us: dead_tuple_count = 0 and free_percent near the tightly packed starting value.
- **VACUUM FULL in the challenge** (lock variation)
  - What it is: The same exclusive rewrite started before a new SELECT arrives.
  - What it does here: The new reader queues behind A even though it only wants to read.
  - What it gives us: Direct evidence that the exclusive request turns the table into a temporary outage.

## Caution
VACUUM FULL needs room for a full second copy of the table and its indexes, and it blocks every
reader and writer for the whole rewrite. Never reach for it on a live table without knowing the
duration; the maintenance window is the size of the table, not the size of the bloat.

## Setup
```sql
create table if not exists vac_t(id int primary key, n int, pad text);
alter table vac_t set (autovacuum_enabled = off);
truncate vac_t;
insert into vac_t select g, g, repeat('x', 100) from generate_series(1, 20000) g;
vacuum (analyze) vac_t;
update vac_t set n = n + 1;
update vac_t set n = n + 1;
update vac_t set n = n + 1;
vacuum vac_t;
```

## Run
```sql
-- Session A
select pg_backend_pid() as a_pid;
select pg_relation_filepath('vac_t') as filepath_before,
       pg_relation_size('vac_t') / 8192 as pages_before;
-- Session B
begin;
select pg_backend_pid() as b_pid, count(*) as rows_b_can_see from vac_t;
-- Session A (blocks until B commits)
vacuum full vac_t;
-- Session B
select pg_sleep(1);
select l.pid, l.mode, l.granted, a.wait_event_type, a.wait_event, left(a.query, 20) as query
from pg_locks l join pg_stat_activity a on a.pid = l.pid
where l.relation = 'vac_t'::regclass
order by l.granted desc, l.pid;
-- Session B
commit;
-- Session A
select pg_relation_filepath('vac_t') as filepath_after,
       pg_relation_size('vac_t') / 8192 as pages_after;
select dead_tuple_count, free_percent from pgstattuple('vac_t');
```

## Expected result
Session B opens a transaction and counts 20000 rows, which leaves it holding an AccessShareLock on
vac_t. Session A's VACUUM FULL then hangs.

From B, the pg_locks join shows two rows for the vac_t relation: B's own AccessShareLock with
granted = t (state idle in transaction), and A's AccessExclusiveLock with granted = f, with A's
wait_event_type = Lock and wait_event = relation. A read of 20000 rows is holding the whole table
hostage - and note that the reverse is also true, since any statement arriving now would queue
behind A's pending exclusive lock.

The instant B commits, A's VACUUM FULL runs. Session A then reports a different path: filepath_before
was something like base/16409/17783 and filepath_after is base/16409/17800 - a new relfilenode,
which is to say a different file. pages_before was 1379 (vacuum had already emptied the dead tuples
but kept the file) and pages_after is 345, back to the size of a freshly loaded table, with
pgstattuple showing dead_tuple_count = 0 and free_percent about 0.59.

## Systems lens
PostgreSQL's VACUUM FULL excludes concurrent table access while it replaces physical storage. This
is one relocation design, not a universal requirement that every storage engine stop readers for
all compaction. An online rewrite needs another coordination protocol to capture concurrent changes,
build replacement storage and switch readers safely. That trades the long exclusive interval for
extra storage, change tracking and a final synchronization point; it still needs measured bounds.

## Optional variation
Repeat the experiment but have Session B run its SELECT after A's VACUUM FULL has started. B now
waits too, even though B only reads - proving that the exclusive lock request is not skippable and
that a rewrite converts into an outage for the whole table.
