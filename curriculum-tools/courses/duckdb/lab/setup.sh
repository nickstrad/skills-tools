#!/usr/bin/env bash
# Supply a fresh bounded fixture; print its directory only after successful setup.
set -euo pipefail
lesson=${1:?lesson number 1..10}
[[ "$lesson" =~ ^([1-9]|10)$ ]] || exit 1
course=$(cd -- "$(dirname -- "$0")/.." && pwd)
duckdb -c 'SELECT 1;' >/dev/null
lab=$(mktemp -d /tmp/duckdb-lesson.XXXXXX)
touch "$lab/.duckdb-owned"
trap 'bash "$course/lab/cleanup.sh" "$lab"' EXIT
if (( lesson <= 2 )); then
  pg_bin=/usr/lib/postgresql/16/bin
  runner=()
  if [[ $(id -u) == 0 ]]; then
    chown postgres:postgres "$lab"
    runner=(runuser -u postgres --)
  fi
  "${runner[@]}" "$pg_bin/initdb" -D "$lab/pg" -A trust -U postgres --no-locale >/dev/null
  "${runner[@]}" "$pg_bin/pg_ctl" -D "$lab/pg" -l "$lab/postgres.log" -o "-k $lab -p 55439 -c listen_addresses='' -c shared_buffers=32MB -c max_connections=10 -c unix_socket_permissions=0700" -w start >/dev/null
  psql -X -h "$lab" -p 55439 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$course/lab/postgres.sql" >/dev/null
  cat > "$lab/attach.sql" <<SQL
LOAD postgres;

ATTACH 'host=$lab port=55439 dbname=postgres user=reader' AS app (TYPE postgres, READ_ONLY);
SQL
elif (( lesson <= 5 )); then
  sqlite3 "$lab/source.sqlite" < "$course/lab/sqlite.sql"
  cp "$course/lab/orders.csv" "$lab/orders.csv"
  cat > "$lab/attach.sql" <<SQL
LOAD sqlite;

ATTACH '$lab/source.sqlite' AS source (TYPE sqlite, READ_ONLY);
SQL
else
  case $lesson in
    6) cp "$course/lab/orders.csv" "$lab/orders.csv" ;;
    7) cp "$course/lab/7-setup.sql" "$lab/setup.sql" ;;
    8) cp "$course/lab/messy.csv" "$lab/messy.csv" ;;
    9) cp "$course/lab/runs.jsonl" "$lab/runs.jsonl" ;;
    10) cp "$course/lab/batch-v1.csv" "$course/lab/batch-v2.csv" "$lab/" ;;
  esac
fi
bash "$course/lab/prepare.sh" "$lesson" "$lab"
trap - EXIT
printf '%s\n' "$lab"
