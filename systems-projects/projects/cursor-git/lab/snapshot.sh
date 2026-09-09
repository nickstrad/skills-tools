#!/usr/bin/env bash
set -euo pipefail
root=$1
curl -fsS --max-time 5 -D "$root/snapshot.headers" -o "$root/snapshot.json" \
  http://127.0.0.1:18333/cursor-lab/index.json
awk 'tolower($1)=="etag:" {gsub("\r", "", $2); print $2}' \
  "$root/snapshot.headers" > "$root/snapshot.etag"
[[ -s "$root/snapshot.etag" ]]
jq '{generation, entries, refs}' "$root/snapshot.json"
