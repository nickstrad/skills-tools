import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { run, TOOL_ROOT } from "../src/main.ts";
import { buildLessons, type Course, type Module } from "../src/types.ts";

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: { log: (x: string) => stdout.push(x), error: (x: string) => stderr.push(x) },
  };
}

const COURSE = "postgres";

async function initTemp(): Promise<{ dir: string; path: string }> {
  const dir = await Deno.makeTempDir();
  const path = `${dir}/progress.sqlite`;
  const out = capture();
  if (await run([COURSE, "init", "--db", path], out.io) !== 0) {
    throw new Error(out.stderr.join("\n"));
  }
  return { dir, path };
}

async function lessonCount(): Promise<number> {
  const file = resolve(TOOL_ROOT, "courses", COURSE, "lessons.json");
  return (JSON.parse(await Deno.readTextFile(file)) as unknown[]).length;
}

Deno.test("init seeds every lesson and is idempotent", async () => {
  const { dir, path } = await initTemp();
  try {
    const second = capture();
    if (await run([COURSE, "init", "--db", path], second.io) !== 0) {
      throw new Error(second.stderr.join("\n"));
    }
    const db = new DatabaseSync(path);
    const row = db.prepare(
      "SELECT count(*) AS count, min(ordinal) AS first, max(ordinal) AS last FROM lessons WHERE active=1",
    ).get() as Record<string, number>;
    db.close();
    const expected = await lessonCount();
    if (row.count !== expected || row.first !== 1 || row.last !== expected) {
      throw new Error(JSON.stringify(row));
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("show, done, next, undone, skip, and status preserve explicit progress", async () => {
  const { dir, path } = await initTemp();
  try {
    const shown = capture();
    if (await run([COURSE, "show", "2", "--db", path, "--json"], shown.io) !== 0) {
      throw new Error(shown.stderr[0]);
    }
    const lesson = JSON.parse(shown.stdout[0]);
    if (lesson.ordinal !== 2 || !lesson.overview || !lesson.syntaxBreakdown || !lesson.code) {
      throw new Error(shown.stdout[0]);
    }

    await run([COURSE, "done", "1", "--db", path, "--note", "ran it"], capture().io);
    const next = capture();
    await run([COURSE, "next", "--db", path, "--json"], next.io);
    if (JSON.parse(next.stdout[0]).ordinal !== 2) throw new Error(next.stdout[0]);

    await run([COURSE, "skip", "2", "--db", path], capture().io);
    const afterSkip = capture();
    await run([COURSE, "next", "--db", path, "--json"], afterSkip.io);
    if (JSON.parse(afterSkip.stdout[0]).ordinal !== 3) throw new Error(afterSkip.stdout[0]);

    await run([COURSE, "undone", "1", "--db", path], capture().io);
    const again = capture();
    await run([COURSE, "next", "--db", path, "--json"], again.io);
    if (JSON.parse(again.stdout[0]).ordinal !== 1) throw new Error(again.stdout[0]);
    const one = capture();
    await run([COURSE, "show", "1", "--db", path, "--json"], one.io);
    if (JSON.parse(one.stdout[0]).notes !== "ran it") throw new Error("note lost by undone");

    const status = capture();
    await run([COURSE, "status", "--db", path, "--json"], status.io);
    const s = JSON.parse(status.stdout[0]);
    if (s.done !== 0 || s.skipped !== 1 || s.todo !== s.total - 1) {
      throw new Error(status.stdout[0]);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("pretty prints a deterministic lesson ID and the code block", async () => {
  const { dir, path } = await initTemp();
  try {
    const selected = capture();
    if (await run([COURSE, "pretty", "3", "--db", path], selected.io) !== 0) {
      throw new Error(selected.stderr[0]);
    }
    const text = selected.stdout[0];
    if (!text.includes("Syntax breakdown:") || !text.includes("\nLesson ID: 3\n")) {
      throw new Error(text);
    }
    if (!text.includes("\nRun:\n") || !text.includes("Expected result:")) throw new Error(text);

    await run([COURSE, "done", "1", "--db", path], capture().io);
    const next = capture();
    await run([COURSE, "pretty", "--db", path], next.io);
    if (!next.stdout[0].includes("\nLesson ID: 2\n")) throw new Error(next.stdout[0]);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("a revised lesson becomes stale and is served again", async () => {
  const { dir, path } = await initTemp();
  try {
    await run([COURSE, "done", "1", "--db", path], capture().io);
    const db = new DatabaseSync(path);
    db.exec("UPDATE lessons SET revision = revision + 1 WHERE ordinal = 1");
    db.close();
    const next = capture();
    await run([COURSE, "next", "--db", path, "--json"], next.io);
    const lesson = JSON.parse(next.stdout[0]);
    if (lesson.ordinal !== 1 || lesson.status !== "stale") throw new Error(next.stdout[0]);
    const status = capture();
    await run([COURSE, "status", "--db", path, "--json"], status.io);
    if (JSON.parse(status.stdout[0]).stale !== 1) throw new Error(status.stdout[0]);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("search requires every term, list filters by category, modules summarizes", async () => {
  const { dir, path } = await initTemp();
  try {
    const search = capture();
    await run([COURSE, "search", "lab cluster", "--db", path], search.io);
    if (!search.stdout[0].includes("  1  [lab-setup]")) throw new Error(search.stdout[0]);
    const none = capture();
    await run([COURSE, "search", "zzzz-no-such-term", "--db", path], none.io);
    if (none.stdout[0] !== "No lessons found.") throw new Error(none.stdout[0]);
    const list = capture();
    await run([COURSE, "list", "--category", "lab-setup", "--db", path], list.io);
    if (!list.stdout[0].split("\n").every((l) => l.includes("[lab-setup]"))) {
      throw new Error(list.stdout[0]);
    }
    const modules = capture();
    await run([COURSE, "modules", "--db", path], modules.io);
    if (!modules.stdout[0].startsWith("  1-")) throw new Error(modules.stdout[0]);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("topics lists tags and --topic serves the next unfinished matching lesson", async () => {
  const { dir, path } = await initTemp();
  try {
    const topics = capture();
    await run([COURSE, "topics", "--db", path], topics.io);
    if (!topics.stdout[0].split("\n").some((l) => l.startsWith("process-model"))) {
      throw new Error(topics.stdout[0]);
    }
    const first = capture();
    await run([COURSE, "next", "--topic", "process model", "--db", path, "--json"], first.io);
    const lesson = JSON.parse(first.stdout[0]);
    if (!lesson.tags.includes("process-model")) throw new Error(first.stdout[0]);
    await run([COURSE, "done", String(lesson.ordinal), "--db", path], capture().io);
    const second = capture();
    await run([COURSE, "next", "--topic", "process-model", "--db", path, "--json"], second.io);
    const after = JSON.parse(second.stdout[0]);
    if (after.ordinal === lesson.ordinal && !after.complete) throw new Error(second.stdout[0]);
    const none = capture();
    await run([COURSE, "pretty", "--topic", "zzzz-no-such-topic", "--db", path], none.io);
    if (!none.stdout[0].startsWith("No lessons match topic")) throw new Error(none.stdout[0]);
    const list = capture();
    await run([COURSE, "list", "--topic", "lab", "--db", path], list.io);
    if (!list.stdout[0].split("\n").every((l) => l.includes("lab"))) {
      throw new Error(list.stdout[0]);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("invalid commands and options fail before creating a database", async () => {
  const dir = await Deno.makeTempDir();
  const path = `${dir}/never.sqlite`;
  try {
    const bad = capture();
    if (await run([COURSE, "list", "--bogus", "--db", path], bad.io) !== 2) throw new Error("code");
    const missing = capture();
    if (await run(["no-such-course", "next", "--db", path], missing.io) !== 2) {
      throw new Error("unknown course accepted");
    }
    try {
      await Deno.stat(path);
      throw new Error("database was created");
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    const uninit = capture();
    if (await run([COURSE, "next", "--db", path], uninit.io) !== 1) throw new Error("uninit");
    if (!uninit.stderr[0].includes("not initialized")) throw new Error(uninit.stderr[0]);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("courses lists every course directory", async () => {
  const out = capture();
  await run(["courses"], out.io);
  if (!out.stdout[0].includes("postgres")) throw new Error(out.stdout[0]);
});

Deno.test("buildLessons resolves slug prerequisites and rejects forward references", () => {
  const course: Course = {
    id: "x",
    name: "X",
    description: "",
    tool: "x",
    minVersion: "1",
    revision: 3,
  };
  const draft = {
    title: "t",
    difficulty: "beginner" as const,
    overview: "o",
    syntaxBreakdown: "s",
    code: "c",
    expectedResult: "e",
    systemsLens: "l",
    safetyLevel: "read-only" as const,
    runIn: "tool" as const,
    estimatedMinutes: 1,
  };
  const modules: Module[] = [{
    category: "c",
    title: "m",
    lessons: [{ ...draft, slug: "a" }, { ...draft, slug: "b", prerequisites: ["a"] }],
  }];
  const lessons = buildLessons(course, modules);
  if (lessons[1].prerequisites[0] !== 1 || lessons[1].revision !== 3) {
    throw new Error(JSON.stringify(lessons));
  }
  let threw = false;
  try {
    buildLessons(course, [{
      category: "c",
      title: "m",
      lessons: [{ ...draft, slug: "a", prerequisites: ["b"] }, { ...draft, slug: "b" }],
    }]);
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("forward prerequisite accepted");
});
