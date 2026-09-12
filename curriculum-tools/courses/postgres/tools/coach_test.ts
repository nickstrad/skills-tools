import { run as runTutor } from "../../../src/main.ts";
import { normalizeReferenceArgs, runCoach } from "./coach.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function capture() {
  const out: string[] = [], err: string[] = [];
  return { out, err, io: { log: (s: string) => out.push(s), error: (s: string) => err.push(s) } };
}

Deno.test("reference stage aliases normalize to the complete shared lesson", () => {
  for (const alias of ["start", "review", "run", "full", "syntax"]) {
    assert(
      JSON.stringify(normalizeReferenceArgs(["13", alias, "--db", "/tmp/a learner.sqlite"])) ===
        JSON.stringify(["13", "lesson", "--db", "/tmp/a learner.sqlite"]),
      `${alias} was not normalized`,
    );
  }
});

Deno.test("reference aliases 9–13 have no pilot stop gate and preserve separate progress", async () => {
  const dir = await Deno.makeTempDir({ prefix: "pg-reference-wrapper-test-" });
  const db = `${dir}/reference tutor postgres.sqlite`;
  try {
    const init = capture();
    assert(await runTutor(["postgres", "init", "--db", db], init.io) === 0, init.err.join("\n"));
    for (const ordinal of [9, 10, 11, 12, 13]) {
      for (const alias of ["start", "review", "run", "full", "syntax"]) {
        const result = capture();
        assert(
          await runCoach([String(ordinal), alias, "--db", db, "--plain"], result.io) === 0,
          result.err.join("\n"),
        );
        const output = result.out.join("\n");
        assert(
          output.includes("## Expected result"),
          `${ordinal} ${alias}: expected result missing`,
        );
        assert(output.includes("## Systems lens"), `${ordinal} ${alias}: systems lens missing`);
        assert(!output.includes("Stop here"), `${ordinal} ${alias}: pilot gate remains`);
        assert(
          !output.includes("Core reading before"),
          `${ordinal} ${alias}: reading gate remains`,
        );
        assert(
          output.includes("pgcoach --reference"),
          `${ordinal} ${alias}: reference command lost`,
        );
        assert(
          output.includes("tutor postgres.sqlite"),
          `${ordinal} ${alias}: quoted db path was rewritten`,
        );
      }
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
