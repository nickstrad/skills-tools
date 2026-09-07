# PostgreSQL essentials: publish the route, then author its real lessons

Updated 2026-09-06. The active route is 40 small lessons, with its first six implemented. The
[plan](../../curriculum-tools/courses/postgres-essentials/PLAN.md) fixes titles, stable slugs,
intended outcomes and reference-source mappings for every entry.

## What happened

Nick rejected spending time on old lessons merely to test coaching UX. He asked for actual first
lessons of a specified shorter course, then clarified that 40 meaningful 20–30 minute chunks were
preferable to 24 dense sessions. The first three introduce committed visibility, compare statement
and transaction snapshots, and test the old-reader cleanup horizon. These match rows 1–3 of the
published route exactly. No TOAST/cache/numeric-XID detour is required.

`pgcoach` now launches `postgres-essentials/tools/coach.ts` by default. `--reference` opens the old
renderer, whose printed coaching links retain that flag. The new course ID gives separate numbering
and progress without rewriting the original eight completions or migrating the 92-lesson catalog.
Six real lessons are built; future entries are held in `route.ts` and PLAN.md. Rendering or
finishing the available batch must not report all 40 complete. Explicit `pgcoach NUMBER done`
addresses essentials; legacy pgtutor commands still belong to the original course.

## Why it matters

Authoring a short flow around unrelated old lessons did not satisfy the learner's goal. Scope and
UX need to advance together. Putting a two-view wrapper around an unsplit 50-minute experiment
does not make it a 30-minute lesson. Each new lesson has one bounded comparison, supplied syntax,
concepts and a terminal diagram before the experiment, and a review of evidence and limits.
References are optional, with no hidden required book excerpts. A mental reflection follows the
experiment; the next batch discussion follows essentials lesson 3 rather than old lesson 12.

Two-course identity also prevents accidental completion of a different lesson with the same number.
The installed postgres-tutor skill is a symlink to the updated repository source and routes both
navigation and progress to essentials by default. `pgcoach --reference` retains original material.

## How to apply

- Follow the fixed plan when authoring lessons 4 onward. Record agreed changes to scope; do not
  improvise an unrelated next topic or add an extra UX prerequisite batch.
- Keep the commands printed by the first view identical to the built setup/code. Route tests cover
  this, available-lesson identity matching, diagrams before setup, explicit completion, progress-byte
  preservation, pending lessons and the installed launcher.
- Validate each new experiment on a private PostgreSQL cluster. The first batch ran in two real
  sessions; the final third lesson was rerun after removing noisy VERBOSE vacuum output. Tuple
  counts still prove retention/reclamation directly. Check exact outcomes, not just timeouts.
- Preserve the learner lab and reference progress. The validation controller owns one unique
  `/tmp/pg-essentials-validation-*` root, verifies identity and removes it after normal shutdown in
  `finally`. Both roots allocated during this batch were retired. Retain only small logs, outcome
  assertions, controller and report under the course's `validation/` directory.

The [first batch validation report](../../curriculum-tools/courses/postgres-essentials/validation/README.md)
records the measured results and limits. All timing estimates still await learner experience.


## Second batch accepted

Nick enjoyed the two-view flow in lessons 1–3 and requested the next three of this same route.
Lessons 4–6 add heap-space reuse, lost-update versus atomic arithmetic, and a row-locked stock
reservation decision. See the [second-batch acceptance](../../curriculum-tools/courses/postgres-essentials/validation/batch-two.md)
and [root handoff](../../handoff.md). The next feedback point is lesson 6; lessons 7–40 remain planned.

A shared validator's asynchronous `(blocks ...)` send does not itself prove the second backend
actually waited before the first committed. The course-local `validation/run.ts` reuses the shared
Session and splitSteps implementation, then waits for an observed Lock event and the expected
blocker before releasing A. It adds this synchronization only to validation; the learner still
follows the supplied terminal-switch instructions. Scalar outcome checks alone could accept a
serial execution of the atomic-write experiment.

Keep observations separate: lesson 4 fixes heap truncation off and measures the main fork; it does
not claim every vacuum preserves file size. Lesson 6 deliberately permits negative stock in the
fixture so the stale decision has a visible failure; this is not a recommended inventory schema.
Its supplied manual decline is an experiment action, not an implemented application branch.

When adding a batch, refresh the lesson catalog through `tutor postgres-essentials init` after
checking a copy. Compare progress and attempt rows, not whole-file bytes across that intentional
catalog update. Check logical progress/attempt rows as well as file bytes: WAL-mode updates can leave the main
SQLite file hash unchanged while the WAL contains the refreshed catalog. Views must still leave
learner history unchanged, and reference progress must stay untouched.

## General authoring checks from the third batch

Added 2026-09-07 during implementation; acceptance remains pending at this checkpoint.

- Follow [the durable batch workflow](../lesson-batch-workflow.md) for primary design, bounded
  Sol assignments, primary review and per-chunk commits. Resolve prerequisite names against
  `route.ts`, even when the prerequisite is being authored concurrently. A plausible invented
  slug breaks integration despite an otherwise type-correct module.
- A course gaining its first shell lesson needs both renderer and validator dispatch by
  `runIn`. SQL fencing, a psql connection command and ROLLBACK instructions are incorrect for
  a supplied shell client. Verify rendered commands against source in the correct language,
  and check shell exit status as well as completion markers.
- Quiet psql suppresses command tags. Capture `ROW_COUNT` immediately after a conditional
  write and `SQLSTATE` immediately after COMMIT when those values establish acceptance.
  A later query overwrites those variables. Do not infer a committed write merely from a
  client's earlier success message.
- Expected failures need an exact per-lesson error inventory. A blanket rejection of ERROR
  prevents teaching serialization failures; globally allowing 40001 could hide a failure in
  another lesson. Check the expected session/phase, count, immediate SQLSTATE and final
  committed state together, and reject all other errors.
- `code` is a raw template tag: write one literal backslash for psql commands in both SQL and
  prose. Optional runnable variations need Markdown code blocks too; unformatted SQL may
  collapse into prose even when it looks readable in the source file.

The supplied retry client passed its first real acceptance checkpoint on 2026-09-07. A useful
teaching distinction is **request completion versus the originally requested mutation**: after
40001, the fresh read changes the decision from leaving to staying. Test that changed decision,
the independent committed state, and error/attempt limits; a second successful COMMIT alone
would also accept a client that blindly reused the stale decision. Keep controlled scheduling
separate from retry policy. Completed command responses establish overlap here; elapsed sleeps
do not. A short delay only spaces retries. Include supplied client source hashes alongside
lesson hashes because a short launcher command can remain unchanged while its behavior changes.

For optimistic-edit demonstrations, capture the reread into client variables first, then print
those same variables and use them for the proposed merge. A diagnostic SELECT followed by a
second SELECT for the write token can observe different versions under Read Committed. The
conditional write still detects a later conflict, but the evidence should represent the exact
body/token used by the decision. Primary lesson-7 validation now checks that correspondence.
