# Physical slot retention and reinitialization acceptance

Primary acceptance, 2026-09-05. Current74 replication-slot-retains-wal is revision4. The real owned
consumer consumes a baseline, disconnects, and later catches up or actually fails and is rebuilt.
The experiment replaces an unused ghost slot and catalog-only invalidation demonstration.

## Live evidence

Core: /tmp/pg-slot-retention-core.log, /tmp/pg-owned-e3c0q65i. Variation:
/tmp/pg-slot-retention-variation.log, /tmp/pg-owned-rtekv3mr. Driver:
/tmp/pg-slot-retention-validate.ts; scripts /tmp/pg-slot-retention-{core,variation}.sh. Each root
retains JSON observations, verified basebackup output and separate server logs. Variation preserves
the failed copy and its logs under invalidated-standby before taking a replacement backup.

Both paths stop an actual streaming consumer after baseline receipt0. Its inactive slot remains
at0/A00090, protecting segment00000001000000000000000A. Sixteen2,000-row commits produce32,001
correct distinct IDs0–32,000/sum512,016,000 with every1,000-character payload intact. Checkpoints
under max_wal_size8MB/max_slot_wal_keep_size=-1/wal_keep_size0 leave35 one-MB segment files,
36,700,160 bytes. Slot status is extended and safe_wal_size NULL. The saved required distances are
36,370,120/core and36,367,336/variation; these differ from whole allocated segment bytes.

Core restarts the same consumer, requires streaming/replay and complete receipt agreement, and
observes the slot advance. A later ID32,001 streams, giving32,002 rows/sum512,048,001. Final
checkpoints remove the original anchor filename and leave8 segments/8,388,608 bytes; active slot
status is reserved. No claim depends on an empty WAL directory or exact per-receipt WAL cost.

Variation applies a4MB slot cap to the already oversized inactive slot and checkpoints. The slot
becomes lost with NULL restart_lsn/safe_wal_size, the needed anchor file disappears, and the source
logs invalidation. The driver actually starts the old consumer: pg_ctl returns0/server started, but
its receiver reports requested segment00000001000000000000000A has already been removed. A fresh
query still returns only ID0 and replay is behind the workload. This directly distinguishes
postmaster readiness from application readiness.

After stopping and preserving the failed copy, only the owned lost slot/role are dropped. Unlimited
retention is restored for reinitialization; a new full basebackup verifies before config edits and
returns all32,001 existing receipts. The later streamed ID32,001 proves more than readable backup
contents. Both paths end with complete source/copy agreement,8 segments and active/reserved slot;
finally stops all owned servers and removes that slot.

## Integration

Exact current74 copied-catalog hint2:
/tmp/pg-slot-retention-rendered-replication-slot-retains-wal.md. Output:
/tmp/pg-slot-retention-exact-replication-slot-retains-wal.log; root /tmp/pg-owned-yv1ysy9p. It
repeats retention, actual lost-history rejection with a ready-but-stale old copy, verified rebuild,
later streamed receipt and final complete outcome/reclamation/cleanup. Retained/reclaimed bytes
match36,700,160→8,388,608 in this sample.

Thirty tests/full check pass in /tmp/pg-slot-retention-{tests,check}.log. The old lesson's
now-unused archive-reminder import was removed after lint identified it. Scoped builder
/tmp/pg-slot-retention-scoped-build.py changes only current74.93 lessons/seven stops, first seven
and capacity remain intact. Fresh copied catalog /tmp/pg-observe-progress-c6f606c2/progress.sqlite
preserves IDs/progress/attempts; learner hash remains
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

Next: current75 promote-the-standby. Preserve a bounded deliberate split-brain failure, then
separately execute controlled failover with old writer stopped/revoked before promotion, complete
acknowledged-receipt inventory and an authority gate rejecting the old writer. Chunks5–7/final audit
remain active.
