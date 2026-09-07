import { Session, splitSteps } from "../../../src/validator.ts";
import { REQUEST_IDENTITY } from "../curriculum/10-request-identity.ts";

const lesson = REQUEST_IDENTITY.lessons[0];
const env = Deno.env.toObject();
if (!env.PGHOST?.startsWith("/tmp/pg-essentials-l12-")) {
  throw new Error("lesson 12 author validation requires its private socket");
}
const variation = Deno.args.includes("--variation");
const sql = variation ? lesson.challenge!.match(/```sql\n([\s\S]*?)\n```/)?.[1] : lesson.code;
if (!sql) throw new Error("missing runnable SQL");
const sessions = new Map<string, Session>();
const get = (name: string) => {
  if (!sessions.has(name)) {
    sessions.set(
      name,
      new Session(
        name,
        {
          command: ["psql", "-X"],
          echo: "\\echo {marker}",
          quit: "\\quit",
        },
        { ...env, PGAPPNAME: `l12-${name}` },
        console.log,
      ),
    );
  }
  return sessions.get(name)!;
};

async function observeWait() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const out = await new Deno.Command("psql", {
      args: [
        "-X",
        "-Atqc",
        `
        select json_build_object(
          'wait_type', a.wait_event_type, 'wait_event', a.wait_event,
          'waiter', a.application_name, 'blocker', b.application_name)
        from pg_stat_activity a
        join pg_stat_activity b on b.pid = any(pg_blocking_pids(a.pid))
        where a.application_name = 'l12-B'
          and b.application_name = 'l12-A'
          and a.wait_event_type = 'Lock'`,
      ],
      env,
    }).output();
    if (!out.success) throw new Error(new TextDecoder().decode(out.stderr));
    const row = new TextDecoder().decode(out.stdout).trim();
    if (row) {
      console.log(`WAIT_EVIDENCE ${row}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("B never visibly waited for A");
}

let step = 0;
try {
  await get("A").send(lesson.setup!, true, ++step);
  for (const block of splitSteps(sql)) {
    const result = await get(block.session).send(block.text, !block.blocks, ++step);
    if (!result.completed) throw new Error(`step ${step} did not complete`);
    if (block.blocks) await observeWait();
  }
} finally {
  for (const session of sessions.values()) await session.close();
}
if ([...sessions.values()].some((session) => session.hadFailure)) {
  throw new Error("a psql step failed");
}
console.log(variation ? "VARIATION_COMPLETE" : "CORE_COMPLETE");
