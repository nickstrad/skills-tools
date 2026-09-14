#!/usr/bin/env bash
# Run the pinned course CLI without changing the machine's default DuckDB installation.
set -euo pipefail
course=$(cd -- "$(dirname -- "$0")/.." && pwd)
cache="$course/../../.cache/duckdb-1.5.5"
[[ -x "$cache/duckdb" ]] || { echo "Run: bash $course/lab/install.sh" >&2; exit 1; }
exec "$cache/duckdb" -init /dev/null -cmd "SET extension_directory='$cache/extensions'; SET autoinstall_known_extensions=false; SET threads=2; SET memory_limit='256MB';" "$@"
