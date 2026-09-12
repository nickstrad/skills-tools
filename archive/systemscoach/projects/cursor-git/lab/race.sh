#!/usr/bin/env bash
# Two independent HTTP client processes, released only after both are ready.
set -euo pipefail
root=$1
[[ $(cat "$root/a.etag") == "$(cat "$root/b.etag")" ]] || { echo 'Candidates must start from the same ETag' >&2; exit 1; }
gate=$(mktemp -d "$root/race-XXXXXX")
pids=()
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
  rm -rf -- "$gate"
}
trap cleanup EXIT
for name in a b; do
  (
    touch "$gate/$name.ready"
    for _ in {1..500}; do
      [[ ! -f "$gate/go" ]] || break
      sleep .01
    done
    [[ -f "$gate/go" ]]
    exec curl -sS --max-time 5 -D "$root/$name.publish.headers" \
      -o "$root/$name.publish.body" -w '%{http_code}\n' \
      -X PUT -H "If-Match: $(cat "$root/$name.etag")" \
      --data-binary "@$root/$name.index.json" http://127.0.0.1:18333/cursor-lab/index.json
  ) > "$root/$name.status" &
  pids+=("$!")
done
for _ in {1..500}; do
  [[ ! -f "$gate/a.ready" || ! -f "$gate/b.ready" ]] || break
  sleep .01
done
[[ -f "$gate/a.ready" && -f "$gate/b.ready" ]]
touch "$gate/go"
for pid in "${pids[@]}"; do wait "$pid"; done
pids=()
printf 'a HTTP %s\nb HTTP %s\n' "$(cat "$root/a.status")" "$(cat "$root/b.status")"
[[ $(sort "$root/a.status" "$root/b.status" | paste -sd ,) == 200,412 ]] || {
  echo 'Unexpected statuses: inspect both publish.body files; do not continue.' >&2; exit 1;
}
