# Knowledge base

Findings from past work in this repository that are worth knowing before starting new work here.
Each file covers one topic and is written for the next agent or person, not as a changelog: what
was true, why it mattered, and how to apply it. Read this index first, open the files relevant to
your task, and add a new file when you finish work that taught you something another agent would
otherwise rediscover.

## Files

| File | What it covers |
| --- | --- |
| [repo-tooling.md](repo-tooling.md) | Deno location, scoped `fmt`/`lint`/`check` commands, formatter effects on Markdown, Docker test rig, and how to build a non-root test user. |
| [validation-harness.md](validation-harness.md) | How `tools/validate.ts` drives a course, why "completed" is not "passed", how to isolate parallel runs, and how to read evidence. |
| [subagent-workflow.md](subagent-workflow.md) | The spec-then-verify pattern for delegating mechanical lesson work to Opus subagents, including the private-copy setup and the equivalence checks. |
| [shell-lesson-gotchas.md](shell-lesson-gotchas.md) | Pitfalls in Bash lessons (Linux course): `String.raw` code fields, `set -e` leaks, relative `nice`, two-session coordination files, `sudo`/`as_root`, mounts in subshells. |
| [command-inventory-extraction.md](command-inventory-extraction.md) | How to derive a course's real command inventory from `lessons.json`, including the wrapper and quoting cases a naive grep misses. |
| [sqlite-lesson-gotchas.md](sqlite-lesson-gotchas.md) | `sqlite3` REPL quirks that break lessons: `.shell` requoting, page-size drift across modules, missing `sqlite_dbpage`. |
| [postgres-lab.md](postgres-lab.md) | The disposable PostgreSQL lab cluster the course validates against and its one maintenance chore. |

## Adding a finding

1. Create `docs/knowledge/<topic>.md` with a one-line summary at the top, then sections **What
   happened**, **Why it matters**, and **How to apply**. Use absolute dates, name files and
   commands exactly, and prefer one topic per file over one long file.
2. Add a row to the table above. Keep the description to one sentence that says when someone
   should open the file.
3. If a finding supersedes an existing file, update that file rather than adding a duplicate, and
   note the date of the change at the top.
4. Do not record what the repository already shows (code structure, git history, lesson text) or
   what only mattered to one session. Record the non-obvious part.
