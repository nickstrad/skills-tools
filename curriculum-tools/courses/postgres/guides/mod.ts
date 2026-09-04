import { guides as storage } from "./02-storage.ts";
import { guides as mvcc } from "./03-mvcc.ts";
import { guides as vacuum } from "./04-vacuum.ts";
import type { Guide } from "./types.ts";

export const GUIDES: Record<string, Guide> = { ...storage, ...mvcc, ...vacuum };
