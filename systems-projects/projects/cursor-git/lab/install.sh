#!/usr/bin/env bash
# Pinned, user-local Linux x86-64 lab dependency. No service starts here.
set -euo pipefail
target="${XDG_DATA_HOME:-$HOME/.local/share}/systemscoach/tools/seaweedfs-4.46"
if [[ -x "$target/weed" ]]; then
  printf '%s  %s\n' 075592965db0bbef04067512b44278d08eac90c6dc2ea9962beac3aebe019665 \
    "$target/weed" | sha256sum --check
  "$target/weed" version | head -n 1
  exit 0
fi
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || {
  echo 'This pinned lab installer supports Linux x86-64.' >&2; exit 1;
}
mkdir -p "$(dirname "$target")"
scratch=$(mktemp -d "$(dirname "$target")/.download-XXXXXX")
trap 'rm -rf -- "$scratch"' EXIT
curl --fail --location --retry 2 --max-time 120 \
  https://github.com/seaweedfs/seaweedfs/releases/download/4.46/linux_amd64.tar.gz \
  -o "$scratch/weed.tar.gz"
printf '%s  %s\n' f4c654a72353c36bd8ae03c8879b81588dc29ffee0fa87594d8716a3d9347ad5 \
  "$scratch/weed.tar.gz" | sha256sum --check
tar -xzf "$scratch/weed.tar.gz" -C "$scratch" weed
mkdir -p "$target"
install -m 755 "$scratch/weed" "$target/weed"
"$target/weed" version | head -n 1
