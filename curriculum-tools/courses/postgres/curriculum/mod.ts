// Module order is lesson order. Ordinals are assigned by `deno task build postgres`.
import type { Module } from "../../../src/types.ts";
import { LAB } from "./01-lab.ts";
import { STORAGE } from "./02-storage.ts";
import { MVCC } from "./03-mvcc.ts";
import { VACUUM } from "./04-vacuum.ts";
import { ISOLATION } from "./05-isolation.ts";
import { LOCKING } from "./06-locking.ts";
import { WAL } from "./07-wal.ts";
import { CHECKPOINTS } from "./08-checkpoints.ts";
import { REPLICATION } from "./09-replication.ts";
import { LOGICAL } from "./10-logical.ts";
import { PLANNER } from "./11-planner.ts";
import { INDEXES } from "./12-indexes.ts";
import { OBSERVABILITY } from "./13-observability.ts";
import { PATTERNS } from "./14-patterns.ts";
import { INCIDENTS } from "./15-incidents.ts";

export const MODULES: Module[] = [
  LAB,
  STORAGE,
  MVCC,
  VACUUM,
  ISOLATION,
  LOCKING,
  PLANNER,
  INDEXES,
  WAL,
  CHECKPOINTS,
  REPLICATION,
  LOGICAL,
  OBSERVABILITY,
  PATTERNS,
  INCIDENTS,
];
