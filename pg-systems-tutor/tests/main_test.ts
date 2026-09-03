import { DatabaseSync } from "node:sqlite";
import { run } from "../src/main.ts";

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: { log: (x: string) => stdout.push(x), error: (x: string) => stderr.push(x) },
  };
}

Deno.test("init seeds 100 lessons and is idempotent", async () => {
  const dir = await Deno.makeTempDir();
  const path = `${dir}/course.sqlite`;
  try {
    const first = capture();
    if (await run(["init", "--db", path], first.io) !== 0) throw new Error(first.stderr.join("\n"));
    const second = capture();
    if (await run(["init", "--db", path], second.io) !== 0) {
      throw new Error(second.stderr.join("\n"));
    }
    const db = new DatabaseSync(path);
    const row = db.prepare(
      "SELECT count(*) AS count, min(ordinal) AS first, max(ordinal) AS last FROM lessons",
    ).get() as Record<string, number>;
    db.close();
    if (row.count !== 100 || row.first !== 1 || row.last !== 100) {
      throw new Error(JSON.stringify(row));
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("show, done, next, undone, and status preserve explicit progress", async () => {
  const dir = await Deno.makeTempDir();
  const path = `${dir}/course.sqlite`;
  try {
    await run(["init", "--db", path], capture().io);
    const shown = capture();
    if (await run(["show", "20", "--db", path, "--json"], shown.io) !== 0) {
      throw new Error(shown.stderr[0]);
    }
    const lesson = JSON.parse(shown.stdout[0]);
    if (lesson.ordinal !== 20 || !lesson.overview || !lesson.syntaxBreakdown || !lesson.sql) {
      throw new Error(shown.stdout[0]);
    }

    await run(["done", "1", "--db", path], capture().io);
    const next = capture();
    await run(["next", "--db", path, "--json"], next.io);
    if (JSON.parse(next.stdout[0]).ordinal !== 2) throw new Error(next.stdout[0]);

    await run(["undone", "1", "--db", path], capture().io);
    const again = capture();
    await run(["next", "--db", path, "--json"], again.io);
    if (JSON.parse(again.stdout[0]).ordinal !== 1) throw new Error(again.stdout[0]);

    const status = capture();
    await run(["status", "--db", path, "--json"], status.io);
    if (JSON.parse(status.stdout[0]).done !== 0) throw new Error(status.stdout[0]);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("pretty prints a deterministic lesson ID for a selected or next lesson", async () => {
  const dir = await Deno.makeTempDir();
  const path = `${dir}/course.sqlite`;
  try {
    await run(["init", "--db", path], capture().io);

    const selected = capture();
    if (await run(["pretty", "20", "--db", path], selected.io) !== 0) {
      throw new Error(selected.stderr[0]);
    }
    if (
      !selected.stdout[0].includes("Syntax breakdown:") ||
      !selected.stdout[0].includes("\nLesson ID: 20\n")
    ) {
      throw new Error(selected.stdout[0]);
    }

    await run(["done", "1", "--db", path], capture().io);
    const next = capture();
    if (await run(["pretty", "--db", path], next.io) !== 0) {
      throw new Error(next.stderr[0]);
    }
    if (!next.stdout[0].includes("\nLesson ID: 2\n")) throw new Error(next.stdout[0]);

    const shown = capture();
    await run(["show", "7", "--db", path], shown.io);
    if (!shown.stdout[0].includes("\nLesson ID: 7\n")) throw new Error(shown.stdout[0]);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
