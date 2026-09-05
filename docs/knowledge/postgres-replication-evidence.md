# PostgreSQL replication evidence

Use owned topologies and complete application outcomes to distinguish transport, replay and authority.
Updated 2026-09-05.

## What happened

The first physical replication replacement creates a new source and a verified pg_basebackup -R
copy with a dedicated LOGIN REPLICATION role and persistent physical slot. Distinct private
sockets, matching system identity, actual sender/receiver endpoints, recovery roles and full
post-backup receipt contents pass. A real standby write fails SQLSTATE25006 without adding data.

The receiver variation initially tried pg_terminate_backend, which returned false for this
auxiliary process on PostgreSQL16. The accepted driver sends SIGTERM only to the PID obtained
from pg_stat_wal_receiver on the owned standby. It proves a replacement streaming PID, new log
line, a later replay boundary and complete receipt equality. This does not require a particular
stale-read interval during a potentially fast reconnect.

## Why it matters

A physical copy's system identifier does not establish freshness or writer ownership. A transport
status does not prove a specific commit has replayed. A successful receiver restart does not prove
failover. Each conclusion needs its own observed boundary; read-only rejection must be an actual
SQLSTATE result rather than an unrelated connection failure.

Post-backup configuration edits must follow pg_verifybackup; otherwise the verifier can report
those intentional edits instead of testing the original copy. Preserve pg_basebackup -R's source
primary_conninfo while overriding only the standby socket/name/settings. The receiver feedback
interval is expressed in seconds; use1s rather than a subsecond value that can round to disabled.

## How to apply

Use owned-replication.ts without changing the existing owned-cluster helper embedded in accepted
lessons. Poll streaming state and replay positions, then inspect complete domain values with a new
query. Capture receiver PID from the known owned server before a targeted signal. Keep raw logs and
classify expected25006 and receiver termination separately from unexpected failures.

Stop the standby, poll its physical slot inactive, drop only that slot and stop the source. Do not
leave a cross-lesson shared topology or hidden consumer-retention promise. Lifecycle/failure trials
remain serial. See validation/05-standby.md for source and exact rendered-variation paths.

References: PostgreSQL16 [standby operation and streaming](https://www.postgresql.org/docs/16/warm-standby.html)
and [hot standby](https://www.postgresql.org/docs/16/hot-standby.html). Runtime observations above
come from the repository's actual experiments rather than those documents.

## Paused replay, durable receive and feedback (2026-09-05)

### What happened

The driver waits for pg_get_wal_replay_pause_state='paused', saves replay LSN, then commits
2,000/4,000 receipts. Receiver flushed_lsn and source pg_stat_replication.flush_lsn separately
reach the post-COMMIT bound, while replay remains fixed and a fresh standby query returns only
the original row. Resuming actual replay and checking complete values produces2,001/4,001
correct rows, with zero missing/extra IDs and expected sums.

### Why it matters

A pause request is not yet a paused process. Local receiver flush and the source's receipt of
that acknowledgement are also separate observed boundaries. Neither establishes visibility
before replay. After catch-up, source replay_lag can remain a positive recent acknowledgement
sample even when direct standby receive/replay positions match. Initial transaction replay
timestamps can be NULL after bootstrap; preserving NULL is preferable to inventing a time origin.

### How to apply

Wait for actual paused state, require a fixed replay position while receive/flush advances, and
prove stale rows independently. Gate resumed reads on the intended committed bound within one
known history, then check every application value under a fresh query. Preserve time-lag fields
as asynchronous observations rather than asserting that they become zero. Bounded workload and
finally cleanup prevent a paused consumer from leaving an unbounded retention obligation.
Source and exact CLI evidence: validation/05-replay-lag.md.
