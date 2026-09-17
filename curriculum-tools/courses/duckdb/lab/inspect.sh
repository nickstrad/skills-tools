#!/usr/bin/env bash
# Print each lesson's initial source evidence without learner-side shell plumbing.
set -euo pipefail
course=$(cd -- "$(dirname -- "$0")/.." && pwd)
lesson=${1:?lesson number}
lab=${2:?owned lab directory}
case $lesson in
  1)
    cat "$lab/attach.sql"
    { cat "$lab/attach.sql"; cat <<'SQL'
SELECT
  table_catalog,
  table_schema,
  table_name
FROM
  information_schema.tables
WHERE
  table_catalog = 'app'
  AND table_schema IN ('public', 'sales')
ORDER BY
  table_schema,
  table_name;
SQL
    } | duckdb :memory: -bail -csv
    ;;
  2)
    { cat "$lab/attach.sql"; echo 'SELECT count(*) AS source_orders FROM app.sales.orders;'; } |
      duckdb :memory: -bail -csv
    ;;
  3)
    { cat "$lab/session.sql"; cat <<'SQL'
SELECT
  table_catalog,
  table_schema,
  table_name
FROM
  information_schema.tables
WHERE
  table_name = 'customers'
ORDER BY
  table_catalog;
SQL
    } | duckdb :memory: -bail -csv
    ;;
  4)
    sqlite3 -readonly -header -csv "$lab/source.sqlite" "
SELECT
  invoice_id,
  amount_cents,
  typeof(amount_cents) AS stored_type
FROM
  invoices
ORDER BY
  invoice_id;"
    if { cat "$lab/attach.sql"; echo 'SELECT * FROM source.main.invoices;'; } | duckdb :memory: -bail -csv > "$lab/scan.txt" 2>&1; then
      cat "$lab/scan.txt"
      echo 'Unexpected successful scan: inspect the fixture before continuing.' >&2
      exit 1
    fi
    cat "$lab/scan.txt"
    # Only the intended scanner failure counts as this lesson's initial evidence.
    [[ $(< "$lab/scan.txt") == *'Mismatch Type Error'* ]]
    cat "$lab/text-attach.sql"
    { cat "$lab/text-attach.sql"; echo 'SELECT * FROM raw ORDER BY invoice_id;'; } |
      duckdb :memory: -bail -csv
    ;;
  5)
    cat "$lab/orders.csv"
    duckdb :memory: -bail -csv -c "DESCRIBE SELECT * FROM read_csv('$lab/orders.csv', header=true);"
    ;;
  6)
    duckdb :memory: -bail -csv -c "DESCRIBE SELECT * FROM read_csv('$lab/orders.csv', header=true);"
    ;;
  7)
    duckdb "$lab/local.duckdb" -bail -csv < "$lab/setup.sql"
    ;;
  8)
    cat "$lab/messy.csv"
    duckdb :memory: -bail -csv -c "DESCRIBE SELECT * FROM read_csv('$lab/messy.csv', header=true);"
    ;;
  9)
    cat "$lab/runs.jsonl"
    duckdb :memory: -bail -csv -c "DESCRIBE SELECT * FROM read_json('$lab/runs.jsonl', format='newline_delimited');"
    ;;
  10)
    cat "$lab/batch-v1.csv" "$lab/batch-v2.csv"
    duckdb :memory: -bail -csv -c "DESCRIBE SELECT * FROM read_csv('$lab/batch-v1.csv'); DESCRIBE SELECT * FROM read_csv('$lab/batch-v2.csv');"
    ;;
  *) exit 1 ;;
esac
