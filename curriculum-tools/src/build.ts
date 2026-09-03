// Builds courses/<id>/lessons.json from courses/<id>/curriculum/mod.ts.
// Usage: deno task build [course-id ...]   (default: every course)
import { resolve } from "node:path";
import { courseDir, listCourses, loadCourse } from "./main.ts";
import { buildLessons, type Module } from "./types.ts";

export async function buildCourse(id: string): Promise<number> {
  const course = await loadCourse(id);
  const modPath = resolve(courseDir(id), "curriculum", "mod.ts");
  const { MODULES } = await import(`file://${modPath}`) as { MODULES: Module[] };
  const lessons = buildLessons(course, MODULES);
  const out = resolve(courseDir(id), "lessons.json");
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
