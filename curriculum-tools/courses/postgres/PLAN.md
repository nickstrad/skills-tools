# PostgreSQL Systems: current module plan

Updated 2026-09-05. The course has 92 active lessons, seven bounded reading stops, and three new
identities replacing seven consolidated identities from the original 96-lesson course. The
[identity map](lesson-map.md) preserves that lineage without transferring completions. Original
completed lessons 1–7 remain identical. [REWORK-PLAN.md](REWORK-PLAN.md) records the authorized
change; [validation/](validation/) records actual execution evidence and its limits.

## Scope and intended outcome

This is a deep systems course for an engineer with Kubernetes production experience, Docker
familiarity and the background in [the learner profile](../../../docs/learner-profile.md). Shorten
familiar usage; do not assume unfamiliar internals are mastered. No host-init administration, new
web application or copying of the learner's repositories is required. Supplied CLI workloads keep
the work focused on PostgreSQL mechanisms and engineering decisions.

The progression is read → predict → run supplied commands → inspect → explain → vary → apply. Early
lessons introduce mechanisms with complete scaffolding. Isolation/locking require explicit
invariants and concurrency decisions. Performance requires controlled measurements. Recovery and
replication require full state/history reconciliation. Durable protocols join independent commits.
The final incidents ask the learner to choose evidence/remedies; the capstone requires a complete
operation history and a defended correctness/recovery/capacity decision. Runnable hints and full
worked commands remain available throughout; syntax recall is not the assessment.

The recurring request/job/result/receipt workload connects short claims, retry identity, durable
outcomes, independent effects and bounded admission. Early tiny tables isolate a cause; later
fixtures are independently initialized and do not depend on a predecessor leaving a topology live.
The final task runner proves the tested accepted-work obligation, deduplicated receiver effect,
reclaimed abandoned claim, stale-completion rejection, missed-wake-up reconciliation, chosen receipt
freshness and measured overload failure. Logs/LSNs/timelines support the account. Shared-host tests
do not establish network partitions, consensus or independent host availability.

## First operational task: resource ownership and cleanup

Read `/root/disk-usage-report.md` when available and verify its claims against current resources.
Follow [the cleanup policy](../../../docs/knowledge/vm-resource-cleanup.md). On this VM the learner
lab is `/labs/pglab/primary`, port 5440, socket `/tmp`, database lab; discover current paths before
operating an environment. Do not recreate the retired `/var/lib/postgresql/pglab` validation tree
because an original lesson or historical report names it. Preserve the learner's data and progress.

Author crash/replication/incident trials use unique private directories and sockets. Budget primary,
standby, backup, archive and restored copies, retain at least 2 GB free and twice the next trial's
peak footprint, and bound process lifetimes. Stop owned clients/servers in failure cleanup. Record
needed findings, remove disposable raw state after acceptance and give any retained audit archive a
named removal trigger. Finish the final evidence audit and reclaim its bulky inputs before declaring
a whole task complete. A stopped server alone has not released its files.

## Reading and identity

Mandatory core stops follow current 10,14,20,28,37,39,60. The
[canonical checkpoint plan](../../../docs/books/postgresql-14-internals/study-checkpoint-plan.md)
contains their bounded excerpts and PostgreSQL14/16 exclusions. The
[current citation map](../../../docs/books/postgresql-14-internals/reading-map.md) matches every
active slug. Reuse the canonical research instead of rereading the PDF. The book does not cover most
replication/distributed protocols; closest-background citations are explicitly limited.

The tables below give current numbers, stable identities, key commands, the phenomenon/evidence and
the engineering decision. Each lesson's full syntax breakdown explains its complete command
inventory and measurement limits. Source order is curriculum/mod.ts; edit curriculum TypeScript,
then build lessons.json. Keep unrelated work and learner progress intact.

## 1–4: Own a whole node: build a disposable lab cluster

| Current / stable identity  | Key commands          | Experiment and required evidence                                             | Learner decision / systems principle                    |
| -------------------------- | --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1 `build-lab-cluster`      | initdb; pg_ctl; psql  | Create a disposable cluster and verify its files, settings and connectivity. | Identify the owned node before operating it.            |
| 2 `shell-and-psql-toolkit` | psql; gset; timing    | Run the shell/psql toolkit and distinguish client commands from SQL.         | Choose the right execution context.                     |
| 3 `install-lab-extensions` | CREATE EXTENSION; \dx | Install the inspection tools and verify their availability.                  | Know which observations need extensions and privileges. |
| 4 `process-model`          | pg_stat_activity; ps  | Correlate live server processes, sessions and memory roles.                  | Explain backend ownership and process lifetime.         |

## 5–10: Storage: pages, tuples, and the buffer cache

| Current / stable identity         | Key commands                               | Experiment and required evidence                                          | Learner decision / systems principle                            |
| --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 5 `table-is-a-file`               | pg_relation_filepath; pg_relation_size     | Match relation files and page-aligned size to stored rows.                | Separate logical relations from physical files.                 |
| 6 `page-header-and-line-pointers` | get_raw_page; page_header; heap_page_items | Inspect real page headers, slots and tuple locations.                     | Read physical evidence without confusing slots with keys.       |
| 7 `update-writes-a-new-tuple`     | UPDATE; heap_page_items                    | Follow successive row versions and their physical links.                  | Explain a logical update's physical version history.            |
| 8 `hot-updates-and-fillfactor`    | fillfactor; HOT counters                   | Compare indexed/unindexed updates and space available for HOT.            | Defend reserved space against update and index costs.           |
| 9 `toast-and-large-values`        | pg_column_size; TOAST chunks; EXPLAIN      | Compare compression, external chunks, projection and payload replacement. | Separate visible chunks, allocated bytes and execution buffers. |
| 10 `buffer-cache-and-io`          | pg_buffercache; EXPLAIN BUFFERS            | Observe residency, cache hits and dirty-page transitions.                 | Distinguish cached access from durable storage work.            |

## 11–16: MVCC: versions, snapshots, and horizons

| Current / stable identity                | Key commands                                       | Experiment and required evidence                                   | Learner decision / systems principle              |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| 11 `xids-and-the-transaction-counter`    | pg_current_xact_id; pg_current_xact_id_if_assigned | Observe when transactions obtain identities.                       | Separate virtual activity from assigned XIDs.     |
| 12 `snapshot-anatomy`                    | pg_current_snapshot; snapshot functions            | Read actual snapshot bounds and in-progress identities.            | Explain what a snapshot includes and excludes.    |
| 13 `two-sessions-see-different-versions` | BEGIN; REPEATABLE READ; SELECT                     | Hold concurrent snapshots over committed row changes.              | Predict which version each reader can see.        |
| 14 `commit-visibility-and-clog`          | heap_page_items; pg_xact_status                    | Compare transaction outcome, visibility and tuple hint bits.       | Avoid inferring commit status from one raw field. |
| 15 `xmin-horizon-blocks-cleanup`         | VACUUM; backend_xmin                               | Keep a reader open and observe retained versions, then release it. | Identify the dependency blocking cleanup.         |
| 16 `wraparound-and-freezing`             | VACUUM FREEZE; tuple flags                         | Observe freezing and transaction-age metadata on bounded data.     | Distinguish frozen tuples from catalog age.       |

## 17–20: Vacuum: dead tuples, visibility, bloat, and freezing

| Current / stable identity                | Key commands                             | Experiment and required evidence                              | Learner decision / systems principle                     |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| 17 `vacuum-reclaims-in-place`            | VACUUM; FSM; relation sizes              | Reclaim and reuse space without assuming file shrinkage.      | Choose reuse evidence over a row-count shortcut.         |
| 18 `vacuum-full-rewrites-and-locks`      | VACUUM FULL; pg_locks                    | Observe an exclusive rewrite and physical file replacement.   | Account for blocking and temporary rewrite space.        |
| 19 `visibility-map-and-index-only-scans` | visibility map; EXPLAIN                  | Change visibility and observe index-only heap fetches.        | Explain when covering data still needs heap access.      |
| 20 `autovacuum-triggers`                 | autovacuum settings; pg_stat_user_tables | Cause maintenance eligibility and observe backlog/completion. | Separate trigger eligibility from completed reclamation. |

## 21–29: Transactions and isolation anomalies

| Current / stable identity                        | Key commands                                | Experiment and required evidence                                         | Learner decision / systems principle                    |
| ------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| 21 `atomic-abort`                                | BEGIN; errors; ROLLBACK                     | Cause a failed transaction and verify atomic rollback.                   | Distinguish an error from a usable transaction.         |
| 22 `read-committed-sees-each-statement`          | READ COMMITTED; concurrent SELECT           | Observe fresh statement snapshots within one transaction.                | Choose where a coherent read boundary is needed.        |
| 23 `lost-update-under-read-committed`            | UPDATE; concurrent read/modify/write        | Cause a lost update and compare a protected mutation.                    | Place the invariant at the serialization point.         |
| 24 `optimistic-concurrency-with-version-columns` | version predicate; UPDATE RETURNING         | Reject a stale edit, then explicitly reread and merge.                   | Choose conflict rejection or a valid application merge. |
| 25 `repeatable-read-blocks-then-fails`           | REPEATABLE READ; concurrent UPDATE          | Observe blocking followed by a serialization failure.                    | Restart work with a fresh snapshot after abort.         |
| 26 `write-skew`                                  | concurrent predicate reads/writes           | Cause write skew across individually valid row updates.                  | Name the cross-row invariant that failed.               |
| 27 `serializable-ssi`                            | SERIALIZABLE; SSI; SQLSTATE                 | Observe a dangerous dependency and a rejected transaction.               | Defend isolation using the actual invariant.            |
| 28 `retry-loop-and-idempotency`                  | fresh transactions; SQLSTATE retry loop     | Run bounded retries and classify actual aborts.                          | Separate retryable failure from an unknown outcome.     |
| 29 `unknown-commit-outcome`                      | request receipt; atomic debit; fresh lookup | Hide known outcomes and reconcile retained identity, payload and result. | Replay the same request without repeating its effect.   |

## 30–37: Locks, queues, deadlocks, and DDL

| Current / stable identity         | Key commands                                 | Experiment and required evidence                                         | Learner decision / systems principle                           |
| --------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 30 `row-locks-are-in-the-tuple`   | SELECT FOR UPDATE; tuple headers             | Inspect actual row-lock state and transactional ownership.               | Separate tuple lock evidence from table-level metadata.        |
| 31 `lock-queue-and-blocking-pids` | pg_blocking_pids; pg_stat_activity           | Build a real wait chain and correlate exact backends.                    | Draw the dependency before selecting a remedy.                 |
| 32 `deadlock-detection`           | deadlock detector; ROLLBACK                  | Cause a cycle and recover whichever transaction is chosen as victim.     | Make cleanup independent of victim identity.                   |
| 33 `lock-timeout-and-nowait`      | lock_timeout; NOWAIT                         | Bound actual lock acquisition and inspect transaction aftermath.         | Choose waiting versus immediate rejection.                     |
| 34 `ddl-behind-a-long-query`      | ALTER TABLE; lock queue                      | Queue metadata-only DDL behind a long transaction and bound its wait.    | Separate metadata cost from lock availability.                 |
| 35 `advisory-locks-as-leases`     | pg_try_advisory_lock; session loss           | Verify session-scoped exclusion and release on actual disconnection.     | Avoid treating an advisory lock as a lease or election.        |
| 36 `skip-locked-work-queue`       | SKIP LOCKED; generations; guarded completion | Commit short claims, reclaim expired work and reject a stale completion. | Protect local results without holding work-duration row locks. |
| 37 `unique-constraint-race`       | UNIQUE; concurrent INSERT                    | Observe uniqueness waiting and commit/abort-dependent outcomes.          | Locate constraint enforcement's serialization point.           |

## 38–44: The planner, statistics, and execution

| Current / stable identity             | Key commands                           | Experiment and required evidence                                           | Learner decision / systems principle                          |
| ------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 38 `explain-analyze-buffers`          | EXPLAIN ANALYZE BUFFERS                | Compare estimates, execution and buffer work for fixed answers.            | Keep modeled cost separate from measured work.                |
| 39 `statistics-drive-plans`           | ANALYZE; statistics target             | Change statistical evidence and compare row estimates with reality.        | Choose evidence for misestimation before tuning execution.    |
| 40 `index-scan-vs-seq-scan-crossover` | indexes; selective predicates; EXPLAIN | Vary selectivity and observe access-path crossover.                        | Defend an access path for the actual workload.                |
| 41 `join-strategies`                  | join controls; Memoize; EXPLAIN        | Compare join work and repeated inner probes under controlled shapes.       | Identify which input/work pattern benefits from caching.      |
| 42 `work-mem-spills-to-disk`          | work_mem; sort/hash plans              | Cause spills and compare memory-resident execution with unchanged answers. | Budget per-operation memory and temporary work.               |
| 43 `parallel-query`                   | parallel settings; launched workers    | Compare planned and actually launched parallel execution.                  | Distinguish requested parallelism from delivered capacity.    |
| 44 `pg-stat-statements-as-tracing`    | pg_stat_statements; interval deltas    | Measure scoped aggregate calls/work with reset-retention checks.           | Use aggregates without pretending they are individual traces. |

## 45–51: Indexes: B-tree internals, concurrent builds, and bloat

| Current / stable identity                          | Key commands                               | Experiment and required evidence                                              | Learner decision / systems principle                       |
| -------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 45 `btree-page-anatomy`                            | bt_page_items; page statistics             | Inspect B-tree structure and page evolution.                                  | Connect index layout to lookup and maintenance work.       |
| 46 `create-index-concurrently-and-invalid-indexes` | CREATE INDEX CONCURRENTLY; progress views  | Observe concurrent-build phases, waiting and invalid-index outcomes.          | Verify build completion and handle failed artifacts.       |
| 47 `bounded-online-migration`                      | bounded backfill; constraints; SKIP LOCKED | Migrate populated data while accounting for skipped and invalid rows.         | Prove schema/data readiness before tightening constraints. |
| 48 `partial-and-covering-indexes`                  | partial/covering indexes; HOT counters     | Compare read benefits with predicate coverage and update amplification.       | Price an index across both reads and writes.               |
| 49 `index-bloat-from-churn`                        | churn; index size; REINDEX                 | Observe index growth and a measured rebuild outcome.                          | Distinguish retained allocation from useful access work.   |
| 50 `unique-index-enforcement-under-concurrency`    | UNIQUE index; concurrent writers           | Exercise constraint behavior across competing transactions.                   | Preserve correctness while interpreting index behavior.    |
| 51 `keyset-pagination-and-concurrent-writes`       | OFFSET; composite seek; snapshots          | Compare pagination during concurrent changes and a stable-snapshot variation. | Choose ordering and consistency contracts together.        |

## 52–57: The write-ahead log: records, durability, crash redo

| Current / stable identity              | Key commands                                | Experiment and required evidence                                      | Learner decision / systems principle                              |
| -------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 52 `every-change-is-a-wal-record`      | pg_walinspect; XID-filtered records         | Cause writes and inspect physical records and transaction outcomes.   | Account for WAL work beyond the final visible rows.               |
| 53 `full-page-writes-after-checkpoint` | checkpoints; full-page images               | Compare actual image records and compression under controlled writes. | Measure write amplification instead of assuming fixed image cost. |
| 54 `commit-means-fsync`                | synchronous_commit; concurrent commits      | Measure acknowledgement cost, overlap and tested crash outcomes.      | Defend durability policy separately from throughput.              |
| 55 `wal-files-and-recycling`           | WAL segments; archive_command               | Produce/recycle WAL and test bounded archiving failure/recovery.      | Treat retention dependencies as storage obligations.              |
| 56 `crash-and-redo`                    | immediate stop; pg_waldump; restart         | Cause a real crash and reconcile physical redo with visible data.     | Separate durable records from committed application state.        |
| 57 `wal-size-of-operations`            | WAL intervals; controlled operation batches | Measure operation and transaction-layout amplification.               | Compare equivalent work before choosing a write pattern.          |

## 58–62: Checkpoints, backups, and point-in-time recovery

| Current / stable identity            | Key commands                                | Experiment and required evidence                                         | Learner decision / systems principle                             |
| ------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 58 `checkpoint-anatomy`              | pg_buffercache; checkpoint; file inspection | Track dirty buffers, physical pages and completed checkpoint work.       | Establish the observation and flush boundaries explicitly.       |
| 59 `redo-point-bounds-recovery`      | checkpoint age; crash recovery              | Compare retained redo work under controlled recovery histories.          | Explain measured recovery cost without promising production RTO. |
| 60 `max-wal-size-forces-checkpoints` | max_wal_size; checkpoint counters           | Cause bounded WAL pressure and observe requested/performed checkpoints.  | Treat WAL settings as thresholds, not hard disk quotas.          |
| 61 `base-backup`                     | pg_basebackup; pg_verifybackup; restore     | Restore a verified backup and check complete application state.          | Require recovered meaning beyond startup or file checks.         |
| 62 `point-in-time-recovery`          | named recovery targets; timelines           | Restore two actual branches and reconcile target/history/row boundaries. | Choose a recovery point and account for omitted accepted work.   |

## 63–68: Wait events, I/O stats, and capacity

| Current / stable identity                 | Key commands                               | Experiment and required evidence                                           | Learner decision / systems principle                           |
| ----------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 63 `wait-events-tell-you-where-time-goes` | pg_stat_activity; wait sampling            | Compare lock, timer and idle states with exact backend correlations.       | Distinguish the observed dependency from unrelated activity.   |
| 64 `pg-stat-io-by-backend-type`           | pg_stat_io; controlled scans               | Compare scoped I/O deltas across workload/cache conditions.                | Keep cluster counters and physical-device claims separate.     |
| 65 `connection-saturation`                | pgbench; bounded clients; transaction logs | Measure repeated controlled concurrency, latency and exact committed work. | Choose capacity from failures, backlog and resource evidence.  |
| 66 `idle-in-transaction-kills-you`        | statement/idle deadlines; client SQLSTATE  | Observe cancellation, transaction recovery and idle-session termination.   | Align deadlines with connection and commit boundaries.         |
| 67 `table-and-index-usage-counters`       | usage counters; constraint catalog         | Observe used/unused indexes and a correctness-preserving comparison.       | Avoid dropping a constraint because its scan counter is zero.  |
| 68 `read-the-server-log`                  | log_lock_waits; bounded log slice          | Correlate a wait and final transaction outcome with real appended logs.    | Read the right interval and distinguish commit from execution. |

## 69–77: Physical streaming replication and failover

| Current / stable identity                  | Key commands                                 | Experiment and required evidence                                                  | Learner decision / systems principle                                 |
| ------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 69 `build-a-streaming-standby`             | pg_basebackup; sender/receiver; WAL marker   | Verify a real standby, streamed receipts and receiver reconnection.               | Check topology identity and complete data before claiming readiness. |
| 70 `replication-lag-under-load`            | replay pause; receive/flush/replay LSNs      | Receive WAL while rows remain stale, then replay a real marker.                   | Separate transport durability from applied state.                    |
| 71 `read-your-writes-on-a-replica`         | same-history token; bounded receipt gate     | Reject wrong histories, time out without data and read after replay.              | Defend freshness, authority and explicit fallback separately.        |
| 72 `synchronous-replication-blocks-commit` | synchronous_commit; SyncRep; exact COMMIT    | Compare local, remote-flush and remote-apply waits and cancelled acknowledgement. | Reconcile a locally committed request with its remote promise.       |
| 73 `hot-standby-query-conflict`            | standby snapshots; feedback; VACUUM          | Cause a recovery conflict and measure feedback-retained history.                  | Choose reader continuity versus cleanup/replay costs.                |
| 74 `replication-slot-retains-wal`          | physical slot; checkpoints; reinitialization | Retain then lose required history and validate consumer reconstruction.           | Account for retention limits and recovery obligations.               |
| 75 `promote-the-standby`                   | promotion; authority fence; branch receipts  | Preserve split-brain evidence and execute controlled writer cutover.              | Choose one authority and identify lost acknowledgements.             |
| 76 `rewind-the-old-primary`                | pg_rewind; divergence inventory              | Rewind the old source against the chosen history and verify discarded work.       | Make branch-loss decisions explicit before joining histories.        |
| 77 `cascading-and-failback`                | catch-up; fenced failback; optional cascade  | Move authority back through a verified receipt boundary.                          | Separate topology convenience from availability guarantees.          |

## 78–82: Logical decoding, CDC, and publications

| Current / stable identity              | Key commands                              | Experiment and required evidence                                               | Learner decision / systems principle                                |
| -------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 78 `decode-the-log`                    | physical WAL; test_decoding; flush gate   | Compare commit/abort, row/schema evidence and actual delivery ordering.        | Do not infer committed delivery from XID or row-LSN order.          |
| 79 `slot-position-and-acknowledgement` | logical slot; independent receiver commit | Lose acknowledgement and replay into deduplicated receiver effects.            | Advance a source cursor only after durable receiver outcome.        |
| 80 `publication-and-subscription`      | publication/subscription; COPY/tail audit | Observe initial and added-table handoffs while existing work streams.          | Reconcile snapshot and tail without inventing missing history.      |
| 81 `conflicts-stop-the-apply-worker`   | apply errors; repair/skip; reconciliation | Cause real logical conflicts and check every repaired/skipped operation.       | Price error recovery in application state, not worker status alone. |
| 82 `slot-lag-and-disk`                 | slot recreation; resnapshot; later tail   | Lose a cursor, observe ineffective repair and rebuild complete receiver state. | State which history must survive for a valid recovery.              |

## 83–87: Distributed-systems patterns on PostgreSQL

| Current / stable identity                    | Key commands                                    | Experiment and required evidence                                             | Learner decision / systems principle                                  |
| -------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 83 `transactional-outbox`                    | transactional outbox; relay; receiver receipt   | Lose real relay processes across independent commits and deduplicate replay. | Separate source acknowledgement from external effect durability.      |
| 84 `idempotency-keys`                        | idempotency interface; snapshot race; retention | Exercise duplicate races, result replay and forgotten-identity failure.      | Choose identity lifetime and payload agreement as protocol rules.     |
| 85 `two-phase-commit`                        | PREPARE TRANSACTION; durable decision           | Lose a coordinator and recover known participants from a committed decision. | Resolve durable obligations without guessing from absent GIDs.        |
| 86 `fencing-tokens-with-a-monotonic-counter` | restricted roles; epochs; resource interface    | Reject stale, missing-token and direct-DML attempts at the guarded resource. | Identify when the resource actually accepts a newer fence.            |
| 87 `listen-notify-as-a-bus`                  | LISTEN/NOTIFY; durable scan; receipts           | Lose listeners and reconcile work despite missed/coalesced wake-ups.         | Treat notifications as hints and durable state as the work inventory. |

## 88–92: Capstone incidents: read the symptom, find the cause, get the cluster back

| Current / stable identity          | Key commands                                | Experiment and required evidence                                                  | Learner decision / systems principle                                  |
| ---------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 88 `abandoned-slot-fills-the-disk` | WAL/slot/archive evidence; explicit remedy  | Diagnose one of three growth causes and verify application recovery.              | Choose remediation from evidence and price consumer reconstruction.   |
| 89 `corrupt-a-page-and-detect-it`  | checksums; cold backup; separate restore    | Detect bounded corruption and reconcile the restored accepted-operation boundary. | Distinguish readable storage from recovered application completeness. |
| 90 `wraparound-drill`              | tuple flags; horizons; durable 2PC decision | Resolve a freeze plateau while preserving the required participant outcome.       | Release the actual dependency with the correct decision.              |
| 91 `runaway-query-and-cancel`      | activity/CPU evidence; cancel/terminate     | Measure a missed request budget and verify fresh-policy session/data outcomes.    | Choose the least disruptive intervention and check completion.        |
| 92 `postmortem-from-the-log`       | task runner; process loss; bounded arrivals | Reconcile every accepted/rejected/retried identity through recovery and load.     | Defend correctness, admission and concurrency with measured limits.   |

## Tags and navigation

Use the tutor topics command for the current vocabulary and progress; tags connect mechanisms across
modules rather than assign fixed chapter numbers. Current categories are `lab-setup`, `storage`,
`mvcc`, `vacuum`, `isolation`, `locking`, `query-planning`, `indexes`, `wal`, `checkpointing`,
`observability`, `replication`, `logical-replication`, `distributed-patterns`, `reliability`.
