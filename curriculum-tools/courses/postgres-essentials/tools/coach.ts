import { run as runTutor } from "../../../src/main.ts";

type Output = { log(value: string): void; error(value: string): void };
const COURSE = "postgres-essentials";

const LEGACY_LESSON_ALIASES = new Set(["start", "review", "run", "full", "syntax"]);

function rewrite(value: string): string {
  // Rewrite only the generated completion footer. Lesson prose and user supplied note text remain
  // byte-for-byte shared-engine output, even when they contain the words "tutor postgres".
  return value.replace(
    /(When you consider it complete: `)tutor postgres-essentials(?= [0-9]+ done(?:[ `]|$))/g,
    "$1pgcoach",
  );
}

/** Map former presentation stages to the single complete lesson view. */
export function normalizeEssentialsArgs(args: string[]): string[] {
  const result = [...args];
  const positional: number[] = [];
  const valued = new Set(["--db", "--topic", "--note", "--category", "--limit"]);
  let missingValue = false;
  for (let i = 0; i < result.length; i++) {
    if (valued.has(result[i])) {
      if (i + 1 >= result.length || result[i + 1].startsWith("--")) missingValue = true;
      else i++;
    } else if (!result[i].startsWith("--")) positional.push(i);
  }
  if (positional.length === 0 && !missingValue) return [...result, "lesson"];
  const stageIndex = positional[0] !== undefined && /^\d+$/.test(result[positional[0]])
    ? positional[1]
    : positional[0];
  if (stageIndex !== undefined && LEGACY_LESSON_ALIASES.has(result[stageIndex])) {
    result[stageIndex] = "lesson";
  }
  return result;
}

const HELP = `pgcoach — PostgreSQL Essentials

Usage:
  pgcoach route [--db PATH]
  pgcoach [NUMBER] lesson [--db PATH] [--topic TEXT]
  pgcoach NUMBER done [--db PATH]

The lesson view includes its mechanism, diagram, connection/session instructions, commands,
expected evidence, interpretation and cleanup. Showing a lesson never marks it complete.
Legacy start, review, run, full and syntax stages open the same complete lesson view.
The original 92-lesson reference remains available with pgcoach --reference.`;

export async function runEssentials(args: string[], io: Output = console): Promise<number> {
  if (args.length === 1 && ["help", "--help"].includes(args[0])) {
    io.log(HELP);
    return 0;
  }
  const normalized = normalizeEssentialsArgs(args);
  return await runTutor([COURSE, ...normalized], {
    log: (value) => io.log(rewrite(value)),
    error: (value) => io.error(rewrite(value)),
  });
}

if (import.meta.main) Deno.exit(await runEssentials(Deno.args));
