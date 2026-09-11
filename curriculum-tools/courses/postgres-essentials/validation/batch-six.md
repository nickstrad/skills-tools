# Lessons 22–26 acceptance

Accepted 2026-09-11 on PostgreSQL 16.15. The fixed route now has 26 available lessons; lesson 27,
restore-and-verify, remains planned. Design and file ownership are in
[designs/22-26.md](../designs/22-26.md). The repository's
[batch workflow](../../../../docs/lesson-batch-workflow.md) guided primary design, bounded Sol
implementation, primary review, real validation and chunked commits.

## Final measured evidence

The primary validator drove exact built setup/code and extracted the displayed optional variation
fences. Every new lesson also had independent author runs with its own setup and disposable fixture.
No unexpected PostgreSQL errors occurred. Core results:

| Lesson | Observation                                                                                                                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22     | Both hash joins returned 50,000 rows. Small allowance: 256 batches and temp traffic; larger allowance: 1 batch without temp traffic. Multiplier-8 variation: 32 batches.                                                                                                                    |
| 23     | Synchronous flush passed the saved pre-commit insert position; both committed rows existed. Async sample had 136 bytes still unflushed relative to the saved insert position; zero is also valid. Rollback generated 1,328 WAL bytes and left zero visible rows.                            |
| 24     | Equal 200-row contents/checksums: 59,464 WAL bytes for 200 transactions, 51,504 for one; ten-transaction variation: 51,840. Author run's single-transaction count was 51,544, illustrating small interval variability.                                                                      |
| 25     | The same writer PID retained all 12,000 pending rows across CHECKPOINT; another connection retained all 12,000 original rows. Dirty relation buffers fell 906 → 0. Rollback restored original visibility; commit variation published pending.                                               |
| 26     | Real immediate shutdown produced interrupted/redo-start/redo-done restart logs. Recovered inventory was [[1,110],[2,100],[3,100],[4,1]], preserving committed work while aborted/interrupted changes stayed invisible. Clean-stop variation produced the same inventory without crash redo. |

[Join/checkpoint/crash outcomes](lessons-22-25-26-outcomes.json) and
[WAL outcomes](lessons-23-24-outcomes.json) include variation checks and scoped empty error
inventories. Matching `.log`, `-variations.log`, `-source.json` and `-cleanup.json` files record
executed text, lesson hashes, imported helper hashes and fixture removal. Retained logs trim only
trailing terminal padding. [Final source manifest](batch-six-source.json) verifies all five final
objects and helper dependencies against those runs. The first 21 lesson objects compare equal to the
pre-batch catalog.

The checkpoint controller was corrected during primary review to query the writer's actual rows,
track its exact backend PID, bound commands, clear inherited PG variables and verify server stop
before removal. [Its hardening report](author-25-hardening.md) includes real interruption/failure
cleanup checks. Primary crash cleanup injections occurred after actual writes with an open
transaction; [both interruption and exception removed the fixture](batch-six-crash-cleanup.json).
The learner-facing controllers never accept an existing target directory or server endpoint.

## Catalog, checks and resources

- `deno task build postgres-essentials`, full `deno task check`, and all 37 tests passed.
- [Catalog refresh](batch-six-progress.json) passed on a SQLite backup first, then the live catalog.
  All 26 lesson/review/full views rendered. The 18 progress rows and 19 attempts were unchanged; the
  original reference progress fingerprints were unchanged. No lesson was marked complete.
- Both installed postgres-tutor skills already point to the updated canonical source via symlinks.
- [Final cleanup](batch-six-cleanup.json) found no owned private cluster directories or processes.
  The learner's original PID 348739 remained running at `/labs/pglab/primary`, PostgreSQL 16.15.
  Existing learner clients were preserved. About 16 GB disk and 6.6 GiB memory remained available.
- Reports/logs/scripts are retained; reproducible cluster data and temporary progress copies were
  removed. `handoff.md` records final status for the user's requested continuity record.

The core duration estimates remain provisional until learner feedback. WAL bytes are controlled
cluster-wide interval measurements, not universal operation prices. Async position samples do not
prove survival under power loss. Checkpoint/crash experiments exercise PostgreSQL on one running
host with storage intact; backup restoration and replica guarantees belong to later route entries.

Mechanism references and reusable review findings are in the repository's
[PostgreSQL essentials knowledge entry](../../../../docs/knowledge/postgres-essentials.md), citing
PostgreSQL 16 primary documentation. The environment-level routing/progress note is also indexed at
`/root/Raw/knowledge/pgcoach-course-authoring.md`.
