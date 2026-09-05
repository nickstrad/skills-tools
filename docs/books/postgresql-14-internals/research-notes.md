# Research notes: how the chapter digest and reading map were made

Written 2026-09-03 by the research subagent that produced `pg14-internals-chapters.md` and
`reading-map.md`, transcribed from its final report. Read this before redoing any book analysis: the
answers below are already settled.

## What is in this folder

| File                             | What it is                                                                                                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgresql_internals-14_en.pdf` | The book itself (English edition, Postgres Professional, free download). Do not re-extract it per turn.                                                                                            |
| `pg14-internals-chapters.md`     | Full table of contents with page numbers, per-chapter coverage (commands, views, extensions, settings each chapter uses), what the book does not cover, and a "where to look for ..." topic index. |
| `reading-map.md`                 | Current 92-lesson citations, retired research identities and the original mapping judgments; see the current identity map for historical numbers.                                                  |
| `study-checkpoint-plan.md`       | Seven short, course-order reading stops selected from the per-lesson map, including what PostgreSQL 14-specific material to skip.                                                                  |
| `research-notes.md`              | This file: method, chapter numbering, coverage headline, and the judgement calls.                                                                                                                  |

## Chapter numbering (global, 1-29)

- 1 Introduction (pp. 20-36; before Part I)
- Part I Isolation and MVCC: 2 Isolation, 3 Pages and Tuples, 4 Snapshots, 5 Page Pruning and HOT
  Updates, 6 Vacuum and Autovacuum, 7 Freezing, 8 Rebuilding Tables and Indexes
- Part II Buffer Cache and WAL: 9 Buffer Cache, 10 Write-Ahead Log, 11 WAL Modes
- Part III Locks: 12 Relation-Level Locks, 13 Row-Level Locks, 14 Miscellaneous Locks, 15 Locks on
  Memory Structures
- Part IV Query Execution: 16 Query Execution Stages, 17 Statistics, 18 Table Access Methods, 19
  Index Access Methods, 20 Index Scans, 21 Nested Loop, 22 Hashing, 23 Sorting and Merging
- Part V Types of Indexes: 24 Hash, 25 B-tree, 26 GiST, 27 SP-GiST, 28 GIN, 29 BRIN

## Method

- Text was extracted with `pdftotext` from `poppler-utils` (`apt-get install -y poppler-utils`);
  there is no `pip` on this host, so `pypdf` was not an option. The extraction lived only in the
  session scratchpad and was deleted with it; rerun `pdftotext -layout` if you truly need raw text.
- The book sets SQL keywords in small caps, which extract as glyph boxes, so keyword greps
  undercount. Anything keyword-based was verified by reading the page.
- Every chapter title and section name in the two documents was checked verbatim against the book's
  table of contents. All 96 reading-map rows were validated against `lessons.json` (ordinals and
  slugs match; both citation shapes parse).

## Current course integration (2026-09-05)

The current reading map has 92 active rows, built from the accepted curriculum's exact citations,
and preserves retired research identities plus original doubtful-mapping notes. The original method
and counts below describe the 96-lesson research baseline. The course identity map records seven
retirements and three additions. Seven bounded reading stops now follow current
10,14,20,28,37,39,60; planner reading precedes WAL reading in the revised teaching order. Their
bounded excerpts and version exclusions remain unchanged. No new PDF extraction was needed for this
integration.

## Coverage headline

The checked 96-row `reading-map.md` has 64 lessons mapped to one or more chapters and 32 that print
the "not covered by the book" line. The course intentionally overrides lesson 1 after manual review:
Chapter 1 directly explains the files and processes that lesson creates, so the rendered course has
65 chapter-cited lessons and 31 not-covered lessons. Modules 09 (streaming replication) and 10
(logical replication), the backup/PITR/timeline lessons in module 08, and most of modules 14
(distributed patterns) and 15 (incidents) are outside the book. Its only replication content is
Chapter 11 section 11.3 (what the replica and logical `wal_level` values add) and the process list
in Chapter 1. The book has zero occurrences of: replication slots, pg_basebackup, PITR, PREPARE
TRANSACTION, pg_stat_statements, pg_walinspect, pg_freespacemap, amcheck, pg_stat_io,
pg_cancel_backend and pg_terminate_backend.

## Judgement calls (lesson ordinal, slug, why it was doubtful)

- 3 install-lab-extensions: cited the sections introducing pageinspect, pg_visibility,
  pg_buffercache and pg_prewarm; the book never uses pg_freespacemap, pg_walinspect or
  pg_stat_statements.
- 4 process-model: Chapter 1 section 1.2 is a one-page process list; Chapter 15 section 15.4 has the
  `backend_type` listing.
- 11 free-space-map-and-reuse: the FSM is explained conceptually, never queried with
  pg_freespacemap.
- 18 dead-tuples-accumulate: the book reads `pg_stat_all_tables` only inside the autovacuum
  discussion.
- 30 retry-loop-and-idempotency: retrying is mentioned, retry loops are not shown.
- 38 unique-constraint-race and 78 unique-index-enforcement: "the second inserter waits on the
  first's xid" is never shown; cited xid locks (Chapter 12 section 12.3) and the can_unique property
  (Chapter 19).
- 40 full-page-writes-after-checkpoint: the direct hit is the sub-heading "Non-Atomic Writes" under
  section 11.2 "Fault Tolerance".
- 42 wal-files-and-recycling and 48 max-wal-size-forces-checkpoints: segments and recycling are
  covered; the archive half is not.
- 45 wal-size-of-operations: the book never prices COPY versus INSERT or batching.
- 63 initial-sync-vs-streaming: pointed at Chapter 4 (exported snapshots) rather than Chapter 11.
- 66 explain-analyze-buffers: EXPLAIN has no section of its own; it is spread over Chapters 16, 18
  and 9.
- 72 pg-stat-statements-as-tracing: zero mentions; Chapter 16 chosen as closest background.
- 75 create-index-concurrently-and-invalid-indexes: only a lock-mode row and two sentences; marked
  "not covered".
- 80 pg-stat-io-by-backend-type: a PostgreSQL 16 view; Chapter 9 section 9.5 (buffer rings) is the
  predecessor material.
- 81 connection-saturation: pooling is discussed, max_connections exhaustion is not.
- 83 table-and-index-usage-counters: seq_scan and idx_scan are never read; "not covered".
- 84 read-the-server-log: no log chapter; cited where log_checkpoints and log_lock_waits are
  enabled.
- 86, 87, 89, 91, 95 (application and operations patterns): the "closest background" chapter is a
  judgement call; LISTEN/NOTIFY especially has nothing better than Chapter 1.
- 93 corrupt-a-page-and-detect-it: detection and checksums are in Chapter 11 section 11.2;
  pg_surgery and repair are not covered.

## Formatting note

Where a lesson spans several sections of one chapter the map writes `(sections "A", "B")` rather
than repeating the chapter. The course's lesson 1 (build-lab-cluster) deliberately cites Chapter 1
sections "Data Organization" and "Processes and Memory" although the map lists it as "not covered":
the chapter describes the directories and processes that initdb creates, which is enough overlap for
a `readingNotes` write-up.
