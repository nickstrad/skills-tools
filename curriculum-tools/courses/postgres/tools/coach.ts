import { run as runTutor } from "../../../src/main.ts";

type Output = { log(value: string): void; error(value: string): void };
const COURSE = "postgres";

// The reference catalog remains intact; only its obsolete multi-stage presentation is retired.
const LEGACY_LESSON_ALIASES = new Set(["start", "review", "run", "full", "syntax"]);

function rewrite(value: string): string {
  // Rewrite only the generated completion footer; never mutate lesson prose or user notes.
  return value.replace(
    /(When you consider it complete: `)tutor postgres(?= [0-9]+ done(?:[ `]|$))/g,
    "$1pgcoach --reference",
  );
}

/** Normalize historical presentation stages to the complete shared lesson view. */
export function normalizeReferenceArgs(args: string[]): string[] {
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

const HELP = `pgcoach --reference — original PostgreSQL Systems course

Usage:
  pgcoach --reference route [--db PATH]
  pgcoach --reference [NUMBER] lesson [--db PATH] [--topic TEXT]
  pgcoach --reference NUMBER done [--db PATH]

The original 92 lessons and their separate progress remain available. The complete lesson view
includes context, commands, expected evidence and interpretation. Historical start, review, run,
full and syntax stages now open that same complete view; completion is explicit.`;

export async function runCoach(args: string[], io: Output = console): Promise<number> {
  if (args.length === 1 && ["help", "--help"].includes(args[0])) {
    io.log(HELP);
    return 0;
  }
  const normalized = normalizeReferenceArgs(args);
  return await runTutor([COURSE, ...normalized], {
    log: (value) => io.log(rewrite(value)),
    error: (value) => io.error(rewrite(value)),
  });
}

if (import.meta.main) Deno.exit(await runCoach(Deno.args));
