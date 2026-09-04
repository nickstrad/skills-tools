# PostgreSQL lesson identity map

Chunk 1 snapshot, 2026-09-04. Original means the 96-lesson course before the approved pivot. Current
numbers reflect the generated course at this checkpoint; use stable slugs to follow later chunks.
Retirement does not transfer completion to a different lesson. Original lessons 1–7 are unchanged.

| Original | Current | Stable slug                                     | Disposition                                                                                          |
| -------: | ------: | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
|        1 |       1 | `build-lab-cluster`                             | Retained                                                                                             |
|        2 |       2 | `shell-and-psql-toolkit`                        | Retained                                                                                             |
|        3 |       3 | `install-lab-extensions`                        | Retained                                                                                             |
|        4 |       4 | `process-model`                                 | Retained                                                                                             |
|        5 |       5 | `table-is-a-file`                               | Retained                                                                                             |
|        6 |       6 | `page-header-and-line-pointers`                 | Retained                                                                                             |
|        7 |       7 | `update-writes-a-new-tuple`                     | Retained                                                                                             |
|        8 |       8 | `hot-updates-and-fillfactor`                    | Retained                                                                                             |
|        9 |       9 | `toast-and-large-values`                        | Retained                                                                                             |
|       10 |      10 | `buffer-cache-and-io`                           | Retained                                                                                             |
|       11 |       — | `free-space-map-and-reuse`                      | Consolidated into vacuum-reclaims-in-place; physical-storage checkpoint moved to buffer-cache-and-io |
|       12 |      11 | `xids-and-the-transaction-counter`              | Retained                                                                                             |
|       13 |      12 | `snapshot-anatomy`                              | Retained                                                                                             |
|       14 |      13 | `two-sessions-see-different-versions`           | Retained                                                                                             |
|       15 |      14 | `commit-visibility-and-clog`                    | Retained                                                                                             |
|       16 |      15 | `xmin-horizon-blocks-cleanup`                   | Retained                                                                                             |
|       17 |      16 | `wraparound-and-freezing`                       | Retained                                                                                             |
|       18 |       — | `dead-tuples-accumulate`                        | Consolidated into vacuum-reclaims-in-place                                                           |
|       19 |      17 | `vacuum-reclaims-in-place`                      | Retained                                                                                             |
|       20 |      18 | `vacuum-full-rewrites-and-locks`                | Retained                                                                                             |
|       21 |      19 | `visibility-map-and-index-only-scans`           | Retained                                                                                             |
|       22 |      20 | `autovacuum-triggers`                           | Retained                                                                                             |
|       23 |       — | `long-transaction-bloats-everyone`              | Consolidated into xmin-horizon-blocks-cleanup; checkpoint moved to autovacuum-triggers               |
|       24 |      21 | `atomic-abort`                                  | Retained                                                                                             |
|       25 |      22 | `read-committed-sees-each-statement`            | Retained                                                                                             |
|       26 |      23 | `lost-update-under-read-committed`              | Retained                                                                                             |
|       27 |      24 | `repeatable-read-blocks-then-fails`             | Retained                                                                                             |
|       28 |      25 | `write-skew`                                    | Retained                                                                                             |
|       29 |      26 | `serializable-ssi`                              | Retained                                                                                             |
|       30 |      27 | `retry-loop-and-idempotency`                    | Retained                                                                                             |
|       31 |      28 | `row-locks-are-in-the-tuple`                    | Retained                                                                                             |
|       32 |      29 | `lock-queue-and-blocking-pids`                  | Retained                                                                                             |
|       33 |      30 | `deadlock-detection`                            | Retained                                                                                             |
|       34 |      31 | `lock-timeout-and-nowait`                       | Retained                                                                                             |
|       35 |      32 | `ddl-behind-a-long-query`                       | Retained                                                                                             |
|       36 |      33 | `advisory-locks-as-leases`                      | Retained                                                                                             |
|       37 |      34 | `skip-locked-work-queue`                        | Retained                                                                                             |
|       38 |      35 | `unique-constraint-race`                        | Retained                                                                                             |
|       39 |      36 | `every-change-is-a-wal-record`                  | Retained                                                                                             |
|       40 |      37 | `full-page-writes-after-checkpoint`             | Retained                                                                                             |
|       41 |      38 | `commit-means-fsync`                            | Retained                                                                                             |
|       42 |      39 | `wal-files-and-recycling`                       | Retained                                                                                             |
|       43 |      40 | `crash-and-redo`                                | Retained                                                                                             |
|       44 |      41 | `wal-replay-is-deterministic`                   | Retained                                                                                             |
|       45 |      42 | `wal-size-of-operations`                        | Retained                                                                                             |
|       46 |      43 | `checkpoint-anatomy`                            | Retained                                                                                             |
|       47 |      44 | `redo-point-bounds-recovery`                    | Retained                                                                                             |
|       48 |      45 | `max-wal-size-forces-checkpoints`               | Retained                                                                                             |
|       49 |      46 | `base-backup`                                   | Retained                                                                                             |
|       50 |      47 | `point-in-time-recovery`                        | Retained                                                                                             |
|       51 |      48 | `timeline-history`                              | Retained                                                                                             |
|       52 |      49 | `build-a-streaming-standby`                     | Retained                                                                                             |
|       53 |      50 | `replication-lag-under-load`                    | Retained                                                                                             |
|       54 |      51 | `synchronous-replication-blocks-commit`         | Retained                                                                                             |
|       55 |      52 | `hot-standby-query-conflict`                    | Retained                                                                                             |
|       56 |      53 | `replication-slot-retains-wal`                  | Retained                                                                                             |
|       57 |      54 | `promote-the-standby`                           | Retained                                                                                             |
|       58 |      55 | `rewind-the-old-primary`                        | Retained                                                                                             |
|       59 |      56 | `cascading-and-failback`                        | Retained                                                                                             |
|       60 |      57 | `decode-the-log`                                | Retained                                                                                             |
|       61 |      58 | `slot-position-and-acknowledgement`             | Retained                                                                                             |
|       62 |      59 | `publication-and-subscription`                  | Retained                                                                                             |
|       63 |      60 | `initial-sync-vs-streaming`                     | Retained                                                                                             |
|       64 |      61 | `conflicts-stop-the-apply-worker`               | Retained                                                                                             |
|       65 |      62 | `slot-lag-and-disk`                             | Retained                                                                                             |
|       66 |      63 | `explain-analyze-buffers`                       | Retained                                                                                             |
|       67 |      64 | `statistics-drive-plans`                        | Retained                                                                                             |
|       68 |      65 | `index-scan-vs-seq-scan-crossover`              | Retained                                                                                             |
|       69 |      66 | `join-strategies`                               | Retained                                                                                             |
|       70 |      67 | `work-mem-spills-to-disk`                       | Retained                                                                                             |
|       71 |      68 | `parallel-query`                                | Retained                                                                                             |
|       72 |      69 | `pg-stat-statements-as-tracing`                 | Retained                                                                                             |
|       73 |      70 | `btree-page-anatomy`                            | Retained                                                                                             |
|       74 |      71 | `index-only-scan-needs-visibility-map`          | Retained                                                                                             |
|       75 |      72 | `create-index-concurrently-and-invalid-indexes` | Retained                                                                                             |
|       76 |      73 | `partial-and-covering-indexes`                  | Retained                                                                                             |
|       77 |      74 | `index-bloat-from-churn`                        | Retained                                                                                             |
|       78 |      75 | `unique-index-enforcement-under-concurrency`    | Retained                                                                                             |
|       79 |      76 | `wait-events-tell-you-where-time-goes`          | Retained                                                                                             |
|       80 |      77 | `pg-stat-io-by-backend-type`                    | Retained                                                                                             |
|       81 |      78 | `connection-saturation`                         | Retained                                                                                             |
|       82 |      79 | `idle-in-transaction-kills-you`                 | Retained                                                                                             |
|       83 |      80 | `table-and-index-usage-counters`                | Retained                                                                                             |
|       84 |      81 | `read-the-server-log`                           | Retained                                                                                             |
|       85 |      82 | `transactional-outbox`                          | Retained                                                                                             |
|       86 |      83 | `idempotency-keys`                              | Retained                                                                                             |
|       87 |      84 | `two-phase-commit`                              | Retained                                                                                             |
|       88 |      85 | `optimistic-concurrency-with-version-columns`   | Retained                                                                                             |
|       89 |      86 | `fencing-tokens-with-a-monotonic-counter`       | Retained                                                                                             |
|       90 |      87 | `read-your-writes-on-a-replica`                 | Retained                                                                                             |
|       91 |      88 | `listen-notify-as-a-bus`                        | Retained                                                                                             |
|       92 |      89 | `abandoned-slot-fills-the-disk`                 | Retained                                                                                             |
|       93 |      90 | `corrupt-a-page-and-detect-it`                  | Retained                                                                                             |
|       94 |      91 | `wraparound-drill`                              | Retained                                                                                             |
|       95 |      92 | `runaway-query-and-cancel`                      | Retained                                                                                             |
|       96 |      93 | `postmortem-from-the-log`                       | Retained                                                                                             |

## Current reading stops

| After lesson | Slug                              |
| -----------: | --------------------------------- |
|           10 | `buffer-cache-and-io`             |
|           14 | `commit-visibility-and-clog`      |
|           20 | `autovacuum-triggers`             |
|           27 | `retry-loop-and-idempotency`      |
|           35 | `unique-constraint-race`          |
|           45 | `max-wal-size-forces-checkpoints` |
|           64 | `statistics-drive-plans`          |
