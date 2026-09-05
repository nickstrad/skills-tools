import { LOGICAL_DECODING_VARIATION } from "../curriculum/logical-decoding.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
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
