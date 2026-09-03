# Validating lessons against a real lab

`tools/validate.ts` exists because structural checks cannot tell you whether an experiment actually
shows what it claims. It drives the course's real REPL (psql, duckdb, sqlite3...) with one process
per session and feeds each lesson's `setup` and `code` in order, so multi-session experiments (lock
waits, serialization failures, deadlocks) run exactly as a learner would run them in two terminals.

## How it was used for the PostgreSQL course

1. Build the lab from lesson 1 verbatim, as the postgres OS user:
   `python3 -c "import json;print(json.load(open('courses/postgres/lessons.json'))[0]['code'])" > /tmp/lesson1.sh`
   then `su - postgres -c 'bash /tmp/lesson1.sh'`. This is the only supported way to get a lab; if
   lesson 1 does not produce a working cluster, fix lesson 1.
2. Point the harness at it. `courses/postgres/course.json` carries the default `repl.env` (socket
   /tmp, port 5440, database lab). Override per run with normal environment variables, for example
   `PGDATABASE=lab_storage` to give one module its own database on the shared cluster.
3. Run a range or specific lessons and read the output:
   `deno run -A tools/validate.ts postgres --from 5 --to 13`
   `deno run -A tools/validate.ts postgres write-skew serializable-ssi`
4. Compare every session's output with the lesson's `expectedResult`. The harness only knows about
   timeouts; a lesson that prints the wrong thing, or an `ERROR:` line, still "passes", so grep the
   output for `ERROR` and read it. Fix the lesson (or the expectation) until the text describes what
   really happens, then rebuild with `deno task build postgres` and rerun.
5. Shell lessons (`runIn: "shell"`) are listed and skipped. Run those by hand as the lab OS user and
   paste the real output into `expectedResult`.

## Conventions the harness relies on

- Step headers: a line starting with `-- Session A` (or `#`/`//` comment prefixes) begins a step for
  that session. Code before the first header belongs to Session A.
- Blocking steps: a header containing `(blocks` (for example
  `-- Session B (blocks until A
  commits)`) is sent without waiting. The next step for another
  session usually unblocks it.
- Long waits: default step timeout is 30 s (`--timeout MS`). Lessons that use `\watch` must use a
  bounded form (`\watch i=1 c=3`) or the step never finishes.
- Markers: the harness appends the REPL's `echo` command with a unique marker after each step to
  detect completion; those lines are filtered from the output.

## Adding a course

Add a `repl` block to the course's `course.json` (`command`, `echo` with `{marker}`, `quit`,
optional `env`). SQL REPLs with `.print` (duckdb, sqlite3) and psql's `\echo` both work.
