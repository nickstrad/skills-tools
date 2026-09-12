import { type Module } from "../../../src/types.ts";
import { CAPACITY } from "./capacity-workload.ts";
import { DEADLINE_OBSERVATION } from "./deadline-observation.ts";
import { INDEX_USAGE } from "./index-usage-observation.ts";
import { IO_OBSERVATION } from "./io-observation.ts";
import { LOG_OBSERVATION } from "./log-observation.ts";
import { WAIT_OBSERVATION } from "./wait-observation.ts";

export const OBSERVABILITY: Module = {
  category: "observability",
  title: "Wait events, I/O stats, and capacity",
  lessons: [
    WAIT_OBSERVATION,
    IO_OBSERVATION,
    CAPACITY,
    DEADLINE_OBSERVATION,
    INDEX_USAGE,
    LOG_OBSERVATION,
  ],
};
