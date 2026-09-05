import { OUTBOX_VARIATION } from "../curriculum/outbox-delivery.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "transactional-outbox": {
    brief:
      "Commit business intent atomically, deliver to an independent receiver balance, and recover actual relay loss through durable claims and deduplicated effects.",
    predict:
      "What survives application loss before source commit, receiver loss before its commit, and relay loss after receiver credit but before the sent marker? Which facts does each database know independently?",
    inspect:
      "Match full orders, outbox payloads and receiver receipts at each killed-process boundary. Check disjoint claims, zero source row locks during receiver work, old-token rejection, replay effect counts and total18 after both restarts.",
    explain:
      "Why must receipt and credit share a receiver commit? What does a claim generation protect that receiver deduplication does not, and why can an unsent source row coexist with durable credit?",
    vary:
      "Move only the relay kill to after its source sent-marker commit. Predict which message remains eligible for takeover, its generation/attempt count and the unchanged final receiver credit.",
    apply:
      "Specify a relay's event identity and retention, short claim/expiry policy, receiver-commit-before-ack order and evidence needed to recover an unknown outcome without repeating a business effect.",
    hints: [
      "A committed source claim survives lock release. The receiver may already have the credit while the source is unsent, so retry the same immutable identity. A generation guard protects source completion; a receipt/effect transaction protects receiver credit.",
      "Run this complete loss-after-source-acknowledgement variation in a shell.\n\n```bash\n" +
      OUTBOX_VARIATION + "\n```",
    ],
  },
};
