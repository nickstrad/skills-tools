# Separate persistent and connection-local settings

slug: connection-settings-are-local
category: lab-file
difficulty: intermediate
tags: connection-policy, locking, foreign-keys, wal
prerequisites: share-one-file-between-sessions
safety: locking
run-in: tool
sessions: 2
min-version: 3.53.4
minutes: 15
revision: 1

## Overview
Choose WAL in A, then compare A's connection policy with a fresh B connection opening the same file. A declared foreign key is not enough if a writer has enforcement disabled. The experiment exposes exactly which setup your application's connection factory must repeat.

## Syntax breakdown
### In plain terms

A file can retain a storage-mode choice while new connections still begin with their own runtime policies. A sets WAL, NORMAL synchronization, foreign-key enforcement and a 750 ms wait budget. B sees the persistent mode but does not inherit A's other settings, so a bad child row may be accepted until B initializes itself.

### What you are learning

- **Persistence boundary:** WAL is stored as a file-level mode; these other policies belong to a connection.
- **Constraint boundary:** Declaring REFERENCES and enforcing it are separate steps in SQLite.
- **Initialization contract:** Every writer, including a migration or background task, needs deliberate setup.

### Piece by piece

- **PRAGMA journal_mode=WAL** requests the persistent mode and should return wal. This experiment does not yet need the WAL internals explained in module 05.
- **PRAGMA synchronous=NORMAL** sets A's durability policy and reports integer 1. NORMAL's power-loss guarantees depend on journal mode; it is a visible comparison value, not a blanket recommendation.
- **PRAGMA foreign_keys=ON** enables enforcement before a transaction. Turning it on later does not retroactively repair existing orphan rows.
- **.timeout 750** installs this connection's busy-handler budget in milliseconds.
- **pragma_journal_mode, pragma_synchronous, pragma_foreign_keys and pragma_busy_timeout** expose the policies as queryable rows. The busy-timeout result column is named **timeout**, so the query aliases it to busy_timeout.
- **REFERENCES parent(id)** declares the relationship. A's child 99 fails; fresh B's child 98 is accepted on this lab's default-off build.
- **Session B** is a separate long-lived CLI process opened against the same path. After it repeats initialization, child 97 fails too.
- **count(*)** verifies only the deliberately accepted orphan exists. A different external build may default foreign keys on; record that difference rather than disable safety to mimic an expected default.

## Caution
The exact default synchronous integer is version and build dependent; record B's observed value instead of treating 2 as a portability promise.

## Setup
```sql
DROP TABLE IF EXISTS child;
DROP TABLE IF EXISTS parent;
CREATE TABLE parent(id INTEGER PRIMARY KEY);
CREATE TABLE child(parent_id INTEGER REFERENCES parent(id));
INSERT INTO parent VALUES (1);
```

## Run
```sql
-- Session A
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
.timeout 750
SELECT 'A policies' AS who, journal_mode, synchronous, foreign_keys, timeout AS busy_timeout FROM pragma_journal_mode, pragma_synchronous, pragma_foreign_keys, pragma_busy_timeout;
INSERT INTO child VALUES (99);

-- Session B: a newly opened sqlite3 process against the same TUTOR_SQLITE_DB
SELECT 'B fresh policies' AS who, journal_mode, synchronous, foreign_keys, timeout AS busy_timeout FROM pragma_journal_mode, pragma_synchronous, pragma_foreign_keys, pragma_busy_timeout;
INSERT INTO child VALUES (98);
SELECT 'B FK off accepted' AS evidence, count(*) AS child_rows FROM child;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
.timeout 750
SELECT 'B initialized policies' AS who, journal_mode, synchronous, foreign_keys, timeout AS busy_timeout FROM pragma_journal_mode, pragma_synchronous, pragma_foreign_keys, pragma_busy_timeout;
INSERT INTO child VALUES (97);
```

## Expected result
A prints wal, synchronous=1, foreign_keys=1 and busy_timeout=750; child 99 fails its FK constraint. On the course build, fresh B shows wal, synchronous=2, foreign_keys=0 and busy_timeout=0; child 98 succeeds and child_rows=1. B then initializes its own policies and child 97 fails. Defaults are build-dependent, but B never inherits A's connection settings.

## Systems lens
PostgreSQL also has session-local settings, but an embedded application cannot assume a central server configuration initialized every writer. Make connection setup an explicit, tested contract. The schema declaration, persistent file format and current connection policy are three different sources of authority.

## Optional variation
Open a third connection and inspect all four values before initialization. Which values can a file reader trust, and which must the application set before SQL?
