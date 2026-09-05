# Durability and recovery contract

Primary sequential implementation,2026-09-05. Continue the accepted observability approach across
original39–51 (current52–64). Preserve completed original1–7; preserve surviving slugs and use
revision4. Keep supplied core code and exact runnable variations. No learner database writes and no
port5440 operations. Existing uncommitted guides/02-storage.ts changes belong to other work.

## WAL evidence first

- **every-change-is-a-wal-record:** identify the measured transaction's xid and relation blocks,
  retain committed and aborted work in the decoded stream, and independently verify SQL-visible
  outcomes. Capture insert-position bounds, then establish a flush boundary for decoding. Cluster
  LSN distance is an interval, not exact per-request attribution. Do not claim one record per SQL
  change or that the complete database can be rebuilt from an arbitrary retained WAL suffix.
- **full-page-writes-after-checkpoint:** retain full_page_writes throughout. Compare the first and
  second modification of an owned page, then a new first touch after another checkpoint. Inspect
  actual fpi_length and total record bytes; do not promise exactly8KB. Vary only session WAL image
  compression with repeatable page contents; restore settings. No unsafe global off/on demo.
- **commit-means-fsync:** bounded repeated pgbench trials, fixed generator configuration and
  unchanged committed-counter invariant, comparing synchronous_commit on/off and1/4 clients. Retain
  raw latency samples, useful-operation denominator, WAL sync method/counters and failure counts.
  Explain group commit and asynchronous durability risk without inferring a lost commit from a
  throughput improvement or claiming one physical fsync per transaction.
- **wal-files-and-recycling:** owned archive input/output and bounded WAL generation. Cause an
  archive-command failure, observe retained segments and failure state, repair it and observe actual
  archive catch-up. Retention budget is not a hard disk ceiling. Restore configuration/owned
  topology.
- **crash-and-redo:** include physical WAL inspection and independent data assertions in the same
  crash exercise. Crash only an owned cluster after one committed transaction and one deliberately
  unfinished transaction have produced WAL. Prove recovery, committed data retained and unfinished
  data absent, with bounded service readiness and fresh log evidence. Variation changes the
  transaction decision before the same crash.
- **wal-replay-is-deterministic:** consolidate into crash-and-redo once coverage above is executed;
  preserve deeper record decoding as runnable optional depth. Do not retire the identity before
  replacing its prerequisites and recording coverage.
- **wal-size-of-operations:** matched fresh layouts for ingestion methods and indexed/non-indexed
  updates; equivalent data and transaction boundaries, actual WAL records and per-useful-operation
  totals. Separate batch/commit overhead from fsync calls. Exact guarded-no-op variation compares
  unchanged logical answers while avoiding redundant tuple work.

## Checkpoints and actual recovery

- **checkpoint-anatomy:** bounded dirty workload, checkpoint delta, control-file/recovery position
  and actual page/WAL observations. Explain write-ahead ordering and that a checkpoint is neither a
  full database snapshot nor cache eviction. Preserve per-session settings.
- **redo-point-bounds-recovery:** matched owned-cluster trials with different checkpoint positions;
  measure WAL distance, observed replay evidence and client-ready/domain-ready elapsed time. Report
  these as sampled recovery costs, not a direct conversion from LSN distance to RTO.
- **max-wal-size-forces-checkpoints:** bounded generated WAL and observed requested checkpoint
  counters under a small private budget, with actual-setting readiness. Separate soft WAL target
  from archive/slot retention; return the cluster to known settings.
- **base-backup:** create an actual backup from an owned source, verify it and restore
  independently. Assert domain rows/constraints/results after readiness. An archive listing or
  backup success message alone is insufficient. Exercise missing required WAL in a disposable
  restore input and require a bounded, classified recovery failure.
- **point-in-time-recovery:** capture a named target before a destructive committed transaction,
  archive required history, restore from the actual backup to the target, verify domain invariants
  and actual branch/history identity. Variation selects a later target and predicts the resulting
  domain state. Preserve original evidence while both restored histories are inspected.
- **timeline-history:** consolidate artifact-only inspection into the actual PITR branch and later
  promotion/rewind work, after that behavior is validated. Do not describe positions from divergent
  histories as directly comparable authority or readiness tokens.

## Delivery and audit

Implement one coherent subsection at a time. New process helpers must own unique directories,
ports/sockets and subprocesses, bound startup/stop/polling, and retain useful logs. Shell lessons
are executed separately from the SQL harness. Verify each core and exact rendered hint, classify
errors, check first7/current progress on a copy, and update identity/reading maps on consolidation.
Commit and push each accepted subsection with handoff and durable findings. Recovery completion
requires actual restores and failures, not just static code review. After chunk4 proceed to
replication, durable protocols and incidents; the active goal is the entire remaining refactor.
