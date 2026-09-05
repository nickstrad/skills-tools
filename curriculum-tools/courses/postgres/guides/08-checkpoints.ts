import { CHECKPOINT_VARIATION } from "../curriculum/checkpoint-workload.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "checkpoint-anatomy": {
    brief:
      "Connect a dirty heap page, durable WAL, checkpoint accounting and the recovery starting position in a quiet owned cluster.",
    predict:
      "After a committed update, can page0 have a newer LSN in memory than in its file? Predict what CHECKPOINT changes about those positions, dirty/resident buffers and the remaining redo distance.",
    inspect:
      "Match the2,000 update records to correct receipt totals. Compare memory/file/flushed LSNs before and after, the requested-checkpoint delta, resident versus dirty buffers, and the actual checkpoint record at the control-file position.",
    explain:
      "Why can commit finish before the heap file catches up? Why do clean buffers remain cached and some WAL remain beyond redo_lsn? Why need the cluster checkpoint-write delta not equal an earlier table dirty-page count?",
    vary:
      "Run two committed update rounds before the same final checkpoint. Predict the new receipt sum and update-record count, then compare page writes with the one-round core.",
    apply:
      "A job service has frequent checkpoint write bursts and a recovery target. Identify the write/page/recovery measurements needed to choose a checkpoint policy, and explain why a completed checkpoint cannot replace its tested backups.",
    hints: [
      "Separate transaction durability, data-file writes, cache residency and recovery starting position. Multiple updates can concern the same page, while cluster counters also include work outside the receipt heap.",
      "Run this complete two-round variation in a shell with PostgreSQL16 binaries.\n\n```bash\n" +
      CHECKPOINT_VARIATION + "\n```",
    ],
  },
};
