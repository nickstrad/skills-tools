# Batch: format PostgreSQL Essentials SQL with sql-formatter

Delete this file only after the batch is complete, the final `update-knowledge-store` reflection is
done (including any resulting updates), and its removal is committed with the final batch changes.
If another batch adds a section here, keep it and label sections by batch.

## Objective

Apply the Formatting SQL rule (`curriculum-tools/docs/AUTHORING.md#formatting-sql`, root
`.sql-formatter.json`) to PostgreSQL Essentials. Editorial only: keep revisions, slugs, semantics.

## Current user instruction (2026-09-17)

- "do the postgres essentials lessons too" (after DuckDB and SQLite legacy were formatted and their
  live catalogs refreshed with approval). Live Essentials catalog refresh is not yet authorized.
- No model/delegation choice given: the primary agent works directly.

## Ownership and preservation

- Owned: `curriculum-tools/courses/postgres-essentials/lessons/*.md`, Essentials validation notes,
  this file. Not owned: the concurrent DuckDB `duck` -> `duckdb` edits (duckdb lessons/lab/README/
  validation, AGENTS.md, AUTHORING.md) by another session — never stage them.
- Preserve `/labs/pglab` (never use port 5440 or its socket), `curriculum-tools/tutor.sqlite`, and
  DuckDB fixtures on port 55439.

## Scope decisions

- Formatted: `sql` fences in the 22 psql lessons, plus the indented Optional-variation code blocks
  in lessons 7–9. Client commands verbatim; trailing `\gset`/`\gexec` kept on their query.
- Not formatted: shell lessons' one-line `--query '...'` arguments and lab Python/Go SQL strings.
- Tidy steps: lowercase `set`/`set local` one line, `filter (where x)` one line,
  `explain (...)`/`vacuum (...)` options on one line.

## Validation plan

Private PostgreSQL 16 cluster under an owned `/tmp/pg-essentials-fmt-*` root, its own socket and
port 55483. Copies of the original (HEAD) and formatted course with `course.json` pointed at it.
Four `tutor postgres-essentials validate` runs: core original/formatted, and variation-only copies
(Run = variation blocks) original/formatted. Diff normalized outputs. Then stop and remove the
cluster.

## Events

- 2026-09-17 02:20 — Tool extended (inline `\gset`, unterminated query + `\gexec`, indented
  variations, tidy steps); idempotence check on committed DuckDB/SQLite output showed only extra
  blank lines before `-- Session` after dot-commands (not applied to committed SQLite). Essentials
  formatted: 22 lessons; per-lesson `-- Session` and psql command counts unchanged; `check` OK.
- 2026-09-17 02:45 — Added tidy steps for `filter (where x)`, `explain`/`vacuum` options, aggregate
  `order by` and short calls, `drop table a, b`; reformatted from HEAD. Private cluster
  `/tmp/pg-essentials-fmt-NI0DXh` (port 55483). Original vs formatted: core 31/31 both, variations
  16/16 both; normalized diffs only interleaving (one earlier run had the other deadlock victim).
  Cluster stopped and removed. Render of lessons 8 and 23 checked with a temporary --db; Go
  render/route/course tests pass. AUTHORING tidy list extended (only this hunk staged; the other
  session's AUTHORING hunk left unstaged). Live catalog refresh still needs authorization.
