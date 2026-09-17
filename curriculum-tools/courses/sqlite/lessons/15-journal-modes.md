# Compare rollback journal cleanup modes

slug: journal-modes
category: journals
difficulty: intermediate
tags: journal-modes, rollback-journal, atomicity
prerequisites: rollback-journal-lifecycle
safety: writes-data
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 18
revision: 2

## Overview
Commit equivalent rows under DELETE, TRUNCATE and PERSIST, and compare the journal left behind. All three can publish the same logical result while using different filesystem operations to invalidate undo state. Learn to distinguish allocated file space from live recovery evidence.

## Syntax breakdown
### In plain terms

A journal need not disappear to stop being a valid rollback record. SQLite can remove the file, truncate it, or invalidate its header while preserving allocation. The experiment holds logical writes constant and changes only this cleanup policy.

### What you are learning

- **Invalidation versus deletion:** A nonempty sidecar is not automatically a hot journal.
- **Allocation reuse:** Keeping space can avoid repeated file allocation.
- **Operational interpretation:** Recovery depends on valid metadata and locks, not filename existence alone.

### Piece by piece

- **PRAGMA journal_mode=DELETE/TRUNCATE/PERSIST** requests each rollback policy. DELETE unlinks the completed journal; TRUNCATE reduces its length to zero; PERSIST invalidates the header while retaining file space. Do not assume rollback-mode choices persist across unrelated connections like WAL mode does.
- **BEGIN/COMMIT** group the two rows for each named mode into one transaction.
- **.shell if test -e** checks existence without opening SQLite. **stat -c** formats byte length with %s; **echo** reports absence explicitly.
- **GROUP BY mode and count(*)** verify exactly two committed rows per mode. **.headers on** labels that evidence.
- **.print and the final journal_mode=DELETE** document and perform cleanup of the PERSIST artifact, leaving the next experiment a known baseline.
- **MEMORY and OFF**, discussed in the caution, are deliberately excluded because their crash-recovery promises differ; they are not interchangeable performance settings.

## Caution
MEMORY and OFF are useful to discuss but are intentionally not used here: they weaken crash-recovery guarantees and are unsuitable for durable state without a separately justified contract.

## Setup
```sql
DROP TABLE IF EXISTS mode_rows;

CREATE TABLE mode_rows (mode TEXT, value INTEGER);
```

## Run
```sql
DELETE FROM mode_rows;

PRAGMA journal_mode = DELETE;

BEGIN;

INSERT INTO
  mode_rows
VALUES
  ('DELETE', 1),
  ('DELETE', 2);

COMMIT;

.shell if [ -e "$TUTOR_SQLITE_DB-journal" ]; then stat -c 'DELETE exists bytes=%s' "$TUTOR_SQLITE_DB-journal"; else echo 'DELETE absent'; fi
PRAGMA journal_mode = TRUNCATE;

BEGIN;

INSERT INTO
  mode_rows
VALUES
  ('TRUNCATE', 1),
  ('TRUNCATE', 2);

COMMIT;

.shell if [ -e "$TUTOR_SQLITE_DB-journal" ]; then stat -c 'TRUNCATE exists bytes=%s' "$TUTOR_SQLITE_DB-journal"; else echo 'TRUNCATE absent'; fi
PRAGMA journal_mode = PERSIST;

BEGIN;

INSERT INTO
  mode_rows
VALUES
  ('PERSIST', 1),
  ('PERSIST', 2);

COMMIT;

.shell if [ -e "$TUTOR_SQLITE_DB-journal" ]; then stat -c 'PERSIST exists bytes=%s' "$TUTOR_SQLITE_DB-journal"; else echo 'PERSIST absent'; fi
.headers on
SELECT
  mode,
  count(*) AS rows
FROM
  mode_rows
GROUP BY
  mode
ORDER BY
  mode;

.print -- restore DELETE so later lessons start from the default mode
PRAGMA journal_mode = DELETE;

.shell if [ -e "$TUTOR_SQLITE_DB-journal" ]; then stat -c 'after_reset exists bytes=%s' "$TUTOR_SQLITE_DB-journal"; else echo 'after_reset absent'; fi
```

## Expected result
All three transactions commit their rows. DELETE normally prints journal absent; TRUNCATE prints an existing journal with bytes=0; PERSIST prints an existing nonzero-sized journal whose contents are reset for reuse. The final query reports exactly two rows for each of DELETE, PERSIST, and TRUNCATE. The closing PRAGMA journal_mode=DELETE prints delete, and the last check prints "after_reset absent": returning to DELETE removes the persisted journal, so later lessons start from the default mode with no stale sidecar.

## Systems lens
A storage protocol can invalidate a record without physically erasing it. This is useful intuition for log reuse and tombstones later, but here the authority is the journal header and lock protocol. Compare physical allocation policy separately from transaction outcome.
