#!/usr/bin/env bash
# Lifecycle only: all experiment decisions and HTTP/Git evidence remain visible in lessons.
set -euo pipefail
here=$(cd -- "$(dirname -- "$0")" && pwd)
weed="${XDG_DATA_HOME:-$HOME/.local/share}/systemscoach/tools/seaweedfs-4.46/weed"
ports=(18333 28333 19333 29333 18888 28888 18080 28080)

owned() {
  root=$(realpath -e -- "$1")
  [[ "$root" == /tmp/systems-cursor-git-* && -f "$root/.cursor-git-owned" && ! -L "$1" ]] || {
    echo 'Refusing a path without this lab ownership marker.' >&2; exit 1;
  }
  [[ $(cat "$root/.cursor-git-owned") == "$root" ]] || exit 1
}
stop_store() {
  if [[ -f "$root/weed.pid" ]]; then
    pid=$(cat "$root/weed.pid")
    if [[ -d "/proc/$pid" ]] && [[ $(awk '{print $3}' "/proc/$pid/stat") != Z ]]; then
      # A PID alone can be reused. Check executable and exact owned data-directory argument.
      [[ $(readlink "/proc/$pid/exe") == "$weed" ]] && \
        tr '\0' '\n' < "/proc/$pid/cmdline" | grep -Fxq -- "-dir=$root/store" || {
          echo "Refusing to stop PID $pid: ownership does not match." >&2; exit 1;
        }
      kill -TERM "$pid"
      for _ in {1..300}; do
        [[ ! -d "/proc/$pid" ]] && break
        [[ $(awk '{print $3}' "/proc/$pid/stat" 2>/dev/null || true) == Z ]] && break
        sleep .1
      done
      if [[ -d "/proc/$pid" ]] && [[ $(awk '{print $3}' "/proc/$pid/stat") != Z ]]; then
        echo "Owned process $pid has not stopped; retaining $root for inspection." >&2; exit 1
      fi
    fi
    rm -f "$root/weed.pid"
  fi
}
start_store() {
  [[ -x "$weed" ]] || { echo "Run $here/install.sh first." >&2; return 1; }
  for port in "${ports[@]}"; do
    if ss -H -ltn "sport = :$port" | grep -q .; then
      echo "Port $port is occupied; clean up your earlier cursor-git lab or retry later." >&2
      return 1
    fi
  done
  mkdir -p "$root/store"
  # server mode avoids mini's always-started admin gRPC listener in release 4.46.
  # Keep the default embedded filer metadata underneath the owned working directory.
  (cd "$root/store"; exec nohup "$weed" server -filer -s3 -dir="$root/store" -ip=127.0.0.1 -ip.bind=127.0.0.1 \
    -master.port=19333 -master.port.grpc=29333 -master.telemetry=false \
    -master.volumeSizeLimitMB=16 -master.volumePreallocate=false \
    -volume.port=18080 -volume.port.grpc=28080 -volume.max=8 \
    -filer.port=18888 -filer.port.grpc=28888 -filer.localSocket="$root/filer.sock" \
    -s3.port=18333 -s3.port.grpc=28333 -s3.localSocket="$root/s3.sock" \
    -s3.port.iceberg=0 -s3.port.lance=0 -volume.preStopSeconds=1 \
    -s3.iam=false -webdav=false \
    > "$root/store.log" 2>&1 < /dev/null) &
  pid=$!
  printf '%s\n' "$pid" > "$root/weed.pid"
  deadline=$((SECONDS + 45))
  while (( SECONDS < deadline )); do
    if ! kill -0 "$pid" 2>/dev/null; then
      tail -n 15 "$root/store.log" >&2; return 1
    fi
    if curl -fsS --max-time 1 http://127.0.0.1:18333/ >/dev/null 2>&1; then
      bucket_code=$(curl -sS --max-time 1 -o /dev/null -w '%{http_code}' \
        http://127.0.0.1:18333/cursor-lab || true)
      if [[ "$bucket_code" == 404 ]]; then
        curl -fsS --max-time 5 -X PUT http://127.0.0.1:18333/cursor-lab >/dev/null || return 1
      elif [[ "$bucket_code" != 200 ]]; then
        sleep .1; continue
      fi
      # On a restart metadata listing can be ready before volume data is readable.
      index_code=$(curl -sS --max-time 1 -o /dev/null -w '%{http_code}' \
        http://127.0.0.1:18333/cursor-lab/index.json || true)
      [[ "$index_code" != 200 && "$index_code" != 404 ]] || return 0
    fi
    sleep .1
  done
  echo "Store startup timed out; see $root/store.log" >&2
  tail -n 20 "$root/store.log" >&2
  return 1
}

case "${1:-}" in
  start)
    [[ $# == 2 && ( $2 == objects || $2 == store ) ]] || { echo 'usage: lab.sh start objects|store' >&2; exit 1; }
    root=$(mktemp -d /tmp/systems-cursor-git-XXXXXX)
    printf '%s\n' "$root" > "$root/.cursor-git-owned"
    # A failed start releases its own allocations; never touches another lab using the ports.
    trap 'status=$?; if (( status != 0 )); then stop_store; rm -rf -- "$root"; fi' EXIT
    "$here/fixture.sh" "$root"
    [[ $2 != store ]] || start_store
    printf '%s\n' "$root"
    ;;
  stop|clean|restart)
    [[ $# == 2 ]] || exit 1
    owned "$2"
    stop_store
    if [[ $1 == clean ]]; then
      rm -rf -- "$root"
      printf 'Removed %s\n' "$root"
    elif [[ $1 == restart ]]; then
      if ! start_store; then stop_store; exit 1; fi
    fi
    ;;
  *) echo 'usage: lab.sh start objects|store | stop|restart|clean LAB_PATH' >&2; exit 1 ;;
esac
