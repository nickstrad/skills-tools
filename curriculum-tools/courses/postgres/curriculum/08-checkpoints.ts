import type { Module } from "../../../src/types.ts";
import { BACKUP_WORKLOAD } from "./backup-workload.ts";
import { WAL_PRESSURE } from "./wal-pressure.ts";
import { RECOVERY_COST } from "./recovery-cost.ts";
import { CHECKPOINT_ANATOMY } from "./checkpoint-workload.ts";
import { PITR_WORKLOAD } from "./pitr-workload.ts";

export const CHECKPOINTS: Module = {
  category: "checkpointing",
  title: "Checkpoints, backups, and point-in-time recovery",
  lessons: [
    CHECKPOINT_ANATOMY,
    RECOVERY_COST,
    WAL_PRESSURE,
    BACKUP_WORKLOAD,
    PITR_WORKLOAD,
  ],
};
