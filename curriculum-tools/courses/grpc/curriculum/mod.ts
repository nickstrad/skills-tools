// Module order is lesson order. Ordinals are assigned by `deno task build grpc`.
import type { Module } from "../../../src/types.ts";
import { PROTOBUF } from "./01-protobuf.ts";
import { RPC } from "./02-grpc.ts";

export const MODULES: Module[] = [PROTOBUF, RPC];
