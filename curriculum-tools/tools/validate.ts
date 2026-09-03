// Runs a course's lessons against a real lab by driving one REPL process per session.
//
// Usage:
//   deno run -A tools/validate.ts <course> [--from N] [--to N] [--timeout MS] [slug|ordinal ...]
//
// Tool-mode courses drive their configured database REPL. A course whose repl.mode is
// "shell" drives persistent Bash sessions for shell lessons and records each command's
// exit status in its completion marker.
import { resolve } from "node:path";
import type { Course, Lesson } from "../src/types.ts";
import { type Repl, validateLessons } from "../src/validator.ts";

const args = [...Deno.args];
const opt = (name: string, dflt: string) => {
  const i = args.indexOf(name);
  if (i < 0) return dflt;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const from = Number(opt("--from", "1"));
const to = Number(opt("--to", "999999"));
const timeoutMs = Number(opt("--timeout", "30000"));
const courseId = args.shift();
if (!courseId) {
  console.error(
    "usage: deno run -A tools/validate.ts <course> [--from N] [--to N] [--timeout MS] [slug|ordinal ...]",
  );
  Deno.exit(2);
}
const root = resolve(new URL("..", import.meta.url).pathname);
const courseDir = resolve(root, "courses", courseId);
const course = JSON.parse(await Deno.readTextFile(resolve(courseDir, "course.json"))) as
  & Course
  & { repl?: Repl };
if (!course.repl) {
  console.error(`courses/${courseId}/course.json has no "repl" block; see tools/validate.ts`);
  Deno.exit(2);
}

const lessons = JSON.parse(await Deno.readTextFile(resolve(courseDir, "lessons.json"))) as Lesson[];
const result = await validateLessons(lessons, {
  repl: course.repl,
  env: Deno.env.toObject(),
  timeoutMs,
  from,
  to,
  selectors: args,
});
console.log(
  `\n${result.selected - result.failures}/${result.selected} lessons completed without timeout`,
);
if (result.failures) Deno.exit(1);
