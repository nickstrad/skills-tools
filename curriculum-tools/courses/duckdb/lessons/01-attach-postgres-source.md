# Query PostgreSQL from DuckDB

slug: attach-postgres-source
category: PostgreSQL analytical companion
difficulty: beginner
tags: duckdb, connections
safety: privileged
run-in: shell
sessions: 1
min-version: 1.5.5
minutes: 12
revision: 1

## Overview

You have two PostgreSQL tables called orders. One holds current application orders in
the sales schema; the public schema holds a decoy import. Your task is to make DuckDB
answer from the application source and reconcile the result with PostgreSQL's own client.

DuckDB runs inside the CLI process. Its PostgreSQL extension sends reads to a separate
PostgreSQL server. Attaching a database gives that connection a catalog name in DuckDB;
it does not make a local copy of its tables.

```text
DuckDB CLI                         supplied private PostgreSQL
  app (attached catalog) --------> sales.orders   <-- wanted
                              \-> public.orders  <-- decoy import

DuckDB name: app.sales.orders       psql name: sales.orders
             catalog.schema.table             schema.table
```

Each source row is one order, keyed by order_id; amount_cents is an integer number of cents.
The fixture spans September 13–15, with paid and pending orders. The question is:
which paid orders belong to September 14, 2026, and what is their total?

## Syntax breakdown

- Run these blocks in **Bash**, in the same terminal. One-time setup on this droplet:
  **bash curriculum-tools/courses/duckdb/lab/install.sh** from the repository root.
  It installs the pinned 1.5.5 CLI and matching signed connectors into the course cache.
  Existing PostgreSQL 16 and sqlite3 clients supply the source tools.
- **source .../session.sh 1** prepares the fixture, editable starter and helpers in your current
  Bash shell. It supplies connection details and a SELECT-only reader role, then prints the
  attachment and catalog inventory. **DUCK_LAB** is your unique directory, never /labs/pglab.
  Finish with **duck_cleanup**; normal shell exit also cleans up unless an EXIT trap already exists.
- **duck** calls the course's pinned CLI. **-bail** stops on SQL errors.
  **-csv** prints compact comma-separated results. **:memory:** keeps this DuckDB session temporary.
- Setup prints **attach.sql**, the actual connection: **LOAD postgres** loads the connector;
  **ATTACH ... AS app (TYPE postgres, READ_ONLY)** connects under the catalog name app.
  The fixture uses a private socket directory, port 55439, database postgres and role reader.
- **information_schema.tables** lists table_catalog, table_schema and table_name.
  The inspection limits schemas to public and sales to omit PostgreSQL's system catalogs.
  A catalog is an attached database; a schema is a namespace inside it.
  For example, **SELECT * FROM app.public.orders** names a particular remote table.
- **psql -X -v ON_ERROR_STOP=1** ignores personal startup files and stops on source SQL errors.
  Its explicit host/port/database prevent accidental use of the learner lab.

The setup helper creates **query.sql** with this starter. Open **"$DUCK_LAB/query.sql"**
in your editor after Setup; the helper prints its full path. Your edits are the lesson task.

```sql
SELECT order_id, amount_cents FROM app.public.orders
WHERE ordered_on=DATE '2026-09-14' AND status='paid' ORDER BY order_id;
SELECT count(*) AS orders, sum(amount_cents) AS total_cents FROM app.public.orders
WHERE ordered_on=DATE '2026-09-14' AND status='paid';
```

**duck_run** runs that file with the supplied attachment and staging SQL in one DuckDB
connection, stops on SQL errors, and prints CSV results. Each run uses a fresh in-memory database.

Spend 3–4 minutes on the task: inspect the listed names and change the starter's source
qualification so it selects the sales table. Retain the date/status boundaries, show the order IDs,
then count and total those same rows. Hint: the first part of the three-part name is the
attachment alias, not the PostgreSQL database name.

## Caution

The helper creates and later removes its own PostgreSQL cluster; that is why this lesson is
marked privileged. Keep all supplied paths and connection flags. READ_ONLY protects the attachment;
the fixture's reader role also lacks source write privileges. Reads still consume source resources.

## Setup
```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 1
```

## Run
```bash
duck_run
psql -X -h "$DUCK_LAB" -p 55439 -U reader -d postgres -v ON_ERROR_STOP=1 -c "
SELECT order_id, amount_cents FROM sales.orders
WHERE ordered_on=DATE '2026-09-14' AND status='paid' ORDER BY order_id;
SELECT count(*) AS orders, sum(amount_cents) AS total_cents FROM sales.orders
WHERE ordered_on=DATE '2026-09-14' AND status='paid';"
```

## Expected result

The catalog lists app.public.orders and app.sales.orders. The untouched starter returns
order 999 and total 99900. A successful query can therefore read the wrong source.

Your completed query and psql both return IDs 102/104 with amounts 2300/1700, count 2,
total 4000 cents. A missing app catalog usually means the attachment and query ran in
different CLI processes. **duck_run** keeps both in the same connection.

Worked answer — replace query.sql with:
```sql
SELECT order_id, amount_cents FROM app.sales.orders
WHERE ordered_on=DATE '2026-09-14' AND status='paid' ORDER BY order_id;
SELECT count(*) AS orders, sum(amount_cents) AS total_cents FROM app.sales.orders
WHERE ordered_on=DATE '2026-09-14' AND status='paid';
```

Cleanup, after inspecting the results:
```bash
duck_cleanup
```

## Systems lens

A qualified name is part of the data contract. Both clients read the same source rows,
through different SQL interfaces; neither comparison creates a stored DuckDB extract.
The equality is measured on this quiet fixture, not a promise that two independent reads
of a changing production database share one snapshot.
