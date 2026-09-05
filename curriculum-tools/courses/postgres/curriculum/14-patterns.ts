import { type Module } from "../../../src/types.ts";

import { IDEMPOTENCY_KEYS } from "./idempotency-protocol.ts";
import { NOTIFICATION_RECOVERY } from "./notification-recovery.ts";
import { TRANSACTIONAL_OUTBOX } from "./outbox-delivery.ts";
import { RESOURCE_FENCING } from "./resource-fencing.ts";
import { TWO_PHASE_COMMIT } from "./two-phase-protocol.ts";

export const PATTERNS: Module = {
  category: "distributed-patterns",
  title: "Distributed-systems patterns on PostgreSQL",
  lessons: [
    TRANSACTIONAL_OUTBOX,
    IDEMPOTENCY_KEYS,
    TWO_PHASE_COMMIT,
    RESOURCE_FENCING,
    NOTIFICATION_RECOVERY,
  ],
};
