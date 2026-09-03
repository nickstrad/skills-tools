// Runs a course's lessons against a real lab by driving one REPL process per session.
//
// Usage:
//   deno run -A tools/validate.ts <course> [--from N] [--to N] [--timeout MS] [slug|ordinal ...]
//
// The course's course.json must declare a "repl" block, e.g. for PostgreSQL:
//   "repl": {
//     "command": ["psql", "-X", "-q", "-v", "ON_ERROR_STOP=0", "-P", "pager=off"],
//     "echo": "\\echo {marker}",   // how the REPL prints a literal marker line
//     "quit": "\\q",
//     "env": { "PGHOST": "/tmp", "PGPORT": "5440", "PGUSER": "postgres", "PGDATABASE": "lab" }
//   }
// Environment variables already set in the shell override repl.env, so one lab can be pointed
// at another port or database (for example PGDATABASE=lab_storage) without editing the course.
//
// Lesson code is split into steps on lines that start with "-- Session X" (X = A..D); a header
// containing "(blocks" is sent without waiting for it to finish, which is how a lesson expresses
// "this statement waits until another session acts". Steps run in order, each in its session's
// REPL. `setup` runs first in Session A. All REPL output is echoed with a [X] prefix so a human
// or agent can compare it with `expectedResult`. Shell lessons (runIn = "shell") are listed but
// skipped: run those by hand.
import { resolve } from "node:path";
import type { Course, Lesson } from "../src/types.ts";

type Repl = { command: string[]; echo: string; quit: string; env?: Record<string, string> };

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
    "usage: deno run -A tools/validate.ts <course> [--from N] [--to N] [slug|ordinal ...]",
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
const repl = course.repl;
const env: Record<string, string> = { ...(repl.env ?? {}) };
for (const [k, v] of Object.entries(Deno.env.toObject())) env[k] = v;

const lessons = JSON.parse(await Deno.readTextFile(resolve(courseDir, "lessons.json"))) as Lesson[];
const selected = lessons.filter((l) =>
  l.ordinal >= from && l.ordinal <= to &&
  (args.length === 0 || args.includes(l.slug) || args.includes(String(l.ordinal)))
);

class Session {
  proc: Deno.ChildProcess;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  buffer = "";
  waiters: { marker: string; resolve: () => void }[] = [];
  constructor(public name: string, public log: (s: string) => void) {
    this.proc = new Deno.Command(repl.command[0], {
      args: repl.command.slice(1),
      env,
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    this.writer = this.proc.stdin.getWriter();
    this.pump(this.proc.stdout);
    this.pump(this.proc.stderr);
  }
  async pump(stream: ReadableStream<Uint8Array>) {
    const dec = new TextDecoder();
    for await (const chunk of stream) {
      const text = dec.decode(chunk);
      this.buffer += text;
      const lines = text.split("\n").filter((l) => l.length && !l.includes("__STEP_"));
      if (lines.length) this.log(lines.map((l) => `  [${this.name}] ${l}`).join("\n"));
      for (const w of [...this.waiters]) {
        if (this.buffer.includes(w.marker)) {
          this.waiters.splice(this.waiters.indexOf(w), 1);
          w.resolve();
        }
      }
    }
  }
  async send(text: string, wait: boolean, step: number): Promise<boolean> {
    const marker = `__STEP_${step}_DONE__`;
    const done = new Promise<void>((resolve) => this.waiters.push({ marker, resolve }));
    const echo = repl.echo.replace("{marker}", marker);
    await this.writer.write(new TextEncoder().encode(`${text}\n${echo}\n`));
    if (!wait) return true;
    const timer = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
    return await Promise.race([done.then(() => true), timer]);
  }
  async close() {
    try {
      await this.writer.write(new TextEncoder().encode(`${repl.quit}\n`));
      await this.writer.close();
    } catch { /* already closed */ }
    const killer = setTimeout(() => {
      try {
        this.proc.kill("SIGKILL");
      } catch { /* exited */ }
    }, 2000);
    await this.proc.status;
    clearTimeout(killer);
  }
}

export function splitSteps(code: string): { session: string; blocks: boolean; text: string }[] {
  const steps: { session: string; blocks: boolean; text: string }[] = [];
  let current = { session: "A", blocks: false, text: "" };
  for (const line of code.split("\n")) {
    const m = line.match(/^(?:--|#|\/\/)\s*Session\s+([A-D])\b(.*)$/i);
    if (m) {
      if (current.text.trim()) steps.push(current);
      current = { session: m[1].toUpperCase(), blocks: /\(blocks/i.test(m[2]), text: "" };
      continue;
    }
    current.text += line + "\n";
  }
  if (current.text.trim()) steps.push(current);
  return steps;
}

let failures = 0;
for (const lesson of selected) {
  console.log(
    `\n=== #${lesson.ordinal} ${lesson.slug} [${lesson.runIn}, ${lesson.sessions} session(s)] ===`,
  );
  if (lesson.runIn === "shell") {
    console.log("  (shell lesson: run manually)");
    continue;
  }
  const sessions = new Map<string, Session>();
  const get = (name: string) => {
    if (!sessions.has(name)) sessions.set(name, new Session(name, (s) => console.log(s)));
    return sessions.get(name)!;
  };
  let step = 0;
  let ok = true;
  if (lesson.setup) {
    console.log("  -- setup --");
    ok = await get("A").send(lesson.setup, true, ++step);
  }
  for (const s of splitSteps(lesson.code)) {
    if (!ok) break;
    console.log(`  -- Session ${s.session}${s.blocks ? " (blocks)" : ""} --`);
    const done = await get(s.session).send(s.text, !s.blocks, ++step);
    if (!done) {
      console.log(`  !! step ${step} in session ${s.session} timed out after ${timeoutMs} ms`);
      ok = false;
    }
  }
  for (const s of sessions.values()) await s.close();
  if (!ok) failures++;
}
console.log(`\n${selected.length - failures}/${selected.length} lessons completed without timeout`);
if (failures) Deno.exit(1);
