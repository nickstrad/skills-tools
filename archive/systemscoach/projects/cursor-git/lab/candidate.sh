#!/usr/bin/env bash
# Fixture adapter: old tip belongs to the original operation, never to a blind CAS retry.
set -euo pipefail
[[ $# == 3 && ( $2 == a || $2 == b ) ]] || { echo 'usage: candidate.sh LAB a|b REF' >&2; exit 1; }
root=$1 name=$2 ref=$3
base=$(cat "$root/base.oid")
new=$(cat "$root/$name.oid")
current=$(jq -r --arg ref "$ref" '.refs[$ref] // "absent"' "$root/snapshot.json")
if [[ "$current" != "$base" ]]; then
  echo "ref-conflict: $ref expected $base, current $current; reject original operation" >&2
  exit 3
fi
git --git-dir="$root/source.git" cat-file -e "$new^{commit}"
hash=$(sha256sum "$root/$name.pack" | cut -d ' ' -f1)
jq -n --arg name "$name" --arg ref "$ref" --arg old "$base" --arg new "$new" --arg hash "$hash" \
  '{repository:"tiny",operation:("op-"+$name),pack:("packs/"+$name+".pack"),sha256:$hash,
    updates:[{ref:$ref,old:$old,new:$new}]}' > "$root/$name.record.json"
jq --arg name "$name" --arg ref "$ref" --arg new "$new" \
  '.generation += 1 | .entries += [("records/"+$name+".json")] | .refs[$ref]=$new' \
  "$root/snapshot.json" > "$root/$name.index.json"
cp "$root/snapshot.etag" "$root/$name.etag"
printf 'Prepared op-%s from generation %s for %s\n' "$name" "$(jq .generation "$root/snapshot.json")" "$ref"
