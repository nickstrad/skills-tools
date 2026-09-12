# Engine integrity does not prove application correctness

slug: integrity-and-domain-checks
category: recovery
difficulty: intermediate
tags: integrity-check, consistency, observability
prerequisites: vacuum-into-snapshot
safety: ddl
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 15
revision: 1

## Overview
Create one orphan child while enforcement is disabled, then turn enforcement back on and ask three different health questions. Structural checks return ok even though a declared relationship remains broken. This extends the PostgreSQL integrity lesson by exposing SQLite's per-connection enforcement boundary.

## Syntax breakdown
### In plain terms

A database can have valid pages and B-trees while violating the application's relationships or allowed states. This lesson creates an orphan child row by temporarily disabling foreign-key enforcement, then runs structural, relational, and domain checks separately. Each result has a different scope, so one ok must not be treated as a complete health signal.

### What you are learning

- **Structural integrity** — page and B-tree consistency is necessary but not sufficient.
- **Foreign-key integrity** — relationship violations need foreign_key_check when bad data already exists.
- **Domain integrity** — business invariants require explicit queries or constraints.

### Piece by piece

- **PRAGMA foreign_keys=ON/OFF** (per-connection enforcement setting)
  - What it is: enables or disables enforcement of declared foreign keys for this connection.
  - What it does here: turns enforcement off only to create the deliberately invalid orphan, then turns it back on for checking.
  - What it gives us: a concrete reminder that this policy is not automatically global.
- **REFERENCES parent(id)** (foreign-key clause)
  - What it is: declares that child.parent_id should name an existing parent key.
  - What it does here: defines the relationship later reported as broken.
  - What it gives us: the table and row identifiers in foreign_key_check output.
- **PRAGMA quick_check** (bounded structural diagnostic)
  - What it is: a faster consistency check that does not inspect every cross-table invariant.
  - What it does here: checks pages/B-trees in the intentionally structurally valid database.
  - What it gives us: ok, demonstrating the boundary of the check.
- **PRAGMA integrity_check** (deeper structural diagnostic)
  - What it is: checks more structural invariants than quick_check.
  - What it does here: confirms the same valid-page result.
  - What it gives us: another ok that still cannot detect the orphan relationship.
- **PRAGMA foreign_key_check** (relational diagnostic)
  - What it is: scans declared foreign keys for violations already present.
  - What it does here: identifies child row 2 and its missing parent.
  - What it gives us: relationship evidence even though the page structure is sound.
- **LEFT JOIN ... IS NULL** (domain query pattern)
  - What it is: finds child rows with no matching parent.
  - What it does here: counts the same orphan at the application-query layer.
  - What it gives us: domain orphan count = 1, a check an application can expose in monitoring.

## Caution
Foreign keys are connection settings; every writer must enable PRAGMA foreign_keys=ON rather than relying on a process-wide default.

## Setup
```sql
DROP TABLE IF EXISTS child;
DROP TABLE IF EXISTS parent;
PRAGMA foreign_keys=ON;
CREATE TABLE parent(id INTEGER PRIMARY KEY);
CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id), state TEXT NOT NULL);
INSERT INTO parent VALUES (1);
INSERT INTO child VALUES (1, 1, 'ready');
PRAGMA foreign_keys=OFF;
INSERT INTO child VALUES (2, 999, 'ready');
PRAGMA foreign_keys=ON;
```

## Run
```sql
-- Session A
PRAGMA quick_check;
PRAGMA integrity_check;
PRAGMA foreign_key_check;
SELECT 'domain orphan count', count(*) FROM child c LEFT JOIN parent p ON p.id=c.parent_id WHERE p.id IS NULL;
SELECT 'domain ready count', count(*) FROM child WHERE state='ready';
```

## Expected result
quick_check and integrity_check each print ok because the B-tree and pages are structurally sound. foreign_key_check prints a row identifying child row 2 and parent; the domain orphan query prints 1, proving application-level consistency needs its own checks.

## Systems lens
Health checks certify specific invariants, not a database in the abstract. Structural checks, declared foreign-key checks and application queries cover different failure classes. Enabling SQLite foreign_keys for future writes does not retroactively repair old state; a restored offline replica also needs history reconciliation beyond all three checks.

## Optional variation
Add a CHECK constraint for allowed state values and compare what integrity_check can and cannot validate.
