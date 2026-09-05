import { FENCING_VARIATION } from "../curriculum/resource-fencing.ts";
import { TWOPC_VARIATION } from "../curriculum/two-phase-protocol.ts";
import { IDEMPOTENCY_VARIATION } from "../curriculum/idempotency-protocol.ts";
import { OUTBOX_VARIATION } from "../curriculum/outbox-delivery.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "fencing-tokens-with-a-monotonic-counter": {
    brief:
      "Enforce token-bearing writes through restricted worker roles, then race an old token against a new resource fence to locate the actual rejection boundary.",
    predict:
      "Does issuing token2 to B immediately stop A's token1 at the resource? If B's resource update is still uncommitted when A writes, how will B's COMMIT versus ROLLBACK change A's outcome?",
    inspect:
      "Compare claim/issued rows with resource epoch and complete history. Identify the real worker identities, denied direct privileges, B's held XID, A's actual blocker and every unchanged inventory after a rejected call.",
    explain:
      "Why can token1 succeed after takeover but before the resource commits2? Why does a value-only UPDATE bypass the old trigger design, and how do required arguments, token ownership and restricted definer functions close that path?",
    vary:
      "Change only B's first resource-fence transaction from COMMIT to ROLLBACK. Predict A's waiting write, the extra committed history row and the later B commit needed to make token1 fail.",
    apply:
      "Specify takeover authority, worker credentials, the protected resource interface and epoch lifetime for a paused worker that resumes after takeover. Explain the guarantees lost with direct DML and the separate idempotency needed for repeated writes at one valid epoch.",
    hints: [
      "The issuer's current epoch and the resource's committed epoch are different records. A conditional resource UPDATE waits and rechecks after the competing transaction resolves. Every application write must pass the guarded function; definer ownership must not grant workers direct table or owner-role access.",
      "Run this complete resource-fence-rollback variation in a shell.\n\n```bash\n" +
      FENCING_VARIATION + "\n```",
    ],
  },

  "two-phase-commit": {
    brief:
      "Inspect detached participant promises, crash recovery and cleanup costs, then recover actual coordinator loss from a separately committed decision and complete outcome receipts.",
    predict:
      "What survives participant A's crash before a decision? After the coordinator dies, which durable record authorizes resolving B, and how does losing the coordinator before its decision commit change that authority?",
    inspect:
      "Join each prepared GID/XID to its null-PID lock and actual blocked writer. Compare SQLite's independently visible decision with account/outcome rows, retained250 dead tuples, partial finalization and the full final total200.",
    explain:
      "Why is a prepared promise different from a committed coordinator decision? Why can independent reads see75/100 during finalization, and why must missing prepared state be checked against a complete outcome receipt?",
    vary:
      "Move only coordinator loss to before its SQLite decision commit. Its local transaction sees COMMIT; predict what an independent reader sees and what must be durably recorded before either participant is rolled back.",
    apply:
      "Specify the stable operation/payload/participant registry, decision durability and recovery authority needed to resolve an orphaned transfer. Use blocked writers, cleanup retention and partial visibility to explain the protocol's costs and its limits during a partition.",
    hints: [
      "A prepared participant keeps the ability to obey a later decision. The coordinator must commit that decision before finalizing anyone. With the original coordinator known dead, this fixture records ABORT for a registered operation with no durable decision; an existing COMMIT can only be completed and verified.",
      "Run this complete loss-before-decision-commit variation in a shell.\n\n```bash\n" +
      TWOPC_VARIATION + "\n```",
    ],
  },

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
