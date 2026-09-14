# Simple setup and catalog rollout

Verified 2026-09-14 on pinned DuckDB 1.5.5 and existing PostgreSQL/SQLite tools, following
[the lesson workflow](../../../../docs/lesson-batch-workflow.md). Supersedes helper guidance
that required inline SQL-file creation or supported only lessons 2–5.

## Delivered behavior

All five Setup blocks contain only `source .../lab/session.sh N`. Setup supplies fixtures,
editable SQL starters, connection/staging SQL and initial source observations. `duck_run`
reads the learner's current query; lesson 2 persists local.duckdb, while the other lessons
use fresh in-memory sessions. `duck_cleanup` removes the owned fixture. Learner decisions
and expected results are unchanged, so this mechanical refactor retains revisions and identities.

The shared rule is recorded in AGENTS.md, AUTHORING.md, both installed repository skills,
the learner profile and docs/knowledge/learner-work.md. Other courses are guidance-only scope;
this change does not claim their existing lessons have been converted.

## Evidence

- `bin/tutor duckdb check`: five lessons pass; Bash syntax and `git diff --check` pass.
- `go run ./courses/duckdb/validation`: all 15 independent starter, answer and wrong-choice
  trials pass; both shared five-lesson sequences pass. See results.txt. Lesson 4 alone produces
  the intended scanner type error; the helper rejects other failures.
- Separate lifecycle checks preserve cwd, shell options and an existing EXIT trap. Second
  setup refuses to replace edited query.sql. Repeated duck_run reads the same edits; missing
  input and SQL failures return nonzero. Explicit/repeated cleanup and ordinary exit remove
  owned fixtures; duck_run after cleanup fails clearly.
- All five outputs rendered on a refreshed catalog copy, then on the authorized live catalog,
  show one-command setup, duck_run and duck_cleanup. Copy progress verification reports
  266 lesson identities, 40 progress rows and 41 attempts preserved.
- Exact logical dumps of progress, attempts and roadmap tables match before and after both
  refreshes. DuckDB remains 1 done, 4 todo, 0 skipped, 0 stale. Live refresh used
  `bin/tutor duckdb init`; no direct database editing or completion operation was used.
- `bin/tutor install --check` passes for Codex and Claude shared skill links.

The manifest records final sources. Prose clarifications after the real-tool run do not change
accepted Setup/Run/answer commands. Native-client trailing whitespace was removed from saved
evidence without changing values.

## Cleanup and durable guidance

All owned fixture servers/directories were removed. Persistent PostgreSQL services remain
intentionally stopped; no PostgreSQL process remains. Root has about 142 GiB free.

Knowledge-store reflection updated and reread `data/duckdb-course-tools.md` and
`data/pgcoach-course-authoring.md` through kb. They document starter creation, duck_run,
the shared lifecycle contract and stored-catalog refresh. Both entries were reindexed successfully.
