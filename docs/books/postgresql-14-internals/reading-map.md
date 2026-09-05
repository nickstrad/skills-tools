# Reading map: current course → PostgreSQL 14 Internals

Updated 2026-09-05 for the 92 active lessons. Each row below matches the current generated lesson's
exact reading field, including the reviewed Chapter 1 coverage for the completed first lesson. Use
stable slugs when comparing historical reports. The
[identity and retirement map](../../../curriculum-tools/courses/postgres/lesson-map.md) relates the
original 96 identities to current numbers; retirement never transfers a completion.

Book chapter/section titles and scope come from the existing digest and research notes. This refresh
uses those findings and the accepted lesson metadata; it does not re-extract the PDF. A citation
marked outside the book supplies only its stated closest background, not coverage of the added
protocol or tool. Seven mandatory reading stops remain in the
[checkpoint plan](study-checkpoint-plan.md); per-lesson citations are optional lookups.

## Active lesson citations

| Current | Stable slug                                     | Reading                                                                                                                                                                                                                                                |
| ------: | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|       1 | `build-lab-cluster`                             | PostgreSQL 14 Internals, Chapter 1 "Introduction" (sections "Data Organization" and "Processes and Memory")                                                                                                                                            |
|       2 | `shell-and-psql-toolkit`                        | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 1 "Introduction".                                                                                                                                                        |
|       3 | `install-lab-extensions`                        | PostgreSQL 14 Internals, Chapter 3 "Pages and Tuples" (section "Page Structure"); Chapter 6 "Vacuum and Autovacuum" (section "Vacuum"); Chapter 9 "Buffer Cache" (sections "Cache Hits", "Cache Warming")                                              |
|       4 | `process-model`                                 | PostgreSQL 14 Internals, Chapter 1 "Introduction" (sections "Processes and Memory", "Clients and the Client-Server Protocol"); Chapter 15 "Locks on Memory Structures" (section "Monitoring Waits")                                                    |
|       5 | `table-is-a-file`                               | PostgreSQL 14 Internals, Chapter 1 "Introduction" (sections "Files and Forks", "Pages")                                                                                                                                                                |
|       6 | `page-header-and-line-pointers`                 | PostgreSQL 14 Internals, Chapter 3 "Pages and Tuples" (section "Page Structure")                                                                                                                                                                       |
|       7 | `update-writes-a-new-tuple`                     | PostgreSQL 14 Internals, Chapter 3 "Pages and Tuples" (sections "Row Version Layout", "Operations on Tuples")                                                                                                                                          |
|       8 | `hot-updates-and-fillfactor`                    | PostgreSQL 14 Internals, Chapter 5 "Page Pruning and HOT Updates" (sections "Page Pruning", "HOT Updates")                                                                                                                                             |
|       9 | `toast-and-large-values`                        | PostgreSQL 14 Internals, Chapter 1 "Introduction" (section "TOAST"); Chapter 3 "Pages and Tuples" (section "TOAST")                                                                                                                                    |
|      10 | `buffer-cache-and-io`                           | PostgreSQL 14 Internals, Chapter 9 "Buffer Cache" (sections "Cache Hits", "Cache Misses"); Chapter 10 "Write-Ahead Log" (section "Checkpoint")                                                                                                         |
|      11 | `xids-and-the-transaction-counter`              | PostgreSQL 14 Internals, Chapter 3 "Pages and Tuples" (sections "Operations on Tuples", "Virtual Transactions"); Chapter 12 "Relation-Level Locks" (section "Locks on Transaction IDs")                                                                |
|      12 | `snapshot-anatomy`                              | PostgreSQL 14 Internals, Chapter 4 "Snapshots" (sections "What is a Snapshot?", "Snapshot Structure")                                                                                                                                                  |
|      13 | `two-sessions-see-different-versions`           | PostgreSQL 14 Internals, Chapter 4 "Snapshots" (section "Row Version Visibility"); Chapter 2 "Isolation" (section "Repeatable Read")                                                                                                                   |
|      14 | `commit-visibility-and-clog`                    | PostgreSQL 14 Internals, Chapter 3 "Pages and Tuples" (section "Operations on Tuples")                                                                                                                                                                 |
|      15 | `xmin-horizon-blocks-cleanup`                   | PostgreSQL 14 Internals, Chapter 4 "Snapshots" (section "Transaction Horizon"); Chapter 6 "Vacuum and Autovacuum" (section "Database Horizon Revisited")                                                                                               |
|      16 | `wraparound-and-freezing`                       | PostgreSQL 14 Internals, Chapter 7 "Freezing" (sections "Transaction ID Wraparound", "Tuple Freezing and Visibility Rules", "Manual Freezing")                                                                                                         |
|      17 | `vacuum-reclaims-in-place`                      | PostgreSQL 14 Internals, Chapter 6 "Vacuum and Autovacuum" (sections "Vacuum", "Vacuum Phases"); Chapter 8 "Rebuilding Tables and Indexes" (section "Full Vacuuming")                                                                                  |
|      18 | `vacuum-full-rewrites-and-locks`                | PostgreSQL 14 Internals, Chapter 8 "Rebuilding Tables and Indexes" (section "Full Vacuuming"); Chapter 12 "Relation-Level Locks" (sections "Relation-Level Locks", "Wait Queue")                                                                       |
|      19 | `visibility-map-and-index-only-scans`           | PostgreSQL 14 Internals, Chapter 6 "Vacuum and Autovacuum" (section "Vacuum"); Chapter 20 "Index Scans" (section "Index-Only Scans")                                                                                                                   |
|      20 | `autovacuum-triggers`                           | PostgreSQL 14 Internals, Chapter 6 "Vacuum and Autovacuum" (sections "Automatic Vacuum and Analysis", "Monitoring")                                                                                                                                    |
|      21 | `atomic-abort`                                  | PostgreSQL 14 Internals, Chapter 3 "Pages and Tuples" (sections "Operations on Tuples", "Subtransactions")                                                                                                                                             |
|      22 | `read-committed-sees-each-statement`            | PostgreSQL 14 Internals, Chapter 2 "Isolation" (sections "Read Committed", "Repeatable Read")                                                                                                                                                          |
|      23 | `lost-update-under-read-committed`              | PostgreSQL 14 Internals, Chapter 2 "Isolation" (sections "Isolation Levels and Anomalies in SQL Standard", "Read Committed"); Chapter 13 "Row-Level Locks" (section "Row-Level Locking Modes")                                                         |
|      24 | `optimistic-concurrency-with-version-columns`   | PostgreSQL 14 Internals, Chapter 2 "Isolation" (section "Read Committed")                                                                                                                                                                              |
|      25 | `repeatable-read-blocks-then-fails`             | PostgreSQL 14 Internals, Chapter 2 "Isolation" (section "Repeatable Read")                                                                                                                                                                             |
|      26 | `write-skew`                                    | PostgreSQL 14 Internals, Chapter 2 "Isolation" (section "Repeatable Read")                                                                                                                                                                             |
|      27 | `serializable-ssi`                              | PostgreSQL 14 Internals, Chapter 2 "Isolation" (section "Serializable"); Chapter 14 "Miscellaneous Locks" (section "Predicate Locks")                                                                                                                  |
|      28 | `retry-loop-and-idempotency`                    | PostgreSQL 14 Internals, Chapter 2 "Isolation" (section "Serializable")                                                                                                                                                                                |
|      29 | `unknown-commit-outcome`                        | PostgreSQL 14 Internals does not provide this application protocol; Chapter 2 "Isolation" and Chapter 13 "Row-Level Locks" provide transaction and contention background.                                                                              |
|      30 | `row-locks-are-in-the-tuple`                    | PostgreSQL 14 Internals, Chapter 13 "Row-Level Locks" (sections "Lock Design", "Row-Level Locking Modes"); Chapter 12 "Relation-Level Locks" (section "Locks on Transaction IDs")                                                                      |
|      31 | `lock-queue-and-blocking-pids`                  | PostgreSQL 14 Internals, Chapter 13 "Row-Level Locks" (section "Wait Queue"); Chapter 12 "Relation-Level Locks" (section "Wait Queue")                                                                                                                 |
|      32 | `deadlock-detection`                            | PostgreSQL 14 Internals, Chapter 13 "Row-Level Locks" (section "Deadlocks")                                                                                                                                                                            |
|      33 | `lock-timeout-and-nowait`                       | PostgreSQL 14 Internals, Chapter 13 "Row-Level Locks" (section "No-Wait Locks")                                                                                                                                                                        |
|      34 | `ddl-behind-a-long-query`                       | PostgreSQL 14 Internals, Chapter 12 "Relation-Level Locks" (sections "Relation-Level Locks", "Wait Queue")                                                                                                                                             |
|      35 | `advisory-locks-as-leases`                      | PostgreSQL 14 Internals, Chapter 14 "Miscellaneous Locks" (section "Advisory Locks")                                                                                                                                                                   |
|      36 | `skip-locked-work-queue`                        | PostgreSQL 14 Internals, Chapter 13 "Row-Level Locks" (section "No-Wait Locks")                                                                                                                                                                        |
|      37 | `unique-constraint-race`                        | PostgreSQL 14 Internals, Chapter 12 "Relation-Level Locks" (section "Locks on Transaction IDs"); Chapter 19 "Index Access Methods" (section "Indexing Engine Interface")                                                                               |
|      38 | `explain-analyze-buffers`                       | PostgreSQL 14 Internals, Chapter 16 "Query Execution Stages" (section "Simple Query Protocol"); Chapter 18 "Table Access Methods" (section "Sequential Scans"); Chapter 9 "Buffer Cache" (section "Cache Hits")                                        |
|      39 | `statistics-drive-plans`                        | PostgreSQL 14 Internals, Chapter 17 "Statistics" (sections "Basic Statistics", "Most Common Values", "Multivariate Statistics")                                                                                                                        |
|      40 | `index-scan-vs-seq-scan-crossover`              | PostgreSQL 14 Internals, Chapter 20 "Index Scans" (sections "Regular Index Scans", "Comparison of Various Access Methods"); Chapter 18 "Table Access Methods" (section "Sequential Scans")                                                             |
|      41 | `join-strategies`                               | PostgreSQL 14 Internals, Chapter 21 "Nested Loop" (section "Nested Loop Joins"); Chapter 22 "Hashing" (section "Hash Joins"); Chapter 23 "Sorting and Merging" (sections "Merge Joins", "Comparison of Join Methods")                                  |
|      42 | `work-mem-spills-to-disk`                       | PostgreSQL 14 Internals, Chapter 23 "Sorting and Merging" (section "Sorting"); Chapter 22 "Hashing" (section "Hash Joins"); Chapter 16 "Query Execution Stages" (section "Simple Query Protocol")                                                      |
|      43 | `parallel-query`                                | PostgreSQL 14 Internals, Chapter 18 "Table Access Methods" (sections "Parallel Plans", "Parallel Sequential Scans", "Parallel Execution Limitations")                                                                                                  |
|      44 | `pg-stat-statements-as-tracing`                 | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 16 "Query Execution Stages".                                                                                                                                             |
|      45 | `btree-page-anatomy`                            | PostgreSQL 14 Internals, Chapter 25 "B-tree" (sections "Overview", "Page Layout")                                                                                                                                                                      |
|      46 | `create-index-concurrently-and-invalid-indexes` | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 12 "Relation-Level Locks".                                                                                                                                               |
|      47 | `bounded-online-migration`                      | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 12 "Relation-Level Locks"; Chapter 13 "Row-Level Locks".                                                                                                                 |
|      48 | `partial-and-covering-indexes`                  | PostgreSQL 14 Internals, Chapter 19 "Index Access Methods" (section "Indexing Engine Interface"); Chapter 20 "Index Scans" (section "Index-Only Scans")                                                                                                |
|      49 | `index-bloat-from-churn`                        | PostgreSQL 14 Internals, Chapter 5 "Page Pruning and HOT Updates" (section "Page Pruning for Indexes"); Chapter 8 "Rebuilding Tables and Indexes" (sections "Full Vacuuming", "Other Rebuilding Methods"); Chapter 25 "B-tree" (section "Page Layout") |
|      50 | `unique-index-enforcement-under-concurrency`    | PostgreSQL 14 Internals, Chapter 19 "Index Access Methods" (section "Indexing Engine Interface"); Chapter 12 "Relation-Level Locks" (section "Locks on Transaction IDs")                                                                               |
|      51 | `keyset-pagination-and-concurrent-writes`       | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 20 "Index Scans".                                                                                                                                                        |
|      52 | `every-change-is-a-wal-record`                  | PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (sections "Logging", "WAL Structure")                                                                                                                                                            |
|      53 | `full-page-writes-after-checkpoint`             | PostgreSQL 14 Internals, Chapter 11 "WAL Modes" (section "Fault Tolerance"); Chapter 10 "Write-Ahead Log" (section "Recovery")                                                                                                                         |
|      54 | `commit-means-fsync`                            | PostgreSQL 14 Internals, Chapter 11 "WAL Modes" (sections "Performance", "Fault Tolerance")                                                                                                                                                            |
|      55 | `wal-files-and-recycling`                       | PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (sections "WAL Structure", "WAL Setup")                                                                                                                                                          |
|      56 | `crash-and-redo`                                | PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (sections "Checkpoint", "Recovery")                                                                                                                                                              |
|      57 | `wal-size-of-operations`                        | PostgreSQL 14 Internals, Chapter 11 "WAL Modes" (sections "Fault Tolerance", "WAL Levels"); Chapter 5 "Page Pruning and HOT Updates" (section "HOT Updates")                                                                                           |
|      58 | `checkpoint-anatomy`                            | PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (sections "Checkpoint", "Background Writing", "WAL Setup")                                                                                                                                       |
|      59 | `redo-point-bounds-recovery`                    | PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (sections "Checkpoint", "Recovery")                                                                                                                                                              |
|      60 | `max-wal-size-forces-checkpoints`               | PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (section "WAL Setup")                                                                                                                                                                            |
|      61 | `base-backup`                                   | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".                                                                                                                                                    |
|      62 | `point-in-time-recovery`                        | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".                                                                                                                                                    |
|      63 | `wait-events-tell-you-where-time-goes`          | PostgreSQL 14 Internals, Chapter 15 "Locks on Memory Structures" (sections "Monitoring Waits", "Sampling")                                                                                                                                             |
|      64 | `pg-stat-io-by-backend-type`                    | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 9 "Buffer Cache".                                                                                                                                                        |
|      65 | `connection-saturation`                         | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 1 "Introduction" (section "Clients and the Client-Server Protocol").                                                                                                     |
|      66 | `idle-in-transaction-kills-you`                 | PostgreSQL 14 Internals, Chapter 8 "Rebuilding Tables and Indexes" (section "Precautions"); Chapter 4 "Snapshots" (section "Transaction Horizon")                                                                                                      |
|      67 | `table-and-index-usage-counters`                | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 6 "Vacuum and Autovacuum".                                                                                                                                               |
|      68 | `read-the-server-log`                           | PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (section "WAL Setup"); Chapter 15 "Locks on Memory Structures" (section "Monitoring Waits")                                                                                                      |
|      69 | `build-a-streaming-standby`                     | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 11 "WAL Modes".                                                                                                                                                          |
|      70 | `replication-lag-under-load`                    | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".                                                                                                                                                    |
|      71 | `read-your-writes-on-a-replica`                 | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".                                                                                                                                                    |
|      72 | `synchronous-replication-blocks-commit`         | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 11 "WAL Modes".                                                                                                                                                          |
|      73 | `hot-standby-query-conflict`                    | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 11 "WAL Modes".                                                                                                                                                          |
|      74 | `replication-slot-retains-wal`                  | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".                                                                                                                                                    |
|      75 | `promote-the-standby`                           | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".                                                                                                                                                    |
|      76 | `rewind-the-old-primary`                        | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".                                                                                                                                                    |
|      77 | `cascading-and-failback`                        | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".                                                                                                                                                    |
|      78 | `decode-the-log`                                | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 11 "WAL Modes".                                                                                                                                                          |
|      79 | `slot-position-and-acknowledgement`             | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 11 "WAL Modes".                                                                                                                                                          |
|      80 | `publication-and-subscription`                  | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 4 "Snapshots" and Chapter 11 "WAL Modes".                                                                                                                                |
|      81 | `conflicts-stop-the-apply-worker`               | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 11 "WAL Modes".                                                                                                                                                          |
|      82 | `slot-lag-and-disk`                             | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".                                                                                                                                                    |
|      83 | `transactional-outbox`                          | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 13 "Row-Level Locks".                                                                                                                                                    |
|      84 | `idempotency-keys`                              | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 12 "Relation-Level Locks".                                                                                                                                               |
|      85 | `two-phase-commit`                              | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 3 "Pages and Tuples".                                                                                                                                                    |
|      86 | `fencing-tokens-with-a-monotonic-counter`       | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 14 "Miscellaneous Locks".                                                                                                                                                |
|      87 | `listen-notify-as-a-bus`                        | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 1 "Introduction".                                                                                                                                                        |
|      88 | `abandoned-slot-fills-the-disk`                 | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".                                                                                                                                                    |
|      89 | `corrupt-a-page-and-detect-it`                  | PostgreSQL 14 Internals, Chapter 11 "WAL Modes" (section "Fault Tolerance")                                                                                                                                                                            |
|      90 | `wraparound-drill`                              | PostgreSQL 14 Internals, Chapter 7 "Freezing" (sections "Transaction ID Wraparound", "Managing Freezing"); Chapter 6 "Vacuum and Autovacuum" (section "Monitoring")                                                                                    |
|      91 | `runaway-query-and-cancel`                      | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 15 "Locks on Memory Structures".                                                                                                                                         |
|      92 | `postmortem-from-the-log`                       | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".                                                                                                                                                    |

## Retired research identities

These original citations remain research provenance. Their consolidated coverage and current
prerequisites are recorded in the identity map; these are not active lessons.

| Original | Stable slug                            | Original citation                                                                                                                                                                                                           |
| -------: | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|       11 | `free-space-map-and-reuse`             | PostgreSQL 14 Internals, Chapter 1 "Introduction" (section "Files and Forks"); Chapter 6 "Vacuum and Autovacuum" (section "Vacuum")                                                                                         |
|       18 | `dead-tuples-accumulate`               | PostgreSQL 14 Internals, Chapter 3 "Pages and Tuples" (section "Operations on Tuples"); Chapter 6 "Vacuum and Autovacuum" (section "Automatic Vacuum and Analysis")                                                         |
|       23 | `long-transaction-bloats-everyone`     | PostgreSQL 14 Internals, Chapter 4 "Snapshots" (section "Transaction Horizon"); Chapter 6 "Vacuum and Autovacuum" (section "Database Horizon Revisited"); Chapter 8 "Rebuilding Tables and Indexes" (section "Precautions") |
|       44 | `wal-replay-is-deterministic`          | PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (section "Recovery")                                                                                                                                                  |
|       51 | `timeline-history`                     | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 10 "Write-Ahead Log".                                                                                                                         |
|       63 | `initial-sync-vs-streaming`            | PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 4 "Snapshots".                                                                                                                                |
|       74 | `index-only-scan-needs-visibility-map` | PostgreSQL 14 Internals, Chapter 20 "Index Scans" (section "Index-Only Scans"); Chapter 6 "Vacuum and Autovacuum" (section "Vacuum")                                                                                        |

The research judgments below retain **original numbering**. Identify their current application by
slug and the active table above. Some experiments now add independently validated protocol behavior
that the book does not claim to teach.

## How I mapped

Method: extracted the PDF text with `pdftotext -layout`, took chapter/section titles from the book's
own table of contents, and located topics by full-text search plus reading the relevant pages; for
each lesson I matched the identifiers in its `code` and `overview` (extensions, views, functions,
parameters) against the identifiers each chapter actually uses. A lesson gets a chapter citation
only when the book demonstrates the same mechanism; a lesson whose central tool or command never
appears in the book gets the "not covered" form even if a chapter is tangentially related.

Format note: when a lesson genuinely spans two or three sections of one chapter I wrote
`(sections "A", "B")` rather than repeating the chapter; collapse to one section if the printing
template needs the strict single-section shape.

Lessons I was unsure about, and why:

- **3 install-lab-extensions** — the lesson only runs `CREATE EXTENSION`. The book introduces
  `pageinspect` (Ch 3), `pg_visibility` (Ch 6), `pg_buffercache` and `pg_prewarm` (Ch 9) but never
  uses `pg_freespacemap`, `pg_walinspect` or `pg_stat_statements`. I cited the introducing sections;
  a "not covered" line would also be defensible.
- **4 process-model** — Ch 1 §1.2 is a one-page list of processes, not a walkthrough; the
  `backend_type` listing in Ch 15 §15.4 is the closest the book gets to the lesson's
  `pg_stat_activity` survey.
- **11 free-space-map-and-reuse** — the FSM is explained as a fork (Ch 1) and as something vacuum
  updates (Ch 6), but the book never queries it with `pg_freespacemap`, which the lesson does.
- **18 dead-tuples-accumulate** — the lesson is mostly measurement with `pg_stat_user_tables`; the
  book uses `pg_stat_all_tables` for the same counters only in the autovacuum-threshold discussion.
- **30 retry-loop-and-idempotency** — the book says serialization failures must be retried (Ch 2,
  pp. 59–61) but does not discuss retry loops or idempotent retries as such.
- **38 unique-constraint-race** and **78 unique-index-enforcement-under-concurrency** — the book
  never shows the second inserter waiting on the first inserter's xid. Ch 12 §12.3 explains the
  xid-lock mechanism and Ch 19 §19.3 the `can_unique` property; the lesson-specific behaviour is
  inferred.
- **40 full-page-writes-after-checkpoint** — Ch 11 §11.2 "Non-Atomic Writes" is the direct
  reference, but it is a sub-heading; the numbered section is "Fault Tolerance".
- **42 wal-files-and-recycling** and **48 max-wal-size-forces-checkpoints** — segment naming,
  recycling and `max_wal_size` are covered (Ch 10 §10.2, §10.6); the archive / `pg_stat_archiver`
  half of lesson 42 is not.
- **45 wal-size-of-operations** — the book measures WAL volume with `pg_waldump --stats` and
  compression (Ch 11) and shows HOT avoiding index WAL (Ch 5), but never prices COPY vs INSERT or
  batching per transaction.
- **63 initial-sync-vs-streaming** — logical replication is not covered; I pointed at Ch 4
  "Snapshots" because the copy-then-stream handoff is built on exported snapshots (§4.7), which the
  book does explain.
- **66 explain-analyze-buffers** — `EXPLAIN` is never given its own section; the planning/execution
  walkthrough is Ch 16 §16.2, the seq-scan cost formula is Ch 18 §18.2, and `BUFFERS` output is
  first explained in Ch 9 §9.3.
- **72 pg-stat-statements-as-tracing** — zero mentions in the book. Ch 16 is the closest because it
  describes the query stages that `pg_stat_statements` hooks into; Ch 15 §15.5 (sampling) is an
  alternative.
- **75 create-index-concurrently-and-invalid-indexes** — CIC appears only as a lock-mode row in Ch
  12 §12.4 and one sentence on p. 205 and p. 329; the multi-phase protocol, `indisvalid` and
  `pg_stat_progress_create_index` are absent, so I used the "not covered" form.
- **80 pg-stat-io-by-backend-type** — the view is PostgreSQL 16; Ch 9 §9.5 (buffer rings per
  operation type) and Ch 10 §10.6 (`pg_stat_bgwriter`) are the conceptual predecessors.
- **81 connection-saturation** — Ch 1 §1.3 explains one-backend-per-connection and pooling but never
  exhausts `max_connections`; a "not covered" line is equally defensible.
- **83 table-and-index-usage-counters** — the book never reads `seq_scan`/`idx_scan` or
  `pg_stat_user_indexes`; Ch 6 (§6.5, `pg_stat_all_tables`) and Ch 9 (§9.6, `pg_statio_all_tables`)
  are the only places the per-table stats views appear.
- **84 read-the-server-log** — no chapter is about the log; the two cited sections are where the
  book turns on `log_checkpoints` and `log_lock_waits` and reads the resulting lines.
- **86 idempotency-keys**, **87 two-phase-commit**, **89 fencing-tokens**, **91 listen-notify**,
  **95 runaway-query-and-cancel** — application/operations patterns with no counterpart; the
  "closest background" chapter is a judgement call (`ON CONFLICT` → xid locks; `PREPARE TRANSACTION`
  → commit mechanics in Ch 3; fencing → advisory locks; LISTEN/NOTIFY → nothing better than the
  client-server chapter; cancel/terminate → `pg_stat_activity` in Ch 15).
- **93 corrupt-a-page-and-detect-it** — detection, `data_checksums`, `pg_checksums` and
  `ignore_checksum_failure` are in Ch 11 §11.2; `pg_surgery` and the repair-vs-restore decision are
  not.
- **Modules 08–10 and the incidents (49–65, 90, 92, 96)** — backups, PITR, timelines, streaming and
  logical replication, slots, `pg_rewind` and failover are outside the book; every "closest
  background" there points at Ch 10 (LSNs, segments, recovery, WAL retention) or Ch 11 §11.3 (what
  the replica/logical WAL levels add), which is all the book offers.

## Crash/replay consolidation (2026-09-05)

Original44, wal-replay-is-deterministic, is consolidated into surviving crash-and-redo (original43,
current56). Its Chapter 10 Recovery reading remains represented there. The replacement executes an
actual owned-cluster crash, retains an offline pg_waldump interval, checks fresh replay logs and
compares physical tuples with independently visible outcomes. Thus physical inspection is part of
the recovery experiment rather than a separate read-only lesson. No learner completion transfers.
The table above remains the original 96-lesson research index; current identities/order and all
seven reading stops are in the course lesson-map.md. No book citation was inferred for the newer
pg_walinspect interface itself.

## Executed PITR/timeline consolidation (2026-09-05)

Original51 timeline-history is consolidated into point-in-time-recovery after actual named-target
restores, archived history/segment verification and reversed restoration order passed. Both are
outside the book. The current identity map now has93 active lessons and seven reading stops; match
the retained PITR citation by slug. Promotion and the final postmortem depend on the retained PITR
lesson. No completed lesson or retired completion is transferred to a different task.

## Executed physical read-your-writes move (2026-09-05)

Original90 read-your-writes-on-a-replica now follows replication-lag-under-load at current71. Its
stable identity and outside-book citation remain; the replacement executes an owned physical standby
gate, post-COMMIT bound, known-history rejection, timeout, fresh receipt snapshot and explicit
primary-fallback variation. No logical received position substitutes for physical apply. The
original research table stays numbered1–96; use lesson-map.md for current93-lesson order.

## Executed logical bootstrap consolidation (2026-09-05)

Original63 initial-sync-vs-streaming is consolidated into original62 publication-and-subscription,
current80. The replacement audits actual copied snapshots and concurrent INSERT/UPDATE/DELETE tails
for both subscription creation and a later publication refresh; the earlier table continues to
stream while the new table copies. Both topics remain outside the book. The surviving citation
combines Chapter4 "Snapshots" and Chapter 11 "WAL Modes" as closest background, without claiming
book coverage of the synchronization protocol or its diagnostic catalogs. The original 96-row index
remains; use lesson-map.md for current 92-lesson order and seven reading stops. Retired completion
is not transferred, and the conflict lesson now depends on the surviving bootstrap identity.
