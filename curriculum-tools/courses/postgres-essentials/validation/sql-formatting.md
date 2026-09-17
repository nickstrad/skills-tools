# SQL formatting revision — 2026-09-17

The `sql` fences in the 22 psql lessons and the indented Optional-variation code blocks in lessons
7–9 were reformatted with sql-formatter (see
[Formatting SQL](../../../docs/AUTHORING.md#formatting-sql)). psql commands stay verbatim; a
trailing `\gset`/`\gexec` stays attached to its query. Layout fixes were applied for standalone
`set`/`set local`, `filter (where ...)`, `explain`/`vacuum` options, `drop table a, b` and short
function calls. Shell lessons' one-line `--query` arguments and the lab Python/Go SQL are unchanged.
The change is editorial: revisions, slugs, tasks and expected evidence are unchanged. Every lesson
keeps the same number of `-- Session` headers and psql commands.

## Validation

A private PostgreSQL 16.15 cluster (owned `/tmp/pg-essentials-fmt-*` root, its own socket, port
55483, fsync on) served copies of the original (HEAD) and formatted course whose `course.json`
pointed at it; the repository `course.json` and `/labs/pglab` were not used. The `lab` database was
recreated before each run.

| Run | Original | Formatted |
| --- | -------- | --------- |
| `tutor postgres-essentials validate` (core; shell lessons are skipped) | 31/31 | 31/31 |
| Variation copy: Run = each tool lesson's Optional-variation code, no Setup (7–9, 12–24) | 16/16 | 16/16 |

After normalizing paths, numbers, LSNs and column padding, the outputs differ only in the
interleaving of the two sessions' lines. An earlier formatted run also chose the other deadlock
victim in lesson 14, which that lesson treats as nondeterministic. No `!!` step failures occurred.
The cluster was stopped and removed; no PostgreSQL process remained.
