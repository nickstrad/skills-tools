# Authoring a course

## The pedagogy

Before creating validation infrastructure, follow the repository's
[`VM resource and cleanup guidance`](../../docs/knowledge/vm-resource-cleanup.md). Budget the peak
footprint of primary/replica/restore copies, WAL, logs and preserved evidence. Stop owned processes
in failure cleanup, remove disposable state after acceptance, and record any evidence retained for a
pending audit with an explicit removal point. Check free space at validation checkpoints and clean
up again before declaring the whole task complete. Never remove learner lab state or progress as
validation cleanup.

The goal of every course is to make a systems idea concrete by _causing_ it and _observing_ it. Nick
studies around parenting and a full-time job and currently completes PostgreSQL Essentials lessons
in roughly ten minutes. Prefer short, bounded lessons centered on one mechanism. A lesson is one
complete study unit:

1. **Context**: explain the mechanism, terms, purpose, and experiment before commands.
2. **Mechanism map**: when useful, show a labelled terminal diagram of state, ownership, order,
   layout, contention, or flow and connect it to the evidence the learner will inspect.
3. **Setup and action**: prepare idempotently, then cause the phenomenon.
4. **Observation and expected evidence**: show exactly what to inspect and what proves the point.
5. **Interpretation**: connect the evidence to the mechanism, limits, and systems principle.
6. **Cleanup**: leave owned resources safe and ready for the next lesson.

Order modules so each one builds a mental model the next one needs. Storage before MVCC before
isolation before locking; the log before checkpoints before replication before CDC; and so on.
Combine mechanisms only when synthesis materially improves the course; a separate capstone is not a
quota.

The learner is a software engineer who wants to design and operate distributed systems, not a DBA.
They know basic SQL and a shell but not the tool's internals, so every lesson must explain its own
moving parts (see "Writing the pre-experiment explanation"). Prefer experiments that expose
invariants, orderings, failure modes, and trade-offs over tuning advice.

Calibrate assumed knowledge with the repository's
[`learner profile`](../../docs/learner-profile.md). Nick has substantial Kubernetes/Docker
experience and owns the repositories reviewed there. Compress familiar usage and elementary
architecture; keep full explanations for unfamiliar mechanisms. The projects are experience
evidence, not required implementations to copy or rebuild.

## Plan cheaply, then implement in small batches

Create `future-courses/<folder>/course.md` immediately as a persistent working draft. The
[planning guide](../../future-courses/README.md) owns research, scope, discussion and final-outline
sign-off; use its template and preserve one canonical ordered route. Planning creates no course
shell, lesson commands, lab or progress. Follow the
[batch workflow](../../docs/lesson-batch-workflow.md) after approval and a batch request.

Implement only the next small batch. Supply complete core commands whenever a mechanism is new and
put all required explanation before the experiment. Optional predictions or variations can deepen a
lesson, but they are not additional interaction stages or completion requirements. An
expected-result section must distinguish measured facts, documented guarantees, and inference. A
printed “success” message is not proof of an external effect; exercise the actual commit, process,
or resource boundary on which the conclusion depends.

All courses use the generic learner flow `tutor <course> route`, then
`tutor <course> <number> lesson|done`; `tutor <course> lesson` opens the next unfinished lesson.
Plan-only routes may show planned rows without creating progress. Do not create a course-specific
renderer or adapter. `pgcoach` remains the PostgreSQL Essentials entry point. Only explicit `done`
changes progress; optional source material and discussion never do. There is no mandatory review,
pause, homework, note, or answer-submission stage. Execution policy belongs to the
[batch workflow](../../docs/lesson-batch-workflow.md).

## The lesson contract

See `src/types.ts` for the `Lesson` type. Field notes:

| Field         | Meaning                                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`        | Stable kebab-case id; other lessons reference it in `prerequisites`. Renaming a slug orphans progress.                                             |
| `tags`        | 2-5 kebab-case topic labels used by topic search. Align them with the course's systems concepts; keep a vocabulary list in `courses/<id>/PLAN.md`. |
| `runIn`       | `tool` (inside psql/duckdb/sqlite3...), `shell`, or `mixed`.                                                                                       |
| `sessions`    | Number of concurrent tool sessions. Label steps `-- Session A` / `-- Session B`.                                                                   |
| `safetyLevel` | `read-only`, `writes-data`, `ddl`, `locking`, `privileged`, `dangerous`. `dangerous` means the lesson deliberately crashes or corrupts the lab.    |
| `minVersion`  | Version string the lesson was validated on; defaults to `course.json`.                                                                             |
| `revision`    | Defaults to `course.json` revision. Bump to re-serve a lesson that changed.                                                                        |

`code` is a raw tagged-template helper: backslashes are literal, so `\timing` and `\d` survive.
Avoid literal backticks and `${` inside a `code` template.

## Writing the pre-experiment explanation

The learner knows basic SQL and a shell, not the tool's internals, and reads the lesson cold,
without the context you had while writing it. `syntaxBreakdown` is where that context goes. Keep it
concise, use plain language, and include everything needed to run and interpret the experiment.
Lesson text is Markdown and the generic renderer may enhance it with ANSI colours when stdout is a
terminal. Meaning must never depend on colour. Backticks cannot appear inside a `code` template, so
name commands in **bold** rather than code spans.

```markdown
### In plain terms

Two to four sentences: the question, what the learner will cause and observe, and why it matters.
Define unfamiliar terms inline.

### Mechanism map

When the mechanism benefits from a picture, include a compact indented text diagram here, before any
setup or commands. Prefer using one rather than leaving ownership, ordering, timelines, page/tree
layout, contention, or log/checkpoint flow implicit. Label the actors and arrows, then add one or
two sentences connecting the picture to the exact evidence the experiment will show. ASCII must
carry the meaning; ANSI colour is optional enhancement only. Omit this heading when a diagram would
be decoration rather than explanation.

Use four-space indentation inside a TypeScript code template: literal backtick fences would close
the template string. Standalone Markdown plans can use fenced text diagrams.

### What you are learning

- Two to four short bullets, one concept each. Explain what each means in this experiment.

### Piece by piece

- **NAME AS IT APPEARS IN THE CODE** — say briefly what the unfamiliar command, flag, view, setting,
  function, or clause does here and which output proves the point.
```

Rules for `Piece by piece`:

- Cover every unfamiliar or mechanism-critical command, flag, function, backslash command, view,
  setting, extension, or clause in `setup`, `code`, and any core variation, in the order used.
  Explain related flags together when that is clearer and shorter.
- Skip plain `SELECT`/`INSERT`/`UPDATE`/`DELETE`/`CREATE TABLE` unless a clause is doing something
  unusual (`FOR UPDATE SKIP LOCKED`, `ON CONFLICT`, `RETURNING`, `\gset`, a `DO $$` block...).
- When a value must be substituted (a PID, an LSN, a file name, a port) say where it comes from.
- When a command prints columns, name the ones that matter and what a healthy value looks like.
- Say what happens if the step fails or is skipped when that is not obvious.

Write `caution` in the same voice: state the risk, what to do, and why, without assuming the reader
already knows the moving parts. A caution that needs a later module's concept should say "module 08
explains this" rather than use the concept unexplained.

## External sources

Technical sources can inform planning and fact checking, but lessons supply their own context and
commands. External sources are optional background and never a prerequisite, checkpoint or
completion stage. Retired reading metadata belongs in `archive/legacy-reading/`, outside active
curricula and the tutor schema; do not reintroduce assigned source stages.

## Build, validate, ship

```sh
deno task build <id>          # curriculum/*.ts -> lessons.json (validates structure)
deno task check               # fmt, lint, type-check every course
bin/tutor <id> init           # seed or refresh the progress database, keeping progress
bin/tutor <id> 1 lesson
```

Structural validation is not enough. Run every lesson against the real tool in a scratch lab before
shipping, and make `expectedResult` describe what actually happened.

## Adding a course

Do this only after its Markdown route under `future-courses/` is agreed. Planning alone never runs
this command.

```sh
deno task new-course duckdb "DuckDB Systems" duckdb "Columnar engine internals" 1.1
```

This creates `courses/duckdb/` with `course.json`, an empty `curriculum/mod.ts`, a link to its
canonical plan, and a wrapper skill under `courses/duckdb/skill/duckdb-tutor/`. No lesson, catalog
or progress is invented; author the requested batch before building. Install the skill by copying or
symlinking that directory into your agent's skills folder. The `curriculum-author` skill in
`skills/` walks an agent through the whole process.
