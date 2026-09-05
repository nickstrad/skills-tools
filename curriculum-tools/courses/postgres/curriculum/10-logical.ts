import type { Module } from "../../../src/types.ts";
import { LOGICAL_RESNAPSHOT } from "./logical-resnapshot.ts";
import { LOGICAL_CONFLICTS } from "./logical-conflicts.ts";
import { LOGICAL_BOOTSTRAP } from "./logical-bootstrap.ts";
import { SLOT_DELIVERY } from "./slot-delivery.ts";
import { LOGICAL_DECODING } from "./logical-decoding.ts";

export const LOGICAL: Module = {
  category: "logical-replication",
  title: "Logical decoding, CDC, and publications",
  lessons: [
    LOGICAL_DECODING,
    SLOT_DELIVERY,
    LOGICAL_BOOTSTRAP,
    LOGICAL_CONFLICTS,
    LOGICAL_RESNAPSHOT,
  ],
};
