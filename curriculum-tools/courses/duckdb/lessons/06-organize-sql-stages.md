# Build and reopen a persistent database in the CLI

slug: organize-sql-stages
category: Combining, retaining, and configuring data work
difficulty: beginner
tags: duckdb, data-flows
prerequisites: query-a-file
safety: writes-data
run-in: shell
sessions: 1
min-version: 1.5.5
minutes: 12
revision: 1

## Overview

A named DuckDB database keeps tables and view definitions after the CLI closes. A view stores
a query and reads the current base rows each time; a table created from a query stores the
rows produced at that moment. You will keep one day of orders, correct an amount, and reopen
the database to see which report follows the correction.

The supplied CSV has five orders across September 13–15, one row per order_id. Your base table
must contain **all three September 14 orders**, including the pending one. Two reports then
select paid orders. A current dashboard should reflect corrections; a saved extract should
retain the earlier result. Choose which of the two objects meets each requirement.

```text
orders.csv -- your day predicate --> local.duckdb: orders (3 rows)
                                             |                 |
                                        paid_live VIEW    paid_saved TABLE
                                        query runs now    rows copied once
update order 102 ----------------------------> changes          unchanged
close CLI --> reopen same file --> both objects still exist
```

## Syntax breakdown

- **source .../session.sh 6** supplies the CSV, lab path and cleanup. The script option
  inspects CSV types; manual lets you do that yourself. Neither creates your base table.
- **duck "$DUCK_LAB/local.duckdb"** opens a file, creating it if absent. Bash expands the
  variable in this command. At the **D** prompt, SQL does **not** expand shell variables:
  replace **LAB_PATH** below with the absolute directory printed by setup.
- SQL ends in **;** and can span lines. Dot commands such as **.tables**, **.help tables**,
  **.mode csv**, and **.quit** occupy their own line, with **no semicolon**. `.tables` lists
  tables and views; **DESCRIBE orders** prints column names/types. `.mode csv` changes display.
- **CREATE OR REPLACE TABLE ... AS SELECT ...** stores a query result. Repeating it replaces
  that table's rows. Add **WHERE ordered_on=DATE '2026-09-14'** when selecting this day's rows;
  for comparison, **WHERE ordered_on < DATE '2026-09-14'** would select earlier days.
- **CREATE OR REPLACE VIEW ... AS SELECT ...** stores the SELECT definition. The paid
  predicate is supplied so you can focus on persistence and freshness.
- **UPDATE ... WHERE order_id=102** changes exactly one stored row. In this experiment each
  statement commits automatically; there is no open explicit transaction to leave unfinished.
- An unnamed/default in-memory database disappears at exit. **.open** switches databases by
  closing the current connection; it does not copy an in-memory database into the named file.
  Open the intended filename from the start. You do not need `.open` for this experiment.

Spend 3–5 minutes at the live prompt adapting the base-table SELECT, inspecting the two report
results and choosing the object for the current dashboard. Run is a **terminal transcript**:
enter Bash lines in Bash and SQL/dot commands at D, one group at a time. Change the initial
CREATE TABLE statement before executing it; the unfiltered starter intentionally stores too
many orders. No query.sql edit or `.read` is needed. Use `.quit` before reopening or cleanup.

## Setup
### Setup - script

Choose one option. Both provide the same CSV and an unused local.duckdb path.

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 6
```

### Setup - manual

Inspect the reader yourself in a temporary connection. Expect BIGINT, DATE, VARCHAR, BIGINT.
**-c** executes this SQL and exits; **-bail -csv** stops on errors and prints CSV.

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 6 manual
duck :memory: -bail -csv -c "DESCRIBE SELECT * FROM read_csv('$DUCK_LAB/orders.csv', header=true);"
```

## Run
```bash
# Bash: open the persistent file.
duck "$DUCK_LAB/local.duckdb"
-- DuckDB prompt: substitute LAB_PATH and add your day predicate to this starter.
.help tables
.mode csv
CREATE OR REPLACE TABLE orders AS
SELECT * FROM read_csv('LAB_PATH/orders.csv', header=true);
.tables
DESCRIBE orders;
SELECT order_id, status, amount_cents FROM orders ORDER BY order_id;
CREATE OR REPLACE VIEW paid_live AS
SELECT order_id, amount_cents FROM orders WHERE status='paid';
CREATE OR REPLACE TABLE paid_saved AS SELECT * FROM paid_live;
SELECT 'before' AS phase, sum(amount_cents) AS total_cents FROM paid_live;
UPDATE orders SET amount_cents=2500 WHERE order_id=102;
SELECT 'live' AS report, sum(amount_cents) AS total_cents FROM paid_live
UNION ALL SELECT 'saved', sum(amount_cents) FROM paid_saved;
.quit
# Bash: launch a fresh process against the same file.
duck "$DUCK_LAB/local.duckdb"
-- DuckDB prompt: inspect what survived.
.mode csv
.tables
SELECT order_id, amount_cents FROM paid_live ORDER BY order_id;
SELECT order_id, amount_cents FROM paid_saved ORDER BY order_id;
.quit
# Bash: the original CSV should be unchanged.
duck_check_source
```

## Expected result

The base table has IDs 102, 103, 104 with cents 2300, 800, 1700. The first paid total is 4000;
after correction, live is 4200 and saved is 4000. After reopening, paid_live contains
102/2500 and 104/1700; paid_saved still contains 102/2300 and 104/1700. The source hash is OK.
Use the view for the current dashboard and the table for this earlier extract. With the
unfiltered starter, the initial total is 6100 and the live total becomes 6300: persistence
works, but the stored population is wrong. Keeping only paid rows also violates the requested
base-table boundary even though the report total looks correct.

Worked correction to the first statement — use the printed absolute path:
```sql
CREATE OR REPLACE TABLE orders AS
SELECT * FROM read_csv('LAB_PATH/orders.csv', header=true)
WHERE ordered_on=DATE '2026-09-14';
```

To repeat, enter the corrected CREATE TABLE and the remaining first-session commands again;
rebuilding paid_saved deliberately takes a new copy before the correction. Opening the file
alone never refreshes that table. Cleanup after leaving DuckDB removes this disposable file:
```bash
duck_cleanup
```

## Systems lens

Persistence answers whether an object survives closing the connection. Freshness answers
which underlying data it reflects. A saved view definition and a saved result table both
persist, with different freshness behavior. This view depends only on the internal orders
table; changing the CSV would require an explicit reload of that table first.
