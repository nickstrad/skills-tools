# Lesson batch authoring workflow

Updated 2026-09-13. This document owns execution of an explicitly requested lesson batch. Planning,
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
   files. Avoid speculative implementation detail for later lessons. Before implementation, create
   **`state.md` at the repository root** as the batch's resumable event log. State its objective,
   current user instructions, file ownership, unrelated changes to preserve, resource/progress
   baselines, and remaining work. Include an explicit instruction to delete it only after batch
   completion and the final knowledge-store reflection, including any resulting updates.
   Record dated events as decisions, edits, commits, validation outcomes, failures, cleanup and
   scope changes occur; link commands and evidence needed to resume without repeating accepted work.
   Keep the remaining-work summary current. On a context reset, read and continue the existing log;
   do not replace it or restart the batch. Preserve another active batch's state, using clearly
   labelled batch sections if work overlaps.
3. Use the current user's explicit model and delegation choice. If delegation is authorized, give
   each agent explicit file ownership and the design documents; use independent assignments where
   practical. Historical plans may mention Sol or Terra and do not override the current choice.
   Require real validation evidence and a concise report; a successful harness exit alone is
   insufficient.
4. The primary agent reads every submission, reviews its teaching and technical accuracy,
   refines or refactors where needed, and independently validates important behavior.
   Polish concrete weaknesses without changing work merely for stylistic preference.
5. Commit each coherent chunk of work, staging only owned changes. Update `state.md` after each
   meaningful checkpoint and new user instruction, and commit the event-log update with its
   corresponding chunk. The primary agent owns this file and shared integration files to avoid
   concurrent edits. Use `state.md` instead of creating a separate course `handoff.md`; for a batch
   already using one, preserve its useful context in the event log before retiring it.
6. Build and run the appropriate checks, exercise each authored experiment against the real tool,
   and inspect the single complete `lesson` output using isolated progress. It must contain the
   required context before commands, expected evidence, interpretation, and cleanup. Use a labelled,
   plain-text-readable terminal diagram when it clarifies state, ownership, order, layout, or flow.
   Preserve stable lesson identities and update revisions as required by course rules.
7. Record reusable findings in durable documentation. Clean up owned labs and scratch
   evidence, verify learner readiness and unchanged progress, and record validation limits.
8. **Reflect on the knowledge store before closing the batch.** Review the event log and evidence
   for verified, reusable droplet or tooling findings and outdated operational guidance. Use the
   `update-knowledge-store` skill and `kb` CLI when a useful addition or correction is warranted:
   search/read first, prefer correcting an existing entry, then verify the saved result. Keep
   course-specific acceptance evidence in this repository; do not copy the batch transcript,
   transient status or personal preferences into the knowledge store. The reflection is required;
   a knowledge-store write is not. Record the updated entry identifiers in `state.md`, or briefly
   record why no update was warranted.
9. After implementation, required validation, cleanup and the reflection (including any resulting
   knowledge-store updates) are complete, move any remaining durable findings to their proper
   documentation, **delete `state.md`**, and commit its removal with the final batch changes.
   Remove an obsolete course handoff too. If another batch is still active in the shared event log,
   preserve its state and defer deleting the file until that work is complete. Never delete the log
   merely because context is about to be cleared.
10. Report what was delivered, validation results and the location of this workflow document. The
   learner uses `<course CLI> route`, `<course CLI> <number> lesson`, and `<course CLI> <number> done`;
   there is no mandatory review or checkpoint stage, and authoring never marks a lesson complete.

`AGENTS.md` links here, and `CLAUDE.md` should remain a symlink to `AGENTS.md` so both agents
discover the same guidance. Every batch uses the event log and final reflection; neither requires
the learner to request it again or submit their own notes.
