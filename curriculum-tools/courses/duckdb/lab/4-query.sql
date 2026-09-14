CREATE TABLE staged AS
SELECT *, CAST(NULL AS BIGINT) AS amount_cents FROM raw;
CREATE VIEW classified AS SELECT *,
  CASE WHEN amount_cents IS NOT NULL
       THEN 'accepted' ELSE 'rejected' END AS disposition
FROM staged;
SELECT * FROM classified ORDER BY invoice_id;
SELECT disposition, count(*) AS records, sum(amount_cents) AS total_cents
FROM classified GROUP BY disposition ORDER BY disposition;
SELECT (SELECT count(*) FROM raw) AS source_rows,
       (SELECT count(*) FROM classified) AS classified_rows;
