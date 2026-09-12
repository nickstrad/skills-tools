// Scaffolds courses/<id>/ from templates/course/.
// Usage: deno task new-course <id> "<Name>" <tool> "<description>" [minVersion]
import { relative, resolve } from "node:path";
import { courseDir, TOOL_ROOT } from "./main.ts";
import { locatePlan, readPlan } from "./route.ts";

export async function scaffoldCourse(
  vars: { id: string; name: string; tool: string; description: string; minVersion: string },
  options: { toolRoot?: string } = {},
): Promise<string[]> {
  const toolRoot = options.toolRoot ?? TOOL_ROOT;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(vars.id)) {
    throw new Error(`invalid course id: ${vars.id}`);
  }
  // Resolve the plan before creating any scaffold file so duplicate future identities leave no
  // partial course behind.
  const plan = await locatePlan(toolRoot, vars.id);
  if (plan?.future) await readPlan(toolRoot, vars.id);
  const target = options.toolRoot ? resolve(toolRoot, "courses", vars.id) : courseDir(vars.id);
  const templateDir = resolve(toolRoot, "templates", "course");
  try {
    await Deno.stat(target);
    throw new Error(`course ${vars.id} already exists at ${target}`);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  const all = { ...vars, tutor_path: resolve(toolRoot, "bin", "tutor") };
  const written: string[] = [];
  const copy = async (rel: string) => {
    const src = resolve(templateDir, rel);
    for await (const entry of Deno.readDir(src)) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory) {
        await copy(childRel);
        continue;
      }
      let text = await Deno.readTextFile(resolve(templateDir, childRel));
      text = text.replace(/\{\{(\w+)\}\}/g, (m, key: string) => {
        const value = (all as Record<string, string>)[key];
        if (value === undefined) throw new Error(`template ${childRel} uses unknown ${m}`);
        // course.json is a JSON template; preserve valid JSON when descriptions or names contain
        // quotes, backslashes, or newlines. Other templates intentionally receive plain text.
        return childRel === "course.json" ? JSON.stringify(value).slice(1, -1) : value;
      });
      // The skill directory is named after the course.
      const outRel = childRel.replace(/^skill\//, `skill/${vars.id}-tutor/`);
      const out = resolve(target, outRel);
      await Deno.mkdir(resolve(out, ".."), { recursive: true });
      await Deno.writeTextFile(out, text);
      written.push(outRel);
    }
  };
  await copy("");
  if (plan) {
    // Keep the agreed Markdown route canonical. A relative symlink keeps the scaffold portable
    // when the repository is moved and lets route/build share the same source of truth.
    const link = resolve(target, "PLAN.md");
    await Deno.symlink(relative(target, plan.path), link);
    written.push("PLAN.md");
  }
  return written;
}

if (import.meta.main) {
  const [id, name, tool, description, minVersion = ""] = Deno.args;
  if (!id || !name || !tool || !description) {
    console.error('usage: deno task new-course <id> "<Name>" <tool> "<description>" [minVersion]');
    Deno.exit(2);
  }
  const files = await scaffoldCourse({ id, name, tool, description, minVersion });
  console.log(`Created course ${id}:\n  ${files.join("\n  ")}`);
  console.log(
    `\nNext: edit courses/${id}/curriculum/*.ts, then: deno task build ${id} && bin/tutor ${id} init`,
  );
}
