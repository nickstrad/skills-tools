import { IDEMPOTENCY_VARIATION } from "../curriculum/idempotency-protocol.ts";
import { OUTBOX_VARIATION } from "../curriculum/outbox-delivery.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "idempotency-keys": {
    brief:
      "Race duplicate requests, recover actual caller loss, and compare deleted receipts with retained identity guards using independently audited debits and saved answers.",
    predict:
      "After the winner commits, can the single-statement insert-or-select return nothing? What survives caller loss before versus after commit, and what does an old retry do after its receipt is deleted?",
    inspect:
      "Match the actual Lock/transactionid blocker, CTE output, complete receipts, debit history and account balances. Distinguish an original saved answer from the current balance, and keep account3's deliberate duplicate debit separate from safe outcomes.",
    explain:
      "Why does waiting for uniqueness not refresh the CTE's SELECT snapshot? Which transaction joins receipt, debit, history and result, and why must a replay verify both account and amount?",
    vary:
      "Change only the first winner from COMMIT to ROLLBACK. Predict the diagnostic CTE's null result, why that diagnostic must roll back, and whether the fresh complete request still leaves one committed debit20.",
    apply:
      "Define the identity namespace, immutable payload, bounded fresh-transaction retries, response-retention period and expired-key admission policy for clients that may retry months later. Use the duplicate debit and retired-key refusal as evidence for your choice.",
    hints: [
      "Uniqueness can wait for a transaction outside the statement's read snapshot. The complete VOLATILE function uses a separate SELECT at Read Committed and commits receipt, effect and result together. Discarding the result can preserve admission safety only if the identity guard remains and reuse is refused.",
      "Run this complete winner-rollback variation in a shell.\n\n```bash\n" +
      IDEMPOTENCY_VARIATION + "\n```",
    ],
  },

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
