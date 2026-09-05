import { guides as storage } from "./02-storage.ts";
import { guides as mvcc } from "./03-mvcc.ts";
import { guides as vacuum } from "./04-vacuum.ts";
import { guides as isolation } from "./05-isolation.ts";
import { guides as locking } from "./06-locking.ts";
import { guides as wal } from "./07-wal.ts";
import { guides as checkpoints } from "./08-checkpoints.ts";
import { guides as replication } from "./09-replication.ts";
import { guides as logical } from "./10-logical.ts";
import { guides as planner } from "./11-planner.ts";
import { guides as indexes } from "./12-indexes.ts";
import { guides as observability } from "./13-observability.ts";
import type { Guide } from "./types.ts";

export const GUIDES: Record<string, Guide> = {
  ...storage,
  ...mvcc,
  ...vacuum,
  ...isolation,
  ...locking,
  ...wal,
  ...checkpoints,
  ...replication,
  ...logical,
  ...planner,
  ...indexes,
  ...observability,
};
