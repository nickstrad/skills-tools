/** One hands-on lesson in a course. Field names are tool-agnostic. */
export type Lesson = {
  ordinal: number;
  slug: string;
  title: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  /** Kebab-case topic labels (book chapters, systems concepts) used by `--topic` and `topics`. */
  tags: string[];
  prerequisites: number[];
  /**
   * One-line citation of where the course's canonical book covers this lesson (chapter number,
   * title, section), printed with the metadata. Say plainly when it is not covered (optional).
   */
  reading?: string;
  /**
   * How the experiment overlaps with the cited chapter: what the chapter explains that the lesson
   * shows live, and where the lesson goes beyond or differs from it (optional; omit when the book
   * does not cover the lesson).
   */
  readingNotes?: string;
  /** What you are about to observe and why it matters. */
  overview: string;
  /**
   * The learning template for the lesson, in Markdown, written for a reader who knows basic SQL
   * but not the tool's internals: "### In plain terms", "### What you are learning", and
   * "### Piece by piece" (every command, flag, function, view, setting, or clause: what it is,
   * what it does here, what it gives us). See docs/AUTHORING.md.
   */
  syntaxBreakdown: string;
  /** Idempotent preparation to run before the experiment (optional). */
  setup?: string;
  /** The experiment itself: what to run, in order, annotated with -- Session A / B for multi-session steps. */
  code: string;
  /** What you should see, concretely, so you can tell success from failure. */
  expectedResult: string;
  /** The systems / distributed-systems idea this experiment makes concrete. */
  systemsLens: string;
  /** A follow-up experiment or prediction to make on your own (optional). */
  challenge?: string;
  caution?: string;
  safetyLevel:
    | "read-only"
    | "writes-data"
    | "ddl"
    | "locking"
    | "privileged"
    | "dangerous";
  /** Where the code runs: inside the course tool (psql, duckdb, sqlite3...), a shell, or both. */
  runIn: "tool" | "shell" | "mixed";
  /** How many concurrent tool sessions (terminals) the experiment needs. */
  sessions: number;
  /** Minimum tool version the lesson was written for, as a version string. */
  minVersion: string;
  estimatedMinutes: number;
  /** Bump when the lesson changes materially; completed lessons become stale and are re-served. */
  revision: number;
};

/** Course metadata stored in courses/<id>/course.json. */
export type Course = {
  id: string;
  name: string;
  description: string;
  /** Name of the interactive tool lessons run in (psql, duckdb, sqlite3...). */
  tool: string;
  /** Minimum tool version lessons assume unless they set their own. */
  minVersion: string;
  /** Curriculum-wide revision; the build applies it to lessons that do not set their own. */
  revision: number;
};

/** Lesson draft used in curriculum source: ordinals are assigned by the build, prerequisites are slugs. */
export type Draft =
  & Omit<
    Lesson,
    | "ordinal"
    | "prerequisites"
    | "revision"
    | "sessions"
    | "minVersion"
    | "category"
    | "tags"
  >
  & {
    prerequisites?: string[];
    tags?: string[];
    sessions?: number;
    minVersion?: string;
    revision?: number;
  };

export type Module = { category: string; title: string; lessons: Draft[] };

/** Raw template tag so backslash commands and shell text survive verbatim. */
export const code = String.raw;

export const DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);
export const SAFETY = new Set([
  "read-only",
  "writes-data",
  "ddl",
  "locking",
  "privileged",
  "dangerous",
]);
export const RUN_IN = new Set(["tool", "shell", "mixed"]);

export function validateLessons(lessons: Lesson[]): void {
  if (lessons.length === 0) {
    throw new Error("a course must contain at least one lesson");
  }
  const ordinals = new Set(lessons.map((x) => x.ordinal));
  const slugs = new Set(lessons.map((x) => x.slug));
  if (
    ordinals.size !== lessons.length || slugs.size !== lessons.length ||
    !lessons.every((x, i) => x.ordinal === i + 1)
  ) {
    throw new Error(
      `lessons must have unique slugs and consecutive ordinals 1..${lessons.length}`,
    );
  }
  for (const lesson of lessons) {
    const where = `lesson ${lesson.ordinal} (${lesson.slug})`;
    for (
      const [name, field] of [
        ["title", lesson.title],
        ["overview", lesson.overview],
        ["syntaxBreakdown", lesson.syntaxBreakdown],
        ["code", lesson.code],
        ["expectedResult", lesson.expectedResult],
        ["systemsLens", lesson.systemsLens],
        ["category", lesson.category],
        ["minVersion", lesson.minVersion],
      ] as const
    ) {
      if (typeof field !== "string" || !field.trim()) {
        throw new Error(`${where} has an empty ${name}`);
      }
    }
    if (lesson.reading !== undefined) {
      if (typeof lesson.reading !== "string" || !lesson.reading.trim()) {
        throw new Error(`${where} has an empty reading`);
      }
      if (lesson.reading.includes("\n")) {
        throw new Error(`${where} reading must be one line`);
      }
    }
    if (lesson.readingNotes !== undefined) {
      if (
        typeof lesson.readingNotes !== "string" || !lesson.readingNotes.trim()
      ) {
        throw new Error(`${where} has empty readingNotes`);
      }
      if (!lesson.reading) {
        throw new Error(`${where} has readingNotes without reading`);
      }
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(lesson.slug)) {
      throw new Error(`${where} has a bad slug`);
    }
    const tags = lesson.tags ?? [];
    if (
      !Array.isArray(tags) ||
      tags.some((t) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t))
    ) {
      throw new Error(`${where} has a bad tag (use kebab-case)`);
    }
    if (new Set(tags).size !== tags.length) {
      throw new Error(`${where} repeats a tag`);
    }
    if (!DIFFICULTIES.has(lesson.difficulty)) {
      throw new Error(`${where} has a bad difficulty`);
    }
    if (!SAFETY.has(lesson.safetyLevel)) {
      throw new Error(`${where} has a bad safetyLevel`);
    }
    if (!RUN_IN.has(lesson.runIn)) throw new Error(`${where} has a bad runIn`);
    if (
      !Number.isInteger(lesson.sessions) || lesson.sessions < 1 ||
      lesson.sessions > 4
    ) {
      throw new Error(`${where} has a bad sessions count`);
    }
    if (
      !Number.isInteger(lesson.estimatedMinutes) || lesson.estimatedMinutes < 1
    ) {
      throw new Error(`${where} has a bad estimatedMinutes`);
    }
    if (!Number.isInteger(lesson.revision) || lesson.revision < 1) {
      throw new Error(`${where} has a bad revision`);
    }
    if (new Set(lesson.prerequisites).size !== lesson.prerequisites.length) {
      throw new Error(`${where} repeats a prerequisite`);
    }
    if (
      lesson.prerequisites.some((p) => p >= lesson.ordinal || !ordinals.has(p))
    ) {
      throw new Error(`${where} has an invalid prerequisite`);
    }
  }
}

/** Strip one leading newline and trailing whitespace so templates can start on their own line. */
export function trim(text: string): string {
  return text.replace(/^\n/, "").replace(/\s+$/, "");
}

export function buildLessons(course: Course, modules: Module[]): Lesson[] {
  const drafts: (Draft & { category: string })[] = [];
  for (const m of modules) {
    for (const d of m.lessons) drafts.push({ ...d, category: m.category });
  }
  const ordinalBySlug = new Map<string, number>();
  drafts.forEach((d, i) => {
    if (ordinalBySlug.has(d.slug)) throw new Error(`duplicate slug ${d.slug}`);
    ordinalBySlug.set(d.slug, i + 1);
  });
  const lessons = drafts.map((d, i): Lesson => {
    const prerequisites = (d.prerequisites ?? []).map((slug) => {
      const ordinal = ordinalBySlug.get(slug);
      if (!ordinal) {
        throw new Error(`lesson ${d.slug} requires unknown lesson ${slug}`);
      }
      if (ordinal >= i + 1) {
        throw new Error(`lesson ${d.slug} requires later lesson ${slug}`);
      }
      return ordinal;
    });
    return {
      ordinal: i + 1,
      slug: d.slug,
      title: d.title,
      category: d.category,
      difficulty: d.difficulty,
      tags: d.tags ?? [],
      prerequisites,
      ...(d.reading ? { reading: trim(d.reading) } : {}),
      ...(d.readingNotes ? { readingNotes: trim(d.readingNotes) } : {}),
      overview: trim(d.overview),
      syntaxBreakdown: trim(d.syntaxBreakdown),
      ...(d.setup ? { setup: trim(d.setup) } : {}),
      code: trim(d.code),
      expectedResult: trim(d.expectedResult),
      systemsLens: trim(d.systemsLens),
      ...(d.challenge ? { challenge: trim(d.challenge) } : {}),
      ...(d.caution ? { caution: trim(d.caution) } : {}),
      safetyLevel: d.safetyLevel,
      runIn: d.runIn,
      sessions: d.sessions ?? 1,
      minVersion: d.minVersion ?? course.minVersion,
      estimatedMinutes: d.estimatedMinutes,
      revision: d.revision ?? course.revision,
    };
  });
  validateLessons(lessons);
  return lessons;
}
