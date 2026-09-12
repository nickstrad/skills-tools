import { DatabaseSync } from "node:sqlite";
import { run as runTutor } from "../../../src/main.ts";
import { normalizeEssentialsArgs, runEssentials } from "./coach.ts";

type Capture = {
  out: string[];
  err: string[];
  io: { log: (s: string) => void; error: (s: string) => void };
};

function capture(): Capture {
  const out: string[] = [], err: string[] = [];
  return { out, err, io: { log: (s) => out.push(s), error: (s) => err.push(s) } };
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const lessons = JSON.parse(
  await Deno.readTextFile(new URL("../lessons.json", import.meta.url)),
) as Array<{
  ordinal: number;
  slug: string;
  setup?: string;
  code: string;
  overview: string;
  syntaxBreakdown: string;
  expectedResult: string;
  systemsLens: string;
  runIn: string;
  sessions: number;
}>;

function learnerOutput(value: string): string {
  return value.replace(
    /(When you consider it complete: `)tutor postgres-essentials(?= [0-9]+ done(?:[ `]|$))/g,
    "$1pgcoach",
  );
}

Deno.test("the thin wrapper preserves all 26 authored lesson context and shared output", async () => {
  const dir = await Deno.makeTempDir({ prefix: "pg-essentials-wrapper-test-" });
  const db = `${dir}/a learner's progress.sqlite`;
  try {
    const initialized = capture();
    assert(
      await runTutor(["postgres-essentials", "init", "--db", db], initialized.io) === 0,
      initialized.err.join("\n"),
    );
    for (const lesson of lessons) {
      assert(lesson.syntaxBreakdown.includes("### Mechanism map"), `${lesson.slug}: map missing`);
      assert(
        lesson.syntaxBreakdown.includes("### Terminals and cleanup"),
        `${lesson.slug}: terminal context missing`,
      );
      const direct = capture();
      const wrapped = capture();
      assert(
        await runTutor([
          "postgres-essentials",
          String(lesson.ordinal),
          "lesson",
          "--db",
          db,
          "--plain",
        ], direct.io) === 0,
        direct.err.join("\n"),
      );
      assert(
        await runEssentials(
          [String(lesson.ordinal), "lesson", "--db", db, "--plain"],
          wrapped.io,
        ) === 0,
        wrapped.err.join("\n"),
      );
      const expected = learnerOutput(direct.out.join("\n"));
      const actual = wrapped.out.join("\n");
      assert(actual === expected, `${lesson.slug}: wrapper diverged from shared lesson output`);
      assert(actual.includes(lesson.overview), `${lesson.slug}: overview lost`);
      assert(actual.includes(lesson.syntaxBreakdown), `${lesson.slug}: syntax context lost`);
      assert(actual.includes(lesson.setup ?? ""), `${lesson.slug}: setup lost`);
      assert(actual.includes(lesson.code), `${lesson.slug}: experiment lost`);
      assert(actual.includes(lesson.expectedResult), `${lesson.slug}: expected result lost`);
      assert(actual.includes(lesson.systemsLens), `${lesson.slug}: systems lens lost`);
      assert(
        actual.indexOf("### Mechanism map") < actual.indexOf("## Setup"),
        `${lesson.slug}: mechanism map comes after setup`,
      );
      if (lesson.runIn === "tool") {
        assert(actual.includes("psql -X -h /tmp -p 5440"), `${lesson.slug}: connection lost`);
      }
      if (lesson.sessions > 1) {
        assert(
          actual.includes("Session A") && actual.includes("Session B"),
          `${lesson.slug}: sessions lost`,
        );
      }
      if (lesson.runIn === "shell") {
        assert(
          !actual.includes("Open one experiment terminal"),
          `${lesson.slug}: shell rendered as psql`,
        );
      }
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("wrapper and shared route use the canonical 40 entry plan", async () => {
  const dir = await Deno.makeTempDir({ prefix: "pg-essentials-route-test-" });
  const db = `${dir}/route.sqlite`;
  try {
    const direct = capture();
    const wrapped = capture();
    assert(
      await runTutor(["postgres-essentials", "route", "--db", db], direct.io) === 0,
      direct.err.join("\n"),
    );
    assert(await runEssentials(["route", "--db", db], wrapped.io) === 0, wrapped.err.join("\n"));
    assert(
      wrapped.out.join("\n") === direct.out.join("\n"),
      "route wrapper diverged from shared route",
    );
    const route = wrapped.out.join("\n");
    assert(route.includes("# PostgreSQL Essentials — 40 lessons"), "route count missing");
    assert(
      route.includes("26. Reconcile committed and aborted work after a crash"),
      "last authored lesson missing",
    );
    assert(
      route.includes("27. Prove a backup can restore the intended data"),
      "planned boundary missing",
    );
    assert(!/^\d+\. \[done\]/m.test(route), "read-only route created progress");
    assert(!await exists(db), "route created a progress database");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("saved stage aliases all select the generic complete lesson", () => {
  assert(
    JSON.stringify(normalizeEssentialsArgs([])) === JSON.stringify(["lesson"]),
    "bare coach no longer selects next lesson",
  );
  assert(
    JSON.stringify(normalizeEssentialsArgs(["--topic", "mvcc"])) ===
      JSON.stringify(["--topic", "mvcc", "lesson"]),
    "topic-only coach no longer selects next lesson",
  );
  assert(
    JSON.stringify(normalizeEssentialsArgs(["--db"])) === JSON.stringify(["--db"]),
    "missing --db value swallowed by default lesson",
  );
  for (const alias of ["start", "review", "run", "full", "syntax"]) {
    assert(
      JSON.stringify(normalizeEssentialsArgs(["7", alias, "--db", "/tmp/a learner.sqlite"])) ===
        JSON.stringify(["7", "lesson", "--db", "/tmp/a learner.sqlite"]),
      `${alias} was not normalized`,
    );
  }
});

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

Deno.test("viewing and invalid commands do not mutate a temporary progress fixture", async () => {
  const dir = await Deno.makeTempDir({ prefix: "pg-essentials-progress-test-" });
  const db = `${dir}/quoted tutor postgres learner.sqlite`;
  try {
    const init = capture();
    assert(
      await runTutor(["postgres-essentials", "init", "--db", db], init.io) === 0,
      init.err.join("\n"),
    );
    const bare = capture();
    assert(await runEssentials(["--db", db, "--plain"], bare.io) === 0, bare.err.join("\n"));
    assert(bare.out.join("\n").includes("# Lesson 1:"), "bare coach did not select next lesson");
    const topic = capture();
    assert(
      await runEssentials(["--topic", "mvcc", "--db", db, "--plain"], topic.io) === 0,
      topic.err.join("\n"),
    );
    assert(
      topic.out.join("\n").includes("# Lesson 1:"),
      "topic-only coach did not select next lesson",
    );
    await runEssentials(["1", "done", "--db", db], capture().io);
    const before = await Deno.readFile(db);
    const output = capture();
    assert(
      await runEssentials(["1", "lesson", "--db", db], output.io) === 0,
      output.err.join("\n"),
    );
    assert(output.out.join("\n").includes("pgcoach 1 done --db '"), "quoted db footer lost");
    assert(
      output.out.join("\n").includes("tutor postgres learner.sqlite"),
      "quoted db path was rewritten",
    );
    const after = await Deno.readFile(db);
    assert(
      before.every((byte, i) => byte === after[i]) && before.length === after.length,
      "lesson view mutated progress",
    );
    const malformed = capture();
    assert(await runEssentials(["--db"], malformed.io) !== 0, "missing --db value accepted");
    assert(
      malformed.err.join("\n").includes("requires a value"),
      "missing --db became the default lesson",
    );
    for (const args of [["done"], ["27", "done"], ["41", "lesson"], ["1", "--topic", "mvcc"]]) {
      assert(
        await runEssentials([...args, "--db", db], capture().io) !== 0,
        `invalid input accepted: ${args.join(" ")}`,
      );
    }
    const sqlite = new DatabaseSync(db, { readOnly: true });
    try {
      assert(
        Number(sqlite.prepare("SELECT count(*) n FROM progress WHERE status='done'").get()?.n) ===
          1,
        "invalid input changed progress",
      );
    } finally {
      sqlite.close();
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("route marks a stale completion for the current revision", async () => {
  const dir = await Deno.makeTempDir({ prefix: "pg-essentials-stale-route-test-" });
  const db = `${dir}/progress.sqlite`;
  try {
    const init = capture();
    assert(
      await runTutor(["postgres-essentials", "init", "--db", db], init.io) === 0,
      init.err.join("\n"),
    );
    const done = capture();
    assert(
      await runTutor(["postgres-essentials", "1", "done", "--db", db], done.io) === 0,
      done.err.join("\n"),
    );
    const sqlite = new DatabaseSync(db);
    try {
      sqlite.prepare("UPDATE progress SET completed_revision=0 WHERE lesson_id=1").run();
    } finally {
      sqlite.close();
    }
    const route = capture();
    assert(await runEssentials(["route", "--db", db], route.io) === 0, route.err.join("\n"));
    assert(
      /^1\. \[revisit\]/m.test(route.out.join("\n")),
      "stale completion was not marked revisit",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
