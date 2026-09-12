import type { Draft, Module } from "../../../src/types.ts";
import { REUSE_VISUAL } from "./02-reuse.ts";
import { ATOMIC_WRITE_VISUAL } from "./03-atomic-write.ts";
import { ROW_LOCK_VISUAL } from "./04-row-lock.ts";
import { VERSION_CHECK_VISUAL } from "./05-version-check.ts";
import { WRITE_SKEW_VISUAL } from "./06-write-skew.ts";
import { SERIALIZABLE_VISUAL } from "./07-serializable.ts";
import { RETRY_VISUAL } from "./08-retry.ts";
import { UNKNOWN_OUTCOME_VISUAL } from "./09-unknown-outcome.ts";
import { REQUEST_IDENTITY_VISUAL } from "./10-request-identity.ts";
import { BLOCKER_VISUAL } from "./11-blocker.ts";
import { DEADLOCK_VISUAL } from "./12-deadlock.ts";
import { TIMEOUT_VISUAL } from "./13-timeout.ts";
import { READ_PLAN_VISUAL, STATISTICS_VISUAL } from "./14-plans.ts";
import { COMPOSITE_INDEX_VISUAL, INDEX_CROSSOVER_VISUAL } from "./15-index-choice.ts";
import { INDEX_ONLY_VISUAL, SORT_SPILL_VISUAL } from "./16-visibility-sort.ts";
import { JOIN_MEMORY_VISUAL } from "./17-join-memory.ts";
import { COMMIT_WAL_VISUAL, WAL_PER_WRITE_VISUAL } from "./18-wal.ts";
import { CHECKPOINT_VISUAL } from "./19-checkpoint.ts";
import { CRASH_REPLAY_VISUAL } from "./20-crash-replay.ts";

// These three diagrams belonged to the old wrapper and are now authored into the lesson text.
const VISUALS: Record<string, string> = {
  "committed-row-visibility": `One logical row, different visible versions

Session A: BEGIN --> UPDATE --> own SELECT --> COMMIT
                       |                        |
                 private version          accepted version
                       |                        |
Session B:       older committed row       fresh read can see it

ROLLBACK abandons A's change instead of publishing it.`,
  "statement-versus-transaction-snapshot":
    `Same schedule: A reads --> B commits an update --> A reads again

READ COMMITTED:   [snapshot 1]                 [snapshot 2]
REPEATABLE READ:  [snapshot 1 ----------------------------]
                  first SELECT                 same view

After A ends its transaction, its next read takes a fresh view.`,
  "old-reader-retains-history": `A's stable snapshot --------------------------> ends
          |                                       |
          needs old rows                           releases need
          |                                       |
B:     DELETE commits --> VACUUM                VACUUM again
       new reads: 0       must keep history      may reclaim it

Logical disappearance and physical reclamation are separate events.`,
  "reusable-space-versus-file-size": REUSE_VISUAL,
  "lost-update-and-atomic-write": ATOMIC_WRITE_VISUAL,
  "row-lock-protects-decision": ROW_LOCK_VISUAL,
  "reject-stale-edit": VERSION_CHECK_VISUAL,
  "multi-row-write-skew": WRITE_SKEW_VISUAL,
  "serializable-protects-invariant": SERIALIZABLE_VISUAL,
  "whole-transaction-retry": RETRY_VISUAL,
  "unknown-commit-outcome": UNKNOWN_OUTCOME_VISUAL,
  "durable-request-identity": REQUEST_IDENTITY_VISUAL,
  "find-the-blocker": BLOCKER_VISUAL,
  "deadlock-cycle": DEADLOCK_VISUAL,
  "timeout-and-transaction-state": TIMEOUT_VISUAL,
  "read-a-plan-as-evidence": READ_PLAN_VISUAL,
  "statistics-and-estimates": STATISTICS_VISUAL,
  "index-crossover": INDEX_CROSSOVER_VISUAL,
  "composite-index-order": COMPOSITE_INDEX_VISUAL,
  "index-only-needs-visibility": INDEX_ONLY_VISUAL,
  "sort-spill": SORT_SPILL_VISUAL,
  "join-memory": JOIN_MEMORY_VISUAL,
  "commit-and-wal": COMMIT_WAL_VISUAL,
  "wal-per-useful-write": WAL_PER_WRITE_VISUAL,
  "checkpoint-writeback": CHECKPOINT_VISUAL,
  "crash-replay": CRASH_REPLAY_VISUAL,
};

function connectionContext(lesson: Draft): string {
  if (lesson.runIn === "shell") {
    const cleanup = lesson.slug === "checkpoint-writeback" || lesson.slug === "crash-replay"
      ? "the controller's owned cluster removal record"
      : "the controller's schema removal record";
    return `### Terminals and cleanup
Run this lesson in one shell. The supplied client opens its own bounded database connections; keep
the coaching terminal separate from that shell. It uses the learner lab unless the lesson says it
creates a private cluster. On normal exit, check the printed ${cleanup}; on Ctrl-C, wait for cleanup
to finish before rerunning. If you reach the fifteen-minute core limit or get stuck, press Ctrl-C
and check that the owned resource is removed before trying again.`;
  }
  const sessions = (lesson.sessions ?? 1) === 1
    ? "one experiment terminal (Session A)"
    : `${lesson.sessions ?? 1} experiment terminals, labelled Session A and Session B`;
  const switchNote = (lesson.sessions ?? 1) === 1
    ? "Run every block in Session A in the order shown."
    : "Run setup once in A, keep both connections open, and follow the Session A/B labels. If B is intentionally waiting, switch to A and run its next block.";
  return `### Terminals and cleanup
Open ${sessions} and connect each psql session with:
\`\`\`sh
psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off
\`\`\`
The flags skip personal startup settings, select the learner socket, port, role and database, and
keep output in the terminal. Finish any earlier transaction with **ROLLBACK** before setup. ${switchNote}
If you reach the fifteen-minute core limit or get stuck, ROLLBACK in the open sessions and follow
the lesson's exact cleanup command so its named pe_* table and session settings are removed.`;
}

function addContext(lesson: Draft): Draft {
  const visual = VISUALS[lesson.slug];
  // New batches supply their own diagrams. This helper only folds the maps owned by the old
  // wrapper into the existing authored batch.
  if (!visual) return lesson;
  const marker = "\n### What you are learning";
  const at = lesson.syntaxBreakdown.indexOf(marker);
  if (at < 0) {
    throw new Error(`Essentials lesson ${lesson.slug} has no What you are learning section`);
  }
  const before = lesson.syntaxBreakdown.slice(0, at).trimEnd();
  const after = lesson.syntaxBreakdown.slice(at);
  const mechanismMap = `\n\n### Mechanism map\n\n\`\`\`text\n${visual}\n\`\`\`\n\n${
    connectionContext(lesson)
  }`;
  return { ...lesson, syntaxBreakdown: before + mechanismMap + after };
}

/** Fold former wrapper-only visuals and terminal instructions into authored lesson content. */
export function withEssentialsContext(modules: Module[]): Module[] {
  return modules.map((module) => ({
    ...module,
    lessons: module.lessons.map(addContext),
  }));
}
