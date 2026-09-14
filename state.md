# DuckDB CLI practice revision

Latest scope (2026-09-14): user requests both "Setup - script" and "Setup - manual", with
the choice a shared convention across courses. Apply now to DuckDB 1–5, preserving automatic
folder/fixture preparation in both paths and keeping explicit Run commands. Add generic setup
choices to the existing Setup text field (no database schema/progress migration), parser/renderer/
harness support and tests. Validate both choices on real tools. Update shared skills/template,
guidance and knowledge entry; refresh live catalog only after new copy-based checks.
The prior CLI-only implementation/rollout is an intermediate checkpoint, not final acceptance.
Knowledge-store edit was interrupted/rejected by sandbox; reread confirmed the entry unchanged.

Final acceptance checkpoint:
- Both setup choices implemented and rendered for DuckDB 1–5; shared format/renderer/harness,
  template, skills and course-wide guidance updated. All Go tests passed.
- New driver passed 30 script/manual × starter/answer/wrong trials and both shared 5/5 sequences.
  All 24 manifest hashes verified; every recorded fixture path absent; installed CLI/connectors ready.
- Refreshed live catalog after copy checks. All five body renders match; all 40 progress and 41
  attempt rows exactly match original dumps. DuckDB remains 1 done / 4 todo, no skipped/stale.
- Knowledge updates succeeded and were reread: data/duckdb-course-tools.md and
  data/pgcoach-course-authoring.md. Shared skills are installed through repository symlinks.
- Durable acceptance appended to courses/duckdb/validation/batch-one.md. Latest headroom:
  142 GiB free, 2% inodes, 6.8 GiB available RAM. No visible PostgreSQL process remains.
- Remaining: commit checkpoint, remove owned 5.2 MiB scratch/copy/editor directory, delete this log,
  commit final removal, and verify only the intentionally uncommitted learner database remains.

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

- 2026-09-14: live tutor catalog refreshed after copy validation; exact progress/attempt dumps
  match baseline. Full rendering comparison initially differed only in the CLI's expected
  temporary --db suffix on done/skip suggestions; compare lesson bodies without these footer lines.
- 2026-09-14: user clarified wanting DuckDB-oriented practice and asked for a list of operations
  still hidden. Answered with LOAD/ATTACH, catalog inspection, scanner setting, raw staging,
  deliberate failure scan and CSV DESCRIBE. Recorded this boundary in profile/repository knowledge;
  no new lesson tasks or route scope inferred from the request to list them.
