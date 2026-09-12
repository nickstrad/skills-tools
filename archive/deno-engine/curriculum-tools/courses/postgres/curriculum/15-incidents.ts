import { TASK_RUNNER_CAPSTONE } from "./task-runner-capstone.ts";
import { CANCEL_INCIDENT } from "./cancel-incident.ts";
import { type Module } from "../../../src/types.ts";
import { CORRUPTION_INCIDENT } from "./corruption-incident.ts";
import { FREEZE_INCIDENT } from "./freeze-incident.ts";
import { DISK_INCIDENT } from "./disk-incident.ts";

export const INCIDENTS: Module = {
  category: "reliability",
  title: "Capstone incidents: read the symptom, find the cause, get the cluster back",
  lessons: [
    DISK_INCIDENT,
    CORRUPTION_INCIDENT,
    FREEZE_INCIDENT,
    CANCEL_INCIDENT,
    TASK_RUNNER_CAPSTONE,
  ],
};
