# Lesson batch authoring workflow

Recorded from Nick's request on 2026-09-07. Use this workflow when he asks to create the
next lesson batch, including a short request such as “fill out the next batch.” Follow
the course's approved plan and current learner preferences.

1. Read the repository index, resource guidance, learner context, course plan and authoring
   skill. Identify the actual course behind the requested command; preserve unrelated work
   and learner progress. Check current resources before allocating validation labs.
2. The primary agent designs the batch first. Commit bounded design documents describing
   the teaching sequence, experiments, expected evidence, variations, safety, owned files
   and acceptance checks. Keep difficult design, integration and correctness work with
   the primary agent when delegation would not help.
3. Delegate suitable implementation to `gpt-5.6-sol` agents with explicit file ownership
   and the design documents. Use independent assignments where practical. Require real
   validation evidence and a concise report; a successful harness exit alone is insufficient.
4. The primary agent reads every submission, reviews its teaching and technical accuracy,
   refines or refactors where needed, and independently validates important behavior.
   Polish concrete weaknesses without changing work merely for stylistic preference.
5. Commit each coherent chunk of work, staging only owned changes. Keep
   `courses/<course>/handoff.md` current with scope, ownership, progress, evidence and open
   issues. If it exists when a new run begins, replace its contents for the new run.
   Commit every handoff update with its corresponding chunk. The primary agent owns this
   file and shared integration files to avoid concurrent edits.
6. Build and run the appropriate checks, exercise the authored experiments and variations
   against the real tool, and inspect the rendered learner flow using isolated progress.
   Preserve stable lesson identities and update revisions as required by course rules.
7. Record reusable findings in durable documentation. Clean up owned labs and scratch
   evidence, verify learner readiness and unchanged progress, and record validation limits.
   Delete the course's temporary `handoff.md` and commit its removal at completion.
8. Report what was delivered, validation results and the location of this workflow document.

`AGENTS.md` links here, and `CLAUDE.md` should remain a symlink to `AGENTS.md` so both
agents discover the same guidance. On the initial setup run, commit this workflow and
its agent-guidance link first, then tell Nick that commit is ready while continuing the batch.
