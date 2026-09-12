# Observe ATTACH transaction boundaries

slug: attached-database-boundaries
category: toolkit
difficulty: advanced
tags: attach, transactions, rollback-journal, wal
prerequisites: independent-database-writers
safety: ddl
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 25
revision: 1

## Overview
Attach two owned files to one connection and observe their rollback journals while a joint transaction is pending. Then run a clean WAL-mode transaction and inspect the two separate WAL files. The live experiment demonstrates coordination and artifacts; the cross-file crash guarantee comes from the documented mode conditions, not from a simulated power cut.

## Syntax breakdown
### In plain terms

ATTACH adds another database namespace to one connection, allowing SQL to address both files. SQLite can coordinate rollback-mode transactions across attached on-disk databases under its documented conditions. WAL retains atomicity for each file but does not supply an all-files crash-atomic commit.

### What you are learning

- **One coordinator:** Both attached writes belong to this connection's transaction, unlike two independent CLI commits.
- **Journal evidence:** Each participating file has its own rollback journal before publication.
- **Guarantee boundary:** Clean success cannot establish behavior under a host crash or power loss.

### Piece by piece

- **Path checks and mktemp -d** create two fresh local files; paths containing quote characters are rejected because they enter trusted lab SQL heredocs.
- **sqlite3 -bail** stops unexpected errors. An unquoted **heredoc** substitutes only these generated file paths into SQL.
- **ATTACH 'path' AS aux** exposes the second file under aux; **main.items and aux.items** select the physical destination explicitly.
- **journal_mode=DELETE and BEGIN IMMEDIATE** establish rollback-mode participation before the two INSERTs. Both main and aux are fresh on-disk databases, not an in-memory main database.
- **.shell stat -c** inspects each nonempty -journal while the transaction remains open. %s means bytes; this is evidence of before-images, not an observation of every commit-protocol phase.
- **COMMIT, count(*) and qualified integrity_check** show one committed row and sound structure in each file. Shell **test -e** distinguishes post-commit removal from retained length.
- **PRAGMA main/aux.journal_mode=WAL** selects WAL separately for both. **wal_autocheckpoint=0** keeps this connection's commit frames observable.
- The second clean transaction appends one row per file; live **stat** observes each WAL before connection shutdown can clean it up.
- SQLite's documented attached rollback commit protocol has additional synchronization conditions. Consult those conditions before adopting it; this script does not trace the super-journal or inject a cross-file power failure.

## Caution
The experiment creates only fresh files under its unique toolkit-attach directory. Do not attach valuable databases. The WAL phase's clean success must never be presented as evidence of all-files atomicity after a crash.

## Run
```sh
set -eu
db=$(printenv TUTOR_SQLITE_DB || true)
if [ -z "$db" ]; then echo 'TUTOR_SQLITE_DB must be nonempty' >&2; exit 2; fi
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
dir=$(dirname -- "$db")
[ "$dir" != / ] && [ -d "$dir" ] && [ -w "$dir" ] || exit 2
case "$dir" in *"'"*|*'"'*) echo 'use a lab path without quote characters' >&2; exit 2;; esac
scratch=$(mktemp -d "$dir/toolkit-attach.XXXXXX")
echo "evidence_dir=$scratch"
main=$scratch/attach-main.sqlite; aux=$scratch/attach-aux.sqlite
rm -f "$main" "$main-journal" "$main-wal" "$main-shm" "$aux" "$aux-journal" "$aux-wal" "$aux-shm"
sqlite3 -bail "$main" <<SQL
PRAGMA journal_mode=DELETE;
ATTACH '$aux' AS aux;
CREATE TABLE main.items(id INTEGER PRIMARY KEY, value TEXT);
CREATE TABLE aux.items(id INTEGER PRIMARY KEY, value TEXT);
BEGIN IMMEDIATE;
INSERT INTO main.items VALUES (1, 'main-commit');
INSERT INTO aux.items VALUES (1, 'aux-commit');
.shell stat -c 'main_journal_bytes=%s' '$main-journal'
.shell stat -c 'aux_journal_bytes=%s' '$aux-journal'
COMMIT;
SELECT 'main_rows', count(*) FROM main.items;
SELECT 'aux_rows', count(*) FROM aux.items;
PRAGMA main.integrity_check;
PRAGMA aux.integrity_check;
SQL
echo "after_commit_main_journal=$(test -e "$main-journal" && stat -c '%s' "$main-journal" || echo 0) after_commit_aux_journal=$(test -e "$aux-journal" && stat -c '%s' "$aux-journal" || echo 0)"
sqlite3 -bail "$main" <<SQL
PRAGMA journal_mode=WAL;
ATTACH '$aux' AS aux;
PRAGMA aux.journal_mode=WAL;
PRAGMA wal_autocheckpoint=0;
BEGIN;
INSERT INTO main.items VALUES (2, 'main-wal');
INSERT INTO aux.items VALUES (2, 'aux-wal');
COMMIT;
.shell stat -c 'main_wal_bytes=%s' '$main-wal'
.shell stat -c 'aux_wal_bytes=%s' '$aux-wal'
SQL
echo 'wal_note=each attached file owns its own WAL sidecar; process termination is not a power-loss test'
echo "journal_evidence=$scratch"
```

## Expected result
Before rollback-mode COMMIT, main_journal_bytes and aux_journal_bytes are positive. The transaction then reports one row and integrity ok in each file, with completed rollback journals removed. The WAL phase reports two nonempty per-file WAL sidecars while the connection is open. These observations do not test cross-file crash atomicity.

## Systems lens
Do not collapse 'one file', 'one connection', 'one transaction' and 'one failure domain' into the same boundary. ATTACH can coordinate local rollback-mode files when its conditions hold; WAL and independent connections have different guarantees. This is a useful local tool, not distributed consensus.

## Optional variation
Use two independent sqlite3 processes and explain why ATTACH cannot coordinate them. Then leave one attached transaction open and inspect which journals appear.
