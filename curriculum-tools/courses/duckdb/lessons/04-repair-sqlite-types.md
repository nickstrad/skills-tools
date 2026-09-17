# Fix a SQLite import that fails on types

slug: repair-sqlite-types
category: Combining scattered data
difficulty: beginner
tags: duckdb, data-flows
prerequisites: attach-sqlite-file
safety: writes-data
run-in: shell
sessions: 1
min-version: 1.5.5
minutes: 12
revision: 2

## Overview

A column declared INTEGER in ordinary SQLite can still contain text. DuckDB's SQLite scanner
normally maps the declared column to a DuckDB type, so one incompatible stored value can stop
a scan before your outer query can convert it.

The supplied invoices file contains five rows, one per invoice_id: 1200, 2300, the text oops,
a missing value, and -50 cents. You will preserve a raw stage and complete a conversion rule.
For this report, an accepted amount must convert to an integer and be nonnegative; rejected
records must remain inspectable with their original values.

```text
SQLite INTEGER column: [1200, 2300, 'oops', NULL, -50]
               |
               +--> normal integer scan --> type mismatch
               |
               +--> scan as text --> raw stage --> explicit conversion
                                                    |--> accepted
                                                    \--> rejected + raw evidence
```

The task is a data policy, not “make the error disappear.” Silently dropping bad rows loses
the ability to reconcile the report with its input.

## Syntax breakdown

- In Bash, **source .../session.sh 4** supplies a fresh file, **DUCK_LAB**, **DUCK_COURSE**,
  your starter and the helpers; it needs the installed CLI but no earlier fixture. Add **manual**
  to perform the native source inspection and DuckDB setup yourself, using the supplied lab paths.
  **duck_check_source** checks the source fingerprint
  saved by the helper. **duck** forwards arguments to the pinned CLI with course settings;
  **:memory:** selects a temporary database, **-bail** stops on SQL errors, and **-csv** prints CSV.
- **cat "$DUCK_LAB/session.sql" "$DUCK_LAB/query.sql" | duck :memory: -bail -csv**
  sends the connection/raw-stage SQL followed by your edited query to one DuckDB process.
  Each invocation starts fresh, so the raw stage and your query must execute together.
- **sqlite3 typeof(amount_cents)** reports each stored SQLite value's type, independently of
  its column declaration. Numeric text '2300' was stored as integer by SQLite's column affinity;
  oops remained text. NULL means missing, not zero.
- Setup first tries **SELECT * FROM source.main.invoices** with the normal scanner and prints
  its deliberate type error. Script setup handles that expected failure; manual setup lets you
  run the failing command, inspect its error and continue with the corrected connection.
- Script setup prints **text-attach.sql**, the supplied connection and raw-stage SQL that
  is also copied into **session.sql**. The CLI executes it before your query.
  Inspect the ordering of these statements:

  ```sql
  LOAD sqlite;

  SET sqlite_all_varchar = true;

  ATTACH 'LAB_PATH/source.sqlite' AS source (TYPE sqlite, READ_ONLY);

  CREATE TABLE raw AS
  SELECT
    invoice_id,
    amount_cents AS raw_amount
  FROM
    source.main.invoices;
  ```

  The helper fills in the actual file path.
- **SET sqlite_all_varchar=true** must be applied after LOAD sqlite and before attachment.
  It makes the scanner expose all columns as text, including invoice_id. It preserves these
  fixture values as text; it is not a byte-preserving archive of arbitrary SQLite values.
- **CREATE TABLE raw AS ...** materializes all source rows in temporary DuckDB storage.
  **TRY_CAST(value AS BIGINT)** returns an integer or NULL on failed conversion.
  Example: TRY_CAST('42' AS BIGINT) is 42; TRY_CAST('bad' AS BIGINT) is NULL.
- **CASE WHEN ... THEN ... ELSE ... END** assigns an accepted/rejected label.
  **IS NOT NULL** checks conversion success; add the nonnegative boundary.
  **GROUP BY disposition** lets you account for both groups. SUM ignores NULLs,
  so only the accepted sum is the report's usable total.

The setup helper creates **query.sql** with this starter already in it; the file is not empty.
Open **"$DUCK_LAB/query.sql"** in your editor after Setup; the helper prints its full path.
Edit the existing SQL, save it, then execute the CLI command in Run.

```sql
CREATE TABLE staged AS
SELECT
  *,
  CAST(NULL AS BIGINT) AS amount_cents
FROM
  raw;

CREATE VIEW classified AS
SELECT
  *,
  CASE
    WHEN amount_cents IS NOT NULL THEN 'accepted'
    ELSE 'rejected'
  END AS disposition
FROM
  staged;

SELECT
  *
FROM
  classified
ORDER BY
  invoice_id;

SELECT
  disposition,
  count(*) AS records,
  sum(amount_cents) AS total_cents
FROM
  classified
GROUP BY
  disposition
ORDER BY
  disposition;

SELECT
  (
    SELECT
      count(*)
    FROM
      raw
  ) AS source_rows,
  (
    SELECT
      count(*)
    FROM
      classified
  ) AS classified_rows;
```

The Run command reads your saved edits each time. The temporary tables disappear when the
CLI exits; rerunning both files recreates them from the source with your revised rule.

Spend 3–5 minutes completing query.sql before Run: replace the dummy NULL conversion with
TRY_CAST(raw_amount AS BIGINT), then strengthen the acceptance condition to reject negative
amounts as well as missing/invalid ones. Keep raw and every staged row; do not add a WHERE
that discards rejects. The ID and original text must remain visible beside the disposition.

## Setup
### Setup - script

Choose one setup option. This prepares the file, shows its stored types, runs the deliberate
scan failure and previews the corrected raw stage for you. Both options supply query.sql to edit.

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 4
```

### Setup - manual

The helper prepares folders, the source file, variables, fingerprints and starter files.
First inspect SQLite's stored types, then run the normal DuckDB scan yourself. **-c** executes
the quoted SQL and exits. The DuckDB command below is expected to fail with **Mismatch Type Error**
for oops; run these steps in your interactive Bash terminal, then continue to the next block.

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 4 manual
sqlite3 -readonly -header -csv "$DUCK_LAB/source.sqlite" "
SELECT
  invoice_id,
  amount_cents,
  typeof(amount_cents) AS stored_type
FROM
  invoices
ORDER BY
  invoice_id;"
duck :memory: -bail -csv -c "
LOAD sqlite;

ATTACH '$DUCK_LAB/source.sqlite' AS source (TYPE sqlite, READ_ONLY);

SELECT
  *
FROM
  source.main.invoices;"
```

Now open a fresh connection with the text-scanner setting, create the raw stage yourself,
and inspect it. Apply the setting before ATTACH. Expect all five IDs and raw values to survive.

```bash
duck :memory: -bail -csv -c "
LOAD sqlite;

SET sqlite_all_varchar = true;

ATTACH '$DUCK_LAB/source.sqlite' AS source (TYPE sqlite, READ_ONLY);

CREATE TABLE raw AS
SELECT
  invoice_id,
  amount_cents AS raw_amount
FROM
  source.main.invoices;

SELECT
  *
FROM
  raw
ORDER BY
  invoice_id;"
```

The temporary raw stage disappears when this CLI exits. Run repeats these preparation statements
from session.sql in a new connection before executing the conversion rule you edit in query.sql.

## Run
```bash
cat "$DUCK_LAB/session.sql" "$DUCK_LAB/query.sql" |
  duck :memory: -bail -csv
duck_check_source
```

## Expected result

The native types are integer, integer, text, null, integer. The normal DuckDB scan reports
“Mismatch Type Error” for oops. An outer TRY_CAST alone cannot fix this earlier scanner failure.

The untouched starter rejects all five rows. Conversion without the sign check accepts
three rows including -50, totaling 3450. Your completed rule accepts IDs 1/2, count 2,
sum 3500 cents. IDs 3/4/5 remain rejected, retaining oops/NULL/-50 as raw evidence.
The rejected sum happens to be -50 because SUM skips NULLs; it is not an accepted monetary total.
source_rows and classified_rows both equal 5, and the source hash is OK.

Worked answer — replace query.sql with:
```sql
CREATE TABLE staged AS
SELECT
  *,
  TRY_CAST(raw_amount AS BIGINT) AS amount_cents
FROM
  raw;

CREATE VIEW classified AS
SELECT
  *,
  CASE
    WHEN amount_cents IS NOT NULL
    AND amount_cents >= 0 THEN 'accepted'
    ELSE 'rejected'
  END AS disposition
FROM
  staged;

SELECT
  *
FROM
  classified
ORDER BY
  invoice_id;

SELECT
  disposition,
  count(*) AS records,
  sum(amount_cents) AS total_cents
FROM
  classified
GROUP BY
  disposition
ORDER BY
  disposition;

SELECT
  (
    SELECT
      count(*)
    FROM
      raw
  ) AS source_rows,
  (
    SELECT
      count(*)
    FROM
      classified
  ) AS classified_rows;
```

Cleanup:
```bash
duck_cleanup
```

## Systems lens

Separate reading a source value from deciding whether it is usable. The text stage gets past
the scanner boundary; explicit conversion and a domain rule decide report membership.
Every source row belongs to exactly one group. This is a rule for this integer-cent fixture,
not a complete monetary-text validator: other inputs, such as fractional text that a cast can
round, would need a stricter parsing contract.
