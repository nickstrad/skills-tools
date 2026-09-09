#!/usr/bin/env bash
# A known starting state, supplied so setup does not consume the experiment.
set -euo pipefail
root=$1
url=http://127.0.0.1:18333/cursor-lab
base=$(cat "$root/base.oid")
zero=0000000000000000000000000000000000000000
hash=$(sha256sum "$root/base.pack" | cut -d ' ' -f1)
jq -n --arg oid "$base" --arg zero "$zero" --arg hash "$hash" \
  '{repository:"tiny", operation:"base", pack:"packs/base.pack", sha256:$hash,
    updates:[{ref:"refs/heads/main",old:$zero,new:$oid},
             {ref:"refs/heads/feature",old:$zero,new:$oid}]}' > "$root/base.record.json"
jq -n --arg oid "$base" \
  '{generation:0,entries:["records/base.json"],refs:{"refs/heads/main":$oid,"refs/heads/feature":$oid}}' \
  > "$root/initial.index.json"
for spec in 'base.pack packs/base.pack' 'base.record.json records/base.json' 'initial.index.json index.json'; do
  read -r file key <<< "$spec"
  curl -fsS --max-time 5 -X PUT -H 'If-None-Match: *' --data-binary "@$root/$file" "$url/$key"
done
"$(dirname "$0")/snapshot.sh" "$root"
