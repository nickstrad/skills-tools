# Copying only the main file misses live WAL state

slug: unsafe-live-copy
category: recovery
difficulty: advanced
tags: backup, wal, rpo, file-format
prerequisites: checkpoint-starvation
safety: dangerous
run-in: mixed
sessions: 2
min-version: 3.53.4
minutes: 20
revision: 1

## Overview
Commit a row into WAL, copy only the main file and observe a structurally readable but stale destination. The useful failure is not that cp crashes—it succeeds while losing the recovery point you thought you captured. Keep the source intact and compare both row counts.

## Syntax breakdown
### In plain terms

This experiment asks whether copying the main database pathname is the same as taking a database snapshot. It is not: in write-ahead logging (WAL), committed pages can still be in the -wal sidecar, while another connection keeps the source open. The source is disposable; the copy is evidence, not a recovery target.

### What you are learning

- **WAL file set** — the main file and its -wal/-shm companions together describe the live database.
- **Snapshot boundary** — a byte copy has no SQLite transaction boundary and can omit committed frames.
- **Failure-domain ownership** — the source remains untouched while the experiment demonstrates the risk.

### Piece by piece

- **PRAGMA journal_mode** (SQL connection setting)
  - What it is: DELETE uses rollback journaling and WAL places committed frames in a sidecar.
  - What it does here: establishes a baseline in the main file, then deliberately moves later state to WAL.
  - What it gives us: a known row that a main-file-only copy can see and a later committed row it may miss.
- **PRAGMA wal_autocheckpoint** (SQL setting)
  - What it is: the frame threshold at which a writer asks SQLite to checkpoint WAL frames.
  - What it does here: zero disables automatic checkpointing so the sidecar remains observable.
  - What it gives us: an intentional live-file state rather than an unmeasured race.
- **cp** (shell byte-copy program)
  - What it is: copies named filesystem bytes without consulting SQLite's pager.
  - What it does here: copies only the main pathname, excluding live sidecars.
  - What it gives us: the destination count to compare with the source count.
- **.shell** (sqlite3 CLI command)
  - What it is: runs a host shell command from the current CLI session.
  - What it does here: removes old disposable artifacts, invokes cp, and opens the result with a new sqlite3 process.
  - What it gives us: explicit file/evidence paths; a failed destination open is itself evidence of an incomplete file set.
- **count(*)** (SQL aggregate)
  - What it is: counts rows visible to that connection.
  - What it does here: compares baseline, source, and copied state.
  - What it gives us: the exact committed-row discrepancy, not merely a successful process exit.

## Caution
This intentionally unsafe exercise copies only a disposable source and never overwrites the original. Do not copy live SQLite files in production this way.

## Setup
```text
.print -- close every other sqlite3 session first: the next line must print delete
PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS records;
CREATE TABLE records(id INTEGER PRIMARY KEY, value TEXT);
INSERT INTO records VALUES (1, 'main-file-baseline');
PRAGMA journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;
```

## Run
```text
-- Session B
PRAGMA wal_autocheckpoint=0;
SELECT 'source baseline', count(*) FROM records;

-- Session A
INSERT INTO records VALUES (2, 'committed-only-in-wal');
SELECT 'source current', count(*) FROM records;
.shell rm -f "$TUTOR_SQLITE_DB.copy.db" "$TUTOR_SQLITE_DB.copy.db-wal" "$TUTOR_SQLITE_DB.copy.db-shm"
.shell cp "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB.copy.db"
.shell sqlite3 "$TUTOR_SQLITE_DB.copy.db" "SELECT 'main-file-only copy', count(*) FROM records;"

-- Session B
SELECT 'source remains', count(*) FROM records;
```

## Expected result
The source baseline is 1, then A commits and reports source current=2. The deliberately main-only copy reports 1, while B still reports source remains=2. This controlled fixture demonstrates missing committed WAL state without damaging the source; an unexpected destination error needs investigation, not automatic classification as a passed example.

## Systems lens
A successful file operation is not a successful snapshot protocol. SQLite's portable-file appeal can hide a live multi-file state; PostgreSQL backup experience should make you ask the same capture-consistency question, but the concrete SQLite hazard is omitting committed WAL frames. A backup age metric is meaningless if the captured artifact was never consistent.

## Optional variation
Repeat after an engine-coordinated TRUNCATE checkpoint while all writers are quiescent, and compare the copy. Then explain why checkpoint followed by cp is still racy if a writer may commit between them.
