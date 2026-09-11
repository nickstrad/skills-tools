---
name: postgres-tutor
description: "Guide PostgreSQL Essentials lessons, the fixed 40-lesson route, and its progress through pgcoach; access the original PostgreSQL Systems reference when requested. Use for PostgreSQL curriculum, lesson, search, module and progress requests, not unrelated database troubleshooting."
---

# PostgreSQL tutor

The current learner course is **PostgreSQL Essentials: 40 further lessons of 20–30 minutes**. The
first **26** are authored and available. They follow the first 26 entries in
`/root/Software/skills-tools/curriculum-tools/courses/postgres-essentials/PLAN.md`, not a UX pilot.
The old reference lessons 9–12 are no longer the entry path. Nick has completed reference 1–8; those
are background, not completions of these new lesson identities.

Use `/root/Software/skills-tools/curriculum-tools/courses/postgres/bin/pgcoach` (COACH below). The
existing installed command opens essentials by default. For other navigation use
`/root/Software/skills-tools/curriculum-tools/bin/tutor postgres-essentials` (TUTOR below). Use the
CLI for learner requests; do not read or edit generated lessons or SQLite progress directly. Neither
CLI executes lesson SQL; the learner runs the supplied commands in their terminals.

## Route requests

- Next unfinished available lesson: `COACH` or `COACH start`.
- Numbered lesson: `COACH NUMBER lesson`; results and insights: `COACH NUMBER review`.
- Complete view and optional references: `COACH NUMBER full`.
- Full intended course sequence, including planned entries: `COACH route`.
- Search, available modules, topics or status: `TUTOR search TEXT`, `TUTOR modules`, `TUTOR topics`,
  `TUTOR status --json`. Search returns authored lessons only.
- Next available lesson on a topic: `COACH --topic TEXT`; explain when the matching topic is planned
  but not yet authored rather than silently redirecting to the reference course.
- Completion, **only on explicit request**: `COACH NUMBER done` or `TUTOR done NUMBER`.
- Explicit progress correction/note/skip: `TUTOR undone NUMBER`, `TUTOR note NUMBER TEXT`,
  `TUTOR skip NUMBER`. Pass note text as one argument. No lesson requires a note.
- An uninitialized essentials catalog: `TUTOR init`, then retry. If the built artifact is missing,
  run `deno task build postgres-essentials` from curriculum-tools before init.

COACH and TUTOR above are abbreviations for the absolute commands, not literal executable names.
`--db PATH` selects isolated progress for author checks. Do not use legacy `pgtutor done` for the
new course: that wrapper may address reference ordinals. Never infer which course a completion
refers to if recent context is ambiguous; identify the lesson before writing progress.

## Teach the current batch

Lessons 1–15 cover visibility, retention, transaction conflicts, uncertain outcomes and transaction
lifetime; 16–21 develop measured query work. The latest authored batch is:

22. **A join adds another memory consumer.**
23. **Connect commit acknowledgement to durable log work.**
24. **Measure WAL per useful operation.**
25. **A checkpoint writes pages without ending transactions.**
26. **Reconcile committed and aborted work after a crash.**

Use two substantial views. `lesson` gives the mechanism, terminology, diagram and purpose before
commands, including the terminal setup. Essential teaching must not be postponed until `review`.
`review` explains what the actual evidence showed, its implications and its limits. Follow the brief
mental reflection and clarity/time cues naturally; do not require typed predictions, written
answers, reports or per-stage acknowledgements. Give targeted help if the result is confusing.

The 20–30 minute target includes all core work, with no required book-reading detour. Estimates
remain provisional until learner feedback. At 30 minutes follow the safe cleanup instructions; there
is no saved pause/resume system. The next session can rerun the idempotent setup.

Nick enjoyed the flow in lessons 1–3. After lesson 26, discuss whether the concepts and diagrams
were sufficient upfront, whether review added insight, and whether the pacing worked. Use that
feedback while preparing the next actual course lessons, starting with row 27 of the fixed plan. Do
not insert an unrelated UX-only batch. Only 1–26 currently exist: do not invent commands for a
planned lesson or say all 40 are complete when the available batch is finished. Record agreed scope
changes in the plan before authoring.

## Original reference course

For explicit original-course requests, use `COACH --reference NUMBER full` and
`/root/Software/skills-tools/curriculum-tools/bin/tutor postgres ...` for its navigation/progress.
It preserves the 92 original lessons, their identities and progress. Reference numbers are not new
essentials numbers. Do not require the old lesson-12 pilot review on the essentials path.

## Lab and progress invariants

The learner lab is `/labs/pglab/primary`, PostgreSQL 16, socket `/tmp`, port 5440, role postgres,
database lab. Use the rendered instructions; never recreate obsolete `/var/lib/postgresql/pglab`
fixtures. SQL lessons reset only their named `pe_*` tables. Lessons 4 and 16–24 use one psql
session; the other SQL lessons use two. Lessons 10–11 use a supplied shell client that opens its own
connections and removes its private schema. Lessons 25–26 use supplied shell controllers that
allocate, stop and remove their own private PostgreSQL 16 clusters. They never restart or crash the
learner server. Check the owned-cluster removal record on normal exit or Ctrl-C. If interrupted,
follow the rendered cleanup: ROLLBACK in each SQL session, restore changed settings and drop the
exact lesson table, or use Ctrl-C for a shell client and check its schema-removal record. Preserve
unrelated learner work.

Reading, showing, explaining or successfully author-validating a lesson never completes it for Nick.
Only an explicit completion request does. Resolve “done” to the most recently discussed course and
lesson when unambiguous, and report errors instead of assuming success.

Before author labs, read the repository VM cleanup guidance and verify current resources. Budget
owned fixtures, stop and remove them after validation, and check learner readiness and unchanged
reference progress. Preserve existing learner progress and active unrelated sessions.
