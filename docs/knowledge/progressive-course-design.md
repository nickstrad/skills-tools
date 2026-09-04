# Progressive ownership at the appropriate project scale

2026-09-04. Use this when designing or revising a course after the PostgreSQL systems-engineering pivot.

## What happened

Reviewing PostgreSQL's unfinished lessons showed that physical experiments could be strong while
the most useful application protocols remained optional challenges. Some repeated demonstrations
consumed time that could instead test workload decisions. The old author skill required 8–15
modules for every new course, and the wrapper template printed the expected result before asking
the learner to predict it.

The user chose guided experiments with supplied code and progressively more ownership of
measurement, explanation and design. They explicitly want this scaled to small projects as well as
deep courses, and want future agents to reuse the approach.

## Why it matters

Course length, conceptual depth and learner independence are separate choices. More lessons do
not establish independence; withholding syntax does not establish understanding. A focused project
can end with a meaningful independent diagnosis, while an unfamiliar mechanism late in a large
course still needs explanation and runnable commands.

Showing a solution before asking for a prediction changes the exercise into recall. Likewise,
printing a simulated external effect or assuming readiness after a sleep establishes less than
the surrounding prose may claim. Assessment should rest on observable state transitions and
explicitly scoped guarantees.

## How to apply

- Use `docs/learning_path.md` for flexible focused/standard/deep scales and cross-project overlap.
  Use `curriculum-tools/docs/AUTHORING.md` for the canonical teaching and presentation contract.
  Do not copy PostgreSQL's total size or its specific task-runner workload into every course.
- Plan backwards from final evidence: a diagnosis, measured capacity, validated recovery, invariant
  or architecture decision. Name what the learner chooses at intermediate synthesis points.
- Follow read/predict/run/inspect/explain/vary/apply flexibly. Supply code for new concepts and
  graduated hints for variations. Keep full lessons accessible and progress explicitly controlled
  by the learner. Use authored prompts and supported interfaces rather than invented CLI commands.
- Consolidate repeated outcomes; retain an experiment when it provides materially different
  evidence. Use tiny examples for mechanisms and a recurring workload for their composition.
- Distinguish observed behavior, documented guarantee and inference. Test the boundary actually
  claimed: sender and receiver commits, token enforcement, transaction outcomes or process failure.
- For course refactors, preserve completed lesson identities/revisions, use explicit revisions for
  changed lessons and validate reseeding on a copy. Global revision bumps can unintentionally
  re-serve completed foundations that were not changed.

The author skill is symlinked from `/root/.codex/skills/curriculum-author` to the checked-in
`curriculum-tools/skills/curriculum-author`; edit that repository source. PostgreSQL's staged CLI is
course-local during its refactor. The shared wrapper template supports guided presentation through
existing structured CLI output, so new courses need not implement a new renderer to adopt the
teaching method.
