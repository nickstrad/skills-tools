CREATE OR REPLACE TABLE batch AS
SELECT
  *
FROM
  postgres_query(
    'app',
    $$
      SELECT
        *
      FROM
        sales.orders
    $$
  );

DESCRIBE batch;

SELECT
  *
FROM
  batch
ORDER BY
  order_id;

SELECT
  count(*) AS orders,
  sum(amount_cents) AS total_cents
FROM
  batch;
