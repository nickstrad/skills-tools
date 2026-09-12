#!/usr/bin/env bash
# Repeat lesson 2's immutable PUTs for the concurrency fixture, without publishing an index.
set -euo pipefail
root=$1 name=$2
[[ $name == a || $name == b ]] || exit 1
for spec in "$name.pack packs/$name.pack" "$name.record.json records/$name.json"; do
  read -r file key <<< "$spec"
  code=$(curl -sS --max-time 5 -o "$root/$name.upload.body" -w '%{http_code}' \
    -X PUT -H 'If-None-Match: *' --data-binary "@$root/$file" \
    "http://127.0.0.1:18333/cursor-lab/$key")
  if [[ $code == 412 ]]; then
    curl -fsS --max-time 5 "http://127.0.0.1:18333/cursor-lab/$key" -o "$root/$name.existing"
    cmp "$root/$file" "$root/$name.existing" || { echo 'Immutable key reused for different content' >&2; exit 1; }
  elif [[ $code != 200 ]]; then
    cat "$root/$name.upload.body" >&2; exit 1
  fi
  printf '%s HTTP %s\n' "$key" "$code"
done
