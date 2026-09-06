# PostgreSQL Essentials lessons 4–6

Updated 2026-09-06. User enjoyed the lesson/review flow in 1–3 and authorized the next three
lessons, Sol subagents where useful, parent validation/refactoring, and commits per reviewed chunk.

## Scope and ownership

- Follow `curriculum-tools/courses/postgres-essentials/PLAN.md`, rows 4–6 exactly.
- Preserve the two substantial views, concepts and diagram before commands, supplied syntax,
  mental reflection, optional references, and 20–30 minute total budgets.
- Parent owns integration, renderer, tests, validation controller, documentation, this handoff,
  final editorial/SQL review, and all commits.
- Sol authors will own one new curriculum file and one matching diagram export each. They must
  not edit shared files, generated catalogs, or learner progress. Parent registers/builds them.
- Design and acceptance contract: `curriculum-tools/courses/postgres-essentials/designs/04-06.md`.

## Initial state and preservation

The entire Essentials directory was untracked at turn start. Numerous prior changes already exist
in the original PostgreSQL renderer, launcher, skill, root/docs indexes and learner profile;
the gRPC course is also untracked. Preserve this work. Commit the existing Essentials baseline
separately so new lesson commits have readable diffs; do not sweep unrelated work into commits.
Initial HEAD: `f6e52c8`. No existing root handoff was present.

Verified outside the sandbox process namespace: learner PostgreSQL 16.15, original PID 348739,
`/labs/pglab/primary`, socket `/tmp`, port 5440, database `lab`. About 16 GB disk and 6.9 GiB memory
available. Private labs budget <200 MB each, <600 MB peak with three authors; no replicas/backups.
Do not interpret sandbox `pgrep` returning nothing as a stopped cluster.

Protected progress SHA256 before work:

- Essentials: `532af6e82f94ee7dbc05ad05050234c6d14d0f1b3eb0faa3a83ef6865309c87c`
- Reference: `395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6`

## Checkpoints

1. Preflight and existing course review completed; baseline/design preparation in progress.
2. Author lessons 4, 5, 6 in separate owned files; pending.
3. Parent review, real PostgreSQL runs and per-lesson commits; pending.
4. Six-lesson navigation/progress checks, durable findings, cleanup and learner readiness; pending.

## Resume and completion rules

Read repository AGENTS.md, docs/README.md, the curriculum-author skill and the design contract.
Inspect git status and agent messages before editing owned files. Use `/root/.deno/bin/deno` from
`curriculum-tools/`. Rebuild lessons.json; never hand-edit it. Validation must assert observed
outcomes and expected waiting, not just trust harness PASS. Use only uniquely owned private labs,
stop/remove them in finally, and preserve both progress databases. Before final completion,
recheck learner identity, progress hashes, disk headroom and absence of owned processes.
