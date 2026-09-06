// Drive exact built blocks with the shared REPL implementation, observing deliberate lock waits.
import { Session, splitSteps } from "../../../src/validator.ts";
import type { Lesson } from "../../../src/types.ts";

const course = JSON.parse(await Deno.readTextFile(new URL("../course.json", import.meta.url)));
const catalog: Lesson[] = JSON.parse(
  await Deno.readTextFile(new URL("../lessons.json", import.meta.url)),
);
const env = Deno.env.toObject();
if (!env.PGHOST?.startsWith("/tmp/pg-essentials-validation-")) {
  throw new Error("Use validate.py to allocate a private validation cluster");
}
const selected = catalog.filter((l) => !Deno.args.length || Deno.args.includes(String(l.ordinal)));
if (!selected.length) throw new Error("No lessons selected");

async function observeWait(ordinal: number, session: string): Promise<void> {
  const app = `essentials-${ordinal}-${session}`;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const query = new Deno.Command("psql", {
      args: [
        "-X",
        "-Atqc",
        `
        select json_build_object('lesson', ${ordinal}, 'session', '${session}',
          'wait_type', a.wait_event_type, 'wait_event', a.wait_event,
          'blocker', b.application_name, 'query', a.query)
        from pg_stat_activity a
        join pg_stat_activity b on b.pid = any(pg_blocking_pids(a.pid))
        where a.application_name = '${app}' and a.wait_event_type = 'Lock'
          and b.application_name = 'essentials-${ordinal}-A'
      `,
      ],
      env,
    });
    const result = await query.output();
    if (!result.success) throw new Error(new TextDecoder().decode(result.stderr));
    const row = new TextDecoder().decode(result.stdout).trim();
    if (row) {
      console.log("WAIT_EVIDENCE " + row);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Lesson ${ordinal}: ${session} never observed waiting on A`);
}

for (const lesson of selected) {
  console.log(`\n=== #${lesson.ordinal} ${lesson.slug} ===`);
  const sessions = new Map<string, Session>();
  const get = (name: string) => {
    if (!sessions.has(name)) {
      sessions.set(
        name,
        new Session(name, course.repl, {
          ...env,
          PGAPPNAME: `essentials-${lesson.ordinal}-${name}`,
        }, console.log),
      );
    }
    return sessions.get(name)!;
  };
  let step = 0;
  try {
    if (lesson.setup) {
      const result = await get("A").send(lesson.setup, true, ++step);
      if (!result.completed) throw new Error("Setup timed out");
    }
    for (const block of splitSteps(lesson.code)) {
      console.log(`  -- Session ${block.session}${block.blocks ? " (blocks)" : ""} --`);
      const result = await get(block.session).send(block.text, !block.blocks, ++step);
      if (!result.completed) throw new Error(`Lesson ${lesson.ordinal}: step ${step} timed out`);
      if (block.blocks) await observeWait(lesson.ordinal, block.session);
    }
  } finally {
    for (const session of sessions.values()) await session.close();
  }
  if ([...sessions.values()].some((s) => s.hadFailure)) throw new Error("Pending step failed");
}
console.log(`\n${selected.length}/${selected.length} lessons completed; deliberate waits observed`);
