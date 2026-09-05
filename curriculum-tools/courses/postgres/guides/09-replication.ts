import { STANDBY_VARIATION } from "../curriculum/standby-workload.ts";
import { REPLAY_LAG_VARIATION } from "../curriculum/replay-lag.ts";
import { REPLICA_READINESS_VARIATION } from "../curriculum/replica-readiness.ts";
import { SYNC_ACKNOWLEDGEMENT_VARIATION } from "../curriculum/sync-acknowledgement.ts";
import { STANDBY_CONFLICTS_VARIATION } from "../curriculum/standby-conflicts.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "hot-standby-query-conflict": {
    brief:
      "Cause a snapshot recovery cancellation, then measure feedback-protected reader survival, retained primary versions and reclamation after release.",
    predict:
      "What happens when primary VACUUM removes versions an active standby snapshot needs? With feedback on, which primary horizon must protect this reader before deletion, and where will the space cost appear?",
    inspect:
      "Require 40001 with row-version detail and a confl_snapshot increment. In the feedback phase, inspect the physical slot xmin even if sender backend_xmin is NULL; match retained dead versions, old and fresh snapshot results, then free-space recovery after release.",
    explain:
      "Why can a fresh standby snapshot see fewer rows while the old reader still sees all10,000? Why is enabling feedback alone insufficient evidence, and why does reusable space increase without requiring the file to shrink?",
    vary:
      "Delete only multiples of4 instead of every even ID. Predict the new survivor sum and retained-version count while keeping both feedback policies and snapshot duration fixed.",
    apply:
      "Choose cancellation/retry or feedback for an interactive read replica and a long analytics reader. Define a retained-space budget and the evidence needed to confirm an old reader's horizon was released.",
    hints: [
      "Check the actual holder of the horizon: this physical slot stores feedback xmin, so the sender field can remain NULL. A surviving query plus retained versions and later reclamation establishes the tradeoff; configuration alone does not.",
      "Run this complete quarter-deletion variation in a shell.\n\n```bash\n" +
      STANDBY_CONFLICTS_VARIATION + "\n```",
    ],
  },
  "synchronous-replication-blocks-commit": {
    brief:
      "Observe the chosen remote acknowledgement stage, then reconcile a canceled or reconnected commit from its exact WAL record and receipts.",
    predict:
      "With replay paused but reception active, which of local/on/remote_apply can return? When a client waits in SyncRep, does an absent primary row prove that canceling it will roll back?",
    inspect:
      "Match each waiting PID/XID to an actual flushed COMMIT record, independent primary rows and standby receive/replay state. Inspect the cancellation warning even when psql prints COMMIT and exits0; reconcile all five receipt values after the wait.",
    explain:
      "Why can a transaction be locally durable but still invisible to another primary snapshot? Why do paused replay and a disconnected receiver block different policies, and why does canceling a wait weaken its requested acknowledgement guarantee?",
    vary:
      "Resolve only the disconnected ID5 wait by reconnecting the standby instead of canceling it. Compare client warning, acknowledgement and complete receipt outcomes.",
    apply:
      "Choose commit policy for critical orders and rebuildable telemetry when the required standby may be unavailable. State the accepted failure risk, the retry/reconciliation rule after uncertain acknowledgement and the separate writer-authority requirement.",
    hints: [
      "SyncRep identifies the wait; matching XID plus COMMIT end_lsn below primary flush identifies durable work. Visibility and client acknowledgement happen later. A cancellation warning with COMMIT is not a rollback signal.",
      "Run this complete reconnection variation in a shell.\n\n```bash\n" +
      SYNC_ACKNOWLEDGEMENT_VARIATION + "\n```",
    ],
  },
  "read-your-writes-on-a-replica": {
    brief:
      "Commit a profile and receipt, then enforce a same-history replay boundary, deadline and fresh application snapshot.",
    predict:
      "While receipt WAL is flushed but replay stays paused, what should the 500ms read return? Can the same numeric LSN from a different history authorize the read?",
    inspect:
      "Check post-COMMIT token creation, actual paused state and flushed receive. Require timeout with no payload or domain query, wrong-history rejection with zero LSN comparisons, then a fresh matching profile and receipt after replay.",
    explain:
      "Why is a bound sampled after COMMIT sufficient in this fixed history even though it is not the write's exact LSN? Why must the domain snapshot follow the gate, and why do system ID and timeline alone fail to establish writer authority?",
    vary:
      "Change only timeout policy: explicitly read from the pinned primary while the replica remains paused, then resume and compare its gated result.",
    apply:
      "A profile service promises read-your-writes within a total request budget. Choose wait, retry or primary fallback; allocate time to each stage and explain which authority/history assumptions must be revalidated after failover.",
    hints: [
      "A timed-out gate must not return the diagnostic stale rows. Compare trusted history before LSNs; after replay, acquire a new snapshot and verify the independently keyed receipt together with the profile.",
      "Run this complete primary-fallback variation in a shell.\n\n```bash\n" +
      REPLICA_READINESS_VARIATION + "\n```",
    ],
  },
  "replication-lag-under-load": {
    brief:
      "Pause actual replay while streaming continues, then connect durable receive and acknowledged flush with independently stale rows.",
    predict:
      "While replay is paused, which of the sent/write/flush/replay positions can advance? If flush reaches the receipt commit bound, what will a fresh standby query return before resume?",
    inspect:
      "Verify actual paused state and fixed replay LSN. Match standby durable receive and source flush acknowledgement beyond the commit bound, compare stale/source rows, then require complete data agreement after replay resumes.",
    explain:
      "Why does a flushed receipt remain invisible while replay is paused? Why can source feedback and time-lag fields differ from the standby's current observation, and why is replay-timestamp age not a universal backlog measure?",
    vary:
      "Double only the workload to4,000 committed receipts. Predict the same paused result and new final sum, then compare byte gap and sampled resume cost.",
    apply:
      "A status dashboard says streaming and flush lag is low, but a user sees an old receipt. Choose the evidence and readiness boundary needed before serving that read, including what happens when the deadline expires.",
    hints: [
      "Separate local standby flush from source acknowledgement of it, and both from replay. The driver waits for actual paused state before the commit, then uses a fresh row query after the apply gate.",
      "Run this complete4,000-receipt variation in a shell.\n\n```bash\n" + REPLAY_LAG_VARIATION +
      "\n```",
    ],
  },
  "build-a-streaming-standby": {
    brief:
      "Bootstrap an owned physical standby, then connect transport/replay evidence with a committed receipt and actual read-only behavior.",
    predict:
      "Receipt0 is in the backup and receipt1 is committed afterward. What proves the second receipt arrived through streaming, and which evidence distinguishes a connected replica from one ready to answer that read?",
    inspect:
      "Match source/copy data directories and system identity, dedicated replication user, slot and receiver endpoint. Require replay past the commit bound, exact receipts and SQLSTATE25006 for the attempted standby write.",
    explain:
      "Why does matching system identity not imply freshness or writer authority? Why can a standby remain in recovery while serving reads, and what does a streaming connection alone fail to prove?",
    vary:
      "Terminate only the owned receiver process, commit receipt2 and require a replacement streaming PID plus replay and complete row agreement.",
    apply:
      "A service wants to route profile reads to a replica and survive a failed writer. Identify which of those requirements this transport/replay test establishes and which readiness, failure and authority controls still need testing.",
    hints: [
      "A post-backup receipt plus a replay bound proves more than a streaming status. Receiver replacement does not promote a standby, elect a writer or revoke the source.",
      "Run this complete receiver-reconnection variation in a shell.\n\n```bash\n" +
      STANDBY_VARIATION + "\n```",
    ],
  },
};
