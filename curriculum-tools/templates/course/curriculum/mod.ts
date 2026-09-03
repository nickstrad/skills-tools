// Module order is lesson order. Ordinals are assigned by `deno task build {{id}}`.
import type { Module } from "../../../src/types.ts";
import { LAB } from "./01-lab.ts";

export const MODULES: Module[] = [LAB];
