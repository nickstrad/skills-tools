# PostgreSQL lesson identity map

Updated2026-09-05 after logical bootstrap consolidation;92 active lessons. Original means
the96-lesson course before the pivot. Current numbers reflect the generated course; stable slugs
identify lessons across later changes. Retirement does not transfer completion. Original lessons1–7
remain identical.

| Original | Current | Stable slug                                     | Disposition                                                                                                                                         |
| -------: | ------: | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
|        1 |       1 | `build-lab-cluster`                             | Retained                                                                                                                                            |
|        2 |       2 | `shell-and-psql-toolkit`                        | Retained                                                                                                                                            |
|        3 |       3 | `install-lab-extensions`                        | Retained                                                                                                                                            |
|        4 |       4 | `process-model`                                 | Retained                                                                                                                                            |
|        5 |       5 | `table-is-a-file`                               | Retained                                                                                                                                            |
|        6 |       6 | `page-header-and-line-pointers`                 | Retained                                                                                                                                            |
|        7 |       7 | `update-writes-a-new-tuple`                     | Retained                                                                                                                                            |
|        8 |       8 | `hot-updates-and-fillfactor`                    | Retained                                                                                                                                            |
|        9 |       9 | `toast-and-large-values`                        | Retained                                                                                                                                            |
|       10 |      10 | `buffer-cache-and-io`                           | Retained                                                                                                                                            |
|       11 |       — | `free-space-map-and-reuse`                      | Consolidated into vacuum-reclaims-in-place; checkpoint moved to buffer-cache-and-io                                                                 |
|       12 |      11 | `xids-and-the-transaction-counter`              | Retained                                                                                                                                            |
|       13 |      12 | `snapshot-anatomy`                              | Retained                                                                                                                                            |
|       14 |      13 | `two-sessions-see-different-versions`           | Retained                                                                                                                                            |
|       15 |      14 | `commit-visibility-and-clog`                    | Retained                                                                                                                                            |
|       16 |      15 | `xmin-horizon-blocks-cleanup`                   | Retained                                                                                                                                            |
|       17 |      16 | `wraparound-and-freezing`                       | Retained                                                                                                                                            |
|       18 |       — | `dead-tuples-accumulate`                        | Consolidated into vacuum-reclaims-in-place                                                                                                          |
|       19 |      17 | `vacuum-reclaims-in-place`                      | Retained                                                                                                                                            |
|       20 |      18 | `vacuum-full-rewrites-and-locks`                | Retained                                                                                                                                            |
|       21 |      19 | `visibility-map-and-index-only-scans`           | Retained                                                                                                                                            |
|       22 |      20 | `autovacuum-triggers`                           | Retained                                                                                                                                            |
|       23 |       — | `long-transaction-bloats-everyone`              | Consolidated into xmin-horizon-blocks-cleanup; checkpoint moved to autovacuum-triggers                                                              |
|       24 |      21 | `atomic-abort`                                  | Retained                                                                                                                                            |
|       25 |      22 | `read-committed-sees-each-statement`            | Retained                                                                                                                                            |
|       26 |      23 | `lost-update-under-read-committed`              | Retained                                                                                                                                            |
|       27 |      25 | `repeatable-read-blocks-then-fails`             | Retained                                                                                                                                            |
|       28 |      26 | `write-skew`                                    | Retained                                                                                                                                            |
|       29 |      27 | `serializable-ssi`                              | Retained                                                                                                                                            |
|       30 |      28 | `retry-loop-and-idempotency`                    | Retained                                                                                                                                            |
|       31 |      30 | `row-locks-are-in-the-tuple`                    | Retained                                                                                                                                            |
|       32 |      31 | `lock-queue-and-blocking-pids`                  | Retained                                                                                                                                            |
|       33 |      32 | `deadlock-detection`                            | Retained                                                                                                                                            |
|       34 |      33 | `lock-timeout-and-nowait`                       | Retained                                                                                                                                            |
|       35 |      34 | `ddl-behind-a-long-query`                       | Retained                                                                                                                                            |
|       36 |      35 | `advisory-locks-as-leases`                      | Retained                                                                                                                                            |
|       37 |      36 | `skip-locked-work-queue`                        | Retained                                                                                                                                            |
|       38 |      37 | `unique-constraint-race`                        | Retained                                                                                                                                            |
|       39 |      52 | `every-change-is-a-wal-record`                  | Retained                                                                                                                                            |
|       40 |      53 | `full-page-writes-after-checkpoint`             | Retained                                                                                                                                            |
|       41 |      54 | `commit-means-fsync`                            | Retained                                                                                                                                            |
|       42 |      55 | `wal-files-and-recycling`                       | Retained                                                                                                                                            |
|       43 |      56 | `crash-and-redo`                                | Retained                                                                                                                                            |
|       44 |       — | `wal-replay-is-deterministic`                   | Consolidated into crash-and-redo: actual crash, offline WAL dump and post-recovery physical/visible assertions                                      |
|       45 |      57 | `wal-size-of-operations`                        | Retained                                                                                                                                            |
|       46 |      58 | `checkpoint-anatomy`                            | Retained                                                                                                                                            |
|       47 |      59 | `redo-point-bounds-recovery`                    | Retained                                                                                                                                            |
|       48 |      60 | `max-wal-size-forces-checkpoints`               | Retained                                                                                                                                            |
|       49 |      61 | `base-backup`                                   | Retained                                                                                                                                            |
|       50 |      62 | `point-in-time-recovery`                        | Retained                                                                                                                                            |
|       51 |       — | `timeline-history`                              | Consolidated into point-in-time-recovery: actual named targets, two retained branches and verified archived ancestry                                |
|       52 |      69 | `build-a-streaming-standby`                     | Retained                                                                                                                                            |
|       53 |      70 | `replication-lag-under-load`                    | Retained                                                                                                                                            |
|       54 |      72 | `synchronous-replication-blocks-commit`         | Retained                                                                                                                                            |
|       55 |      73 | `hot-standby-query-conflict`                    | Retained                                                                                                                                            |
|       56 |      74 | `replication-slot-retains-wal`                  | Retained                                                                                                                                            |
|       57 |      75 | `promote-the-standby`                           | Retained                                                                                                                                            |
|       58 |      76 | `rewind-the-old-primary`                        | Retained                                                                                                                                            |
|       59 |      77 | `cascading-and-failback`                        | Retained                                                                                                                                            |
|       60 |      78 | `decode-the-log`                                | Retained                                                                                                                                            |
|       61 |      79 | `slot-position-and-acknowledgement`             | Retained                                                                                                                                            |
|       62 |      80 | `publication-and-subscription`                  | Consolidated actual initial subscription and new-table refresh with snapshot/tail audit and continuing stream                                       |
|       63 |       — | `initial-sync-vs-streaming`                     | Consolidated into publication-and-subscription: audited snapshot/tail for initial subscription and refreshed-table copy while existing work streams |
|       64 |      81 | `conflicts-stop-the-apply-worker`               | Retained                                                                                                                                            |
|       65 |      82 | `slot-lag-and-disk`                             | Retained                                                                                                                                            |
|       66 |      38 | `explain-analyze-buffers`                       | Retained                                                                                                                                            |
|       67 |      39 | `statistics-drive-plans`                        | Retained                                                                                                                                            |
|       68 |      40 | `index-scan-vs-seq-scan-crossover`              | Retained                                                                                                                                            |
|       69 |      41 | `join-strategies`                               | Retained                                                                                                                                            |
|       70 |      42 | `work-mem-spills-to-disk`                       | Retained                                                                                                                                            |
|       71 |      43 | `parallel-query`                                | Retained                                                                                                                                            |
|       72 |      44 | `pg-stat-statements-as-tracing`                 | Retained                                                                                                                                            |
|       73 |      45 | `btree-page-anatomy`                            | Retained                                                                                                                                            |
|       74 |       — | `index-only-scan-needs-visibility-map`          | Consolidated into visibility-map-and-index-only-scans and partial-and-covering-indexes                                                              |
|       75 |      46 | `create-index-concurrently-and-invalid-indexes` | Retained                                                                                                                                            |
|       76 |      48 | `partial-and-covering-indexes`                  | Retained                                                                                                                                            |
|       77 |      49 | `index-bloat-from-churn`                        | Retained                                                                                                                                            |
|       78 |      50 | `unique-index-enforcement-under-concurrency`    | Retained                                                                                                                                            |
|       79 |      63 | `wait-events-tell-you-where-time-goes`          | Retained                                                                                                                                            |
|       80 |      64 | `pg-stat-io-by-backend-type`                    | Retained                                                                                                                                            |
|       81 |      65 | `connection-saturation`                         | Revised to bounded measured concurrency/latency workload                                                                                            |
|       82 |      66 | `idle-in-transaction-kills-you`                 | Retained                                                                                                                                            |
|       83 |      67 | `table-and-index-usage-counters`                | Retained                                                                                                                                            |
|       84 |      68 | `read-the-server-log`                           | Retained                                                                                                                                            |
|       85 |      83 | `transactional-outbox`                          | Retained                                                                                                                                            |
|       86 |      84 | `idempotency-keys`                              | Retained                                                                                                                                            |
|       87 |      85 | `two-phase-commit`                              | Retained                                                                                                                                            |
|       88 |      24 | `optimistic-concurrency-with-version-columns`   | Moved to isolation; explicit conflict/merge decision                                                                                                |
|       89 |      86 | `fencing-tokens-with-a-monotonic-counter`       | Retained                                                                                                                                            |
|       90 |      71 | `read-your-writes-on-a-replica`                 | Moved to physical replication; bounded same-history replay and receipt gate                                                                         |
|       91 |      87 | `listen-notify-as-a-bus`                        | Retained                                                                                                                                            |
|       92 |      88 | `abandoned-slot-fills-the-disk`                 | Retained                                                                                                                                            |
|       93 |      89 | `corrupt-a-page-and-detect-it`                  | Retained                                                                                                                                            |
|       94 |      90 | `wraparound-drill`                              | Retained                                                                                                                                            |
|       95 |      91 | `runaway-query-and-cancel`                      | Retained                                                                                                                                            |
|       96 |      92 | `postmortem-from-the-log`                       | Retained                                                                                                                                            |

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
|           60 | `max-wal-size-forces-checkpoints` |
