import { createHash } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";

/** The columns retired by the course-reading removal. These names are migration-only. */
export const LEGACY_READING_COLUMNS = [
  "reading",
  "reading_notes",
  "study_checkpoint",
] as const;

type LegacyColumn = (typeof LEGACY_READING_COLUMNS)[number];
type Row = Record<string, unknown>;

export type LegacyArchive = {
  format: 1;
  kind: "sqlite-legacy-reading";
  course: string;
  databaseKey: string;
  legacyColumns: LegacyColumn[];
  lessons: Record<string, Record<string, unknown>>;
};

function columnNames(db: DatabaseSync): Set<string> {
  return new Set(
    (db.prepare("PRAGMA table_info(lessons)").all() as Row[]).map((row) => String(row.name)),
  );
}

/** Return a stable, non-sensitive archive key for a database path. */
export function databaseKey(path: string): string {
  const absolute = resolve(path);
  const digest = createHash("sha256").update(absolute).digest("hex").slice(0, 16);
  const name = basename(absolute).replace(/[^a-zA-Z0-9._-]+/g, "_") || "progress.sqlite";
  return `${name}-${digest}`;
}

export function databaseArchivePath(root: string, course: string, path: string): string {
  return resolve(root, "databases", course, `${databaseKey(path)}.json`);
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

/**
 * Export all rows, including inactive history, before the legacy columns are dropped.
 * The file is written atomically and an existing differing export is rejected.
 */
export function exportLegacyReading(
  db: DatabaseSync,
  course: string,
  dbPath: string,
  archiveRoot: string,
): { path: string; rows: number; columns: LegacyColumn[] } | undefined {
  const present = columnNames(db);
  const legacyColumns = LEGACY_READING_COLUMNS.filter((name) => present.has(name));
  if (!legacyColumns.length) return undefined;

  const select = ["id", "ordinal", "slug", ...legacyColumns].join(",");
  const rows = db.prepare(`SELECT ${select} FROM lessons ORDER BY id`).all() as Row[];
  const lessons: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    const slug = String(row.slug);
    const record: Record<string, unknown> = {
      id: row.id,
      ordinal: row.ordinal,
      slug,
    };
    for (const name of legacyColumns) record[name] = row[name];
    if (lessons[slug]) throw new Error(`duplicate lesson slug in legacy database: ${slug}`);
    lessons[slug] = record;
  }

  const archive: LegacyArchive = {
    format: 1,
    kind: "sqlite-legacy-reading",
    course,
    databaseKey: databaseKey(dbPath),
    legacyColumns: [...legacyColumns],
    lessons,
  };
  const path = databaseArchivePath(archiveRoot, course, dbPath);
  const serialized = json(archive);
  Deno.mkdirSync(dirname(path), { recursive: true });
  try {
    const existing = Deno.readTextFileSync(path);
    if (existing !== serialized) {
      throw new Error(`refusing to replace differing legacy archive: ${path}`);
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
    const temporary = `${path}.tmp-${crypto.randomUUID()}`;
    try {
      Deno.writeTextFileSync(temporary, serialized, { createNew: true });
      Deno.renameSync(temporary, path);
    } finally {
      try {
        Deno.removeSync(temporary);
      } catch {
        // The atomic rename already removed the temporary path.
      }
    }
  }
  return { path, rows: rows.length, columns: [...legacyColumns] };
}

/** Drop only the retired columns. SQLite performs this as part of the caller's transaction. */
export function dropLegacyReadingColumns(db: DatabaseSync): LegacyColumn[] {
  const present = columnNames(db);
  const dropped: LegacyColumn[] = [];
  for (const name of LEGACY_READING_COLUMNS) {
    if (!present.has(name)) continue;
    db.exec(`ALTER TABLE lessons DROP COLUMN ${name}`);
    dropped.push(name);
  }
  return dropped;
}

/**
 * Restore archived values into a copied database for an audit or recovery check.
 * This is intentionally explicit: ordinary initialization never recreates retired columns.
 */
export function restoreLegacyReading(db: DatabaseSync, archive: LegacyArchive): void {
  validateLegacyArchive(archive);
  const present = columnNames(db);
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const name of archive.legacyColumns) {
      if (!present.has(name)) {
        db.exec(`ALTER TABLE lessons ADD COLUMN ${name} TEXT NOT NULL DEFAULT ''`);
        present.add(name);
      }
    }
    const updates = archive.legacyColumns.map((name) => `${name}=?`).join(",");
    const update = db.prepare(`UPDATE lessons SET ${updates} WHERE id=? AND slug=?`);
    for (const record of Object.values(archive.lessons)) {
      update.run(
        ...archive.legacyColumns.map((name) => sqlValue(record[name])),
        sqlValue(record.id),
        sqlValue(record.slug),
      );
      if (db.prepare("SELECT changes() AS n").get()!.n !== 1) {
        throw new Error(`cannot restore missing lesson identity: ${record.slug}`);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function readLegacyArchive(path: string): LegacyArchive {
  const archive = JSON.parse(Deno.readTextFileSync(path)) as LegacyArchive;
  try {
    validateLegacyArchive(archive);
  } catch (error) {
    throw new Error("invalid legacy archive: " + path + ": " + (error as Error).message);
  }
  return archive;
}

function sqlValue(value: unknown): string | number | bigint | null | Uint8Array {
  if (
    value === null || typeof value === "string" || typeof value === "number" ||
    typeof value === "bigint" || value instanceof Uint8Array
  ) {
    return value;
  }
  return String(value);
}

function validateLegacyArchive(archive: LegacyArchive): void {
  if (
    !archive || archive.format !== 1 || archive.kind !== "sqlite-legacy-reading" ||
    !Array.isArray(archive.legacyColumns) || archive.legacyColumns.length === 0 ||
    !archive.lessons || typeof archive.lessons !== "object"
  ) {
    throw new Error("invalid archive envelope");
  }
  const valid = new Set<string>(LEGACY_READING_COLUMNS);
  const columns = archive.legacyColumns as string[];
  if (new Set(columns).size !== columns.length || columns.some((name) => !valid.has(name))) {
    throw new Error("invalid legacy column list");
  }
  for (const [slug, record] of Object.entries(archive.lessons)) {
    if (
      !record || typeof record !== "object" || record.slug !== slug ||
      !Number.isInteger(record.id) || !Number.isInteger(record.ordinal)
    ) {
      throw new Error("invalid lesson identity: " + slug);
    }
    for (const name of columns) {
      if (!(name in record)) throw new Error("missing " + name + ": " + slug);
    }
  }
}
