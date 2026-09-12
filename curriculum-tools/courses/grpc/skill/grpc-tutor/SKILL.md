---
name: grpc-tutor
description: "Guide a user through the hands-on gRPC and Protocol Buffers curriculum with the tutor CLI: serve the next or a numbered lesson, find lessons by concept, list modules, and record progress only when the user explicitly asks. Use for gRPC and Protocol Buffers curriculum, lesson, module, search, note, and progress requests; not for unrelated gRPC and Protocol Buffers troubleshooting."
---

# gRPC and Protocol Buffers Tutor

Use `/root/Software/skills-tools/curriculum-tools/bin/tutor grpc` (CLI below) for curriculum content
and progress. Never read or edit generated `courses/grpc/lessons.json`, curriculum source, or
learner progress directly for serving lessons. The CLI prints content; the learner runs the supplied
experiment in bash or a shell.

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

## Course scope and lab

This course is six direct walkthroughs, 65 minutes total. The learner explicitly requested focused
practice without mental-model guesses, quizzes, required reflection, notes or a capstone. This
course-specific preference overrides generic read/predict coaching. Supply a short introduction, the
exact setup/code, and the expected output together; explain unfamiliar flags using the authored
syntax breakdown. Do not withhold results pending a prediction. Let the learner run and compare.
Display the complete lesson including metadata and caution. For a shorter request, keep the exact
experiment and expected outcome intact and shorten the surrounding prose.

The supported lab is Linux x86-64. One-time setup is separate from lesson time. If the tools are
missing, point to the course README and the command:

    bash /root/Software/skills-tools/curriculum-tools/courses/grpc/lab/install.sh

Every lesson creates fresh temporary state and stops its local server automatically. No earlier
server needs to remain running. The full course is 65 minutes; lessons 1, 4 and 6 form a 37-minute
quick pass. Use the CLI for lesson selection and progress as above. Do not run experiments or record
completion merely because the learner asked to see a lesson. Optional reference reading never
interrupts practice, and there are no required written responses.

## Progress invariants

- Showing, explaining, or author-validating a lesson never marks it done.
- Complete only on an explicit request such as “done” or “mark 12 complete”; resolve the course and
  lesson from recent context only when unambiguous. Do not infer completion from pasted output.
- Let the CLI select the next unfinished lesson; it handles skipped and stale entries.
- Pass note text as one argument, preserve unrelated progress, and report command errors.
