---
name: postgres-tutor
description: "Guide a user through the hands-on PostgreSQL Systems curriculum with the tutor CLI: serve the next or a numbered lesson, find lessons by concept, list modules, and record progress only when the user explicitly asks. Use for PostgreSQL Systems curriculum, lesson, module, search, note, and progress requests; not for unrelated PostgreSQL Systems troubleshooting."
---

# PostgreSQL Systems Tutor

Use `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres` as the only interface to
curriculum content and progress. Never read or edit `courses/postgres/lessons.json`, the curriculum
source, or the SQLite progress database directly. The CLI does not run lesson code; the user runs it
in `psql` or a shell.

## Route the request

- Next unfinished lesson: `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres pretty`
- A specific lesson: `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres pretty NUMBER`
- Find lessons by concept:
  `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres search TEXT`, then
  `pretty NUMBER` if one is wanted.
- Next lesson on a topic the user is studying ("I'm reading about the buffer cache", "give me
  something on deadlocks"): run
  `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres topics` once to see the tag
  vocabulary with progress, pick the tags that fit what they described (map their words onto the
  vocabulary; a book chapter title usually maps to one tag), then
  `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres pretty --topic "TAG"`. If the
  first choice reports no match or is complete, try the next closest tag, then fall back to
  `search`. Tell the user which topic you matched.
- Module overview: `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres modules`
- List or filter:
  `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres list [--todo|--done] [--category NAME] [--topic TEXT] [--limit N]`
- Topic vocabulary with progress:
  `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres topics`
- Progress summary: `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres status --json`
- Record completion (explicit request only):
  `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres done NUMBER [--note TEXT]`
- Reverse completion:
  `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres undone NUMBER`
- Save a note: `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres note NUMBER TEXT`
- Skip (explicit request only):
  `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres skip NUMBER`

If a command reports the progress database is not initialized, run
`/root/Software/skills-tools/curriculum-tools/bin/tutor postgres init` once and retry. If it reports
`lessons.json` is missing, run `deno task build postgres` in the tool directory, then `init`, then
retry.

## Present one lesson

Paste the `pretty` output verbatim: it is Markdown, it always contains `Lesson ID:`, and the exact
code is in the fenced block under `## Run`. Never shorten, paraphrase, or re-wrap the
`Optional
reference`, `## Syntax breakdown`, or `## Study checkpoint` content: it is written for a
learner without internals background and must reach them whole. Then coach: if the lesson says it
needs multiple sessions, tell the user to open that many terminals and label them Session A/B as the
code does. Ask the user to predict the result before running when a `## Challenge` or a surprising
`## Expected result` is present. After they report what they saw, compare it with
`## Expected result` and explain any difference through `## Systems lens`.

An `Optional reference` never interrupts the lesson flow. If the lesson ends with
`## Study checkpoint`, tell the learner to stop after the experiment and complete its `Core` items
before requesting the next lesson. `Optional depth` is enrichment, not a prerequisite. The tutor
does not track resource completion separately and must not mark the experiment complete merely
because the learner read the checkpoint material.

Warn if the user's tool version is below `minVersion` (`show NUMBER --json`). Use `--json` only when
structured fields are needed.

## Progress invariants

- The lesson `ordinal` is the number the user sees.
- Never mark completion because a lesson was shown, copied, or explained. Mark it only after an
  explicit request such as "done", "I ran it", or "mark 12 complete"; resolve "it" to the last
  lesson shown only when unambiguous.
- Prefer `pretty` over computing the next lesson yourself; it handles skipped and stale lessons.
- Pass note text as one argument and report command errors instead of assuming success.
