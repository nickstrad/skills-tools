# Repository guidance for agents

Read [`docs/README.md`](docs/README.md) before working in this repository. It indexes the durable
research and operational notes that already exist; use those documents instead of repeating
expensive discovery work. The completed [Go migration record](archive/plans/go-tutor-migration.md)
preserves its model choices, sequencing, validation, and acceptance; use current task instructions
for new work.

## VM resources and cleanup — first operational task

Read [`docs/knowledge/vm-resource-cleanup.md`](docs/knowledge/vm-resource-cleanup.md). Measure
current disk, memory, process, and cluster state before acting. Account for peak space
(including backups, replicas, archives, and evidence copies) before allocating a lab. Clean up owned
work after validation and at each checkpoint; do not let stopped clusters accumulate. Final resource
cleanup and a learner-lab readiness check are required before marking an overall goal finished, not
an optional follow-up.

Preserve the learner's live `/labs/pglab` cluster, the course-scoped progress in
`curriculum-tools/tutor.sqlite`, legacy progress backups, unrelated work, and active agent sessions.
Similar path names and absence from `pgrep` do not establish disposability. Retain only evidence
required by an outstanding acceptance check, compact it with verified manifests, record its
location and expiry, and remove bulky retained evidence after that check.

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
`tutor <course> route` to see completed, available, planned, and skipped entries and
`tutor <course> <number> lesson|done|skip` to display or update an authored lesson. `undone` restores
an explicitly skipped lesson to next-lesson eligibility. There is no separate review, homework,
checkpoint, or answer-submission stage. Only explicit `done` records completion; `skip`, `undone`,
and `note` are explicit progress operations. A valid
`future-courses/<folder>/course.md` route may be displayed before implementation, but its planned
entries have status only and never create progress. The legacy reference courses are publicly named
`postgres-legacy`, `sqlite-legacy`, and `linux-legacy`; their unsuffixed names remain aliases for the
same stored course IDs and paths.

## Learning routes and progress

The current PostgreSQL path is `postgres-essentials`; `postgres-legacy` is the separate reference
course (with `postgres` as its compatibility alias) and has separate course-scoped progress. The
shared learner database is
`curriculum-tools/tutor.sqlite`; do not edit it directly or transfer completion between courses.
Legacy per-course databases are retained under
`curriculum-tools/.cache/legacy-progress/<course-id>/progress.sqlite*` as migration backups.

Use `tutor roadmap` for the overall learning roadmap and “what should I learn next?” requests.
Roadmap topics and course progress share `curriculum-tools/tutor.sqlite`, while
`curriculum-tools/roadmap/roadmap.json` is the committed roadmap snapshot. Planned roadmap topics
and future-course routes do not authorize new lessons.

## Language policy

Go is the default language for CLI logic, labs, fixtures, harnesses, and any other course tooling.
Bash is acceptable for launchers, machine bootstrap, REPL guards, and glue that would be longer or
less clear in Go. Lesson experiments keep using each tool's native commands, including `psql`,
`sqlite3`, and shell. Do not use Python or TypeScript for new tooling.

## Course editing rules

- Across all courses, use a simple setup command, focused learner work, and simple cleanup.
  Put repeated environment setup, fixtures, starter-file creation, connection plumbing and
  process teardown behind reusable helpers. Keep the mechanism and learner decisions visible;
  do not make learners recreate shell scaffolding or copy completed solutions. Apply this when
  authoring or revising lessons; see [the shared norm](docs/knowledge/learner-work.md#simple-lab-lifecycle).
  Verify the rendered lesson uses the helpers. For an authorized catalog rollout, refresh through
  the tutor CLI after testing on a copy, then verify displayed content and unchanged progress.
- Define a future course first as an inexpensive Markdown route under [`future-courses/`](future-courses/),
  using its [template](future-courses/TEMPLATE.md). That guide owns research, discussion, and
  final-outline sign-off; a route does not authorize scaffolding, progress changes, or validation
  infrastructure. Implement only an agreed route in small batches.
- For implementation batches, follow
  [`docs/lesson-batch-workflow.md`](docs/lesson-batch-workflow.md): primary design and review,
  current-user model and delegation choices, real validation, chunked commits, and a root `state.md`
  event log kept current and committed throughout. Finish with an `update-knowledge-store`
  reflection, make any warranted durable updates, then delete `state.md` when the batch is complete.
  Historical plans may name earlier models or assignments; they are provenance, not current
  delegation policy.
- Keep `CLAUDE.md` symlinked to this file so agents share this guidance.
- Read [`curriculum-tools/docs/AUTHORING.md`](curriculum-tools/docs/AUTHORING.md) and the
  `curriculum-author` skill before changing lesson content. Apply the meaningful learner-work norm
  in [`docs/knowledge/learner-work.md`](docs/knowledge/learner-work.md) to every new lesson.
- Lesson source is `curriculum-tools/courses/<id>/lessons/NN-<slug>.md`. Keep stable lesson
  identities and preserve learner progress.
- Preserve experiment behavior unless the task explicitly asks for a semantic change. Metadata-only
  rewrites must not change setup, commands, expected results, safety levels, sessions, or slugs.
- Author one complete `lesson` output as specified in
  [`curriculum-tools/docs/AUTHORING.md`](curriculum-tools/docs/AUTHORING.md): context, setup and
  commands, expected evidence, interpretation, and cleanup. Use a plain-text-readable diagram when
  it clarifies the mechanism; the shared tutor renders every course.
- Run `bin/tutor <course> check` before committing lesson or route changes. Use
  `bin/tutor <course> validate` for real-tool evidence, always with isolated validation state
  rather than learner progress or the live PostgreSQL lab.
- Keep unrelated working-tree changes intact. Respect the ownership recorded in the active plan or
  `state.md`, and never edit a file assigned to another agent.

## Durable findings

General repository, course, and validation findings belong in `docs/knowledge/` and its index.
Keep course-local validation facts beside the relevant course; do not duplicate external source
material.
