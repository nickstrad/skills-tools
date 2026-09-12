# Rollback mode moves contention to writer commit

slug: rollback-reader-writer-blocking
category: concurrency
difficulty: intermediate
tags: rollback-journal, locking, transactions, isolation
prerequisites: immediate-reserves-writer
safety: locking
run-in: tool
sessions: 2
min-version: 3.53.4
minutes: 15
revision: 3

## Overview
Allow B to prepare a write while A holds a rollback-mode read, then deliberately let B's COMMIT exhaust a short wait budget. Query B's pending state before releasing A and retrying COMMIT itself. A busy commit is not evidence that the write transaction was rolled back.

## Syntax breakdown
### In plain terms

Writer admission is not the last lock transition in rollback mode. B can reserve the writer and prepare its row while A reads, but publishing the change requires stronger access. We intentionally keep A open long enough to make COMMIT fail, then show exactly what remains retryable.

### What you are learning

- **Admission versus publication:** Reserved writer access is weaker than the exclusive access needed for this commit.
- **Busy COMMIT scope:** The transaction remains active; its prepared data is still visible to B.
- **Correct retry boundary:** Retry COMMIT after the reader releases, not the INSERT that already succeeded.

### Piece by piece

- **PRAGMA journal_mode=DELETE** selects the rollback protocol. Confirm delete before continuing.
- **A's BEGIN and SELECT** obtain and retain a SHARED read lock and see the single baseline row.
- **B's BEGIN IMMEDIATE** obtains the writer reservation. Its INSERT adds a pending second row without publishing it.
- **.timeout 150 and .timer on/off** make B's first COMMIT a deliberate approximately 150 ms busy failure, not a step that needs an immediate terminal switch.
- **SELECT 'B pending after busy COMMIT'** must report 2 in B's still-open transaction. That query proves why repeating INSERT would be wrong.
- **A's COMMIT** releases its read lock. B then repeats **COMMIT**, which publishes the already-prepared row.
- **The final count** is 2. In the WAL variation, the reader no longer blocks this writer commit in the same way, though another writer still competes for admission.

## Caution
The first B COMMIT is supposed to fail after its short budget; do not release A until that evidence is collected. The successful INSERT is still pending, so retry only COMMIT after A releases or explicitly roll back the transaction.

## Setup
```sql
.print -- close every other sqlite3 session first: the next line must print delete
PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS messages;
CREATE TABLE messages(id INTEGER PRIMARY KEY, body TEXT);
INSERT INTO messages(body) VALUES ('before');
```

## Run
```sql
-- Session A
.timeout 5000
BEGIN;
SELECT 'A sees', count(*) FROM messages;

-- Session B
.timeout 150
BEGIN IMMEDIATE;
INSERT INTO messages(body) VALUES ('after');
.timer on
COMMIT;
.timer off
SELECT 'B pending after busy COMMIT', count(*) FROM messages;

-- Session A
COMMIT;

-- Session B
COMMIT;
SELECT 'B committed', count(*) FROM messages;
```

## Expected result
A initially sees 1. B inserts a pending row, then its first COMMIT reports database is locked after roughly 150 ms. B's following query still sees 2 inside the active write transaction. After A commits its read transaction, B retries COMMIT successfully and B committed reports 2.

## Systems lens
Timeout describes an operation's outcome, not necessarily the surrounding transaction's outcome. Distinguish 'not admitted', 'prepared but not yet committed', and 'committed but acknowledgment lost'. Those states lead to different retry rules in SQLite and in distributed request protocols.

## Optional variation
Close both sessions, repeat Setup with `PRAGMA journal_mode=WAL;`, and reopen A and B on that database. Repeat Run through B's first COMMIT: it succeeds while A retains its read snapshot, and B's count is 2 in autocommit. Release A with its existing COMMIT and omit B's now-redundant second COMMIT; the final count remains 2. WAL removes this reader's obstruction to writer publication, while another writer would still contend for the single writer reservation.
