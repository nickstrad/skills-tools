#!/usr/bin/env bash
set -euo pipefail

repo=/root/Software/skills-tools
course="$repo/curriculum-tools/courses/postgres-essentials"
bindir=/usr/lib/postgresql/16/bin
owned_root=$(mktemp -d /tmp/pg-essentials-validation-22-XXXXXXXX)
data="$owned_root/data"
socket="$owned_root/socket"
log="$owned_root/postgres.log"
port=5542

cleanup() {
  if [[ -f "$data/postmaster.pid" ]]; then
    runuser -u postgres -- "$bindir/pg_ctl" -D "$data" -m fast -w stop >/dev/null || true
  fi
  if [[ -d "$data" ]] && runuser -u postgres -- "$bindir/pg_ctl" -D "$data" status >/dev/null 2>&1; then
    echo "refusing to remove live validation root: $owned_root" >&2
    return 1
  fi
  rm -rf "$owned_root"
}
trap cleanup EXIT INT TERM

chown postgres:postgres "$owned_root"
runuser -u postgres -- "$bindir/initdb" -D "$data" --no-locale --encoding=UTF8 --auth=trust >/dev/null
mkdir "$socket"
chown postgres:postgres "$socket"
runuser -u postgres -- "$bindir/pg_ctl" -D "$data" -l "$log" -o "-k $socket -p $port -c listen_addresses='' -c max_connections=20 -c shared_buffers=32MB" -w start >/dev/null

export PGHOST="$socket"
export PGPORT="$port"
export PGUSER=postgres
export PGDATABASE=postgres
export PSQL="$bindir/psql"

cd "$repo/curriculum-tools"
/root/.deno/bin/deno run -A courses/postgres-essentials/validation/author-22.ts \
  > "$course/validation/author-22.log" 2>&1

python3 - "$course/validation/author-22.log" "$course/validation/author-22-outcomes.json" <<'PY'
import json, re, sys
text = open(sys.argv[1]).read()
parts = {m.group(1): m.group(2) for m in re.finditer(r"=== (core|variation) ===\n(.*?)(?=\n=== |\Z)", text, re.S)}
if set(parts) != {"core", "variation"}:
    raise SystemExit("missing core or variation output")
if "ERROR:" in text or "FATAL:" in text:
    raise SystemExit("unexpected PostgreSQL error")

def phase(name, body):
    match = re.search(rf"phase={name}\n(.*?)(?=\n(?:COMMIT|DROP TABLE|phase=))", body, re.S)
    if not match:
        raise SystemExit(f"missing phase {name}")
    plan = match.group(1)
    rows = [int(x) for x in re.findall(r"Hash Join .*?actual rows=(\d+)", plan)]
    batches = [int(x) for x in re.findall(r"Buckets: \d+\s+Batches: (\d+)", plan)]
    temp = [tuple(map(int, x)) for x in re.findall(r"temp read=(\d+) written=(\d+)", plan)]
    if rows != [50000] or len(batches) != 1:
        raise SystemExit(f"bad plan evidence for {name}: rows={rows}, batches={batches}")
    return {"hash_join_rows": rows[0], "batches": batches[0], "temp_io": temp}

small = phase("small_hash_allowance", parts["core"])
large = phase("larger_hash_allowance", parts["core"])
variation = phase("variation_hash_multiplier", parts["variation"])
if not (small["batches"] > 1 and small["temp_io"]):
    raise SystemExit("small allowance did not batch with temporary I/O")
if not (large["batches"] == 1 and not large["temp_io"]):
    raise SystemExit("large allowance did not stay in one batch without temporary I/O")
if not (1 <= variation["batches"] < small["batches"]):
    raise SystemExit("multiplier variation did not reduce batch count")

json.dump({"postgres_version": 16, "core": {"small": small, "large": large}, "variation": variation,
           "unexpected_errors": []}, open(sys.argv[2], "w"), indent=2)
open(sys.argv[2], "a").write("\n")
PY

cleanup
trap - EXIT INT TERM

python3 - "$course" "$owned_root" <<'PY'
import hashlib, json, os, sys
course, root = sys.argv[1:]
lesson = os.path.join(course, "curriculum/17-join-memory.ts")
runner = os.path.join(course, "validation/author-22.ts")
def digest(path):
    with open(path, "rb") as f: return hashlib.sha256(f.read()).hexdigest()
with open(os.path.join(course, "validation/author-22-source.json"), "w") as f:
    json.dump({"source_sha256": digest(lesson), "runner_sha256": digest(runner)}, f, indent=2)
    f.write("\n")
with open(os.path.join(course, "validation/author-22-cleanup.json"), "w") as f:
    json.dump({"owned_root": root, "removed": not os.path.exists(root)}, f, indent=2)
    f.write("\n")
PY
