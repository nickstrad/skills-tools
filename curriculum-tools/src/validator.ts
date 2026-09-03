import type { Lesson } from "./types.ts";

export type Repl = {
  command: string[];
  echo: string;
  quit: string;
  mode?: "tool" | "shell";
  env?: Record<string, string>;
};

export type ValidationOptions = {
  repl: Repl;
  env?: Record<string, string>;
  timeoutMs?: number;
  log?: (line: string) => void;
  from?: number;
  to?: number;
  selectors?: string[];
};

export type ValidationResult = {
  selected: number;
  failures: number;
};

type Step = { session: string; blocks: boolean; text: string };
type StepResult = { completed: boolean; status?: number };
type Waiter = { marker: string; resolve: (status?: number) => void };

/** Split lesson code into the persistent sessions used by the validation harness. */
export function splitSteps(code: string): Step[] {
  const steps: Step[] = [];
  let current: Step = { session: "A", blocks: false, text: "" };
  for (const line of code.split("\n")) {
    const m = line.match(/^(?:--|#|\/\/)\s*Session\s+([A-D])\b(.*)$/i);
    if (m) {
      if (current.text.trim()) steps.push(current);
      current = { session: m[1].toUpperCase(), blocks: /\(blocks/i.test(m[2]), text: "" };
      continue;
    }
    current.text += line + "\n";
  }
  if (current.text.trim()) steps.push(current);
  return steps;
}

function markerStatus(buffer: string, marker: string): number | undefined {
  // Shell-mode markers are emitted as `... status=$?`; tolerate a marker without
  // a status so custom tools retain their historical completion behavior.
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = buffer.match(new RegExp(`${escaped}(?:\\s+status=(-?\\d+))?`));
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

export class Session {
  readonly proc: Deno.ChildProcess;
  readonly writer: WritableStreamDefaultWriter<Uint8Array>;
  private buffer = "";
  private waiters: Waiter[] = [];
  private pending: { step: number; done: Promise<number | undefined> }[] = [];
  private readonly encoder = new TextEncoder();
  private readonly timeoutMs: number;
  private readonly mode: "tool" | "shell";
  hadFailure = false;

  constructor(
    public readonly name: string,
    private readonly repl: Repl,
    private readonly env: Record<string, string>,
    private readonly log: (line: string) => void,
    timeoutMs = 30000,
  ) {
    this.timeoutMs = timeoutMs;
    this.mode = repl.mode ?? "tool";
    this.proc = new Deno.Command(repl.command[0], {
      args: repl.command.slice(1),
      env,
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    this.writer = this.proc.stdin.getWriter();
    this.pump(this.proc.stdout);
    this.pump(this.proc.stderr);
  }

  private async pump(stream: ReadableStream<Uint8Array>) {
    const dec = new TextDecoder();
    for await (const chunk of stream) {
      const text = dec.decode(chunk);
      this.buffer += text;
      // Remove only the marker token, rather than dropping its whole line: a
      // command such as `printf observed` may not end with a newline before the
      // marker is printed.
      const visible = text.replace(/__STEP_\d+_DONE__(?:\s+status=-?\d+)?/g, "");
      const lines = visible.split("\n").filter((line) => line.length);
      if (lines.length) this.log(lines.map((line) => `  [${this.name}] ${line}`).join("\n"));
      for (const waiter of [...this.waiters]) {
        if (!this.buffer.includes(waiter.marker)) continue;
        const status = this.mode === "shell" ? markerStatus(this.buffer, waiter.marker) : undefined;
        // A pipe chunk can split the marker line between the marker and its
        // status. Shell mode must wait for the complete status-aware marker;
        // otherwise a failed command could be mistaken for success.
        if (this.mode === "shell" && status === undefined) continue;
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        if (status !== undefined && status !== 0) this.hadFailure = true;
        waiter.resolve(status);
      }
    }
  }

  async send(text: string, wait: boolean, step: number): Promise<StepResult> {
    const marker = `__STEP_${step}_DONE__`;
    let waiter!: Waiter;
    const done = new Promise<number | undefined>((resolve) => {
      waiter = { marker, resolve };
      this.waiters.push(waiter);
    });
    // Bash has no portable REPL echo command. Capture the status before any
    // marker command can overwrite it; tool REPLs continue using their config.
    const echo = this.mode === "shell"
      ? `printf '__STEP_${step}_DONE__ status=%s\\n' "$?"`
      : this.repl.echo.replace("{marker}", marker);
    await this.writer.write(this.encoder.encode(`${text}\n${echo}\n`));
    if (!wait) {
      // A non-waiting step (usually a deliberate block) still reports a later
      // nonzero status through hadFailure when its marker eventually arrives.
      // Keep its completion promise so lesson teardown cannot silently accept
      // a step that never became unblocked.
      this.pending.push({ step, done });
      return { completed: true };
    }
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const timer = new Promise<StepResult>((resolve) => {
      timerId = setTimeout(() => resolve({ completed: false }), this.timeoutMs);
    });
    const result = await Promise.race([
      done.then((status) => ({ completed: true, status })),
      timer,
    ]);
    if (timerId !== undefined) clearTimeout(timerId);
    if (!result.completed) {
      const i = this.waiters.indexOf(waiter);
      if (i >= 0) this.waiters.splice(i, 1);
    }
    return result;
  }

  async close() {
    if (this.pending.length) {
      let timerId: ReturnType<typeof setTimeout> | undefined;
      const timer = new Promise<boolean>((resolve) => {
        timerId = setTimeout(() => resolve(false), this.timeoutMs);
      });
      const completed = await Promise.race([
        Promise.all(this.pending.map((pending) => pending.done)).then(() => true),
        timer,
      ]);
      if (timerId !== undefined) clearTimeout(timerId);
      if (!completed) {
        const steps = this.pending.map((pending) => pending.step).join(", ");
        this.log(`  !! blocking step(s) ${steps} in session ${this.name} did not complete`);
        this.hadFailure = true;
      }
    }
    try {
      await this.writer.write(this.encoder.encode(`${this.repl.quit}\n`));
      await this.writer.close();
    } catch { /* already closed */ }
    const killer = setTimeout(() => {
      try {
        this.proc.kill("SIGKILL");
      } catch { /* exited */ }
    }, 2000);
    await this.proc.status;
    clearTimeout(killer);
  }
}

export async function validateLessons(
  lessons: Lesson[],
  options: ValidationOptions,
): Promise<ValidationResult> {
  const timeoutMs = options.timeoutMs ?? 30000;
  const log = options.log ?? console.log;
  const mode = options.repl.mode ?? "tool";
  const env: Record<string, string> = { ...(options.repl.env ?? {}), ...(options.env ?? {}) };
  const from = options.from ?? 1;
  const to = options.to ?? 999999;
  const selectors = options.selectors ?? [];
  const selected = lessons.filter((lesson) =>
    lesson.ordinal >= from && lesson.ordinal <= to &&
    (selectors.length === 0 || selectors.includes(lesson.slug) ||
      selectors.includes(String(lesson.ordinal)))
  );

  let failures = 0;
  for (const lesson of selected) {
    log(
      `\n=== #${lesson.ordinal} ${lesson.slug} [${lesson.runIn}, ${lesson.sessions} session(s)] ===`,
    );
    if (lesson.runIn === "shell" && mode !== "shell") {
      log("  (shell lesson: run manually; configured REPL is not shell mode)");
      continue;
    }
    const sessions = new Map<string, Session>();
    const get = (name: string) => {
      if (!sessions.has(name)) {
        sessions.set(name, new Session(name, options.repl, env, log, timeoutMs));
      }
      return sessions.get(name)!;
    };
    let step = 0;
    let ok = true;
    const runStep = async (session: string, text: string, blocks: boolean) => {
      const result = await get(session).send(text, !blocks, ++step);
      if (!result.completed) {
        log(`  !! step ${step} in session ${session} timed out after ${timeoutMs} ms`);
        return false;
      }
      if (result.status !== undefined && result.status !== 0) {
        log(`  !! step ${step} in session ${session} exited with status ${result.status}`);
        return false;
      }
      return true;
    };
    if (lesson.setup) {
      log("  -- setup --");
      ok = await runStep("A", lesson.setup, false);
    }
    for (const s of splitSteps(lesson.code)) {
      if (!ok) break;
      log(`  -- Session ${s.session}${s.blocks ? " (blocks)" : ""} --`);
      ok = await runStep(s.session, s.text, s.blocks);
    }
    for (const session of sessions.values()) {
      await session.close();
      if (session.hadFailure) ok = false;
    }
    if (!ok) failures++;
  }
  return { selected: selected.length, failures };
}
