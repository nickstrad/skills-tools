# BEGIN IMMEDIATE makes writer admission explicit

slug: immediate-reserves-writer
category: concurrency
difficulty: intermediate
tags: transactions, locking, busy, serialization
prerequisites: deferred-write-race
safety: locking
run-in: tool
sessions: 2
min-version: 3.53.4
minutes: 12
revision: 3

## Overview
Move writer admission to the start of the transaction, before any application decision or mutation. B times out at BEGIN IMMEDIATE even though it could intend to change a different table. Writer admission belongs to the database file, not the set of row keys the application plans to touch.

## Syntax breakdown
### In plain terms

BEGIN IMMEDIATE makes writer admission the first operation instead of discovering it after reads and application work. Hold that reservation in A, then let B time out at its BEGIN. Once A commits, B retries the same admission step and succeeds.

### What you are learning

- **Explicit admission** makes contention observable at a clean boundary.
- **Database-wide writer reservation** applies even when later writes would target different rows or tables.
- **Timeout budget** bounds how long a caller waits before deciding to retry or fail.

### Piece by piece

- **PRAGMA journal_mode=DELETE** (persistent setting): selects rollback locking for this experiment.
- **BEGIN IMMEDIATE** (transaction start): obtains RESERVED before A's insert and makes B's first BEGIN contend.
- **.timeout 250** (CLI busy-handler setting): gives B a 250 ms wait budget.
- **.timer on/off** (CLI measurement): records how long B waited at admission.
- **INSERT** (data change): runs only after the connection owns the writer reservation.
- **COMMIT** (transaction end): releases A's reservation and publishes its row; B's new BEGIN can then proceed.
- **count(*)** (aggregate): B's committed_rows query confirms the failed admission left it in autocommit with only baseline visible.

## Caution
B's first BEGIN is intentionally a bounded 250 ms failure, not a release-dependent blocking step. A commits only after that failure; do not run both transactions in one sqlite3 process.

## Setup
```sql
.print -- close every other sqlite3 session first: the next line must print delete
PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS other_events;
CREATE TABLE events(id INTEGER PRIMARY KEY, note TEXT);
CREATE TABLE other_events(id INTEGER PRIMARY KEY, note TEXT);
INSERT INTO events(note) VALUES ('baseline');
```

## Run
```sql
-- Session A
.timeout 100
BEGIN IMMEDIATE;
INSERT INTO events(note) VALUES ('A owns writer');

-- Session B
.timeout 250
.timer on
BEGIN IMMEDIATE;
.timer off
SELECT 'B refused admission, still autocommit', count(*) AS committed_rows FROM events;

-- Session A
COMMIT;

-- Session B
BEGIN IMMEDIATE;
INSERT INTO events(note) VALUES ('B after admission');
INSERT INTO other_events(note) VALUES ('a different table still required admission');
COMMIT;
SELECT id, note FROM events ORDER BY id;
```

## Expected result
B's timed first BEGIN IMMEDIATE returns database is locked after roughly the configured 250 ms (the timer reports the measured wait), while A remains the only writer; B is left in autocommit and reads committed_rows = 1. After A commits, B can begin and commit; final rows are baseline, A owns writer, and B after admission.

## Systems lens
This is the main contrast with PostgreSQL row-level writer concurrency: independent logical records in one SQLite file still share a writer-admission point. BEGIN IMMEDIATE makes that boundary explicit, which is useful for short read/decide/write transactions but costly if remote calls or lengthy work happen while it is held.

## Optional variation
Set B's timeout to 0 and then to 1000. What latency budget and user-visible failure does each policy create?
