# Cursor Git batch 1 acceptance — 2026-09-09

Scope: approved lessons 1–3, course discovery, Bash availability and ongoing systems knowledge.
Lessons 4–8 remain planned. Primary designed the batch and reviewed all teaching/code; bounded Sol
assignments implemented discovery/Bash and lesson 1. Primary implemented the lab and lessons 2–3,
then independently executed all rendered lessons. Followed the
[repository batch workflow](../../../../../docs/lesson-batch-workflow.md).

## Reproduction and source correspondence

[run-rendered.sh](run-rendered.sh) extracts every shell fence and runs the exact lesson commands
in order, adding failure cleanup. It never writes progress. Primary inspected actual results;
successful script exit alone is insufficient. [verify-backend.sh](verify-backend.sh) checks the
storage primitive and lifecycle independently. Both validators were run. The
[source manifest](source-sha256.txt) binds all six pages, lab scripts and validators to this evidence.

Versions: Git 2.43.0, SeaweedFS 4.46 (`d997fba1575583a89cf0cc50dc0150642286c86d`), Go 1.26.8.
The pinned archive SHA256 matches release metadata. After extracting/checking the binary, the
archive was removed. The reusable 142 MiB installation remains at
`/root/.local/share/systemscoach/tools/seaweedfs-4.46/`; its installer verifies the installed hash.

## Measured lessons

| Lesson | Inspected evidence | Result |
| --- | --- | --- |
| 1 | [Output](lesson-1-output.txt): `index-pack` installs A; `cat-file` returns commit while refs remain empty. Conditional ref creation names A. B imports, but expected-base ref update fails; final `show-ref` still names A. | Payload and ref publication are separate. |
| 2 | [Output](lesson-2-output.txt): pack/record each return HTTP 200; downloaded pack hash matches. Index stays generation 0/base-only before publication. Conditional PUT returns 200; GET shows generation 1 and records/a.json. Old-token retry returns 412 with unchanged history. | Upload success is not publication; the guarded index replacement determines accepted history. |
| 3 | [Output](lesson-3-output.txt): each race has one 200/one 412. Fresh index contains the winner at entry 1 and no loser. Same-branch retry preparation exits 3 with ref-conflict. Independent-branch retry returns 200, generation 2 contains base and both operations, with both correct branch tips. | Refresh shared history and independently revalidate original application preconditions. |

Fixed commit OIDs: base `e620faabc0b2fa21512bf0be43e53561a0dfe845`,
A `af073e00db03de2c46604ea4d9a60d271c7f5adf`, B `36a3830268c2f25ee88bc550182593a1a4111f61`.
A's pack SHA256 is `813a0a0603d7eabe6dc8e2bf35b308c71ba91f414b791fbd56232f6b9f64f984`.
Winner identity can vary; exactly one accepted replacement per observed token is the invariant.

Unattended commands took under one second for lesson 1, about 16 seconds for lesson 2 and 36 seconds
for lesson 3, including startup/cleanup; final run timings are in the output tails. These are not
learner timings. The 20/20/25-minute teaching estimates include explanation, predictions, inspection,
review and cleanup, pending feedback. One-time installation has a separate 10–20-minute allowance.

## Independent backend and lifecycle checks

[Backend output](backend-output.txt) records create-if-absent rejection (412), unchanged conditional
GET (304), and changed conditional GET (200 with the new history). Six more client pairs used a
shared initial ETag, reversing launch order on alternate rounds. Each returned one 200/one 412;
stored content matched its winner. These samples are evidence of local behavior, not a proof of
distributed correctness.

Starting a competing lab refused occupied ports without touching the existing store or leaving a
new root. After normal restart, both the published index and pack matched their original bytes.
Eight TCP listeners were observed on 127.0.0.1. Recorded RSS was 178,412 KiB and allocated fixture
disk 776 KiB after restart: point observations, not instrumented peaks. The conservative budget
was 2 GiB disk / 1.5 GiB RAM, including downloads, executable, metadata, packs and copies. Volumes
are capped at eight 16 MiB units with preallocation disabled.

An additional objects-only fixture named the learner postmaster PID as if owned; cleanup refused
with `ownership does not match`, leaving that process and fixture intact. After removing the fake
PID file, the owned fixture was cleaned normally. Learner readiness still passed.

Earlier trials found mini admin listeners despite disabling its UI, a short shutdown allowance,
and listing readiness before data readability on restart. Final stable-source checks passed after
fixes. [Shared findings](../../../knowledge/object-store-git-labs.md) preserve the causes and
tested corrections. Earlier scratch inputs are retired, not acceptance dependencies.

## CLI, shell and knowledge

`go test -race ./...`, `go vet ./...`, shell syntax, skill validation and diff checks pass. Regression
coverage includes aliases, multiple draft/approved courses, counts, empty catalogs, reserved words
and invalid action positions. Existing progress/concurrent-receipt tests still pass.

Bare `systemscoach` and `courses`, `list`, `topics` list courses and navigation. Fresh interactive
Bash from `/tmp` with a minimal initial PATH resolves systemscoach and Go. `/root/.bashrc` has
idempotent PATH additions; the launcher also finds the repository toolchain when PATH lacks Go.

`check cursor-git` passes. Route shows three available/five planned; all six lesson/review views
render. Read commands leave isolated state empty. Simulated completion of 1–3 in temporary state
stops at planned lesson 4, which cannot be marked complete. No real systemscoach state was created.

The [systems knowledge store](../../../knowledge/README.md) indexes reusable evidence and
shared repository guidance. The installed skill, local AGENTS and design/authoring workflows require
reading it before work and updating it after completed tasks, as Nick requested.

## Cleanup and learner readiness

All owned labs, processes, temporary CLI state and scratch inputs are removed. Retain only these
small tracked reports/scripts/output files and the reusable tool installation. No pack/database
image needs retention. Old /tmp paths in logs are provenance, not instructions to recreate data.
Final headroom: about 16 GB disk and 6.8 GiB available RAM. Read-only readiness returned
`lab|/labs/pglab/primary|f|1` on the original server at `/tmp`, port 5440.

PostgreSQL reference, SQLite, Linux and gRPC progress hashes plus reference PostgreSQL WAL/SHM match
preflight. PostgreSQL Essentials changed during the task: read-only inspection found a manual
lesson-13 completion at `2026-09-09T03:35:32.357Z`. Its hash changed from
`527d5197e36b67f71bfffebe65ffb6a2bbc201025c8b751c2cc59c6bc8087fca` to
`e8f78836617203fe2adf13d1b45a775d1b031d228d3008640d1c5f86e53ab405`.
No task command wrote it. The concurrent completion is preserved; the baseline was not restored.
Unrelated repository edits remain intact.

## Limits and next boundary

These are trusted tiny full-pack fixtures with JSON branch preconditions and native CLIs, not a
complete Git network push implementation, multi-host durability test or production scaling evidence.
Prepared Git ref-transaction integration, operation-ID reconciliation and replay are not claimed as
implemented. Lessons 4–6 are the next proposed batch, only when requested.

## Later source layout migration — 2026-09-12

The original run above used separate lesson/review files. Their interpretation is now in each
`lesson.md`; the current manifest records the merged source. The
[source transformation record](source-layout-migration-20260912.md) preserves both the historical
accepted hashes and the immediate-before hashes, which differed for the first three lesson pages.
Exact old/new renderer output was compared for all three available lessons and aliases, and all
seven merged source bodies were checked against the previous renderer’s concatenation. This was
a content-preserving source migration; no original object-store experiment was rerun.
