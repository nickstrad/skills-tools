// Module order is lesson order. Ordinals are assigned by `deno task build linux`.
import type { Module } from "../../../src/types.ts";
import { LAB } from "./01-lab-and-shell.ts";
import { PROCESSES } from "./02-processes.ts";
import { LIFECYCLE } from "./03-lifecycle-and-signals.ts";
import { FILE_DESCRIPTORS } from "./04-file-descriptors-and-pipes.ts";
import { FILESYSTEM } from "./05-filesystem-objects.ts";
import { MOUNTS } from "./06-mounts-and-storage.ts";
import { MEMORY } from "./07-virtual-memory.ts";
import { CPU } from "./08-cpu-and-scheduling.ts";
import { LIMITS } from "./09-resource-boundaries.ts";
import { SOCKETS } from "./10-sockets-and-networking.ts";
import { NAMESPACES } from "./11-namespaces.ts";
import { CAPSTONES } from "./12-capstones.ts";

export const MODULES: Module[] = [
  LAB,
  PROCESSES,
  LIFECYCLE,
  FILE_DESCRIPTORS,
  FILESYSTEM,
  MOUNTS,
  MEMORY,
  CPU,
  LIMITS,
  SOCKETS,
  NAMESPACES,
  CAPSTONES,
];
