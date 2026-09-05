# Knowledge base

Findings from past work in this repository that are worth knowing before starting new work here.
Each file covers one topic and is written for the next agent or person, not as a changelog: what
was true, why it mattered, and how to apply it. Read this index first, open the files relevant to
your task, and add a new file when you finish work that taught you something another agent would
otherwise rediscover.

## Files

| File | What it covers |
| --- | --- |
| [repo-tooling.md](repo-tooling.md) | Deno location, scoped `fmt`/`lint`/`check` commands, formatter effects on Markdown, Docker test rig, and how to build a non-root test user. |
| [validation-harness.md](validation-harness.md) | How `tools/validate.ts` drives a course, why "completed" is not "passed", how to isolate parallel runs, and how to read evidence. |
| [subagent-workflow.md](subagent-workflow.md) | Directed delegation, owned files, evidence-based acceptance and primary writing/review across the Opus and Luna/high course passes. |
| [shell-lesson-gotchas.md](shell-lesson-gotchas.md) | Pitfalls in Bash lessons (Linux course): `String.raw` code fields, `set -e` leaks, relative `nice`, two-session coordination files, `sudo`/`as_root`, mounts in subshells. |
| [linux-evidence-and-variations.md](linux-evidence-and-variations.md) | Linux causal evidence, actual challenge validation, request/reply recovery, and sandbox versus lab capability boundaries. |
| [command-inventory-extraction.md](command-inventory-extraction.md) | How to derive a course's real command inventory from `lessons.json`, including the wrapper and quoting cases a naive grep misses. |
| [sqlite-lesson-gotchas.md](sqlite-lesson-gotchas.md) | SQLite feature probes, REPL quoting, page-size-dependent recovery, error classification, shell isolation and readiness-marker pitfalls. |
| [sqlite-curriculum-design.md](sqlite-curriculum-design.md) | Design SQLite as a second systems course and avoid false evidence in retry, checkpoint, benchmark, offline-history and toolkit experiments. |
| [lesson-identity-refresh.md](lesson-identity-refresh.md) | Preserve notes, completions and attempts when lessons move, retire or return; test refresh on copied progress. |
| [postgres-experiment-evidence.md](postgres-experiment-evidence.md) | Controlled database comparisons, visibility hints, reclamation boundaries, asynchronous statistics and exact rendered-command validation. |
| [postgres-observability-evidence.md](postgres-observability-evidence.md) | Wait samples, I/O scope/publication, nullable psql variables, timeout outcomes, index responsibilities and bounded log correlation. |
| [postgres-wal-recovery-evidence.md](postgres-wal-recovery-evidence.md) | WAL interval attribution, transaction outcomes, page-image representation and actual recovery evidence. |
| [postgres-replication-evidence.md](postgres-replication-evidence.md) | Owned physical topology, receiver lifecycle, replay/domain readiness and the boundary between transport and authority. |
| [postgres-logical-evidence.md](postgres-logical-evidence.md) | Physical/logical evidence, plugin/schema limits, atomic receiver receipts and source acknowledgement replay after crashes. |
| [postgres-durable-protocol-evidence.md](postgres-durable-protocol-evidence.md) | Outbox commits, idempotency races/retention, prepared decisions, process loss and verified recovery effects. |
| [postgres-lab.md](postgres-lab.md) | The disposable PostgreSQL lab cluster the course validates against and its one maintenance chore. |
| [postgres-project1-review.md](postgres-project1-review.md) | Review of unfinished PostgreSQL lessons 8–96 for systems engineering goals: consolidations, protocol and performance gaps, and source-backed corrections. |
| [progressive-course-design.md](progressive-course-design.md) | Flexible project scales, supplied-code coaching and progressive learner ownership; use when planning courses after the PostgreSQL pivot. |
| [prior-project-experience.md](prior-project-experience.md) | Pinned source review of Nick's quickspin and task-orchestrator repositories to identify coursework to omit or compress without copying his projects. |
| [learner-background-sources.md](learner-background-sources.md) | Website, résumé, and prior-reading context for calibrating depth, with self-reported experience distinguished from source-verified implementation. |
| [linux-database-integration.md](linux-database-integration.md) | Proposal for teaching selected Linux mechanisms inside PostgreSQL/SQLite and adapting the standalone Linux course without duplicating lessons or inferring completion. |

## Adding a finding

1. Create `docs/knowledge/<topic>.md` with a one-line summary at the top, then sections **What
   happened**, **Why it matters**, and **How to apply**. Use absolute dates, name files and
   commands exactly, and prefer one topic per file over one long file.
2. Add a row to the table above. Keep the description to one sentence that says when someone
   should open the file.
3. If a finding supersedes an existing file, update that file rather than adding a duplicate, and
   note the date of the change at the top.
4. Do not record what the repository already shows (code structure, git history, lesson text) or
   what only mattered to one session. Record the non-obvious part.
