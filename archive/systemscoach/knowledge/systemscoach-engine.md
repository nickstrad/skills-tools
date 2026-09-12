# Systemscoach project builder

Created 2026-09-09. [Entry point](../README-original.md),
[skill](../SKILL.md),
[format](../docs/format.md).

## Current concise contract (2026-09-12)

Future systems projects begin as inexpensive Markdown routes under
[`future-courses/`](../../../future-courses/). Planning records the bounded mechanism, stable slugs,
meaningful learner work, outcomes, visual teaching plan, and exclusions; it does not create a
project JSON route, scaffolding, lab, or validation suite. Only after agreement and an
implementation request is the plan converted into Systemscoach's existing `project.json` and
project-local `PLAN.md`. Existing projects, routes, and completion receipts are not migrated.

New lessons target 10–15 minutes, including a meaningful command/edit/investigation, small attempt,
evidence, interpretation, and cleanup. Existing 15–25-minute metadata remains valid history. The
`lesson` output is complete: it teaches the mechanism and useful terminal diagram before the task,
then includes evidence guidance, interpretation, an “attempt first” worked reference, and cleanup.
Existing `review.md` content was merged into `lesson.md`; the file reader has been removed.
`review` remains a read-only command alias for that same complete lesson. Only explicit `done` writes the project engine's JSON
receipt.

## Ongoing systems knowledge

The dedicated [systems knowledge store](README.md) is the
cross-project entry point for measured systems-course findings. Read it before new systems work;
after each completed task/batch, update the relevant note and index with evidence, limits and
cleanup implications. Source research stays beside its project, per-batch validation stays in the
project's validation folder, and reusable lessons link those records from the store. Root knowledge
continues to hold guidance shared with the tool tutors. Nick explicitly requested this ongoing
knowledge practice on 2026-09-09.

## Course discovery and Bash entry point (2026-09-09)

Bare `systemscoach` and its `courses`, `list`, and `topics` commands list systems-project courses,
their draft/approved status, available/total counts and route/start commands without writing state.
`systemscoach lesson` retains explicit selected-course behavior. Keep valid lesson actions separate
from reserved top-level command names: using one expanded predicate for both accidentally admitted
top-level words as Markdown view names; a regression test now rejects that form.

The launcher can find the shared `/usr/local/go/bin/go` installation when `go` is absent from PATH.
It no longer borrows the retired gRPC toolchain or its course-local caches. The
user's Bash configuration includes idempotent PATH entries for the launcher and toolchain; fresh
interactive Bash and direct launcher calls work from `/tmp` with a minimal initial PATH. This does
not require an alias or alter course selection/progress. Go remains a prerequisite on other hosts.

During this task, PostgreSQL Essentials progress changed with a manual lesson-13 completion at
2026-09-09T03:35:32Z. Systems tests used isolated state; the other progress hashes matched.
Preserve concurrent learner activity: inspect changed timestamps/status read-only rather than
restoring a baseline or claiming every file stayed byte-identical. Record the exception and whether
any task command wrote that database.

## Initial builder design and why

The learner requested a separate systems-project track inspired by engineering write-ups. The
initial 2026-09-09 design used a 15–25-minute lesson/review flow while still planning the smallest
useful project rather than a tool tour. The current contract above supersedes that presentation and
pacing policy without rewriting historical estimates. Native CLIs do the real work; supplied
plumbing lets necessary learner Go focus on structures and protocol decisions. Deno is second
choice. This track is not subject to pgcoach's Deno client preference merely because a project
contains PostgreSQL.

The user supplied all contents of an ideas document, so no Drive fetch or bulk source research was
needed to preserve it. All 15 examples and their links are in
[project-ideas.md](../docs/project-ideas.md), with provenance and distinction
between proposed approximations and verified claims. No project was selected or course authored by
this initial builder task. The document's suggested sequence and written postmortem are optional.

## Engine and progress choices

`systems-projects/` contains a dependency-free Go CLI and hand-authored route JSON / Markdown views.
It does not alter the Deno tutor engine, generated catalogs or existing SQLite progress. This avoids
forcing multi-service project experiments through tool-specific lesson execution adapters. Standard
library Go 1.24+ suffices; validation used Go 1.26.8 from the existing gRPC tool installation.

The launcher resolves symlinks back to this checkout. `install.sh` links it to `/usr/local/bin` and
the skill to `${CODEX_HOME:-$HOME/.codex}/skills`, or explicit alternate directories. It checks both
for collisions before creating links and never replaces unrelated files. A directly invoked compiled
binary needs SYSTEMSCOACH_ROOT set; the launcher sets that automatically.

`systemscoach <topic> route` shows the full approved implementation agenda, availability, and
completion. `use <topic>` explicitly chooses the default. `[<topic>] N lesson` renders the complete
lesson; `review` is a compatibility alias and neither form runs the exercise nor changes progress.
`N done` is the only completion operation and requires a number plus authored availability.
Automatic selection stops at the first unfinished planned step.

Completion identity is topic + stable slug + revision. Small per-lesson JSON receipts are atomically
published with a no-replace hard link from a temporary file in the same directory. This keeps
concurrent completions from losing updates to a shared mutable JSON file. Repeated completion keeps
the original receipt; changed revisions need new completion while preserving history. This is a
local Linux storage choice, not distributed coordination or a general database durability claim.
All tests override roots/state with temporary directories; read-only views create no progress files.

`check` rejects invalid routes, draft publication, missing lesson content, duplicate slugs, forward
prerequisites and out-of-budget lessons. It checks structure, not source claims or experiment
correctness. Authors must run and inspect real effects before setting availability.

## Validation and resource lifecycle

The initial implementation is checked with `go test -race ./...`, `go vet ./...`, launcher smoke
checks, installer collision/idempotence tests and skill validation. Tests cover explicit progress,
unchanged read views, topic isolation, stable identity under reordering, revision refresh, draft and
planned boundaries, and concurrent receipt publication. Runtime fixtures use Go test temporary
directories, which are removed automatically; no database or service topology is started for the
builder tests. Repository-level docs received additive links; pre-existing edits remain separate.

Root AGENTS applies to this folder; a short local AGENTS plus CLAUDE symlink links the resource,
shell, validation, progress-identity and lab-ownership findings. Do not copy stale cleanup allowlists
or infer disposability from similar paths. Restricted sandbox process visibility may make pgrep
empty even while the live learner database is reachable: query its actual data_directory read-only.

At the initial preflight / had approximately 16 GB free and 6.8 GiB memory available. The learner's
PostgreSQL lab answered at /tmp port 5440, database lab, data_directory /labs/pglab/primary, primary
role. Final checks and installed-path verification are recorded below.


## Final builder acceptance (2026-09-09)

- Installed `/usr/local/bin/systemscoach` and `/root/.codex/skills/systemscoach` resolve to this
  checkout. `systemscoach topics` and `--help` work from /tmp, outside the repository. The installed
  skill passes its validator; local Markdown links resolve and all 15 supplied candidates are saved.
- All eight Go test groups pass with the race detector, including 30 concurrent receipt writes;
  go vet and shell syntax checks pass. Installer tests prove idempotent links and preservation of
  a conflicting pre-existing skill without a partial second installation.
- No actual systems course has been selected, approved or authored; project experiment validation
  belongs to future batches. No learner completion/selection state was created during this task.
- Final filesystem has about 16 GB free; memory available is about 6.8 GiB. The builder occupies
  about 150 KB of source/docs. Go tests removed their temporary fixtures. The one temporary staged
  documentation patch was removed; no service/lab/volume was allocated or retained. Useful Go build
  caches remain; there is no outstanding evidence-retention obligation.
- A read-only query confirmed `lab|/labs/pglab/primary|f|1`. The final query needed the already allowed
  psql escalation because the sandbox denied the Unix socket; no learner-cluster mutation was needed.
  SHA256s of all five learner progress databases and the existing PostgreSQL WAL/SHM files exactly
  match preflight. The unrelated root handoff and working-tree changes are preserved.
- Temporary systems-projects/handoff.md was committed at checkpoints 524e4a1 and 0798c04, then removed
  in the completion commit as requested. Those commits retain the resumable work history.
