---
name: postgres-tutor
description: "Guide a user through the hands-on PostgreSQL Systems curriculum with the tutor CLI: serve the next or a numbered lesson, find lessons by concept, list modules, and record progress only when the user explicitly asks. Use for PostgreSQL Systems curriculum, lesson, module, search, note, and progress requests; not for unrelated PostgreSQL Systems troubleshooting."
---

# PostgreSQL Systems Tutor

Use `/root/Software/skills-tools/curriculum-tools/courses/postgres/bin/pgcoach` to guide a lesson
and `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres` for course navigation and
explicit progress actions. Never read or edit `courses/postgres/lessons.json`, the curriculum
source, or the SQLite progress database directly. Neither CLI runs lesson code; the user runs it in
`psql` or a shell.

## Route the request

- Next unfinished lesson:
  `/root/Software/skills-tools/curriculum-tools/courses/postgres/bin/pgcoach start`
- A specific lesson:
  `/root/Software/skills-tools/curriculum-tools/courses/postgres/bin/pgcoach NUMBER start`
- Find lessons by concept:
  `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres search TEXT`, then
  `/root/Software/skills-tools/curriculum-tools/courses/postgres/bin/pgcoach NUMBER start` if one is
  wanted.
- Next lesson on a topic the user is studying ("I'm reading about the buffer cache", "give me
  something on deadlocks"): run
  `/root/Software/skills-tools/curriculum-tools/bin/tutor postgres topics` once to see the tag
  vocabulary with progress, pick the tags that fit what they described (map their words onto the
  vocabulary; a book chapter title usually maps to one tag), then
  `/root/Software/skills-tools/curriculum-tools/courses/postgres/bin/pgcoach start --topic "TAG"`.
  If the first choice reports no match or is complete, try the next closest tag, then fall back to
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

## Guide one lesson

Start with
`/root/Software/skills-tools/curriculum-tools/courses/postgres/bin/pgcoach [NUMBER] start`. It gives
the lesson identity, full safety instructions, and an authored prediction without exposing setup,
runnable code, expected output, or the systems conclusion. Ask the learner for that prediction
first.

After the prediction, serve
`/root/Software/skills-tools/curriculum-tools/courses/postgres/bin/pgcoach NUMBER run`. It provides
the complete setup and exact runnable commands, syntax breakdown, and session guidance. Do not turn
the lesson into syntax recall or run its commands on the learner's behalf. Ask for evidence after
they run it, then use the authored `inspect`, `explain`, `vary`, `apply`, `hint1`, and `hint2`
stages as appropriate. The explain stage asks for causal reasoning before `reveal`.

Use `/root/Software/skills-tools/curriculum-tools/courses/postgres/bin/pgcoach NUMBER reveal` after
the learner has supplied their evidence and explanation, or sooner when they explicitly ask for the
answer or help. It shows the expected result, systems lens, optional reference context, and every
Core/Optional-depth study item. Tell the learner to complete Core material before the next lesson;
Optional depth is enrichment. The coach never records a completion.

If the learner explicitly asks for the complete lesson, use
`/root/Software/skills-tools/curriculum-tools/bin/tutor postgres pretty NUMBER` and paste the output
verbatim. This is also the explicit fallback when a lesson has no authored guided record. Never
shorten, paraphrase, or re-wrap its `Optional reference`, `## Syntax breakdown`, or
`## Study checkpoint` content.

Warn if the user's tool version is below `minVersion` (`show NUMBER --json`). Use `--json` only when
structured fields are needed.

## Incident ownership and VM resources

Before allocating a lab, read the repository's `docs/knowledge/vm-resource-cleanup.md` and verify
current resources; `/root/disk-usage-report.md` is a historical inventory to check, not a deletion
allowlist. The learner's current VM lab is `/labs/pglab/primary`, port 5440/socket `/tmp`, database
lab. Confirm current paths rather than recreating an obsolete validation lab. Preserve learner data.

For independent incidents, start with the authored symptom and prediction. When the learner
explicitly asks you to prepare a fixture, obtain the supplied run/full commands and execute only the
named preparation/survey stage before showing its symptom. Honor explicit requests for full source
or a worked solution. Saved incident PIDs are historical when a phase stopped; use the supplied
fresh trial/interface instead of signalling a remembered PID.

Keep agent-created trials bounded, stop their processes in failure cleanup and reclaim their owned
files after findings are recorded. Use the printed cleanup action where supplied. Retain only the
evidence needed for a named unfinished check, and remove bulky audit inputs before declaring that
task finished. Do not remove `/labs/pglab`, learner progress or unrelated work as scratch cleanup.
The course [README](../../README.md) and knowledge base explain preparation, catalog refresh and
resource ownership. Reading or cleanup never implies learner completion.

## Progress invariants

- The lesson `ordinal` is the number the user sees.
- Never mark completion because a lesson was shown, copied, or explained. Mark it only after an
  explicit request such as "done", "I ran it", or "mark 12 complete"; resolve "it" to the last
  lesson shown only when unambiguous.
- Prefer `/root/Software/skills-tools/curriculum-tools/courses/postgres/bin/pgcoach start` over
  computing the next lesson yourself; it handles skipped and stale lessons through the tutor CLI.
- Pass note text as one argument and report command errors instead of assuming success.
