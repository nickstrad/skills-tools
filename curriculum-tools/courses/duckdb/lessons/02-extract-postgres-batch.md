# Bring a bounded PostgreSQL extract local

slug: extract-postgres-batch
category: PostgreSQL analytical companion
difficulty: beginner
tags: duckdb, data-flows
prerequisites: attach-postgres-source
safety: privileged
run-in: shell
sessions: 1
min-version: 1.5.5
minutes: 12
revision: 2

## Overview

An attachment keeps reading PostgreSQL. A local extract stores a chosen result in DuckDB
so later analysis can reuse it. You will choose what crosses the boundary and observe that
new source data appears locally only after a refresh.

The practical goal is to copy a useful slice once and analyze it locally while PostgreSQL
keeps changing. You choose what to copy and when to rebuild it. In this experiment, the local
copy keeps two matching orders after PostgreSQL gains a third; rerunning your SQL updates it.

This lesson creates its own PostgreSQL orders fixture. Each row is one order, with order_id,
ordered_on, status, amount_cents and a synthetic customer_email. Your extract must contain
only order_id and amount_cents for paid orders on September 14, 2026. The email is unnecessary.

```text
PostgreSQL sales.orders -- source SQL filter + projection --> local DuckDB batch
          |                                                   |
          +-- insert one paid order                           +-- still old rows
          |
          +---------------- explicit refresh ----------------> replaced batch
```

Projection means selecting columns. Bounding the source query prevents unrelated rows and columns
from becoming the local extract. It does not mean PostgreSQL performs zero scanning work.

## Syntax breakdown

- In Bash, **source .../session.sh 2** prepares a fresh private PostgreSQL fixture, sets
  **DUCK_COURSE** and **DUCK_LAB**, creates your starter, and defines the helpers. Use source so
  these stay available in your shell. No earlier lab is needed; the CLI must already be installed.
  **duckdb** is the normal user-installed CLI;
  **-bail** stops on SQL errors and **-csv** prints CSV results.
  Run **duck_cleanup** when finished; normal shell
  exit also cleans up unless your shell already had an EXIT trap.
- Setup offers a script or manual path. **manual** still prepares folders, fixture, variables and
  starters, but leaves the DuckDB connection check to you. **LOAD postgres** loads the extension;
  **ATTACH ... AS app (TYPE postgres, READ_ONLY)** names the source connection and protects it
  from writes through DuckDB. **-c** executes the quoted SQL and exits.
- **postgres_query('app', $$ ... $$)** executes the enclosed SQL in PostgreSQL.
  The dollar-quoted SQL string avoids escaping its single-quoted date and status values.
  Inside it use **sales.orders**: app is DuckDB's alias and is not a PostgreSQL schema.
- For a related example, **SELECT order_id FROM sales.orders WHERE ordered_on < DATE '2026-09-14'**
  projects one column and chooses older rows. Use both bounds for the requested day:
  at or after its start, strictly before the next day; combine this with the status condition.
- **CREATE OR REPLACE TABLE batch AS SELECT ...** stores the result in the local database.
  **"$DUCK_LAB/local.duckdb"** is a persistent DuckDB file, reused across CLI invocations.
  **DESCRIBE batch** shows its columns; **SHOW TABLES** is unnecessary for this known destination.
- **psql ... -U postgres** performs the supplied source insert only in this owned fixture.
  The attachment still uses the SELECT-only reader. Each CLI invocation closes before the next opens.
- Rerunning query.sql performs an explicit replacement; it does not append another copy.
- **cat "$DUCK_LAB/session.sql" "$DUCK_LAB/query.sql" | duckdb "$DUCK_LAB/local.duckdb" -bail -csv**
  feeds the supplied PostgreSQL attachment SQL followed by your edited query into one CLI process.
  The database-file argument makes the local batch persist when that process exits.
- **duckdb ... -c "SELECT ... FROM batch;"** executes the SQL string directly against the saved
  local file. It does not run query.sql or refresh the batch. The first file-based invocation
  creates the extract; the final one rebuilds it after the two clients reveal different totals.

The setup helper creates **query.sql** with this starter already in it; the file is not empty.
Open **"$DUCK_LAB/query.sql"** in your editor after Setup; the helper prints its full path.
Edit the existing SQL, save it, then execute the CLI command in Run.

```sql
CREATE OR REPLACE TABLE batch AS
SELECT
  *
FROM
  postgres_query(
    'app',
    $$
      SELECT
        *
      FROM
        sales.orders
    $$
  );

DESCRIBE batch;

SELECT
  *
FROM
  batch
ORDER BY
  order_id;

SELECT
  count(*) AS orders,
  sum(amount_cents) AS total_cents
FROM
  batch;
```

Each file-based CLI invocation rereads your saved query and reuses **local.duckdb**.
The refresh comes from **CREATE OR REPLACE TABLE batch**, not from opening the database file.

Spend 3–5 minutes editing query.sql before Run. Replace the all-columns, all-orders starter
with the two-column source query for paid orders in the requested day. Preserve the local table
name and inspection queries. Hint: put the filter inside the dollar-quoted PostgreSQL SQL,
and ensure September 15 does not enter the extract.

## Caution

Setup and the supplied insert write only the private fixture. Keep its explicit endpoint flags.
This lesson owns a fresh local.duckdb; replacing batch is safe here because no other work uses it.
Run the source-insert block once per setup; a second attempt conflicts on its primary key.
For a fresh attempt, clean up and repeat Setup.

## Setup
### Setup - script

Choose one setup option. This prepares the lab and checks the source connection for you.
Both options leave the same populated query.sql to edit before Run.

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 2
```

### Setup - manual

The helper handles folders, fixture provisioning and shell variables. Run LOAD and ATTACH
yourself, then check that the source has five orders. Bash substitutes **$DUCK_LAB** in the SQL.

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 2 manual
duckdb :memory: -bail -csv -c "
LOAD postgres;

ATTACH 'host=$DUCK_LAB port=55439 dbname=postgres user=reader' AS app (TYPE postgres, READ_ONLY);

SELECT
  count(*) AS source_orders
FROM
  app.sales.orders;"
```

This check uses a temporary connection and makes no local extract. Run repeats the shown
LOAD/ATTACH from session.sql in a new connection to local.duckdb, then executes your edited query.

## Run
```bash
cat "$DUCK_LAB/session.sql" "$DUCK_LAB/query.sql" |
  duckdb "$DUCK_LAB/local.duckdb" -bail -csv
psql -X -h "$DUCK_LAB" -p 55439 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
INSERT INTO
  sales.orders
VALUES
  (106, '2026-09-14', 'paid', 600, 'new@example.invalid');"
duckdb "$DUCK_LAB/local.duckdb" -bail -csv -c "
SELECT
  'local_before_refresh' AS stage,
  count(*) AS orders,
  sum(amount_cents) AS total_cents
FROM
  batch;"
psql -X -h "$DUCK_LAB" -p 55439 -U reader -d postgres -v ON_ERROR_STOP=1 -c "
SELECT
  count(*) AS orders,
  sum(amount_cents) AS total_cents
FROM
  sales.orders
WHERE
  ordered_on >= DATE '2026-09-14'
  AND ordered_on < DATE '2026-09-15'
  AND status = 'paid';"
cat "$DUCK_LAB/session.sql" "$DUCK_LAB/query.sql" |
  duckdb "$DUCK_LAB/local.duckdb" -bail -csv
```

## Expected result

Initially batch has only order_id and amount_cents, IDs 102/104, count 2 and total 4000.
After the insert, local_before_refresh still shows 2/4000 while psql shows 3/4600.
After replacement, batch contains IDs 102/104/106 and 3/4600. No email column is present.

The untouched starter initially copies five rows, five columns and 6900 cents.
A filter without the upper date bound also includes order 105 from September 15.
Use IDs and DESCRIBE as well as totals to detect an incorrect extraction boundary.

Worked answer — replace query.sql with:
```sql
CREATE OR REPLACE TABLE batch AS
SELECT
  *
FROM
  postgres_query(
    'app',
    $$
      SELECT
        order_id,
        amount_cents
      FROM
        sales.orders
      WHERE
        ordered_on >= DATE '2026-09-14'
        AND ordered_on < DATE '2026-09-15'
        AND status = 'paid'
    $$
  );

DESCRIBE batch;

SELECT
  *
FROM
  batch
ORDER BY
  order_id;

SELECT
  count(*) AS orders,
  sum(amount_cents) AS total_cents
FROM
  batch;
```

Cleanup:
```bash
duck_cleanup
```

## Systems lens

The saved table has an explicit freshness boundary. Closing and reopening DuckDB reads that
saved result; it does not rerun the source query. Replacing the table moves the boundary.
Source-side SQL controls the result transmitted to DuckDB, but this small fixture does not
measure network bytes or source execution cost. Independent extracts from multiple databases
would not automatically form one atomic snapshot.
