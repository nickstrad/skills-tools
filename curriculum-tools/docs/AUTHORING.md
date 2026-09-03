# Authoring a course

## The pedagogy

The goal of every course is to make a systems idea concrete by _causing_ it and _observing_ it, not
by reading about it. A lesson is an experiment:

1. **Setup**: idempotent preparation (create a table, generate rows, open a second terminal).
2. **Action**: do the thing (update a row, kill the server, pause replay, race two sessions).
3. **Observation**: look at the evidence (a page dump, a WAL record, a lock row, an error code).
4. **Expected result**: what the evidence should show, concretely enough to catch a mistake.
5. **Systems lens**: the general principle, and where it shows up in other systems.

Order modules so each one builds a mental model the next one needs. Storage before MVCC before
isolation before locking; the log before checkpoints before replication before CDC; and so on.
Finish with patterns that combine the pieces and a capstone that simulates an incident.

The learner is a software engineer who wants to design and operate distributed systems, not a DBA.
They know basic SQL and a shell but not the tool's internals, so every lesson must explain its own
moving parts (see "Writing the syntax breakdown"). Prefer experiments that expose invariants,
orderings, failure modes, and trade-offs over tuning advice.

## The lesson contract

See `src/types.ts` for the `Lesson` type. Field notes:

| Field          | Meaning                                                                                                                                                                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`         | Stable kebab-case id; other lessons reference it in `prerequisites`. Renaming a slug orphans progress.                                                                                                                                                                                                          |
| `tags`         | 2-5 kebab-case topic labels. `tutor <id> next --topic TEXT` serves the next unfinished lesson whose tags/category/title match every word, and `topics` lists them. Align tags with the chapters of the canonical book for the tool plus systems concepts, and keep a vocabulary list in `courses/<id>/PLAN.md`. |
| `reading`      | Optional. Where the course's canonical book covers this lesson, printed at the top of the write-up. See "The reading line".                                                                                                                                                                                     |
| `readingNotes` | Optional. How the experiment overlaps with the cited chapter, printed as its own section after the overview. Omit when the book does not cover the lesson. See "The reading line".                                                                                                                              |
| `runIn`        | `tool` (inside psql/duckdb/sqlite3...), `shell`, or `mixed`.                                                                                                                                                                                                                                                    |
| `sessions`     | Number of concurrent tool sessions. Label steps `-- Session A` / `-- Session B`.                                                                                                                                                                                                                                |
| `safetyLevel`  | `read-only`, `writes-data`, `ddl`, `locking`, `privileged`, `dangerous`. `dangerous` means the lesson deliberately crashes or corrupts the lab.                                                                                                                                                                 |
| `minVersion`   | Version string the lesson was validated on; defaults to `course.json`.                                                                                                                                                                                                                                          |
| `revision`     | Defaults to `course.json` revision. Bump to re-serve a lesson that changed.                                                                                                                                                                                                                                     |

`code` is a raw tagged-template helper: backslashes are literal, so `\timing` and `\d` survive.
Avoid literal backticks and `${` inside a `code` template.

## Writing the syntax breakdown

The learner knows basic SQL and a shell, not the tool's internals, and reads the lesson cold,
without the context you had while writing it. `syntaxBreakdown` is where that context goes. Write it
in plain language, in full sentences, and never compress an involved idea into a five-word blurb; a
reader must be able to follow the experiment without piecing together why each command is there.
Lesson text is Markdown (`tutor <id> pretty` prints Markdown and styles it with ANSI colours when
stdout is a terminal), so use the headings and bullets below exactly; backticks cannot appear inside
a `code` template, so name commands in **bold** rather than code spans.

```markdown
### In plain terms

Two to five sentences for someone with no internals background: what question the experiment
answers, what will happen in front of them, and why anyone building or operating software would
care. Define every technical term the first time it appears, in the same sentence.

### What you are learning

- Two to five bullets, one concept each: name the concept, then one or two sentences saying what it
  means. This is the list the learner should be able to explain afterwards.

### Piece by piece

- **NAME AS IT APPEARS IN THE CODE** (what kind of thing it is: shell program, flag, SQL function,
  psql backslash command, catalog view, configuration setting, extension, SQL clause)
  - What it is: one or two sentences.
  - What it does here: what running it in this lesson causes or shows. Flags get their own nested
    bullets, one per flag.
  - What it gives us: why the experiment needs it and how to read its output, naming the column,
    line, or number to look at.
```

Rules for `Piece by piece`:

- Cover every command, flag, function, backslash command, view, setting, extension, or clause in
  `setup`, `code`, and `challenge` that a reader who knows only basic SQL would not already
  understand, in the order they appear. Explain flags individually, not the command as a whole.
- Skip plain `SELECT`/`INSERT`/`UPDATE`/`DELETE`/`CREATE TABLE` unless a clause is doing something
  unusual (`FOR UPDATE SKIP LOCKED`, `ON CONFLICT`, `RETURNING`, `\gset`, a `DO $$` block...).
- When a value must be substituted (a PID, an LSN, a file name, a port) say where it comes from.
- When a command prints columns, name the ones that matter and what a healthy value looks like.
- Say what happens if the step fails or is skipped when that is not obvious.

Write `caution` in the same voice: state the risk, what to do, and why, without assuming the reader
already knows the moving parts. A caution that needs a later module's concept should say "module 08
explains this" rather than use the concept unexplained.

## The reading line

`reading` is optional metadata that prints as one line right after the `Meta`/`Topics` lines. Use it
when the course has a canonical book: a citation only (book, chapter number and exact title, section
when you are sure of it), no explanatory prose. If the book does not cover the lesson, say so
plainly and name the closest background chapter. Keep the course's chapter digest in
`courses/<id>/docs/` so every author cites the same titles.

When a lesson cites a chapter, also fill `readingNotes`: one or two short paragraphs on how the
experiment overlaps with the book. Say which mechanism, structure, or section the lesson shows live,
what the book explains that the experiment does not, where the lesson goes beyond or differs from
the book (a newer tool version, a different view name), and whether to read the chapter before or
after running the lesson. Leave it out when there is no overlap; a citation that says "not covered"
never carries notes.

## Build, validate, ship

```sh
deno task build <id>          # curriculum/*.ts -> lessons.json (validates structure)
deno task check               # fmt, lint, type-check every course
bin/tutor <id> init           # seed or refresh the progress database, keeping progress
bin/tutor <id> pretty 1
```

Structural validation is not enough. Run every lesson against the real tool in a scratch lab before
shipping, and make `expectedResult` describe what actually happened.

## Adding a course

```sh
deno task new-course duckdb "DuckDB Systems" duckdb "Columnar engine internals" 1.1
```

This creates `courses/duckdb/` with `course.json`, a starter `curriculum/01-lab.ts`, and a wrapper
skill under `courses/duckdb/skill/duckdb-tutor/`. Install the skill by copying or symlinking that
directory into your agent's skills folder. The `curriculum-author` skill in `skills/` walks an agent
through the whole process.
