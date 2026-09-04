# PostgreSQL lesson identity map

Updated2026-09-04 after concurrency integration. Original means the96-lesson course before the
pivot. Current numbers reflect the generated course; stable slugs identify lessons across later
changes. Retirement does not transfer completion. Original lessons1–7 remain identical.

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
|       39 |      38 | `every-change-is-a-wal-record`                  | Retained                                                                               |
|       40 |      39 | `full-page-writes-after-checkpoint`             | Retained                                                                               |
|       41 |      40 | `commit-means-fsync`                            | Retained                                                                               |
|       42 |      41 | `wal-files-and-recycling`                       | Retained                                                                               |
|       43 |      42 | `crash-and-redo`                                | Retained                                                                               |
|       44 |      43 | `wal-replay-is-deterministic`                   | Retained                                                                               |
|       45 |      44 | `wal-size-of-operations`                        | Retained                                                                               |
|       46 |      45 | `checkpoint-anatomy`                            | Retained                                                                               |
|       47 |      46 | `redo-point-bounds-recovery`                    | Retained                                                                               |
|       48 |      47 | `max-wal-size-forces-checkpoints`               | Retained                                                                               |
|       49 |      48 | `base-backup`                                   | Retained                                                                               |
|       50 |      49 | `point-in-time-recovery`                        | Retained                                                                               |
|       51 |      50 | `timeline-history`                              | Retained                                                                               |
|       52 |      51 | `build-a-streaming-standby`                     | Retained                                                                               |
|       53 |      52 | `replication-lag-under-load`                    | Retained                                                                               |
|       54 |      53 | `synchronous-replication-blocks-commit`         | Retained                                                                               |
|       55 |      54 | `hot-standby-query-conflict`                    | Retained                                                                               |
|       56 |      55 | `replication-slot-retains-wal`                  | Retained                                                                               |
|       57 |      56 | `promote-the-standby`                           | Retained                                                                               |
|       58 |      57 | `rewind-the-old-primary`                        | Retained                                                                               |
|       59 |      58 | `cascading-and-failback`                        | Retained                                                                               |
|       60 |      59 | `decode-the-log`                                | Retained                                                                               |
|       61 |      60 | `slot-position-and-acknowledgement`             | Retained                                                                               |
|       62 |      61 | `publication-and-subscription`                  | Retained                                                                               |
|       63 |      62 | `initial-sync-vs-streaming`                     | Retained                                                                               |
|       64 |      63 | `conflicts-stop-the-apply-worker`               | Retained                                                                               |
|       65 |      64 | `slot-lag-and-disk`                             | Retained                                                                               |
|       66 |      65 | `explain-analyze-buffers`                       | Retained                                                                               |
|       67 |      66 | `statistics-drive-plans`                        | Retained                                                                               |
|       68 |      67 | `index-scan-vs-seq-scan-crossover`              | Retained                                                                               |
|       69 |      68 | `join-strategies`                               | Retained                                                                               |
|       70 |      69 | `work-mem-spills-to-disk`                       | Retained                                                                               |
|       71 |      70 | `parallel-query`                                | Retained                                                                               |
|       72 |      71 | `pg-stat-statements-as-tracing`                 | Retained                                                                               |
|       73 |      72 | `btree-page-anatomy`                            | Retained                                                                               |
|       74 |      73 | `index-only-scan-needs-visibility-map`          | Retained                                                                               |
|       75 |      74 | `create-index-concurrently-and-invalid-indexes` | Retained                                                                               |
|       76 |      75 | `partial-and-covering-indexes`                  | Retained                                                                               |
|       77 |      76 | `index-bloat-from-churn`                        | Retained                                                                               |
|       78 |      77 | `unique-index-enforcement-under-concurrency`    | Retained                                                                               |
|       79 |      78 | `wait-events-tell-you-where-time-goes`          | Retained                                                                               |
|       80 |      79 | `pg-stat-io-by-backend-type`                    | Retained                                                                               |
|       81 |      80 | `connection-saturation`                         | Retained                                                                               |
|       82 |      81 | `idle-in-transaction-kills-you`                 | Retained                                                                               |
|       83 |      82 | `table-and-index-usage-counters`                | Retained                                                                               |
|       84 |      83 | `read-the-server-log`                           | Retained                                                                               |
|       85 |      84 | `transactional-outbox`                          | Retained                                                                               |
|       86 |      85 | `idempotency-keys`                              | Retained                                                                               |
|       87 |      86 | `two-phase-commit`                              | Retained                                                                               |
|       88 |      24 | `optimistic-concurrency-with-version-columns`   | Moved to isolation; explicit conflict/merge decision                                   |
|       89 |      87 | `fencing-tokens-with-a-monotonic-counter`       | Retained                                                                               |
|       90 |      88 | `read-your-writes-on-a-replica`                 | Retained                                                                               |
|       91 |      89 | `listen-notify-as-a-bus`                        | Retained                                                                               |
|       92 |      90 | `abandoned-slot-fills-the-disk`                 | Retained                                                                               |
|       93 |      91 | `corrupt-a-page-and-detect-it`                  | Retained                                                                               |
|       94 |      92 | `wraparound-drill`                              | Retained                                                                               |
|       95 |      93 | `runaway-query-and-cancel`                      | Retained                                                                               |
|       96 |      94 | `postmortem-from-the-log`                       | Retained                                                                               |

## Added experiments

| Current | Stable slug              |
| ------: | ------------------------ |
|      29 | `unknown-commit-outcome` |

## Current reading stops

| After lesson | Slug                              |
| -----------: | --------------------------------- |
|           10 | `buffer-cache-and-io`             |
|           14 | `commit-visibility-and-clog`      |
|           20 | `autovacuum-triggers`             |
|           28 | `retry-loop-and-idempotency`      |
|           37 | `unique-constraint-race`          |
|           47 | `max-wal-size-forces-checkpoints` |
|           66 | `statistics-drive-plans`          |
