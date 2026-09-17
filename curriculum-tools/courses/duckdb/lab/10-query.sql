-- Extend this reader to both versions, matching columns by name.
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

-- Add a display label for a missing region while retaining the original column.
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
