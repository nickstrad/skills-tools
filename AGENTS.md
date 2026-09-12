# Repository guidance for agents

Read [`docs/README.md`](docs/README.md) before working in this repository. It indexes the durable
research and operational notes that already exist; use those documents instead of repeating
expensive discovery work.

## VM resources and cleanup — first operational task

Read `/root/disk-usage-report.md` when present and
[`docs/knowledge/vm-resource-cleanup.md`](docs/knowledge/vm-resource-cleanup.md). Verify reports
against current disk, memory, process and cluster state before acting. Account for peak space
(including backups, replicas, archives and evidence copies) before allocating a lab. Clean up owned
work after validation and at each checkpoint; do not let stopped clusters accumulate. Final resource
cleanup and a learner-lab readiness check are required before marking an overall goal finished, not
an optional follow-up.

Preserve the learner's live `/labs/pglab` cluster, progress databases, unrelated work and active
agent sessions. Similar path names and absence from `pgrep` do not establish disposability. Retain
only evidence required by an outstanding acceptance check, compact it with verified manifests,
record its location/expiry, and remove bulky retained evidence after that check.

## Learner context

When planning or revising lessons, consult [`docs/articles/README.md`](docs/articles/README.md) for
learner-selected articles and interests. Use relevant insights to motivate bounded experiments;
distinguish the learner's preferences, source claims, and proposed applications. Use
[`future-courses/README.md`](future-courses/README.md) for planning and sign-off, and
[`docs/lesson-batch-workflow.md`](docs/lesson-batch-workflow.md) for implementation batches.

Read [`docs/learner-profile.md`](docs/learner-profile.md) to calibrate course depth. Nick's KCNA,
Kubernetes production experience, Docker familiarity, and own repositories inform what to skip or
shorten; they do not imply that every internals topic is already mastered or authorize copying his
projects into coursework. Host-init administration is outside the requested learning path.

Nick studies around parenting and a full-time job and currently completes a PostgreSQL Essentials
lesson in roughly ten minutes. Prefer fixed, bounded routes of short mechanism-driven lessons. Put
all context needed for the experiment in the lesson before its commands, use terminal-readable
diagrams whenever they clarify a mechanism, and keep external reading optional. The learner uses
`<course CLI> route` to see completed, available, and planned entries and
`<course CLI> <number> lesson|done` to display or complete an authored lesson. There is no separate
review, homework,
checkpoint, or answer-submission stage, and only an explicit `done` records completion. A valid
`future-courses/<folder>/course.md` route may be displayed before implementation, but its planned
entries have status only and never create progress.

## PostgreSQL course

The PostgreSQL course lives at `curriculum-tools/courses/postgres/`. Read its `PLAN.md` for the
current outline and its validation records for measured behavior. Edit curriculum TypeScript, keep
stable lesson identities and preserve learner progress. Technical source research may inform a
plan, but no external reading is a learner prerequisite or progression gate.

## Course editing rules

- Define a future course first as an inexpensive Markdown route under [`future-courses/`](future-courses/),
  using its [template](future-courses/TEMPLATE.md). That guide owns research, discussion and
  final-outline sign-off; a route does not authorize scaffolding, progress changes or validation
  infrastructure. Implement only an agreed route in small batches.
- For implementation batches, follow
  [`docs/lesson-batch-workflow.md`](docs/lesson-batch-workflow.md): primary design and review,
  current-user model/delegation choices, real validation, chunked commits and a temporary handoff
  committed throughout and removed at completion. Historical plans may name earlier models or
  assignments; they are provenance, not current delegation policy.
- Keep `CLAUDE.md` symlinked to this file so both agents share this guidance.
- Read `curriculum-tools/docs/AUTHORING.md` and the `curriculum-author` skill before changing lesson
  content.
- Edit `curriculum/*.ts`; never hand-edit generated `lessons.json` or learner `progress.sqlite`.
- Preserve experiment behavior unless the task explicitly asks for a semantic change. Metadata-only
  rewrites must not change setup, commands, expected results, safety levels, sessions, or slugs.
- Author one complete `lesson` output as specified in
  [`curriculum-tools/docs/AUTHORING.md`](curriculum-tools/docs/AUTHORING.md): context, setup and
  commands, expected evidence, interpretation and cleanup. Use a plain-text-readable diagram when
  it clarifies the mechanism; the shared tutor renders every course.
- Run Deno from `curriculum-tools/` with `/root/.deno/bin/deno` when it is not on `PATH`.
- Keep unrelated working-tree changes intact. Multiple agents may own separate module files at the
  same time; never edit a file assigned to another agent.

## Durable findings

General repository, course and validation findings belong in `docs/knowledge/` and its index. Keep
course-local validation facts beside the relevant course; do not duplicate external source material.
