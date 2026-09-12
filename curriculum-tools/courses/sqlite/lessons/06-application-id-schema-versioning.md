# Version an application file format

slug: application-id-schema-versioning
category: lab-file
difficulty: intermediate
tags: file-format, transactions, idempotency, migrations
prerequisites: decode-database-header
safety: ddl
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 12
revision: 3

## Overview
Commit a schema migration and its application version together, then deliberately fail and roll back the next migration. Reopen the file through a reader acceptance check that examines both metadata and schema shape. The failure path is the point: a version number is useful only when it agrees with what was actually committed.

## Syntax breakdown
### In plain terms

A reader needs to know whether it understands a file before using its rows. application_id identifies the application format and user_version records the application's schema generation. Both are application-controlled header fields; neither is the SQLite library version or an automatic migration system.

### What you are learning

- **Atomic migration:** Schema, data and version metadata must publish together.
- **Error scope:** A default constraint error does not automatically roll back all SQLite transaction work.
- **Reader contract:** A supported marker/version and expected schema shape justify acceptance.

### Piece by piece

- **PRAGMA application_id and user_version** reset the fixture, then assign format marker 1397836884 (0x53514c54) and generation 2 inside the migration transaction.
- **BEGIN IMMEDIATE** obtains writer admission before changing the schema. **ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT ''** adds body and supplies a compatible value for the existing row.
- **COMMIT** publishes the column, extra document and version together. **sqlite_schema.sql** displays the resulting definition; **count(body)** verifies both rows have non-NULL bodies.
- **The second transaction** adds pending_column and sets version 3, then intentionally inserts duplicate id 1. The UNIQUE error is followed by explicit **ROLLBACK**; do not assume the error itself abandoned the migration.
- **pragma_table_info('documents')** exposes column names. A zero count for pending_column and user_version=2 prove the rollback restored schema and metadata together.
- **.shell sqlite3 FILE SQL** opens an independent reader. **CASE WHEN** combines the expected application ID, supported version and column checks into reader accepts v2 or reader rejects file.
- **The final reopen query** verifies the durable marker and two documents. An application should refuse unsupported formats rather than silently treating any valid SQLite file as its own.

## Caution
Use an application-specific identifier in a real product and advance user_version only after a successful migration. Do not treat either pragma as SQLite's library version.

## Setup
```sql
.print -- The wrapper has already opened $TUTOR_SQLITE_DB
DROP TABLE IF EXISTS documents;
PRAGMA application_id=0;
PRAGMA user_version=0;
CREATE TABLE documents(id INTEGER PRIMARY KEY, title TEXT NOT NULL);
INSERT INTO documents(title) VALUES ('first document');
```

## Run
```sql
BEGIN IMMEDIATE;
ALTER TABLE documents ADD COLUMN body TEXT NOT NULL DEFAULT '';
PRAGMA application_id=1397836884;
PRAGMA user_version=2;
INSERT INTO documents(title, body) VALUES ('migrated document', 'body survives reopen');
COMMIT;
.headers on
.mode box
PRAGMA application_id;
PRAGMA user_version;
SELECT sql FROM sqlite_schema WHERE name='documents';
SELECT count(*) AS documents, count(body) AS rows_with_body FROM documents;
.print -- A failed migration must explicitly abandon the transaction
BEGIN IMMEDIATE;
ALTER TABLE documents ADD COLUMN pending_column TEXT;
PRAGMA user_version=3;
INSERT INTO documents(id, title, body) VALUES (1, 'duplicate identity', 'must fail');
ROLLBACK;
SELECT 'after rollback', user_version,
  (SELECT count(*) FROM pragma_table_info('documents') WHERE name='pending_column') AS leaked_column
FROM pragma_user_version;
.print -- A fresh reader refuses an unknown format or a mismatched schema generation
.shell sqlite3 "$TUTOR_SQLITE_DB" "SELECT CASE WHEN application_id=1397836884 AND user_version=2 AND (SELECT count(*) FROM pragma_table_info('documents') WHERE name='body')=1 AND (SELECT count(*) FROM pragma_table_info('documents') WHERE name='pending_column')=0 THEN 'reader accepts v2' ELSE 'reader rejects file' END FROM pragma_application_id, pragma_user_version;"
.shell sqlite3 "$TUTOR_SQLITE_DB" "PRAGMA application_id; PRAGMA user_version; SELECT count(*), count(body) FROM documents;"
```

## Expected result
The first migration commits application_id=1397836884, user_version=2, a body column and two documents with bodies. The next migration prints one expected UNIQUE failure and is explicitly rolled back. after rollback reports version 2 and leaked_column=0; a fresh process prints reader accepts v2 and sees the same two documents.

## Systems lens
SQLite can be an application file format, so migration and reader compatibility belong to the application, not an unseen service administrator. Atomic metadata updates prevent half-migrations; a supported-version gate prevents a different class of failure, where a structurally valid file is interpreted under the wrong contract.

## Optional variation
On another owned copy, change user_version to an unsupported generation without changing the
schema and run the acceptance query: it reports reader rejects file. For the failed-migration
comparison, rerun Setup and Run only through the deliberate duplicate insert, omitting its
immediate ROLLBACK. In that same connection inspect user_version and pending_column with the
supplied query before continuing: the open transaction still contains version3 and that column.

The default constraint error abandoned the failed statement, leaving the transaction's earlier
work pending. Explicitly ROLLBACK before running the independent-reader checks; they again see
version2 without pending_column. Close connections and remove only this comparison's owned copy.
