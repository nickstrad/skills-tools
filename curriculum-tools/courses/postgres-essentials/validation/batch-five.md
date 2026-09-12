# Batch five acceptance: lessons 16–21

Accepted 2026-09-10 on PostgreSQL 16.15. Lesson 15 was already authored, so this batch implements
16–21 of the fixed route. All 21 lessons are now available through pgcoach; 22–40 remain planned.
The primary followed the [batch workflow](../../../../docs/lesson-batch-workflow.md): committed
design, bounded Sol pairs, primary review, real experiments, coherent commits and final cleanup.

## Measured evidence

| Lesson | Core evidence                                                                                                                                                                | Independently runnable variation                                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 16     | Plain EXPLAIN predicts; measured Aggregate emits 1 row, its scan emits 100 and removes 9,900 with 1 loop. Repeated execution retains those counts; both access 84 buffers.   | Broader predicate emits 1,000 scan rows and removes 9,000; the aggregate still emits 1.                                                                |
| 17     | UPDATE leaves 9,000 rare rows. Stale estimate 1,798 becomes 9,000 after ANALYZE, while actual rows remain 9,000. Common-value frequencies change from 0.1 to 0.9 for rare.   | Opposite drift leaves 1,000 rare rows; stale estimate 16,036 becomes 1,000.                                                                            |
| 18     | Ten-row range uses Index Scan and 3 buffers; the 95,000-row range uses Seq Scan, removes 5,000 and accesses 6,667 buffers.                                                   | A 20,000-row range uses Index Scan in this fixture; another node is permitted at intermediate selectivity.                                             |
| 19     | Identical newest-ten query uses backward scans with either composite index and no Sort. Time-first accesses 384 buffers versus 4 for tenant-first; both display Index Cond.  | Tenant 100's oldest ten use forward scans: 383 versus 4 buffers, no Sort. Both tenant endpoint and direction are deliberately reversed.                |
| 20     | Covering query emits 100 rows in all phases through Index Only Scan. Heap Fetches are 0 after vacuum, 200 after update, and 0 after vacuum again.                            | Omitting payload from coverage produces Bitmap Heap Scan with 100 rows.                                                                                |
| 21     | Both full sorts emit 20,000 rows. At 64kB, external merge uses 15,584kB disk and temp read=7774/written=8165. At 32MB, quicksort uses 16,550kB memory with no temporary I/O. | At the same 64kB setting, LIMIT 20 produces top-N heapsort, 20 outputs and 20,000 scanned inputs; reported memory is 65kB including overhead/rounding. |

Each lesson ran standalone with its exact built setup, session blocks and displayed variation
fences. All 21 lessons then ran together through the persistent Session/splitSteps implementation,
including earlier concurrency waits and the existing client failure-path checks. The new lessons
produced no SQL errors; the earlier lessons' intentional errors matched their existing inventories.
The validator compares semantic plan evidence and avoids timing thresholds or summing inclusive
parent/child buffer counts. Sampling, cache state and page layout remain explicit limits.

Evidence:

- [Whole-course outcomes](lessons-1-2-3-4-5-6-7-8-9-10-11-12-13-14-15-16-17-18-19-20-21-outcomes.json)
- [Accepted source hashes](lessons-1-2-3-4-5-6-7-8-9-10-11-12-13-14-15-16-17-18-19-20-21-source.json)
- [Whole-course cluster retirement](lessons-1-2-3-4-5-6-7-8-9-10-11-12-13-14-15-16-17-18-19-20-21-cleanup.json)
- Standalone `lessons-16-*` through `lessons-21-*` outcome, source and cleanup records
- [Catalog refresh and learner-history checks](batch-five-progress.json)
- [Final resource and readiness inventory](batch-five-cleanup.json)

## Primary review and integration

Review corrected route titles, reference citations and raw-template syntax, supplied missing command
explanations, clarified inclusive buffer accounting, and kept timeout guards active through table
cleanup. It removed an unsupported claim that a trailing index condition must produce heap-level
Rows Removed by Filter. The 80% crossover prototype still chose an index because heap order
correlated with the key; the final 95% bound reproduced a natural sequential scan without disabling
scan types. These findings are recorded in the
[durable notes](../../../../docs/knowledge/postgres-essentials.md).

Hand-copied author SQL is retained as prototype evidence, with its limits stated. The final
acceptance comes from the primary's built-catalog runs. Every current lesson hash matches the
whole-course manifest; all six standalone hashes agree. The first 15 complete lesson objects,
including revisions, commands and prerequisites, are unchanged from before this batch.

`deno task build postgres-essentials`, `deno task check` and all 37 `deno task test` tests pass. The
route tests cover all 21 exact titles/slugs, unchanged rendered commands, diagrams and concepts
before setup, correct terminal guidance, explicit completion and the planned lesson-22 boundary.
Primary inspection also checked rendered full views for 16, 19 and 21. The installed skill remains
symlinked to its repository source and now reports current availability.

`refresh.py --apply` first updated a SQLite backup and inspected all 63 lesson/review/full views,
then refreshed the live catalog and repeated those checks. All 13 progress and 13 attempt rows were
preserved, as were reference database/WAL fingerprints. Rendering did not write the catalog. The
next unfinished lesson remains 14; no learner completion was recorded. The backup was removed.

## Resource closure and limits

Final resource closure is recorded in `batch-five-cleanup.json`. The final inventory found one
surviving early index-author attempt. Primary confirmed its exact data directory and absence of
other client backends, stopped it normally, checked postmaster.pid removal and deleted its 47 MiB
root. The subsequent process inventory contains only the original learner server (PID 348739) and
its background workers; no author root remains. Read-only readiness confirms /labs/pglab/primary,
PostgreSQL 16.15, primary mode and database CREATE privilege. Final disk headroom is 16,524,025,856
bytes (about 16 GB), with about 6.8 GiB memory available. Only compact scripts, reports, source
hashes, outcomes and local ignored logs are retained; there is no database-image retention
obligation. Earlier pair/prototype acceptance inputs were discarded after final-source validation.

All six lessons use one psql terminal and retain 25-minute estimates within the requested 20–30
minute core budget. Real learner timing remains unmeasured. These are bounded mechanism experiments,
not production benchmarks or universal index/memory sizing recommendations.
