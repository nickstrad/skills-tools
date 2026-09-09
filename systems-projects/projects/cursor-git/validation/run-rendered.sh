#!/usr/bin/env bash
# Author validation: execute the exact lesson shell fences and keep small observation logs.
# This does not read or write learner progress. Inspect output against batch-1.md.
set -euo pipefail
here=$(cd -- "$(dirname -- "$0")" && pwd)
course=$(dirname "$here")
scratch=$(mktemp -d /tmp/cursor-rendered-validation-XXXXXX)
trap 'rm -rf -- "$scratch"' EXIT
n=0
for slug in objects-before-refs publish-the-index race-the-publishers; do
  n=$((n + 1))
  cat > "$scratch/run.sh" <<'SH'
set -eo pipefail
trap 'if [ -n "${CURSOR_LAB:-}" ] && [ -d "$CURSOR_LAB" ]; then "$COURSE/lab/lab.sh" clean "$CURSOR_LAB"; fi' EXIT
SH
  awk '/^```(sh|bash)$/ {inside=1; next} /^```$/ {inside=0; next} inside {print}' \
    "$course/curriculum/$slug/lesson.md" >> "$scratch/run.sh"
  /usr/bin/time -p bash "$scratch/run.sh" > "$here/lesson-$n-output.txt" 2>&1
  if grep -q 'unexpected:' "$here/lesson-$n-output.txt"; then
    cat "$here/lesson-$n-output.txt" >&2; exit 1
  fi
  printf 'Lesson %s commands completed; inspect %s\n' "$n" "$here/lesson-$n-output.txt"
done
