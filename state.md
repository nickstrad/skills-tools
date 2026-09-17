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
- 2026-09-17 01:35 — DuckDB formatted: `sql` fences via the scratch segmenting formatter (dot/meta
  lines verbatim) with the root config; `lab/*.sql` (duckdb; `postgres.sql` with postgresql,
  `sqlite.sql` with sqlite); Bash-embedded SQL (manual `-c` strings, psql/sqlite3 checks, lesson 6–7
  prompt transcripts) and helper heredocs formatted with the tool, then pasted. Single-statement
  `-c "DESCRIBE SELECT ..."` one-liners left as they are. Hand fixes for formatter quirks:
  `TRY_CAST (`, standalone `SET\n  x = y;`, `GRANT\nSELECT\n  ON ...`, `postgres_query (` with an
  unformatted `$$` body (inner SQL formatted with -l postgresql and indented).
- 2026-09-17 01:40 — Drivers' exact-text wrong-choice/answer edits updated for formatted SQL, with a
  panic when an edit no longer applies. First run failed immediately: this shell inherited
  `DUCK_LAB` (the removed learner lab) and `session.sh` refused a second lab. Rerun under
  `env -u DUCK_LAB -u DUCK_DB -u DUCK_COURSE`: both drivers passed in full; no fixtures or
  PostgreSQL left. `tutor duckdb check` OK; lessons 5/7 rendered with a temporary --db.
- User asked (mid-batch) to save reusable formatter settings for postgres/sqlite/duckdb and the
  hand-formatting gaps in the knowledge store — do this in the final reflection.
- Knowledge-store notes so far: config lookup needs cwd inside the repo (a copy under the
  scratchpad silently used defaults — pass -c); quirks listed above; DUCK_LAB inheritance.
