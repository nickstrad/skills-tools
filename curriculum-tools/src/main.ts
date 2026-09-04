import { DatabaseSync } from "node:sqlite";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Course,
  type Lesson,
  type StudyCheckpoint,
  validateLessons,
  validateStudyCheckpoint,
} from "./types.ts";

type Row = Record<string, unknown>;
type Output = { log(value: string): void; error(value: string): void };

export const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const COURSES_DIR = resolve(TOOL_ROOT, "courses");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY,
  ordinal INTEGER NOT NULL UNIQUE CHECK (ordinal > 0),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner','intermediate','advanced')),
  tags TEXT NOT NULL DEFAULT ',',
  reading TEXT NOT NULL DEFAULT '',
  reading_notes TEXT NOT NULL DEFAULT '',
  study_checkpoint TEXT NOT NULL DEFAULT '',
  overview TEXT NOT NULL,
  syntax_breakdown TEXT NOT NULL,
  setup TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL,
  expected_result TEXT NOT NULL,
  systems_lens TEXT NOT NULL,
  challenge TEXT NOT NULL DEFAULT '',
  caution TEXT NOT NULL DEFAULT '',
  safety_level TEXT NOT NULL CHECK (safety_level IN ('read-only','writes-data','ddl','locking','privileged','dangerous')),
  run_in TEXT NOT NULL CHECK (run_in IN ('tool','shell','mixed')),
  sessions INTEGER NOT NULL DEFAULT 1 CHECK (sessions BETWEEN 1 AND 4),
  min_version TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS lesson_prerequisites (
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  prerequisite_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  PRIMARY KEY (lesson_id, prerequisite_id),
  CHECK (lesson_id <> prerequisite_id)
) WITHOUT ROWID, STRICT;

CREATE TABLE IF NOT EXISTS progress (
  lesson_id INTEGER PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('todo','done','skipped')),
  completed_revision INTEGER,
  completed_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((status = 'done' AND completed_at IS NOT NULL AND completed_revision IS NOT NULL)
    OR status IN ('todo','skipped'))
) STRICT;

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('manual','success','error','cancelled')),
  lesson_revision INTEGER NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  notes TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE INDEX IF NOT EXISTS lessons_category_ordinal_idx ON lessons(category, ordinal);
CREATE INDEX IF NOT EXISTS progress_status_idx ON progress(status);
CREATE INDEX IF NOT EXISTS attempts_lesson_time_idx ON attempts(lesson_id, attempted_at DESC);
`;

const LESSON_SELECT = `
SELECT l.*, COALESCE(p.status, 'todo') AS status, p.notes AS notes,
  CASE WHEN p.status = 'done' AND p.completed_revision <> l.revision THEN 1 ELSE 0 END AS stale
FROM lessons l LEFT JOIN progress p ON p.lesson_id = l.id`;

function usage(): string {
  return `Hands-on systems tutor: one engine, one curriculum per tool.

Usage:
  tutor courses
  tutor <course> init [--db PATH]
  tutor <course> next [--topic TEXT] [--json]
  tutor <course> show <NUMBER> [--json|--ansi|--plain]
  tutor <course> pretty [NUMBER | --topic TEXT] [--ansi|--plain]
  tutor <course> done <NUMBER> [--note TEXT]
  tutor <course> undone <NUMBER>
  tutor <course> skip <NUMBER> [--note TEXT]
  tutor <course> note <NUMBER> <TEXT>
  tutor <course> list [--todo|--done|--all] [--category NAME] [--topic TEXT] [--limit N] [--json]
  tutor <course> modules
  tutor <course> topics [--json]
  tutor <course> status [--json]
  tutor <course> search <TEXT> [--json]

Every course command accepts --db PATH to use a different progress database.
'show' and 'pretty' print a lesson as Markdown, styled with ANSI colours when stdout is a terminal
(--ansi forces colours, --plain disables them).
--topic matches every word against lesson tags, category, and title (e.g. --topic "buffer cache");
'topics' lists the tag vocabulary with progress so a reading topic can be mapped onto lessons.
Displaying a lesson never marks it done. Run 'tutor <course> done <NUMBER>' after the experiment.`;
}

function parseArgs(args: string[]) {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  const valued = new Set([
    "--db",
    "--category",
    "--limit",
    "--note",
    "--topic",
  ]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
    } else if (valued.has(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      flags.set(arg, value);
    } else if (
      ["--json", "--todo", "--done", "--all", "--help", "--ansi", "--plain"]
        .includes(arg)
    ) {
      flags.set(arg, true);
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  if (flags.has("--ansi") && flags.has("--plain")) {
    throw new Error("--ansi and --plain cannot be used together");
  }
  return { positional, flags };
}

export function courseDir(id: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`invalid course id: ${id}`);
  }
  return resolve(COURSES_DIR, id);
}

export async function listCourses(): Promise<Course[]> {
  const courses: Course[] = [];
  try {
    for await (const entry of Deno.readDir(COURSES_DIR)) {
      if (!entry.isDirectory) continue;
      try {
        courses.push(await loadCourse(entry.name));
      } catch {
        // Not a course directory; ignore.
      }
    }
  } catch {
    // No courses directory yet.
  }
  return courses.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadCourse(id: string): Promise<Course> {
  const file = resolve(courseDir(id), "course.json");
  const course = JSON.parse(await Deno.readTextFile(file)) as Course;
  if (course.id !== id) {
    throw new Error(`${file} declares id ${course.id}, expected ${id}`);
  }
  return course;
}

function dbPath(course: string, flags: Map<string, string | true>): string {
  const selected = flags.get("--db");
  if (!selected || selected === true) {
    return resolve(courseDir(course), "progress.sqlite");
  }
  return isAbsolute(selected) ? selected : resolve(Deno.cwd(), selected);
}

function openDb(path: string): DatabaseSync {
  Deno.mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;",
  );
  return db;
}

async function loadLessons(course: string): Promise<Lesson[]> {
  const file = resolve(courseDir(course), "lessons.json");
  let text: string;
  try {
    text = await Deno.readTextFile(file);
  } catch {
    throw new Error(
      `${file} is missing; run 'deno task build ${course}' first`,
    );
  }
  const lessons = JSON.parse(text) as Lesson[];
  validateLessons(lessons);
  return lessons;
}

function migrate(db: DatabaseSync): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(SCHEMA);
    db.prepare(
      "INSERT OR IGNORE INTO schema_migrations(version,name) VALUES(1,'initial')",
    ).run();
    const columns = db.prepare("PRAGMA table_info(lessons)").all() as Row[];
    if (!columns.some((c) => c.name === "tags")) {
      db.exec("ALTER TABLE lessons ADD COLUMN tags TEXT NOT NULL DEFAULT ','");
    }
    db.prepare(
      "INSERT OR IGNORE INTO schema_migrations(version,name) VALUES(2,'lesson tags')",
    )
      .run();
    if (!columns.some((c) => c.name === "reading")) {
      db.exec(
        "ALTER TABLE lessons ADD COLUMN reading TEXT NOT NULL DEFAULT ''",
      );
    }
    db.prepare(
      "INSERT OR IGNORE INTO schema_migrations(version,name) VALUES(3,'lesson reading')",
    )
      .run();
    if (!columns.some((c) => c.name === "reading_notes")) {
      db.exec(
        "ALTER TABLE lessons ADD COLUMN reading_notes TEXT NOT NULL DEFAULT ''",
      );
    }
    db.prepare(
      "INSERT OR IGNORE INTO schema_migrations(version,name) VALUES(4,'lesson reading notes')",
    ).run();
    if (!columns.some((c) => c.name === "study_checkpoint")) {
      db.exec(
        "ALTER TABLE lessons ADD COLUMN study_checkpoint TEXT NOT NULL DEFAULT ''",
      );
    }
    db.prepare(
      "INSERT OR IGNORE INTO schema_migrations(version,name) VALUES(5,'lesson study checkpoint')",
    ).run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function seed(db: DatabaseSync, course: string): Promise<number> {
  const lessons = await loadLessons(course);
  const upsert = db.prepare(`
    INSERT INTO lessons(id,ordinal,slug,title,category,difficulty,tags,reading,reading_notes,study_checkpoint,
      overview,syntax_breakdown,setup,code,expected_result,systems_lens,challenge,caution,
      safety_level,run_in,sessions,min_version,estimated_minutes,revision)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET ordinal=excluded.ordinal,slug=excluded.slug,title=excluded.title,
      category=excluded.category,difficulty=excluded.difficulty,tags=excluded.tags,
      reading=excluded.reading,reading_notes=excluded.reading_notes,study_checkpoint=excluded.study_checkpoint,
      overview=excluded.overview,
      syntax_breakdown=excluded.syntax_breakdown,setup=excluded.setup,code=excluded.code,
      expected_result=excluded.expected_result,systems_lens=excluded.systems_lens,
      challenge=excluded.challenge,caution=excluded.caution,safety_level=excluded.safety_level,
      run_in=excluded.run_in,sessions=excluded.sessions,min_version=excluded.min_version,
      estimated_minutes=excluded.estimated_minutes,revision=excluded.revision,active=1,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
  const prerequisite = db.prepare(
    "INSERT INTO lesson_prerequisites(lesson_id,prerequisite_id) VALUES(?,?)",
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    // Progress and attempts reference stable identities, not presentation order. Reordering
    // a course must not attach a completion or note to the new occupant of an ordinal.
    const previous = db.prepare("SELECT id,ordinal,slug FROM lessons").all() as Row[];
    const idBySlug = new Map(previous.map((row) => [String(row.slug), Number(row.id)]));
    let nextId = Math.max(0, ...previous.map((row) => Number(row.id)));
    const offset = Math.max(lessons.length, ...previous.map((row) => Number(row.ordinal)), 0) + 1;
    db.prepare("UPDATE lessons SET active=0,ordinal=?+id").run(offset);
    const idByOrdinal = new Map<number, number>();
    for (const x of lessons) {
      const id = idBySlug.get(x.slug) ?? ++nextId;
      idByOrdinal.set(x.ordinal, id);
      upsert.run(
        id,
        x.ordinal,
        x.slug,
        x.title,
        x.category,
        x.difficulty,
        `,${(x.tags ?? []).join(",")},`,
        x.reading ?? "",
        x.readingNotes ?? "",
        x.studyCheckpoint ? JSON.stringify(x.studyCheckpoint) : "",
        x.overview,
        x.syntaxBreakdown,
        x.setup ?? "",
        x.code,
        x.expectedResult,
        x.systemsLens,
        x.challenge ?? "",
        x.caution ?? "",
        x.safetyLevel,
        x.runIn,
        x.sessions,
        x.minVersion,
        x.estimatedMinutes,
        x.revision,
      );
    }
    db.exec("DELETE FROM lesson_prerequisites");
    for (const x of lessons) {
      for (const p of x.prerequisites) {
        prerequisite.run(idByOrdinal.get(x.ordinal)!, idByOrdinal.get(p)!);
      }
    }
    // Keep retired history addressable without growing temporary ordinals on each refresh.
    const retired = db.prepare("SELECT id FROM lessons WHERE active=0 ORDER BY id").all() as Row[];
    const park = db.prepare("UPDATE lessons SET ordinal=? WHERE id=?");
    retired.forEach((row, i) => park.run(lessons.length + i + 1, Number(row.id)));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return lessons.length;
}

function getLesson(db: DatabaseSync, ordinal: number): Row | undefined {
  return db.prepare(`${LESSON_SELECT} WHERE l.ordinal=? AND l.active=1`).get(
    ordinal,
  ) as
    | Row
    | undefined;
}

function requireOrdinal(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error("lesson number must be a positive integer");
  }
  return Number(value);
}

function tagsOf(row: Row): string[] {
  return String(row.tags ?? "").split(",").filter(Boolean);
}

function parseStudyCheckpoint(raw: unknown): StudyCheckpoint | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    throw new Error("invalid stored study checkpoint: malformed JSON");
  }
  try {
    validateStudyCheckpoint(parsed, "stored study checkpoint");
  } catch (error) {
    throw new Error(`invalid stored study checkpoint: ${(error as Error).message}`);
  }
  return parsed;
}

/** SQL filter matching every whitespace-separated word of a topic against tags, category, title. */
function topicFilter(topic: string): { sql: string; values: string[] } {
  const terms = topic.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) throw new Error("--topic requires at least one word");
  const haystack = "lower(l.tags || ' ' || l.category || ' ' || l.title)";
  return {
    sql: terms.map(() => `${haystack} LIKE ?`).join(" AND "),
    values: terms.map((t) => `%${t}%`),
  };
}

function cleanLesson(row: Row): Row {
  const studyCheckpoint = parseStudyCheckpoint(row.study_checkpoint);
  return {
    ordinal: row.ordinal,
    slug: row.slug,
    title: row.title,
    category: row.category,
    difficulty: row.difficulty,
    tags: tagsOf(row),
    reading: row.reading || undefined,
    readingNotes: row.reading_notes || undefined,
    ...(studyCheckpoint ? { studyCheckpoint } : {}),
    status: row.stale ? "stale" : row.status,
    sessions: row.sessions,
    runIn: row.run_in,
    safetyLevel: row.safety_level,
    minVersion: row.min_version,
    estimatedMinutes: row.estimated_minutes,
    overview: row.overview,
    syntaxBreakdown: row.syntax_breakdown,
    caution: row.caution || undefined,
    setup: row.setup || undefined,
    code: row.code,
    expectedResult: row.expected_result,
    systemsLens: row.systems_lens,
    challenge: row.challenge || undefined,
    notes: row.notes || undefined,
  };
}

function codeLanguage(course: Course, runIn: unknown): string {
  if (runIn === "shell") return "sh";
  if (runIn === "mixed") return "text";
  return ["psql", "sqlite3", "duckdb"].includes(course.tool) ? "sql" : course.tool;
}

function fence(text: unknown, lang: string): string {
  return "```" + lang + "\n" + String(text) + "\n```";
}

/** Render a lesson as Markdown: metadata block, then one `##` section per field. */
function renderLesson(row: Row, course: Course): string {
  const x = cleanLesson(row);
  const runIn = x.runIn === "tool"
    ? course.tool
    : x.runIn === "shell"
    ? "shell"
    : `${course.tool} + shell`;
  const sessions = Number(x.sessions) > 1 ? `, ${x.sessions} ${course.tool} sessions` : "";
  const lang = codeLanguage(course, x.runIn);
  const meta = [
    `**Meta:** ${x.category} | ${x.difficulty} | ~${x.estimatedMinutes} min | run in ${runIn}${sessions} | ${x.safetyLevel}`,
  ];
  if ((x.tags as string[]).length) {
    meta.push(`**Topics:** ${(x.tags as string[]).join(", ")}`);
  }
  if (x.reading) meta.push(`**Optional reference:** ${x.reading}`);
  meta.push(`Lesson ID: ${x.ordinal}`);
  // Two trailing spaces make each metadata line a hard break in Markdown.
  const parts = [`# Lesson ${x.ordinal}: ${x.title}`, meta.join("  \n")];
  const section = (title: string, body: unknown) => parts.push(`## ${title}\n${body}`);
  section("Overview", x.overview);
  if (x.readingNotes) {
    section(
      "Optional reference context",
      `You do not need to stop for this reference. Continue with the experiment; only a Study checkpoint at the end asks you to pause before the next lesson.\n\n${x.readingNotes}`,
    );
  }
  section("Syntax breakdown", x.syntaxBreakdown);
  if (x.caution) section("Caution", x.caution);
  if (x.setup) section("Setup", fence(x.setup, lang));
  section("Run", fence(x.code, lang));
  section("Expected result", x.expectedResult);
  section("Systems lens", x.systemsLens);
  if (x.challenge) section("Challenge", x.challenge);
  if (x.studyCheckpoint) {
    const checkpoint = x.studyCheckpoint as StudyCheckpoint;
    const body = [
      "Stop here after completing the experiment. Complete the Core excerpts before continuing.",
      `### Core\n${checkpoint.core.map((item) => `- ${item.source} — ${item.locator}`).join("\n")}`,
    ];
    if (checkpoint.optionalDepth?.length) {
      body.push(
        `### Optional depth\nRead these only if you want to go deeper.\n\n${
          checkpoint.optionalDepth
            .map((item) => `- ${item.source} — ${item.locator}`)
            .join("\n")
        }`,
      );
    }
    body.push(`### Why here\n${checkpoint.rationale}`);
    section("Study checkpoint — stop before the next lesson", body.join("\n\n"));
  }
  if (x.notes) section("Your note", x.notes);
  return parts.join("\n\n");
}

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  unbold: "\x1b[22m",
  dim: "\x1b[2m",
  title: "\x1b[1;36m",
  h2: "\x1b[1;33m",
  h3: "\x1b[1;32m",
  code: "\x1b[36m",
  bullet: "\x1b[35m",
};

/** Style the Markdown from renderLesson for a terminal: coloured headings, bold, tinted code. */
export function styleMarkdown(markdown: string): string {
  const out: string[] = [];
  let inCode = false;
  for (const raw of markdown.split("\n")) {
    const line = raw.replace(/ {2}$/, "");
    if (line.startsWith("```")) {
      inCode = !inCode;
      out.push(`${ANSI.dim}${line}${ANSI.reset}`);
      continue;
    }
    if (inCode) {
      out.push(`${ANSI.code}${line}${ANSI.reset}`);
      continue;
    }
    const heading = line.match(/^(#{1,3}) (.*)$/);
    if (heading) {
      const colour = heading[1].length === 1
        ? ANSI.title
        : heading[1].length === 2
        ? ANSI.h2
        : ANSI.h3;
      const rule = heading[1].length === 2 ? `\n${ANSI.dim}${"─".repeat(72)}${ANSI.reset}` : "";
      out.push(`${colour}${heading[2]}${ANSI.reset}${rule}`);
      continue;
    }
    let styled = line.replace(/\*\*(.+?)\*\*/g, `${ANSI.bold}$1${ANSI.unbold}`);
    styled = styled.replace(/^(\s*)- /, `$1${ANSI.bullet}•${ANSI.reset} `);
    out.push(styled);
  }
  return out.join("\n");
}

function ensureReady(db: DatabaseSync): void {
  try {
    db.prepare("SELECT run_in FROM lessons LIMIT 1").get();
  } catch {
    throw new Error(
      "progress database is not initialized; run 'tutor <course> init'",
    );
  }
}

export async function run(
  args: string[],
  io: Output = console,
): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    io.error(`Error: ${(error as Error).message}\n\n${usage()}`);
    return 2;
  }
  const [first, ...rest0] = parsed.positional;
  if (!first || parsed.flags.has("--help") || first === "help") {
    io.log(usage());
    return 0;
  }
  if (first === "courses") {
    const courses = await listCourses();
    io.log(
      parsed.flags.has("--json")
        ? JSON.stringify(courses, null, 2)
        : courses.map((c) => `${c.id.padEnd(12)} ${c.name} (${c.tool}) - ${c.description}`).join(
          "\n",
        ) || "No courses found.",
    );
    return 0;
  }
  const courseId = first;
  const [command, ...rest] = rest0;
  let course: Course;
  try {
    course = await loadCourse(courseId);
  } catch (error) {
    io.error(
      `Error: unknown course '${courseId}' (${(error as Error).message})\n\n${usage()}`,
    );
    return 2;
  }
  if (!command) {
    io.error(`Error: missing command for course ${courseId}\n\n${usage()}`);
    return 2;
  }
  const path = dbPath(courseId, parsed.flags);
  let db: DatabaseSync | undefined;
  try {
    db = openDb(path);
    if (command === "init" || command === "seed") {
      migrate(db);
      const count = await seed(db, courseId);
      io.log(`Initialized ${count} ${course.name} lessons in ${path}`);
      return 0;
    }
    ensureReady(db);
    const json = parsed.flags.has("--json");
    const ansi = parsed.flags.has("--ansi") ||
      (!parsed.flags.has("--plain") && Deno.stdout.isTerminal());
    const outputLesson = (row: Row, asJson: boolean) => {
      if (asJson) return io.log(JSON.stringify(cleanLesson(row), null, 2));
      const markdown = renderLesson(row, course);
      io.log(ansi ? styleMarkdown(markdown) : markdown);
    };
    if (command === "next" || (command === "pretty" && rest.length === 0)) {
      const topic = parsed.flags.get("--topic");
      const unfinished = `(p.lesson_id IS NULL OR p.status='todo'
          OR (p.status='done' AND p.completed_revision<>l.revision))`;
      let row: Row | undefined;
      if (typeof topic === "string") {
        const t = topicFilter(topic);
        const any = db.prepare(
          `SELECT count(*) n FROM lessons l WHERE l.active=1 AND ${t.sql}`,
        )
          .get(...t.values) as Row;
        if (Number(any.n) === 0) {
          io.log(
            json
              ? JSON.stringify({ topic, matched: 0 })
              : `No lessons match topic '${topic}'. Run 'tutor ${course.id} topics' to see the vocabulary, or 'search'.`,
          );
          return 0;
        }
        row = db.prepare(
          `${LESSON_SELECT} WHERE l.active=1 AND ${unfinished} AND ${t.sql}
          ORDER BY l.ordinal LIMIT 1`,
        ).get(...t.values) as Row | undefined;
        if (!row) {
          io.log(
            json
              ? JSON.stringify({ topic, matched: any.n, complete: true })
              : `All ${any.n} lessons matching topic '${topic}' are complete.`,
          );
          return 0;
        }
      } else {
        row = db.prepare(`${LESSON_SELECT} WHERE l.active=1 AND ${unfinished}
          ORDER BY l.ordinal LIMIT 1`).get() as Row | undefined;
      }
      if (!row) {
        io.log(
          json ? JSON.stringify({ complete: true }) : "All active lessons are complete.",
        );
      } else outputLesson(row, command === "pretty" ? false : json);
      return 0;
    }
    if (command === "show" || command === "pretty") {
      const ordinal = requireOrdinal(rest[0]);
      const row = getLesson(db, ordinal);
      if (!row) throw new RangeError(`lesson ${ordinal} not found`);
      outputLesson(row, command === "pretty" ? false : json);
      return 0;
    }
    if (["done", "undone", "skip"].includes(command)) {
      const ordinal = requireOrdinal(rest[0]);
      const lesson = getLesson(db, ordinal);
      if (!lesson) throw new RangeError(`lesson ${ordinal} not found`);
      if (command === "undone") {
        db.prepare(
          `UPDATE progress SET status='todo', completed_revision=NULL, completed_at=NULL,
          updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE lesson_id=?`,
        ).run(
          lesson.id as number,
        );
        io.log(`Lesson ${ordinal} marked todo.`);
      } else {
        const status = command === "done" ? "done" : "skipped";
        const revision = status === "done" ? lesson.revision as number : null;
        const completed = status === "done" ? new Date().toISOString() : null;
        const note = parsed.flags.get("--note");
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare(
            `INSERT INTO progress(lesson_id,status,completed_revision,completed_at,notes)
          VALUES(?,?,?,?,?) ON CONFLICT(lesson_id) DO UPDATE SET status=excluded.status,
          completed_revision=excluded.completed_revision,completed_at=excluded.completed_at,
          notes=CASE WHEN excluded.notes='' THEN progress.notes ELSE excluded.notes END,
          updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
          ).run(
            lesson.id as number,
            status,
            revision,
            completed,
            typeof note === "string" ? note : "",
          );
          db.prepare(
            "INSERT INTO attempts(lesson_id,outcome,lesson_revision,notes) VALUES(?,?,?,?)",
          ).run(
            lesson.id as number,
            "manual",
            lesson.revision as number,
            typeof note === "string" ? note : "",
          );
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        io.log(`Lesson ${ordinal} marked ${status}.`);
      }
      return 0;
    }
    if (command === "note") {
      const ordinal = requireOrdinal(rest[0]);
      const note = rest.slice(1).join(" ").trim();
      if (!note) throw new Error("note text is required");
      const lesson = getLesson(db, ordinal);
      if (!lesson) throw new RangeError(`lesson ${ordinal} not found`);
      db.prepare(
        `INSERT INTO progress(lesson_id,status,notes) VALUES(?,'todo',?)
        ON CONFLICT(lesson_id) DO UPDATE SET notes=excluded.notes,
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      ).run(lesson.id as number, note);
      io.log(`Note saved for lesson ${ordinal}.`);
      return 0;
    }
    if (command === "list") {
      const modes = ["--todo", "--done", "--all"].filter((f) => parsed.flags.has(f));
      if (modes.length > 1) {
        throw new Error(`choose one of ${modes.join(", ")}`);
      }
      const filters: string[] = ["l.active=1"];
      const values: (string | number)[] = [];
      if (parsed.flags.has("--done")) {
        filters.push("p.status='done' AND p.completed_revision=l.revision");
      } else if (parsed.flags.has("--todo")) {
        filters.push(
          "(p.lesson_id IS NULL OR p.status='todo' OR (p.status='done' AND p.completed_revision<>l.revision))",
        );
      }
      const category = parsed.flags.get("--category");
      if (typeof category === "string") {
        filters.push("l.category=?");
        values.push(category);
      }
      const topic = parsed.flags.get("--topic");
      if (typeof topic === "string") {
        const t = topicFilter(topic);
        filters.push(t.sql);
        values.push(...t.values);
      }
      const limitRaw = parsed.flags.get("--limit");
      const limit = typeof limitRaw === "string" ? requireOrdinal(limitRaw) : 1000;
      values.push(limit);
      const rows = db.prepare(
        `${LESSON_SELECT} WHERE ${filters.join(" AND ")} ORDER BY l.ordinal LIMIT ?`,
      ).all(...values) as Row[];
      if (json) io.log(JSON.stringify(rows.map(cleanLesson), null, 2));
      else {io.log(
          rows.map((x) =>
            `${String(x.ordinal).padStart(3)}  ${
              (x.stale ? "stale" : String(x.status)).padEnd(7)
            } [${x.category}] ${x.title}${
              Number(x.sessions) > 1 ? ` (${x.sessions} sessions)` : ""
            }${tagsOf(x).length ? `  {${tagsOf(x).join(",")}}` : ""}`
          ).join("\n") || "No lessons found.",
        );}
      return 0;
    }
    if (command === "topics") {
      const rows = db.prepare(`SELECT l.ordinal, l.tags,
        (p.status='done' AND p.completed_revision=l.revision) AS finished
        FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id WHERE l.active=1
        ORDER BY l.ordinal`).all() as Row[];
      const topics = new Map<
        string,
        { first: number; total: number; done: number; lessons: number[] }
      >();
      for (const r of rows) {
        for (const tag of tagsOf(r)) {
          const t = topics.get(tag) ??
            { first: Number(r.ordinal), total: 0, done: 0, lessons: [] };
          t.total++;
          if (r.finished) t.done++;
          t.lessons.push(Number(r.ordinal));
          topics.set(tag, t);
        }
      }
      const sorted = [...topics.entries()].sort((a, b) => a[1].first - b[1].first);
      io.log(
        json
          ? JSON.stringify(sorted.map(([tag, t]) => ({ tag, ...t })), null, 2)
          : sorted.map(([tag, t]) =>
            `${tag.padEnd(28)} ${String(t.done).padStart(2)}/${
              String(t.total).padEnd(3)
            } done  lessons ${t.lessons.join(",")}`
          ).join("\n") || "No topics tagged yet.",
      );
      return 0;
    }
    if (command === "modules") {
      const rows = db.prepare(
        `SELECT l.category, min(l.ordinal) first, max(l.ordinal) last,
        count(*) total, count(*) FILTER (WHERE p.status='done' AND p.completed_revision=l.revision) done,
        sum(l.estimated_minutes) minutes
        FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id WHERE l.active=1
        GROUP BY l.category ORDER BY first`,
      ).all() as Row[];
      io.log(
        json
          ? JSON.stringify(rows, null, 2)
          : rows.map((x) =>
            `${String(x.first).padStart(3)}-${String(x.last).padEnd(3)} ${
              String(x.category).padEnd(26)
            } ${x.done}/${x.total} done  ~${x.minutes} min`
          ).join("\n"),
      );
      return 0;
    }
    if (command === "status") {
      const row = db.prepare(`SELECT count(*) total,
        count(*) FILTER (WHERE p.status='done' AND p.completed_revision=l.revision) done,
        count(*) FILTER (WHERE p.status='skipped') skipped,
        count(*) FILTER (WHERE p.status='done' AND p.completed_revision<>l.revision) stale
        FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id WHERE l.active=1`)
        .get() as Row;
      const status = {
        course: course.id,
        total: row.total,
        done: row.done,
        todo: Number(row.total) - Number(row.done) - Number(row.skipped),
        skipped: row.skipped,
        stale: row.stale,
      };
      io.log(
        json
          ? JSON.stringify(status, null, 2)
          : `${course.name}: ${status.done}/${status.total} done; ${status.todo} remaining; ${status.skipped} skipped; ${status.stale} stale.`,
      );
      return 0;
    }
    if (command === "search") {
      const terms = rest.join(" ").trim().split(/\s+/).filter(Boolean);
      if (terms.length === 0) throw new Error("search text is required");
      const haystack =
        "(l.title || ' ' || l.overview || ' ' || l.systems_lens || ' ' || l.code || ' ' || l.category || ' ' || l.slug || ' ' || l.tags)";
      const filters = terms.map(() => `${haystack} LIKE ?`).join(" AND ");
      const rows = db.prepare(
        `${LESSON_SELECT} WHERE l.active=1 AND ${filters} ORDER BY l.ordinal`,
      )
        .all(...terms.map((t) => `%${t}%`)) as Row[];
      if (json) io.log(JSON.stringify(rows.map(cleanLesson), null, 2));
      else {io.log(
          rows.map((x) => `${String(x.ordinal).padStart(3)}  [${x.category}] ${x.title}`).join(
            "\n",
          ) || "No lessons found.",
        );}
      return 0;
    }
    throw new Error(`unknown command: ${command}`);
  } catch (error) {
    io.error(`Error: ${(error as Error).message}`);
    return error instanceof RangeError ? 2 : 1;
  } finally {
    db?.close();
  }
}

if (import.meta.main) Deno.exit(await run(Deno.args));
