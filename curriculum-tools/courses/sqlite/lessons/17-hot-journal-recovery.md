# Recover a hot journal deterministically

slug: hot-journal-recovery
category: journals
difficulty: advanced
tags: crash-recovery, rollback-journal, integrity-check
prerequisites: crash-leaves-hot-journal
safety: dangerous
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 12
revision: 3

## Overview
Recover a working copy of the preserved crash pair and compare its logical state with the pre-crash committed baseline. Hash the original pair before and after to prove it stayed untouched. Successful recovery means both sound structure and no leaked uncommitted values.

## Syntax breakdown
### In plain terms

SQLite automatically applies rollback recovery when a normal open discovers a hot journal. That helpful behavior also mutates files, so we never point it at the preserved evidence pair. A fresh working copy lets you repeat the experiment or inspect the originals later.

### What you are learning

- **Automatic recovery:** Opening the matching main/journal pair triggers the engine's rollback protocol.
- **Structural versus semantic evidence:** An intact B-tree is necessary but does not prove the intended rows survived.
- **Preservation:** Recovery and original evidence belong at different paths.

### Piece by piece

- **set -eu, case, dirname and test** enforce the disposable lab boundary.
- **find -mindepth 2 -maxdepth 2 -type f -name ... -size +0c -printf** selects nonempty preserved main files one scratch-directory level beneath the lab parent. **sort -nr, head -n 1 and cut** choose the newest timestamp and retain its full path; check the printed selection if several attempts exist.
- **sha256sum** records both original files before recovery. A main file without its matching journal is rejected.
- **cp** creates recovered.db and recovered.db-journal. **rm -f** removes only an earlier working result at those exact paths, not the evidence.
- **sqlite3** opens the working pair. **integrity_check** must return ok; **count, min/max, substr and LIKE** verify 500 committed-prefix rows and zero dirty-prefix rows.
- **.headers on and .mode box** label the logical checks. **test -e and stat -c** report whether the working journal was removed or invalidated.
- A second **sha256sum** and equality assertion require **evidence_unchanged=yes**, independent of the working journal's final shape.

## Caution
Run crash-leaves-hot-journal first under the same disposable lab parent. This lesson selects the newest preserved pair there and overwrites only its recovered.db working result. Keep the printed original paths; they must remain unchanged.

## Run
```sh
(
set -eu
if [ -z "${TUTOR_SQLITE_DB:-}" ]; then echo 'set TUTOR_SQLITE_DB to an absolute disposable path'; exit 2; fi
TUTOR_SQLITE_DB=${TUTOR_SQLITE_DB}
case "$TUTOR_SQLITE_DB" in /*) ;; *) echo 'TUTOR_SQLITE_DB must be absolute'; exit 2;; esac
case "$TUTOR_SQLITE_DB" in *.db) ;; *) echo 'TUTOR_SQLITE_DB must end in .db'; exit 2;; esac
PARENT_DIR=$(dirname "$TUTOR_SQLITE_DB")
if [ "$PARENT_DIR" = / ] || [ ! -d "$PARENT_DIR" ] || [ ! -w "$PARENT_DIR" ]; then echo 'database parent must be an existing writable non-root directory'; exit 2; fi
HOT_MAIN=$(find "$PARENT_DIR" -mindepth 2 -maxdepth 2 -type f -name 'crash.db.hot-main' -size +0c -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)
[ -n "$HOT_MAIN" ] || { echo 'no preserved crash pair found; run crash-leaves-hot-journal first'; exit 2; }
[ -s "$HOT_MAIN-journal" ] || { echo 'preserved hot journal evidence is missing or empty'; exit 2; }
BEFORE_HASH=$(sha256sum "$HOT_MAIN" "$HOT_MAIN-journal")
WORKING_MAIN="$(dirname "$HOT_MAIN")/recovered.db"
rm -f "$WORKING_MAIN" "$WORKING_MAIN-journal"
cp "$HOT_MAIN" "$WORKING_MAIN"
cp "$HOT_MAIN-journal" "$WORKING_MAIN-journal"
sqlite3 "$WORKING_MAIN" <<'SQL'
.headers on
.mode box
PRAGMA integrity_check;
SELECT count(*) AS rows, min(substr(payload, 1, 10)) AS minimum_prefix, max(substr(payload, 1, 10)) AS maximum_prefix FROM crash_rows;
SELECT count(*) AS uncommitted_rows_visible FROM crash_rows WHERE payload LIKE 'dirty-%';
SQL
if [ -e "$WORKING_MAIN-journal" ]; then stat -c 'working_journal_bytes=%s' "$WORKING_MAIN-journal"; else echo 'working_journal_absent'; fi
AFTER_HASH=$(sha256sum "$HOT_MAIN" "$HOT_MAIN-journal")
printf 'discovered_hot_main=%s\ndiscovered_hot_journal=%s\nevidence_unchanged=%s\n' "$HOT_MAIN" "$HOT_MAIN-journal" "$([ "$BEFORE_HASH" = "$AFTER_HASH" ] && echo yes || echo no)"
[ "$BEFORE_HASH" = "$AFTER_HASH" ]
)
```

## Expected result
The working copy recovers to integrity_check=ok, 500 rows, committed payload prefixes and uncommitted_rows_visible=0. Its working journal is normally removed or invalidated. The printed discovered paths identify the original pair, and evidence_unchanged=yes proves both originals retained identical hashes.

## Systems lens
Recoverability is a protocol plus a tested procedure, not a hopeful command. The before-image mechanism is SQLite-specific; separating original evidence, recovery output and domain verification transfers directly to distributed incident response.
