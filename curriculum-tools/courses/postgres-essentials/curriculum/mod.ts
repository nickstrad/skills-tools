import { VISIBILITY } from "./01-visibility.ts";
import { REUSE } from "./02-reuse.ts";
import { ATOMIC_WRITE } from "./03-atomic-write.ts";
import { ROW_LOCK } from "./04-row-lock.ts";
import { VERSION_CHECK } from "./05-version-check.ts";
import { WRITE_SKEW } from "./06-write-skew.ts";
import { SERIALIZABLE } from "./07-serializable.ts";
import { RETRY } from "./08-retry.ts";
export const MODULES = [
  VISIBILITY,
  REUSE,
  ATOMIC_WRITE,
  ROW_LOCK,
  VERSION_CHECK,
  WRITE_SKEW,
  SERIALIZABLE,
  RETRY,
];
