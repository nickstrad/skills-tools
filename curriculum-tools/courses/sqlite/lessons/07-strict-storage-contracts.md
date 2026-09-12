# Make storage and domain contracts explicit

slug: strict-storage-contracts
category: lab-file
difficulty: intermediate
tags: strict-tables, constraints, data-quality
prerequisites: application-id-schema-versioning
safety: ddl
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 15
revision: 1

## Overview
Compare an ordinary INTEGER column with a STRICT table, then add a domain range check. If you carry PostgreSQL's usual declared-type intuition directly into ordinary SQLite tables, invalid data may be stored rather than rejected. Observe the actual storage class and the distinct rejection boundaries.

## Syntax breakdown
### In plain terms

Ordinary SQLite tables use flexible type affinity: an INTEGER declaration may still store text when conversion is impossible. STRICT tables reject values that cannot be losslessly converted, while CHECK adds a domain rule such as a permitted range. The experiment records typeof and separately observes each expected constraint error.

### What you are learning

- **Affinity versus STRICT typing** separates a storage preference from a lossless type contract.
- **Lossless coercion** lets 42.0 fit an INTEGER STRICT column when no information is lost.
- **CHECK constraints** enforce a domain predicate that type declarations cannot express.

### Piece by piece

- **CREATE TABLE flexible(value INTEGER)** (ordinary table): gives INTEGER affinity but does not reject impossible conversion; typeof proves text was stored.
- **STRICT** (table option): rejects nonnumeric text while accepting losslessly coercible 42.0.
- **typeof(value)** (SQLite scalar function): reports the stored class, such as integer, real, or text.
- **CHECK(value BETWEEN 0 AND 100)** (constraint expression): rejects a correctly typed value outside the permitted range.
- **.bail off** (CLI dot command): continues after expected errors so later probes and counts run.
- **count(*)** (aggregate): final flexible_rows, strict_rows, and bounded_rows show exactly which inserts survived.

## Caution
Constraint wording can vary by build. Classify each error by the violated rule and verify final counts; a later success is not evidence that a rejected row was stored.

## Setup
```sql
.bail off
DROP TABLE IF EXISTS flexible;
DROP TABLE IF EXISTS strict_numbers;
DROP TABLE IF EXISTS bounded;
CREATE TABLE flexible(value INTEGER);
CREATE TABLE strict_numbers(value INTEGER) STRICT;
CREATE TABLE bounded(value INTEGER CHECK (value BETWEEN 0 AND 100)) STRICT;
```

## Run
```sql
.headers on
.mode box
INSERT INTO flexible VALUES ('not-an-integer');
SELECT 'flexible text accepted' AS case_name, value, typeof(value) AS stored_type FROM flexible;
INSERT INTO strict_numbers VALUES ('not-an-integer');
INSERT INTO strict_numbers VALUES (42.0);
SELECT 'strict lossless number accepted' AS case_name, value, typeof(value) AS stored_type FROM strict_numbers;
INSERT INTO bounded VALUES (-1);
INSERT INTO bounded VALUES (50);
SELECT 'domain-valid row' AS case_name, value, typeof(value) AS stored_type FROM bounded;
SELECT (SELECT count(*) FROM flexible) AS flexible_rows, (SELECT count(*) FROM strict_numbers) AS strict_rows, (SELECT count(*) FROM bounded) AS bounded_rows;
```

## Expected result
The flexible insert succeeds and typeof(value) is text. The first strict insert reports a datatype constraint error, while 42.0 succeeds with typeof(value) = integer. The bounded insert of -1 reports a CHECK constraint error; 50 succeeds. Final counts are flexible_rows = 1, strict_rows = 1, and bounded_rows = 1.

## Systems lens
Validation is a placement decision. Ordinary SQLite affinity is more permissive than PostgreSQL's declared column types; STRICT brings a lossless storage-type contract, while CHECK and NOT NULL still express separate domain rules. These local constraints reduce bad state but do not validate a distributed history or external input protocol.

## Optional variation
Try inserting 42.5 into strict_numbers and 101 into bounded, then repeat the supplied typeof and
count queries. STRICT rejects 42.5 because it cannot become an integer losslessly; the CHECK
rejects 101 because it is outside the domain range. Neither rejected row changes the final counts.
