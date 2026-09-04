# PostgreSQL study checkpoint plan

The table below preserves the original 96-lesson research numbering. During the approved refactor,
use the [current lesson and checkpoint map](../../../curriculum-tools/courses/postgres/lesson-map.md)
for active numbers and consolidated slugs. Match book citations by slug, not by an old ordinal.

This plan adds seven deliberate reading pauses to the 96-lesson PostgreSQL Systems course. The
pauses are course-order stops: finish the named lesson, read the bounded core items, then resume
with the next numbered lesson. Existing per-lesson `reading` and `readingNotes` citations remain
useful as optional lookups; only `studyCheckpoint` means “stop here before continuing.”

## Design criteria

- Prefer systems concepts with high transfer value: physical representation, MVCC and snapshots,
  garbage-collection horizons, isolation, locking, WAL and durability, and planner fundamentals.
- Attach stops only to existing experiments. A stop must consolidate phenomena the learner has
  already observed, not introduce a prerequisite for the next lesson.
- Scope the core path to named sections or subheadings and printed page ranges; never assign an
  entire 50–100 page chapter as a mandatory pause.
- Keep each pause approximately 8–22 printed pages. The seven core stops total approximately 115
  pages.
- Preserve the book as a source of overarching mechanisms, not as a PostgreSQL 14 compatibility
  contract. Every stop tells the learner what version-specific defaults, example output, or API
  names to skip.
- The engine-facing metadata is resource-neutral (`source` plus `locator`), so other courses can use
  documentation sections, papers, RFCs, blog posts, or videos without PostgreSQL or book logic in
  the tutor engine.

## Core stops

| Stop | After lesson                          | Core reading                                                                                                                 | Approx. pages | Consolidates                                                          |
| ---- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------: | --------------------------------------------------------------------- |
| 1    | 11 `free-space-map-and-reuse`         | Ch. 1 §1.1 “Files and Forks” and “Pages,” pp. 24–28; Ch. 3 §3.1 “Page Structure,” pp. 62–64                                  |             8 | Relation files/forks, pages, line pointers, and reusable space        |
| 2    | 15 `commit-visibility-and-clog`       | Ch. 3 §§3.2–3.3, pp. 64–74; Ch. 4 §§4.1–4.3, pp. 80–86                                                                       |            18 | Tuple versions, commit/abort status, visibility, and snapshots        |
| 3    | 23 `long-transaction-bloats-everyone` | Ch. 4 §4.5, pp. 87–89; Ch. 6 §§6.1–6.3, pp. 102–109; Ch. 6 §6.5 selected subheadings, pp. 110–113                            |            15 | Horizons, vacuum phases, and autovacuum triggers                      |
| 4    | 30 `retry-loop-and-idempotency`       | Ch. 2 §2.3 “Isolation Levels in PostgreSQL,” pp. 44–60                                                                       |            17 | Read Committed, Repeatable Read, Serializable/SSI, and retries        |
| 5    | 38 `unique-constraint-race`           | Ch. 12 §12.5, pp. 206–209; Ch. 13 §13.1, pp. 210–211; Ch. 13 §13.4 “Exclusive Modes,” pp. 215–220; Ch. 13 §13.6, pp. 225–230 |            18 | Wait queues, tuple row locks, and deadlocks                           |
| 6    | 48 `max-wal-size-forces-checkpoints`  | Ch. 10 §§10.1–10.4, pp. 164–175; Ch. 10 §10.6, pp. 177–181                                                                   |            17 | WAL-before-data, LSNs, checkpoints, redo, recovery, and configuration |
| 7    | 67 `statistics-drive-plans`           | Ch. 16 §16.2 subheadings “Planning” and “Execution,” pp. 257–265; Ch. 17 §§17.1–17.5, pp. 271–282                            |            22 | Plan construction/execution and statistics behind row estimates       |

Total: approximately **115 printed pages**. Page totals count only the listed sections; a section
boundary can make the physical count differ by one page.

## Deliberately optional or skipped material

The following are not mandatory checkpoints: Ch. 7’s detailed freezing-age walkthrough; Ch. 10’s
background-writer section; Ch. 11’s fault-tolerance details; row-lock no-wait details; scan-cost
chapters; and specialized index chapters. They can be revisited when a lesson or a work problem
calls for them.

Do not treat the book’s PostgreSQL 14.7 defaults, timing-dependent output, planner estimates, WAL
volume, catalog output, or low-level API/bit names as portable facts. In particular:

- Skip the old stats-collector process model when it appears in the PG14 text; use the live PG16
  process and statistics behavior from the course.
- PostgreSQL 16 still has `old_snapshot_threshold`, but it is not needed for these checkpoints. Do
  not generalize it to PostgreSQL 17 or later, where it was removed.
- Skip `force_parallel_mode`; PG16 uses `debug_parallel_query` for that debug behavior, and this
  plan does not make the setting part of the core reading.
- The book uses `pg_waldump`; the course’s PG16 observability lesson uses `pg_walinspect`. Read the
  WAL concepts, not a command-name equivalence.
- `pg_stat_io` is absent from the PG14 book and is a PG16 course addition; do not search for it in
  the assigned reading.
- Do not memorize PG14-specific freeze ages, autovacuum defaults, page-layout flags, or sample
  output. Keep the invariant—old snapshots retain history, vacuum advances cleanup, and WAL makes
  committed changes recoverable—and trust the PG16 experiments for exact behavior.

The version exclusions were checked against PostgreSQL's official records: the
[shared-memory statistics change](https://www.postgresql.org/about/featurematrix/detail/server-statistics-in-shared-memory/),
the
[`force_parallel_mode` rename in PostgreSQL 16](https://www.postgresql.org/docs/16/release-16.html),
and the
[`old_snapshot_threshold` removal in PostgreSQL 17](https://www.postgresql.org/docs/17/release-17.html).
