# PostgreSQL lesson metadata retrofit

This metadata contract originated in the 96-lesson retrofit and now applies to the 92 active
PostgreSQL lessons. It makes the material understandable to a learner who knows basic SQL and a
shell but does not know PostgreSQL internals.

## Sources of truth

- `../../../curriculum-tools/docs/AUTHORING.md` defines the lesson metadata contract and exact
  Markdown learning template.
- `reading-map.md` assigns the citation for every lesson.
- `pg14-internals-chapters.md` explains what each cited chapter covers and what it does not.
- `research-notes.md` records doubtful mappings and settled judgement calls.
- The lesson's own `setup`, `code`, and `challenge` fields are the command inventory. Explain what
  they actually contain; do not invent steps.

Do not re-read or re-extract the PDF unless these four sources leave a specific factual ambiguity.

## Per-lesson changes

Every lesson gets:

1. A `reading` field. Use the exact line in the current `reading-map.md`.
2. A `readingNotes` field only when `reading` cites actual chapter coverage. In one or two short
   paragraphs, explain what mechanism the experiment makes visible, what the book adds, important
   PostgreSQL 14 versus 16 differences, and whether to read before or after the experiment. A
   `reading` line that says "not covered" never gets `readingNotes`.
3. A `syntaxBreakdown` with these headings exactly and in this order:
   - `### In plain terms`
   - `### What you are learning`
   - `### Piece by piece`

`In plain terms` answers what the experiment demonstrates, what the learner will see, and why it
matters. Define jargon inline. `What you are learning` contains two to five explanatory bullets.
`Piece by piece` covers, in execution order, every non-obvious command, flag, function, psql
command, catalog/view, extension, setting, and unusual SQL clause in `setup`, `code`, and
`challenge`. For each item say what it is, what it does here, and what evidence or output it gives
the learner. Explain flags separately. Use full sentences rather than label-like fragments.

## Frozen behavioral fields

These restrictions apply to a metadata-only assignment. The separately authorized systems
engineering refactor is governed by the course REWORK-PLAN and its acceptance records; it may change
behavior within that explicit scope. Original completed lessons 1–7 remain frozen.

This is a metadata retrofit. Unless the primary reviewer explicitly approves a correction, do not
change:

- `slug`, `title`, `difficulty`, `tags`, or `prerequisites`
- `overview`, `setup`, `code`, `expectedResult`, `systemsLens`, `challenge`, or `caution`
- `safetyLevel`, `runIn`, `sessions`, `minVersion`, or `estimatedMinutes`
- module order or imports

Never edit `lessons.json`, `progress.sqlite`, engine code, templates, skills, or documentation while
assigned a module retrofit.

## Review gates

- All active lessons have all three breakdown headings exactly once and in order.
- All active lessons have a `reading` line matching the current map.
- A lesson has `readingNotes` if and only if its reading line cites genuine chapter coverage.
- Every command and non-obvious operand from setup/run/challenge is represented in `Piece by piece`.
- No frozen field changes after normalizing whitespace for comparison.
- `deno task build postgres`, `deno task check`, and `deno task test` pass.
- `bin/tutor postgres init` preserves progress, and plain/ANSI `pretty` output is readable.

## Work allocation

Module files are assigned in disjoint batches so agents never edit the same file. Agents report
lesson slugs completed, uncertain technical claims, and any mapping they believe should be reviewed.
The primary agent audits and refactors all output, rebuilds generated artifacts, increments
explicitly changed lesson revisions (a course-wide revision change requires that scope to be
authorized), runs the checks, and records any durable new findings here or in `research-notes.md`.
