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
`tutor <course> <number> lesson|done|skip`; `tutor <course> lesson` opens the next eligible lesson.
`undone` restores a skipped lesson to eligibility. A skip is an explicit progress decision and is
shown separately from completion.
Plan-only routes may show planned rows without creating progress. Do not create a course-specific
renderer or adapter. Only explicit `done` records completion; `skip`, `undone`, and `note` are
explicit progress operations. Displaying a lesson, route or source material never writes progress.
There is no mandatory prediction, reveal, review, pause, homework, note, or
answer-submission stage. Execution policy belongs to the
[batch workflow](../../docs/lesson-batch-workflow.md).

New CLI logic, labs, fixtures, harnesses, and other course tooling follow the repository's
[Go-first language policy](../../AGENTS.md#language-policy). Lesson experiments continue to use
their tool's native commands. Every new lesson reserves meaningful learner work with a supplied
boundary, evidence to collect, and an attempt budget; see the repository's
[learner-work norm](../../docs/knowledge/learner-work.md).

## The lesson contract

Each lesson is a Markdown file at `courses/<id>/lessons/NN-<slug>.md`. The integer prefix supplies
the ordinal, and the filename slug must match the `slug` header. The complete minimal file grammar is:

````markdown
# <title>

slug: <kebab>
category: <text>
difficulty: beginner|intermediate|advanced
tags: a, b, c
prerequisites: slug-a, slug-b
safety: read-only|writes-data|ddl|locking|privileged|dangerous
run-in: tool|shell|mixed
sessions: 1..4
min-version: <string>
minutes: <integer >= 1>
revision: <integer >= 1>

## Overview
<markdown>

## Syntax breakdown
<markdown>

## Caution
<markdown>

## Setup
```<lang>
<verbatim commands>
```

## Run
```<lang>
<verbatim commands>
```

## Expected result
<markdown>

## Systems lens
<markdown>

## Optional variation
<markdown>
````

The title is the first line and is followed by a blank line. The header has one `key: value` per
line with no blank lines inside it, followed by a blank line before the sections. Every header key
shown above is required except `prerequisites`, and `min-version` is required with no default. The
required sections are exactly `Overview`, `Syntax breakdown`, `Run`, `Expected result`, and
`Systems lens`; `Caution`, `Setup`, and `Optional variation` are optional. Setup and Run bodies are
exactly one fenced block, copied verbatim. Ordinals are the zero-padded positive integer in the
filename prefix (two digits minimum), files sort by ordinal, and ordinals must be consecutive from
1 through the last lesson. Prerequisite slugs must name earlier lessons; they document sequencing
only, and the CLI does not gate lesson availability on their completion.

These fields and sections retain the following meanings:

| File element | Meaning |
| ------------ | ------- |
| `slug` | Stable kebab-case id; other lessons reference it in `prerequisites`. Renaming a slug orphans progress. |
| `category` | Lesson grouping used by list and module views; keep it aligned with the course route. |
| `difficulty` | `beginner`, `intermediate`, or `advanced`. |
| `tags` | Kebab-case topic labels used by topic search; they may be empty. Keep a vocabulary list in `courses/<id>/PLAN.md`. |
| `prerequisites` | Earlier lesson slugs that document sequence; the CLI does not use them as an availability gate. |
| `safety` | `read-only`, `writes-data`, `ddl`, `locking`, `privileged`, or `dangerous`; `dangerous` means the lesson deliberately crashes or corrupts the lab. |
| `run-in` | `tool`, `shell`, or `mixed`; `tool` runs inside the configured REPL. |
| `sessions` | Number of concurrent tool sessions; label steps `-- Session A` / `-- Session B`. |
| `min-version` | Required version string the lesson was validated on; it has no default. |
| `minutes` | Honest estimate of the lesson's core time. |
| `revision` | Increment when the available lesson changes materially so stale completion is served again. |
| `Overview`, `Syntax breakdown` | Required prose that gives the learner the question, mechanism, terms, and commands before the experiment. |
| `Caution` | Optional prose stating a concrete risk, response, and reason. |
| `Setup` | Optional fenced block that prepares the lesson's owned state. |
| `Run` | Required fenced block that causes the phenomenon. |
| `Expected result`, `Systems lens` | Required prose describing decisive evidence, interpretation, limits, and the systems principle. |
| `Optional variation` | Optional prose or commands for a bounded comparison outside the core path. |

Setup and Run bodies are fenced blocks copied verbatim; backslashes and backticks need no escaping;
a line of three or more backticks inside them forces a longer fence.

## Writing the pre-experiment explanation

The learner knows basic SQL and a shell, not the tool's internals, and reads the lesson cold,
without the context you had while writing it. Put that context in the Overview and Syntax breakdown.
Keep it concise, use plain language, and include everything needed to run and interpret the
experiment. Lesson text is Markdown and the generic renderer may enhance it with ANSI colours when
stdout is a terminal. Meaning must never depend on colour. Name commands in **bold** rather than
code spans when that keeps the explanation readable.

````markdown
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

Diagrams are ordinary fenced ```text blocks. Standalone Markdown plans can use the same fenced text
diagrams.

### What you are learning

- Two to four short bullets, one concept each. Explain what each means in this experiment.

### Piece by piece

- **NAME AS IT APPEARS IN THE CODE** — say briefly what the unfamiliar command, flag, view, setting,
  function, or clause does here and which output proves the point.
````

Rules for `Piece by piece`:

- Cover every unfamiliar or mechanism-critical command, flag, function, backslash command, view,
  setting, extension, or clause in Setup, Run, and any core variation, in the order used.
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
tutor <id> check              # validate lesson files and their canonical route
tutor <id> validate [--isolated] [slug|N ...]
tutor <id> init --db /tmp/tutor-authoring.sqlite
tutor <id> 1 lesson --plain --db /tmp/tutor-authoring.sqlite
```

Structural validation is not enough. Run every lesson against the real tool in a scratch lab before
shipping, and make the Expected result section describe what actually happened. Use an explicit
temporary `--db PATH` for authoring smoke tests; never initialize or refresh the learner's shared
database while authoring.

## Adding a course

Do this only after its Markdown route under `future-courses/` is agreed. Planning alone never runs
this command.

```sh
tutor new-course duckdb "Practical DuckDB: Data Flows" duckdb "Read, transform, validate, and export data" 1.1
```

This creates `courses/duckdb/` with `course.json`, an empty `lessons/` directory, and a link to its
canonical plan. No lesson or progress is invented; add the requested Markdown batch, then run
`tutor duckdb check` before initializing progress. The shared `tutor` skill and this
`curriculum-author` skill are installed separately from the course source.
