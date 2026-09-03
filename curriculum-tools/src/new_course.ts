// Scaffolds courses/<id>/ from templates/course/.
// Usage: deno task new-course <id> "<Name>" <tool> "<description>" [minVersion]
import { resolve } from "node:path";
import { courseDir, TOOL_ROOT } from "./main.ts";

const TEMPLATE_DIR = resolve(TOOL_ROOT, "templates", "course");

export async function scaffoldCourse(
  vars: { id: string; name: string; tool: string; description: string; minVersion: string },
): Promise<string[]> {
  const target = courseDir(vars.id);
  try {
    await Deno.stat(target);
    throw new Error(`course ${vars.id} already exists at ${target}`);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  const all = { ...vars, tutor_path: resolve(TOOL_ROOT, "bin", "tutor") };
  const written: string[] = [];
  const copy = async (rel: string) => {
    const src = resolve(TEMPLATE_DIR, rel);
    for await (const entry of Deno.readDir(src)) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory) {
        await copy(childRel);
        continue;
      }
      let text = await Deno.readTextFile(resolve(TEMPLATE_DIR, childRel));
      text = text.replace(/\{\{(\w+)\}\}/g, (m, key: string) => {
        const value = (all as Record<string, string>)[key];
        if (value === undefined) throw new Error(`template ${childRel} uses unknown ${m}`);
        return value;
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
