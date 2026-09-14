# DuckDB CLI practice revision

Objective: revise authored lessons 1–5 and durable guidance so the learner executes visible
DuckDB CLI commands while helpers retain recurring setup/cleanup. User explicitly requests
repository/knowledge-store updates and rollout of the currently authored lessons.

Ownership: primary agent only; no delegation. Owned files: DuckDB lessons, session helper,
course README and validation evidence; learner profile, shared learner-work guidance,
authoring contract, canonical DuckDB route feedback, repository DuckDB knowledge, and this log.
Preserve the pre-existing modified `curriculum-tools/tutor.sqlite`; only refresh its catalog
through tutor after isolated checks. Preserve all progress/attempts, legacy backups and labs.

Baseline 2026-09-14: 142 GiB free, 7.2 GiB available memory, 2% inodes used; no visible
PostgreSQL processes. Persistent PostgreSQL services intentionally stopped per current knowledge;
do not restart them. `/labs/pglab` retained. CLI cache 148 MiB; serial validation budget <500 MiB.
Learner DB SHA256: be1e3aec2379a3ced6670d65df950e69d770f6877070034e09c759d9acf411dc.
DuckDB status: 1 done, 4 todo, 0 skipped/stale. No other tracked changes initially.

Design: lessons 1–4 pipe session.sql then query.sql into `duck` with explicit database and
flags; lesson 5 redirects query.sql directly. Explain inputs, connection lifetime and supplied
starters. Keep query tasks, SQL outcomes, slugs and revisions (mechanical invocation revision).
Update setup's printed run hint; retain duck_run for existing sessions/compatibility.

Events:
- 2026-09-14: read authoring/tutor/knowledge skills, repository guidance, route and current sources.
  Confirmed existing Go validator exercises actual Run blocks with starters, answers and wrong choices.

- 2026-09-14: revised five lessons and setup's printed command, retained compatible duck_run.
  Updated profile, shared authoring norm, course README/route feedback and repository knowledge.
- 2026-09-14: structural check and Bash syntax passed. Full existing Go driver accepted all
  15 independent starter/answer/wrong trials plus 5/5 shared starters and 5/5 worked sequence.
  Peak fixture 40,280 KiB; fixtures cleaned after each run. Latest logs/manifest are course-local.
- 2026-09-14: progress verify passed on a copy (266 lesson identities, 40 progress, 41 attempts).
  Refreshed separate `/tmp/duckdb-cli-practice-20260914/catalog.sqlite`, inspected all five
  rendered Run blocks, and compared exact progress/attempt dumps unchanged.

Remaining: authorized live refresh and rendered verification; durable knowledge reflection/update;
final resource/manifest checks and scratch cleanup. Scratch copy/output lives only under
`/tmp/duckdb-cli-practice-20260914`, to be removed before completion.
Delete this log only after completion and knowledge-store reflection, committing its removal.
