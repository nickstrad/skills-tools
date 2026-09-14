# Turn a CSV file into an answer

slug: query-a-file
category: Combining scattered data
difficulty: beginner
tags: duckdb, data-flows
prerequisites: repair-sqlite-types
safety: writes-data
run-in: shell
sessions: 1
min-version: 1.5.5
minutes: 10
revision: 2

## Overview

DuckDB can query a CSV directly without importing it into a table. You will turn an order export
into a small report by choosing the rows that actually answer the question.

The file has one row per order_id, a calendar date, paid/pending status, and integer amount_cents.
It spans September 13–15. Find paid orders on September 14, 2026, then report their count and
total cents. Other days and pending orders are plausible distractions.

```text
orders.csv: five order rows
        |
        v
read_csv --> date + status selection --> two rows --> count + sum
              learner's boundary
```

The query reads a supplied, well-formed local file. Type inference is enough for this fixture;
the next planned lesson tackles messy input and explicit type contracts.

## Syntax breakdown

- In Bash, **source .../session.sh 5** supplies a fresh orders.csv, **DUCK_LAB**,
  **DUCK_COURSE**, your starter and the helpers. No PostgreSQL or earlier lab is required.
  The course CLI must be installed.
- **duck :memory: -bail -csv < "$DUCK_LAB/query.sql"** runs your saved SQL file through
  the CLI. **duck** forwards arguments to the pinned DuckDB CLI with course settings;
  **:memory:** starts a fresh temporary database, **-bail** stops on SQL errors, and
  **-csv** prints CSV results. Bash's **<** feeds the file to DuckDB's standard input.
  This lesson reads CSV directly, so no attachment SQL needs to precede your query.
- Script setup prints the small raw CSV and its inferred types; the manual option lets you run
  these inspections yourself. Both prepare folders, variables, fingerprints and starter files.
  The helper records a fingerprint; **duck_check_source** verifies that analysis left it unchanged.
- **read_csv('path', header=true)** exposes the file as rows and uses the first line as names.
  **DESCRIBE SELECT ...** inspects inferred column types before your report runs.
  This CLI uses **:memory:** so no persistent DuckDB database is created.
- **DATE '2026-09-14'** is a typed SQL date literal, matching the inferred DATE column.
  A related predicate, **ordered_on < DATE '2026-09-14'**, selects earlier dates.
- **count(*)** counts selected orders; **sum(amount_cents)** totals the same selection.
  Keep the row-inspection and aggregate predicates identical. Ordered IDs are stronger evidence
  than a total alone.
- The helper supplies the file path in your query; only the WHERE clauses are your task.
  Finish with **duck_cleanup**.

The setup helper creates **query.sql** with this starter already in it; the file is not empty.
Open **"$DUCK_LAB/query.sql"** in your editor after Setup; the helper prints its full path.
Edit the existing SQL, save it, then execute the CLI command in Run.

```sql
SELECT order_id, amount_cents FROM read_csv('LAB_PATH/orders.csv', header=true)
WHERE status='paid' ORDER BY order_id;
SELECT count(*) AS orders, sum(amount_cents) AS total_cents
FROM read_csv('LAB_PATH/orders.csv', header=true) WHERE status='paid';
```

The Run command reads your saved edits each time and closes DuckDB after executing the file.
The helper fills in **LAB_PATH** with your actual fixture directory.

Spend 3–4 minutes adapting both WHERE clauses in query.sql before Run. Select only paid
orders in the requested day. Inspect the resulting IDs and reconcile their integer-cent sum
with the raw file. Hint: a date filter alone still includes a pending order.

## Setup
### Setup - script

Choose one setup option. This prepares the CSV and shows its contents and inferred types for you.
Both options create the same populated query.sql; edit it before Run.

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 5
```

### Setup - manual

The helper handles folders, the fixture file and variables. Print the CSV, then inspect its
types through DuckDB yourself. **-c** executes the SQL string and exits; Bash supplies the path.
Expect BIGINT, DATE, VARCHAR and BIGINT for the four columns.

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 5 manual
cat "$DUCK_LAB/orders.csv"
duck :memory: -bail -csv -c "
DESCRIBE SELECT * FROM read_csv('$DUCK_LAB/orders.csv', header=true);"
```

The inspection connection closes afterward. Run reads the CSV again using your edited SQL;
neither path needs an attachment or a persistent DuckDB database.

## Run
```bash
duck :memory: -bail -csv < "$DUCK_LAB/query.sql"
duck_check_source
```

## Expected result

The inferred types are BIGINT, DATE, VARCHAR and BIGINT. The untouched starter selects
four paid orders across all days: 4/6100. A date-only query selects three orders: 3/4800.
The completed query selects IDs 102/104, amounts 2300/1700, count 2 and total 4000 cents.
The source hash is OK. These values can be reconciled directly with the five printed CSV rows.

Worked answer — use the actual DUCK_LAB path printed in Setup in place of LAB_PATH:
```sql
SELECT order_id, amount_cents FROM read_csv('LAB_PATH/orders.csv', header=true)
WHERE ordered_on=DATE '2026-09-14' AND status='paid' ORDER BY order_id;
SELECT count(*) AS orders, sum(amount_cents) AS total_cents
FROM read_csv('LAB_PATH/orders.csv', header=true)
WHERE ordered_on=DATE '2026-09-14' AND status='paid';
```

Cleanup:
```bash
duck_cleanup
```

## Systems lens

A file can be a query input without first becoming a stored database table. The report's
meaning comes from its row grain and selection boundary. Successful parsing and SQL execution
do not establish that the predicate answers the question. This small, well-formed fixture
does not establish that inference will choose suitable types for future exports.
