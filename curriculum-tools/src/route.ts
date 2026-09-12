import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import type { Course, Lesson } from "./types.ts";

type Entry = { ordinal: number; slug: string; title: string };
export type RouteEntry = Entry & { available: boolean; done: boolean; stale: boolean };

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}

/** Read the numbered title/slug table used by future course plans and Essentials PLAN.md. */
export function parseRoute(markdown: string): Entry[] {
  const entries: Entry[] = [];
  for (const line of markdown.split("\n")) {
    const row = /^\|\s*(\d+)\s*\|([^|]+)\|/.exec(line);
    if (!row) continue;
    const slug = /`([a-z0-9]+(?:-[a-z0-9]+)*)`/.exec(row[2]);
    if (!slug) continue;
    const title = row[2].slice(0, slug.index).replace(/\*\*/g, "").replace(/\s*[/(]\s*$/, "")
      .trim();
    if (!title) throw new Error("Planned route needs a title before each stable slug");
    entries.push({ ordinal: Number(row[1]), title, slug: slug[1] });
  }
  if (
    entries.some((entry, i) => entry.ordinal !== i + 1) ||
    new Set(entries.map((entry) => entry.slug)).size !== entries.length
  ) throw new Error("Planned route must have sequential lesson numbers and unique slugs");
  return entries;
}

export async function loadRoute(toolRoot: string, id: string, progressPath: string): Promise<{
  id: string;
  name: string;
  lessons: RouteEntry[];
}> {
  const courseRoot = resolve(toolRoot, "courses", id);
  const metadata = await readOptional(resolve(courseRoot, "course.json"));
  const course: Course | undefined = metadata ? JSON.parse(metadata) : undefined;
  const catalogText = await readOptional(resolve(courseRoot, "lessons.json"));
  const catalog: Lesson[] = catalogText ? JSON.parse(catalogText) : [];
  let plan: string | undefined;
  const futureRoot = resolve(toolRoot, "..", "future-courses");
  try {
    for await (const folder of Deno.readDir(futureRoot)) {
      if (!folder.isDirectory) continue;
      const candidate = await readOptional(resolve(futureRoot, folder.name, "course.md"));
      if (candidate && /course id:\s*`([^`]+)`/i.exec(candidate)?.[1] === id) {
        if (plan) throw new Error(`Multiple future-course plans declare ${id}`);
        plan = candidate;
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  if (!course && !plan) throw new Error(`Unknown course '${id}'`);
  plan ??= await readOptional(resolve(courseRoot, "PLAN.md"));
  const planned = plan ? parseRoute(plan) : [];
  if (!course && !planned.length) throw new Error(`No numbered route in the ${id} plan`);
  const route = planned.length ? planned : catalog;
  const available = new Map(catalog.map((entry) => [entry.slug, entry]));
  // Reject stale plans instead of silently hiding or renumbering implemented lessons.
  for (const lesson of catalog) {
    if (route[lesson.ordinal - 1]?.slug !== lesson.slug) {
      throw new Error(
        `Route/catalog mismatch at lesson ${lesson.ordinal}; update the canonical plan`,
      );
    }
  }
  const progress = new Map<string, { status: string; completed_revision: number | null }>();
  try {
    await Deno.stat(progressPath);
    const db = new DatabaseSync(progressPath, { readOnly: true });
    try {
      const ready = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='progress'",
      ).get();
      if (ready) {
        const rows = db.prepare(
          "SELECT l.slug,p.status,p.completed_revision FROM lessons l JOIN progress p ON p.lesson_id=l.id WHERE l.active=1",
        ).all();
        for (const row of rows) {
          progress.set(String(row.slug), {
            status: String(row.status),
            completed_revision: row.completed_revision as number | null,
          });
        }
      }
    } finally {
      db.close();
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  return {
    id,
    name: course?.name ?? /^#\s+(.+)$/m.exec(plan!)?.[1] ?? id,
    lessons: route.map((entry) => {
      const authored = available.get(entry.slug);
      const saved = progress.get(entry.slug);
      const completed = Boolean(authored && saved?.status === "done");
      const stale = completed && saved?.completed_revision !== authored?.revision;
      return {
        ordinal: entry.ordinal,
        slug: entry.slug,
        title: entry.title,
        available: Boolean(authored),
        done: completed && !stale,
        stale,
      };
    }),
  };
}

export function renderRoute(route: Awaited<ReturnType<typeof loadRoute>>): string {
  const completed = route.lessons.filter((entry) => entry.done).length;
  return `# ${route.name} — ${route.lessons.length} lessons, ${completed} done\n\n` +
    "[done] marks completion of the current lesson revision; planned lessons are not yet available.\n\n" +
    route.lessons.map((entry) =>
      `${entry.ordinal}. ${
        entry.done ? "[done] " : entry.stale ? "[revisit] " : ""
      }${entry.title} — ${entry.available ? "available" : "planned"}`
    ).join("\n");
}
