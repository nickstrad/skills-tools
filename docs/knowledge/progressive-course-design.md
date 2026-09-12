# Concise mechanism-driven course design

Updated 2026-09-12 for the Go CLI.

Updated 2026-09-12. Use this when defining or revising a course after the PostgreSQL
systems-engineering pivot.

## What happened

Reviewing PostgreSQL's unfinished lessons showed that physical experiments could be strong while the
most useful application protocols remained optional challenges. Some repeated demonstrations
consumed time that could instead test workload decisions. The old author skill required 8–15 modules
for every new course, and the wrapper template printed the expected result before asking the learner
to predict it.

Nick later clarified that he studies around parenting and a full-time job, completes current
PostgreSQL Essentials lessons in roughly ten minutes, and wants future courses bounded before
implementation. A lesson should give him the mechanism, commands, expected evidence,
interpretation, and cleanup in one output. External reading, written answers, separate review views,
and external source stops are not required stages.

## Why it matters

Course length and conceptual depth are separate choices. More lessons do not establish
understanding, and withholding syntax or explanation is not useful friction. Short lessons can
still teach internals when each centers one observable mechanism and supplies enough context to
interpret it.

Likewise, printing a simulated external effect or assuming readiness after a sleep establishes less
than the surrounding prose may claim. Conclusions should rest on observable state transitions and
explicitly scoped guarantees.

## How to apply

- Define future courses in [`future-courses/`](../../future-courses/) with the inexpensive
  [template](../../future-courses/TEMPLATE.md). That guide owns scope, discussion and sign-off;
  the [batch workflow](../lesson-batch-workflow.md) owns implementation. Do not build scaffolding,
  validators or deep per-lesson syntax during planning.
- Use `tutor roadmap` for sequence and cross-project overlap, and
  `curriculum-tools/docs/AUTHORING.md` for the lesson contract. Do not copy PostgreSQL's total size or
  workload into every course.
- The 2026-09-04 roadmap revision places Linux observations and container lifecycle experiments
  early, selects local software defaults, and makes advanced infrastructure a set of branches. Reuse
  diagnostic workshops within workloads and build synthesis projects incrementally. A thematic tool
  catalog is not the execution order, and a planned project is not a validated course.
- Calibrate depth with `docs/learner-profile.md` and `prior-project-experience.md`. Nick's own
  projects and Kubernetes/Docker experience justify omitting basic deployment and platform-build
  assignments. They are experience evidence, not templates to copy into the curriculum.
- Read `docs/articles/README.md` for learner-selected architectural examples. Preserve the
  distinction between a stated interest, an article's claims, and an experiment we propose. The
  Linux/database folding proposal in `linux-database-integration.md` is future design input; it does
  not authorize implicit completion or removal of existing lessons.
- Plan backwards from final evidence: a diagnosis, measured capacity, validated recovery, invariant,
  or architecture decision. A plan needs lesson titles, mechanisms, outcomes, and decisive evidence,
  not finished commands for every future lesson.
- Put all required context before the experiment and keep explanations short but sufficient. Supply
  complete commands for unfamiliar mechanisms. Use ASCII/ANSI terminal diagrams liberally when they
  clarify state transitions, ownership, timelines, layouts, contention, or log flow; label them,
  connect them to the coming evidence, and keep them readable without colour.
- Present one complete lesson through `tutor <course> route`, then
  `tutor <course> <number> lesson`; only explicit `done` changes completion. `skip` records a
  deliberate omission, shows separately in the route, and excludes that lesson from unnumbered
  next selection; `undone` restores eligibility. Do not require a separate review, pause,
  checkpoint, homework, prediction, or answer-submission stage. References and deeper variations
  remain optional. Planned route rows never pretend that lesson content exists.
- Consolidate repeated outcomes; retain an experiment when it provides materially different
  evidence. Use tiny examples for mechanisms and a recurring workload for their composition.
- Distinguish observed behavior, documented guarantee and inference. Test the boundary actually
  claimed: sender and receiver commits, token enforcement, transaction outcomes or process failure.
- For course refactors, preserve completed lesson identities/revisions, use explicit revisions for
  changed lessons and validate reseeding on a copy. Global revision bumps can unintentionally
  re-serve completed foundations that were not changed.

The shared Go CLI owns presentation for every course. Future content renders through
`tutor <course> route|<number> lesson|done|skip`; do not build a new per-course renderer or a
course-specific database adapter. The legacy reference commands are `postgres-legacy`,
`sqlite-legacy`, and `linux-legacy`; their unsuffixed names remain aliases for the same stored
course and do not add learner stages.

## Ownership during coupled refactors

The [batch workflow](../lesson-batch-workflow.md) owns primary design/review, delegation, evidence,
handoff and cleanup. Keep tightly connected experiment design, implementation and integration under
one owner where practical; delegated verification must return actual outputs and explicit gaps. Apply
the current user's execution preference rather than copying historical model assignments from a
reference course.
