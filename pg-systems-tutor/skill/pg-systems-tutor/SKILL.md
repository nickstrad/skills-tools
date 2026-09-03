---
name: pg-systems-tutor
description: Guide a user through the local PostgreSQL systems curriculum, retrieve numbered or unfinished lessons, find lessons by concept, and explicitly record progress with the pgtutor CLI. Use for curriculum lessons, searches, notes, and progress requests; do not use for unrelated PostgreSQL troubleshooting.
---

# PostgreSQL Systems Tutor

Use `/root/Software/skills-tools/pg-systems-tutor/bin/pgtutor` as the sole interface to both
curriculum content and progress. It uses
`/root/Software/skills-tools/pg-systems-tutor/data/pg-systems-tutor.sqlite` by default. Do not read
or edit the JSON seed or SQLite database directly.

## Route the request

- Next unfinished lesson: run `pgtutor pretty`.
- Specific lesson: run `pgtutor pretty NUMBER`.
- Find lessons by concept: run `pgtutor search TEXT` for a compact match list. If the user wants one
  match explained, follow with `pgtutor pretty NUMBER`.
- List or filter lessons: run `pgtutor list`, adding only the requested status, category, or limit
  filters. Use `--json` only when the structured lesson fields are needed.
- Progress summary: run `pgtutor status --json`.
- Record explicit completion: run `pgtutor done NUMBER`, adding `--note TEXT` when supplied.
- Reverse completion: run `pgtutor undone NUMBER`.
- Save a note without completing: run `pgtutor note NUMBER TEXT`.
- Skip a lesson: run `pgtutor skip NUMBER`, only when the user explicitly asks.

If a requested database-backed command reports that the database is not initialized, run
`pgtutor init` once and retry that command. Do not initialize merely to answer an unrelated request,
and do not retry other errors as initialization failures. Never mark a lesson done, skipped, or todo
unless the user explicitly requests that state change.

The CLI only manages curriculum and progress; it does not execute lesson SQL against PostgreSQL. Do
not claim a lesson was run successfully based on showing, copying, or explaining it. Do not connect
to a PostgreSQL server unless the user separately asks for execution and provides the needed target
context.

## Present one lesson

Unless the user requests another format or multiple lessons, return exactly one lesson and use:

```text
Overview: <overview>
Syntax breakdown: <syntaxBreakdown>
Lesson ID: <ordinal>
Sql:
<sql>
```

Paste the `pgtutor pretty` output verbatim so the lesson ID is always present and its SQL remains
exact. Keep `Sql:` capitalization as emitted. Also warn if the user has identified a server version
below `minPgVersion`. Use `show NUMBER --json` only when structured fields such as `systemsLens`,
`expectedResult`, `safetyLevel`, or `minPgVersion` are needed for a follow-up.

If `pgtutor pretty` reports that all active lessons are complete, relay that result instead of
trying to calculate or invent another lesson. For search and list requests, return the compact
matching lesson numbers, categories, and titles unless the user asks for lesson content.

## Progress invariants

- Treat the lesson `ordinal` as the command number the user sees.
- Never mark completion based on showing, copying, or explaining a lesson.
- Mark completion only after an explicit request such as “done,” “I ran it,” or “mark 20 complete.”
  Resolve pronouns like “it” to the last lesson shown only when unambiguous.
- Prefer `pretty` rather than calculating the next lesson yourself; it handles skipped lessons and
  revised lessons.
- Use `show NUMBER --json` rather than reading the SQLite file directly.
- Preserve user-supplied note text as one CLI argument and report command errors rather than
  guessing that a mutation succeeded.
