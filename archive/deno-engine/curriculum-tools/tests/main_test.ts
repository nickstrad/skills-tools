import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { listCourses, migrateSchema, run, TOOL_ROOT } from "../src/main.ts";
import { readLegacyArchive, restoreLegacyReading } from "../src/legacy_reading.ts";
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

Deno.test("every course shares numbered lesson/done with read-only display and pre-experiment diagrams", async () => {
  const dir = await Deno.makeTempDir({ prefix: "shared-lesson-flow-" });
  try {
    for (const course of await listCourses()) {
      const path = `${dir}/${course.id} learner's progress.sqlite`;
      if (await run([course.id, "init", "--db", path], capture().io)) {
        throw new Error(`could not initialize ${course.id}`);
      }
      const connection = new DatabaseSync(path);
      const diagram = "    reader --> snapshot --> retained pages";
      connection.prepare(
        "UPDATE lessons SET syntax_breakdown = syntax_breakdown || ? WHERE ordinal=1",
      )
        .run("\n\n### Visual model\n\n" + diagram);
      const first = connection.prepare("SELECT * FROM lessons WHERE ordinal=1").get()!;
      connection.close();
      const before = await Deno.readFile(path);
      const shown = capture();
      if (await run([course.id, "1", "lesson", "--db", path, "--plain"], shown.io)) {
        throw new Error(shown.stderr.join("\n"));
      }
      const text = shown.stdout.join("\n");
      const runAt = text.indexOf("\n## Run\n");
      const setupAt = text.indexOf("\n## Setup\n");
      if (text.indexOf(diagram) < 0 || text.indexOf(diagram) > (setupAt < 0 ? runAt : setupAt)) {
        throw new Error(`${course.id}: visual model did not precede the experiment`);
      }
      for (const field of ["code", "expected_result", "systems_lens"]) {
        if (!text.includes(String(first[field]))) throw new Error(`${course.id}: lost ${field}`);
      }
      if (
        !text.includes(`tutor ${course.id} 1 done --db '`) ||
        text.includes("stop before the next lesson")
      ) {
        throw new Error(`${course.id}: missing completion or unwanted reading gate`);
      }
      const after = await Deno.readFile(path);
      if (before.length !== after.length || before.some((byte, i) => byte !== after[i])) {
        throw new Error(`${course.id}: showing a lesson mutated progress`);
      }
      const next = capture();
      await run([course.id, "lesson", "--db", path], next.io);
      if (!next.stdout.join("\n").includes("Lesson ID: 1")) {
        throw new Error("display completed lesson");
      }
      if (await run([course.id, "1", "done", "--db", path], capture().io)) {
        throw new Error(`${course.id}: explicit completion failed`);
      }
      const completed = capture();
      await run([course.id, "show", "1", "--json", "--db", path], completed.io);
      if (JSON.parse(completed.stdout[0]).status !== "done") {
        throw new Error("completion not persisted");
      }
      for (
        const args of [["1", "review"], ["1", "done", "2"], ["1", "lesson", "--topic", "pages"]]
      ) {
        if (await run([course.id, ...args, "--db", path], capture().io) === 0) {
          throw new Error(`invalid numbered command accepted: ${args}`);
        }
      }
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

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
    const legacyColumns = db.prepare(
      "SELECT name FROM pragma_table_info('lessons') WHERE name IN ('reading','reading_notes','study_checkpoint')",
    ).all();
    const migration = db.prepare(
      "SELECT name FROM schema_migrations WHERE version=6",
    ).get() as Record<string, string> | undefined;
    db.close();
    const expected = await lessonCount();
    if (row.count !== expected || row.first !== 1 || row.last !== expected) {
      throw new Error(JSON.stringify(row));
    }
    if (legacyColumns.length || migration?.name !== "remove legacy reading metadata") {
      throw new Error("legacy reading schema was installed");
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("migrate archives legacy fields and preserves rows and learner history", async () => {
  const { dir, path } = await initTemp();
  try {
    const db = new DatabaseSync(path);
    db.exec("ALTER TABLE lessons ADD COLUMN reading TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE lessons ADD COLUMN reading_notes TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE lessons ADD COLUMN study_checkpoint TEXT NOT NULL DEFAULT ''");
    db.prepare(
      "UPDATE lessons SET reading=?,reading_notes=?,study_checkpoint=? WHERE ordinal=1",
    ).run("Book, Chapter 1", "private explanatory note", '{"raw":true}');
    db.prepare(
      "UPDATE lessons SET active=0,ordinal=1000,reading=?,reading_notes=?,study_checkpoint=? WHERE ordinal=2",
    ).run("Retired book", "Retired note", "retired raw");
    db.close();
    await run([COURSE, "done", "1", "--note", "learner history", "--db", path], capture().io);
    const before = new DatabaseSync(path);
    const old = before.prepare(
      "SELECT id,slug,ordinal,title,reading,reading_notes,study_checkpoint FROM lessons WHERE ordinal=1",
    ).get() as Record<string, unknown>;
    const ids = before.prepare("SELECT id,slug,ordinal FROM lessons ORDER BY id").all();
    const progress = before.prepare("SELECT * FROM progress ORDER BY lesson_id").all();
    const attempts = before.prepare("SELECT * FROM attempts ORDER BY id").all();
    before.close();
    const archiveRoot = `${dir}/archive`;
    const out = capture();
    if (await run([COURSE, "migrate", "--db", path, "--archive", archiveRoot], out.io) !== 0) {
      throw new Error(out.stderr.join("\n"));
    }
    const migrated = new DatabaseSync(path);
    const columns = migrated.prepare(
      "SELECT name FROM pragma_table_info('lessons') WHERE name IN ('reading','reading_notes','study_checkpoint')",
    ).all();
    const current = migrated.prepare("SELECT id,slug,ordinal FROM lessons ORDER BY id").all();
    const currentProgress = migrated.prepare("SELECT * FROM progress ORDER BY lesson_id").all();
    const currentAttempts = migrated.prepare("SELECT * FROM attempts ORDER BY id").all();
    migrated.close();
    const archiveFile = [...Deno.readDirSync(`${archiveRoot}/databases/postgres`)].find((x) =>
      x.name.endsWith(".json")
    );
    if (!archiveFile) throw new Error("legacy archive was not written");
    const archived = readLegacyArchive(`${archiveRoot}/databases/postgres/${archiveFile.name}`);
    const lesson = archived.lessons[old.slug as string];
    const retired = ids.find((row) =>
      Number((row as Record<string, unknown>).ordinal) === 1000
    ) as Record<string, unknown>;
    if (
      columns.length || JSON.stringify(ids) !== JSON.stringify(current) ||
      JSON.stringify(progress) !== JSON.stringify(currentProgress) ||
      JSON.stringify(attempts) !== JSON.stringify(currentAttempts) ||
      lesson?.reading !== old.reading || lesson?.reading_notes !== old.reading_notes ||
      lesson?.study_checkpoint !== old.study_checkpoint ||
      Object.keys(archived.lessons).length !== ids.length ||
      !retired || archived.lessons[retired.slug as string]?.reading !== "Retired book" ||
      !out.stdout[0].includes("dropped")
    ) {
      throw new Error(
        JSON.stringify({
          columns,
          ids,
          current,
          progress,
          currentProgress,
          attempts,
          currentAttempts,
          lesson,
          old,
        }),
      );
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("re-seeding preserves progress after legacy fields are removed", async () => {
  const { dir, path } = await initTemp();
  try {
    const db = new DatabaseSync(path);
    const ordinal = "1";
    db.close();
    await run(
      [COURSE, "done", ordinal, "--note", "completed the experiment", "--db", path],
      capture().io,
    );
    await run([COURSE, "init", "--db", path], capture().io);
    const shown = capture();
    await run([COURSE, "show", ordinal, "--json", "--db", path], shown.io);
    const lesson = JSON.parse(shown.stdout[0]);
    if (
      lesson.status !== "done" || lesson.notes !== "completed the experiment" ||
      "studyCheckpoint" in lesson || "reading" in lesson || "readingNotes" in lesson
    ) {
      throw new Error(shown.stdout[0]);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("re-seeding follows lesson identity across reorder, removal and reinsertion", async () => {
  const { dir, path } = await initTemp();
  try {
    const db = new DatabaseSync(path);
    const first = db.prepare("SELECT id,slug FROM lessons WHERE ordinal=1").get() as {
      id: number;
      slug: string;
    };
    const second = db.prepare("SELECT id,slug FROM lessons WHERE ordinal=2").get() as {
      id: number;
      slug: string;
    };
    // Model the previous curriculum: these identities occupied the opposite positions.
    db.prepare("UPDATE lessons SET slug='temporary-swap' WHERE id=?").run(first.id);
    db.prepare("UPDATE lessons SET slug=? WHERE id=?").run(first.slug, second.id);
    db.prepare("UPDATE lessons SET slug=? WHERE id=?").run(second.slug, first.id);
    db.close();
    await run(
      [COURSE, "done", "1", "--note", "belongs to second slug", "--db", path],
      capture().io,
    );
    await run([COURSE, "skip", "2", "--note", "belongs to first slug", "--db", path], capture().io);
    const refresh = capture();
    if (await run([COURSE, "init", "--db", path], refresh.io)) {
      throw new Error(refresh.stderr.join("\n"));
    }
    const moved = capture();
    await run([COURSE, "show", "2", "--json", "--db", path], moved.io);
    const row = JSON.parse(moved.stdout[0]);
    if (
      row.slug !== second.slug || row.status !== "done" || row.notes !== "belongs to second slug"
    ) {
      throw new Error(`progress followed ordinal instead of slug: ${moved.stdout[0]}`);
    }
    const preserved = new DatabaseSync(path);
    const attempts = preserved.prepare(
      "SELECT count(*) n FROM attempts a JOIN lessons l ON l.id=a.lesson_id WHERE l.slug=?",
    ).get(second.slug) as { n: number };
    if (attempts.n !== 1) throw new Error("attempt history did not follow identity");
    // Removing an old identity and inserting its replacement must not transfer its completion.
    preserved.prepare("UPDATE lessons SET slug='removed-fixture' WHERE slug=?").run(second.slug);
    preserved.close();
    if (await run([COURSE, "init", "--db", path], capture().io)) throw new Error("refresh failed");
    const replacement = capture();
    await run([COURSE, "show", "2", "--json", "--db", path], replacement.io);
    if (JSON.parse(replacement.stdout[0]).status !== "todo") {
      throw new Error("new lesson inherited progress");
    }
    const retired = new DatabaseSync(path);
    const history = retired.prepare(
      "SELECT l.active,p.notes FROM lessons l JOIN progress p ON p.lesson_id=l.id WHERE l.slug='removed-fixture'",
    ).get() as { active: number; notes: string };
    if (history.active !== 0 || history.notes !== "belongs to second slug") {
      throw new Error("retired history lost");
    }
    const freshId = retired.prepare("SELECT id FROM lessons WHERE slug=?").get(second.slug) as {
      id: number;
    };
    retired.prepare("UPDATE lessons SET slug='replacement-fixture' WHERE id=?").run(freshId.id);
    retired.prepare("UPDATE lessons SET slug=? WHERE slug='removed-fixture'").run(second.slug);
    retired.close();
    for (let i = 0; i < 3; i++) {
      if (await run([COURSE, "init", "--db", path], capture().io)) {
        throw new Error("reintroduction failed");
      }
    }
    const restored = capture();
    await run([COURSE, "show", "2", "--json", "--db", path], restored.io);
    if (JSON.parse(restored.stdout[0]).status !== "done") {
      throw new Error("reintroduced identity lost completion");
    }
    const checked = new DatabaseSync(path);
    if (checked.prepare("PRAGMA foreign_key_check").all().length) {
      throw new Error("broken prerequisites");
    }
    const firstNow = checked.prepare(
      "SELECT p.status,p.notes FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.slug=?",
    ).get(first.slug) as { status: string; notes: string };
    if (firstNow.status !== "skipped" || firstNow.notes !== "belongs to first slug") {
      throw new Error("skip moved to wrong lesson");
    }
    checked.close();
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

Deno.test("courses discovers current, reference and plan-only routes without creating progress", async () => {
  const out = capture();
  const dir = await Deno.makeTempDir({ prefix: "course-discovery-" });
  try {
    if (await run(["courses", "--json", "--db", `${dir}/absent.sqlite`], out.io)) {
      throw new Error(out.stderr.join("\n"));
    }
    const rows = JSON.parse(out.stdout[0]);
    for (const course of await listCourses()) {
      const row = rows.find((x: { id: string }) => x.id === course.id);
      if (!row?.implemented || row.available < 1) throw new Error(`missing ${course.id}`);
      if (row.status !== (course.status ?? "current")) throw new Error(`wrong status ${course.id}`);
    }
    for (const id of ["sqlite-essentials", "linux-v2"]) {
      const row = rows.find((x: { id: string }) => x.id === id);
      if (!row || row.implemented || row.available !== 0 || row.status !== "proposed") {
        throw new Error(`plan-only course advertised as runnable: ${id}`);
      }
    }
    const essentials = rows.find((x: { id: string }) => x.id === "postgres-essentials");
    if (essentials.available !== 26 || essentials.total !== 40) {
      throw new Error("Essentials discovery disagrees with authored and planned counts");
    }
    const files = Array.from(Deno.readDirSync(dir));
    if (files.length) throw new Error("discovery created state");
    const text = capture();
    await run(["courses"], text.io);
    if (!text.stdout[0].includes("tutor linux-v2 route")) {
      throw new Error("missing planned route command");
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
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

Deno.test("build emits only active lesson fields", () => {
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
    lessons: [{ ...draft, slug: "a" }, { ...draft, slug: "b" }],
  }];
  const lessons = buildLessons(course, modules);
  if (
    Object.keys(lessons[0]).some((key) =>
      ["reading", "readingNotes", "studyCheckpoint"].includes(key)
    )
  ) {
    throw new Error(JSON.stringify(lessons));
  }
});

Deno.test("build rejects no retired metadata because Draft has no retired fields", () => {
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
  const lessons = buildLessons(course, [{ category: "c", title: "m", lessons: [draft] }]);
  if (
    Object.keys(lessons[0]).some((key) =>
      ["reading", "readingNotes", "studyCheckpoint"].includes(key)
    )
  ) {
    throw new Error(JSON.stringify(lessons[0]));
  }
});

Deno.test("lesson output omits retired citations and preserves complete experiment context", async () => {
  const { dir, path } = await initTemp();
  try {
    const out = capture();
    if (await run([COURSE, "pretty", "1", "--db", path], out.io) !== 0) {
      throw new Error(out.stderr[0]);
    }
    const text = out.stdout[0];
    if (text.includes("Optional reading") || text.includes("Study checkpoint")) {
      throw new Error("retired reading stage leaked into lesson");
    }
    for (
      const section of ["Overview", "Syntax breakdown", "Run", "Expected result", "Systems lens"]
    ) {
      if (!text.includes(`## ${section}`)) throw new Error(`missing ${section}`);
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

Deno.test("restoration is explicit and restores archived values by stable identity", async () => {
  const { dir, path } = await initTemp();
  try {
    const db = new DatabaseSync(path);
    db.exec("ALTER TABLE lessons ADD COLUMN reading TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE lessons ADD COLUMN reading_notes TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE lessons ADD COLUMN study_checkpoint TEXT NOT NULL DEFAULT ''");
    db.prepare("UPDATE lessons SET reading=?,reading_notes=?,study_checkpoint=? WHERE ordinal=1")
      .run("Book", "Notes", "Raw JSON");
    const before = db.prepare("SELECT id,slug FROM lessons WHERE ordinal=1").get() as Record<
      string,
      unknown
    >;
    db.close();
    const migrated = new DatabaseSync(path);
    const archiveRoot = `${dir}/archive`;
    const result = migrateSchema(migrated, COURSE, path, archiveRoot);
    migrated.close();
    const archiveFile = [...Deno.readDirSync(`${archiveRoot}/databases/postgres`)].find((x) =>
      x.name.endsWith(".json")
    );
    if (!archiveFile || !result.archive) throw new Error("archive missing");
    const archive = readLegacyArchive(`${archiveRoot}/databases/postgres/${archiveFile.name}`);
    const broken = {
      ...archive,
      lessons: {
        ...archive.lessons,
        "missing-lesson": {
          id: 999999,
          ordinal: 999999,
          slug: "missing-lesson",
          reading: "missing",
          reading_notes: "missing",
          study_checkpoint: "missing",
        },
      },
    };
    const failedRestore = new DatabaseSync(path);
    let restoreFailed = false;
    try {
      restoreLegacyReading(failedRestore, broken);
    } catch {
      restoreFailed = true;
    }
    const afterFailedColumns = failedRestore.prepare(
      "SELECT name FROM pragma_table_info('lessons') WHERE name IN ('reading','reading_notes','study_checkpoint')",
    ).all();
    failedRestore.close();
    if (!restoreFailed || afterFailedColumns.length) {
      throw new Error("failed restore committed partial schema");
    }
    const restored = new DatabaseSync(path);
    restoreLegacyReading(restored, archive);
    const row = restored.prepare(
      "SELECT id,slug,reading,reading_notes,study_checkpoint FROM lessons WHERE id=?",
    ).get(Number(before.id)) as Record<string, unknown>;
    restored.close();
    if (
      row.slug !== before.slug || row.reading !== "Book" || row.reading_notes !== "Notes" ||
      row.study_checkpoint !== "Raw JSON"
    ) throw new Error(JSON.stringify({ before, row }));
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
