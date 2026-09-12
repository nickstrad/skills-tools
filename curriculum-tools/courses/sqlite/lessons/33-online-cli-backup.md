# The CLI backup captures a consistent source snapshot

slug: online-cli-backup
category: recovery
difficulty: advanced
tags: backup, wal, consistency, rpo, rto
prerequisites: unsafe-live-copy
safety: writes-data
run-in: mixed
sessions: 2
min-version: 3.53.4
minutes: 20
revision: 1

## Overview
Hold B's uncommitted transaction while A captures a backup through SQLite's engine, then commit more source work and inspect the two independent histories. The backup should contain the earlier committed state, not a partly applied writer transaction. Consistency and freshness are separate properties.

## Syntax breakdown
### In plain terms

This experiment runs SQLite's online backup operation while another connection has uncommitted work. The backup API chooses a consistent snapshot, so it contains committed state at its capture point and excludes the open transaction. That capture point is useful evidence for a recovery point objective (RPO), but it is not continuous replication.

### What you are learning

- **Online backup** — SQLite copies pages through the engine rather than copying pathnames.
- **Committed snapshot** — uncommitted pages are not part of the destination.
- **RPO/RTO evidence** — the backup's state and restore time are separate operational measurements.

### Piece by piece

- **PRAGMA journal_mode=WAL** (SQL setting)
  - What it is: enables the WAL sidecar and reader/writer overlap.
  - What it does here: lets Session B keep an uncommitted writer while Session A backs up.
  - What it gives us: a controlled point at which the destination must show only committed rows.
- **BEGIN IMMEDIATE** (SQL transaction command)
  - What it is: starts a write transaction and reserves SQLite's writer slot.
  - What it does here: keeps three inserts uncommitted while the backup runs.
  - What it gives us: a clean boundary for testing whether the backup leaks half a transaction.
- **.backup FILE** (sqlite3 CLI command)
  - What it is: invokes the engine-coordinated backup API into a new file.
  - What it does here: writes the destination named by the shell-expanded path.
  - What it gives us: a file that can be opened and checked independently.
- **PRAGMA integrity_check** (SQL diagnostic)
  - What it is: performs a broad structural consistency check.
  - What it does here: validates the destination before its row count is trusted.
  - What it gives us: ok means the B-tree checks passed; it does not prove domain correctness.
- **COMMIT** (SQL transaction command)
  - What it is: makes Session B's changes durable and visible.
  - What it does here: moves the source from the backup's one-row snapshot to six rows.
  - What it gives us: source-final evidence that is deliberately newer than the backup.

## Caution
A backup is only as current as its capture point; schedule and monitor it rather than treating it as continuous replication.

## Setup
```text
PRAGMA journal_mode=WAL;
DROP TABLE IF EXISTS events;
CREATE TABLE events(id INTEGER PRIMARY KEY, note TEXT);
INSERT INTO events VALUES (1, 'baseline');
```

## Run
```text
-- Session B
BEGIN IMMEDIATE;
INSERT INTO events(note) VALUES ('b1');
INSERT INTO events(note) VALUES ('b2');
INSERT INTO events(note) VALUES ('b3');

-- Session A
.shell rm -f "$TUTOR_SQLITE_DB.online-backup.db"
.shell sqlite3 "$TUTOR_SQLITE_DB" ".backup '$TUTOR_SQLITE_DB.online-backup.db'"
.shell sqlite3 "$TUTOR_SQLITE_DB.online-backup.db" "PRAGMA integrity_check; SELECT 'backup rows', count(*) FROM events;"

-- Session B
COMMIT;
INSERT INTO events(note) VALUES ('b4');
INSERT INTO events(note) VALUES ('b5');
SELECT 'source final', count(*) FROM events;
```

## Expected result
B holds an uncommitted write while A runs the online backup. The destination opens successfully and integrity_check returns ok; it reports the committed snapshot count 1, while B then commits and the source final count is 6. The backup never contains B's uncommitted half-effect.

## Systems lens
The backup API provides a consistent capture mechanism; your schedule, retention, retrieval and restore procedure determine whether it meets a recovery objective. A one-row backup can be perfectly consistent yet too stale for the application. Do not describe backup creation time alone as recovery time or a tested RTO.

## Optional variation
Repeat in DELETE mode after closing other connections. This script finishes backup before B attempts COMMIT, so it need not exhibit a wait. To demonstrate rollback-mode reader blocking, hold a separate read transaction through B's commit as in rollback-reader-writer-blocking; distinguish that evidence from what this backup schedule actually proves.
