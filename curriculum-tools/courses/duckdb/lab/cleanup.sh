#!/usr/bin/env bash
# Stop and remove only a marked, canonical, course-owned temporary fixture.
set -euo pipefail
lab=${1:?pass the lab directory printed by setup.sh}
[[ "$lab" == /tmp/duckdb-lesson.* && ! -L "$lab" && $(realpath -- "$lab") == "$lab" && -f "$lab/.duckdb-owned" ]] || { echo "Refusing unowned path: $lab" >&2; exit 1; }
if [[ -d "$lab/pg" ]]; then
  pg_bin=/usr/lib/postgresql/16/bin
  runner=()
  if [[ $(id -u) == 0 ]]; then runner=(runuser -u postgres --); fi
  if [[ -f "$lab/pg/postmaster.pid" ]]; then
    "${runner[@]}" "$pg_bin/pg_ctl" -D "$lab/pg" -m fast -w stop >&2
  fi
  if "${runner[@]}" "$pg_bin/pg_ctl" -D "$lab/pg" status >/dev/null 2>&1; then
    echo 'PostgreSQL still running; retaining lab' >&2; exit 1
  fi
fi
rm -rf -- "$lab"
