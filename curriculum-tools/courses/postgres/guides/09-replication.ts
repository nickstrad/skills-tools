import { STANDBY_VARIATION } from "../curriculum/standby-workload.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
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
