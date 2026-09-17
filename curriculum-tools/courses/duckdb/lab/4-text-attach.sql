LOAD sqlite;

SET sqlite_all_varchar = true;

ATTACH 'LAB_PATH/source.sqlite' AS source (TYPE sqlite, READ_ONLY);

CREATE TABLE raw AS
SELECT
  invoice_id,
  amount_cents AS raw_amount
FROM
  source.main.invoices;
