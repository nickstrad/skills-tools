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
    io: {
      log: (x: string) => stdout.push(x),
      error: (x: string) => stderr.push(x),
    },
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
    const checkpointColumn = db.prepare(
      "SELECT name FROM pragma_table_info('lessons') WHERE name='study_checkpoint'",
    ).get();
    const migration = db.prepare(
      "SELECT name FROM schema_migrations WHERE version=5",
    ).get() as Record<string, string> | undefined;
    db.close();
    const expected = await lessonCount();
    if (row.count !== expected || row.first !== 1 || row.last !== expected) {
      throw new Error(JSON.stringify(row));
    }
    if (!checkpointColumn || migration?.name !== "lesson study checkpoint") {
      throw new Error("study checkpoint migration was not installed");
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("init migrates a pre-checkpoint database without changing old lesson data", async () => {
  const dir = await Deno.makeTempDir();
  const path = `${dir}/progress.sqlite`;
  try {
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE lessons (
        id INTEGER PRIMARY KEY,
        ordinal INTEGER NOT NULL UNIQUE,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT ',',
        reading TEXT NOT NULL DEFAULT '',
        reading_notes TEXT NOT NULL DEFAULT '',
        overview TEXT NOT NULL,
        syntax_breakdown TEXT NOT NULL,
        setup TEXT NOT NULL DEFAULT '',
        code TEXT NOT NULL,
        expected_result TEXT NOT NULL,
        systems_lens TEXT NOT NULL,
        challenge TEXT NOT NULL DEFAULT '',
        caution TEXT NOT NULL DEFAULT '',
        safety_level TEXT NOT NULL,
        run_in TEXT NOT NULL,
        sessions INTEGER NOT NULL DEFAULT 1,
        min_version TEXT NOT NULL,
        estimated_minutes INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO lessons(
        id, ordinal, slug, title, category, difficulty, overview, syntax_breakdown,
        code, expected_result, systems_lens, safety_level, run_in, min_version,
        estimated_minutes
      ) VALUES(900, 900, 'old-lesson', 'Old lesson', 'old', 'beginner',
        'old overview', 'old syntax', 'old code', 'old result', 'old lens',
        'read-only', 'tool', '1', 1);
    `);
    db.close();
    const out = capture();
    if (await run([COURSE, "init", "--db", path], out.io) !== 0) {
      throw new Error(out.stderr.join("\n"));
    }
    const migrated = new DatabaseSync(path);
    const column = migrated.prepare(
      "SELECT name FROM pragma_table_info('lessons') WHERE name='study_checkpoint'",
    ).get();
    const old = migrated.prepare(
      "SELECT title, study_checkpoint FROM lessons WHERE id=900",
    ).get() as Record<string, string>;
    migrated.close();
    if (!column || old.title !== "Old lesson" || old.study_checkpoint !== "") {
      throw new Error(JSON.stringify({ column, old }));
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("re-seeding preserves progress and checkpoint metadata", async () => {
  const { dir, path } = await initTemp();
  try {
    await run(
      [COURSE, "done", "11", "--note", "completed the experiment", "--db", path],
      capture().io,
    );
    await run([COURSE, "init", "--db", path], capture().io);
    const shown = capture();
    await run([COURSE, "show", "11", "--json", "--db", path], shown.io);
    const lesson = JSON.parse(shown.stdout[0]);
    if (
      lesson.status !== "done" || lesson.notes !== "completed the experiment" ||
      !lesson.studyCheckpoint || lesson.studyCheckpoint.core.length === 0
    ) {
      throw new Error(shown.stdout[0]);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("show, done, next, undone, skip, and status preserve explicit progress", async () => {
  const { dir, path } = await initTemp();
  try {
    const shown = capture();
    if (
      await run([COURSE, "show", "2", "--db", path, "--json"], shown.io) !== 0
    ) {
      throw new Error(shown.stderr[0]);
    }
    const lesson = JSON.parse(shown.stdout[0]);
    if (
      lesson.ordinal !== 2 || !lesson.overview || !lesson.syntaxBreakdown ||
      !lesson.code || "studyCheckpoint" in lesson
    ) {
      throw new Error(shown.stdout[0]);
    }

    await run(
      [COURSE, "done", "1", "--db", path, "--note", "ran it"],
      capture().io,
    );
    const next = capture();
    await run([COURSE, "next", "--db", path, "--json"], next.io);
    if (JSON.parse(next.stdout[0]).ordinal !== 2) {
      throw new Error(next.stdout[0]);
    }

    await run([COURSE, "skip", "2", "--db", path], capture().io);
    const afterSkip = capture();
    await run([COURSE, "next", "--db", path, "--json"], afterSkip.io);
    if (JSON.parse(afterSkip.stdout[0]).ordinal !== 3) {
      throw new Error(afterSkip.stdout[0]);
    }

    await run([COURSE, "undone", "1", "--db", path], capture().io);
    const again = capture();
    await run([COURSE, "next", "--db", path, "--json"], again.io);
    if (JSON.parse(again.stdout[0]).ordinal !== 1) {
      throw new Error(again.stdout[0]);
    }
    const one = capture();
    await run([COURSE, "show", "1", "--db", path, "--json"], one.io);
    if (JSON.parse(one.stdout[0]).notes !== "ran it") {
      throw new Error("note lost by undone");
    }

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
    if (
      !text.includes("\n## Syntax breakdown\n") ||
      !text.includes("\nLesson ID: 3\n")
    ) {
      throw new Error(text);
    }
    if (
      !text.includes("\n## Run\n```") ||
      !text.includes("\n## Expected result\n")
    ) {
      throw new Error(text);
    }
    if (text.includes("\x1b[")) {
      throw new Error("plain output must not carry ANSI codes");
    }

    await run([COURSE, "done", "1", "--db", path], capture().io);
    const next = capture();
    await run([COURSE, "pretty", "--db", path], next.io);
    if (!next.stdout[0].includes("\nLesson ID: 2\n")) {
      throw new Error(next.stdout[0]);
    }
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
    if (lesson.ordinal !== 1 || lesson.status !== "stale") {
      throw new Error(next.stdout[0]);
    }
    const status = capture();
    await run([COURSE, "status", "--db", path, "--json"], status.io);
    if (JSON.parse(status.stdout[0]).stale !== 1) {
      throw new Error(status.stdout[0]);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("search requires every term, list filters by category, modules summarizes", async () => {
  const { dir, path } = await initTemp();
  try {
    const search = capture();
    await run([COURSE, "search", "lab cluster", "--db", path], search.io);
    if (!search.stdout[0].includes("  1  [lab-setup]")) {
      throw new Error(search.stdout[0]);
    }
    const none = capture();
    await run([COURSE, "search", "zzzz-no-such-term", "--db", path], none.io);
    if (none.stdout[0] !== "No lessons found.") throw new Error(none.stdout[0]);
    const list = capture();
    await run(
      [COURSE, "list", "--category", "lab-setup", "--db", path],
      list.io,
    );
    if (!list.stdout[0].split("\n").every((l) => l.includes("[lab-setup]"))) {
      throw new Error(list.stdout[0]);
    }
    const modules = capture();
    await run([COURSE, "modules", "--db", path], modules.io);
    if (!modules.stdout[0].startsWith("  1-")) {
      throw new Error(modules.stdout[0]);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("topics lists tags and --topic serves the next unfinished matching lesson", async () => {
  const { dir, path } = await initTemp();
  try {
    const topics = capture();
    await run([COURSE, "topics", "--db", path], topics.io);
    if (
      !topics.stdout[0].split("\n").some((l) => l.startsWith("process-model"))
    ) {
      throw new Error(topics.stdout[0]);
    }
    const first = capture();
    await run([
      COURSE,
      "next",
      "--topic",
      "process model",
      "--db",
      path,
      "--json",
    ], first.io);
    const lesson = JSON.parse(first.stdout[0]);
    if (!lesson.tags.includes("process-model")) {
      throw new Error(first.stdout[0]);
    }
    await run(
      [COURSE, "done", String(lesson.ordinal), "--db", path],
      capture().io,
    );
    const second = capture();
    await run([
      COURSE,
      "next",
      "--topic",
      "process-model",
      "--db",
      path,
      "--json",
    ], second.io);
    const after = JSON.parse(second.stdout[0]);
    if (after.ordinal === lesson.ordinal && !after.complete) {
      throw new Error(second.stdout[0]);
    }
    const none = capture();
    await run(
      [COURSE, "pretty", "--topic", "zzzz-no-such-topic", "--db", path],
      none.io,
    );
    if (!none.stdout[0].startsWith("No lessons match topic")) {
      throw new Error(none.stdout[0]);
    }
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
    if (await run([COURSE, "list", "--bogus", "--db", path], bad.io) !== 2) {
      throw new Error("code");
    }
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
    if (await run([COURSE, "next", "--db", path], uninit.io) !== 1) {
      throw new Error("uninit");
    }
    if (!uninit.stderr[0].includes("not initialized")) {
      throw new Error(uninit.stderr[0]);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("ANSI and plain output flags are mutually exclusive", async () => {
  const out = capture();
  if (await run([COURSE, "pretty", "1", "--ansi", "--plain"], out.io) !== 2) {
    throw new Error("conflicting styling flags were accepted");
  }
  if (!out.stderr[0].includes("--ansi and --plain cannot be used together")) {
    throw new Error(out.stderr[0]);
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
    lessons: [{ ...draft, slug: "a" }, {
      ...draft,
      slug: "b",
      prerequisites: ["a"],
    }],
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
      lessons: [{ ...draft, slug: "a", prerequisites: ["b"] }, {
        ...draft,
        slug: "b",
      }],
    }]);
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("forward prerequisite accepted");
});

Deno.test("build keeps an optional reading line and pretty prints it before the overview", () => {
  const course: Course = {
    id: "x",
    name: "X",
    description: "",
    tool: "x",
    minVersion: "1",
    revision: 1,
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
    lessons: [
      {
        ...draft,
        slug: "a",
        reading: "\nBook, Chapter 1  ",
        readingNotes: "n",
      },
      { ...draft, slug: "b" },
    ],
  }];
  const lessons = buildLessons(course, modules);
  if (
    lessons[0].reading !== "Book, Chapter 1" ||
    lessons[0].readingNotes !== "n" ||
    "reading" in lessons[1] || "readingNotes" in lessons[1]
  ) {
    throw new Error(JSON.stringify(lessons));
  }
});

Deno.test("build rejects malformed reading metadata", () => {
  const course: Course = {
    id: "x",
    name: "X",
    description: "",
    tool: "x",
    minVersion: "1",
    revision: 1,
  };
  const draft = {
    slug: "a",
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
  for (
    const metadata of [
      { reading: "Book, Chapter 1\nsection 2" },
      { readingNotes: "Notes without a citation" },
    ]
  ) {
    let threw = false;
    try {
      buildLessons(course, [{
        category: "c",
        title: "m",
        lessons: [{ ...draft, ...metadata }],
      }]);
    } catch {
      threw = true;
    }
    if (!threw) {
      throw new Error(
        `accepted malformed metadata: ${JSON.stringify(metadata)}`,
      );
    }
  }
});

Deno.test("build trims and validates a study checkpoint", () => {
  const course: Course = {
    id: "x",
    name: "X",
    description: "",
    tool: "x",
    minVersion: "1",
    revision: 1,
  };
  const draft = {
    slug: "a",
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
    studyCheckpoint: {
      core: [{ source: "  Book  ", locator: "  Section 1  " }],
      optionalDepth: [{ source: "Paper", locator: "  2:00–4:00  " }],
      rationale: "  Connect the evidence to the model.  ",
    },
  };
  const lessons = buildLessons(course, [{
    category: "c",
    title: "m",
    lessons: [draft],
  }]);
  if (
    lessons[0].studyCheckpoint?.core[0].source !== "Book" ||
    lessons[0].studyCheckpoint.core[0].locator !== "Section 1" ||
    lessons[0].studyCheckpoint.optionalDepth?.[0].locator !== "2:00–4:00" ||
    lessons[0].studyCheckpoint.rationale !== "Connect the evidence to the model."
  ) {
    throw new Error(JSON.stringify(lessons[0].studyCheckpoint));
  }

  const malformed = [
    { core: [], rationale: "why" },
    { core: [{ source: "Book\n", locator: "Section 1" }], rationale: "why" },
    { core: [{ source: "Book", locator: "" }], rationale: "why" },
    { core: [{ source: "Book", locator: "Section 1" }], rationale: "  " },
  ];
  for (const studyCheckpoint of malformed) {
    let threw = false;
    try {
      buildLessons(course, [{
        category: "c",
        title: "m",
        lessons: [{ ...draft, studyCheckpoint }],
      }]);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error(`accepted ${JSON.stringify(studyCheckpoint)}`);
  }
});

Deno.test("pretty prints an optional reference between Meta and Overview when a lesson has one", async () => {
  const { dir, path } = await initTemp();
  try {
    const db = new DatabaseSync(path);
    db.prepare(
      "UPDATE lessons SET reading = ?, reading_notes = ? WHERE ordinal = 1",
    )
      .run("Book, Chapter 9", "overlap text");
    db.close();
    const out = capture();
    if (await run([COURSE, "pretty", "1", "--db", path], out.io) !== 0) {
      throw new Error(out.stderr[0]);
    }
    const text = out.stdout[0];
    const meta = text.indexOf("\n**Meta:** ");
    const reading = text.indexOf(
      "\n**Optional reference:** Book, Chapter 9  \n",
    );
    const overview = text.indexOf("\n## Overview\n");
    const notes = text.indexOf(
      "\n## Optional reference context\n",
    );
    const breakdown = text.indexOf("\n## Syntax breakdown\n");
    if (
      !(meta > 0 && reading > meta && overview > reading && notes > overview)
    ) {
      throw new Error(text);
    }
    if (breakdown < notes) throw new Error(text);
    if (
      !text.includes(
        "only a Study checkpoint at the end asks you to pause before the next lesson.\n\noverlap text",
      )
    ) {
      throw new Error(text);
    }
    const styled = capture();
    await run([COURSE, "pretty", "1", "--db", path, "--ansi"], styled.io);
    if (!styled.stdout[0].includes("\x1b[1;33mSyntax breakdown\x1b[0m")) {
      throw new Error(styled.stdout[0]);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("pretty prints a study checkpoint after Challenge and before Your note", async () => {
  const { dir, path } = await initTemp();
  try {
    const db = new DatabaseSync(path);
    db.prepare(
      "UPDATE lessons SET challenge = ?, study_checkpoint = ? WHERE ordinal = 1",
    ).run(
      "try the same observation with another value",
      JSON.stringify({
        core: [{ source: "Book", locator: "Section 2" }],
        optionalDepth: [{ source: "Paper", locator: "Figure 1" }],
        rationale: "The experiment made the ordering visible.",
      }),
    );
    db.close();
    await run([COURSE, "note", "1", "remember the ordering", "--db", path], capture().io);
    const json = capture();
    await run([COURSE, "show", "1", "--db", path, "--json"], json.io);
    const parsed = JSON.parse(json.stdout[0]);
    if (
      parsed.studyCheckpoint.core[0].locator !== "Section 2" ||
      parsed.studyCheckpoint.optionalDepth[0].source !== "Paper"
    ) {
      throw new Error(json.stdout[0]);
    }
    const out = capture();
    if (await run([COURSE, "pretty", "1", "--db", path, "--plain"], out.io) !== 0) {
      throw new Error(out.stderr[0]);
    }
    const text = out.stdout[0];
    const challenge = text.indexOf("\n## Challenge\n");
    const checkpoint = text.indexOf(
      "\n## Study checkpoint — stop before the next lesson\n",
    );
    const note = text.indexOf("\n## Your note\n");
    if (!(challenge >= 0 && challenge < checkpoint && checkpoint < note)) {
      throw new Error(text);
    }
    if (
      !text.includes("\n### Core\n- Book — Section 2") ||
      !text.includes("\n### Optional depth\nRead these only if you want to go deeper.") ||
      !text.includes("\n### Why here\nThe experiment made the ordering visible.")
    ) {
      throw new Error(text);
    }
    const corrupted = new DatabaseSync(path);
    corrupted.prepare(
      "UPDATE lessons SET study_checkpoint = ? WHERE ordinal = 1",
    ).run("not-json");
    corrupted.close();
    const bad = capture();
    if (await run([COURSE, "show", "1", "--db", path, "--json"], bad.io) !== 1) {
      throw new Error("corrupt checkpoint was accepted");
    }
    if (!bad.stderr[0].includes("invalid stored study checkpoint: malformed JSON")) {
      throw new Error(bad.stderr[0]);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
