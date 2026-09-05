import { type Module } from "../../../src/types.ts";
import { SYNC_ACKNOWLEDGEMENT } from "./sync-acknowledgement.ts";
import { STANDBY_CONFLICTS } from "./standby-conflicts.ts";
import { SLOT_RETENTION } from "./slot-retention.ts";
import { FAILOVER_WORKLOAD } from "./failover-workload.ts";
import { REWIND_WORKLOAD } from "./rewind-workload.ts";
import { FAILBACK_WORKLOAD } from "./failback-workload.ts";
import { REPLICA_READINESS } from "./replica-readiness.ts";
import { REPLAY_LAG } from "./replay-lag.ts";
import { STANDBY_WORKLOAD } from "./standby-workload.ts";

export const REPLICATION: Module = {
  category: "replication",
  title: "Physical streaming replication and failover",
  lessons: [
    STANDBY_WORKLOAD,

    REPLAY_LAG,

    REPLICA_READINESS,

    SYNC_ACKNOWLEDGEMENT,

    STANDBY_CONFLICTS,

    SLOT_RETENTION,

    FAILOVER_WORKLOAD,

    REWIND_WORKLOAD,

    FAILBACK_WORKLOAD,
  ],
};
