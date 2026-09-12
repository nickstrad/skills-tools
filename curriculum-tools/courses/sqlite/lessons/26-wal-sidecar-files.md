# WAL turns one database into a live file set

slug: wal-sidecar-files
category: wal
difficulty: intermediate
tags: wal, file-format, pager, observability
prerequisites: idempotent-retry-ledger
safety: writes-data
run-in: mixed
sessions: 2
min-version: 3.53.4
minutes: 15
revision: 1

## Overview
Commit a change in WAL mode and inspect the file set while two connections remain open. The deployment question is deceptively practical: what does 'one SQLite file' mean while an application is running? You will distinguish the durable change log from the host-local index that helps connections find those changes.

## Syntax breakdown
### In plain terms

The main file is not necessarily the latest committed database. In WAL mode, recently committed page versions can still live in the -wal file. We keep connections open because last-connection cleanup can checkpoint and remove sidecars before a shell inspection sees them.

### What you are learning

- **Logical versus physical state:** One database can currently require more than one file.
- **WAL frames:** The log contains changed page images and commit boundaries, not a stream of SQL commands to send to peers.
- **Shared-memory index:** The -shm file supports same-host coordination and lookup; it is not an independent durable history.

### Piece by piece

- **PRAGMA journal_mode=WAL** requests and returns the persistent mode. Check for wal rather than assuming conversion succeeded.
- **PRAGMA wal_autocheckpoint=0** disables automatic threshold checkpoints on this connection. It does not change other connections' policies or stop last-close cleanup.
- **The two labeled sessions** use separate connections to the same absolute TUTOR_SQLITE_DB. A commits its second row; B verifies count 2 without sharing A's memory.
- **.shell stat -c '%n %s bytes'** inspects the main file, -wal and -shm without opening another database connection. %n names each file and %s gives its byte length; shell expansion supplies the lab path.
- **PRAGMA wal_checkpoint(TRUNCATE)** in the variation asks SQLite to apply safe frames and reclaim the WAL file's length. Perform it through the engine, never by deleting a sidecar yourself.

## Caution
Never copy just the main file while WAL contains committed frames; use an engine-coordinated backup.

## Setup
```text
PRAGMA journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;
DROP TABLE IF EXISTS notes;
CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT);
INSERT INTO notes VALUES (1, 'baseline');
```

## Run
```text
-- Session A
PRAGMA journal_mode;
PRAGMA wal_autocheckpoint=0;
INSERT INTO notes VALUES (2, 'frame-in-wal');
SELECT count(*) FROM notes;
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB-wal" "$TUTOR_SQLITE_DB-shm"

-- Session B
PRAGMA journal_mode;
SELECT 'B sees committed WAL state', count(*) FROM notes;
.shell stat -c '%n %s bytes' "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB-wal" "$TUTOR_SQLITE_DB-shm";
```

## Expected result
Both connections report journal_mode wal and count 2. While the connections are live, the main file, -wal, and -shm files exist; the WAL size is nonzero after the commit. Exact byte sizes depend on page size and SQLite build.

## Systems lens
Compare responsibilities, not names: SQLite WAL is a local page-history and recovery mechanism, not PostgreSQL streaming replication, an application event log, or consensus. A backup tool must obtain a consistent database snapshot; a file picker that happens to see the main file cannot infer which committed frames it is missing.

## Optional variation
Close B, keep A open, and run `PRAGMA wal_checkpoint(TRUNCATE);` in A. Repeat A's stat and count queries. With no competing connection, the checkpoint reports 0|0|0, the WAL has zero bytes, and the count remains 2. The shared-memory index can remain while A is open. Commit made the row visible earlier; this maintenance step transfers safe frames and reclaims WAL length.
