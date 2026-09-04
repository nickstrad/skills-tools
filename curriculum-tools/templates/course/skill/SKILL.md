---
name: {{id}}-tutor
description: "Guide a user through the hands-on {{name}} curriculum with the tutor CLI: serve the next or a numbered lesson, find lessons by concept, list modules, and record progress only when the user explicitly asks. Use for {{name}} curriculum, lesson, module, search, note, and progress requests; not for unrelated {{name}} troubleshooting."
---

# {{name}} Tutor

Use `{{tutor_path}} {{id}}` as the only interface to curriculum content and progress. Never read or
edit `courses/{{id}}/lessons.json`, the curriculum source, or the SQLite progress database directly.
The CLI does not run lesson code; the user runs it in `{{tool}}` or a shell.

## Route the request

- Next unfinished lesson: `{{tutor_path}} {{id}} pretty`
- A specific lesson: `{{tutor_path}} {{id}} pretty NUMBER`
- Find lessons by concept: `{{tutor_path}} {{id}} search TEXT`, then `pretty NUMBER` if one is
  wanted.
- Next lesson on a topic the user is studying ("I'm reading about the buffer cache", "give me
  something on deadlocks"): run `{{tutor_path}} {{id}} topics` once to see the tag vocabulary with
  progress, pick the tags that fit what they described (map their words onto the vocabulary; a book
  chapter title usually maps to one tag), then `{{tutor_path}} {{id}} pretty --topic "TAG"`. If the
  first choice reports no match or is complete, try the next closest tag, then fall back to
  `search`. Tell the user which topic you matched.
- Module overview: `{{tutor_path}} {{id}} modules`
- List or filter:
  `{{tutor_path}} {{id}} list [--todo|--done] [--category NAME] [--topic TEXT] [--limit N]`
- Topic vocabulary with progress: `{{tutor_path}} {{id}} topics`
- Progress summary: `{{tutor_path}} {{id}} status --json`
- Record completion (explicit request only): `{{tutor_path}} {{id}} done NUMBER [--note TEXT]`
- Reverse completion: `{{tutor_path}} {{id}} undone NUMBER`
- Save a note: `{{tutor_path}} {{id}} note NUMBER TEXT`
- Skip (explicit request only): `{{tutor_path}} {{id}} skip NUMBER`

If a command reports the progress database is not initialized, run `{{tutor_path}} {{id}} init` once
and retry. If it reports `lessons.json` is missing, run `deno task build {{id}}` in the tool
directory, then `init`, then retry.

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
