#!/usr/bin/env bash
# Supplied fixture plumbing; called only with a freshly owned lab directory.
set -euo pipefail
root=$1
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
export GIT_AUTHOR_NAME='Cursor Lab' GIT_AUTHOR_EMAIL='lab@example.invalid'
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
export GIT_AUTHOR_DATE='2026-09-09T00:00:00Z'
export GIT_COMMITTER_DATE="$GIT_AUTHOR_DATE"
git init --quiet --bare "$root/source.git"
git init --quiet --bare "$root/replica.git"
blob=$(printf 'base\n' | git --git-dir="$root/source.git" hash-object -w --stdin)
tree=$(printf '100644 blob %s\tstory.txt\n' "$blob" | git --git-dir="$root/source.git" mktree)
base=$(printf 'base\n' | git --git-dir="$root/source.git" commit-tree "$tree")
for name in a b; do
  blob=$(printf 'change %s\n' "$name" | git --git-dir="$root/source.git" hash-object -w --stdin)
  tree=$(printf '100644 blob %s\tstory.txt\n' "$blob" | git --git-dir="$root/source.git" mktree)
  oid=$(printf 'change %s\n' "$name" | git --git-dir="$root/source.git" commit-tree "$tree" -p "$base")
  printf '%s\n' "$oid" > "$root/$name.oid"
  printf '%s\n' "$oid" | git --git-dir="$root/source.git" pack-objects --stdout --revs > "$root/$name.pack"
done
printf '%s\n' "$base" > "$root/base.oid"
printf '%s\n' "$base" | git --git-dir="$root/source.git" pack-objects --stdout --revs > "$root/base.pack"
git --git-dir="$root/source.git" update-ref refs/heads/main "$base"
