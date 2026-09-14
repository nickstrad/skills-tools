# Query an existing SQLite file

slug: attach-sqlite-file
category: Combining scattered data
difficulty: beginner
tags: duckdb, data-flows
prerequisites: extract-postgres-batch
safety: writes-data
run-in: shell
sessions: 1
min-version: 1.5.5
minutes: 10
revision: 2

## Overview

A SQLite database is a file with its own tables and storage format. DuckDB's SQLite extension
lets you query those tables through a named attachment. You will locate a supplied customer table,
select the west-region customers, and compare the result with sqlite3.

The fixture has four customers, one row per customer_id. A local DuckDB table also called
customers contains a decoy row. The challenge is choosing the intended data source, not
assuming that an unqualified table name means the attached file.

```text
DuckDB CLI
  memory.main.customers --> local decoy row
  source.main.customers --> SQLite extension --> source.sqlite
                                               four real fixture customers
```

Attaching source.sqlite does not convert it to a DuckDB database. This lab writes its own
synthetic file at setup, then uses a read-only attachment.

## Syntax breakdown

- In Bash, **source .../session.sh 3** creates a fresh SQLite fixture without PostgreSQL,
  sets **DUCK_LAB** and **DUCK_COURSE**, creates your starter, and supplies the helpers.
  Use source with the course CLI already installed. Setup prints the catalog inventory.
  **-bail** stops on SQL errors, **-csv** prints CSV; **:memory:** creates a temporary database.
- The helper saves the source file's byte fingerprint; **duck_check_source** verifies it.
  Our fixture is closed and has no active writer. Do not copy only the main file of a live
  SQLite database with pending WAL; use a SQLite-native backup for real data.
- **LOAD sqlite; ATTACH ... AS source (TYPE sqlite, READ_ONLY)** exposes the file.
  **source.main.customers** names catalog, schema, table. SQLite's tables appear under main.
- **information_schema.tables** lists names across the attached catalogs. The helper supplies
  a local customers decoy and prints both names; **duck_run** attaches the source and recreates
  the local decoy before running your query in that same connection.
- A related query, **SELECT customer_id FROM source.main.customers WHERE region='east'**,
  selects a different region. Adapt the source and predicate in your starter for west.
- **sqlite3 -readonly -header -csv** opens the existing source in the native client and prints
  comparable columns. Within that client the same table is simply customers.

The setup helper creates **query.sql** with this starter. Open **"$DUCK_LAB/query.sql"**
in your editor after Setup; the helper prints its full path. Your edits are the lesson task.

```sql
SELECT customer_id, name FROM memory.main.customers
WHERE region='east' ORDER BY customer_id;
```

**duck_run** runs that file with the supplied attachment and staging SQL in one DuckDB
connection, stops on SQL errors, and prints CSV results. Each run uses a fresh in-memory database.

Spend 3–4 minutes editing query.sql after Setup: select the west customers from the SQLite
attachment, keeping customer_id/name output and ordering. Use the catalog listing to distinguish
the two customers tables. Success means matching native IDs/names and leaving the file unchanged.

## Setup
```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 3
```

## Run
```bash
duck_run
sqlite3 -readonly -header -csv "$DUCK_LAB/source.sqlite" "
SELECT customer_id, name FROM customers WHERE region='west' ORDER BY customer_id;"
duck_check_source
```

## Expected result

The catalog lists memory.main.customers and source.main.customers.
The untouched starter returns no rows. Changing only the region returns the local decoy,
999/Decoy. The completed query and sqlite3 return 1/Ada and 3/Sam. The hash check prints OK.

Worked answer — replace query.sql with:
```sql
SELECT customer_id, name FROM source.main.customers
WHERE region='west' ORDER BY customer_id;
```

Cleanup:
```bash
duck_cleanup
```

## Systems lens

DuckDB provides an analytical interface to existing storage. The attachment alias determines
which catalog is read; no local copy was created by SELECT. The successful native reopen and
unchanged fingerprint corroborate the file boundary for this quiet fixture. They do not test
concurrent writer behavior or establish a backup procedure.
