# Recovery maximizes salvage, while backups provide guarantees

slug: recover-damaged-copy
category: recovery
difficulty: advanced
tags: recovery, integrity-check, incident, rpo, rto
prerequisites: bounded-storage-failure
safety: dangerous
run-in: mixed
sessions: 1
min-version: 3.53.4
minutes: 25
revision: 3

## Overview
Damage one leaf page of a lab copy, observe failed reads, then salvage readable key ranges into a separate output. Compare missing ranges with the intact source and inspect .recover as another recovery path. The point is to measure what survived, not to turn a successful salvage command into a recovery guarantee.

## Syntax breakdown
### In plain terms

This is a salvage experiment, not a promise that corruption is recoverable. We preserve the source, zero one leaf page in a copy, measure which reads fail, and copy only readable key ranges into a fresh destination. A structural recovery utility is attempted as additional evidence, while the intact source remains the authoritative comparison.

### What you are learning

- **Evidence preservation** — opening a hot or damaged file can change recovery artifacts, so copy before inspection.
- **B-tree locality** — intact interior routing can make ranges away from one damaged leaf readable.
- **Salvage versus guarantee** — recovered rows are counted and checked; only a verified backup supplies a stated RPO/RTO guarantee.

### Piece by piece

- **dbstat** (SQLite virtual table)
  - What it is: exposes page-level records such as object name, page number, and page type when enabled.
  - What it does here: counts observation leaf pages and selects a deterministic second leaf.
  - What it gives us: leaf_pages, damaged_leaf_page, and a page number for the byte edit.
- **PRAGMA page_size** (SQL diagnostic)
  - What it is: reports bytes per database page.
  - What it does here: converts a page number to a byte offset.
  - What it gives us: the dd seek calculation; do not assume the page size from an earlier lesson.
- **cp** (shell byte-copy program)
  - What it is: duplicates the source before the dangerous operation.
  - What it does here: creates the only file that will be modified.
  - What it gives us: preserved source evidence for the final integrity and row-count check.
- **dd if=/dev/zero ... bs=1 seek=... count=256 conv=notrunc** (shell byte editor)
  - What it is: reads zero bytes, writes a bounded 256-byte region at a byte offset, and preserves file length.
  - What it does here: damages one copy's selected leaf-page header.
  - What it gives us: a reproducible malformed-page failure without touching the source.
- **PRAGMA quick_check** (structural diagnostic)
  - What it is: a fast page/B-tree consistency check.
  - What it does here: observes the damaged copy before range salvage.
  - What it gives us: the page error and nonzero tool status expected from corruption.
- **WHERE id BETWEEN ...** (range predicate)
  - What it is: constrains each salvage query to a bounded primary-key interval.
  - What it does here: lets intact B-tree paths succeed while intervals touching the damaged leaf fail.
  - What it gives us: explicit chunk ... unreadable lines and a measurable omission set.
- **ATTACH FILE AS rec** (SQLite connection command)
  - What it is: opens a second database file in the same process under a schema name.
  - What it does here: inserts readable source rows into rec.observations.
  - What it gives us: an independent recovered file; it is not a repair of the damaged source.
- **.recover** (sqlite3 CLI recovery command)
  - What it is: asks the CLI's recovery extension to generate SQL from pages it can interpret.
  - What it does here: records availability and output size without trusting it as complete.
  - What it gives us: capability evidence and a second salvage path to compare with range salvage.
- **wc -l** (shell line-count utility)
  - What it is: counts newline-delimited output lines.
  - What it does here: measures generated recovery SQL without printing the whole artifact.
  - What it gives us: a positive line count when sqlite_dbpage is enabled.
- **PRAGMA integrity_check** (structural diagnostic)
  - What it is: validates the recovered and untouched source files.
  - What it does here: gates trust in the recovered destination and confirms source preservation.
  - What it gives us: ok plus row counts and min/max IDs for loss accounting.

## Caution
Only the reserved TUTOR_SQLITE_DB.damaged.db copy is byte-edited; reruns overwrite named damaged/recovered/recover-output lab artifacts. Preserve the original source and never point dd at it. Inspect errors from every salvage range: an unrelated execution error is not evidence of a corrupt range.

## Setup
```text
.print -- close every other sqlite3 session first: the next line must print delete
PRAGMA journal_mode=DELETE;
DROP TABLE IF EXISTS observations;
CREATE TABLE observations(id INTEGER PRIMARY KEY, reading TEXT NOT NULL);
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<3000)
INSERT INTO observations SELECT x, printf('reading-%04d', x) FROM n;
```

## Run
```text
-- Session A
.shell rm -f "$TUTOR_SQLITE_DB.damaged.db" "$TUTOR_SQLITE_DB.recovered.db" "$TUTOR_SQLITE_DB.recover.sql" "$TUTOR_SQLITE_DB.recover.err"
.shell cp "$TUTOR_SQLITE_DB" "$TUTOR_SQLITE_DB.damaged.db"
.shell sqlite3 "$TUTOR_SQLITE_DB.damaged.db" "SELECT 'leaf_pages=' || count(*) FROM dbstat WHERE name='observations' AND pagetype='leaf';"
.shell page=$(sqlite3 "$TUTOR_SQLITE_DB.damaged.db" "SELECT pageno FROM dbstat WHERE name='observations' AND pagetype='leaf' ORDER BY pageno LIMIT 1 OFFSET 1"); psz=$(sqlite3 "$TUTOR_SQLITE_DB.damaged.db" 'PRAGMA page_size'); echo "damaged_leaf_page=$page page_size=$psz"; dd if=/dev/zero of="$TUTOR_SQLITE_DB.damaged.db" bs=1 seek=$(( (page - 1) * psz )) count=256 conv=notrunc status=none
.shell sqlite3 "$TUTOR_SQLITE_DB.damaged.db" "PRAGMA quick_check; SELECT 'full_scan_rows', count(*) FROM observations;"
.shell sqlite3 "$TUTOR_SQLITE_DB.recovered.db" "CREATE TABLE observations(id INTEGER PRIMARY KEY, reading TEXT NOT NULL);"
.shell for start in $(seq 1 100 3000); do end=$((start + 99)); sqlite3 "$TUTOR_SQLITE_DB.damaged.db" "ATTACH '$TUTOR_SQLITE_DB.recovered.db' AS rec; INSERT INTO rec.observations SELECT id, reading FROM observations WHERE id BETWEEN $start AND $end;" 2>/dev/null || echo "chunk $start-$end unreadable"; done
.shell sqlite3 "$TUTOR_SQLITE_DB.recovered.db" "PRAGMA integrity_check; SELECT 'recovered_rows', count(*), min(id), max(id) FROM observations;"
.shell if sqlite3 "$TUTOR_SQLITE_DB.damaged.db" .recover >"$TUTOR_SQLITE_DB.recover.sql" 2>"$TUTOR_SQLITE_DB.recover.err"; then echo "recover_available=yes sql_lines=$(wc -l <$TUTOR_SQLITE_DB.recover.sql)"; else echo recover_available=no; head -c 120 "$TUTOR_SQLITE_DB.recover.err"; echo; fi
.shell sqlite3 "$TUTOR_SQLITE_DB" "PRAGMA integrity_check; SELECT 'source_rows', count(*) FROM observations;"
```

## Expected result
At 1 KiB pages the fixture has roughly 60 leaves; at 4 KiB roughly 15. The selected copied leaf produces malformed-page/quick_check errors and failed full scanning. Each unreadable 100-row range is omitted, so recovered rows equal 3000 minus 100 per failed range: validated examples were 2900 at 1 KiB and 2700 at 4 KiB. The recovered output is structurally ok; .recover generates nonempty SQL on this build but that line count is not recovered-row completeness. The intact source remains ok with 3000 observation rows.

## Systems lens
Surviving structure determines what salvage can reach, and coarse extraction boundaries can lose more rows than the damaged bytes alone would suggest. A validated backup plus a rehearsed retrieval/restore process supports a recovery objective; salvage is a contingent fallback. An integrity-valid restored replica may still need the history repair taught in module 08.

## Optional variation
Repeat Setup and Run on fresh lab copies, changing only the page-selection query in the byte-edit command to `SELECT rootpage FROM sqlite_schema WHERE name='observations' AND type='table'`. Retain the copied-file target, measured page size, 256-byte write and output cleanup. Damage to the table's root removes the routing used by every bounded range, so the chunk loop can no longer reach the intact leaves and the fresh recovered table has zero rows. The source must still pass integrity_check with 3000 rows. Inspect .recover separately; its SQL output length is not proof that the root-based range queries recovered anything.
