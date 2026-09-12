#!/usr/bin/env bash
# Source this file; changes are confined to this shell's tool paths and lab functions.
GRPC_COURSE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
export GRPC_COURSE
export PATH="$GRPC_COURSE/.tools/bin:$GRPC_COURSE/.tools/go/bin:$PATH"
export GOPATH="$GRPC_COURSE/.tools/gopath" GOCACHE="$GRPC_COURSE/.tools/go-cache" GOTOOLCHAIN=local

new_lab() {
  LAB=$(mktemp -d "${GRPC_SCRATCH:-/tmp}/grpc-practice.XXXXXXXX") || return
  SERVER_PID=
  trap cleanup_lab EXIT
}
stop_server() {
  if [[ -n ${SERVER_PID:-} ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=
  fi
}
cleanup_lab() {
  stop_server
  if [[ -n ${LAB:-} && -d "$LAB" && $(basename -- "$LAB") == grpc-practice.* ]]; then
    rm -rf -- "$LAB"
  fi
}
start_server() {
  stop_server
  rm -f -- "$LAB/address"
  "$GRPC_COURSE/lab/bin/counter" -ready "$LAB/address" "$@" >"$LAB/server.log" 2>&1 &
  SERVER_PID=$!
  for ((attempt=0; attempt<100; attempt++)); do
    if [[ -s "$LAB/address" ]]; then
      ADDR=$(cat "$LAB/address")
      if grpcurl -plaintext -max-time 1 -import-path "$GRPC_COURSE/lab/proto" -proto counter.proto -d '{}' "$ADDR" practice.Counter/Get >/dev/null 2>&1; then
        printf 'Local server: %s\n' "$ADDR"
        return 0
      fi
    fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
    sleep 0.05
  done
  cat "$LAB/server.log" >&2
  echo 'Counter did not become ready.' >&2
  return 1
}
# Expected failures stay visible and must actually fail with the named text.
expect_failure() {
  local expected=$1
  shift
  local observed
  if "$@" >"$LAB/expected-error.txt" 2>&1; then
    cat "$LAB/expected-error.txt"
    echo 'Unexpected success' >&2
    return 1
  else observed=$?; fi
  cat "$LAB/expected-error.txt"
  printf 'Exit status: %s\n' "$observed"
  grep -F -- "$expected" "$LAB/expected-error.txt" >/dev/null
}
