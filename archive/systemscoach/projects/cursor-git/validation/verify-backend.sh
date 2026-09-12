#!/usr/bin/env bash
# Author validation; inspect output alongside batch-1.md. Allocates and cleans one private lab.
set -euo pipefail
course=/root/Software/skills-tools/systems-projects/projects/cursor-git
lab=$("$course/lab/lab.sh" start store)
trap '"$course/lab/lab.sh" clean "$lab"' EXIT
url=http://127.0.0.1:18333/cursor-lab
"$course/lab/seed.sh" "$lab"
code=$(curl -sS --max-time 5 -o "$lab/exists.body" -w '%{http_code}' -X PUT -H 'If-None-Match: *' --data-binary '{"wrong":true}' "$url/index.json")
[[ "$code" == 412 ]]
printf 'create existing HTTP %s\n' "$code"
etag=$(cat "$lab/snapshot.etag")
code=$(curl -sS --max-time 5 -o "$lab/unchanged.body" -w '%{http_code}' -H "If-None-Match: $etag" "$url/index.json")
[[ "$code" == 304 ]]
printf 'unchanged GET HTTP %s\n' "$code"
"$course/lab/candidate.sh" "$lab" a refs/heads/main
"$course/lab/upload.sh" "$lab" a
curl -fsS --max-time 5 -X PUT -H "If-Match: $etag" --data-binary "@$lab/a.index.json" "$url/index.json"
code=$(curl -sS --max-time 5 -o "$lab/changed.body" -w '%{http_code}' -H "If-None-Match: $etag" "$url/index.json")
[[ "$code" == 200 ]]
jq -e '.generation==1 and .entries==["records/base.json","records/a.json"]' "$lab/changed.body"
printf 'changed GET HTTP %s\n' "$code"
for round in {1..6}; do
  key="$url/race-$round.json"
  curl -fsS --max-time 5 -X PUT -H 'If-None-Match: *' -D "$lab/init.headers" --data-binary '{"generation":0}' "$key"
  token=$(awk 'tolower($1)=="etag:" {gsub("\r", "", $2); print $2}' "$lab/init.headers")
  order='a b'; if (( round % 2 == 0 )); then order='b a'; fi
  for name in $order; do
    curl -sS --max-time 5 -o "$lab/$name.body" -w '%{http_code}\n' -X PUT -H "If-Match: $token" --data-binary "{\"generation\":1,\"winner\":\"$name\"}" "$key" > "$lab/$name.status" &
  done
  wait
  [[ $(sort "$lab/a.status" "$lab/b.status" | paste -sd ,) == 200,412 ]]
  winner=a; [[ $(cat "$lab/a.status") == 200 ]] || winner=b
  curl -fsS --max-time 5 "$key" > "$lab/winner.json"
  jq -e --arg winner "$winner" '.generation==1 and .winner==$winner' "$lab/winner.json" >/dev/null
  printf 'race %s order=%s a=%s b=%s stored=%s\n' "$round" "$order" "$(cat "$lab/a.status")" "$(cat "$lab/b.status")" "$winner"
done
# A competing lab must fail without touching the existing process or creating leftovers.
before=$(find /tmp -maxdepth 1 -type d -name 'systems-cursor-git-*' | sort)
if "$course/lab/lab.sh" start store > "$lab/collision.out" 2> "$lab/collision.err"; then exit 1; fi
after=$(find /tmp -maxdepth 1 -type d -name 'systems-cursor-git-*' | sort)
[[ "$before" == "$after" ]]
cat "$lab/collision.err"
curl -fsS --max-time 5 "$url/index.json" > "$lab/before.json"
printf 'collision refused; existing store unchanged\n'
"$course/lab/lab.sh" restart "$lab"
curl -fsS --max-time 5 "$url/index.json" > "$lab/after.json"
cmp "$lab/before.json" "$lab/after.json"
curl -fsS --max-time 5 "$url/packs/a.pack" > "$lab/after.pack"
cmp "$lab/a.pack" "$lab/after.pack"
printf 'normal restart: exact published index and pack bytes preserved\n'
ps -o rss= -p "$(cat "$lab/weed.pid")"
du -sb "$lab"
du -s "$lab"
ss -ltnp | grep '"weed"'
