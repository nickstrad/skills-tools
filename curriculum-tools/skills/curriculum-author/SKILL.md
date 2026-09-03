---
name: curriculum-author
description: Create or extend a hands-on systems curriculum for a database or infrastructure tool (DuckDB, SQLite, Redis, Kafka...) in the tutor engine, matching the PostgreSQL course's experiment-driven pedagogy. Use when the user asks to add a course, write or revise lessons or modules, validate lessons against the real tool, or install a course's wrapper skill.
---

# Curriculum author

The tutor engine lives in the directory containing this file's grandparent
(`TUTOR=/root/Software/skills-tools/curriculum-tools` unless the user says otherwise). One engine,
one course per tool under `$TUTOR/courses/<id>/`:

```text
courses/<id>/course.json            id, name, tool, minVersion, revision
courses/<id>/curriculum/mod.ts      MODULES array = lesson order
courses/<id>/curriculum/NN-*.ts     one Module per file, lessons as typed drafts
courses/<id>/lessons.json           BUILT artifact, never hand-edit
courses/<id>/skill/<id>-tutor/      the wrapper skill for that course
courses/<id>/progress.sqlite        learner progress, never touch
```

Read `$TUTOR/docs/AUTHORING.md` before writing any lesson; it defines the lesson contract and the
pedagogy. Use `$TUTOR/courses/postgres/curriculum/` as the reference implementation.

## Workflow

1. **Scaffold** a new course (skip if it exists):
   `cd $TUTOR && deno task new-course <id> "<Name>" <tool> "<one-line description>" <minVersion>`
2. **Plan the modules** with the user before writing lessons: list 8-15 modules in dependency order,
   each named for the systems idea it makes concrete, with 4-10 experiments per module. A module is
   not a topic tour; it is a sequence of experiments that build one mental model. Write the plan to
   `courses/<id>/PLAN.md` with one numbered entry per lesson: fixed slug, what the lesson causes and
   observes, key commands, the expected outcome, and the systems lens. Fixed slugs let modules be
   written in parallel and referenced as prerequisites before they exist. Then create one stub file
   per module (`export const NAME: Module = { category, title,
   lessons: [] }`) and register all
   of them in `curriculum/mod.ts` in teaching order, so parallel authors only ever edit their own
   file and the course always builds.
3. **Write lessons** as `Draft` objects in `curriculum/NN-<module>.ts` using the `code` tag from
   `src/types.ts` (raw template, so backslash commands survive). Every lesson MUST cause a
   phenomenon and then observe it: setup, action, observation, expected result, systems lens.
   Read-only "look at this view" lessons are only acceptable as the observation half of an
   experiment. Prefer two-session experiments for anything about concurrency.
4. **Register** each module in `curriculum/mod.ts` in teaching order. Prerequisites are slugs and
   must point backwards.
5. **Build and check**: `deno task build <id>` then `deno task check`. The build rejects duplicate
   slugs, forward prerequisites, empty fields, and invalid enums.
6. **Validate against the real tool.** Never ship code you have not run. Create the lab the first
   lesson describes, then run every lesson with `tools/validate.ts` (see `docs/VALIDATION.md`),
   which drives one real REPL process per session. Record the actual output and make
   `expectedResult` match it. Fix or drop anything that does not reproduce. To conserve the
   orchestrating model's budget, delegate writing and validating each module to a subagent: give it
   the PLAN.md section, the reference module, the harness docs, and its own scratch database
   (`PGDATABASE=lab_<module>` overrides the harness env), and require a per-lesson report with the
   real output lines that prove the phenomenon. Then verify: read the module, rerun two or three
   lessons yourself (multi-session ones first), and run `deno task check`. Modules that restart,
   crash, or replicate the lab must run serially, never alongside another author.
7. **Initialize and smoke-test**: `bin/tutor <id> init`, `bin/tutor <id> modules`,
   `bin/tutor <id> pretty 1`. Bump `course.json` `revision` when existing lessons change materially
   so completed lessons become stale and are re-served.
8. **Install the wrapper skill**: copy or symlink `courses/<id>/skill/<id>-tutor` into the user's
   skills directory (for example `~/.claude/skills/` or `~/.codex/skills/`) and report the path. The
   wrapper skill is generated from `templates/course/skill/`; keep its progress invariants intact.

## Quality bar for every lesson

- `overview`: what you are about to observe and why a systems engineer cares (2-4 sentences).
- `syntaxBreakdown`: every new command, function, flag, or catalog in one sentence each.
- `setup` (optional): idempotent preparation; the learner may re-run it.
- `code`: the experiment in execution order. Multi-session steps are labelled `-- Session A` /
  `-- Session B` (use the tool's comment syntax); note where a step blocks and what unblocks it.
- `expectedResult`: concrete, checkable, including the specific error text or counter that proves
  the point. If timing-dependent, say what varies.
- `systemsLens`: the general principle (log-structured storage, snapshot isolation, quorum,
  backpressure, GC horizons, fencing, idempotency...) and where else it shows up.
- `challenge` (optional): a prediction to make or a variation to run.
- `safetyLevel`, `runIn`, `sessions`, `estimatedMinutes`: honest.
- `tags`: 2-5 labels from the course's vocabulary in `PLAN.md` (the canonical book's chapter names
  first, then systems concepts) so `tutor <id> pretty --topic "..."` can serve the next unfinished
  lesson on whatever the learner is currently reading about.
- Nothing in a lesson may target a database or directory the learner did not create in the lab.

## Lessons from the PostgreSQL pass

- The harness only detects timeouts. A lesson whose SQL errors still "passes", so grep every
  validation run for `ERROR` before trusting it, and read the output against `expectedResult`
  yourself; subagents routinely report PASS on lessons that printed an error mid-way.
- Validate each lesson on its own, not only in module order. A lesson may only depend on state that
  its own `setup` recreates or that an explicit prerequisite lesson leaves behind and says so.
- Lessons that crash, restart, or reconfigure the server cannot run through the harness; split them
  into a tool part, a shell part, and a tool part, validate the pieces by hand, and run that module
  alone on the cluster.
- Two-session lessons that inspect catalogs need a third session when one session holds a
  repeatable-read snapshot: it cannot see rows the other session created after the snapshot.
- Tool-specific traps are worth recording in `PLAN.md` conventions as they are found (for
  PostgreSQL: `xid` has no ordering operator, use `age(xid)`; same-cluster logical subscriptions
  hang unless the slot is created first; `\watch` must be bounded; statistics resets should be
  scoped so parallel authors do not erase each other's counters).
- Quote real numbers in `expectedResult` and say which ones move between runs and by how much; costs
  and record types reproduce exactly, timings and sampled estimates do not.

## Do not

- Do not hand-edit `lessons.json` or `progress.sqlite`.
- Do not write lessons that only print catalog contents.
- Do not mark lessons done on the learner's behalf; that is the wrapper skill's job, on request.
