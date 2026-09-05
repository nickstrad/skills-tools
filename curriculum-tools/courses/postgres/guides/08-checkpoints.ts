import { CHECKPOINT_VARIATION } from "../curriculum/checkpoint-workload.ts";
import { RECOVERY_COST_VARIATION } from "../curriculum/recovery-cost.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "redo-point-bounds-recovery": {
    brief:
      "Compare actual replay and query readiness across equal receipt datasets with different checkpoint positions.",
    predict:
      "Both cases commit the same bulk load and tail receipt. Which transactions remain in each recovery range, and must the case with fewer records always have a smaller measured client-ready time?",
    inspect:
      "Verify matching rows, heap size and settings first. Match the stopped control redo position, offline last-record start and fresh redo log, then compare both order-reversed timing pairs.",
    explain:
      "Why does the common tail guarantee useful replay in both cases? Why can redo done precede the flushed end without any missing WAL, and why is WAL distance not a recovery-time objective?",
    vary:
      "Double only the bulk row count to40,000 and repeat the four matched crashes. Compare physical work and separately sampled readiness costs.",
    apply:
      "A job service must recover within30 seconds. Specify the failure-detection, storage, orchestration and application measurements needed beyond this fixture, and decide what evidence would justify a checkpoint policy.",
    hints: [
      "The log rounds elapsed time and pg_ctl polls readiness. Equal or reversed tiny timings do not erase a verified difference in required replay records. The record start and exclusive end are different addresses.",
      "Run this complete40,000-row variation in a shell.\n\n```bash\n" + RECOVERY_COST_VARIATION +
      "\n```",
    ],
  },
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
