// Module order is lesson order. Ordinals are assigned by `deno task build sqlite`.
import type { Module } from "../../../src/types.ts";
import { LAB_FILE } from "./01-lab-file.ts";
import { PAGES } from "./02-pages.ts";
import { JOURNALS } from "./03-journals.ts";
import { CONCURRENCY } from "./04-concurrency.ts";
import { WAL } from "./05-wal.ts";
import { RECOVERY } from "./06-recovery.ts";
import { PERFORMANCE } from "./07-performance.ts";
import { LOCAL_SYSTEMS } from "./08-local-systems.ts";
import { TOOLKIT } from "./10-toolkit.ts";
import { CAPSTONE } from "./09-capstone.ts";

export const MODULES: Module[] = [
  LAB_FILE,
  PAGES,
  JOURNALS,
  CONCURRENCY,
  WAL,
  RECOVERY,
  PERFORMANCE,
  LOCAL_SYSTEMS,
  TOOLKIT,
  CAPSTONE,
];
