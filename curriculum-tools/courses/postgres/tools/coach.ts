import { run as runTutor } from "../../../src/main.ts";
import { GUIDES } from "../guides/mod.ts";
import type { Guide } from "../guides/types.ts";

const COURSE = "postgres";
const COACH = "/root/Software/skills-tools/curriculum-tools/courses/postgres/bin/pgcoach";
const STAGES = new Set([
  "start",
  "run",
  "inspect",
  "explain",
  "vary",
  "apply",
  "hint1",
  "hint2",
  "reveal",
  "full",
]);
type Output = { log(value: string): void; error(value: string): void };
export type SelectedLesson = {
  ordinal: number;
  slug: string;
  title: string;
  sessions: number;
  runIn: "tool" | "shell" | "mixed";
  safetyLevel: string;
  minVersion: string;
  syntaxBreakdown: string;
  setup?: string;
  code: string;
  expectedResult: string;
  systemsLens: string;
  caution?: string;
  reading?: string;
  readingNotes?: string;
  studyCheckpoint?: {
    core: Array<{ source: string; locator: string }>;
    optionalDepth?: Array<{ source: string; locator: string }>;
    rationale: string;
  };
};
type Parsed = { ordinal?: number; stage: string; db?: string; topic?: string };
function usage(): string {
  return "Guided PostgreSQL Systems lessons.\n\nUsage:\n  pgcoach [NUMBER] [STAGE] [--db PATH] [--topic TEXT]\n\n" +
    "Stages: start (default), run, inspect, explain, vary, apply, hint1, hint2, reveal, full\n\n" +
    "Without NUMBER, pgcoach selects the next unfinished lesson. --topic selects the next unfinished\n" +
    "lesson matching every topic word. Use full for the unchanged complete tutor view.";
}
function parseArgs(args: string[]): Parsed {
  const positional: string[] = [];
  let db: string | undefined, topic: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--db" || arg === "--topic") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error("missing value for " + arg);
      if (arg === "--db") {
        if (db !== undefined) throw new Error("--db may be specified only once");
        db = value;
      } else {
        if (topic !== undefined) throw new Error("--topic may be specified only once");
        topic = value;
      }
    } else if (arg.startsWith("--")) throw new Error("unknown option: " + arg);
    else positional.push(arg);
  }
  let ordinal: number | undefined, stage = "start";
  if (positional.length === 1) {
    if (/^[1-9]\d*$/.test(positional[0])) ordinal = Number(positional[0]);
    else stage = positional[0];
  } else if (positional.length === 2) {
    if (!/^[1-9]\d*$/.test(positional[0])) {
      throw new Error("the first positional argument must be a positive lesson number");
    }
    ordinal = Number(positional[0]);
    stage = positional[1];
  } else if (positional.length > 2) throw new Error("expected at most a lesson number and a stage");
  if (!STAGES.has(stage)) throw new Error("unknown stage: " + stage);
  if (ordinal !== undefined && topic !== undefined) {
    throw new Error("--topic selects the next lesson and cannot be combined with NUMBER");
  }
  return { ordinal, stage, db, topic };
}
function capture(): { out: string[]; err: string[]; io: Output } {
  const out: string[] = [], err: string[] = [];
  return { out, err, io: { log: (value) => out.push(value), error: (value) => err.push(value) } };
}
function tutorFlags(options: Pick<Parsed, "db" | "topic">): string[] {
  return [
    ...(options.db ? ["--db", options.db] : []),
    ...(options.topic ? ["--topic", options.topic] : []),
  ];
}
export async function selectLesson(options: Parsed): Promise<
  | { kind: "lesson"; lesson: SelectedLesson }
  | { kind: "none"; message: string }
  | { kind: "error"; code: number; message: string }
> {
  const result = capture();
  const args = options.ordinal === undefined
    ? [COURSE, "next", "--json", ...tutorFlags(options)]
    : [COURSE, "show", String(options.ordinal), "--json", ...tutorFlags(options)];
  const code = await runTutor(args, result.io);
  if (code !== 0) {
    return {
      kind: "error",
      code,
      message: result.err.join("\n") || result.out.join("\n") || "tutor could not select a lesson",
    };
  }
  const text = result.out.join("\n").trim();
  if (!text) return { kind: "error", code: 1, message: "tutor returned no lesson data" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "error", code: 1, message: "tutor returned invalid JSON: " + text };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { kind: "error", code: 1, message: "tutor returned an invalid lesson response" };
  }
  const row = parsed as Record<string, unknown>;
  if (row.complete === true) {
    const topic = typeof row.topic === "string" ? " for topic '" + row.topic + "'" : "";
    return { kind: "none", message: "All matching PostgreSQL lessons are complete" + topic + "." };
  }
  if (row.matched === 0 && typeof row.topic === "string") {
    return {
      kind: "none",
      message: "No PostgreSQL lessons match topic '" + row.topic +
        "'. Run 'tutor postgres topics' to see the vocabulary.",
    };
  }
  if (typeof row.ordinal !== "number" || typeof row.slug !== "string") {
    return { kind: "error", code: 1, message: "tutor returned no selectable lesson" };
  }
  return { kind: "lesson", lesson: row as unknown as SelectedLesson };
}
function language(lesson: SelectedLesson): string {
  return lesson.runIn === "shell" ? "sh" : lesson.runIn === "mixed" ? "text" : "sql";
}
function fence(text: string, lang: string): string {
  return "```" + lang + "\n" + text + "\n```";
}
function identity(lesson: SelectedLesson): string {
  return "# Lesson " + lesson.ordinal + ": " + lesson.title + "\n\n**Lesson:** " + lesson.ordinal +
    " · `" + lesson.slug + "`";
}
export function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:=+-]+$/.test(value) ? value : "'" + value.replaceAll("'", "'\"'\"'") + "'";
}
function nextCommand(lesson: SelectedLesson, db?: string): string {
  return COACH + " " + lesson.ordinal + " run" + (db ? " --db " + shellQuote(db) : "");
}
function checkpoint(lesson: SelectedLesson): string | undefined {
  const value = lesson.studyCheckpoint;
  if (!value) return undefined;
  const parts = [
    "Stop here after completing the experiment. Complete the Core excerpts before continuing.",
    "### Core\n" + value.core.map((item) => "- " + item.source + " — " + item.locator).join("\n"),
  ];
  if (value.optionalDepth?.length) {
    parts.push(
      "### Optional depth\nRead these only if you want to go deeper.\n\n" +
        value.optionalDepth.map((item) => "- " + item.source + " — " + item.locator).join("\n"),
    );
  }
  parts.push("### Why here\n" + value.rationale);
  return "## Study checkpoint — stop before the next lesson\n" + parts.join("\n\n");
}
function missingGuide(lesson: SelectedLesson, db?: string): string {
  return [
    identity(lesson),
    "## Guided coaching is not authored for this lesson",
    "Use the complete legacy lesson view instead: `" + COACH + " " + lesson.ordinal + " full" +
    (db ? " --db " + shellQuote(db) : "") + "`. This command does not mark the lesson complete.",
  ].join("\n\n");
}
export function renderStage(
  lesson: SelectedLesson,
  stage: string,
  guide: Guide,
  db?: string,
): string {
  const intro = identity(lesson);
  if (stage === "start") {
    const runIn = lesson.runIn === "tool" ? "psql" : lesson.runIn;
    const sessions = lesson.sessions === 1 ? "1 session" : lesson.sessions + " sessions";
    return [
      intro,
      "**Run in:** " + runIn + " · **Sessions:** " + sessions + " · **Minimum PostgreSQL:** " +
      lesson.minVersion + " · **Safety:** " + lesson.safetyLevel,
      ...(lesson.caution ? ["## Caution\n" + lesson.caution] : []),
      "## Before you run\n" + guide.brief,
      "## Predict\n" + guide.predict,
      "Next: `" + nextCommand(lesson, db) +
      "`. Make the prediction before opening the supplied code.",
    ].join("\n\n");
  }
  if (stage === "run") {
    const environment = lesson.runIn === "tool"
      ? "Run this in psql."
      : lesson.runIn === "shell"
      ? "Run this in a shell."
      : "Run the labeled commands in both psql and a shell.";
    const sessions = lesson.sessions === 1
      ? "It needs one session."
      : "Open " + lesson.sessions + " psql sessions and follow the Session A/B labels in order.";
    return [
      intro,
      "## Safety, version, and sessions\nSafety level: **" + lesson.safetyLevel +
      "**. Minimum PostgreSQL version: **" + lesson.minVersion + "**. " + environment + " " +
      sessions,
      ...(lesson.caution ? ["## Caution\n" + lesson.caution] : []),
      ...(lesson.setup ? ["## Setup\n" + fence(lesson.setup, language(lesson))] : []),
      "## Run\n" + fence(lesson.code, language(lesson)),
      "## Syntax breakdown\n" + lesson.syntaxBreakdown,
      "Stop after running the commands. Keep the output as evidence for the inspect stage; this view does not reveal the expected result or mark completion.",
    ].join("\n\n");
  }
  if (stage === "inspect") return intro + "\n\n## Inspect\n" + guide.inspect;
  if (stage === "explain") return intro + "\n\n## Explain\n" + guide.explain;
  if (stage === "vary") {
    return intro + "\n\n## Vary\n" + guide.vary +
      "\n\nAsk for `hint1` or `hint2` when you want the supplied variation help.";
  }
  if (stage === "apply") return intro + "\n\n## Apply\n" + guide.apply;
  if (stage === "hint1") return intro + "\n\n## Hint 1\n" + guide.hints[0];
  if (stage === "hint2") return intro + "\n\n## Hint 2\n" + guide.hints[1];
  if (stage === "reveal") {
    return [
      intro,
      ...(lesson.reading ? ["## Optional reference\n" + lesson.reading] : []),
      ...(lesson.readingNotes ? ["## Optional reference context\n" + lesson.readingNotes] : []),
      "## Expected result\n" + lesson.expectedResult,
      "## Systems lens\n" + lesson.systemsLens,
      ...(checkpoint(lesson) ? [checkpoint(lesson)!] : []),
      "This reveal does not mark the lesson complete. If there is a study checkpoint, complete its Core items before moving to the next lesson.",
    ].join("\n\n");
  }
  throw new Error("cannot render stage " + stage);
}
async function renderFull(
  lesson: SelectedLesson,
  options: Parsed,
): Promise<{ code: number; output: string; error: string }> {
  const result = capture();
  const code = await runTutor([
    COURSE,
    "pretty",
    String(lesson.ordinal),
    "--plain",
    ...(options.db ? ["--db", options.db] : []),
  ], result.io);
  return { code, output: result.out.join("\n"), error: result.err.join("\n") };
}
export async function runCoach(args: string[], io: Output = console): Promise<number> {
  let options: Parsed;
  try {
    options = parseArgs(args);
  } catch (error) {
    io.error("Error: " + (error as Error).message + "\n\n" + usage());
    return 2;
  }
  const selected = await selectLesson(options);
  if (selected.kind === "error") {
    io.error("Error: " + selected.message);
    return selected.code;
  }
  if (selected.kind === "none") {
    io.log(selected.message);
    return 0;
  }
  if (options.stage === "full") {
    const full = await renderFull(selected.lesson, options);
    if (full.code !== 0) {
      io.error("Error: " + (full.error || full.output || "tutor could not render the full lesson"));
      return full.code;
    }
    io.log(full.output);
    return 0;
  }
  const guide = GUIDES[selected.lesson.slug];
  if (!guide) {
    io.log(missingGuide(selected.lesson, options.db));
    return 0;
  }
  try {
    io.log(
      renderStage(selected.lesson, options.stage, guide, options.db),
    );
    return 0;
  } catch (error) {
    io.error("Error: " + (error as Error).message);
    return 1;
  }
}
if (import.meta.main) Deno.exit(await runCoach(Deno.args));
