import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import type { Course, Lesson } from "./types.ts";

type Entry = { ordinal: number; slug: string; title: string };
export type RouteEntry = Entry & { available: boolean; done: boolean; stale: boolean };
export type PlanRoute = { entries: Entry[]; path?: string; markdown?: string };
export type DiscoveryStatus = "current" | "reference" | "proposed" | "agreed";
export type CourseDiscovery = {
  id: string;
  name: string;
  description: string;
  tool?: string;
  status: DiscoveryStatus;
  implemented: boolean;
  planned: boolean;
  authored: number;
  available: number;
  total: number;
  planPath?: string;
};
type Metadata = Partial<Course> & { status?: DiscoveryStatus };

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}

function cells(line: string): string[] | undefined {
  if (!/^\s*\|.*\|\s*$/.test(line)) return undefined;
  return line.trim().slice(1, -1).split("|").map((cell) => cell.trim());
}
function separator(line: string): boolean {
  const row = cells(line);
  return Boolean(row?.length && row.every((cell) => /^:?-{2,}:?$/.test(cell)));
}
function canonicalHeader(row: string[] | undefined): boolean {
  return Boolean(row && row[0] === "#" && /^Lesson\s*\/\s*stable\s+slug$/i.test(row[1] ?? ""));
}
function fence(line: string): boolean {
  return /^\s*(`{3,}|~{3,})/.test(line);
}
function lineError(line: number, message: string): Error {
  return new Error(`Canonical route line ${line}: ${message}`);
}

function parseCanonical(markdown: string): Entry[] | undefined {
  const lines = markdown.split("\n");
  let inFence = false;
  let headerLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (fence(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !canonicalHeader(cells(lines[i]))) continue;
    if (headerLine >= 0) throw lineError(i + 1, "multiple canonical route tables are not allowed");
    headerLine = i;
  }
  if (headerLine < 0) return undefined;
  if (!separator(lines[headerLine + 1])) {
    throw lineError(headerLine + 2, "canonical route needs a separator row after its header");
  }

  const entries: Entry[] = [];
  const seenSlugs = new Map<string, number>();
  let inRouteFence = false;
  for (let i = headerLine + 2; i < lines.length; i++) {
    if (fence(lines[i])) {
      inRouteFence = !inRouteFence;
      continue;
    }
    if (inRouteFence) continue;
    const row = cells(lines[i]);
    if (!row) {
      if (lines[i].trim().startsWith("|")) {
        throw lineError(i + 1, "route row must end with a pipe");
      }
      break;
    }
    if (row.length < 2) throw lineError(i + 1, "route row needs an ordinal and title/slug cell");
    if (!/^\d+$/.test(row[0]) || Number(row[0]) < 1) {
      throw lineError(i + 1, `route row has malformed ordinal '${row[0]}'`);
    }
    const ordinal = Number(row[0]);
    const slugMatches = [...row[1].matchAll(/`([^`]+)`/g)];
    if (slugMatches.length !== 1) {
      throw lineError(i + 1, `lesson ${ordinal} needs exactly one stable slug in backticks`);
    }
    const slug = slugMatches[0][1];
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw lineError(i + 1, `stable slug '${slug}' must use lowercase kebab-case`);
    }
    const title = row[1].slice(0, slugMatches[0].index)
      .replace(/\*\*/g, "")
      .replace(/\s*[/([—–:-]\s*$/, "")
      .trim();
    if (!title) throw lineError(i + 1, `lesson ${ordinal} has no title before '${slug}'`);
    if (entries.length + 1 !== ordinal) {
      throw lineError(i + 1, `expected lesson ${entries.length + 1}, found ${ordinal}`);
    }
    const previous = seenSlugs.get(slug);
    if (previous) {
      throw lineError(i + 1, `duplicate stable slug '${slug}' (already lesson ${previous})`);
    }
    seenSlugs.set(slug, ordinal);
    entries.push({ ordinal, slug, title });
  }
  if (!entries.length) throw lineError(headerLine + 1, "canonical route table has no lesson rows");
  return entries;
}

/** Parse only the canonical numbered route table. Legacy plans return an empty route and use catalogs. */
export function parseRoute(markdown: string): Entry[] {
  return parseCanonical(markdown) ?? [];
}

export type PlanFile = { path: string; markdown: string; future: boolean };
async function futurePlans(toolRoot: string): Promise<PlanFile[]> {
  const root = resolve(toolRoot, "..", "future-courses");
  const plans: PlanFile[] = [];
  try {
    for await (const folder of Deno.readDir(root)) {
      if (!folder.isDirectory) continue;
      const path = resolve(root, folder.name, "course.md");
      const markdown = await readOptional(path);
      if (markdown !== undefined) plans.push({ path, markdown, future: true });
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  return plans;
}

/** Locate the future plan first and reject duplicate future identities, even beside a course PLAN.md. */
export async function locatePlan(toolRoot: string, id: string): Promise<PlanFile | undefined> {
  const matches = (await futurePlans(toolRoot)).filter((plan) =>
    /course id:\s*`([^`]+)`/i.exec(plan.markdown)?.[1] === id
  );
  if (matches.length > 1) throw new Error(`Multiple future-course plans declare ${id}`);
  if (matches.length) return matches[0];
  const path = resolve(toolRoot, "courses", id, "PLAN.md");
  const markdown = await readOptional(path);
  return markdown === undefined ? undefined : { path, markdown, future: false };
}

/** Read the canonical route. A future plan must contain the canonical table; old installed plans fall back. */
export async function readPlan(toolRoot: string, id: string): Promise<PlanRoute | undefined> {
  const plan = await locatePlan(toolRoot, id);
  if (!plan) return undefined;
  const entries = parseCanonical(plan.markdown);
  if (!entries) {
    if (plan.future) {
      throw new Error(`Future course plan ${plan.path} has no canonical route table`);
    }
    return undefined;
  }
  return { entries, path: plan.path, markdown: plan.markdown };
}

export function validateRouteCatalog(route: Entry[] | undefined, catalog: Lesson[]): void {
  if (!route || !catalog.length) return;
  for (const lesson of catalog) {
    const planned = route[lesson.ordinal - 1];
    if (!planned) {
      throw new Error(
        `Route/catalog mismatch: authored lesson ${lesson.ordinal} '${lesson.slug}' is beyond the ${route.length}-lesson canonical route`,
      );
    }
    if (planned.slug !== lesson.slug) {
      throw new Error(
        `Route/catalog mismatch at lesson ${lesson.ordinal}: plan has '${planned.slug}', catalog has '${lesson.slug}' (update the canonical plan or preserve the stable identity)`,
      );
    }
  }
}

/** Shared read-plan and catalog-alignment operation used by route display and builds. */
export async function readPlanAndCatalog(
  toolRoot: string,
  id: string,
  catalog: Lesson[],
): Promise<PlanRoute> {
  const plan = await readPlan(toolRoot, id);
  validateRouteCatalog(plan?.entries, catalog);
  return plan ?? { entries: catalog.map(({ ordinal, slug, title }) => ({ ordinal, slug, title })) };
}

async function readCatalog(root: string): Promise<Lesson[]> {
  const text = await readOptional(resolve(root, "lessons.json"));
  return text ? JSON.parse(text) as Lesson[] : [];
}
function courseName(markdown: string | undefined, fallback: string): string {
  return markdown ? /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? fallback : fallback;
}
function planStatus(markdown: string): DiscoveryStatus {
  const status = /^Status:\s*(proposed|agreed|current|reference)\b/im.exec(markdown)?.[1]
    ?.toLowerCase();
  return status === "agreed" || status === "current" || status === "reference"
    ? status
    : "proposed";
}

/** Discover installed courses and future plans without creating or mutating learner state. */
export async function discoverCourses(toolRoot: string): Promise<CourseDiscovery[]> {
  const found = new Map<string, CourseDiscovery>();
  try {
    for await (const folder of Deno.readDir(resolve(toolRoot, "courses"))) {
      if (!folder.isDirectory) continue;
      const root = resolve(toolRoot, "courses", folder.name);
      const text = await readOptional(resolve(root, "course.json"));
      if (!text) continue;
      const metadata = JSON.parse(text) as Metadata;
      if (metadata.id !== folder.name) continue;
      const catalog = await readCatalog(root);
      const located = await locatePlan(toolRoot, folder.name);
      const route = (await readPlan(toolRoot, folder.name))?.entries;
      validateRouteCatalog(route, catalog);
      found.set(folder.name, {
        id: folder.name,
        name: metadata.name ?? folder.name,
        description: metadata.description ?? "",
        ...(metadata.tool ? { tool: metadata.tool } : {}),
        status: metadata.status ?? "current",
        implemented: true,
        planned: false,
        authored: catalog.length,
        available: catalog.length,
        total: route?.length ?? catalog.length,
        ...(located ? { planPath: located.path } : {}),
      });
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  for (const plan of await futurePlans(toolRoot)) {
    const id = /course id:\s*`([^`]+)`/i.exec(plan.markdown)?.[1];
    if (!id) continue;
    if ([...found.values()].some((item) => item.planned && item.id === id)) {
      throw new Error(`Multiple future-course plans declare ${id}`);
    }
    const existing = found.get(id);
    if (existing) {
      if (!existing.planPath) existing.planPath = plan.path;
      continue;
    }
    const route = parseCanonical(plan.markdown);
    if (!route) throw new Error(`Future course plan ${plan.path} has no canonical route table`);
    found.set(id, {
      id,
      name: courseName(plan.markdown, id),
      description: "",
      status: planStatus(plan.markdown),
      implemented: false,
      planned: true,
      authored: 0,
      available: 0,
      total: route.length,
      planPath: plan.path,
    });
  }
  return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadRoute(
  toolRoot: string,
  id: string,
  progressPath: string,
): Promise<{ id: string; name: string; lessons: RouteEntry[] }> {
  const root = resolve(toolRoot, "courses", id);
  const metadata = await readOptional(resolve(root, "course.json"));
  const course: Course | undefined = metadata ? JSON.parse(metadata) : undefined;
  const catalog = await readCatalog(root);
  const plan = await readPlanAndCatalog(toolRoot, id, catalog);
  if (!course && !plan.entries.length) throw new Error(`Unknown course '${id}'`);
  const progress = new Map<string, { status: string; completed_revision: number | null }>();
  try {
    await Deno.stat(progressPath);
    const db = new DatabaseSync(progressPath, { readOnly: true });
    try {
      const ready = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='progress'",
      ).get();
      if (ready) {
        for (
          const row of db.prepare(
            "SELECT l.slug,p.status,p.completed_revision FROM lessons l JOIN progress p ON p.lesson_id=l.id WHERE l.active=1",
          ).all()
        ) {
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
  const available = new Map(catalog.map((entry) => [entry.slug, entry]));
  return {
    id,
    name: course?.name ?? courseName(plan.markdown, id),
    lessons: plan.entries.map((entry) => {
      const authored = available.get(entry.slug);
      const saved = progress.get(entry.slug);
      const completed = Boolean(authored && saved?.status === "done");
      const stale = completed && saved?.completed_revision !== authored?.revision;
      return { ...entry, available: Boolean(authored), done: completed && !stale, stale };
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
