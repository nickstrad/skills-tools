import { LOGICAL_DECODING_VARIATION } from "../curriculum/logical-decoding.ts";
import { SLOT_DELIVERY_VARIATION } from "../curriculum/slot-delivery.ts";
import { LOGICAL_BOOTSTRAP_VARIATION } from "../curriculum/logical-bootstrap.ts";
import { LOGICAL_CONFLICTS_VARIATION } from "../curriculum/logical-conflicts.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "conflicts-stop-the-apply-worker": {
    brief:
      "Diagnose actual uniqueness/schema failures, recover queued source commits, and reconcile every effect omitted by a whole-transaction skip.",
    predict:
      "The source updates1, deletes2, inserts610 and finally collides on600 in one transaction. Which changes survive on each server after apply fails, and what happens to later601/602?",
    inspect:
      "Match logged SQLSTATE and finish LSN to the physical COMMIT start, then compare stopped subscription, fixed origin/confirmation and full row inventories. Verify complete recovery plus new700/900 receipts after each repair.",
    explain:
      "Why does an error roll back the earlier valid changes too? Why is the SKIP finish LSN different from the COMMIT-end apply gate, and how can origin advance while four rows still disagree?",
    vary:
      "Change only uniqueness recovery to whole-transaction SKIP. Inventory IDs1,2,600,610 after later work resumes, then reconcile under an explicit source-authority and paused-write boundary before repeating schema recovery.",
    apply:
      "Define a recovery policy for a replica with local writes: who decides authority, how disputed rows are preserved, how comparison/repair is bounded, and what data plus post-repair evidence permits reads again.",
    hints: [
      "Repairing the obstruction permits replay; skipping omits all changes in that transaction. Compare missing, extra and mismatched rows even when later receipts and origin progress look healthy. Source DDL also needs compatible subscriber DDL.",
      "Run this complete skip-and-reconcile variation in a shell.\n\n```bash\n" +
      LOGICAL_CONFLICTS_VARIATION + "\n```",
    ],
  },
  "publication-and-subscription": {
    brief:
      "Verify actual copied snapshots and concurrent change tails for initial subscription and refreshed-table bootstrap, including continued work on an existing table.",
    predict:
      "Which old values and deleted seed rows should the COPY audit contain after writes commit during its pause? Does adding a table to the publication automatically register it on an existing subscriber?",
    inspect:
      "Match the blocked COPY worker XID to its100 seed row images, then account for every later UPDATE/DELETE/INSERT in separate transactions. Require relation readiness, exact source/subscriber contents and a post-ready receipt behind the apply-origin boundary.",
    explain:
      "Why can transport progress, a non-null srsublsn or equal row counts each be insufficient? How does the audit distinguish copied state from the change tail, and why can an older table stream while a newly refreshed table is not ready?",
    vary:
      "Double overlap from two to four committed write batches during each COPY pause. Predict the unchanged100-row snapshot,48 tail events and final values/membership despite unchanged final row counts.",
    apply:
      "A service adds a table to a live logical replica. Define schema/identity, membership, copy/tail, per-table readiness and post-ready effect checks before serving that data; explain why unrelated ready tables need not imply the new table is usable.",
    hints: [
      "A copied snapshot and a source cursor must be coordinated, but their diagnostic fields are not interchangeable. Use the actual blocked worker, original row images, later committed changes and full results; refresh is separate from publication membership.",
      "Run this complete four-batch variation in a shell.\n\n```bash\n" +
      LOGICAL_BOOTSTRAP_VARIATION + "\n```",
    ],
  },
  "slot-position-and-acknowledgement": {
    brief:
      "Exercise independent source acknowledgement and receiver commit, then recover from actual process losses using atomic receipts and effects.",
    predict:
      "What survives if the consumer dies before receiver COMMIT, after that COMMIT but before source acknowledgement, or after acknowledgement? Can the source cursor prove a receiver balance change?",
    inspect:
      "Compare source batches/cursors with independent receiver receipts and totals at every killed-client boundary. Require unchanged confirmation on peek, twelve events for a five-change request, zero duplicate credit and later IDs20,21 still pending after the first acknowledgement.",
    explain:
      "Why must receipt identity and credit commit together? Why is the decoded COMMIT boundary appropriate for acknowledgement while a row LSN or latest source position is not? What does conflicting payload rejection protect?",
    vary:
      "Crash the owned source after its acknowledgement but before a checkpoint persists the new slot position. Verify actual replay, retained receiver credit and a duplicate retry that adds nothing before processing the later batch.",
    apply:
      "Choose a delivery protocol for a CDC consumer that changes a durable balance. State the receipt identity/retention, commit and acknowledgement order, schema assumptions and recovery policy if either source history or receiver deduplication records are unavailable.",
    hints: [
      "Observe the two servers independently. Commit receipt plus effect on the receiver first; then advance only through that complete source transaction. Acknowledgement does not eliminate replay after a source crash.",
      "Run this complete source-crash variation in a shell.\n\n```bash\n" +
      SLOT_DELIVERY_VARIATION + "\n```",
    ],
  },
  "decode-the-log": {
    brief:
      "Match physical commit/abort records with logical row events, then inspect schema/identity limits and delivery while an older transaction stays open.",
    predict:
      "Which physical and logical evidence should an aborted insert leave? If an older transaction has already written but a newer one commits first, can the newer commit be decoded before the older ends?",
    inspect:
      "Match each captured XID to its physical records and logical envelope. Check the empty DDL envelope, new column in a later row, actual older backend state during newer delivery, and row versus COMMIT LSN ordering.",
    explain:
      "Why does physical INSERT plus ABORT yield no logical row in this mode? Why does schema-aware row output not provide the migration command, and why can individual row LSNs move backward across emitted transactions?",
    vary:
      "Change only replica identity to FULL. Predict and compare the extra old-row values in UPDATE and DELETE while the final table and commit-order behavior remain the same.",
    apply:
      "For an audit/search consumer, specify required before-images, schema handling and transaction boundaries. Distinguish obtaining decoded events from durably committing their effect in the consumer.",
    hints: [
      "Use the selected plugin mode as the contract. Match XIDs and complete BEGIN/COMMIT envelopes; a lower XID need not commit first. FULL changes old-row information, not DDL delivery or consumer acknowledgement.",
      "Run this complete FULL-identity variation in a shell.\n\n```bash\n" +
      LOGICAL_DECODING_VARIATION + "\n```",
    ],
  },
};
