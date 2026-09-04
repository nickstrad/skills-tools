// Never opens the real learner database. Refuses a live WAL and works on a byte copy.
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { run, TOOL_ROOT } from "../../../src/main.ts";
import type { Lesson } from "../../../src/types.ts";

const source = resolve(TOOL_ROOT, "courses/sqlite/progress.sqlite");
for (const suffix of ["-wal", "-journal"]) {
  try {
    if ((await Deno.stat(source + suffix)).size > 0) {
      throw new Error(`Close the learner's progress writer before copying: ${source + suffix}`);
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}
const original = await Deno.readFile(source);
const digest = async (bytes: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
const beforeHash = await digest(original);
const evidence = await Deno.makeTempDir({ prefix: "sqlite-progress-verification-" });
const copy = resolve(evidence, "copied-progress.sqlite");
await Deno.writeFile(copy, original);
const snapshot = () => {
  const db = new DatabaseSync(copy, { readOnly: true });
  try {
    return {
      lessons: db.prepare("SELECT id,slug,ordinal,active FROM lessons ORDER BY id").all(),
      progress: db.prepare("SELECT * FROM progress ORDER BY lesson_id").all(),
      attempts: db.prepare("SELECT * FROM attempts ORDER BY id").all(),
    };
  } finally {
    db.close();
  }
};
const old = snapshot();
const invoke = async (args: string[]) => {
  const lines: string[] = [];
  const errors: string[] = [];
  const status = await run(["sqlite", ...args, "--db", copy], {
    log: (line) => lines.push(line),
    error: (line) => errors.push(line),
  });
  if (status) throw new Error(errors.join("\n"));
  return lines.join("\n");
};
await invoke(["init"]);
await invoke(["init"]);
const current = snapshot();
for (const key of ["progress", "attempts"] as const) {
  if (JSON.stringify(old[key]) !== JSON.stringify(current[key])) {
    throw new Error(`${key} changed during copied refresh`);
  }
}
for (const lesson of old.lessons) {
  const preserved = current.lessons.find((item) => item.slug === lesson.slug);
  if (preserved?.id !== lesson.id) throw new Error(`Identity changed: ${lesson.slug}`);
}
const db = new DatabaseSync(copy, { readOnly: true });
const foreignKeyErrors = db.prepare("PRAGMA foreign_key_check").all();
db.close();
if (foreignKeyErrors.length) throw new Error("Foreign key violation in copied progress");

const lessons: Lesson[] = JSON.parse(
  await Deno.readTextFile(resolve(TOOL_ROOT, "courses/sqlite/lessons.json")),
);
const checkpoints: number[] = [];
for (const lesson of lessons) {
  const rendered = await invoke(["pretty", String(lesson.ordinal), "--plain"]);
  for (const heading of ["### In plain terms", "### What you are learning", "### Piece by piece"]) {
    if (!rendered.includes(heading)) throw new Error(`Missing ${heading}: ${lesson.slug}`);
  }
  if (!rendered.includes(lesson.code)) throw new Error(`Rendered code changed: ${lesson.slug}`);
  if (lesson.studyCheckpoint) {
    checkpoints.push(lesson.ordinal);
    const position = rendered.indexOf("## Study checkpoint");
    if (position < rendered.indexOf("## Challenge")) {
      throw new Error(`Checkpoint appears before the experiment challenge: ${lesson.slug}`);
    }
  }
  // Do not export the learner's private notes into the public evidence directory.
  await Deno.writeTextFile(
    resolve(evidence, `${lesson.ordinal}-${lesson.slug}.md`),
    rendered.split("## Your note")[0],
  );
}
if (JSON.stringify(checkpoints) !== JSON.stringify([13, 19, 25, 31, 37, 41])) {
  throw new Error(`Unexpected checkpoints: ${checkpoints}`);
}
const afterHash = await digest(await Deno.readFile(source));
if (beforeHash !== afterHash) throw new Error("Real progress changed during verification");
const report = {
  originalHashUnchanged: beforeHash,
  preservedIdentities: old.lessons.length,
  preservedProgressRows: old.progress.length,
  preservedAttempts: old.attempts.length,
  activeLessons: current.lessons.filter((item) => item.active === 1).length,
  retiredLessons: current.lessons.filter((item) => item.active === 0).length,
  renderedLessons: lessons.length,
  checkpoints,
};
await Deno.writeTextFile(resolve(evidence, "result.json"), JSON.stringify(report, null, 2));
console.log(`Copied progress/render evidence: ${evidence}`);
console.log(JSON.stringify(report));
