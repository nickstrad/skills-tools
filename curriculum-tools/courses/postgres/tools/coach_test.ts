import { run as runTutor } from "../../../src/main.ts";
import { renderStage, runCoach, type SelectedLesson, shellQuote } from "./coach.ts";
import type { Guide } from "../guides/types.ts";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { log: (value: string) => out.push(value), error: (value: string) => err.push(value) },
  };
}

const fixture: SelectedLesson = {
  ordinal: 8,
  slug: "fixture-storage",
  title: "Fixture storage lesson",
  sessions: 2,
  runIn: "tool",
  safetyLevel: "locking",
  minVersion: "16",
  caution: "Do this only in the disposable lab.",
  setup: "create table fixture(id integer primary key);",
  code: "-- Session A\nselect 1;\n-- Session B\nselect 2;",
  syntaxBreakdown: "### In plain terms\n\nFixture syntax.",
  expectedResult: "EXPECTED SECRET",
  systemsLens: "SYSTEMS SECRET",
  reading: "Fixture book, section 8",
  readingNotes: "Fixture reference context.",
  studyCheckpoint: {
    core: [{ source: "Core source", locator: "Section 1" }],
    optionalDepth: [{ source: "Depth source", locator: "Appendix A" }],
    rationale: "The fixture makes a bounded checkpoint visible.",
  },
};
const guide: Guide = {
  brief: "Brief without the answer.",
  predict: "Predict which session gets the result first.",
  inspect: "Inspect the two output rows.",
  explain: "Explain the causal chain before revealing the answer.",
  vary: "Vary one input; ask for a supplied hint if needed.",
  apply: "Choose a workload policy from the observation.",
  hints: ["Name the held resource.", "Run the supplied variation command."],
};

Deno.test("coaching stages withhold solutions until reveal and preserve runnable material", () => {
  const start = renderStage(fixture, "start", guide);
  const inspect = renderStage(fixture, "inspect", guide);
  const run = renderStage(fixture, "run", guide);
  const reveal = renderStage(fixture, "reveal", guide);
  if (
    start.includes("EXPECTED SECRET") || start.includes("SYSTEMS SECRET") ||
    start.includes("select 1")
  ) {
    throw new Error(start);
  }
  if (inspect.includes("EXPECTED SECRET") || inspect.includes("SYSTEMS SECRET")) {
    throw new Error(inspect);
  }
  for (const text of [fixture.setup!, fixture.code, fixture.syntaxBreakdown]) {
    if (!run.includes(text)) throw new Error("run stage dropped supplied lesson material");
  }
  for (const text of [fixture.caution!, fixture.minVersion, "Open 2 psql sessions"]) {
    if (!run.includes(text)) throw new Error("run stage dropped safety guidance: " + text);
  }
  for (const text of ["EXPECTED SECRET", "SYSTEMS SECRET", "Core source", "Depth source"]) {
    if (!reveal.includes(text)) throw new Error("reveal stage dropped " + text);
  }
});

Deno.test("run guidance identifies shell and mixed commands without dropping caution", () => {
  for (const runIn of ["shell", "mixed"] as const) {
    const rendered = renderStage({ ...fixture, runIn, sessions: 1 }, "run", guide);
    const expected = runIn === "shell" ? "Run this in a shell." : "both psql and a shell";
    if (!rendered.includes(expected) || !rendered.includes(fixture.caution!)) {
      throw new Error("incorrect environment or missing caution for " + runIn);
    }
  }
});

Deno.test("pgcoach quotes a database argument containing spaces and apostrophes", async () => {
  const value = "/tmp/a learner's progress.sqlite";
  const command = "printf '%s' " + shellQuote(value);
  const result = await new Deno.Command("sh", { args: ["-c", command] }).output();
  const actual = new TextDecoder().decode(result.stdout);
  if (!result.success || actual !== value) throw new Error(JSON.stringify({ command, actual }));
});

Deno.test("pgcoach uses only temporary progress and preserves the full renderer", async () => {
  const dir = await Deno.makeTempDir();
  const db = dir + "/progress.sqlite";
  try {
    const initialized = capture();
    if (await runTutor(["postgres", "init", "--db", db], initialized.io) !== 0) {
      throw new Error(initialized.err.join("\n"));
    }
    for (let ordinal = 1; ordinal <= 7; ordinal++) {
      if (await runTutor(["postgres", "done", String(ordinal), "--db", db], capture().io) !== 0) {
        throw new Error("could not mark fixture prerequisite " + ordinal);
      }
    }
    const before = capture();
    if (await runTutor(["postgres", "show", "8", "--json", "--db", db], before.io) !== 0) {
      throw new Error(before.err.join("\n"));
    }
    const baseline = JSON.parse(before.out[0]);
    const legacy = capture();
    if (await runCoach(["1", "start", "--db", db], legacy.io) !== 0) {
      throw new Error(legacy.err.join("\n"));
    }
    if (
      !legacy.out.join("\n").includes("Guided coaching is not authored") ||
      !legacy.out.join("\n").includes("pgcoach 1 full")
    ) {
      throw new Error("legacy fallback was not explicit: " + legacy.out.join("\n"));
    }
    const next = capture();
    if (await runCoach(["--db", db], next.io) !== 0 || !next.out.join("\n").includes("Lesson 8")) {
      throw new Error(next.err.concat(next.out).join("\n"));
    }
    for (
      const stage of [
        "start",
        "run",
        "inspect",
        "explain",
        "vary",
        "apply",
        "hint1",
        "hint2",
        "reveal",
      ]
    ) {
      const staged = capture();
      if (await runCoach(["8", stage, "--db", db], staged.io) !== 0) {
        throw new Error(stage + ": " + staged.err.concat(staged.out).join("\n"));
      }
    }
    const direct = capture();
    const full = capture();
    await runTutor(["postgres", "pretty", "8", "--plain", "--db", db], direct.io);
    await runCoach(["8", "full", "--db", db], full.io);
    if (full.out.join("\n") !== direct.out.join("\n")) throw new Error("full renderer changed");
    const after = capture();
    await runTutor(["postgres", "show", "8", "--json", "--db", db], after.io);
    const unchanged = JSON.parse(after.out[0]);
    if (unchanged.status !== baseline.status || unchanged.notes !== baseline.notes) {
      throw new Error("coaching changed progress state");
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("pgcoach rejects invalid input and reports topic misses and completion", async () => {
  const invalid = capture();
  if (
    await runCoach(["8", "not-a-stage"], invalid.io) !== 2 ||
    !invalid.err.join("\n").includes("unknown stage")
  ) {
    throw new Error(invalid.err.join("\n"));
  }
  const ambiguous = capture();
  if (await runCoach(["8", "--topic", "storage"], ambiguous.io) !== 2) {
    throw new Error("ambiguous input accepted");
  }
  const dir = await Deno.makeTempDir();
  const db = dir + "/progress.sqlite";
  try {
    await runTutor(["postgres", "init", "--db", db], capture().io);
    const missing = capture();
    if (await runCoach(["--topic", "no-such-coaching-topic", "--db", db], missing.io) !== 0) {
      throw new Error(missing.err.join("\n"));
    }
    if (!missing.out.join("\n").includes("No PostgreSQL lessons match")) {
      throw new Error(missing.out.join("\n"));
    }
    const listed = capture();
    if (await runTutor(["postgres", "list", "--all", "--json", "--db", db], listed.io) !== 0) {
      throw new Error(listed.err.join("\n"));
    }
    const lessons = JSON.parse(listed.out[0]) as Array<{ ordinal: number }>;
    for (const { ordinal } of lessons) {
      const done = capture();
      if (await runTutor(["postgres", "done", String(ordinal), "--db", db], done.io) !== 0) {
        throw new Error(done.err.join("\n"));
      }
    }
    const complete = capture();
    if (
      await runCoach(["--db", db], complete.io) !== 0 ||
      !complete.out.join("\n").includes("complete")
    ) {
      throw new Error(complete.err.concat(complete.out).join("\n"));
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
