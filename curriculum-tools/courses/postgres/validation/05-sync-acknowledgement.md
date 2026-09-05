# Synchronous acknowledgement acceptance

Primary acceptance, 2026-09-05. Current72 synchronous-replication-blocks-commit is revision4, using
a fresh owned physical source/standby. The lesson replaces timing-only claims and a shared lab reset
with actual policy boundaries, WAL evidence and authoritative receipt reconciliation.

## Live evidence

Core: /tmp/pg-sync-acknowledgement-core.log, /tmp/pg-owned-4iu81ar9. Variation:
/tmp/pg-sync-acknowledgement-variation.log, /tmp/pg-owned-4mqp7h1h. Driver:
/tmp/pg-sync-acknowledgement-validate.ts. Complete supplied scripts:
/tmp/pg-sync-acknowledgement-{core,variation}.sh. Each owned root retains client stdout/stderr, JSON
observations, verified basebackup evidence and source/standby logs.

FIRST1 selects owned_standby with sync_state=sync. Replay pauses at0/A01F80. IDs1/local and2/on
return ordinary COMMIT while standby remains empty; durable receive reaches0/A08788.
ID3/remote_apply waits in IPC/SyncRep. Its XID735 matches the WAL Transaction/COMMIT
record0/A09200–0/A09228; primary flush and standby flushed receive reach0/A10000 in both final
source runs. A separate primary query still sees only IDs1–2 during the wait. The script now asserts
this distinction. Resume completes the acknowledgement and fresh statements see IDs1–3 on both nodes
without an extra read-side replay wait for that remote_apply response.

After actual standby shutdown and sender disappearance, ID4/local completes. ID5/on waits in
SyncRep; XID737's COMMIT at0/A11308–0/A11330 is locally flushed while only IDs1–4 are independently
visible. Core pg_cancel_backend targets this actual waiting PID. The client returns0 and COMMIT, but
WARNING/01000 says the acknowledgement wait was canceled and local commit already occurred without
ensuring replication. All five primary receipts become visible while standby is still stopped. This
is not rollback and does not prove the originally requested remote guarantee.

The variation changes only that wait's resolution: reconnect instead of cancel. ID5 then receives
ordinary COMMIT with empty stderr. Final replay-bound and complete ordered values agree for IDs1–5
on both nodes. The labels/policies are paused local/local, paused remote flush/on, paused remote
apply/remote_apply, offline local/local and offline required flush/on. No missing/extra row or
payload mismatch is accepted. All owned clients and both server pairs stop, slots removed.

## Integration

Exact current72 copied-catalog hint2:
/tmp/pg-sync-acknowledgement-rendered-synchronous-replication-blocks-commit.md. Output:
/tmp/pg-sync-acknowledgement-exact-synchronous-replication-blocks-commit.log; root
/tmp/pg-owned-81v9f4kh. It repeats the full reconnection variation, matches the same COMMIT records
and visibility boundaries, then verifies all receipts and cleanup. ID3's sampled client duration
is269.65ms; reconnected ID5 is303.86ms. These include driver observation/startup and deliberate
waiting, not a throughput, latency-distribution or independent-host availability measurement.

Thirty tests and full repository check pass in /tmp/pg-sync-acknowledgement-{tests,check}.log.
/tmp/pg-sync-acknowledgement-scoped-build.py proves only this lesson object changes.93 lessons,
seven reading stops, first seven and accepted capacity remain intact. Fresh copied catalog
/tmp/pg-observe-progress-vpgerq_l/progress.sqlite preserves all existing IDs/progress/attempts.
Learner hash remains395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

Next: current73 hot-standby-query-conflict; actual recovery cancellation versus feedback-held xmin,
retained primary versions, reader survival and reclamation after release. Chunks5–7 remain active.
