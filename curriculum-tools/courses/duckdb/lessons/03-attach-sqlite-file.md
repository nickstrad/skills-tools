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
revision: 1

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

- Use Bash with the course CLI installed as in lesson 1. **setup.sh 3** creates its own
  SQLite file without starting PostgreSQL. **DUCK_LAB**, **duck**, **trap**, **-bail**, and
  **-csv** have the same meanings as before; **:memory:** creates a temporary DuckDB database.
- **sha256sum** saves the source file's byte fingerprint; **-c** later checks it.
  Our fixture is closed and has no active writer. Do not copy only the main file of a live
  SQLite database with pending WAL; use a SQLite-native backup for real data.
- **LOAD sqlite; ATTACH ... AS source (TYPE sqlite, READ_ONLY)** exposes the file.
  **source.main.customers** names catalog, schema, table. SQLite's tables appear under main.
- **information_schema.tables** lists names across the attached catalogs.
  **.read** is unnecessary here: the shell concatenates the attachment, local decoy setup,
  and query files into one CLI input.
- A related query, **SELECT customer_id FROM source.main.customers WHERE region='east'**,
  selects a different region. Adapt the source and predicate in your starter for west.
- **sqlite3 -readonly -header -csv** opens the existing source in the native client and prints
  comparable columns. Within that client the same table is simply customers.

Spend 3–4 minutes editing query.sql after Setup: select the west customers from the SQLite
attachment, keeping customer_id/name output and ordering. Use the catalog listing to distinguish
the two customers tables. Success means matching native IDs/names and leaving the file unchanged.

## Setup
```bash
cd /root/Software/skills-tools
export DUCK_COURSE="$PWD/curriculum-tools/courses/duckdb"
export DUCK_LAB=$(bash "$DUCK_COURSE/lab/setup.sh" 3)
test -n "$DUCK_LAB" || exit 1
trap 'bash "$DUCK_COURSE/lab/cleanup.sh" "$DUCK_LAB"' EXIT
duck() { bash "$DUCK_COURSE/lab/duckdb.sh" "$@"; }
sha256sum "$DUCK_LAB/source.sqlite" > "$DUCK_LAB/source.sha256"
cat > "$DUCK_LAB/local.sql" <<'SQL'
CREATE TABLE customers AS SELECT 999 AS customer_id, 'west' AS region, 'Decoy' AS name;
SQL
{ cat "$DUCK_LAB/attach.sql"; cat "$DUCK_LAB/local.sql"; cat <<'SQL'
SELECT table_catalog, table_schema, table_name
FROM information_schema.tables WHERE table_name='customers' ORDER BY table_catalog;
SQL
} | duck :memory: -bail -csv
cat > "$DUCK_LAB/query.sql" <<'SQL'
SELECT customer_id, name FROM memory.main.customers
WHERE region='east' ORDER BY customer_id;
SQL
printf 'Edit the source and region in %s/query.sql before Run.\n' "$DUCK_LAB"
```

## Run
```bash
{ cat "$DUCK_LAB/attach.sql"; cat "$DUCK_LAB/local.sql"; cat "$DUCK_LAB/query.sql"; } | duck :memory: -bail -csv
sqlite3 -readonly -header -csv "$DUCK_LAB/source.sqlite" "
SELECT customer_id, name FROM customers WHERE region='west' ORDER BY customer_id;"
sha256sum -c "$DUCK_LAB/source.sha256"
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
bash "$DUCK_COURSE/lab/cleanup.sh" "$DUCK_LAB"
trap - EXIT
unset DUCK_LAB
```

## Systems lens

DuckDB provides an analytical interface to existing storage. The attachment alias determines
which catalog is read; no local copy was created by SELECT. The successful native reopen and
unchanged fingerprint corroborate the file boundary for this quiet fixture. They do not test
concurrent writer behavior or establish a backup procedure.

