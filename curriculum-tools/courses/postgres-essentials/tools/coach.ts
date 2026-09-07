import { run as runTutor } from "../../../src/main.ts";
import type { Lesson } from "../../../src/types.ts";
import { ROUTE } from "../route.ts";
import { shellQuote } from "../../postgres/tools/coach_commands.ts";
import { REUSE_VISUAL } from "../curriculum/02-reuse.ts";
import { ATOMIC_WRITE_VISUAL } from "../curriculum/03-atomic-write.ts";
import { ROW_LOCK_VISUAL } from "../curriculum/04-row-lock.ts";
import { VERSION_CHECK_VISUAL } from "../curriculum/05-version-check.ts";
import { WRITE_SKEW_VISUAL } from "../curriculum/06-write-skew.ts";
import { SERIALIZABLE_VISUAL } from "../curriculum/07-serializable.ts";
import { RETRY_VISUAL } from "../curriculum/08-retry.ts";

import { UNKNOWN_OUTCOME_VISUAL } from "../curriculum/09-unknown-outcome.ts";

type Output = { log(value: string): void; error(value: string): void };
type Selected = Lesson & { status?: string };
const COURSE = "postgres-essentials";
const catalog: Lesson[] = JSON.parse(
  await Deno.readTextFile(new URL("../lessons.json", import.meta.url)),
);
const VISUALS: Record<string, string> = {
  "unknown-commit-outcome": UNKNOWN_OUTCOME_VISUAL,
  "reject-stale-edit": VERSION_CHECK_VISUAL,
  "multi-row-write-skew": WRITE_SKEW_VISUAL,
  "serializable-protects-invariant": SERIALIZABLE_VISUAL,
  "whole-transaction-retry": RETRY_VISUAL,
  "reusable-space-versus-file-size": REUSE_VISUAL,
  "lost-update-and-atomic-write": ATOMIC_WRITE_VISUAL,
  "row-lock-protects-decision": ROW_LOCK_VISUAL,
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
};

function fence(text: string, language = "sql") {
  return "```" + language + "\n" + text + "\n```";
}
function experiment(code: string, language = "sql"): string {
  // Keep each terminal switch copyable on its own while preserving the exact SQL and labels.
  return code.split(/(?=^-- Session [A-Z])/m).filter((block) => block.trim()).map((block) =>
    fence(block.trim(), language)
  ).join("\n\n");
}
function command(n: number, stage: string, db?: string) {
  return `pgcoach ${n} ${stage}` + (db ? " --db " + shellQuote(db) : "");
}
export function batchCheck(): string {
  return `**Batch check:** Before we prepare lesson ${catalog.length + 1}, briefly tell me ` +
    "whether the first view and diagrams gave enough context, whether review added insight, and " +
    "whether each lesson fit 20–30 minutes. A quick chat is enough. We will adjust the UX while " +
    "continuing this 40-lesson route; there is no separate practice batch or required report.";
}

export function render(lesson: Selected, stage: string, db?: string): string {
  const parts = [
    `# PostgreSQL Essentials ${lesson.ordinal}/${ROUTE.length}: ${lesson.title}`,
    `**Core:** 20–30 min (estimate ${lesson.estimatedMinutes} min) · **Sessions:** ${lesson.sessions} · **PostgreSQL:** ${lesson.minVersion}+`,
  ];
  const twoSessions = lesson.sessions === 2;
  const shell = lesson.runIn === "shell";
  const language = shell ? "sh" : "sql";
  const terminals = twoSessions ? "both sessions" : "session A";
  const first = stage === "lesson" || stage === "full";
  const second = stage === "review" || stage === "full";
  if (first) {
    parts.push(lesson.overview);
    // The canonical teaching text and visual precede all commands, including setup.
    const [concepts, syntax] = lesson.syntaxBreakdown.split("### Piece by piece");
    if (!syntax || !VISUALS[lesson.slug]) throw new Error("Missing authored lesson context");
    parts.push(
      concepts.trim(),
      fence(VISUALS[lesson.slug], "text"),
      "### Commands you will use\n\n" + syntax.trim(),
    );
    if (lesson.caution) parts.push(lesson.caution);
    parts.push(
      shell
        ? "## Open one experiment terminal\n\nKeep this coaching terminal open. Use a shell in another terminal; the supplied client opens its own database connections."
        : twoSessions
        ? "## Open two experiment terminals\n\nKeep this coaching terminal open. Label two other terminals A and B and connect both:"
        : "## Open one experiment terminal\n\nKeep this coaching terminal open. Label another terminal A and connect:",
      shell ? "" : fence("psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off", "sh"),
      shell
        ? "Run setup and the experiment in that same shell. The client handles connection and fixture cleanup."
        : "Here `-X` skips personal psql startup settings; `-h` names the socket directory, `-p` the port, " +
          "`-U` the role, `-d` the database, and `-P pager=off` keeps output in the terminal. " +
          `Use the existing learner lab. Finish any earlier transaction with ROLLBACK in ${terminals} before setup. ` +
          "Run setup once in A, then follow each labelled block in order. " +
          (twoSessions
            ? "A block that says to leave a transaction open is intentional. If B waits, switch to A and run its next block; do not wait for B to return first."
            : "All commands run in A with no explicit open transaction."),
      "## Setup — A\n\n" + fence(lesson.setup ?? "", language),
      "## Experiment\n\n" + experiment(lesson.code, language),
      "**Reflect briefly:** Connect one changed result to the diagram. Then open review to compare with the explanation; no written answer is needed.",
      shell
        ? "If you reach 30 minutes or get stuck, stop and ask for help. Ctrl-C interrupts the supplied client and runs its cleanup; check for the schema removal record."
        : `If you reach 30 minutes or get stuck, stop and ask for help. To stop early, ROLLBACK in ${terminals}, ` +
          "then drop only this lesson's pe_* table named in its final command. Rerun setup next time.",
    );
  }
  if (second) {
    parts.push(
      "## What the experiment showed\n\n" + lesson.expectedResult,
      "## What to take from it\n\n" + lesson.systemsLens,
    );
    if (lesson.challenge) parts.push("## Optional variation\n\n" + lesson.challenge);
    if (lesson.ordinal === catalog.length) parts.push(batchCheck());
    else {parts.push(
        "**Quick check:** Does the result make sense, and did this fit your time budget? Mention any friction in our chat; otherwise continue.",
      );}
  }
  if (stage === "full" && lesson.reading) {
    parts.push("## Optional reference\n\n" + lesson.reading, lesson.readingNotes ?? "");
  }
  if (stage === "lesson") parts.push("Next: `" + command(lesson.ordinal, "review", db) + "`");
  if (second) {
    parts.push("When you consider it complete: `" + command(lesson.ordinal, "done", db) + "`");
    if (lesson.ordinal < catalog.length) {
      parts.push("Next lesson: `" + command(lesson.ordinal + 1, "lesson", db) + "`");
    } else {
      parts.push(
        `Lessons ${
          catalog.length + 1
        }–${ROUTE.length} are planned, not yet available. View the sequence with \`pgcoach route\`.`,
      );
    }
  }
  return parts.filter(Boolean).join("\n\n");
}

const HELP = "pgcoach [NUMBER] [lesson|review|full] [--db PATH] [--topic TEXT]\n" +
  "pgcoach NUMBER done [--db PATH] — explicitly record completion\n" +
  "pgcoach route — all 40 planned lessons and availability\n" +
  "start is an alias for lesson; omitting NUMBER selects the next unfinished available lesson.\n" +
  "pgcoach --reference NUMBER full — the original 92-lesson reference";

export async function runEssentials(args: string[], io: Output = console): Promise<number> {
  try {
    if (args.length === 1 && ["--help", "help"].includes(args[0])) {
      io.log(HELP);
      return 0;
    }
    if (args.length === 1 && args[0] === "route") {
      io.log(
        "# PostgreSQL Essentials — 40 lessons, 20–30 minutes each\n\n" +
          ROUTE.map((l, i) =>
            `${i + 1}. ${l.title} — ${i < catalog.length ? "available" : "planned"}`
          ).join("\n"),
      );
      return 0;
    }
    const positional: string[] = [];
    let db: string | undefined, topic: string | undefined;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--db" || arg === "--topic") {
        const value = args[++i];
        if (!value || value.startsWith("--")) throw new Error("Missing value for " + arg);
        if (arg === "--db") {
          if (db !== undefined) throw new Error("Repeated --db");
          db = value;
        } else {
          if (topic !== undefined) throw new Error("Repeated --topic");
          topic = value;
        }
      } else if (arg.startsWith("--")) throw new Error("Unknown option " + arg);
      else positional.push(arg);
    }
    let ordinal: number | undefined;
    if (/^[1-9]\d*$/.test(positional[0] ?? "")) ordinal = Number(positional.shift());
    let stage = positional.shift() ?? "lesson";
    if (stage === "start") stage = "lesson";
    if (positional.length || !["lesson", "review", "full", "done"].includes(stage)) {
      throw new Error("Use lesson, review, full or an explicit NUMBER done");
    }
    if (ordinal && topic) throw new Error("--topic cannot be combined with NUMBER");
    if (stage === "done" && ordinal === undefined) {
      throw new Error("Completion needs an explicit lesson number");
    }
    if (ordinal && ordinal > ROUTE.length) throw new Error("The route has 40 lessons");
    if (ordinal && ordinal > catalog.length) {
      if (stage === "done") throw new Error("Cannot complete an unauthored lesson");
      io.log(
        `Lesson ${ordinal}: ${
          ROUTE[ordinal - 1].title
        }\n\nThis lesson is planned, not yet available.\n\n` + batchCheck(),
      );
      return 0;
    }
    const flags = [...(db ? ["--db", db] : []), ...(topic ? ["--topic", topic] : [])];
    if (stage === "done") return await runTutor([COURSE, "done", String(ordinal), ...flags], io);
    const out: string[] = [], err: string[] = [];
    const code = await runTutor([
      COURSE,
      ordinal ? "show" : "next",
      ...(ordinal ? [String(ordinal)] : []),
      "--json",
      ...flags,
    ], { log: (s) => out.push(s), error: (s) => err.push(s) });
    if (code) {
      io.error(err.join("\n") || out.join("\n"));
      return code;
    }
    const selected = JSON.parse(out.join("\n"));
    if (selected.complete === true) {
      io.log(
        topic
          ? "All available lessons matching that topic are complete. Use pgcoach route to see the planned sequence."
          : `All ${catalog.length} available lessons are complete; the remaining ${
            ROUTE.length - catalog.length
          } are planned.\n\n` + batchCheck(),
      );
    } else if (selected.matched === 0) {
      io.log("No available lesson matches that topic. Use pgcoach route for the planned sequence.");
    } else io.log(render(selected as Selected, stage, db));
    return 0;
  } catch (error) {
    io.error("Error: " + (error as Error).message + "\n\n" + HELP);
    return 2;
  }
}
if (import.meta.main) Deno.exit(await runEssentials(Deno.args));
