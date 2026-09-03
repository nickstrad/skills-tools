import { type Repl, validateLessons } from "../src/validator.ts";
import type { Lesson } from "../src/types.ts";

const repl: Repl = {
  mode: "shell",
  command: ["bash", "--noprofile", "--norc"],
  // Shell mode supplies a status-aware marker; this field remains required for
  // compatibility with tool-mode course configuration.
  echo: "unused {marker}",
  quit: "exit",
};

function lesson(code: string, sessions = 1): Lesson {
  return {
    ordinal: 1,
    slug: "shell-test",
    title: "Shell test",
    category: "test",
    difficulty: "beginner",
    tags: [],
    prerequisites: [],
    overview: "test",
    syntaxBreakdown: "test",
    code,
    expectedResult: "test",
    systemsLens: "test",
    safetyLevel: "read-only",
    runIn: "shell",
    sessions,
    minVersion: "5.1",
    estimatedMinutes: 1,
    revision: 1,
  };
}

async function withLab(run: (lab: string, logs: string[]) => Promise<void>) {
  const lab = await Deno.makeTempDir({ prefix: "validator-shell-" });
  const logs: string[] = [];
  try {
    await run(lab, logs);
  } finally {
    await Deno.remove(lab, { recursive: true });
  }
}

async function validate(code: string, lab: string, logs: string[], timeoutMs = 500) {
  return await validateLessons([lesson(code)], {
    repl,
    env: { LAB: lab },
    timeoutMs,
    log: (line) => logs.push(line),
  });
}

Deno.test("shell mode executes a lesson and preserves the Bash session", async () => {
  await withLab(async (lab, logs) => {
    const result = await validate(
      `printf 'ok' > "$LAB/result"\nprintf 'observed=%s' "$(cat "$LAB/result")"`,
      lab,
      logs,
    );
    if (result.failures !== 0 || (await Deno.readTextFile(`${lab}/result`)) !== "ok") {
      throw new Error(JSON.stringify({ result, logs }));
    }
    if (!logs.some((line) => line.includes("observed=ok"))) throw new Error(logs.join("\n"));
  });
});

Deno.test("a nonzero Bash status fails validation", async () => {
  await withLab(async (lab, logs) => {
    const result = await validate(`test -f "$LAB/missing"`, lab, logs);
    if (result.failures !== 1 || !logs.some((line) => line.includes("status 1"))) {
      throw new Error(JSON.stringify({ result, logs }));
    }
  });
});

Deno.test("two persistent sessions coordinate through the filesystem", async () => {
  await withLab(async (lab, logs) => {
    const result = await validate(
      `-- Session A\nprintf 'from-A' > "$LAB/shared"\n-- Session B\ncat "$LAB/shared"`,
      lab,
      logs,
    );
    if (result.failures !== 0 || !logs.some((line) => line.includes("from-A"))) {
      throw new Error(JSON.stringify({ result, logs }));
    }
  });
});

Deno.test("a blocking session is released by another session", async () => {
  await withLab(async (lab, logs) => {
    const result = await validate(
      `-- Session B (blocks until A writes)\nwhile [ ! -f "$LAB/release" ]; do sleep 0.01; done\nprintf unblocked\n-- Session A\ntouch "$LAB/release"`,
      lab,
      logs,
    );
    if (result.failures !== 0 || !logs.some((line) => line.includes("unblocked"))) {
      throw new Error(JSON.stringify({ result, logs }));
    }
  });
});

Deno.test("a step that exceeds the timeout fails validation", async () => {
  await withLab(async (lab, logs) => {
    const result = await validate("sleep 0.2", lab, logs, 20);
    if (result.failures !== 1 || !logs.some((line) => line.includes("timed out"))) {
      throw new Error(JSON.stringify({ result, logs }));
    }
  });
});

Deno.test("legacy tool-mode courses continue skipping shell lessons", async () => {
  await withLab(async (lab, logs) => {
    const result = await validateLessons([lesson(`touch "$LAB/should-not-exist"`)], {
      repl: { ...repl, mode: undefined },
      env: { LAB: lab },
      log: (line) => logs.push(line),
    });
    if (result.failures !== 0 || !logs.some((line) => line.includes("run manually"))) {
      throw new Error(JSON.stringify({ result, logs }));
    }
    try {
      await Deno.stat(`${lab}/should-not-exist`);
      throw new Error("legacy shell lesson unexpectedly ran");
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  });
});
