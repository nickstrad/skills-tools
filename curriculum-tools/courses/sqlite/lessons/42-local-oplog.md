# Give an offline mutation an identity and a durable history

slug: local-oplog
category: local-systems
difficulty: intermediate
tags: oplog, outbox, atomicity, device-generation
prerequisites: idempotent-retry-ledger
safety: writes-data
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 20
revision: 3

## Overview
An offline writer cannot ask a central server for its next operation number. Give one device generation its own sequence, and commit the sequence advance, document edit, and delivery intent together. A rollback must undo all three: otherwise the next receiver sees either an unexplained gap or an operation describing a change that never happened.

## Syntax breakdown
### In plain terms

PostgreSQL's outbox lesson established why state and delivery intent belong in one transaction.
Here the application also owns an offline history. An origin such as device-a/g1 names one device
generation; its sequence orders that origin's mutations without pretending to order other devices.
The transaction below first succeeds and then aborts, so you can inspect exactly which facts survive.

### What you are learning

- A durable operation identity is the pair of origin and sequence. Retransmission keeps that pair
  and its payload unchanged; a new identity means a new operation.
- Sequence allocation is application state. It must commit with the mutation and its log entry.
- A generation separates a device's histories across destructive reset or restore. Later lessons
  show why reopening an old file can make a formerly safe local counter unsafe to reuse.

### Piece by piece

- **device** (local metadata table): Stores an origin, next sequence, and logical clock. Unlike a
  timestamp from the operating system, this clock is a version the application advances deliberately.
- **PRIMARY KEY(origin,seq) / WITHOUT ROWID** (identity constraint and layout): Make one B-tree
  keyed by the operation identity. Its uniqueness protects the ledger inside this database file.
- **BEGIN IMMEDIATE** (transaction command): Reserves this file's writer before allocating an
  identity. Another local connection cannot allocate the same counter value concurrently.
- **UPDATE ... clock=clock+1 / INSERT SELECT** (state transition): Edit the note, copy the current
  identity and payload into the log, then advance next_seq. The log's clock records the committed edit.
- **COMMIT / ROLLBACK** (transaction boundaries): The second attempt reaches all three tables but
  rolls back. Read the note, next_seq and log count afterward; checking only the note would miss a gap.
- **printf** and **ORDER BY** (SQL formatting and ordering): Render the pair as a readable operation
  ID and display sequence order explicitly. SQL's default row order is not the protocol's ordering.

## Setup
```sql
PRAGMA journal_mode=WAL;
DROP TABLE IF EXISTS local_oplog;
DROP TABLE IF EXISTS local_notes;
DROP TABLE IF EXISTS device;
CREATE TABLE device(origin TEXT PRIMARY KEY NOT NULL,next_seq INTEGER NOT NULL,clock INTEGER NOT NULL);
INSERT INTO device VALUES('device-a/g1',1,0);
CREATE TABLE local_notes(id INTEGER PRIMARY KEY,body TEXT NOT NULL);
INSERT INTO local_notes VALUES(1,'draft');
CREATE TABLE local_oplog(origin TEXT NOT NULL,seq INTEGER NOT NULL,clock INTEGER NOT NULL,
 note_id INTEGER NOT NULL,body TEXT NOT NULL,acknowledged INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(origin,seq)) WITHOUT ROWID;
```

## Run
```sql
BEGIN IMMEDIATE;
UPDATE device SET clock=clock+1;
UPDATE local_notes SET body='offline edit';
INSERT INTO local_oplog(origin,seq,clock,note_id,body)
 SELECT origin,next_seq,clock,id,body FROM device CROSS JOIN local_notes;
UPDATE device SET next_seq=next_seq+1;
COMMIT;
SELECT printf('%s:%d',origin,seq) AS operation_id,clock,body,acknowledged FROM local_oplog;
BEGIN IMMEDIATE;
UPDATE device SET clock=clock+1;
UPDATE local_notes SET body='aborted edit';
INSERT INTO local_oplog(origin,seq,clock,note_id,body)
 SELECT origin,next_seq,clock,id,body FROM device CROSS JOIN local_notes;
UPDATE device SET next_seq=next_seq+1;
ROLLBACK;
SELECT body AS committed_body,next_seq,clock,(SELECT count(*) FROM local_oplog) AS durable_ops
 FROM local_notes CROSS JOIN device;
```

## Expected result
The committed operation is device-a/g1:1, clock 1, body offline edit, acknowledged 0. After the aborted attempt, committed_body is offline edit, next_seq is 2, clock is 1 and durable_ops is 1. Neither a sequence gap nor an intent for the aborted edit remains.

## Systems lens
An embedded database can own the durable prefix of a disconnected device's history. SQLite makes local allocation and intent atomic; the application still defines identity, generation changes, delivery and merge policy. A local operation log is not SQLite's WAL and does not inherit a replication protocol from it.

## Optional variation
Move only the next_seq update outside the transaction and abort the edit. Predict the receiver's next missing sequence. Then explain which retained metadata a restored device would need before it could safely continue using device-a/g1.
