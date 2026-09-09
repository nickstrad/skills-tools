# Systems project builder guidance

The parent [AGENTS.md](../AGENTS.md) applies here. Read [repository docs](../docs/README.md)
and this folder's [README](README.md). Keep CLAUDE.md symlinked to this file.

Before planning or allocating a lab, read the current resource report when present and
[VM resource cleanup](../docs/knowledge/vm-resource-cleanup.md). Verify live disk/memory/process
and cluster state; budget peak images, replicas, backups, archives and evidence, not just the
primary dataset. Preserve the learner's /labs/pglab, progress and unrelated work. Sandbox process
visibility may be restricted: an empty pgrep is not proof the host has no live cluster.

Use [design-workflow](docs/design-workflow.md), [authoring](docs/authoring.md) and the systemscoach
skill for this project track. The current 40-lesson PostgreSQL course provides the lesson/review
teaching reference, not a length target. Keep lessons 15–25 minutes and author only agreed batches.
Read the [learner profile](../docs/learner-profile.md) and [saved interests](../docs/articles/README.md).
Apply the [meaningful learner work contract](docs/knowledge/learner-work.md) to every systemscoach
lesson: reserve a useful command, core edit or diagnostic investigation for the learner, with
observable evidence and optional hints/solutions. A fully supplied walkthrough alone does not qualify.
Read the dedicated [systems knowledge store](docs/knowledge/README.md) before systems work and
update it with reusable, evidence-backed findings after each completed task or course batch.
Keep project source research and validation records beside the project; link them from shared notes.

Useful knowledge to consult selectively:

- [Validation harness limits](../docs/knowledge/validation-harness.md): a completed process isn't
  proof of the expected effect; inspect evidence and expected errors. This Go/Markdown engine does
  not automatically use the tutor harness, but the evidence principle applies.
- [Shell pitfalls](../docs/knowledge/shell-lesson-gotchas.md): session state, scoped cleanup,
  blocking commands, quoting and reusable setup.
- [Lesson identity](../docs/knowledge/lesson-identity-refresh.md): stable identities and copied
  progress checks. Systemscoach receipts key on topic/slug/revision, not ordinal.
- [PostgreSQL lab ownership](../docs/knowledge/postgres-lab.md): learner and author lab paths differ.
- [Cursor notes](../docs/articles/cursor-git-at-any-scale.md): durable publication, notification
  limits, conditional-write verification and local approximations.

Keep validation fixtures private and bounded; stop owned processes on failure. At checkpoints and
completion remove disposable state, retain only evidence needed for a named outstanding check with
an expiry, and verify learner readiness and unchanged progress. No global process kills or network
resets. Add durable reusable findings to docs/knowledge and its index instead of duplicating manuals.

During this initial builder implementation, keep systems-projects/handoff.md committed and updated
at checkpoints; remove it in the completion commit. Do not modify the unrelated root handoff.md.
For future project batches, use a temporary handoff inside that project's folder as needed by the
repository batch workflow. Preserve unrelated working-tree changes and commit only owned files.
