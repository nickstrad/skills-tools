import { STANDBY_VARIATION } from "../curriculum/standby-workload.ts";
import { REPLAY_LAG_VARIATION } from "../curriculum/replay-lag.ts";
import { REPLICA_READINESS_VARIATION } from "../curriculum/replica-readiness.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
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
