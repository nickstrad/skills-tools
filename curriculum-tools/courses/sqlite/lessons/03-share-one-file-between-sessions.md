# Share one database file between sessions

slug: share-one-file-between-sessions
category: lab-file
difficulty: beginner
tags: sqlite-cli, transactions, isolation
prerequisites: inspect-build-capabilities
safety: locking
run-in: tool
sessions: 2
min-version: 3.53.4
minutes: 12
revision: 1

## Overview
Use two independent sqlite3 processes against the same path and compare committed with uncommitted rows. This is a brief orientation, not a second isolation tutorial: the important difference is that coordination occurs through the local file and its locking protocol, without a database server mediating requests.

## Syntax breakdown
### In plain terms

Two CLI processes can coordinate through one local file without a server. The experiment separates a committed row from an uncommitted row, then asks each connection what it can see. A connection can read its own pending write, while another connection sees only the last committed file state.

### What you are learning

- **Connection identity** gives each sqlite3 process separate transaction state.
- **Commit visibility** makes a write available to other connections.
- **Rollback** removes pending changes from the writer and shared file.

### Piece by piece

- **Session A / Session B** (lesson coordination labels): run blocks in two concurrently open CLI processes; B's counts are the cross-connection evidence.
- **DROP TABLE IF EXISTS and CREATE TABLE** (SQL setup): make a repeatable table with an integer key and required body.
- **BEGIN** (transaction start): opens a transaction without immediately reserving the writer slot.
- **INSERT** (data change): adds a row to the current transaction; the second insert is deliberately pending.
- **COMMIT** (transaction end): publishes A's first row for B to see.
- **ROLLBACK** (transaction end): discards A's second row before B's final count.
- **count(*)** (SQL aggregate): produces a_count, b_count, and b_after_rollback, which distinguish private and committed state.

## Setup
```sql
.print -- The wrapper has already opened $TUTOR_SQLITE_DB
DROP TABLE IF EXISTS messages;
CREATE TABLE messages(id INTEGER PRIMARY KEY, body TEXT NOT NULL);
```

## Run
```sql
-- Session A
.headers on
BEGIN;
INSERT INTO messages(body) VALUES ('committed from A');
COMMIT;

-- Session B
.headers on
SELECT id, body FROM messages ORDER BY id;

-- Session A
BEGIN;
INSERT INTO messages(body) VALUES ('uncommitted from A');
SELECT count(*) AS a_count FROM messages;

-- Session B
SELECT count(*) AS b_count FROM messages;

-- Session A
ROLLBACK;

-- Session B
SELECT count(*) AS b_after_rollback FROM messages;
```

## Expected result
B first prints one committed row. While A's second transaction is open, A reports a_count = 2 but B reports b_count = 1. After A rolls back, B reports b_after_rollback = 1.

## Systems lens
No server process does not mean no concurrency protocol. Each caller has private connection and transaction state, while SQLite coordinates access to one shared file. Distinguish this arrangement from two independent database files, which later lessons use to model separate commit histories.

## Optional variation
Replace ROLLBACK with COMMIT and predict the next count in B; then test it.
