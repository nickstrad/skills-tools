# Systemscoach project builder

Created 2026-09-09. [Entry point](../../systems-projects/README.md),
[skill](../../systems-projects/skills/systemscoach/SKILL.md),
[format](../../systems-projects/docs/format.md).

## What changed and why

The learner requested a separate systems-project track inspired by engineering write-ups. It borrows
the current 40-lesson PostgreSQL Essentials lesson/review experience, with 15–25 minutes per lesson,
but plans the smallest useful project rather than a tool tour or fixed course size. Topic interview
and agreement on the complete agenda precede lesson authoring; later lessons are produced only in
requested small batches. Native CLIs do the real work; supplied plumbing lets necessary learner Go
focus on structures and protocol decisions. Deno is second choice. This track is not subject to
pgcoach's Deno client preference merely because a project contains PostgreSQL.

The user supplied all contents of an ideas document, so no Drive fetch or bulk source research was
needed to preserve it. All 15 examples and their links are in
[project-ideas.md](../../systems-projects/docs/project-ideas.md), with provenance and distinction
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

`systemscoach <topic> route` shows the full draft/approved agenda, availability and completion.
`use <topic>` explicitly chooses the default. `[<topic>] N lesson|review` only renders; it neither
runs the exercise nor changes progress. `N done` is the only completion operation and requires a
number plus authored availability. Automatic selection stops at the first unfinished planned step.
After done, use an explicit number to review that completed lesson.

Completion identity is topic + stable slug + revision. Small per-lesson JSON receipts are atomically
published with a no-replace hard link from a temporary file in the same directory. This keeps
concurrent completions from losing updates to a shared mutable JSON file. Repeated completion keeps
the original receipt; changed revisions need new completion while preserving history. This is a
local Linux storage choice, not distributed coordination or a general database durability claim.
All tests override roots/state with temporary directories; read-only views create no progress files.

`check` rejects invalid routes, draft publication, missing views, duplicate slugs, forward
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
role. Final checks and installed-path verification are recorded below at builder completion.
