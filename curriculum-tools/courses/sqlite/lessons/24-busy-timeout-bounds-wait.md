# A busy timeout is a bounded queue budget

slug: busy-timeout-bounds-wait
category: concurrency
difficulty: intermediate
tags: busy, locking, retries, backpressure
prerequisites: rollback-reader-writer-blocking
safety: locking
run-in: mixed
sessions: 2
min-version: 3.53.4
minutes: 15
revision: 3

## Overview
Use two explicit connections to compare a lock released within B's wait budget with a lock deliberately retained beyond it. This makes ownership and timing order visible instead of guessing that a background process started. B's failed autocommit UPDATE is retried only after A has committed.

## Syntax breakdown
### In plain terms

A timeout limits willingness to wait, not how much write capacity exists. In the first round A is known to own the writer before B starts, then releases it while B waits. In the second round A keeps ownership until B's shorter budget has expired.

### What you are learning

- **Bounded admission:** Waiting can succeed or fail depending on release order.
- **Deterministic coordination:** Session boundaries establish the lock owner; a sleep only supplies a visible delay.
- **Attempt accounting:** A busy autocommit statement changes no committed row and can be a new attempt after release.

### Piece by piece

- **journal_mode=DELETE** fixes the lock mechanism. A's **BEGIN IMMEDIATE and UPDATE** reserve the writer and prepare value 1 before B starts.
- **B's .timeout 2000** permits up to two seconds of waiting. The labeled **blocks** step must be run while A remains open; switch to A promptly.
- **A's .shell sleep 0.1** delays release by 100 ms, then **COMMIT** makes B's waiting UPDATE eligible to write value 2. The delay is not the readiness signal; A's earlier completed transaction start established readiness.
- **.timer on/off** reports B's actual elapsed statement time. **changes()** immediately after its successful UPDATE must be 1.
- In round two A prepares value 3, while B's **.timeout 150** makes its attempt to write 4 fail after roughly 150 ms. The following read sees the previously committed value 2.
- A then commits; B repeats the single autocommit **UPDATE** and observes changed=1, done=4. No external side effect or multi-statement decision is being retried here.

## Caution
For round one, B is intentionally waiting: switch to A and commit before two seconds elapse. If human delay exhausts that budget, record the busy outcome, release A, and explicitly retry B. Round two is intentionally not released until its timeout is observed.

## Setup
```text
.print -- close every other sqlite3 session first: the next line must print delete
PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS work;
CREATE TABLE work(id INTEGER PRIMARY KEY, done INTEGER NOT NULL);
INSERT INTO work VALUES (1, 0);
```

## Run
```text
-- Session A
BEGIN IMMEDIATE;
UPDATE work SET done=1 WHERE id=1;

-- Session B (blocks until A commits; switch to A within 2 seconds)
.timeout 2000
.timer on
UPDATE work SET done=2 WHERE id=1;

-- Session A
.shell sleep 0.1
COMMIT;

-- Session B
.timer off
SELECT 'within budget', changes() AS changed, done FROM work;

-- Session A
BEGIN IMMEDIATE;
UPDATE work SET done=3 WHERE id=1;

-- Session B
.timeout 150
.timer on
UPDATE work SET done=4 WHERE id=1;
.timer off
SELECT 'over budget, still committed value', done FROM work;

-- Session A
COMMIT;

-- Session B
UPDATE work SET done=4 WHERE id=1;
SELECT 'retry after release', changes() AS changed, done FROM work;
```

## Expected result
Round one waits for A's explicit release, then prints within budget with changed=1 and done=2; the automated run typically waits around 0.1–0.2 s, while human terminal switching adds delay. Round two reports database is locked after approximately 150 ms and still reads committed value 2. After A commits, B's retry prints changed=1 and done=4.

## Systems lens
A busy budget turns a serialization point into bounded backpressure, but longer waits do not increase SQLite's writer capacity. An application also needs an end-to-end deadline, bounded retry count and a clear failure response. Measure waits and rejected attempts separately from successful execution.

## Optional variation
Repeat Setup and Run with the second-round timeout raised from 150 to 500 ms, still releasing A only after B returns. B reports busy after roughly half a second and reads committed value 2; the existing release and retry still produce changed=1, done=4.

For another fresh run, raise the first-round budget from 2000 to 5000 ms and A's sleep from 0.1 to 0.5 seconds. Switch to A promptly so it releases within the budget. B can succeed with the same changed=1, done=2, but its measured latency now includes the longer delay and terminal-switching time. If the budget expires, use the existing explicit retry procedure.
