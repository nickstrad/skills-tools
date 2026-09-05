# Owned streaming standby acceptance

Primary acceptance, 2026-09-05. Current69 build-a-streaming-standby is revision4. The reusable
owned-replication helper is layered on the unchanged owned-cluster helper; accepted WAL/recovery
lessons do not change. Each core/variation initializes a fresh source and actual verified
pg_basebackup -R copy with a dedicated replication role and owned physical slot. No
learner5440/catalog writes or shared PGLAB dependency.

## Live evidence

Core: /tmp/pg-standby-core.log, /tmp/pg-owned-8qmu8egk. Variation: /tmp/pg-standby-variation.log,
/tmp/pg-owned-sqblgse6. Drivers: /tmp/pg-standby-validate.ts and
/tmp/pg-standby-{core,variation}.sh. Each owned directory retains verbose backup, separate
source/standby logs, JSON link/ identity/domain evidence and the actual standby-write error.

Both sides match system identity but have distinct verified data directories. Source
pg_is_in_recovery=false, standby=true, hot_standby=on and archive_mode=off. Sender user owned_repl
and application owned_standby match the receiver's actual source socket,6543 port, timeline1 and
physical slot. Both report streaming/async transport.

Receipt0 (amount1, in backup) survives bootstrap. Receipt1 (amount10, streamed after backup) is
committed afterward; a replay-position gate and full row equality prove its actual arrival. The real
standby INSERT of receipt99 fails SQLSTATE25006/read-only transaction, and both complete row results
remain unchanged.

In the source variation the receiver changes from PID579747 to579802. Its fresh log shows a new
streaming start; replay reaches0/A00258 and both sides contain exactly receipts0/1/2 with
amounts1/10/20 and the authored notes. No promotion occurs. The initial pg_terminate_backend attempt
returned false for this auxiliary process; the final driver sends SIGTERM only to the PID read from
the owned standby receiver. The failed trial's source/standby also stopped and its slot was removed.

Cleanup actually stops the standby, polls the slot inactive, drops only that owned slot, verifies
its absence and stops the source. Local transport/replay and receiver reconnect are established;
this does not test source-host loss, election, fencing or a particular observable stale-read window
during the short reconnect.

## Integration

Exact copied-catalog hint2: /tmp/pg-standby-rendered-build-a-streaming-standby.md and
/tmp/pg-standby-exact-build-a-streaming-standby.log. It runs the complete receiver-restart variation
with an actual new topology. Thirty tests/full repository checks pass (/tmp/pg-standby-tests.log and
/tmp/pg-standby-check.log).

The scoped source build changes only build-a-streaming-standby.93 lessons, seven reading stops,
first seven and accepted capacity remain intact. Copied catalog
/tmp/pg-observe-progress-n0ju7jbd/progress.sqlite preserves all IDs, history and attempts; learner
hash at audit is unchanged: 395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

Builder: /tmp/pg-standby-scoped-build.py. Next: actual paused replay/received-versus-applied work,
then move the read-your-writes identity into this physical sequence after its bounded readiness
behavior passes. Chunk5 and the full refactor remain unfinished.
