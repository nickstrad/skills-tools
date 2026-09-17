SELECT
  customer_id,
  name
FROM
  memory.main.customers
WHERE
  region = 'east'
ORDER BY
  customer_id;
