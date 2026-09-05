# Replication and change-processing contract

Primary sequential implementation, 2026-09-05. Chunks1–4 are accepted; current course has93 active
lessons. Work on one coherent experiment at a time, using revision4 for changed identities. No
learner catalog writes, port5440 operations, parallel authoring or changes to unrelated storage.
Preserve first seven, seven reading stops, surviving identities and current copied progress.

## Owned physical topology

Use a new helper layered on the accepted owned-cluster helper, without altering the embedded code of
accepted lessons. Every experiment initializes a fresh primary, creates a dedicated replication
role, takes an actual verified pg_basebackup, starts a separate standby socket/data directory and
bounds sender/receiver/replay readiness. Preserve logs and complete application outcomes. Cleanup
stops the standby, drops the owned inactive slot when applicable and stops the primary; never assume
another lesson's shared PGLAB topology remains running.

- **build-a-streaming-standby:** verify source/copy directories, system identity, physical recovery
  role, active sender/receiver link and a post-backup committed receipt on the standby. Actually
  reject a standby write and preserve the answers. Variation restarts the owned receiver and proves
  a new streaming process plus correct later receipt; it does not infer source-outage failover.
- **replication-lag-under-load:** pause replay and wait for the paused state, then generate bounded
  committed work. Require received/flushed evidence beyond the paused replay position and stale
  independent rows. Resume and verify all rows after a replay-position gate. Explain asynchronous
  status feedback and that time-lag columns are not a universal queue-duration clock.
- **read-your-writes-on-a-replica:** move its stable identity from14 into this physical sequence
  after the gate is executed. A token follows COMMIT, identifies the known source history and a
  durable receipt, and a deadline gates replay before the domain query. Exercise paused timeout,
  catch-up success and rejection of a different history identity. Define topology/authority
  assumptions; do not compare bare LSNs across failover or substitute logical received_lsn for
  apply.
- **synchronous-replication-blocks-commit:** distinguish remote flush from remote apply. Exercise
  actual commit waits with paused replay/disconnected standby, per-session acknowledgement policy,
  observed SyncRep and authoritative transaction/receipt outcomes after cancellation or
  reconnection. Do not equate caller cancellation with known rollback or synchronous replication
  with elections.
- **hot-standby-query-conflict:** cause a real recovery conflict and classify its cancellation. Then
  enable feedback, establish the actual standby xmin horizon (physical-slot xmin when a slot owns
  it; sender backend_xmin may remain NULL) and show primary reclamation delayed while the reader
  survives. Release reader/feedback and verify reclamation/catch-up. Keep cancellation and retained
  old versions as the controlled tradeoff, with bounded waits/settings.
- **replication-slot-retains-wal:** disconnect the actual consumer, generate a fixed WAL workload
  beyond a small private target and observe the slot's retention position/files. Reconnect and
  verify complete receipt replay plus reclamation. A bounded lost-history variation must classify
  required reinitialization rather than promise an invalidated consumer can just continue.
- **promote-the-standby:** preserve a bounded deliberate split-brain branch as failure evidence,
  then separately execute controlled failover that stops/revokes the old writer before promotion.
  Inventory acknowledged receipts on each branch and verify writer ownership through a gate that
  rejects the old authority. Process promotion alone is not fencing or an election protocol.
- **rewind-the-old-primary:** retain divergence evidence, fence/stop the old writer, run actual
  pg_rewind with supported prerequisites and rejoin it as standby. Verify the chosen authoritative
  history and classify discarded acknowledged old-branch work. Independent source/copy evidence must
  survive for review before changed files erase it.
- **cascading-and-failback:** cascading becomes optional depth after bounded actual extra-hop
  verification. Keep controlled failback and cleanup required; no role swap based on sleeps. Do not
  retire this identity until its retained behavior and downstream prerequisites are explicit.

## Logical changes and delivery boundaries

- **decode-the-log:** actual committed/aborted transactions with decoded physical-to-logical
  observations; identify commit ordering and what schema/DDL information the chosen plugin omits.
- **slot-position-and-acknowledgement:** retain peek/get boundary and add an independently committed
  receiver effect, with crash/response loss before and after acknowledgement. Prove replay plus
  deduplication from receipts; advancement of a slot offset is not proof of a receiver commit.
- **publication-and-subscription / initial-sync-vs-streaming:** actual bootstrap while bounded
  INSERT/UPDATE/DELETE continue. Establish snapshot-to-tail boundary, apply progress and complete
  end-state contents, including identity and schema prerequisites. Repetition of only initial-copy
  flags is insufficient. Consolidation requires measured replacement coverage first.
- **conflicts-stop-the-apply-worker:** cause and classify real uniqueness/schema conflicts, verify
  stopped apply and accumulated change position, then repair/reconcile with complete source/sink
  agreement. Worker restart alone is not data recovery.
- **slot-lag-and-disk:** shorten repeated physical retention mechanics; focus on logical consumer
  acknowledgement, what state is lost on slot removal and a tested resnapshot/reconciliation path.

## Acceptance

Run every core and exact rendered variation on real PostgreSQL, serially for lifecycle/failure
operations. Match complete application answers and causal boundaries before accepting counter or log
claims. Check current progress on a fresh copy and normalize identity/prerequisite renumbering when
moving or consolidating. Preserve original first seven and all existing progress/attempt IDs. Keep
concise runtime reports, raw paths and durable findings; commit/push accepted subsections with
handoff. Finish logical processing, durable protocols and incidents before the final whole-course
integration/audit. Do not mark the full goal complete after this design or any single subsection.
