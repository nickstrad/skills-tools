/**
 * Export retired reading metadata before it is removed from source catalogs.
 *
 * The source export is deliberately keyed by course and lesson slug. Database
 * exports use the same record shape, but are written by src/legacy_reading.ts
 * below the ignored `databases/` directory so learner-private state cannot be
 * committed with the source archive.
 */
import { resolve } from "node:path";

const repo = resolve(Deno.cwd());
const archive = resolve(repo, "archive", "legacy-reading", "catalog");
const requestedRevision = Deno.args[0] ?? "HEAD";
const courses = ["grpc", "linux", "postgres", "postgres-essentials", "sqlite"];
const fields = ["reading", "readingNotes", "studyCheckpoint"] as const;

type CatalogLesson = {
  ordinal: number;
  slug: string;
  reading?: unknown;
  readingNotes?: unknown;
  studyCheckpoint?: unknown;
};

async function resolveRevision(): Promise<string> {
  const command = new Deno.Command("git", {
    args: ["rev-parse", "--verify", requestedRevision + "^{commit}"],
    cwd: repo,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  if (!output.success) throw new Error(new TextDecoder().decode(output.stderr));
  return new TextDecoder().decode(output.stdout).trim();
}

async function readBaseline(course: string, revision: string): Promise<CatalogLesson[]> {
  const path = `curriculum-tools/courses/${course}/lessons.json`;
  const command = new Deno.Command("git", {
    args: ["show", `${revision}:${path}`],
    cwd: repo,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  if (!output.success) {
    throw new Error(new TextDecoder().decode(output.stderr));
  }
  return JSON.parse(new TextDecoder().decode(output.stdout)) as CatalogLesson[];
}

const revision = await resolveRevision();
await Deno.mkdir(archive, { recursive: true });
for (const course of courses) {
  const lessons = await readBaseline(course, revision);
  const records: Record<string, Record<string, unknown>> = {};
  for (const lesson of lessons) {
    const metadata: Record<string, unknown> = {
      ordinal: lesson.ordinal,
      slug: lesson.slug,
    };
    let hasLegacy = false;
    for (const field of fields) {
      if (field in lesson) {
        metadata[field] = lesson[field];
        hasLegacy = true;
      }
    }
    if (hasLegacy) records[lesson.slug] = metadata;
  }
  const path = resolve(archive, `${course}.json`);
  const serialized = JSON.stringify(
    { format: 1, sourceRevision: revision, course, lessons: records },
    null,
    2,
  ) + "\n";
  try {
    const existing = await Deno.readTextFile(path);
    if (existing !== serialized) throw new Error("refusing to replace differing archive: " + path);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
    await Deno.writeTextFile(path, serialized, { createNew: true });
  }
  console.log(`${course}: exported ${Object.keys(records).length} legacy lesson records`);
}
