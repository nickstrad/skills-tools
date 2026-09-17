# Combine batches as schemas change

slug: combine-file-batches
category: Combining, retaining, and configuring data work
difficulty: beginner
tags: duckdb, data-flows
prerequisites: flatten-json-records
safety: writes-data
run-in: shell
sessions: 1
min-version: 1.5.5
minutes: 10
revision: 1

## Overview

A new export adds a region column; the old export never recorded it. You will read both
versions into one relation, keep the source filename, and label missing regions for display
without inventing a location. Combining schemas makes the data queryable; you still choose
what an absent field means.

Each file has one row per event_id. Version 1 contains e1/40ms and e2/60ms with no region.
Version 2 contains e3/25ms/west and e4/75ms/east. Read exactly these four events, preserve the
original nullable region, and add a **region_label** with 'unknown' for missing values.

```text
batch-v1.csv: event_id duration_ms ------\
                                         union by name --> 4 rows + filename
batch-v2.csv: event_id duration_ms region /               --> NULL for old region
                                                             |
                                                     display 'unknown'
                                                     retain original NULL
```

## Syntax breakdown

- **source .../session.sh 10** supplies two CSVs, fingerprints and an editable **query.sql**.
  Open the printed file, edit the reader and display expression, and save before Run.
- **read_csv('.../batch-v*.csv', header=true, union_by_name=true, filename=true)** reads
  matching files, aligns columns by header name, fills an absent column with NULL, and exposes
  a **filename** column identifying each source. The glob belongs to the SQL reader; Bash
  does not expand it inside the SQL file. This owned folder contains exactly two matching files.
- Without **union_by_name**, this reader uses the first file's schema: it returns all four
  events but omits region. A later SELECT of region then fails because that column is absent.
  The option does not resolve every possible type or meaning conflict between versions;
  both versions here agree on event_id and duration_ms types and meaning.
- **DESCRIBE SELECT ...** lets you inspect each version's schema first. **CREATE OR REPLACE
  TEMP TABLE** captures the combined rows only for this query process.
- **coalesce(value, fallback)** selects the first non-NULL value. For example,
  **coalesce(NULL, 'unreported')** returns unreported. Construct the requested display label
  from region and your fallback. Keep the original region in
  the earlier output so the display label cannot erase the distinction between known and absent.
- **count(*)** counts all rows; **count(region)** counts non-NULL regions. Their difference
  counts missing regions. **sum(duration_ms)** reconciles the four source durations.
- **duck :memory: -bail -csv < "$DUCK_LAB/query.sql"** executes saved edits in a fresh
  connection and prints CSV. **duck_check_source** checks both input files, and **duck_cleanup**
  removes the owned lab. Absolute filenames will differ between attempts.

Spend 3–4 minutes adapting the reader from one version to both using name alignment, then
replace the display expression. Do not claim the older rows came from west or east. Inspect
filename on each row as well as count, missing-value count, and total. The starter is:

```sql
CREATE OR REPLACE TEMP TABLE combined AS
SELECT
  *
FROM
  read_csv('LAB_PATH/batch-v2.csv', header = true, filename = true);

SELECT
  event_id,
  duration_ms,
  region,
  filename
FROM
  combined
ORDER BY
  event_id;

SELECT
  event_id,
  region AS region_label
FROM
  combined
ORDER BY
  event_id;

SELECT
  count(*) AS rows,
  count(*) - count(region) AS missing_region,
  sum(duration_ms) AS total_ms
FROM
  combined;
```

## Setup
### Setup - script

Choose one. This prints both CSVs and their schemas; both options supply the same unfinished
query file. Version 1 has two columns; version 2 adds VARCHAR region.

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 10
```

### Setup - manual

Inspect the files and schemas yourself. **-c** executes SQL and closes the inspection
connection. Run starts another connection and rereads both files with your chosen options.

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 10 manual
cat "$DUCK_LAB/batch-v1.csv" "$DUCK_LAB/batch-v2.csv"
duck :memory: -bail -csv -c "
DESCRIBE SELECT * FROM read_csv('$DUCK_LAB/batch-v1.csv');
DESCRIBE SELECT * FROM read_csv('$DUCK_LAB/batch-v2.csv');"
```

## Run
```bash
duck :memory: -bail -csv < "$DUCK_LAB/query.sql"
duck_check_source
```

## Expected result

The completed query returns four rows, two missing regions, and 200ms total. e1/e2 carry a
filename ending batch-v1.csv and region NULL, displayed as unknown. e3/e4 come from batch-v2.csv
and keep west/east. Both file hashes are OK. The untouched starter reads only e3/e4:
two rows, no missing regions, 100ms. Reading both files without name alignment omits region
on this pinned reader; the report then raises a column-not-found error. Replacing NULL with 'west' would invent data
even if all row counts and sums still matched.

Worked answer:
```sql
CREATE OR REPLACE TEMP TABLE combined AS
SELECT
  *
FROM
  read_csv('LAB_PATH/batch-v*.csv', header = true, union_by_name = true, filename = true);

SELECT
  event_id,
  duration_ms,
  region,
  filename
FROM
  combined
ORDER BY
  event_id;

SELECT
  event_id,
  coalesce(region, 'unknown') AS region_label
FROM
  combined
ORDER BY
  event_id;

SELECT
  count(*) AS rows,
  count(*) - count(region) AS missing_region,
  sum(duration_ms) AS total_ms
FROM
  combined;
```

Keep the actual lab path in query.sql. Reruns read the same two files and recreate temporary
state. Cleanup:
```bash
duck_cleanup
```

## Systems lens

Schema alignment and missing-value policy answer different questions. A reader can align
columns without knowing whether an absent region means unknown, not applicable, or a faulty
export. Keeping the original NULL and source filename preserves evidence for that decision.
This lesson does not deduplicate overlapping files or establish cross-file key uniqueness.
