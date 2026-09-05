# Standby conflict and feedback acceptance

Primary acceptance, 2026-09-05. Current73 hot-standby-query-conflict is revision4. Two identically
seeded10,000-row tables on a fresh owned source/standby isolate feedback off/on. A quarter-deletion
variation changes only the number of versions removed, retaining both policy comparisons.

## Live evidence

Core: /tmp/pg-standby-conflicts-core.log, /tmp/pg-owned-30hokd0p. Variation:
/tmp/pg-standby-conflicts-variation.log, /tmp/pg-owned-k1p51p6v. Driver:
/tmp/pg-standby-conflicts-validate.ts; scripts /tmp/pg-standby-conflicts-{core,variation}.sh. Each
root retains reader stdout/stderr, JSON phase observations, verbose vacuum logs, verified basebackup
evidence and source/standby logs. All clients/servers stop and the owned slot is removed.

With feedback off, an observed active PgSleep reader has a repeatable-read snapshot of10,000 rows,
sum50,005,000. Primary deletes even IDs and vacuums with truncation disabled. Reader actually fails
with40001 and removed-row-version recovery-conflict detail; confl_snapshot increases0→1 while
captured lock/bufferpin/deadlock/tablespace counters remain zero. Primary has5,000 live/zero dead
versions, and fresh source/copy results contain every odd ID with correct payloads and
sum25,000,000.

With feedback on, reader xmin737 appears in the primary's active physical slot xmin737; sender
backend_xmin stays NULL. The driver waits for a slot horizon old enough to protect the reader before
deletion. Primary VACUUM reports5,000 dead-but-not-removable versions and pgstattuple agrees. Fresh
source and replay-gated copy see5,000 survivors while the old reader is still active. The same old
transaction later returns the complete original10,000-row snapshot again and commits without error;
conflict counters do not rise. Disabling feedback after normal reader completion clears the slot
horizon. New VACUUM changes dead5,000→0 and free bytes12,372→693,064, with table length fixed
at1,417,216. Final fresh application results remain correct on both nodes.

Variation deletes multiples of4:7,500 survivors/sum37,500,000,2,500 retained dead versions during
feedback, then zero dead/free bytes352,720 after release. The old snapshot still sees10,000 rows. ID
range, distinct count, zero remaining deletion candidates and every payload jointly prove complete
membership, beyond count/sum alone.

## Corrected assumptions

An idle post-backup insertion-location gate at0/F00028 timed out in the first prototype, before
reader work. Explicit pg_create_restore_point record-end markers now gate baseline and cleanup
replay. Later prototypes failed by requiring a sender backend_xmin: PostgreSQL16 instead stores
feedback in physical-slot xmin for this topology. Primary source inspection and final measured
slot/reader/retention evidence establish the correction. Design05 and durable knowledge record it.
Failed prototypes cleaned up; no learner server/catalog was touched.

## Integration

Exact current73 copied-catalog hint2:
/tmp/pg-standby-conflicts-rendered-hot-standby-query-conflict.md. Output:
/tmp/pg-standby-conflicts-exact-hot-standby-query-conflict.log; root /tmp/pg-owned-6saz3w1h. It
repeats the complete quarter-deletion experiment and all counters, snapshot, horizon, physical
retention/reclamation and cleanup assertions above.

Thirty tests/full check pass in /tmp/pg-standby-conflicts-{tests,check}.log. Scoped builder
/tmp/pg-standby-conflicts-scoped-build.py changes only current73.93 active lessons/seven reading
stops, first seven and capacity remain intact. Fresh copied catalog
/tmp/pg-observe-progress-6qsndft9/progress.sqlite preserves existing IDs/progress/attempts. Learner
hash remains395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

Next: current74 replication-slot-retains-wal, actual disconnected consumer, bounded retained WAL,
reconnection/full receipts/reclamation and a lost-history reinitialization variation. Chunks5–7 and
the final audit remain active.
