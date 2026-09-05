# Logical slot loss and resnapshot acceptance

Primary acceptance, 2026-09-05. Current82 slot-lag-and-disk is revision4. The course remains92
active lessons/seven reading stops. Core, source variation and exact learner hint run on independent
owned PostgreSQL16 source/subscriber processes; the variation adds only an attempted publication
refresh.

## Live evidence

Driver /tmp/pg-logical-resnapshot-validate.ts; raw /tmp/pg-logical-resnapshot-{core,variation}.log;
scripts /tmp/pg-logical-resnapshot-{core,variation}.sh. Final core /tmp/pg-owned-joc4yatu and source
variation /tmp/pg-owned-6eu11w08 retain complete JSON inventories, slot states, source COMMIT
records, consumer-generation audits and separate server logs. Distinct system identifiers/private
sockets and matching independently created schemas establish the endpoints. Real initial copy and
receipt90 precede all failures.

Disabled apply has no worker and an inactive slot. A published transaction updates1–3, deletes4 and
inserts20. Four unpublished256-row churn batches plus WAL switches produce an unconfirmed interval
of3,588,112 bytes while restart0/893FA8 and confirmation0/894178 remain fixed. Required segment
000000010000000000000008 survives CHECKPOINT. Actual file count stays8; no growth claim is inferred
from the byte interval. Target remains its full old image. Re-enabling the original slot applies all
pending data and receipt91, then acknowledgement reaches its actual COMMIT end0/C006B0.

The next disabled interval changes1 to50, deletes2 and inserts600. Source1000 also commits and is
deleted in a separate transaction; a fresh query between them saves its actual image. Slot/origin
and full source/target differences are preserved before pg_drop_replication_slot removes the source
slot. Subscriber definition/origin remain. ENABLE produces an actual missing-slot streaming-start
error,08P01 on the subscriber with the corresponding source error. The failed worker exits;
subenabled stays true and apply_error_count/sync_error_count remain0 despite disable_on_error=true.
The driver explicitly disables before repair, rather than assuming that policy catches startup.

Recreation with the same owned_retention name returns0/C00990, beyond every gap COMMIT, with new
restart0/C00958/catalog horizon747. The old origin0/C006B0 is unchanged. Physical inspection still
finds all old COMMITs; new-slot creation does not reconstruct the old decoding position. Receipt900
then streams and origin advances, but complete comparison finds exactly stale1, extra2 and
missing600.

Variation REFRESH PUBLICATION(copy_data=true) on this existing subscription does not recopy its
already-ready table. Both paths then commit the same901 control receipt; it applies while relation
state and those three discrepancies remain unchanged. A working new stream is not gap recovery.

For actual resnapshot, all driver-owned source writes and apply pause. The stale target is saved
separately. The old subscription is detached/dropped, its origin is verified gone, and the recreated
slot drops. The target is emptied, audit generation becomes2 and a fresh
subscription/owned_resnapshot slot establishes its own COPY and stream. New OID16415 differs from
old16405. Generation2 copied INSERT images equal the saved source snapshot with all missed
changes/deletions reconciled. A new902 receipt then passes its COMMIT-end/origin gate; all15 final
row IDs and values/notes match.

Final IDs are1,3,5,6,7,8,9,10,20,90,91,600,900,901,902. The stale evidence preserves old1, extra2
and missing600. No consumer-generation audit contains1000, although its historical source
insert/delete and intermediate image remain in driver evidence. Current-state rebuild has not
recovered that past event. Final fresh-subscription apply/sync counters are0 and its slot is active
before cleanup.

## Integration and boundaries

/tmp/pg-logical-resnapshot-exact.ts renders copied-catalog pgcoach82 hint2 into
/tmp/pg-logical-resnapshot-rendered-slot-lag-and-disk.md and executes its exact bash fence. Log
/tmp/pg-logical-resnapshot-exact-slot-lag-and-disk.log; root /tmp/pg-owned-ft13c_3t. All three final
pairs have pg_ctl status3, empty source/subscriber pg_replslot directories and exactly the expected
missing-slot error on each server, with no unrelated errors. Cleanup detaches/drops owned
subscription, removes owned main/sync slots and publication, and stops both processes.

Scoped /tmp/pg-logical-resnapshot-scoped-build.py changes only current82 among92 built objects.
Copied /tmp/pg-observe-progress-myyahqxw/progress.sqlite preserves IDs, progress and attempts;
original first seven/capacity/seven stops remain intact. Learner SHA256 is unchanged:
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6. Thirty tests/full
formatting/lint/typecheck pass in /tmp/pg-logical-resnapshot-{tests,check}.log.

Source authority and paused driver-owned writes define this state-replica rebuild. It is not an
arbitrary concurrent multi-writer reconciliation protocol or restoration of every historical effect.
The local audit is measurement instrumentation, not an external billing consumer. Slot loss here is
explicit removal; finite-retention invalidation was exercised earlier in current74. Physical WAL
availability is retained as evidence, without promising that an arbitrary new slot can use it.
Durable findings: docs/knowledge/postgres-logical-evidence.md.

## Space preservation

/tmp/pg-resnapshot-archive-evidence.py completed verified cold archival of failed conflict prototype
vl7_sfvp and the three accepted bootstrap roots dfn4izle/pl36xp5k/a3sf8esa. All original
data/subscriber directories were PostgreSQL16, stopped with status3/no PID and clean control state.
Reopened tar.gz regular-file path/SHA256 sets matched originals; stopped state and original hashes
were rechecked before removing original data directories. All logs/JSON remain alongside
cold-archives.json, per-directory hash/control manifests and cold.tar.gz. These accepted bootstrap
images now live in those archives; their earlier acceptance reports describe the original
executions.

Initial resnapshot prototypes5gtb672y/2hdcl4ee passed before the explicit zero-counter/enabled-state
startup assertions were added. They were similarly archived by
/tmp/pg-resnapshot-archive-prototypes.py, preserving their logs and verified cold files. Only the
final three resnapshot roots above establish the accepted commands. This is cold-file preservation,
not a tested database restore. About140MB remains; provision space before further large fixtures.
