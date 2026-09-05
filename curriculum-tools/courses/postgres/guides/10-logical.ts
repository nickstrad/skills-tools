import { LOGICAL_DECODING_VARIATION } from "../curriculum/logical-decoding.ts";
import { SLOT_DELIVERY_VARIATION } from "../curriculum/slot-delivery.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
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
