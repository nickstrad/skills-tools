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
- Setup prints the small raw CSV so you can independently check which rows belong.
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

The setup helper creates **query.sql** with this starter. Open **"$DUCK_LAB/query.sql"**
in your editor after Setup; the helper prints its full path. Your edits are the lesson task.

```sql
SELECT order_id, amount_cents FROM read_csv('LAB_PATH/orders.csv', header=true)
WHERE status='paid' ORDER BY order_id;
SELECT count(*) AS orders, sum(amount_cents) AS total_cents
FROM read_csv('LAB_PATH/orders.csv', header=true) WHERE status='paid';
```

**duck_run** runs that file with the supplied attachment and staging SQL in one DuckDB
connection, stops on SQL errors, and prints CSV results. Each run uses a fresh in-memory database.
The helper fills in **LAB_PATH** with your actual fixture directory.

Spend 3–4 minutes adapting both WHERE clauses in query.sql before Run. Select only paid
orders in the requested day. Inspect the resulting IDs and reconcile their integer-cent sum
with the raw file. Hint: a date filter alone still includes a pending order.

## Setup
```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 5
```

## Run
```bash
duck_run
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
