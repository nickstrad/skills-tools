import { JOIN_MEMORY } from "../curriculum/17-join-memory.ts";

const psql = Deno.env.get("PSQL") ?? "psql";
const host = Deno.env.get("PGHOST") ?? "";
if (!host.startsWith("/tmp/pg-essentials-validation-")) {
  throw new Error("PGHOST must name an owned /tmp/pg-essentials-validation-* socket");
}

const lesson = JOIN_MEMORY.lessons[0];
const modes = Deno.args.length ? Deno.args : ["core", "variation"];
for (const mode of modes) {
  let sql: string;
  if (mode === "core") {
    sql = `${lesson.setup ?? ""}\n${lesson.code}`;
  } else if (mode === "variation") {
    const fenced = lesson.challenge?.match(/```sql\n([\s\S]*?)\n```/);
    if (!fenced) throw new Error("missing SQL variation");
    sql = fenced[1];
  } else {
    throw new Error(`unknown selection: ${mode}`);
  }

  const command = new Deno.Command(psql, {
    args: ["-X", "-v", "ON_ERROR_STOP=1", "-P", "pager=off"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = command.stdin.getWriter();
  await writer.write(new TextEncoder().encode(sql));
  await writer.close();
  const result = await command.output();
  console.log(`=== ${mode} ===`);
  await Deno.stdout.write(result.stdout);
  await Deno.stderr.write(result.stderr);
  if (!result.success) Deno.exit(result.code);
}
