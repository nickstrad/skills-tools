#!/usr/bin/env bash
# Copy editable SQL starters and assemble the supplied connection/staging SQL.
set -euo pipefail
course=$(cd -- "$(dirname -- "$0")/.." && pwd)
lesson=${1:?lesson number}
lab=${2:?owned lab directory}
[[ $lesson =~ ^([1-9]|10)$ && -f $lab/.duckdb-owned ]] || exit 1
if [[ $lesson == 6 || $lesson == 7 ]]; then
  printf 'Practice at the live DuckDB prompt using lesson %s. No query.sql edit is needed.\n' "$lesson" > "$lab/task.txt"
  exit 0
fi
sed "s|LAB_PATH|$lab|g" "$course/lab/$lesson-query.sql" > "$lab/query.sql"
case $lesson in
  3) cp "$course/lab/3-local.sql" "$lab/local.sql" ;;
  4) sed "s|LAB_PATH|$lab|g" "$course/lab/4-text-attach.sql" > "$lab/text-attach.sql" ;;
esac
if [[ $lesson == 4 ]]; then
  cp "$lab/text-attach.sql" "$lab/session.sql"
elif (( lesson >= 5 )); then
  : > "$lab/session.sql"
else
  cp "$lab/attach.sql" "$lab/session.sql"
  if [[ $lesson == 3 ]]; then cat "$lab/local.sql" >> "$lab/session.sql"; fi
fi
