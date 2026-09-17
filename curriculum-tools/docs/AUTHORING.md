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

Across all courses, use the [simple lab lifecycle](../../docs/knowledge/learner-work.md#simple-lab-lifecycle):
one setup command prepares fixtures and editable starter files, the learner works on the target
mechanism, and one cleanup command retires owned resources. Put repeated exports, connection
plumbing, file-writing scaffolding and teardown behind reusable helpers. Keep the relevant SQL,
commands and evidence visible and the learner's meaningful decisions unfinished. Apply this to
new lessons and revisions; do not require learners to rebuild the same shell setup each time.
For an unfamiliar tool, executing its CLI is part of the learner work: show the database/input
arguments and relevant flags, with a short explanation. In DuckDB, keep `duck` calls visible
instead of replacing them with `duck_run`; the thin version/settings wrapper is sufficient.
Setup should create a populated starter and explicitly tell the learner to edit and save it.
Offer **Setup - script** and **Setup - manual** when the software's preparation is useful practice.
Both may use infrastructure helpers; manual exposes native commands, SQL, connections and settings.
Explain equivalent starting state, choose-one semantics and connection lifetime. Keep a common
Run/cleanup and validate both paths. Apply this convention across new and revised courses.
Verify both source and rendered lesson content. When catalog rollout is authorized, test on a copy,
refresh through `tutor COURSE init`, and verify progress preservation and actual displayed text.

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
`Systems lens`; `Caution`, `Setup`, and `Optional variation` are optional. Run is exactly one
fenced block. Setup is either one fenced block or the two choices described below.
Ordinals are the zero-padded positive integer in the
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
| `Setup` | Optional preparation: one fenced block, or script/manual alternatives described below. |
| `Run` | Required fenced block that causes the phenomenon. |
| `Expected result`, `Systems lens` | Required prose describing decisive evidence, interpretation, limits, and the systems principle. |
| `Optional variation` | Optional prose or commands for a bounded comparison outside the core path. |

Run and legacy Setup blocks are copied verbatim; backslashes and backticks need no escaping;
a line of three or more backticks inside them forces a longer fence.

For setup choices, start the Setup body with exactly `### Setup - script`, then add
`### Setup - manual`. Each may include concise prose explaining its purpose and expected evidence.
Script contains exactly one nonempty fenced command block; manual contains one or more.
Use the lesson's execution language in every executable block. Explain that the learner chooses
one option and both feed the same Run/cleanup. The renderer preserves these as Markdown.
The existing setup catalog field stores this text; no progress schema change is needed.
Generic validation executes only the script block. Validate the manual blocks with the real
tool too, including explicitly expected failures that may need driver-side handling.

````markdown
## Setup
### Setup - script

Choose one option. This helper performs the software preparation for you.

```sh
source /path/to/lab/session.sh 1
```

### Setup - manual

Prepare the same fixture, then execute the software's native setup and inspection commands.
Supply those actual commands here; do not leave a placeholder in an authored lesson.

```sh
source /path/to/lab/session.sh 1 manual
tool --database "$LAB/database" --command 'native setup and inspection'
```
````

## Formatting SQL

Format SQL before you validate it, so learners read (and validation runs) the formatted form. Use
`sql-formatter` (`npm install -g sql-formatter`; see `kb show data/sql-formatter.md`) with the
dialect of the lesson's tool:

```sh
sql-formatter -l postgresql --fix courses/<id>/lab/<file>.sql   # rewrite a SQL file in place
sql-formatter -l duckdb < statements.sql                        # print formatted statements
```

The repository-root `.sql-formatter.json` applies from any directory in the repository. It keeps
keyword case as written (follow the course's existing case), puts short lists such as `VALUES`
rows on one line, and leaves psql variables (`:name`, `:'name'`, `:"name"`) and SQLite/DuckDB
parameters (`?`, `?1`, `$1`, `@name`, `$name`) intact. Its `paramTypes` replace each dialect's own
parameter rules, so keep all of these forms when editing it. Use `-l postgresql`, `-l duckdb` or
`-l sqlite`; the default dialect rejects syntax such as `::` casts. The config is found only from
inside the repository: when formatting a copy elsewhere, pass `-c <repo>/.sql-formatter.json`.

Apply this to `sql` fenced Setup and Run blocks, `lab/*.sql` starters and fixtures, and validation SQL.
Comments such as `-- Session A` stay in place. When the tool cannot take the SQL, format it by hand in
the same style (one clause per line, two-space indentation, a blank line between statements):

- psql meta-commands (`\gset`, `\echo`, `\d`) make the formatter fail. Format the statements between
  them and keep each meta-command where it was; `\gset` stays on the last line of its query.
- SQL inside shell strings (`psql -c '...'`, heredocs) is formatted by hand; a short one-statement
  `-c` string may stay on one line.
- Bodies inside `$$ ... $$` are left unformatted by the tool. For SQL passed as a string, such as
  DuckDB's `postgres_query('app', $$ ... $$)`, format the inner query with its own dialect and
  indent it inside the call.
- `CREATE TRIGGER ... BEGIN ... END;` comes out flattened (and `AFTER UPDATE` is split). Keep the
  header on one line (`WHEN` on the next), then indent the formatted body statements between
  `BEGIN` and `END;`.
- Tidy these layouts after formatting: a standalone `SET\n  name = value;` (including `set local`)
  becomes one line (not `UPDATE ... SET`); `GRANT\nSELECT\n  ON ...` becomes `GRANT SELECT ON ...;`;
  the DuckDB dialect's `TRY_CAST (` becomes `TRY_CAST(`; `explain (...)` and `vacuum (...)` options,
  `filter (where x)`, `drop table a, b;` and short function calls such as
  `md5(string_agg(x, ',' order by id))` go back on one line. Scalar subqueries stay expanded.
- psql: keep a trailing `\gset`/`\gexec` attached to the query it runs (end of its last line, or
  the next line when the author put it there), and keep each `-- Session` header directly above
  its step. Format the SQL inside indented Optional-variation code blocks too, keeping the indent.
- Leave one-line SQL inside shell plumbing (`test "$(sqlite3 ...)"`, FIFO `echo ... >&3`, `strace`
  wrappers) as it is; format `<<'SQL'` heredoc bodies instead.

The formatter does not check SQL: always run the result against the real tool. Reformatting an
existing lesson is editorial-only (no `revision` bump), but still run `tutor <id> check` and re-validate
the affected experiment.

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
