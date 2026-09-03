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
Prefer experiments that expose invariants, orderings, failure modes, and trade-offs over tuning
advice.

## The lesson contract

See `src/types.ts` for the `Lesson` type. Field notes:

| Field         | Meaning                                                                                                                                                                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`        | Stable kebab-case id; other lessons reference it in `prerequisites`. Renaming a slug orphans progress.                                                                                                                                                                                                          |
| `tags`        | 2-5 kebab-case topic labels. `tutor <id> next --topic TEXT` serves the next unfinished lesson whose tags/category/title match every word, and `topics` lists them. Align tags with the chapters of the canonical book for the tool plus systems concepts, and keep a vocabulary list in `courses/<id>/PLAN.md`. |
| `runIn`       | `tool` (inside psql/duckdb/sqlite3...), `shell`, or `mixed`.                                                                                                                                                                                                                                                    |
| `sessions`    | Number of concurrent tool sessions. Label steps `-- Session A` / `-- Session B`.                                                                                                                                                                                                                                |
| `safetyLevel` | `read-only`, `writes-data`, `ddl`, `locking`, `privileged`, `dangerous`. `dangerous` means the lesson deliberately crashes or corrupts the lab.                                                                                                                                                                 |
| `minVersion`  | Version string the lesson was validated on; defaults to `course.json`.                                                                                                                                                                                                                                          |
| `revision`    | Defaults to `course.json` revision. Bump to re-serve a lesson that changed.                                                                                                                                                                                                                                     |

`code` is a raw template
(`code\`...\``): backslashes are literal, so`\timing`and`\d`survive.
Avoid backticks and`${` inside
it.

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
