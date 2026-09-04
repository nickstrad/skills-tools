# Validation harness

How `tools/validate.ts` behaves and how to read what it prints. Last updated 2026-09-03.

SQLite integration notes added 2026-09-04.

## What happened

- `deno run -A tools/validate.ts <course> [--from N] [--to N] [--timeout MS] [slug|ordinal ...]`
  drives one persistent REPL (or Bash session) per lesson session and prints every labeled line.
- The final line, `N/N lessons completed without timeout`, counts only lessons whose commands
  returned before the timeout. A lesson that prints `priority_difference=unexpected` or
  `inventory_ok=no` still counts as completed. Lesson 46 of the Linux course was "passing" in two
  full runs while printing `unexpected` every time.
- The harness passes its whole environment into the sessions (`env: Deno.env.toObject()`), so
  course-specific variables such as `LINUX_LAB` can be set per run.
- Shell-mode sessions run `bash --noprofile --norc` with `LC_ALL=C`; they inherit the niceness,
  ulimits and cgroup of the process that launched the harness.

## Why it matters

A green count is not a passed course. Every fix in the SQLite and Linux reviews was found by reading
evidence lines against `expectedResult`, not by the count.

## How to apply

- After a full run, save the log and grep it for negative evidence before declaring success:

  ```sh
  LINUX_LAB=$CLAUDE_JOB_DIR/tmp/lab-full deno run -A tools/validate.ts linux > run.log 2>&1
  grep -n -iE 'unexpected|=missing|partial|not-observed|=no( |$)|unavailable|skipped|Traceback|error' run.log
  ```

  Then check every hit against the lesson's `expectedResult`; deliberate failures (an exit 7, an
  EMFILE message, a refused bind) are evidence, not bugs.
- For the lessons you touched, run them individually and read every line.
- Parallel runs (several agents, or root plus non-root) must not share a lab directory. For the
  Linux course set `LINUX_LAB` to a private path per run; for database courses use a private
  database or cluster. Lessons that must touch a global kernel object (cgroups, mounts) use
  `linux-tutor-$UID-...` names and their own cleanup trap for the same reason.
- After a run, distinguish leaked live processes from intentionally retained evidence. Linux cleanup
  exercises may require an empty lab; SQLite crash, backup and benchmark exercises retain named
  databases/logs for inspection. Do not delete those artifacts to make a generic cleanup rule appear
  satisfied.
- Two-session lessons are driven by the harness automatically (`sessions: 2`, `# Session A` /
  `# Session B` blocks).
- Never validate a two-session SQL lesson by flattening it into one sqlite3 stream. This produced
  false snapshot results, self-locking checkpoint errors and misleading shell-command errors in the
  SQLite rework. Use the real session splitter and inspect each connection's output.
- SQLite's course-local `tools/validate-course.ts` runs shell experiments in bounded child Bash
  processes and tool experiments through the native session-aware validator. `--isolated` gives each
  lesson a private lab; the explicit hot-journal prerequisite runs in a subshell so its variable
  assignments and EXIT trap cannot leak into recovery. The runner's results.json records completion
  status, not an automatic semantic verdict.
- Keep structural engine tests independent of curriculum display numbers. A regression test that
  assumed PostgreSQL lesson 11 always had a reading checkpoint failed when that course moved the
  checkpoint. Locate a checkpoint by metadata, then test its preservation; test identity by slug.
