# Knowledge base

Findings from past work in this repository that are worth knowing before starting new work here.
Each file covers one topic and is written for the next agent or person, not as a changelog: what was
true, why it mattered, and how to apply it. Read this index first, open the files relevant to your
task, and add a new file when you finish work that taught you something another agent would
otherwise rediscover.

## Files

Updated 2026-09-12 for the Go CLI. The current PostgreSQL path and its identity/validation rules are in
[postgres-essentials.md](postgres-essentials.md): 40 planned lessons, first 31 authored.
The legacy reference catalogs are publicly named `postgres-legacy`, `sqlite-legacy`, and
`linux-legacy`; their original IDs and paths remain compatibility aliases and storage identities.
Current course-planning policy is in [progressive-course-design.md](progressive-course-design.md):
small fixed Markdown routes, complete single-view lessons, explicit completion, self-contained context,
and shared Go tutor rendering. Proposed courses live under [`future-courses/`](../../future-courses/).

The historical workflow and schema acceptance records are archived under
[`archive/course-history/school/knowledge/`](../../archive/course-history/school/knowledge/). The
archive index owns their historical catalog entry.

| File                                                                           | What it covers                                                                                                                                                             |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [concise-course-cli.md](concise-course-cli.md) | Shared Go `tutor` route/lesson/done flow, Markdown plans, course discovery, the one progress database, and roadmap commands. |
| [go-tutor-migration.md](go-tutor-migration.md) | Shared database preservation, raw/refreshed parity, source archives, validation limits and accepted Go migration evidence. |
| [learner-work.md](learner-work.md) | Meaningful learner work and the all-course simple setup → focused work → easy cleanup contract. |
| [grpc-course.md](grpc-course.md) | Short gRPC/protobuf scope, direct walkthroughs, raw decoding, real-RPC acceptance and cleanup. |
| [duckdb-course.md](duckdb-course.md) | Shared setup helpers, pinned 1.5.5 connectors, source qualification/type boundaries, and exact-query validation for practical DuckDB. |
| [vm-resource-cleanup.md](vm-resource-cleanup.md)                               | VM resource budgets, verified ownership, bounded evidence retention, cleanup checkpoints and learner-lab readiness.                                                        |
| [repo-tooling.md](repo-tooling.md)                                             | Go checks, the cached launcher, shared progress path, Docker rig, and bounded validation resources. |
| [validation-harness.md](validation-harness.md)                                 | How `tutor <course> validate` drives sessions, why completion is not semantic evidence, and how to verify progress on a copy. |
| [subagent-workflow.md](subagent-workflow.md)                                   | Directed delegation, owned files, evidence-based acceptance, and primary review across course work. |
| [shell-lesson-gotchas.md](shell-lesson-gotchas.md)                             | Pitfalls in Bash lessons (Linux course): `String.raw` code fields, `set -e` leaks, relative `nice`, two-session coordination files, `sudo`/`as_root`, mounts in subshells. |
| [linux-evidence-and-variations.md](linux-evidence-and-variations.md)           | Linux causal evidence, actual challenge validation, request/reply recovery, and sandbox versus lab capability boundaries.                                                  |
| [command-inventory-extraction.md](command-inventory-extraction.md)             | How to derive a course's real command inventory from Markdown Setup/Run blocks or `tutor list --json`, including shell quoting cases a naive grep misses. |
| [sqlite-lesson-gotchas.md](sqlite-lesson-gotchas.md)                           | SQLite feature probes, REPL quoting, page-size-dependent recovery, error classification, shell isolation and readiness-marker pitfalls.                                    |
| [sqlite-curriculum-design.md](sqlite-curriculum-design.md)                     | Design SQLite as a second systems course and avoid false evidence in retry, checkpoint, benchmark, offline-history and toolkit experiments.                                |
| [lesson-identity-refresh.md](lesson-identity-refresh.md)                       | Preserve notes, completions and attempts when lessons move, retire or return; test refresh on copied progress.                                                             |
| [postgres-experiment-evidence.md](postgres-experiment-evidence.md)             | Controlled database comparisons, visibility hints, reclamation boundaries, asynchronous statistics and exact rendered-command validation.                                  |
| [postgres-observability-evidence.md](postgres-observability-evidence.md)       | Wait samples, I/O scope/publication, nullable psql variables, timeout outcomes, index responsibilities and bounded log correlation.                                        |
| [postgres-wal-recovery-evidence.md](postgres-wal-recovery-evidence.md)         | WAL interval attribution, transaction outcomes, page-image representation and actual recovery evidence.                                                                    |
| [postgres-replication-evidence.md](postgres-replication-evidence.md)           | Owned physical topology, receiver lifecycle, replay/domain readiness and the boundary between transport and authority.                                                     |
| [postgres-logical-evidence.md](postgres-logical-evidence.md)                   | Physical/logical evidence, plugin/schema limits, atomic receiver receipts and source acknowledgement replay after crashes.                                                 |
| [postgres-durable-protocol-evidence.md](postgres-durable-protocol-evidence.md) | Outbox/idempotency, prepared decisions, resource fencing and durable notification reconciliation across actual process loss.                                               |
| [postgres-incident-evidence.md](postgres-incident-evidence.md)                 | Staged diagnosis, recovery boundaries, freeze eligibility, request intervention, task-runner reconciliation, bounded overload and fixture cleanup.                         |
| [postgres-refactor-integration.md](postgres-refactor-integration.md)           | Final course/source/evidence audit, stable identities, selective archive reads, scoped gap validation and cleanup before completion.                                       |
| [postgres-lab.md](postgres-lab.md)                                             | Learner lab identity and pglab.service, learner versus author cluster paths, and resource lifecycle.                                                                       |
| [postgres-coaching-pilot.md](../../archive/course-history/postgres/knowledge/postgres-coaching-pilot.md) | Four-lesson coaching rollout, conversational feedback boundary, command-preservation checks and learner-catalog limits. |
| [PostgreSQL coaching flow review](../../archive/course-history/postgres/designs/08-coach-flow-navigation.md) | Lesson-8 UX findings, proposed self-contained coaching, informal reflection and bounded lesson-time estimates; implementation remains pending.                             |
| [postgres-project1-review.md](../../archive/course-history/postgres/knowledge/postgres-project1-review.md)                     | Review of unfinished PostgreSQL lessons 8–96 for systems engineering goals: consolidations, protocol and performance gaps, and source-backed corrections.                  |
| [progressive-course-design.md](progressive-course-design.md)                   | Concise route planning, complete lesson output, terminal diagrams, shared CLI rendering, and explicit completion.                                                         |
| [prior-project-experience.md](prior-project-experience.md)                     | Pinned source review of Nick's quickspin and task-orchestrator repositories to identify coursework to omit or compress without copying his projects.                       |
| [learner-background-sources.md](learner-background-sources.md)                 | Website, résumé, and prior-reading context for calibrating depth, with self-reported experience distinguished from source-verified implementation.                         |
| [linux-database-integration.md](linux-database-integration.md)                 | Proposal for teaching selected Linux mechanisms inside PostgreSQL/SQLite and adapting the standalone Linux course without duplicating lessons or inferring completion.     |

## Adding a finding

1. Create `docs/knowledge/<topic>.md` with a one-line summary at the top, then sections **What
   happened**, **Why it matters**, and **How to apply**. Use absolute dates, name files and commands
   exactly, and prefer one topic per file over one long file.
2. Add a row to the table above. Keep the description to one sentence that says when someone should
   open the file.
3. If a finding supersedes an existing file, update that file rather than adding a duplicate, and
   note the date of the change at the top.
4. Do not record what the repository already shows (code structure, git history, lesson text) or
   what only mattered to one session. Record the non-obvious part.
