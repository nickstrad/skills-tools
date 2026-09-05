import { CHECKPOINT_VARIATION } from "../curriculum/checkpoint-workload.ts";
import { RECOVERY_COST_VARIATION } from "../curriculum/recovery-cost.ts";
import { WAL_PRESSURE_VARIATION } from "../curriculum/wal-pressure.ts";
import { BACKUP_VARIATION } from "../curriculum/backup-workload.ts";
import { PITR_VARIATION } from "../curriculum/pitr-workload.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "point-in-time-recovery": {
    brief:
      "Recover to named points before and after a committed deletion, preserving both writable branches and their actual ancestry.",
    predict:
      "Which jobs and receipts should each named target contain, and where should job999 appear? If the earlier target is restored second, must its larger timeline number represent later application data?",
    inspect:
      "Match each decoded restore-point end to its history-file fork LSN. Verify both complete job/receipt states, distinct branch markers, parent1, archived timeline-prefixed WAL, unchanged original hashes and unchanged source data.",
    explain:
      "Why pin recovery_target_timeline to1 when restoring the second copy? Why does read-only readiness not prove promotion, and why are timeline/LSN values insufficient writer-authority tokens?",
    vary:
      "Select after_cleanup first, then recover before_cleanup for comparison. Predict which data follows the target and which timeline IDs follow restoration order.",
    apply:
      "An operator needs to undo a bad cleanup while the original primary still accepts writes. Specify the target, domain validation, retained histories and external writer-cutover controls needed before making a recovered branch authoritative.",
    hints: [
      "The history file records ancestry and a fork position; it does not revoke an old writer. Both targets precede job999, while only the earlier target precedes the deletion. pg_create_restore_point returns a record end.",
      "Run this complete later-target-first variation in a shell.\n\n```bash\n" + PITR_VARIATION +
      "\n```",
    ],
  },
  "base-backup": {
    brief:
      "Prove an actual backup restores correct jobs/receipts with its source offline, then remove required WAL from a separate input.",
    predict:
      "After a post-backup source update and shutdown, which amounts should the independent restore show? Can unchanged heap files make a backup usable when its required starting WAL is missing?",
    inspect:
      "Check the pristine manifest/WAL range, source shutdown, copy data_directory, all job/receipt values and actual rejected constraint probes. Distinguish verifier failure from the missing-copy's classified startup failure.",
    explain:
      "Why are both manifest verification and actual restore needed? Why must backup_label stay in the failed input? Which evidence proves the restored answers did not come from the updated source?",
    vary:
      "After the same missing-history failure, serve the verified required segment through a private restore command and recover that copy with the source still stopped.",
    apply:
      "A team reports successful nightly backups. Specify the retained-history, independent restore, domain/constraint and storage-failure evidence needed before promising recovery from a lost source host.",
    hints: [
      "Preserve the pristine backup and recovery metadata. The repair changes available WAL history, not row values or the target state; require an actual archive retrieval and completed recovery.",
      "Run this complete missing-history repair variation in a shell.\n\n```bash\n" +
      BACKUP_VARIATION + "\n```",
    ],
  },
  "max-wal-size-forces-checkpoints": {
    brief:
      "Cause WAL-driven checkpoints with a bounded producer and verify actual settings, fresh reason logs and equivalent receipts.",
    predict:
      "For the same32,000 receipts at8MB and128MB targets, which checkpoint counters and log reasons should change? Does a frequent-checkpoint warning prove that client requests stalled?",
    inspect:
      "Verify active budget/source, equal receipt values, unchanged stats epoch and timed count. Match requested deltas to fresh WAL-reason starts/completions; compare sampled segment bytes separately from produced WAL distance.",
    explain:
      "Why does requested-checkpoint count need a log reason? Why do archive/slot retention and a soft WAL target answer different disk questions? What proves the setting was restored?",
    vary:
      "Double the batch count to64 at both budgets, holding rows per transaction and payload fixed. Compare generated distance, checkpoint deltas and retained file samples.",
    apply:
      "A service reports frequent checkpoints and falling free disk. Choose the next observations that distinguish increased production, checkpoint scheduling and a stalled archive or slot; identify which latency evidence remains missing.",
    hints: [
      "A reload request returning true is not the active value. A WAL-reason log is not a latency sample, and a requested counter alone also includes manual checkpoints.",
      "Run this complete64-batch variation in a shell.\n\n```bash\n" + WAL_PRESSURE_VARIATION +
      "\n```",
    ],
  },
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
