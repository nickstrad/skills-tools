# WAL-pressure checkpoint acceptance

Primary acceptance, 2026-09-05. Current 60 max-wal-size-forces-checkpoints is revision 4, using two
fresh owned PostgreSQL 16 clusters per core/variation. Both receive identical 1,000-row committed
batches, with only max_wal_size varied between 8MB and 128MB. The core study checkpoint retains both
original core book excerpts; its prose now avoids stale ordinal references and points to the
following actual base-backup experiment.

## Runtime evidence

Core: /tmp/pg-wal-pressure-core.log, comparison /tmp/pg-wal-pressure-dazlbcwm. Variation:
/tmp/pg-wal-pressure-variation.log, /tmp/pg-wal-pressure-oj6g76cp. Each comparison has raw budget
logs and results.json naming its owned clusters; each cluster retains per-batch samples.json and
fresh pressure.log. All four source clusters stopped.

| Batches / budget | Requested delta / WAL starts | Produced address distance | Peak sampled segments | Final segments |
| ---------------- | ---------------------------: | ------------------------: | --------------------: | -------------: |
| 32 / 8MB         |                        1 / 1 |          13,976,984 bytes |                   9MB |            8MB |
| 32 / 128MB       |                        0 / 0 |          13,963,464 bytes |                  14MB |           14MB |
| 64 / 8MB         |                        3 / 3 |          27,929,440 bytes |                   9MB |            8MB |
| 64 / 128MB       |                        0 / 0 |          27,895,872 bytes |                  27MB |           27MB |

All timed checkpoint deltas are zero and reset epochs are fixed. Small-budget fresh logs contain
WAL-reason starts and completed checkpoints; no manual checkpoint occurs in the measured interval.
The small-budget checkpoint buffer deltas are 851 / 2,542; high-budget deltas are zero. No exact
future counter count or byte-attribution claim is required.

Both core budgets preserve 32,000 distinct IDs and total amount 512,016,000, with every amount=id
and exact 300-character payload. Variation preserves 64,000 / 2,048,032,000. Both budgets have equal
settings aside from their controlled value; archive_mode=off, wal_keep_size=0 and no slots isolate
checkpoint scheduling from consumer retention. Each active budget is verified in MB from
postgresql.auto.conf with no pending restart; finally restores 128MB from postgresql.conf and
verifies only that override is absent.

checkpoint_completion_target=0 removes pacing only for this bounded fixture; the lesson does not
recommend it for deployment. Sampled 9MB at an 8MB target is direct soft-target evidence here, while
the accepted archive lesson separately demonstrates consumer-required retention. Checkpoint warnings
do not establish client latency or producer throttling.

## Integration

Exact copied-catalog hint2: /tmp/pg-wal-pressure-rendered-max-wal-size-forces-checkpoints.md;
output: /tmp/pg-wal-pressure-exact-max-wal-size-forces-checkpoints.log. Its actual two-cluster
64-batch comparison verifies both budgets, 64,000 correct receipts, restoration and stop.

Thirty tests and full repository check pass (/tmp/pg-wal-pressure-tests.log and
/tmp/pg-wal-pressure-check.log). Isolated build changes only current 60. 94 lessons, seven reading
stops, original first seven and accepted capacity are preserved. Copied catalog
/tmp/pg-observe-progress-nyzy8k15/progress.sqlite preserves IDs, progress and attempts. Learner
progress hash at audit is unchanged:
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

Drivers/build: /tmp/pg-wal-pressure-validate.ts, /tmp/pg-wal-pressure-exact.ts and
/tmp/pg-wal-pressure-scoped-build.py. Next: actual base backup, independent restore, missing
required WAL failure, then PITR. Durability and chunks 5–7 remain unfinished.
