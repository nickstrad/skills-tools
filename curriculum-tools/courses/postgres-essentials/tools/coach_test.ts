import { run as runTutor } from "../../../src/main.ts";
import type { Lesson } from "../../../src/types.ts";
import { ROUTE } from "../route.ts";
import { render, runEssentials } from "./coach.ts";

const catalog: Lesson[] = JSON.parse(
  await Deno.readTextFile(new URL("../lessons.json", import.meta.url)),
);
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function capture() {
  const out: string[] = [], err: string[] = [];
  return { out, err, io: { log: (s: string) => out.push(s), error: (s: string) => err.push(s) } };
}

Deno.test("fixed 40-lesson route starts with the available actual lessons and complete commands", () => {
  assert(
    ROUTE.length === 40 && catalog.length >= 3 && catalog.length <= 6,
    "route or authored batch drifted",
  );
  assert(new Set(ROUTE.map((l) => l.slug)).size === 40, "duplicate route identity");
  for (const [i, lesson] of catalog.entries()) {
    assert(
      ROUTE[i].slug === lesson.slug && ROUTE[i].title === lesson.title,
      "lesson does not match route",
    );
    assert(
      lesson.estimatedMinutes >= 20 && lesson.estimatedMinutes <= 30,
      "timing outside chosen scope",
    );
    const shown = render(lesson, "lesson", "/tmp/a learner's progress.sqlite");
    const blocks = [...shown.matchAll(/```sql\n([\s\S]*?)\n```/g)].map((m) => m[1]);
    assert(
      blocks.length > 2 && blocks[0] === lesson.setup &&
        blocks.slice(1).join("\n\n") === lesson.code,
      "render changed SQL/session blocks",
    );
    assert(
      shown.includes(
        lesson.sessions === 1 ? "Open one experiment terminal" : "Open two experiment terminals",
      ),
      "terminal instructions disagree with session count",
    );
    assert(shown.indexOf("```text") < shown.indexOf("## Setup"), "visual introduced too late");
    assert(
      shown.indexOf("### In plain terms") < shown.indexOf("## Setup"),
      "concepts introduced too late",
    );
    const review = render(lesson, "review");
    assert(
      review.includes(lesson.expectedResult) && review.includes(lesson.systemsLens),
      "review lost evidence",
    );
    assert(!review.includes(lesson.setup!), "review repeats setup");
    assert(!shown.includes("Core reading"), "unbudgeted reading introduced");
  }
});

Deno.test("selection, completion and batch boundary use only essentials progress", async () => {
  const dir = await Deno.makeTempDir({ prefix: "pg-essentials-coach-test-" });
  const db = dir + "/a learner's progress.sqlite";
  const call = async (args: string[]) => {
    const c = capture();
    const code = await runEssentials([...args, "--db", db], c.io);
    assert(code === 0, c.err.join("\n"));
    return c.out.join("\n");
  };
  try {
    assert(
      await runTutor(["postgres-essentials", "init", "--db", db], capture().io) === 0,
      "init failed",
    );
    const before = await Deno.readFile(db);
    assert((await call([])).includes("Essentials 1/40"), "default selected wrong route");
    assert(await call(["1", "start"]) === await call(["1", "lesson"]), "start alias changed");
    for (let n = 1; n <= catalog.length; n++) {
      for (const stage of ["lesson", "review", "full"]) {
        const text = await call([String(n), stage]);
        assert(text.includes("--db '/tmp/"), "footer lost copied progress argument");
      }
    }
    assert(
      (await call([String(catalog.length + 1), "lesson"])).includes("planned, not yet available"),
      "pending lesson served",
    );
    const after = await Deno.readFile(db);
    assert(
      before.length === after.length && before.every((b, i) => b === after[i]),
      "view wrote progress",
    );
    for (
      const args of [["done"], [String(catalog.length + 1), "done"], ["41", "lesson"], [
        "1",
        "--topic",
        "mvcc",
      ]]
    ) {
      assert(
        await runEssentials([...args, "--db", db], capture().io) !== 0,
        "invalid input accepted",
      );
    }
    for (let n = 1; n <= catalog.length; n++) await call([String(n), "done"]);
    assert(
      (await call([])).includes(`remaining ${40 - catalog.length} are planned`),
      "batch incorrectly completed the whole course",
    );
    assert(
      (await call([])).includes(`Before we prepare lesson ${catalog.length + 1}`),
      "feedback boundary missing",
    );
    assert(
      (await call(["--topic", "nonexistent"])).includes("No available lesson"),
      "topic miss broken",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("installed launcher opens essentials and explicitly preserves reference access", async () => {
  const dir = await Deno.makeTempDir({ prefix: "pg-essentials-launcher-test-" });
  const db = dir + "/progress.sqlite";
  const launcher = new URL("../../postgres/bin/pgcoach", import.meta.url).pathname;
  try {
    await runTutor(["postgres-essentials", "init", "--db", db], capture().io);
    const result = await new Deno.Command(launcher, { args: ["1", "lesson", "--db", db] }).output();
    assert(
      result.success && new TextDecoder().decode(result.stdout).includes("Essentials 1/40"),
      "launcher did not switch",
    );
    const reference = dir + "/reference.sqlite";
    await runTutor(["postgres", "init", "--db", reference], capture().io);
    const old = await new Deno.Command(launcher, {
      args: ["--reference", "1", "full", "--db", reference],
    }).output();
    assert(
      old.success &&
        new TextDecoder().decode(old.stdout).includes("Build a disposable lab cluster"),
      "reference access lost",
    );
    const oldPilot = await new Deno.Command(launcher, {
      args: ["--reference", "9", "lesson", "--db", reference],
    }).output();
    assert(
      oldPilot.success &&
        new TextDecoder().decode(oldPilot.stdout).includes("pgcoach --reference 9 review"),
      "reference footer switches back to essentials",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
