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
