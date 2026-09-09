#!/usr/bin/env bash
# Build the supplied protocol client into the owned disposable lab, never into learner repositories.
set -euo pipefail
[[ $# == 1 ]] || { echo 'usage: build.sh LAB' >&2; exit 1; }
root=$(realpath -e -- "$1")
[[ "$root" == /tmp/systems-cursor-git-* && ! -L "$1" && -f "$root/.cursor-git-owned" ]] || exit 1
[[ $(cat "$root/.cursor-git-owned") == "$root" ]] || exit 1
here=$(cd -- "$(dirname -- "$0")" && pwd)
systems=$(cd -- "$here/../../.." && pwd)
if ! command -v go >/dev/null 2>&1; then
  export PATH="$systems/../curriculum-tools/courses/grpc/.tools/go/bin:$PATH"
fi
cd "$systems"
go build -trimpath -o "$root/cursor" ./projects/cursor-git/lab/cursor
printf 'Built supplied client: %s/cursor\n' "$root"
