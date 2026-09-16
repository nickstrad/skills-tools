-- Keep account identifiers as text. Edit the conversion and acceptance rule.
CREATE OR REPLACE TEMP TABLE typed AS
SELECT account_id, amount AS raw_amount,
       TRY_CAST(amount AS BIGINT) AS amount
FROM read_csv('LAB_PATH/messy.csv', header=true, all_varchar=true);
CREATE OR REPLACE TEMP VIEW classified AS
SELECT *, false AS accepted FROM typed;
DESCRIBE typed;
SELECT * FROM classified ORDER BY account_id;
SELECT accepted, count(*) AS rows, sum(amount) AS total
FROM classified GROUP BY accepted ORDER BY accepted;
