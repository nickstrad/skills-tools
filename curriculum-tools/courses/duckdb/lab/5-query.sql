SELECT
  order_id,
  amount_cents
FROM
  read_csv('LAB_PATH/orders.csv', header = true)
WHERE
  status = 'paid'
ORDER BY
  order_id;

SELECT
  count(*) AS orders,
  sum(amount_cents) AS total_cents
FROM
  read_csv('LAB_PATH/orders.csv', header = true)
WHERE
  status = 'paid';
