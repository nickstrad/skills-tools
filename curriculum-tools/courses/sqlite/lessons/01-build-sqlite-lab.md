# Build a disposable SQLite lab

slug: build-sqlite-lab
category: lab-file
difficulty: beginner
tags: sqlite-cli, file-format, idempotency
safety: ddl
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 10
revision: 1

## Overview
Create one owned directory and a repeatable one-row baseline. Unlike the PostgreSQL lab, there is no database server to start or connect to: this process opens a local file and the library executes inside it. Establish the path boundary now because later experiments deliberately crash writers and damage copies.

## Syntax breakdown
### In plain terms

This establishes an owned SQLite file and proves that setup is repeatable. Every command may change only the path under sqlite-lab. Re-running demonstrates idempotency: the same preparation produces one known baseline row instead of accumulating data.

### What you are learning

- **File ownership** identifies exactly which path an experiment may modify.
- **CLI inspection** shows attached files and tables.
- **Repeatable setup** clears only this experiment's table and recreates it.

### Piece by piece

- **export VAR=value** (shell environment assignment): names a directory and database path for later commands; the printed path and stat result are the ownership evidence.
- **mkdir -p** (shell command; -p creates missing parents and accepts an existing directory): makes the scratch boundary safe to rerun.
- **sqlite3 FILE** (SQLite shell): opens or creates FILE and consumes the SQL heredoc; it creates events and one row.
- **DROP TABLE IF EXISTS** (SQL setup clause): removes this lesson's old table without failing when absent.
- **CREATE TABLE with PRIMARY KEY, NOT NULL, and DEFAULT** (SQL definition): gives events an identity and required text fields, with an empty payload default.
- **.databases** (SQLite dot command): lists database names and paths; main must be the learner-owned lab.db.
- **.tables** (SQLite dot command): lists visible tables; events proves setup ran.
- **SELECT count(*) AS baseline_rows** (SQL aggregate and alias): counts rows and names the evidence column, which must be 1.
- **stat -c format FILE** (shell inspection; -c selects the format, %s is bytes and %n is the path): proves the file exists and records its size.
- **A host directory copy** (optional file comparison): creates a separate owned copy whose path can be inspected with .databases after the original CLI has exited.

## Run
```sh
export SQLITE_LAB="$PWD/sqlite-lab"
export TUTOR_SQLITE_DB="$SQLITE_LAB/lab.db"
mkdir -p "$SQLITE_LAB"
sqlite3 "$SQLITE_LAB/lab.db" <<'SQL'
.headers on
.mode box
DROP TABLE IF EXISTS events;

CREATE TABLE events (
  event_id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT ''
);

INSERT INTO
  events (kind, payload)
VALUES
  ('baseline', 'owned lab');

.databases
.tables
SELECT
  count(*) AS baseline_rows
FROM
  events;
SQL
stat -c 'lab.db bytes=%s path=%n' "$SQLITE_LAB/lab.db"
```

## Expected result
sqlite3 reports one main database whose path ends in sqlite-lab/lab.db, .tables prints events, and baseline_rows is 1. A second run again reports one row because setup drops and recreates the table.

## Systems lens
Embedding removes a service boundary, not the need for operational ownership. The application inherits responsibility for file placement, permissions, connection policy, backups and recovery. The lab makes that responsibility concrete without repeating PostgreSQL's server-installation workflow.

## Optional variation
After the original CLI has exited and no connection is using the lab file, copy the directory to
a new, unused sqlite-lab-copy directory and open its lab.db. Run .databases and the baseline count
query: main now names the copy's path while baseline_rows remains1. Close that CLI and remove
only the copy created for this comparison.
