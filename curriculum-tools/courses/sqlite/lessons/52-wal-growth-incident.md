# Explain a growing WAL before choosing a remedy

slug: wal-growth-incident
category: capstone
difficulty: advanced
tags: wal, checkpoints, incident, backpressure
prerequisites: checkpoint-starvation
safety: locking
run-in: tool
sessions: 2
min-version: 3.53.4
minutes: 30
revision: 3

## Overview
A local service still accepts writes, but its WAL keeps growing and a checkpoint does not reclaim it. Collect a timeline that distinguishes writer admission, committed visibility and checkpoint progress. At the marked pause, predict which transaction must end and what evidence would falsify your diagnosis before running the recovery steps.

## Syntax breakdown
### In plain terms

An incident diagnosis should explain all the observations, not just name a familiar setting.
If writes commit while an old reader sees the same count, a blocked writer is not a sufficient
explanation for disk growth. Run the evidence phase first and stop at the printed pause. Write down
your hypothesis, the next measurement, and the smallest corrective action. The continuation tests it.

### What you are learning

- A growing WAL is a symptom with several possible causes. Committed row counts and checkpoint
  frame counts separate incoming work from work that reclamation cannot yet finish.
- An intervention should preserve data and address the resource actually being retained.
- PostgreSQL's old snapshots and replication slots also retain history, but here the retaining
  participant is a connection to a local file, without a server process catalog to inspect.

### Piece by piece

- **journal_mode=WAL / wal_autocheckpoint=0** (file mode and connection policy): Keep the observed
  backlog under explicit control. Each writing connection disables its own automatic checkpoint.
- **BEGIN / SELECT / COMMIT** (snapshot lifecycle): A's first read establishes its snapshot.
  An idle connection alone would not reproduce the same retention; a live read transaction does.
- **WITH RECURSIVE / hex(randomblob(700))** (bounded workload): Generate three batches of 200
  rows with large payloads. The fixed number of rows bounds disk use; random contents avoid assuming
  that logical payload size alone predicts storage behavior.
- **.shell stat -c '%s'** (file measurement): Inspect bytes while the connections remain open.
  Closing the last connection before measuring can change the WAL lifecycle you intend to observe.
- **wal_checkpoint(PASSIVE)** (non-waiting checkpoint): Its three columns are busy status, log
  frames and copied frames. A busy value of zero does not imply all frames were copied.
- **wal_checkpoint(TRUNCATE)** (reclamation request): After the suspected reader ends, request
  reuse and truncation. Compare both the tuple and file size, then verify the committed row count.

## Caution
Finish A's transaction before leaving. Never delete the WAL to reclaim space; it may contain committed state absent from the main file.

## Setup
```sql
PRAGMA journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;
DROP TABLE IF EXISTS incident_events;
CREATE TABLE incident_events(id INTEGER PRIMARY KEY,payload TEXT NOT NULL);
```

## Run
```sql
-- Session A
BEGIN;
SELECT 'A_start',count(*) FROM incident_events;
-- Session B
PRAGMA wal_autocheckpoint=0;
BEGIN;
WITH RECURSIVE n(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<200)
INSERT INTO incident_events(payload) SELECT hex(randomblob(700)) FROM n;
COMMIT;
BEGIN;
WITH RECURSIVE n(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<200)
INSERT INTO incident_events(payload) SELECT hex(randomblob(700)) FROM n;
COMMIT;
BEGIN;
WITH RECURSIVE n(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<200)
INSERT INTO incident_events(payload) SELECT hex(randomblob(700)) FROM n;
COMMIT;
SELECT 'B_committed',count(*) FROM incident_events;
.shell stat -c 'wal_after_writes=%s' "$TUTOR_SQLITE_DB-wal"
PRAGMA wal_checkpoint(PASSIVE);
-- Session A
SELECT 'A_now',count(*) FROM incident_events;
.print PAUSE: record your diagnosis, predicted checkpoint result, and smallest remedy before continuing
-- Session A
COMMIT;
-- Session B
PRAGMA wal_checkpoint(TRUNCATE);
.shell stat -c 'wal_after_remedy=%s' "$TUTOR_SQLITE_DB-wal"
SELECT 'verified_rows',count(*) FROM incident_events;
PRAGMA integrity_check;
```

## Expected result
Before the pause, A_start and A_now are 0 while B_committed is 600; WAL bytes are positive and PASSIVE cannot copy all log frames. This rules out writer admission failure as the immediate cause. Ending A's read transaction allows TRUNCATE to report 0|0|0, wal_after_remedy=0, verified_rows=600 and integrity_check=ok. Frame counts depend on page size and earlier lab state.

## Systems lens
Resource growth becomes an incident when production outruns reclamation. Diagnose the consumer or snapshot retaining the history before increasing a limit. The proof of recovery includes restored progress and intact committed state, not merely a smaller file.

## Optional variation
Repeat with A ending its read transaction before the burst, then with a different connection holding the writer. Build a three-row diagnostic table: symptoms, distinguishing observation, and corrective action. Keep every burst bounded at 600 rows.
