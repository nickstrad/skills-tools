# Make messy input types explicit

slug: clean-input-types
category: Combining, retaining, and configuring data work
difficulty: beginner
tags: duckdb, data-flows
prerequisites: inspect-change-reset-settings
safety: writes-data
run-in: shell
sessions: 1
min-version: 1.5.5
minutes: 10
revision: 1

## Overview

An identifier can look numeric without representing a quantity. This CSV contains account
codes with leading zeros and amounts in decimal currency units. This reader already infers
the codes as text; converting them to integers would lose the zeros. One malformed amount,
a negative amount, and a missing amount need explicit handling before you publish a total.

There is one row per account_id: 001/12.50, 010/7.25, 011/oops, 012/-1.00, 013/missing.
Keep account_id as text, convert amounts to **DECIMAL(10,2)**, and accept only nonmissing,
successfully converted, nonnegative amounts. Retain every rejected row and its raw value.

```text
CSV -- all_varchar --> raw text -- TRY_CAST --> decimal or NULL
                          |                       |
                          +-- preserve raw -------+-- acceptance rule
                                                   |             |
                                                accepted      rejected
                                                   +-- all 5 ----+
```

## Syntax breakdown

- **source .../session.sh 8** prepares the fixture, fingerprint and populated **query.sql**.
  Open that printed file in your editor, make the changes below, and save before Run.
- **read_csv(..., header=true)** normally infers types. **all_varchar=true** reads all columns
  as VARCHAR so identifiers keep leading zeros. An empty CSV field still becomes NULL here.
- **DESCRIBE SELECT ...** inspects reader types; **DESCRIBE typed** inspects the transformed
  table. Inference on this fixture yields VARCHAR for both columns. Preserve that identifier
  representation while choosing a numeric type for amounts.
- **TRY_CAST(amount AS DECIMAL(10,2))** converts a value to a fixed-scale number: ten total
  digits, two after the decimal point. Failed conversions yield NULL without dropping the row.
  For example **TRY_CAST('4.25' AS DECIMAL(10,2))** gives 4.25. BIGINT is unsuitable for cents
  expressed after a decimal point; it can round numeric input instead of preserving fractions.
- **IS NOT NULL** detects a nonmissing converted value. Combine that test with the appropriate
  numeric comparison using **AND**. A successful cast alone would also accept -1.00.
  Decimal casts can round extra fractional
  digits; this supplied fixture has at most two, so this is not a general money-text validator.
- **CREATE OR REPLACE TEMP TABLE** stores intermediate rows only in this CLI process.
  **TEMP VIEW** keeps a classification query over them. **raw_amount** retains the source text.
  **GROUP BY accepted** reconciles the two populations, and **sum(amount)** ignores NULLs.
- **duckdb :memory: -bail -csv < "$DUCK_LAB/query.sql"** executes saved edits in a fresh process,
  stops on SQL errors, prints CSV and discards temporary tables on exit. **duck_check_source**
  verifies the input file stayed unchanged; **duck_cleanup** removes only your owned fixture.

Spend 3–4 minutes editing the two marked expressions in query.sql: replace the BIGINT conversion
and the always-false acceptance rule. The supplied reader explicitly preserves identifiers. Inspect
the raw file and DESCRIBE evidence to distinguish which field needs numeric conversion.
The file contains this starter:

```sql
CREATE OR REPLACE TEMP TABLE typed AS
SELECT
  account_id,
  amount AS raw_amount,
  TRY_CAST(amount AS BIGINT) AS amount
FROM
  read_csv('LAB_PATH/messy.csv', header = true, all_varchar = true);

CREATE OR REPLACE TEMP VIEW classified AS
SELECT
  *,
  false AS accepted
FROM
  typed;

DESCRIBE typed;

SELECT
  *
FROM
  classified
ORDER BY
  account_id;

SELECT
  accepted,
  count(*) AS rows,
  sum(amount) AS total
FROM
  classified
GROUP BY
  accepted
ORDER BY
  accepted;
```

## Setup
### Setup - script

Choose one option. This prints the raw CSV and inferred types. Both supply the same starter;
neither fills in its conversion or acceptance rule.

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 8
```

### Setup - manual

Inspect the raw file and inference yourself. **-c** runs the SQL and closes this connection;
Run starts a new connection with your saved conversion query.

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 8 manual
cat "$DUCK_LAB/messy.csv"
duckdb :memory: -bail -csv -c "DESCRIBE SELECT * FROM read_csv('$DUCK_LAB/messy.csv', header=true);"
```

## Run
```bash
duckdb :memory: -bail -csv < "$DUCK_LAB/query.sql"
duck_check_source
```

## Expected result

The completed typed table has VARCHAR account_id/raw_amount and DECIMAL(10,2) amount. Codes
001 and 010 remain intact; their accepted amounts total 19.75. Rejected IDs 011, 012, 013 retain
raw oops, -1.00 and NULL. Two accepted plus three rejected account for all five input rows.
The rejected numeric subtotal is -1.00 because sum ignores the failed/missing conversions;
it is not a published revenue amount. The source hash is OK.

The untouched starter marks all five rejected and rounds 12.50 to 13 and 7.25 to 7. Accepting
all successfully cast values incorrectly admits account 012, producing three accepted/18.75.
Casting account_id to BIGINT would lose the leading zeros even if the amount total were correct.
Removing all_varchar happens to preserve them on this fixture; it would leave that choice to inference.

Worked answer — the helper has already replaced LAB_PATH in your editable file:
```sql
CREATE OR REPLACE TEMP TABLE typed AS
SELECT
  account_id,
  amount AS raw_amount,
  TRY_CAST(amount AS DECIMAL(10, 2)) AS amount
FROM
  read_csv('LAB_PATH/messy.csv', header = true, all_varchar = true);

CREATE OR REPLACE TEMP VIEW classified AS
SELECT
  *,
  amount IS NOT NULL
  AND amount >= 0 AS accepted
FROM
  typed;

DESCRIBE typed;

SELECT
  *
FROM
  classified
ORDER BY
  account_id;

SELECT
  accepted,
  count(*) AS rows,
  sum(amount) AS total
FROM
  classified
GROUP BY
  accepted
ORDER BY
  accepted;
```

Rerunning reads the same file and rebuilds only temporary state. Cleanup in Bash:
```bash
duck_cleanup
```

## Systems lens

Parsing, conversion, and acceptance are separate decisions. Inference guesses representation;
your contract supplies meaning. Keeping the original text and accounting for rejected rows
makes a transformation auditable without silently treating failed amounts as zero.
