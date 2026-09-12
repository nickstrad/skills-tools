# Coaching pilot: learn a small batch, review, then adapt

> Historical design record. This superseded pilot is retained for provenance, not as a current route
> or assignment. See [PLAN.md](../PLAN.md) and the
> [shared batch workflow](../../../../docs/lesson-batch-workflow.md) for current guidance.

> Superseded as the learner path on 2026-09-06. Nick explicitly requested real first lessons of a
> fixed smaller-chunk course rather than this UX pilot. The active course is now
> [PostgreSQL Essentials](../../postgres-essentials/PLAN.md): 40 planned lessons, first three
> available, with feedback after essentials lesson 3. The old pilot below is historical reference;
> do not send the learner through it before the essentials course. `pgcoach` now opens essentials.

## Current flow decision — 2026-09-05

Nick found the many short stages long-winded and chose **two views**, now implemented for 9–12:
`pgcoach NUMBER lesson` (also the default and `start`) followed by `pgcoach NUMBER review`. Lesson
contains the needed concepts, a terminal diagram, terminal instructions and the complete experiment.
Review interprets the output and gives implications and limits. Essential teaching and visuals
belong before execution; review must not be the first explanation of the mechanism. Optional
variation, syntax, full material and the earlier direct stages remain available.

The new lesson target is **20–30 minutes**, including all core work. The existing four experiments
have not yet been split: their longer estimates and lesson 10's optional source context are still
displayed honestly. A 30-minute sitting cue includes rolling back open sessions when stopping early
and rerunning setup when returning. There is no saved pause/resume state.

**Current path:** Nick is leaning toward roughly **24 further essentials lessons**, building on the
eight already completed, each targeting 20–30 minutes. This is the default direction for the next
batches, with the exact count and selection adjusted through learner feedback. The broader 40–48
route is optional later depth. The shorter route is not yet assembled or implemented in the catalog;
do not equate it with existing ordinals 9–32 or automatically mark anything complete.

The experiment view ends with a brief mental reflection connecting one changed result to its diagram
or explanation. Review interprets the evidence, then invites a light clarity/time check. The
explicit conversation after lesson 12 asks whether the first view gave enough context, whether
review added insight, and whether the work fit 20–30 minutes. Use that feedback to prepare only the
next small batch toward the essentials route. No typed answers or written reports are required.

This supersedes the six-stage path and 60-minute cue described in the original pilot below. The
two-view presentation is ready for learner feedback; shorter experiment design remains pending. The
SQL, session order, optional executable variations, source locators and progress are preserved.

Approved by the learner on 2026-09-05. This narrows the broader
[flow change plan](08-coach-flow-navigation.md): implement the next four lessons first, and defer
course-wide guide rewrites until the learner has tried the approach. Lessons 1–7 were completed with
the old non-pgcoach flow; only lesson 8 was completed with the old pgcoach flow, with ChatGPT help.
There is no need to repeat lesson 8 as an acceptance assignment.

## First batch: lessons 9–12

| Lesson                     | Experiment                                                        | Why it belongs in the pilot                                                                      |
| -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 9 — TOAST and large values | Compare storage, reads and updates of large text.                 | Tests whether several comparisons form one understandable single-session lesson.                 |
| 10 — Buffer cache and I/O  | Compare repeat scans and dirty pages before/after checkpoint.     | Tests output interpretation, bounded depth and a separately budgeted optional reading reference. |
| 11 — Transaction IDs       | Watch two sessions obtain transaction IDs as they write.          | Tests explicit terminal provisioning, session switches and just-in-time vocabulary.              |
| 12 — Snapshot anatomy      | Watch an uncommitted writer and the view before/after its commit. | Tests a more abstract model grounded in two-session observations, then ends the pilot.           |

Four is enough to sample different teaching demands while keeping rework small. This is not a claim
that four lessons validate the entire course. Recovery, replication and incident work need another
review when those forms first appear.

Start explicitly with `pgcoach 9 start`. The existing catalog records lesson 8 as completed at an
older revision, so unqualified `pgcoach start` can still offer it for revision review. This pilot
does not rewrite that completion or refresh the learner catalog. Its four current setup/code/result
fields were checked against the live catalog before implementation.

## What changes for this batch

The four guides opt into a course-local renderer; other lesson guides stay as they are. The default
path is `lesson → review` (`start` also opens lesson), with complete optional variation commands in
`vary`. Existing stage names remain direct entry points. `syntax` provides the complete syntax
reference when wanted. Required explanations appear beside the relevant core command blocks.

The first view explains the mechanism before execution and invites brief reflection afterward.
Review interprets what happened and adds insights. There are no typed answers, required notes,
worksheets, per-stage acknowledgements, timers or pause/resume machinery. Commands and session order
remain those of the accepted experiments; presentation removes old instructional comments in favour
of phase introductions. The optional snapshot variation must actually interleave a committed writer
with a stable reader, rather than displaying the same snapshot twice without a change between.

Show the honest unsplit experiment time range, a 30-minute wrap-up cue and separately budgeted
optional variation. Lesson 10's existing source context is optional and does not gate lesson 11.

## Review that appears in the actual flow

Each pilot `review` ends with a brief invitation to mention friction or a poor time estimate. This
is optional conversation, not a lesson report. Do not interrupt every successful lesson with a
mandatory survey.

Lesson 12 ends with a conspicuous **stop before lesson 13** for an approximately five-minute chat:

- Did the first view and diagrams give enough understanding to run the experiment?
- Can you connect one result to the mechanism, and did review add insight?
- Did the work fit 20–30 minutes? What should be shortened or explained differently?

Opening lesson 13's `start`, including when it is selected as the next unfinished lesson, shows the
same review instead of beginning the next lesson. Explicit access to full material remains
available. The boundary is a teaching reminder, not a database-enforced lock or recorded progress
state. It is not a numbered dummy lesson and does not change course ordinals or completions. It
stays visible until the next batch is prepared after our conversation; no acknowledgement command is
required.

## How subsequent batches work

1. The learner works through this batch, mentioning immediate friction whenever useful.
2. At the boundary, discuss the three questions briefly. The assistant summarizes the decisions in
   this document; the learner does not have to maintain notes.
3. Keep or adjust the approach, choose the next **3–5 lessons** based on their teaching demands, and
   update only those guides. Broader changes to the renderer require checking the already accepted
   pilot so they do not undo what worked.
4. Move the visible review boundary to the end of that batch. Retain a short record of decisions and
   unresolved issues here. Do not pre-author many batches while the design is unsettled.

Select the next candidate experiments from MVCC based on their contribution to the roughly 24-lesson
essentials route, splitting or consolidating to fit 20–30 minutes. Do not automatically advance
through every existing ordinal. Choose the actual scope after reviewing 9–12. A repeated problem can
be fixed immediately rather than waiting for the boundary. No automatic course-wide rewrite follows
a positive review.

## Review status

**Awaiting learner trial.** Technical validation can establish command preservation, functioning
navigation and reproducible observations; it cannot establish that the learner finds the UX good or
the estimates accurate. Record the first batch's decisions here after the learner tries it.
