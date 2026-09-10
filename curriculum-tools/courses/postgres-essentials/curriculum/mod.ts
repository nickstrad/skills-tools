import { VISIBILITY } from "./01-visibility.ts";
import { REUSE } from "./02-reuse.ts";
import { ATOMIC_WRITE } from "./03-atomic-write.ts";
import { ROW_LOCK } from "./04-row-lock.ts";
import { VERSION_CHECK } from "./05-version-check.ts";
import { WRITE_SKEW } from "./06-write-skew.ts";
import { SERIALIZABLE } from "./07-serializable.ts";
import { RETRY } from "./08-retry.ts";
import { UNKNOWN_OUTCOME } from "./09-unknown-outcome.ts";
import { REQUEST_IDENTITY } from "./10-request-identity.ts";
import { BLOCKER } from "./11-blocker.ts";
import { DEADLOCK } from "./12-deadlock.ts";
import { TIMEOUT } from "./13-timeout.ts";
import { PLANS } from "./14-plans.ts";
import { INDEX_CHOICE } from "./15-index-choice.ts";
import { VISIBILITY_SORT } from "./16-visibility-sort.ts";
export const MODULES = [
  VISIBILITY,
  REUSE,
  ATOMIC_WRITE,
  ROW_LOCK,
  VERSION_CHECK,
  WRITE_SKEW,
  SERIALIZABLE,
  RETRY,
  UNKNOWN_OUTCOME,
  REQUEST_IDENTITY,
  BLOCKER,
  DEADLOCK,
  TIMEOUT,
  PLANS,
  INDEX_CHOICE,
  VISIBILITY_SORT,
];
