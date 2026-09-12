# Shared concise course CLI

Updated 2026-09-12. The learner chose the existing text CLI, not React/Ink. The shared Deno
engine supports `tutor <course> <n> lesson|done`, `lesson` for the next unfinished lesson, and
`route` for the full route. Legacy show/pretty/done-number spellings remain compatible.

## Route identity and cheap planning

`curriculum-tools/src/route.ts` reads an implemented catalog plus its PLAN.md, or a matching
`future-courses/<folder>/course.md`. A future plan declares its Course ID in backticks and uses
the template's numbered title/slug table. Numbers must be sequential and slugs unique. Only one
future plan may declare an ID. Plan/catalog ordinal and slug mismatches fail instead of hiding
implemented lessons. Existing PostgreSQL Essentials also retains its pgcoach route renderer.

`route` reads an existing progress database read-only and never initializes one. It resolves
completion by stable slug and current catalog revision, showing `[done]` for current completions,
`[revisit]` for stale completions, and available/planned content status. A plan-only course is
browsable without a catalog, lab, or progress. Planned lessons cannot be opened or completed.
Do not copy reference progress into a future essentials course.

## One lesson output

Required context and terminal diagrams precede setup/commands; expected evidence and interpretation
follow in the same output. `syntaxBreakdown` carries Markdown diagrams without a new schema or
course-specific renderer. Use indented blocks inside TypeScript template strings; literal backtick
fences terminate those strings. Colour cannot carry meaning by itself. Legacy `studyCheckpoint`
items and variations now render as optional depth, not progression requirements.

PostgreSQL Essentials folds its former review into lesson; review/start/full are hidden aliases.
The separate Go systemscoach engine keeps JSON routes and atomic completion receipts, but adopts
the same learner flow. Existing review.md content is appended below the learner task. New project
lessons need only lesson.md; the meaningful learner-work contract remains intact. Old honest
estimates remain valid, while new lessons target about ten minutes and a fifteen-minute core cap.

## Verification

The 41 Deno tests cover all implemented courses, numbered lesson/done, complete evidence output,
diagram ordering, route completion/revisions, planned boundaries, unchanged progress bytes, and
missing progress not being created. Deno formatting/lint/type checks and Go tests/vet also pass.
Tests use disposable state and do not run database experiments. No new SQLite lessons were authored
or validated; its 32-lesson route and timing are proposals. Learner PostgreSQL remained reachable
at /tmp port 5440, database lab, data_directory /labs/pglab/primary. No author cluster or retained
lab evidence was allocated by this CLI/docs task.
