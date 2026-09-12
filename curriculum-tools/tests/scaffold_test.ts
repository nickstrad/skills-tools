import { resolve } from "node:path";
import { buildCourse } from "../src/build.ts";
import { scaffoldCourse } from "../src/new_course.ts";
import { discoverCourses, readPlan } from "../src/route.ts";

async function copyTree(source: string, target: string): Promise<void> {
  await Deno.mkdir(target, { recursive: true });
  for await (const entry of Deno.readDir(source)) {
    const from = resolve(source, entry.name);
    const to = resolve(target, entry.name);
    if (entry.isDirectory) await copyTree(from, to);
    else await Deno.copyFile(from, to);
  }
}

Deno.test("scaffold is an empty runtime-neutral shell linked to its planned route", async () => {
  const dir = await Deno.makeTempDir({ prefix: "scaffold-boundary-" });
  try {
    const toolRoot = resolve(dir, "curriculum-tools");
    const template = resolve(Deno.cwd(), "templates", "course");
    await copyTree(template, resolve(toolRoot, "templates", "course"));
    await Deno.mkdir(resolve(toolRoot, "courses"), { recursive: true });
    await Deno.mkdir(resolve(dir, "future-courses", "demo"), { recursive: true });
    await Deno.writeTextFile(
      resolve(dir, "future-courses", "demo", "course.md"),
      "# Demo Course\n\nCourse ID: `demo`\n\n## Canonical route\n\n| # | Lesson / stable slug | Outcome |\n| --- | --- | --- |\n| 1 | First mechanism / `first-mechanism` | Observe it |\n| 2 | Second mechanism / `second-mechanism` | Explain it |\n",
    );

    const written = await scaffoldCourse({
      id: "demo",
      name: "Demo Course",
      tool: "demo-tool",
      description: 'A "temporary" course\nwith a line',
      minVersion: "1",
    }, { toolRoot });
    const course = resolve(toolRoot, "courses", "demo");
    const metadata = JSON.parse(await Deno.readTextFile(resolve(course, "course.json")));
    const module = await Deno.readTextFile(resolve(course, "curriculum", "mod.ts"));
    const plan = await Deno.readTextFile(resolve(course, "PLAN.md"));
    if (metadata.repl !== undefined) throw new Error("scaffold invented a REPL configuration");
    if (metadata.description !== 'A "temporary" course\nwith a line') {
      throw new Error("scaffold did not escape JSON metadata values");
    }
    if (!module.includes("MODULES: Module[] = []") || module.includes("build-lab")) {
      throw new Error("scaffold invented an authored lesson");
    }
    if (!plan.includes("first-mechanism") || !written.includes("PLAN.md")) {
      throw new Error("canonical plan was not linked");
    }
    let buildFailed = false;
    try {
      await buildCourse("demo", { toolRoot });
    } catch (error) {
      buildFailed = String(error).includes("no authored lessons");
    }
    if (!buildFailed) throw new Error("empty scaffold unexpectedly built");
    try {
      await Deno.stat(resolve(course, "lessons.json"));
      throw new Error("failed empty build wrote a catalog");
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    try {
      await Deno.stat(resolve(course, "progress.sqlite"));
      throw new Error("scaffold allocated learner progress");
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("duplicate future identities fail before scaffold files are created", async () => {
  const dir = await Deno.makeTempDir({ prefix: "scaffold-duplicate-" });
  try {
    const toolRoot = resolve(dir, "curriculum-tools");
    const template = resolve(Deno.cwd(), "templates", "course");
    await copyTree(template, resolve(toolRoot, "templates", "course"));
    await Deno.mkdir(resolve(toolRoot, "courses"), { recursive: true });
    await Deno.mkdir(resolve(toolRoot, "courses", "duplicate"), { recursive: true });
    await Deno.writeTextFile(
      resolve(toolRoot, "courses", "duplicate", "course.json"),
      '{"id":"duplicate","name":"Duplicate","description":"","tool":"x","minVersion":"1","revision":1}',
    );
    await Deno.writeTextFile(resolve(toolRoot, "courses", "duplicate", "PLAN.md"), "# Duplicate\n");
    for (const folder of ["one", "two"]) {
      await Deno.mkdir(resolve(dir, "future-courses", folder), { recursive: true });
      await Deno.writeTextFile(
        resolve(dir, "future-courses", folder, "course.md"),
        "# Duplicate\nCourse ID: `duplicate`\n",
      );
    }
    let failed = false;
    try {
      await scaffoldCourse({
        id: "duplicate",
        name: "Duplicate",
        tool: "x",
        description: "x",
        minVersion: "1",
      }, { toolRoot });
    } catch (error) {
      failed = String(error).includes("Multiple future-course plans declare duplicate");
    }
    if (!failed) throw new Error("duplicate future identity was accepted");
    const existingPlan = await Deno.readTextFile(
      resolve(toolRoot, "courses", "duplicate", "PLAN.md"),
    );
    if (existingPlan !== "# Duplicate\n") {
      throw new Error("duplicate plan modified an existing course");
    }
    for (
      const operation of [
        () => readPlan(toolRoot, "duplicate"),
        () => discoverCourses(toolRoot),
        () => buildCourse("duplicate", { toolRoot }),
      ]
    ) {
      let rejected = false;
      try {
        await operation();
      } catch (error) {
        rejected = String(error).includes("Multiple future-course plans declare duplicate");
      }
      if (!rejected) throw new Error("duplicate future identity was not rejected by every reader");
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("build validates a changed plan before replacing an existing catalog", async () => {
  const dir = await Deno.makeTempDir({ prefix: "build-route-boundary-" });
  try {
    const toolRoot = resolve(dir, "curriculum-tools");
    await Deno.mkdir(resolve(toolRoot, "courses", "demo", "curriculum"), { recursive: true });
    await Deno.mkdir(resolve(dir, "future-courses", "demo"), { recursive: true });
    await Deno.mkdir(resolve(toolRoot, "src"), { recursive: true });
    await Deno.copyFile(
      resolve(Deno.cwd(), "src", "types.ts"),
      resolve(toolRoot, "src", "types.ts"),
    );
    await Deno.writeTextFile(
      resolve(toolRoot, "courses", "demo", "course.json"),
      JSON.stringify({
        id: "demo",
        name: "Demo",
        description: "",
        tool: "bash",
        minVersion: "1",
        revision: 1,
      }),
    );
    await Deno.writeTextFile(
      resolve(toolRoot, "courses", "demo", "curriculum", "mod.ts"),
      `
import type { Module } from "../../../src/types.ts";
export const MODULES: Module[] = [{ category: "demo", title: "Demo", lessons: [{
  slug: "first-mechanism", title: "First mechanism", difficulty: "beginner",
  overview: "overview", syntaxBreakdown: "breakdown", code: "printf ok",
  expectedResult: "ok", systemsLens: "lens", safetyLevel: "read-only", runIn: "shell",
  estimatedMinutes: 1,
}] }];
`,
    );
    const plan = (slug: string) =>
      `# Demo\n\nCourse ID: \`demo\`\n\n## Canonical route\n\n| # | Lesson / stable slug | Outcome |\n| --- | --- | --- |\n| 1 | First mechanism / \`${slug}\` | Observe it |\n`;
    const planPath = resolve(dir, "future-courses", "demo", "course.md");
    await Deno.writeTextFile(planPath, plan("first-mechanism"));
    await buildCourse("demo", { toolRoot });
    const catalogPath = resolve(toolRoot, "courses", "demo", "lessons.json");
    const before = await Deno.readFile(catalogPath);
    await Deno.writeTextFile(planPath, plan("changed-mechanism"));
    let failed = false;
    try {
      await buildCourse("demo", { toolRoot });
    } catch (error) {
      failed = String(error).includes("Route/catalog mismatch at lesson 1");
    }
    if (!failed) throw new Error("build accepted a changed canonical identity");
    const after = await Deno.readFile(catalogPath);
    if (before.length !== after.length || before.some((byte, i) => byte !== after[i])) {
      throw new Error("failed build replaced the existing catalog");
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
