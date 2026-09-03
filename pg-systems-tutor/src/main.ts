import { DatabaseSync } from "node:sqlite";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Lesson = {
  ordinal: number;
  slug: string;
  title: string;
  overview: string;
  syntaxBreakdown: string;
  sqlText: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  prerequisites: number[];
  expectedResult: string;
  systemsLens: string;
  caution?: string;
  safetyLevel: "read-only" | "writes-data" | "ddl" | "locking" | "privileged" | "dangerous";
  commandKind: "sql" | "psql-meta" | "mixed";
  minPgVersion: number;
  estimatedMinutes: number;
  revision: number;
};

type Row = Record<string, unknown>;
type Output = { log(value: string): void; error(value: string): void };

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DB = resolve(TOOL_ROOT, "data", "pg-systems-tutor.sqlite");
const LESSONS_FILE = resolve(TOOL_ROOT, "data", "lessons.json");

const MIGRATION = `
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
  overview TEXT NOT NULL,
  syntax_breakdown TEXT NOT NULL,
  sql_text TEXT NOT NULL,
  expected_result TEXT NOT NULL,
  systems_lens TEXT NOT NULL,
  caution TEXT NOT NULL DEFAULT '',
  safety_level TEXT NOT NULL CHECK (safety_level IN ('read-only','writes-data','ddl','locking','privileged','dangerous')),
  command_kind TEXT NOT NULL CHECK (command_kind IN ('sql','psql-meta','mixed')),
  min_pg_version INTEGER NOT NULL CHECK (min_pg_version >= 9),
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
SELECT l.*, COALESCE(p.status, 'todo') AS status,
  CASE WHEN p.status = 'done' AND p.completed_revision <> l.revision THEN 1 ELSE 0 END AS stale
FROM lessons l LEFT JOIN progress p ON p.lesson_id = l.id`;

function usage(): string {
  return `PostgreSQL systems tutor

Usage:
  pgtutor init [--db PATH]
  pgtutor next [--db PATH] [--json]
  pgtutor show <NUMBER> [--db PATH] [--json]
  pgtutor pretty [NUMBER] [--db PATH]
  pgtutor done <NUMBER> [--note TEXT] [--db PATH]
  pgtutor undone <NUMBER> [--db PATH]
  pgtutor skip <NUMBER> [--note TEXT] [--db PATH]
  pgtutor note <NUMBER> <TEXT> [--db PATH]
  pgtutor list [--todo|--done|--all] [--category NAME] [--limit N] [--json] [--db PATH]
  pgtutor status [--json] [--db PATH]
  pgtutor search <TEXT> [--json] [--db PATH]

Displaying a lesson never marks it done. Run 'pgtutor done <NUMBER>' after using it in psql.`;
}

function parseArgs(args: string[]) {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  const valued = new Set(["--db", "--category", "--limit", "--note"]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
    } else if (valued.has(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      flags.set(arg, value);
    } else if (["--json", "--todo", "--done", "--all", "--help"].includes(arg)) {
      flags.set(arg, true);
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return { positional, flags };
}

function dbPath(flags: Map<string, string | true>): string {
  const selected = flags.get("--db");
  if (!selected || selected === true) return DEFAULT_DB;
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

async function loadLessons(): Promise<Lesson[]> {
  const lessons = JSON.parse(await Deno.readTextFile(LESSONS_FILE)) as Lesson[];
  if (lessons.length !== 100) {
    throw new Error(`seed must contain exactly 100 lessons, found ${lessons.length}`);
  }
  const ordinals = new Set(lessons.map((x) => x.ordinal));
  const slugs = new Set(lessons.map((x) => x.slug));
  if (
    ordinals.size !== 100 || slugs.size !== 100 || !lessons.every((x, i) => x.ordinal === i + 1)
  ) {
    throw new Error("lessons must have unique slugs and consecutive ordinals 1..100");
  }
  for (const lesson of lessons) {
    for (
      const field of [
        lesson.title,
        lesson.overview,
        lesson.syntaxBreakdown,
        lesson.sqlText,
        lesson.systemsLens,
      ]
    ) {
      if (!field?.trim()) throw new Error(`lesson ${lesson.ordinal} has an empty required field`);
    }
    if (lesson.prerequisites.some((p) => p >= lesson.ordinal || !ordinals.has(p))) {
      throw new Error(`lesson ${lesson.ordinal} has an invalid prerequisite`);
    }
  }
  return lessons;
}

function migrate(db: DatabaseSync): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(MIGRATION);
    db.prepare("INSERT OR IGNORE INTO schema_migrations(version,name) VALUES(1,'initial')").run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function seed(db: DatabaseSync): Promise<number> {
  const lessons = await loadLessons();
  const upsert = db.prepare(`
    INSERT INTO lessons(id,ordinal,slug,title,category,difficulty,overview,syntax_breakdown,sql_text,
      expected_result,systems_lens,caution,safety_level,command_kind,min_pg_version,estimated_minutes,revision)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET ordinal=excluded.ordinal,slug=excluded.slug,title=excluded.title,
      category=excluded.category,difficulty=excluded.difficulty,overview=excluded.overview,
      syntax_breakdown=excluded.syntax_breakdown,sql_text=excluded.sql_text,
      expected_result=excluded.expected_result,systems_lens=excluded.systems_lens,caution=excluded.caution,
      safety_level=excluded.safety_level,command_kind=excluded.command_kind,
      min_pg_version=excluded.min_pg_version,estimated_minutes=excluded.estimated_minutes,
      revision=excluded.revision,active=1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
  const prerequisite = db.prepare(
    "INSERT INTO lesson_prerequisites(lesson_id,prerequisite_id) VALUES(?,?)",
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const x of lessons) {
      upsert.run(
        x.ordinal,
        x.ordinal,
        x.slug,
        x.title,
        x.category,
        x.difficulty,
        x.overview,
        x.syntaxBreakdown,
        x.sqlText,
        x.expectedResult,
        x.systemsLens,
        x.caution ?? "",
        x.safetyLevel,
        x.commandKind,
        x.minPgVersion,
        x.estimatedMinutes,
        x.revision,
      );
    }
    db.exec("DELETE FROM lesson_prerequisites");
    for (const x of lessons) for (const p of x.prerequisites) prerequisite.run(x.ordinal, p);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return lessons.length;
}

function getLesson(db: DatabaseSync, ordinal: number): Row | undefined {
  return db.prepare(`${LESSON_SELECT} WHERE l.ordinal=? AND l.active=1`).get(ordinal) as
    | Row
    | undefined;
}

function requireOrdinal(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error("lesson number must be a positive integer");
  }
  return Number(value);
}

function cleanLesson(row: Row): Row {
  return {
    ordinal: row.ordinal,
    slug: row.slug,
    title: row.title,
    category: row.category,
    difficulty: row.difficulty,
    status: row.stale ? "stale" : row.status,
    overview: row.overview,
    syntaxBreakdown: row.syntax_breakdown,
    sql: row.sql_text,
    expectedResult: row.expected_result,
    systemsLens: row.systems_lens,
    caution: row.caution || undefined,
    safetyLevel: row.safety_level,
    commandKind: row.command_kind,
    minPgVersion: row.min_pg_version,
    estimatedMinutes: row.estimated_minutes,
  };
}

function renderLesson(row: Row): string {
  const x = cleanLesson(row);
  const caution = x.caution ? `\nCaution: ${x.caution}` : "";
  return `Overview: ${x.overview}\nSyntax breakdown: ${x.syntaxBreakdown}\nLesson ID: ${x.ordinal}${caution}\nSql:\n${x.sql}`;
}

function ensureReady(db: DatabaseSync): void {
  try {
    db.prepare("SELECT 1 FROM lessons LIMIT 1").get();
  } catch {
    throw new Error("database is not initialized; run 'pgtutor init'");
  }
}

function outputLesson(row: Row, json: boolean, io: Output): void {
  io.log(json ? JSON.stringify(cleanLesson(row), null, 2) : renderLesson(row));
}

export async function run(args: string[], io: Output = console): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    io.error(`Error: ${(error as Error).message}\n\n${usage()}`);
    return 2;
  }
  const [command, ...rest] = parsed.positional;
  if (!command || parsed.flags.has("--help") || command === "help") {
    io.log(usage());
    return 0;
  }
  const path = dbPath(parsed.flags);
  let db: DatabaseSync | undefined;
  try {
    db = openDb(path);
    if (command === "init" || command === "seed") {
      migrate(db);
      const count = await seed(db);
      io.log(`Initialized ${count} lessons in ${path}`);
      return 0;
    }
    ensureReady(db);
    const json = parsed.flags.has("--json");
    if (command === "next" || (command === "pretty" && rest.length === 0)) {
      const row = db.prepare(`${LESSON_SELECT}
        WHERE l.active=1 AND (p.lesson_id IS NULL OR p.status='todo'
          OR (p.status='done' AND p.completed_revision<>l.revision))
        ORDER BY l.ordinal LIMIT 1`).get() as Row | undefined;
      if (!row) {
        io.log(json ? JSON.stringify({ complete: true }) : "All active lessons are complete.");
      } else outputLesson(row, command === "pretty" ? false : json, io);
      return 0;
    }
    if (command === "show" || command === "pretty") {
      const ordinal = requireOrdinal(rest[0]);
      const row = getLesson(db, ordinal);
      if (!row) throw new RangeError(`lesson ${ordinal} not found`);
      outputLesson(row, command === "pretty" ? false : json, io);
      return 0;
    }
    if (["done", "undone", "skip"].includes(command)) {
      const ordinal = requireOrdinal(rest[0]);
      const lesson = getLesson(db, ordinal);
      if (!lesson) throw new RangeError(`lesson ${ordinal} not found`);
      if (command === "undone") {
        db.prepare("DELETE FROM progress WHERE lesson_id=?").run(lesson.id as number);
        io.log(`Command ${ordinal} marked todo.`);
      } else {
        const status = command === "done" ? "done" : "skipped";
        const revision = status === "done" ? lesson.revision as number : null;
        const completed = status === "done" ? new Date().toISOString() : null;
        const note = parsed.flags.get("--note");
        db.prepare(`INSERT INTO progress(lesson_id,status,completed_revision,completed_at,notes)
          VALUES(?,?,?,?,?) ON CONFLICT(lesson_id) DO UPDATE SET status=excluded.status,
          completed_revision=excluded.completed_revision,completed_at=excluded.completed_at,
          notes=CASE WHEN excluded.notes='' THEN progress.notes ELSE excluded.notes END,
          updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(
          lesson.id as number,
          status,
          revision,
          completed,
          typeof note === "string" ? note : "",
        );
        db.prepare("INSERT INTO attempts(lesson_id,outcome,lesson_revision,notes) VALUES(?,?,?,?)")
          .run(
            lesson.id as number,
            "manual",
            lesson.revision as number,
            typeof note === "string" ? note : "",
          );
        io.log(`Command ${ordinal} marked ${status}.`);
      }
      return 0;
    }
    if (command === "note") {
      const ordinal = requireOrdinal(rest[0]);
      const note = rest.slice(1).join(" ").trim();
      if (!note) throw new Error("note text is required");
      const lesson = getLesson(db, ordinal);
      if (!lesson) throw new RangeError(`lesson ${ordinal} not found`);
      db.prepare(`INSERT INTO progress(lesson_id,status,notes) VALUES(?,'todo',?)
        ON CONFLICT(lesson_id) DO UPDATE SET notes=excluded.notes,
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(lesson.id as number, note);
      io.log(`Note saved for command ${ordinal}.`);
      return 0;
    }
    if (command === "list") {
      const filters: string[] = ["l.active=1"];
      const values: (string | number)[] = [];
      if (parsed.flags.has("--done")) {
        filters.push("p.status='done' AND p.completed_revision=l.revision");
      } else if (parsed.flags.has("--todo")) {
        filters.push(
          "(p.lesson_id IS NULL OR p.status<>'done' OR p.completed_revision<>l.revision)",
        );
      }
      const category = parsed.flags.get("--category");
      if (typeof category === "string") {
        filters.push("l.category=?");
        values.push(category);
      }
      const limitRaw = parsed.flags.get("--limit");
      const limit = typeof limitRaw === "string" ? requireOrdinal(limitRaw) : 100;
      values.push(limit);
      const rows = db.prepare(
        `${LESSON_SELECT} WHERE ${filters.join(" AND ")} ORDER BY l.ordinal LIMIT ?`,
      ).all(...values) as Row[];
      if (json) io.log(JSON.stringify(rows.map(cleanLesson), null, 2));
      else {io.log(
          rows.map((x) =>
            `${String(x.ordinal).padStart(3)}  ${
              x.stale ? "stale" : x.status
            }  [${x.category}] ${x.title}`
          ).join("\n") || "No lessons found.",
        );}
      return 0;
    }
    if (command === "status") {
      const row = db.prepare(`SELECT count(*) total,
        count(*) FILTER (WHERE p.status='done' AND p.completed_revision=l.revision) done,
        count(*) FILTER (WHERE p.status='skipped') skipped,
        count(*) FILTER (WHERE p.status='done' AND p.completed_revision<>l.revision) stale
        FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id WHERE l.active=1`).get() as Row;
      const status = {
        total: row.total,
        done: row.done,
        todo: Number(row.total) - Number(row.done),
        skipped: row.skipped,
        stale: row.stale,
      };
      io.log(
        json
          ? JSON.stringify(status, null, 2)
          : `Progress: ${status.done}/${status.total} done; ${status.todo} remaining; ${status.skipped} skipped; ${status.stale} stale.`,
      );
      return 0;
    }
    if (command === "search") {
      const term = rest.join(" ").trim();
      if (!term) throw new Error("search text is required");
      const pattern = `%${term}%`;
      const rows = db.prepare(`${LESSON_SELECT} WHERE l.active=1 AND
        (l.title LIKE ? OR l.overview LIKE ? OR l.systems_lens LIKE ? OR l.sql_text LIKE ?)
        ORDER BY l.ordinal`).all(pattern, pattern, pattern, pattern) as Row[];
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
