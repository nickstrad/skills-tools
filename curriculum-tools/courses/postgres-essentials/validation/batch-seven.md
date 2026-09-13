# Batch seven acceptance — lessons 27–31

Accepted 2026-09-13 on PostgreSQL 16.15, Linux amd64. Primary authored, reviewed and validated all
five lessons; no delegation. Scope follows [designs/27-31.md](../designs/27-31.md) and the fixed
40-lesson route. Lessons 1–26, their slugs/revisions and all learner history remain unchanged.

## Delivered and checked

| Lesson | Learner task | Real worked-completion evidence |
| --- | --- | --- |
| 27 restore-and-verify | Construct an ordered complete inventory query | Manifest verification passed; baseline and restored rows are bolts=10, nuts=20, washers=30; later source has nuts=99 with the same three-row count |
| 28 recovery-needs-history | Construct the exact withheld-file repair | Missing start segment named by backup_label caused required-checkpoint failure; same recovery copy reached before_bad after repair, showing ids 1,2; preserved original archive SHA256 unchanged |
| 29 targeted-recovery | Choose the point that excludes the bad import | Source history ids 1,2,3; before_bad restored ids 1,2; log named that point and actual recovery pause was observed |
| 30 build-a-standby | Construct pg_basebackup with standby configuration | standby.signal exists, recovery mode true, receiver streaming, and row committed after backup visible on a fresh standby query |
| 31 received-is-not-replayed | Diagnose paused apply and issue resume SQL | Confirmed pause followed by primary commit; receive >= post-commit marker while replay < marker and row absent; after resume, replay >= marker and row present |

The complete [worked sequence log](batch-seven-worked-sequence.log) contains the actual outputs.
Only trailing whitespace in captured output is normalized for Git.
Fixture runtimes were seconds (five worked lessons about 21.3 seconds together); metadata estimates
12–15 minutes for a human include explanation, construction, debugging, evidence and teardown.
They are author estimates, not measured learner timings. No optional variation or submission stage
is added.

## Validation method and error inventory

The [Go driver](batch-seven/main.go) reads the real Markdown through the course parser. It first
runs each unchanged Run starter through the shared `tutor postgres-essentials validate --isolated`.
Each starter intentionally leaves a specific learner task incomplete. The driver requires that
exact failure plus a successful cleanup record; these are **not** reported as passing worked
experiments. It then copies the small course source to temporary state and replaces only Run with
the exact labelled worked completion already displayed in Expected result. All five worked blocks
pass through the generic validator with a 60-second step deadline. No learner PostgreSQL endpoint
or progress database is used.

| Case | Required result / classification | Evidence |
| --- | --- | --- |
| Starter 27, count only | Three equal counts; query cannot distinguish changed quantity, nonzero exit after cleanup | [log](batch-seven-starter-27.log) |
| Starter 28, no repair | Required-checkpoint FATAL for the named withheld segment, then unresolved-file STOP | [log](batch-seven-starter-28.log) |
| Starter 29, after_bad | Recovery correctly pauses at after_bad but includes bad import; nonzero task result | [log](batch-seven-starter-29.log) |
| Starter 30, no backup command | No standby.signal; destination is never started | [log](batch-seven-starter-30.log) |
| Starter 31, inspect only | Real receipt/apply gap persists through bounded wait; nonzero task result | [log](batch-seven-starter-31.log) |
| Backup without -R | Real backup completed but standby.signal absent; refuses standby startup | [log](batch-seven-missing-standby-option.log) |
| Action shell exits 7 | Intentional action failure propagated, primary still stopped and removed | [log](batch-seven-action-error.log) |
| Normal OS user | Worked 27 succeeds when the compiled controller runs as postgres directly | [log](batch-seven-normal-user.log) |
| SIGINT with both servers live | Received/replayed evidence observed before interruption; command killed and both server trees retired | [log](batch-seven-interrupt.log) |

The worked sequence has exactly the intentional lesson-28 required-checkpoint FATAL and no SQL
ERROR/PANIC or other unexpected failure. Missing timeline-history and a later segment probe also
appear on successful archive recovery; the target log, confirmed pause and exact operation history
distinguish those probes from missing required checkpoint history. Full failed-start logs remain
in the disposable fixture only until cleanup; the relevant classified lines above are retained.

An initial pre-acceptance run exposed a fixture bug: one multi-statement psql -c call placed both
restore points inside the implicit transaction before its COMMIT. The first recovery therefore
showed only baseline id=1. The final controller executes the two INSERTs and two restore-point
calls separately, and real restored history establishes the intended ordering. This failed trial
was cleaned immediately; it is not part of the accepted source manifest or worked log.

## Source correspondence and shared CLI

- [Runtime source manifest](batch-seven-source.json) hashes all 31 lessons and the controller used
  for the real-tool acceptance. Final prose adds only the explanation of harmless archive probes
  in 28/29; their Setup, Run and worked commands remain unchanged.
- [Final source manifest](batch-seven-final-source.json) hashes final lessons, unchanged controller
  and acceptance/smoke Go files. It is generated after final plain/JSON rendering checks.
- `bin/tutor postgres-essentials check` passes **31 lessons OK**.
- `go test ./...` passes every package. The later smoke-only validator addition compiles and runs;
  it does not change experiment behavior or the tutor engine.
- [Rendering/progress smoke](batch-seven-smoke.log) checks all five complete plain/JSON lesson
  outputs against source, diagrams before setup, and route boundary 31 authored / 32 planned.
  Displaying content preserves isolated database bytes. Explicit skip/done/undone work only in
  that temporary database, which is deleted afterward.
- [Copied progress verification](batch-seven-progress.json) checks all course identities/history:
  261 existing lesson rows, 39 progress rows and 40 attempts; progress_unchanged,
  attempts_unchanged and identities_preserved are all true.

AUTHORING.md requires authoring to use isolated progress, so the live learner catalog was not
refreshed. To adopt the batch after authoring, run `tutor postgres-essentials init`, then
`tutor postgres-essentials 27 lesson`. Catalog refresh does not mark lessons complete. The course
route can already discover all 31 authored Markdown lessons.

## Resource and learner-state closure

Fixtures ran serially. The largest accepted tree measured 87,210,570 bytes immediately before
removal (about 87.3 MB), below the conservative 500 MB allocation budget. Each run stopped its
copy and primary, checked stopped status and removed the entire tree, including base backup,
archives and WAL. The driver independently checked every emitted fixture path was absent.
The initial direct trials, failed transaction-order trial, sandbox allocation failure, generic
validator evidence directories, worked-course clone, compiled fixture and smoke progress copy
were also removed. No restorable database image or WAL archive is retained for an outstanding check.
Only small source manifests, logs and this report are durable; they need no later bulky-evidence
retirement.

Final checks: about **9.9 GiB free disk**, **7 GiB available memory**, inodes **8% used**.
Only the original learner postmaster **1331865** and its normal workers remain. A read-only query
returns `/labs/pglab/primary|f|1` on the original socket/port; learner-lab readiness is preserved.
Learner database SHA256 remains
`65809427c05348e0484e6a7b57d81607eab52ba360264d4e7330f961ee3ffd99`.
Unrelated dirty progress, postgres-lab.md and analysis.md were neither staged nor overwritten.

Final knowledge-store reflection added `data/psql-command-transactions.md` and corrected the
obsolete `data/pgcoach-course-authoring.md` to the current Go/Markdown/shared-progress workflow.
Both entries were saved through kb and read-verified. The user's permanent batch event-log and
reflection policy is recorded in the repository workflow and AGENTS.md. With validation, cleanup
and these knowledge updates complete, the temporary root state.md and old course handoff.md were
retired; their checkpoint history remains in Git.

## Limits and reproduction

These are same-host, tiny local fixtures: no independent-host availability, disk-loss recovery,
production recovery-time measurement, arbitrary archive retention policy, failover, promotion,
fencing or external-side-effect guarantee is tested. Paused replay receives only a tiny bounded
write. Baseline quietness and separate completed calls make the named points unambiguous here.

From curriculum-tools, run `go run ./courses/postgres-essentials/validation/batch-seven` for real
acceptance and add `--smoke-only` for rendering/progress checks without PostgreSQL allocation.
The agent sandbox must allow postgres OS credentials for real fixtures. Read the
[fixture contract](../lab/recovery/README.md) before changing resource ownership or process control.
Primary technical references are linked from the design; required context is contained in each
lesson. Workflow: [lesson-batch-workflow.md](../../../../docs/lesson-batch-workflow.md).
