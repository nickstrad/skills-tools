# Paused replay and durable receive acceptance

Primary acceptance, 2026-09-05. Current70 replication-lag-under-load is revision4. The
source/standby topology is fresh for every core and variation. Actual paused state precedes the
workload; no timing-only assumption stands in for a stopped replay process.

## Live evidence

Core: /tmp/pg-replay-lag-core.log, /tmp/pg-owned-e4_g2fpj. Variation:
/tmp/pg-replay-lag-variation.log, /tmp/pg-owned-x7oa2uxc. Drivers: /tmp/pg-replay-lag-validate.ts
and /tmp/pg-replay-lag-{core,variation}.sh. Both roots retain received_but_not_applied.json,
replayed_and_verified.json, actual basebackup and separate source/standby logs. Both clusters and
owned slots are cleaned up.

Core replay remains0/A00060 while durable receive and acknowledged source flush reach 0/AA7A08,
a686,504-byte gap. Variation likewise freezes0/A00060 while flush reaches 0/B4D1B8, a1,364,312-byte
gap. Both sender and receiver remain streaming. During pause, both standby domain queries return
only original row0/amount1. Source has2,001 rows/ sum2,001,001 or4,001 rows/sum8,002,001. Distinct
IDs, min/max, every amount and payload pass.

After resume, the actual state becomes not paused, replay reaches the saved post-COMMIT bound, and
independent complete source/standby queries agree. Sampled resume-to-verified times were195.39ms
and156.77ms; the variation is not required to take longer. Final received-minus-replayed gaps are
zero in these samples. Source time-lag fields remain nonzero (replay_lag0.375804s /0.332105s),
illustrating why those asynchronous recent acknowledgement samples are not a requirement to observe
zero before accepting a read. The initial last_xact_replay_timestamp is NULL after bootstrap in
these runs and is retained honestly rather than fabricated as a zero timestamp.

## Integration

Exact copied-catalog hint2: /tmp/pg-replay-lag-rendered-replication-lag-under-load.md; output
/tmp/pg-replay-lag-exact-replication-lag-under-load.log. It executes the complete 4,000-receipt
workload with actual pause/receive/flush/stale rows/resume/domain assertions. Thirty tests and full
repository check pass (/tmp/pg-replay-lag-tests.log and /tmp/pg-replay-lag-check.log).

The isolated build changes only replication-lag-under-load;93 lessons/seven stops, first seven and
accepted capacity remain intact. Fresh copied catalog
/tmp/pg-observe-progress-ln3y14wv/progress.sqlite preserves all IDs, progress and attempts. Learner
hash during audit remains unchanged:
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6. Builder:
/tmp/pg-replay-lag-scoped-build.py.

Next: physical read-your-writes gate with a bounded timeout, same-history validation, post-COMMIT
token and independent receipt check; move that stable identity from14 only after the replacement
works. Replication, durable protocols and incidents remain active.
