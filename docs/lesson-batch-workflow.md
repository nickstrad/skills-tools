# Lesson batch authoring workflow

Updated 2026-09-12. This document owns execution of an explicitly requested lesson batch. Planning,
discussion and final-outline sign-off belong to [`future-courses/README.md`](../future-courses/README.md).
A future course must have an agreed, inexpensive Markdown route created from its
[template](../future-courses/TEMPLATE.md); planning does not create scaffolding, validation
infrastructure or detailed command scripts.
The shared `tutor <course> route` may display that plan with planned status before implementation;
doing so must not seed progress.

1. Read the repository index, resource guidance, learner context, course plan and authoring
   skill. Identify the actual course behind the requested command; preserve unrelated work
   and learner progress. Check current resources before allocating validation labs.
2. The primary agent turns only the next small slice of the agreed route into a bounded batch
   design. State each mechanism, experiment, decisive evidence, safety boundary, cleanup, and owned
   files. Avoid speculative implementation detail for later lessons.
3. Use the current user's explicit model and delegation choice. If delegation is authorized, give
   each agent explicit file ownership and the design documents; use independent assignments where
   practical. Historical plans may mention Sol or Terra and do not override the current choice.
   Require real validation evidence and a concise report; a successful harness exit alone is
   insufficient.
4. The primary agent reads every submission, reviews its teaching and technical accuracy,
   refines or refactors where needed, and independently validates important behavior.
   Polish concrete weaknesses without changing work merely for stylistic preference.
5. Commit each coherent chunk of work, staging only owned changes. Keep
   `courses/<course>/handoff.md` current with scope, ownership, progress, evidence and open
   issues. If it exists when a new run begins, replace its contents for the new run.
   Commit every handoff update with its corresponding chunk. The primary agent owns this
   file and shared integration files to avoid concurrent edits.
6. Build and run the appropriate checks, exercise each authored experiment against the real tool,
   and inspect the single complete `lesson` output using isolated progress. It must contain the
   required context before commands, expected evidence, interpretation, and cleanup. Use a labelled,
   plain-text-readable terminal diagram when it clarifies state, ownership, order, layout, or flow.
   Preserve stable lesson identities and update revisions as required by course rules.
7. Record reusable findings in durable documentation. Clean up owned labs and scratch
   evidence, verify learner readiness and unchanged progress, and record validation limits.
   Delete the course's temporary `handoff.md` and commit its removal at completion.
8. Report what was delivered, validation results and the location of this workflow document. The
   learner uses `<course CLI> route`, `<course CLI> <number> lesson`, and `<course CLI> <number> done`;
   there is no mandatory review or checkpoint stage, and authoring never marks a lesson complete.

`AGENTS.md` links here, and `CLAUDE.md` should remain a symlink to `AGENTS.md` so both agents
discover the same guidance. Commit each coherent handoff update with its batch as described above.
