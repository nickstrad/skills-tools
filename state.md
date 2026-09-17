# Batch: format existing SQL with sql-formatter

Delete this file only after the batch is complete, the final `update-knowledge-store` reflection is
done (including any resulting updates), and its removal is committed with the final batch changes.

## Objective

Apply the new "Formatting SQL" rule (`curriculum-tools/docs/AUTHORING.md#formatting-sql`,
root `.sql-formatter.json`) to existing course SQL: first the DuckDB course, then the SQLite
courses. Formatting is editorial-only: keep revisions, slugs, semantics and expected evidence.

## Current user instructions (2026-09-17)

- "just do duckdb lessons first since im working on that now, and then do sqlite courses"
- "clean up the lesson 5 lesson stuff im doing and fix that too" — the learner's live lesson 5 lab
  `/tmp/duckdb-lesson.k2KjPd` (unedited starter) was removed with `lab/cleanup.sh`. Their shell
  still has `DUCK_LAB` set; tell them to use a fresh terminal.
- No model/delegation choice given: the primary agent does the work directly.

## Ownership and preservation

- Owned: DuckDB `lessons/*.md`, `lab/*.sql`, SQL heredocs in `lab/*.sh`, `validation/**`;
  SQLite course lessons and lab SQL (phase 2); this file.
- Preserve: `curriculum-tools/tutor.sqlite` (modified learner progress, not ours — never stage it),
  `/labs/pglab`, unrelated work.
- Catalog rollout (`tutor duckdb init` on the live DB) is not yet authorized; ask before doing it.

## Baselines

- Disk 139 G free, memory 6.5 G available, no PostgreSQL running, no DuckDB labs after cleanup.
- `tutor check` OK for all courses before edits.

## Plan / remaining work

1. DuckDB: format `sql` fences (starters, worked answers), `lab/*.sql`, SQL in Bash fences
   (manual setup `-c` strings, psql/sqlite3 strings, lessons 6–7 interactive transcripts) by hand.
2. Update exact-text replacements in `validation/main.go` and `validation/batchtwo/main.go`.
3. Run both drivers (real PostgreSQL/SQLite fixtures); they regenerate results and manifests.
4. `tutor duckdb check`, rendered-lesson check with a temporary `--db`, cleanup, commit.
5. SQLite courses: inventory, format, validate, commit.
6. Knowledge-store reflection, delete this file, final commit.

## Events

- 2026-09-17 01:20 — Guidance committed (AGENTS.md, AUTHORING.md, curriculum-author skill,
  `.sql-formatter.json`). Learner lesson 5 lab removed at the learner's request.
