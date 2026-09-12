# Repair and maintain an FTS5 derived index

slug: fts-derived-state
category: toolkit
difficulty: advanced
tags: fts5, derived-state, triggers, rollback
prerequisites: cache-invalidation-and-snapshots
safety: ddl
run-in: shell
sessions: 1
min-version: 3.53.4
minutes: 25
revision: 1

## Overview
Create an external-content search index after its source rows already exist and observe a missed match. Rebuild it, install transactional maintenance triggers and prove a rolled-back document leaves no searchable ghost. SQLite becomes a practical local search tool while exposing the same derived-state repair obligations found in larger systems.

## Syntax breakdown
### In plain terms

The docs table is authoritative; FTS5 maintains a separate searchable representation of it. Creating an external-content FTS table does not backfill existing documents. We first cause that divergence, then repair it and test maintenance through every mutation path.

### What you are learning

- **Derived-state ownership:** A source row and a searchable term are different stored facts.
- **Repair versus prevention:** Rebuild repairs old divergence; triggers keep subsequent changes aligned.
- **Atomic maintenance:** Trigger effects share the source transaction's commit or rollback.
- **Semantic checks:** Sound pages alone do not certify that a search index matches its source.

### Piece by piece

- **Path checks and mktemp -d** isolate the artifact. **pragma_module_list** gates FTS5 availability and a missing module exits nonzero; the course bootstrap enables it explicitly.
- **sqlite3 -bail** stops unexpected SQL errors and retains the output in fts.log.
- **CREATE VIRTUAL TABLE ... USING fts5(title, body, content='docs', content_rowid='id')** maps search content to the source table's integer identity.
- **MATCH 'pager'** consults indexed terms and initially finds zero despite the existing document. An ordinary non-MATCH query can read external content without proving it is indexed.
- **INSERT INTO docs_fts(docs_fts) VALUES ('rebuild')** is an FTS maintenance command: scan the authoritative docs table and reconstruct the index. The match count becomes 1.
- **AFTER INSERT/DELETE/UPDATE triggers** maintain the derived representation. **new** supplies inserted values; **old** supplies the exact values to remove. FTS5's special **'delete' command** removes the old indexed terms; UPDATE combines delete-old and insert-new.
- The controlled source insert, update and delete leave one pager match. A temporary document inside **BEGIN** is searchable, then **ROLLBACK** removes both its source row and indexed terms.
- **INSERT ... ('integrity-check', 1)** uses the FTS hidden command and rank columns to compare internal index consistency with external content. **PRAGMA integrity_check** supplies a separate page-structure check.
- **grep -Fxq** requires every expected marker and count in the retained log; a later command's success cannot conceal an earlier wrong observation.

## Caution
FTS5 is a required runtime capability, not an optional successful skip. Do not substitute LIKE, which would remove the derived-index phenomenon. All mutations remain inside the newly created toolkit-fts directory.

## Run
```sh
set -eu
db=$(printenv TUTOR_SQLITE_DB || true)
if [ -z "$db" ]; then echo 'TUTOR_SQLITE_DB must be nonempty' >&2; exit 2; fi
case "$db" in /*.db) ;; *) echo 'TUTOR_SQLITE_DB must be an absolute .db path' >&2; exit 2;; esac
dir=$(dirname -- "$db")
[ "$dir" != / ] && [ -d "$dir" ] && [ -w "$dir" ] || exit 2
case "$dir" in *"'"*|*'"'*) echo 'use a lab path without quote characters' >&2; exit 2;; esac
scratch=$(mktemp -d "$dir/toolkit-fts.XXXXXX")
echo "evidence_dir=$scratch"
fts_db=$scratch/fts-derived.sqlite
rm -f "$fts_db" "$fts_db-wal" "$fts_db-shm" "$fts_db-journal"
capability=$(sqlite3 "$fts_db" "SELECT CASE WHEN EXISTS (SELECT 1 FROM pragma_module_list WHERE name='fts5') THEN 'yes' ELSE 'no' END;" 2>/dev/null || true)
if [ "$capability" != yes ]; then echo "fts5_capability=missing runtime=$(sqlite3 --version | cut -d' ' -f1)" >&2; exit 3; fi
echo 'fts5_capability=yes'
sqlite3 -bail "$fts_db" >"$scratch/fts.log" <<'SQL'
PRAGMA journal_mode=WAL;
CREATE TABLE docs(id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL);
INSERT INTO docs VALUES (1, 'one', 'pager recovery'), (2, 'two', 'writer checkpoint');
CREATE VIRTUAL TABLE docs_fts USING fts5(title, body, content='docs', content_rowid='id');
SELECT 'before_rebuild', count(*) FROM docs_fts WHERE docs_fts MATCH 'pager';
INSERT INTO docs_fts(docs_fts) VALUES ('rebuild');
SELECT 'after_rebuild', count(*) FROM docs_fts WHERE docs_fts MATCH 'pager';
CREATE TRIGGER docs_ai AFTER INSERT ON docs BEGIN
  INSERT INTO docs_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
CREATE TRIGGER docs_ad AFTER DELETE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
END;
CREATE TRIGGER docs_au AFTER UPDATE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO docs_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
INSERT INTO docs VALUES (3, 'three', 'quota incident');
UPDATE docs SET body='pager repaired' WHERE id=2;
DELETE FROM docs WHERE id=1;
SELECT 'after_trigger_mutations', count(*) FROM docs_fts WHERE docs_fts MATCH 'pager';
BEGIN;
INSERT INTO docs VALUES (4, 'four', 'pager temporary');
SELECT 'inside_rollback_matches', count(*) FROM docs_fts WHERE docs_fts MATCH 'temporary';
ROLLBACK;
SELECT 'rolled_back_matches', count(*) FROM docs_fts WHERE docs_fts MATCH 'temporary';
INSERT INTO docs_fts(docs_fts, rank) VALUES ('integrity-check', 1);
PRAGMA integrity_check;
SQL
cat "$scratch/fts.log"
for expected in 'before_rebuild|0' 'after_rebuild|1' 'after_trigger_mutations|1' 'inside_rollback_matches|1' 'rolled_back_matches|0' ok; do
  grep -Fxq "$expected" "$scratch/fts.log" || { echo "missing FTS evidence: $expected" >&2; exit 4; }
done
echo "fts_log=$scratch/fts.log (retained for inspection)"
```

## Expected result
On an FTS5-enabled runtime the script prints fts5_capability=yes, before_rebuild|0, after_rebuild|1, after_trigger_mutations|1, inside_rollback_matches|1, rolled_back_matches|0, and integrity_check ok, while retaining the evidence directory. On a runtime without FTS5 it prints fts5_capability=missing and exits nonzero as an unmet prerequisite; it does not claim the experiment passed.

## Systems lens
Keep the PostgreSQL materialized-state intuition but learn SQLite's specific external-content contract. Local triggers can make source and search updates atomic in one database; they cannot repair old omissions or validate a remote indexing pipeline. A useful toolkit feature includes a repair path and a semantic consistency check.

## Optional variation
After Run, open the printed fts-derived.sqlite in sqlite3. Execute `DROP TRIGGER docs_ai; DROP TRIGGER docs_ad; DROP TRIGGER docs_au;` and then `UPDATE docs SET body='generationprobe' WHERE id=2;`. A direct `SELECT count(*) FROM docs WHERE body='generationprobe';` returns 1, while `SELECT count(*) FROM docs_fts WHERE docs_fts MATCH 'generationprobe';` returns 0. Repair with the existing rebuild command and repeat MATCH; it now returns 1. Run the existing FTS external-content integrity check and page integrity check, then close the connection. A later fresh Run recreates the maintained fixture.

A rebuild job must associate its result with the source generation it actually indexed, and prevent publication as current after that source changes. Recording only a completion timestamp does not identify the indexed state.
