---
name: sqlite-tutor
description: "Guide a user through the hands-on SQLite Systems curriculum with the tutor CLI: serve the next or a numbered lesson, find lessons by concept, list modules, and record progress only when the user explicitly asks. Use for SQLite Systems curriculum, lesson, module, search, note, and progress requests; not for unrelated SQLite Systems troubleshooting."
---

# SQLite Systems Tutor

Use `/root/Software/skills-tools/curriculum-tools/bin/tutor sqlite` as the only interface to
curriculum content and progress. Never read or edit `courses/sqlite/lessons.json`, the curriculum
source, or the SQLite progress database directly. The CLI does not run lesson code; the user runs it
in `sqlite3` or a shell.

## Route the request

- Next unfinished lesson: `/root/Software/skills-tools/curriculum-tools/bin/tutor sqlite pretty`
- A specific lesson: `/root/Software/skills-tools/curriculum-tools/bin/tutor sqlite pretty NUMBER`
- Find lessons by concept:
  `/root/Software/skills-tools/curriculum-tools/bin/tutor sqlite search TEXT`, then `pretty NUMBER`
  if one is wanted.
- Next lesson on a topic the user is studying ("I'm reading about the buffer cache", "give me
  something on deadlocks"): run
  `/root/Software/skills-tools/curriculum-tools/bin/tutor sqlite topics` once to see the tag
  vocabulary with progress, pick the tags that fit what they described (map their words onto the
  vocabulary; a book chapter title usually maps to one tag), then
  `/root/Software/skills-tools/curriculum-tools/bin/tutor sqlite pretty --topic "TAG"`. If the first
  choice reports no match or is complete, try the next closest tag, then fall back to `search`. Tell
  the user which topic you matched.
- Module overview: `/root/Software/skills-tools/curriculum-tools/bin/tutor sqlite modules`
- List or filter:
  `/root/Software/skills-tools/curriculum-tools/bin/tutor sqlite list [--todo|--done] [--category NAME] [--topic TEXT] [--limit N]`
- Topic vocabulary with progress:
  `/root/Software/skills-tools/curriculum-tools/bin/tutor sqlite topics`
- Progress summary: `/root/Software/skills-tools/curriculum-tools/bin/tutor sqlite status --json`
- Record completion (explicit request only):
  `/root/Software/skills-tools/curriculum-tools/bin/tutor sqlite done NUMBER [--note TEXT]`
- Reverse completion: `/root/Software/skills-tools/curriculum-tools/bin/tutor sqlite undone NUMBER`
- Save a note: `/root/Software/skills-tools/curriculum-tools/bin/tutor sqlite note NUMBER TEXT`
- Skip (explicit request only):
  `/root/Software/skills-tools/curriculum-tools/bin/tutor sqlite skip NUMBER`

If a command reports the progress database is not initialized, run
`/root/Software/skills-tools/curriculum-tools/bin/tutor sqlite init` once and retry. If it reports
`lessons.json` is missing, run `deno task build sqlite` in the tool directory, then `init`, then
retry.

After a known course update, run `init` once before serving a lesson so the CLI refreshes content,
revisions and display order. Refresh preserves identity by slug, including retired history; it does
not mark any lesson complete. Resolve old lesson numbers through `search` rather than assuming an
ordinal still names the same experiment. Authoring/tests must use an explicit copied `--db` path,
never the learner's real progress file as a test fixture.

## Present one lesson

Paste the `pretty` output verbatim: it is Markdown, it always contains `Lesson ID:`, and the exact
code is in the fenced block under `## Run`. Never shorten, paraphrase, or re-wrap these
learner-facing sections: `Optional reference`, `## Syntax breakdown`, and `## Study checkpoint`.
They are written for a learner without internals background and must reach them whole. Then coach:
if the lesson says it needs multiple sessions, tell the user to open that many terminals and label
them Session A/B as the code does. Ask the user to predict the result before running when a
`## Challenge` or a surprising `## Expected result` is present. After they report what they saw,
compare it with `## Expected result` and explain any difference through `## Systems lens`.

An `Optional reference` never interrupts the lesson flow. If the lesson ends with
`## Study checkpoint`, tell the learner to stop after the experiment and complete its `Core` items
before requesting the next lesson. `Optional depth` is enrichment, not a prerequisite. The tutor
does not track resource completion separately and must not mark the experiment complete merely
because the learner read the checkpoint material.

Warn if the user's tool version is below `minVersion` (`show NUMBER --json`). Use `--json` only when
structured fields are needed.

## Open the lab sessions

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

This is a second transactional-storage course after PostgreSQL. Coach the SQLite mechanism and
application responsibility that differ; do not add another general SQL/transaction tutorial unless
the learner needs it. For incidents, stop at the marked prediction/diagnosis point before revealing
the remedy. For the final ADR, script success produces evidence, not a completed architecture
decision. Required capability failures and unavailable tracing are not successful experiments.

## Progress invariants

- The lesson `ordinal` is the number the user sees.
- Never mark completion because a lesson was shown, copied, or explained. Mark it only after an
  explicit request such as "done", "I ran it", or "mark 12 complete"; resolve "it" to the last
  lesson shown only when unambiguous.
- Prefer `pretty` over computing the next lesson yourself; it handles skipped and stale lessons.
- Pass note text as one argument and report command errors instead of assuming success.
