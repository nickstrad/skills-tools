import { WAL } from "../curriculum/18-wal.ts";

const psql = Deno.env.get("PSQL") ?? "/usr/lib/postgresql/16/bin/psql";
const host = Deno.env.get("PGHOST") ?? "";
if (!host.startsWith("/tmp/pg-essentials-validation-author-23-24-")) {
  throw new Error("PGHOST must name an owned author-23-24 validation socket");
}

const modes = Deno.args.length ? Deno.args : ["23-core", "23-variation", "24-core", "24-variation"];

for (const mode of modes) {
  const match = mode.match(/^(23|24)-(core|variation)$/);
  if (!match) throw new Error(`unknown selection: ${mode}`);
  const lesson = WAL.lessons[Number(match[1]) - 23];
  let sql: string;
  if (match[2] === "core") {
    sql = `${lesson.setup ?? ""}\n${lesson.code}`;
  } else {
    const fenced = lesson.challenge?.match(/```sql\n([\s\S]*?)\n```/);
    if (!fenced) throw new Error(`missing SQL variation for lesson ${match[1]}`);
    sql = fenced[1];
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
