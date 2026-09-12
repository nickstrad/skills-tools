---
name: sqlite-tutor
description: "Guide a user through the hands-on SQLite Systems curriculum with the tutor CLI: serve the next or a numbered lesson, find lessons by concept, list modules, and record progress only when the user explicitly asks. Use for SQLite Systems curriculum, lesson, module, search, note, and progress requests; not for unrelated SQLite Systems troubleshooting."
---

# SQLite Systems Tutor

Use `/root/Software/skills-tools/curriculum-tools/bin/tutor sqlite` (CLI below) for curriculum
content and progress. Never read or edit generated `courses/sqlite/lessons.json`, curriculum source,
or learner progress directly for serving lessons. The CLI prints content; the learner runs the
supplied experiment in sqlite3 or a shell.

## Route requests

- Full route with completed, available, and planned entries: `CLI route` (read-only).
- Next unfinished lesson: `CLI lesson`.
- Numbered complete lesson: `CLI NUMBER lesson`.
- Completion, only on explicit request: `CLI NUMBER done [--note TEXT]`.
- Search or topics: `CLI search TEXT`, `CLI topics`, then `CLI lesson --topic TEXT` or a numbered
  lesson.
- Overview: `CLI modules`, `CLI list`, `CLI status --json`.
- Explicit corrections: `CLI undone NUMBER`, `CLI skip NUMBER`, or `CLI note NUMBER TEXT`.

CLI is an abbreviation for the absolute command above. Legacy pretty/show and done NUMBER syntax
remain compatible, but lesson → done is the shared flow for every course. Use `show NUMBER --json`
only when structured data is needed. `--db PATH` selects isolated progress for author checks.

If progress is uninitialized, run `CLI init` and retry. If a built catalog is missing, build this
implemented course from curriculum-tools and initialize it; a future-course plan alone is not
permission to author or scaffold a course. After a known content update, init refreshes metadata
without completing lessons. Preserve stable identity; find moved lessons by title/slug, not old
numbers.

## Present one complete lesson

Show the explanation, terminal diagrams, exact setup/code, expected results, interpretation, and
cleanup together. Essential concepts and unfamiliar commands must appear before the experiment.
There is no separate review step, required prediction response, written report, or reading stop.
Offer focused help when requested instead of imposing a series of coaching stages.

ASCII/ANSI terminal diagrams are first-class teaching content. Preserve their labels, alignment, and
placement before setup. Lean toward adding a small explanatory diagram when a mechanism benefits:
ownership, state changes, competing timelines, tree/page layouts, queues, or log flow. Keep it
readable without color and explain its connection to the observation. Do not alter supplied
experiment commands or claim an improvised variation has been validated.

Optional references, variations, and legacy study-checkpoint excerpts never block progression. For a
full lesson request, preserve all experiment content and cautions; for a narrower question, answer
it directly. Existing long reference lessons keep their honest estimates. New lessons target about
ten minutes including context and cleanup, with a fifteen-minute core ceiling.

## Reference course and lab

The existing 54-lesson SQLite Systems course remains reference. The proposed shorter route lives in
`/root/Software/skills-tools/future-courses/sqlite/course.md`; do not invent an available
`sqlite-essentials` course or substitute reference completion for it.

Before the first tool lesson, have the user run this in every terminal (lesson 1 creates the
directory; lesson code calls `.shell` with `$TUTOR_SQLITE_DB`):

```
export SQLITE_LAB="$PWD/sqlite-lab"
export TUTOR_SQLITE_DB="$SQLITE_LAB/lab.db"
sqlite3 "$TUTOR_SQLITE_DB"
```

"The wrapper" in lesson text is this opened `sqlite3`; `bin/sqlite-repl` is only the harness's
launcher. Before a lesson's `Setup:`, have the user `.quit` every other `sqlite3` session on the lab
(journal-mode switches fail with "database is locked"); multi-session lessons then reopen theirs.

Teach the SQLite mechanism that differs from PostgreSQL. Preserve the old course's exact experiments
and capability checks. Its long capstone/ADR is reference material, not a required written report in
the concise flow. Missing required capabilities or tracing are not successful experiments.

## Progress invariants

- Showing, explaining, or author-validating a lesson never marks it done.
- Complete only on an explicit request such as “done” or “mark 12 complete”; resolve the course and
  lesson from recent context only when unambiguous. Do not infer completion from pasted output.
- Let the CLI select the next unfinished lesson; it handles skipped and stale entries.
- Pass note text as one argument, preserve unrelated progress, and report command errors.
