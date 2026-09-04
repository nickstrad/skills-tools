// Course-local evidence runner. The generic REPL harness intentionally does not run shell lessons.
// This driver runs both kinds serially and preserves complete output for semantic review.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Lesson } from "../../../src/types.ts";
import { validateLessons } from "../../../src/validator.ts";

const courseDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lessons: Lesson[] = JSON.parse(await Deno.readTextFile(resolve(courseDir, "lessons.json")));
const selectors = Deno.args.filter((arg) => arg !== "--isolated");
const isolated = Deno.args.includes("--isolated");
const root = await Deno.makeTempDir({ prefix: "sqlite-course-evidence-" });
console.log(`Evidence: ${root}`);
const selected = lessons.filter((lesson) =>
  selectors.length === 0 || selectors.includes(lesson.slug) ||
  selectors.includes(String(lesson.ordinal))
);
for (const selector of selectors) {
  if (!selected.some((lesson) => lesson.slug === selector || String(lesson.ordinal) === selector)) {
    throw new Error(`Unknown lesson selector: ${selector}`);
  }
}
const results: { slug: string; ordinal: number; status: string; log: string }[] = [];
let failed = false;
for (const lesson of selected) {
  const work = isolated ? resolve(root, lesson.slug) : resolve(root, "sequential");
  const lab = resolve(work, "sqlite-lab");
  await Deno.mkdir(lab, { recursive: true });
  const env = { ...Deno.env.toObject(), SQLITE_LAB: lab, TUTOR_SQLITE_DB: resolve(lab, "lab.db") };
  console.log(`Running ${lesson.ordinal}: ${lesson.slug}`);
  let output = "";
  let status = "completed; inspect evidence";
  if (lesson.runIn === "shell") {
    const prerequisite = isolated && lesson.slug === "hot-journal-recovery"
      ? lessons.find((item) => item.slug === "crash-leaves-hot-journal")?.code
      : undefined;
    // The prerequisite changes shell variables and owns EXIT traps. Match separate learner
    // shell invocations so its scratch path does not replace the recovery lesson's lab parent.
    const preparation = prerequisite ? `(\n${prerequisite}\n)` : undefined;
    const result = await new Deno.Command("timeout", {
      args: [
        "-k",
        "3",
        "120",
        "bash",
        "--noprofile",
        "--norc",
        "-c",
        [preparation, lesson.setup, lesson.code].filter(Boolean).join("\n"),
      ],
      env,
      cwd: work,
      stdout: "piped",
      stderr: "piped",
    }).output();
    output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
    status = result.success ? "exit 0; inspect evidence" : `FAILED exit ${result.code}`;
    if (!result.success) failed = true;
  } else {
    const lines: string[] = [];
    const result = await validateLessons([lesson], {
      repl: {
        command: [resolve(courseDir, "bin/sqlite-repl")],
        echo: ".print {marker}",
        quit: ".quit",
      },
      env,
      timeoutMs: 30000,
      log: (line) => lines.push(line),
    });
    output = lines.join("\n");
    if (result.failures) {
      failed = true;
      status = "FAILED REPL timeout";
    }
  }
  const log = resolve(root, `${String(lesson.ordinal).padStart(2, "0")}-${lesson.slug}.log`);
  await Deno.writeTextFile(log, output + `\n\nEXPECTED:\n${lesson.expectedResult}\n`);
  results.push({ slug: lesson.slug, ordinal: lesson.ordinal, status, log });
  console.log(`  ${status}: ${log}`);
}
await Deno.writeTextFile(resolve(root, "results.json"), JSON.stringify(results, null, 2));
console.log(
  "Tool completion detects timeouts only. Review each log against EXPECTED, including every SQL error.",
);
if (isolated && selected.some((lesson) => lesson.slug === "hot-journal-recovery")) {
  console.log(
    "The hot-journal recovery lesson ran after its explicit crash prerequisite in the same private lab.",
  );
}
Deno.exit(failed ? 1 : 0);
