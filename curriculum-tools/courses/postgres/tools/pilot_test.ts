import { GUIDES } from "../guides/mod.ts";
import { run as runTutor } from "../../../src/main.ts";
import { splitSteps } from "../../../src/validator.ts";
import { renderStage, runCoach, type SelectedLesson } from "./coach.ts";
import { PILOT_FLOW, pilotPhases, runnable } from "./pilot.ts";

const lessons: SelectedLesson[] = JSON.parse(
  await Deno.readTextFile(new URL("../lessons.json", import.meta.url)),
);
const stages = [...PILOT_FLOW, "vary", "hint1", "hint2", "syntax", "full"];
function capture() {
  const lines: string[] = [];
  return { lines, io: { log: (s: string) => lines.push(s), error: (s: string) => lines.push(s) } };
}
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

Deno.test("only four pilot lessons opt in; phase rendering preserves SQL and session order", () => {
  const batch = lessons.filter((lesson) => GUIDES[lesson.slug]?.pilot);
  assert(batch.map((l) => l.ordinal).join(",") === "9,10,11,12", "pilot scope changed");
  for (const lesson of batch) {
    const guide = GUIDES[lesson.slug];
    const phases = pilotPhases(lesson, guide);
    const joined = phases.map((phase) => phase.code).join("\n");
    const normalized = (code: string) =>
      splitSteps(runnable(code)).map((step) => ({
        session: step.session,
        blocks: step.blocks,
        lines: step.text.split("\n").filter((line) => line.trim()),
      }));
    assert(
      JSON.stringify(normalized(joined)) === JSON.stringify(normalized(lesson.code)),
      `lesson ${lesson.ordinal}: phases changed executable SQL or sessions`,
    );
    const run = renderStage(lesson, "run", guide);
    const blocks = [...run.matchAll(/```sql\n([\s\S]*?)\n```/g)].map((m) => m[1]);
    assert(blocks[0] === lesson.setup, "setup missing or altered");
    assert(blocks.slice(1).join("\n") === joined, "rendered core differs from checked phases");
    const start = renderStage(lesson, "start", guide);
    assert(!start.includes(lesson.setup!), "prediction disclosed setup commands");
    assert(start.includes("psql -X -h /tmp -p 5440"), "connection missing");
    assert(start.includes("60 min"), "cap missing");
    if (lesson.sessions === 2) {
      assert(start.includes("two other terminals"), "A/B provision missing");
    }
  }
});

Deno.test("pilot phase drift fails explicitly instead of dropping commands", () => {
  const lesson = lessons[8];
  const guide = GUIDES[lesson.slug];
  const marker = guide.pilot!.phases[1].from;
  for (
    const code of [lesson.code.replace(marker, "-- changed marker"), lesson.code + "\n" + marker]
  ) {
    let rejected = false;
    try {
      pilotPhases({ ...lesson, code }, guide);
    } catch {
      rejected = true;
    }
    assert(rejected, "missing or ambiguous phase marker accepted");
  }
});

Deno.test("pilot feedback, reading stops and navigation do not demand written responses", () => {
  const db = "/tmp/a learner's pilot.sqlite";
  for (const lesson of lessons.slice(8, 12)) {
    const guide = GUIDES[lesson.slug];
    for (const stage of stages) {
      const output = renderStage(lesson, stage, guide, db);
      const footer = output.split("---\n\n").at(-1)!;
      assert(
        footer.includes("--db '/tmp/a learner'\"'\"'s pilot.sqlite'"),
        "database lost in footer",
      );
      assert(!output.includes("## Your note"), "note solicitation surfaced");
      assert(!footer.includes("--note"), "completion requests a note");
      const at = PILOT_FLOW.indexOf(stage);
      if (at >= 0 && at < PILOT_FLOW.length - 1) {
        assert(
          footer.includes(`Next: \`pgcoach ${lesson.ordinal} ${PILOT_FLOW[at + 1]}`),
          "wrong next stage",
        );
      }
      if (stage === "apply" && lesson.ordinal === 12) {
        assert(
          output.includes("Stop here — review the coaching before lesson 13"),
          "review stop missing",
        );
        assert(!footer.includes("pgcoach 13 start"), "review bypassed by footer");
      }
    }
    const run = renderStage(lesson, "run", guide);
    assert(!run.includes(guide.pilot!.variation.code), "optional experiment included in core");
    const vary = renderStage(lesson, "vary", guide);
    assert(vary.includes(guide.pilot!.variation.code), "variation commands hidden in hints");
  }
  const readingLesson = lessons[9];
  assert(
    renderStage(readingLesson, "start", GUIDES[readingLesson.slug]).includes("Core reading after"),
    "reading not budgeted",
  );
  for (const stage of ["apply", "full"]) {
    const output = renderStage(readingLesson, stage, GUIDES[readingLesson.slug]);
    for (const item of readingLesson.studyCheckpoint!.core) {
      assert(output.includes(item.locator), "reading excerpt lost");
    }
  }
  const reveal = renderStage(readingLesson, "reveal", GUIDES[readingLesson.slug]);
  assert(
    !reveal.includes("Stop here after completing"),
    "early reveal prematurely ends experiment",
  );
});

Deno.test("all pilot views preserve progress; lesson 13 start is the batch review", async () => {
  const dir = await Deno.makeTempDir({ prefix: "pgcoach-pilot-test-" });
  const db = dir + "/progress.sqlite";
  const call = async (args: string[]) => {
    const out = capture();
    assert(await runCoach([...args, "--db", db], out.io) === 0, out.lines.join("\n"));
    return out.lines.join("\n");
  };
  try {
    assert(await runTutor(["postgres", "init", "--db", db], capture().io) === 0, "init failed");
    for (let n = 1; n <= 12; n++) {
      assert(
        await runTutor(["postgres", "done", String(n), "--db", db], capture().io) === 0,
        "fixture completion failed",
      );
    }
    const baseline = await Deno.readFile(db);
    for (let n = 9; n <= 12; n++) for (const stage of stages) await call([String(n), stage]);
    for (const args of [["start"], ["13", "start"], ["start", "--topic", "mvcc"]]) {
      assert(
        (await call(args)).includes("Stop here — review the coaching before lesson 13"),
        "boundary skipped",
      );
    }
    const after = await Deno.readFile(db);
    assert(
      baseline.length === after.length && baseline.every((byte, i) => byte === after[i]),
      "rendering changed progress bytes",
    );
    // Existing complete material remains accessible on explicit request.
    assert((await call(["13", "full"])).includes("# Lesson 13"), "explicit full access blocked");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
