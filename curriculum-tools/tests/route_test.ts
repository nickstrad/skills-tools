import { DatabaseSync } from "node:sqlite";
import { listCourses, run } from "../src/main.ts";
import { parseRoute } from "../src/route.ts";

function capture() {
  const out: string[] = [], err: string[] = [];
  return { out, err, io: { log: (s: string) => out.push(s), error: (s: string) => err.push(s) } };
}
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

Deno.test("generic routes show done by identity and current revision without writing progress", async () => {
  const dir = await Deno.makeTempDir({ prefix: "shared-route-" });
  try {
    for (const course of await listCourses()) {
      const db = `${dir}/${course.id}.sqlite`;
      assert(await run([course.id, "init", "--db", db], capture().io) === 0, "init failed");
      await run([course.id, "1", "done", "--db", db], capture().io);
      const before = await Deno.readFile(db);
      const result = capture();
      assert(await run([course.id, "route", "--db", db], result.io) === 0, result.err.join("\n"));
      const text = result.out.join("\n");
      assert(text.includes("1. [done]") && !text.includes("2. [done]"), text);
      if (course.id === "postgres-essentials") {
        assert(
          text.includes("40 lessons") && text.includes("40.") && text.includes(" — planned"),
          text,
        );
      }
      const after = await Deno.readFile(db);
      assert(
        before.length === after.length && before.every((b, i) => b === after[i]),
        "route wrote progress",
      );
      const connection = new DatabaseSync(db);
      connection.exec("UPDATE progress SET completed_revision=0 WHERE status='done'");
      connection.close();
      const stale = capture();
      await run([course.id, "route", "--db", db, "--json", "--ansi"], stale.io);
      const first = JSON.parse(stale.out[0]).lessons[0];
      assert(first.stale && !first.done && first.available, "stale completion was carried forward");
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("future and uninitialized routes are visible without allocating a database or course", async () => {
  const dir = await Deno.makeTempDir({ prefix: "planned-route-" });
  try {
    for (const id of ["sqlite-essentials", "postgres-essentials"]) {
      const db = `${dir}/${id}/absent.sqlite`;
      const result = capture();
      assert(
        await run([id, "route", "--db", db, "--json"], result.io) === 0,
        result.err.join("\n"),
      );
      const route = JSON.parse(result.out[0]);
      assert(route.lessons.length === (id === "sqlite-essentials" ? 32 : 40), "route truncated");
      assert(route.lessons.every((l: { done: boolean }) => !l.done), "invented completion");
      if (id === "sqlite-essentials") {
        assert(
          route.lessons.every((l: { available: boolean }) => !l.available),
          "planned lesson available",
        );
        assert(
          await run([id, "1", "done", "--db", db], capture().io) !== 0,
          "completed unauthored lesson",
        );
      }
      let exists = false;
      try {
        await Deno.stat(db);
        exists = true;
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
      assert(!exists, "viewing a route created a database");
    }
    assert(
      await run(["missing-course", "route", "--db", `${dir}/missing.sqlite`], capture().io) !== 0,
      "unknown course accepted",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("Markdown route parsing supports the shared template and refuses ambiguous identities", () => {
  const route = parseRoute(
    "| 1 | A lesson / `a-lesson` | evidence |\n| 2 | **Another lesson** (`another-lesson`) | evidence |",
  );
  assert(
    route.length === 2 && route[0].title === "A lesson" && route[1].title === "Another lesson",
    "title parsing failed",
  );
  for (const text of ["| 2 | A / `a` |", "| 1 | A / `a` |\n| 2 | B / `a` |"]) {
    let failed = false;
    try {
      parseRoute(text);
    } catch {
      failed = true;
    }
    assert(failed, "ambiguous route accepted");
  }
});
