# PostgreSQL lesson identity map

Updated2026-09-05 after planner/index/capacity integration and ordering. Original means the96-lesson
course before the pivot. Current numbers reflect the generated course; stable slugs identify lessons
across later changes. Retirement does not transfer completion. Original lessons1–7 remain identical.

| Original | Current | Stable slug                                     | Disposition                                                                            |
| -------: | ------: | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
|        1 |       1 | `build-lab-cluster`                             | Retained                                                                               |
|        2 |       2 | `shell-and-psql-toolkit`                        | Retained                                                                               |
|        3 |       3 | `install-lab-extensions`                        | Retained                                                                               |
|        4 |       4 | `process-model`                                 | Retained                                                                               |
|        5 |       5 | `table-is-a-file`                               | Retained                                                                               |
|        6 |       6 | `page-header-and-line-pointers`                 | Retained                                                                               |
|        7 |       7 | `update-writes-a-new-tuple`                     | Retained                                                                               |
|        8 |       8 | `hot-updates-and-fillfactor`                    | Retained                                                                               |
|        9 |       9 | `toast-and-large-values`                        | Retained                                                                               |
|       10 |      10 | `buffer-cache-and-io`                           | Retained                                                                               |
|       11 |       — | `free-space-map-and-reuse`                      | Consolidated into vacuum-reclaims-in-place; checkpoint moved to buffer-cache-and-io    |
|       12 |      11 | `xids-and-the-transaction-counter`              | Retained                                                                               |
|       13 |      12 | `snapshot-anatomy`                              | Retained                                                                               |
|       14 |      13 | `two-sessions-see-different-versions`           | Retained                                                                               |
|       15 |      14 | `commit-visibility-and-clog`                    | Retained                                                                               |
|       16 |      15 | `xmin-horizon-blocks-cleanup`                   | Retained                                                                               |
|       17 |      16 | `wraparound-and-freezing`                       | Retained                                                                               |
|       18 |       — | `dead-tuples-accumulate`                        | Consolidated into vacuum-reclaims-in-place                                             |
|       19 |      17 | `vacuum-reclaims-in-place`                      | Retained                                                                               |
|       20 |      18 | `vacuum-full-rewrites-and-locks`                | Retained                                                                               |
|       21 |      19 | `visibility-map-and-index-only-scans`           | Retained                                                                               |
|       22 |      20 | `autovacuum-triggers`                           | Retained                                                                               |
|       23 |       — | `long-transaction-bloats-everyone`              | Consolidated into xmin-horizon-blocks-cleanup; checkpoint moved to autovacuum-triggers |
|       24 |      21 | `atomic-abort`                                  | Retained                                                                               |
|       25 |      22 | `read-committed-sees-each-statement`            | Retained                                                                               |
|       26 |      23 | `lost-update-under-read-committed`              | Retained                                                                               |
|       27 |      25 | `repeatable-read-blocks-then-fails`             | Retained                                                                               |
|       28 |      26 | `write-skew`                                    | Retained                                                                               |
|       29 |      27 | `serializable-ssi`                              | Retained                                                                               |
|       30 |      28 | `retry-loop-and-idempotency`                    | Retained                                                                               |
|       31 |      30 | `row-locks-are-in-the-tuple`                    | Retained                                                                               |
|       32 |      31 | `lock-queue-and-blocking-pids`                  | Retained                                                                               |
|       33 |      32 | `deadlock-detection`                            | Retained                                                                               |
|       34 |      33 | `lock-timeout-and-nowait`                       | Retained                                                                               |
|       35 |      34 | `ddl-behind-a-long-query`                       | Retained                                                                               |
|       36 |      35 | `advisory-locks-as-leases`                      | Retained                                                                               |
|       37 |      36 | `skip-locked-work-queue`                        | Retained                                                                               |
|       38 |      37 | `unique-constraint-race`                        | Retained                                                                               |
|       39 |      52 | `every-change-is-a-wal-record`                  | Retained                                                                               |
|       40 |      53 | `full-page-writes-after-checkpoint`             | Retained                                                                               |
|       41 |      54 | `commit-means-fsync`                            | Retained                                                                               |
|       42 |      55 | `wal-files-and-recycling`                       | Retained                                                                               |
|       43 |      56 | `crash-and-redo`                                | Retained                                                                               |
|       44 |      57 | `wal-replay-is-deterministic`                   | Retained                                                                               |
|       45 |      58 | `wal-size-of-operations`                        | Retained                                                                               |
|       46 |      59 | `checkpoint-anatomy`                            | Retained                                                                               |
|       47 |      60 | `redo-point-bounds-recovery`                    | Retained                                                                               |
|       48 |      61 | `max-wal-size-forces-checkpoints`               | Retained                                                                               |
|       49 |      62 | `base-backup`                                   | Retained                                                                               |
|       50 |      63 | `point-in-time-recovery`                        | Retained                                                                               |
|       51 |      64 | `timeline-history`                              | Retained                                                                               |
|       52 |      71 | `build-a-streaming-standby`                     | Retained                                                                               |
|       53 |      72 | `replication-lag-under-load`                    | Retained                                                                               |
|       54 |      73 | `synchronous-replication-blocks-commit`         | Retained                                                                               |
|       55 |      74 | `hot-standby-query-conflict`                    | Retained                                                                               |
|       56 |      75 | `replication-slot-retains-wal`                  | Retained                                                                               |
|       57 |      76 | `promote-the-standby`                           | Retained                                                                               |
|       58 |      77 | `rewind-the-old-primary`                        | Retained                                                                               |
|       59 |      78 | `cascading-and-failback`                        | Retained                                                                               |
|       60 |      79 | `decode-the-log`                                | Retained                                                                               |
|       61 |      80 | `slot-position-and-acknowledgement`             | Retained                                                                               |
|       62 |      81 | `publication-and-subscription`                  | Retained                                                                               |
|       63 |      82 | `initial-sync-vs-streaming`                     | Retained                                                                               |
|       64 |      83 | `conflicts-stop-the-apply-worker`               | Retained                                                                               |
|       65 |      84 | `slot-lag-and-disk`                             | Retained                                                                               |
|       66 |      38 | `explain-analyze-buffers`                       | Retained                                                                               |
|       67 |      39 | `statistics-drive-plans`                        | Retained                                                                               |
|       68 |      40 | `index-scan-vs-seq-scan-crossover`              | Retained                                                                               |
|       69 |      41 | `join-strategies`                               | Retained                                                                               |
|       70 |      42 | `work-mem-spills-to-disk`                       | Retained                                                                               |
|       71 |      43 | `parallel-query`                                | Retained                                                                               |
|       72 |      44 | `pg-stat-statements-as-tracing`                 | Retained                                                                               |
|       73 |      45 | `btree-page-anatomy`                            | Retained                                                                               |
|       74 |       — | `index-only-scan-needs-visibility-map`          | Consolidated into visibility-map-and-index-only-scans and partial-and-covering-indexes |
|       75 |      46 | `create-index-concurrently-and-invalid-indexes` | Retained                                                                               |
|       76 |      48 | `partial-and-covering-indexes`                  | Retained                                                                               |
|       77 |      49 | `index-bloat-from-churn`                        | Retained                                                                               |
|       78 |      50 | `unique-index-enforcement-under-concurrency`    | Retained                                                                               |
|       79 |      65 | `wait-events-tell-you-where-time-goes`          | Retained                                                                               |
|       80 |      66 | `pg-stat-io-by-backend-type`                    | Retained                                                                               |
|       81 |      67 | `connection-saturation`                         | Revised to bounded measured concurrency/latency workload                               |
|       82 |      68 | `idle-in-transaction-kills-you`                 | Retained                                                                               |
|       83 |      69 | `table-and-index-usage-counters`                | Retained                                                                               |
|       84 |      70 | `read-the-server-log`                           | Retained                                                                               |
|       85 |      85 | `transactional-outbox`                          | Retained                                                                               |
|       86 |      86 | `idempotency-keys`                              | Retained                                                                               |
|       87 |      87 | `two-phase-commit`                              | Retained                                                                               |
|       88 |      24 | `optimistic-concurrency-with-version-columns`   | Moved to isolation; explicit conflict/merge decision                                   |
|       89 |      88 | `fencing-tokens-with-a-monotonic-counter`       | Retained                                                                               |
|       90 |      89 | `read-your-writes-on-a-replica`                 | Retained                                                                               |
|       91 |      90 | `listen-notify-as-a-bus`                        | Retained                                                                               |
|       92 |      91 | `abandoned-slot-fills-the-disk`                 | Retained                                                                               |
|       93 |      92 | `corrupt-a-page-and-detect-it`                  | Retained                                                                               |
|       94 |      93 | `wraparound-drill`                              | Retained                                                                               |
|       95 |      94 | `runaway-query-and-cancel`                      | Retained                                                                               |
|       96 |      95 | `postmortem-from-the-log`                       | Retained                                                                               |

## Added experiments

| Current | Stable slug                               |
| ------: | ----------------------------------------- |
|      29 | `unknown-commit-outcome`                  |
|      47 | `bounded-online-migration`                |
|      51 | `keyset-pagination-and-concurrent-writes` |

## Current reading stops

| After lesson | Slug                              |
| -----------: | --------------------------------- |
|           10 | `buffer-cache-and-io`             |
|           14 | `commit-visibility-and-clog`      |
|           20 | `autovacuum-triggers`             |
|           28 | `retry-loop-and-idempotency`      |
|           37 | `unique-constraint-race`          |
|           39 | `statistics-drive-plans`          |
|           61 | `max-wal-size-forces-checkpoints` |
