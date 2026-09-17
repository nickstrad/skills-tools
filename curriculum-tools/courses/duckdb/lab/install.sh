#!/usr/bin/env bash
# Install the course's pinned Linux amd64 CLI and matching official extensions locally.
set -euo pipefail
course=$(cd -- "$(dirname -- "$0")/.." && pwd)
cache="$course/../../.cache/duckdb-1.5.5"
user_home=${HOME:?HOME must be set}
user_bin="$user_home/.local/bin"
user_extensions="$user_home/.duckdb/extensions/v1.5.5/linux_amd64"
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || { echo 'Requires Linux amd64' >&2; exit 1; }
mkdir -p "$cache"
scratch=$(mktemp -d "$cache/install.XXXXXX")
trap 'rm -rf -- "$scratch"' EXIT
curl -fsSL --retry 3 https://github.com/duckdb/duckdb/releases/download/v1.5.5/duckdb_cli-linux-amd64.gz -o "$scratch/duckdb.gz"
echo "c61f21485e6e41d3a0c28ce9904ea18346309cf427b4cf9479bc3564348dc885  $scratch/duckdb.gz" | sha256sum -c -
gzip -dc "$scratch/duckdb.gz" > "$scratch/duckdb"
chmod +x "$scratch/duckdb"
"$scratch/duckdb" --version
mv "$scratch/duckdb" "$cache/duckdb"
mkdir -p "$cache/extensions/v1.5.5/linux_amd64"
for extension in postgres_scanner sqlite_scanner; do
  curl -fsSL --retry 3 "https://extensions.duckdb.org/v1.5.5/linux_amd64/$extension.duckdb_extension.gz" -o "$scratch/$extension.gz"
  gzip -dc "$scratch/$extension.gz" > "$cache/extensions/v1.5.5/linux_amd64/$extension.duckdb_extension"
done
echo "b1ced4cfc6311313e117c2afb3eac76508718778dde0716421503c7dbfb5605c  $cache/extensions/v1.5.5/linux_amd64/postgres_scanner.duckdb_extension" | sha256sum -c -
echo "693d2bf90779df23ca5ebe0688639b9adfc11c2d55ae3466b33e28be16afaa5e  $cache/extensions/v1.5.5/linux_amd64/sqlite_scanner.duckdb_extension" | sha256sum -c -
mkdir -p "$user_bin" "$user_extensions"
install -m 0755 "$cache/duckdb" "$user_bin/duckdb"
install -m 0644 "$cache/extensions/v1.5.5/linux_amd64/postgres_scanner.duckdb_extension" "$user_extensions/postgres_scanner.duckdb_extension"
install -m 0644 "$cache/extensions/v1.5.5/linux_amd64/sqlite_scanner.duckdb_extension" "$user_extensions/sqlite_scanner.duckdb_extension"
# Loading through the installed command verifies the normal user-level extension location.
PATH="$user_bin:$PATH" duckdb -c "LOAD postgres; LOAD sqlite; SELECT extension_name, extension_version FROM duckdb_extensions() WHERE loaded AND extension_name IN ('postgres_scanner','sqlite_scanner');"
sha256sum "$cache/duckdb" "$cache"/extensions/v1.5.5/linux_amd64/*.duckdb_extension
