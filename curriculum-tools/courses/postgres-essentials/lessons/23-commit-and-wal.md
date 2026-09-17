# Connect commit acknowledgement to durable log work

slug: commit-and-wal
category: wal-and-recovery
difficulty: intermediate
tags: wal, commit, durability, lsn
prerequisites: join-memory
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 25
revision: 1

## Overview
Place a logged row change in PostgreSQL's WAL stream, then compare insert, write and flush positions after commits with synchronous_commit on and off. The experiment connects a successful COMMIT to a precise local durability contract while keeping measured positions separate from claims about power loss.

## Syntax breakdown
### In plain terms
PostgreSQL describes progress through its write-ahead log with log sequence numbers, or LSNs. A
logged change first advances the insert position, then WAL is written to the operating system, and
finally flushed to durable storage. With synchronous_commit on, a standalone primary waits for the
local commit record to be flushed before reporting success. With it off, PostgreSQL may report
success earlier, while preserving database consistency if it later recovers.

### Mechanism map

```text
A success response sits on a log boundary

row change -> WAL inserted -> WAL written -> WAL flushed to durable storage
                  |               |                    |
                  +-- rollback can discard the row     +-- synchronous_commit=on waits here
                                      synchronous_commit=off may acknowledge earlier

An LSN is a position in that stream. Comparing positions shows progress, not a power-loss test.
```

### Terminals and cleanup
Open one experiment terminal (Session A) and connect each psql session with:
```sh
psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off
```
The flags skip personal startup settings, select the learner socket, port, role and database, and
keep output in the terminal. Finish any earlier transaction with **ROLLBACK** before setup. Run every block in Session A in the order shown.
If you reach the fifteen-minute core limit or get stuck, ROLLBACK in the open sessions and follow
the lesson's exact cleanup command so its named pe_* table and session settings are removed.
### What you are learning
- WAL records describe changes before the corresponding data pages may be written, so recovery can
  replay committed work after a process failure.
- pg_current_wal_insert_lsn, pg_current_wal_lsn and pg_current_wal_flush_lsn represent inserted,
  written and durably flushed progress on a primary.
- A successful local synchronous commit establishes a documented flush boundary. An asynchronous
  commit relaxes when success may be returned, though an immediate sample can already show no gap.
- WAL generation alone does not make a transaction's row effects committed or visible.

### Piece by piece
- **current_setting('fsync')** reads whether PostgreSQL asks the operating system to make updates
  durable. **= 'on'** turns that text comparison into a Boolean. The
  experiment stops if it is off because flush positions would not support the intended contract.
- **SET lock_timeout / statement_timeout** bound fixture locks and each statement. RESET restores
  the session defaults after cleanup.
- **pg_current_wal_insert_lsn()** returns the end of WAL inserted so far by this primary. Capturing it
  after INSERT and before COMMIT proves a lower bound that the commit must pass; it is not the exact
  commit-record LSN because COMMIT itself adds WAL.
- **pg_current_wal_lsn()** returns the current WAL write position, and
  **pg_current_wal_flush_lsn()** returns the position known flushed to durable storage.
- **\gset on_** and **\gset off_** save a one-row query's columns as psql variables. A later
  **:'name'::pg_lsn** safely quotes and casts the saved text back to PostgreSQL's pg_lsn type.
- **SET LOCAL synchronous_commit = on/off** applies only until that transaction ends. On requires
  this standalone primary's local commit WAL to be flushed before success; off permits an earlier
  acknowledgement and does not disable WAL or fsync globally.
- **pg_wal_lsn_diff(a, b)** reports the byte distance between two LSNs as a numeric value. The
  asynchronous gap can be zero because WAL flushing continues in the background and observation
  itself occurs after COMMIT returns.
- **greatest(distance, 0)** clamps a negative distance to zero after the saved position has already
  been flushed. This measures only how much of the pre-commit saved position remains unflushed,
  not the full commit-record gap; separate position calls can sample slightly different moments.
- **\echo** prints the prerequisite failure message; the rollback variation's **repeat('r',1000)**
  supplies a fixed payload large enough for positive WAL generation to be easy to inspect.
- **count(*) FILTER (WHERE label = ...)** independently confirms both committed rows are visible.
- **\if / \else / \endif / \quit** branch on the saved Boolean and stop psql if the required
  setting is absent.

## Caution
Run this on a PostgreSQL instance where fsync is on, as the setup verifies. The lesson changes synchronous_commit only inside each transaction. If interrupted, run ROLLBACK; DROP TABLE IF EXISTS pe_commit_wal; RESET lock_timeout; RESET statement_timeout before rerunning setup.

## Setup
```sql
set lock_timeout = '3s';

set statement_timeout = '30s';

select
  current_setting('fsync') = 'on' as fsync_is_on \gset

\if :fsync_is_on
\else
  \echo 'This experiment requires fsync=on.'
  \quit
\endif
drop table if exists pe_commit_wal;

create table pe_commit_wal (id integer primary key, label text not null);
```

## Run
```sql
-- Session A: save WAL inserted by the row, then require a synchronous commit.
begin;

set local synchronous_commit = on;

insert into
  pe_commit_wal
values
  (1, 'synchronous');

select
  pg_current_wal_insert_lsn() as write_lsn \gset on_

commit;

select
  :'on_write_lsn'::pg_lsn as saved_write_lsn,
  pg_current_wal_lsn() as current_write_lsn,
  pg_current_wal_flush_lsn() as current_flush_lsn,
  pg_current_wal_flush_lsn() >= :'on_write_lsn'::pg_lsn as flush_reached_saved_write;

-- Session A: permit early acknowledgement, then report the gap actually sampled.
begin;

set local synchronous_commit = off;

select
  pg_current_wal_flush_lsn() as before_flush_lsn \gset off_

insert into
  pe_commit_wal
values
  (2, 'asynchronous');

select
  pg_current_wal_insert_lsn() as write_lsn \gset off_

commit;

select
  :'off_write_lsn'::pg_lsn as saved_write_lsn,
  :'off_before_flush_lsn'::pg_lsn as flush_before_insert,
  pg_current_wal_lsn() as sampled_write_lsn,
  pg_current_wal_flush_lsn() as sampled_flush_lsn,
  greatest(pg_wal_lsn_diff(:'off_write_lsn'::pg_lsn, pg_current_wal_flush_lsn()), 0) as sampled_unflushed_bytes;

select
  count(*) filter (where label = 'synchronous') as synchronous_rows,
  count(*) filter (where label = 'asynchronous') as asynchronous_rows
from
  pe_commit_wal;

drop table pe_commit_wal;

reset lock_timeout;

reset statement_timeout;
```

## Expected result
The setup reports no error only when fsync is on. Both INSERTs and both COMMITs succeed. After the
synchronous commit, flush_reached_saved_write is t: the sampled flush LSN is at or beyond the WAL
position saved after its INSERT. The current write and flush positions can be later because COMMIT
adds WAL and other cluster activity may advance them.

After the asynchronous commit, flush_before_insert is the flush position sampled before its INSERT,
and sampled_unflushed_bytes is a nonnegative measurement relative to the saved post-INSERT position.
It may be positive or zero; zero does not change the fact that synchronous_commit=off permitted the success
response before local flush, because the background flush can win this observation race. The final
query reports synchronous_rows=1 and asynchronous_rows=1. These positions do not simulate power
loss and therefore do not prove which async commit would survive one. Cleanup drops pe_commit_wal
and restores both session guards.

## Systems lens
An acknowledgement contract names the boundary crossed before success is returned. WAL ordering keeps the database recoverable, while synchronous_commit chooses whether this client waits for the local durability boundary. Similar choices appear in replicated logs and storage APIs: define whether success means accepted in memory, written by an operating system, durably stored, or replicated, then monitor the position that represents that promise.

## Optional variation
Optional rollback variation, independently runnable. Observe the WAL position alongside the final row count to distinguish logged work from committed visibility:

```sql
set lock_timeout = '3s';

set statement_timeout = '30s';

drop table if exists pe_wal_rollback;

create table pe_wal_rollback (id integer primary key, payload text not null);

select
  pg_current_wal_insert_lsn() as before_lsn \gset

begin;

insert into
  pe_wal_rollback
values
  (1, repeat('r', 1000));

rollback;

select
  pg_wal_lsn_diff(pg_current_wal_insert_lsn(), :'before_lsn'::pg_lsn) as wal_bytes_generated,
  (
    select
      count(*)
    from
      pe_wal_rollback
  ) as visible_rows;

drop table pe_wal_rollback;

reset lock_timeout;

reset statement_timeout;
```

Expect wal_bytes_generated to be positive and visible_rows to be 0. WAL records participate in recovery and rollback semantics; bytes in the log are not proof that the attempted row became a committed effect.
