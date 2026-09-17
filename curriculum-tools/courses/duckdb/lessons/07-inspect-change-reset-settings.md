# Inspect, change, and reset DuckDB settings

slug: inspect-change-reset-settings
category: Combining, retaining, and configuring data work
difficulty: beginner
tags: duckdb, connections
prerequisites: organize-sql-stages
safety: writes-data
run-in: shell
sessions: 1
min-version: 1.5.5
minutes: 12
revision: 1

## Overview

Unchanged SQL can return a different order when configuration changes. You will inspect a
tiny job table, move the unknown priority to the front by changing a default, then construct
a query that always leaves unknown priorities last. Finally reset the setting and reopen the
file to separate saved data from configuration in a running database instance.

The fixture has alpha/2, beta/NULL, gamma/1. NULL means the priority is unknown; it is not zero.
For an ascending report, the required order is **gamma, alpha, beta** under either null default.

```text
priorities in local.duckdb + ORDER BY priority + effective default --> row order
                         + ORDER BY priority NULLS LAST ----------> explicit null placement
quit --> saved rows survive; fresh CLI applies its startup settings
```

## Syntax breakdown

- **source .../session.sh 7** prepares the database and three rows in script mode. Manual
  creates the same table with native SQL. No previous lesson's database is used.
- **duck "$DUCK_LAB/local.duckdb"** opens a live prompt on that file. SQL ends in a semicolon;
  **.mode csv** and **.quit** are single-line CLI commands without semicolons.
- **PRAGMA database_list** reports database names and paths; **PRAGMA table_info('priorities')**
  reports column metadata. These pragmas inspect metadata rather than changing configuration.
- **duckdb_settings()** is a queryable function listing settings: inspect **name**, **value**,
  and **scope**. Scope describes where a setting applies inside a running instance, not whether
  it is written into a database file. **current_setting('default_null_order')** reads one value.
- **SET default_null_order='NULLS_FIRST'** changes implicit null placement. **NULLS_LAST** is
  the other setting value used here. In a query, append **NULLS FIRST** or **NULLS LAST**
  after the ordering expression and direction. For example **ORDER BY score DESC NULLS FIRST**
  puts missing scores first, then known scores high to low. Adapt the column, direction and
  placement for the required priority report; **ASC** sorts known numbers low to high.
- **RESET default_null_order** returns the setting to its default, not to an arbitrary previous
  SET value. A fresh wrapper process applies startup configuration again. Our wrapper ignores
  personal startup files and sets threads=2 and memory_limit=256MB; it does not set null ordering.
- **threads** and **memory_limit** are resource settings to inspect only here. More threads do
  not guarantee a speedup, and memory_limit does not cap all process memory. Leave both unchanged.

Spend 3–5 minutes at the prompt changing the default and adapting the marked report query so
the unknown priority stays last under both settings. The provided report starter inherits the
default. Run is a transcript: enter each group at its labelled Bash or DuckDB prompt. Setup's
inspection connection closes; all configuration experiments happen in your new interactive one.

## Setup
### Setup - script

Choose one. This creates and displays the three rows for you.

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 7
```

### Setup - manual

The helper supplies the folder. Create the same database table yourself. **-c** runs SQL and
exits; **-bail -csv** stops on error and prints CSV. The rows persist after this command.

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 7 manual
duck "$DUCK_LAB/local.duckdb" -bail -csv -c "
CREATE OR REPLACE TABLE priorities AS
SELECT
  *
FROM
  (
    VALUES
      ('alpha', 2),
      ('beta', NULL),
      ('gamma', 1)
  ) t (job, priority);

SELECT
  *
FROM
  priorities
ORDER BY
  job;"
```

## Run
```bash
# Bash
duck "$DUCK_LAB/local.duckdb"
-- DuckDB prompt
.mode csv
PRAGMA database_list;

PRAGMA table_info('priorities');

SELECT
  name,
  value,
  scope
FROM
  duckdb_settings()
WHERE
  name IN ('default_null_order', 'threads', 'memory_limit')
ORDER BY
  name;

SELECT
  current_setting('default_null_order') AS initial;

SELECT
  job,
  priority
FROM
  priorities
ORDER BY
  priority;

SET default_null_order = 'NULLS_FIRST';

SELECT
  current_setting('default_null_order') AS changed;

SELECT
  job,
  priority
FROM
  priorities
ORDER BY
  priority;

-- Adapt this report query, then type the same adapted query under NULLS_LAST below.
SELECT
  'report' AS kind,
  job,
  priority
FROM
  priorities
ORDER BY
  priority;

SET default_null_order = 'NULLS_LAST';

SELECT
  'report' AS kind,
  job,
  priority
FROM
  priorities
ORDER BY
  priority;

RESET default_null_order;

SELECT
  current_setting('default_null_order') AS reset_value;

-- Leave a different runtime value active so restart tests more than RESET.
SET default_null_order = 'NULLS_FIRST';

.quit
# Bash: reopen saved rows in a fresh process.
duck "$DUCK_LAB/local.duckdb"
-- DuckDB prompt
.mode csv
SELECT
  current_setting('default_null_order') AS fresh_value;

SELECT
  job,
  priority
FROM
  priorities
ORDER BY
  priority;

.quit
```

## Expected result

Metadata names the local file and job/priority columns. On the pinned runtime initial, reset
and fresh values are NULLS_LAST; changed is NULLS_FIRST. The wrapper reports threads=2 and
memory_limit about 244.1 MiB (256 decimal MB). The unqualified order changes from gamma/alpha/beta
to beta/gamma/alpha. Both completed report queries must produce gamma/alpha/beta. The untouched
starter's first report puts beta first; explicit NULLS FIRST would violate the requirement too.

Worked report query — enter this at both marked positions:
```sql
SELECT
  'report' AS kind,
  job,
  priority
FROM
  priorities
ORDER BY
  priority ASC NULLS LAST;
```

The table survives exit, but the final SET does not become a saved property of the file.
Run's fresh connection is a new process with the wrapper's startup settings. RESET alone would
not establish that distinction. After `.quit`, clean up in Bash:
```bash
duck_cleanup
```

## Systems lens

Inspect effective configuration when explaining behavior. Metadata pragmas, runtime defaults,
and explicit query clauses serve different purposes. This experiment checks a single sorting
setting on one pinned runtime; it is not a resource-tuning benchmark or a rule that every
setting has the same scope or reset behavior.
