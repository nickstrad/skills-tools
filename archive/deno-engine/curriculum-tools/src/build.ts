// Builds courses/<id>/lessons.json from courses/<id>/curriculum/mod.ts.
// Usage: deno task build [course-id ...]   (default: every course)
import { resolve } from "node:path";
import { listCourses, loadCourse, TOOL_ROOT } from "./main.ts";
import { readPlan, readPlanAndCatalog } from "./route.ts";
import { buildLessons, type Module } from "./types.ts";

export async function buildCourse(
  id: string,
  options: { toolRoot?: string } = {},
): Promise<number> {
  const toolRoot = options.toolRoot ?? TOOL_ROOT;
  const root = resolve(toolRoot, "courses", id);
  // Validate plan identity and duplicate future declarations before importing author code.
  await readPlan(toolRoot, id);
  const course = options.toolRoot
    ? JSON.parse(await Deno.readTextFile(resolve(root, "course.json")))
    : await loadCourse(id);
  const modPath = resolve(root, "curriculum", "mod.ts");
  const { MODULES } = await import(`file://${modPath}`) as { MODULES: Module[] };
  if (!MODULES.some((module) => module.lessons.length)) {
    throw new Error(
      `course ${id} has no authored lessons; add a requested lesson batch before building`,
    );
  }
  const lessons = buildLessons(course, MODULES);
  // Read and validate the canonical plan before touching the generated catalog. This keeps a
  // stale or malformed plan from publishing a catalog whose identities no longer match it.
  await readPlanAndCatalog(toolRoot, id, lessons);
  const out = resolve(root, "lessons.json");
  await Deno.writeTextFile(out, JSON.stringify(lessons, null, 2) + "\n");
  return lessons.length;
}

if (import.meta.main) {
  const ids = Deno.args.length ? Deno.args : (await listCourses()).map((c) => c.id);
  for (const id of ids) {
    const count = await buildCourse(id);
    console.log(`${id}: wrote ${count} lessons`);
  }
}
