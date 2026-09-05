# Coaching pilot: learn a small batch, review, then adapt

Approved by the learner on 2026-09-05. This narrows the broader
[flow change plan](08-coach-flow-navigation.md): implement the next four lessons first, and defer
course-wide guide rewrites until the learner has tried the approach. Lessons 1–7 were completed with
the old non-pgcoach flow; only lesson 8 was completed with the old pgcoach flow, with ChatGPT help.
There is no need to repeat lesson 8 as an acceptance assignment.

## First batch: lessons 9–12

| Lesson                     | Experiment                                                        | Why it belongs in the pilot                                                             |
| -------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 9 — TOAST and large values | Compare storage, reads and updates of large text.                 | Tests whether several comparisons form one understandable single-session lesson.        |
| 10 — Buffer cache and I/O  | Compare repeat scans and dirty pages before/after checkpoint.     | Tests output interpretation, bounded depth and a separately budgeted core reading stop. |
| 11 — Transaction IDs       | Watch two sessions obtain transaction IDs as they write.          | Tests explicit terminal provisioning, session switches and just-in-time vocabulary.     |
| 12 — Snapshot anatomy      | Watch an uncommitted writer and the view before/after its commit. | Tests a more abstract model grounded in two-session observations, then ends the pilot.  |

Four is enough to sample different teaching demands while keeping rework small. This is not a claim
that four lessons validate the entire course. Recovery, replication and incident work need another
review when those forms first appear.

Start explicitly with `pgcoach 9 start`. The existing catalog records lesson 8 as completed at an
older revision, so unqualified `pgcoach start` can still offer it for revision review. This pilot
does not rewrite that completion or refresh the learner catalog. Its four current setup/code/result
fields were checked against the live catalog before implementation.

## What changes for this batch

The four guides opt into a course-local renderer; other lesson guides stay as they are. The default
path is `start → run → inspect → explain → reveal → apply`, with complete optional variation
commands in `vary`. Existing stage names remain direct entry points. `syntax` provides the complete
syntax reference when wanted. Required explanations appear beside the relevant core command blocks.

The learner makes a quick mental guess and looks at the result. The later steps connect the result
to that guess and explain the mechanism. There are no typed answers, required notes, worksheets,
per-stage acknowledgements, timers or pause/resume machinery. Commands and session order remain
those of the accepted experiments; presentation removes old instructional comments in favour of
phase introductions. The optional snapshot variation must actually interleave a committed writer
with a stable reader, rather than displaying the same snapshot twice without a change between.

Show a provisional whole-core time range, a 60-minute wrap-up cue and separately budgeted optional
variation. Lesson 10 announces its existing core reading at the start and shows the exact excerpts
at the finish. Core reading remains required before lesson 11; ordinary references remain optional.

## Review that appears in the actual flow

Each pilot `apply` ends with a brief invitation to mention friction or a poor time estimate. This is
optional conversation, not a lesson report. Do not interrupt every successful lesson with a
mandatory survey.

Lesson 12 ends with a conspicuous **stop before lesson 13** for an approximately five-minute chat:

- Could pgcoach and the experiment terminals carry the lesson, or where was outside help needed?
- Did each step provide the context needed, and did comparing results with the guess help?
- Did the pacing fit an evening? What should be kept, shortened or explained differently?

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

Likely next candidate: lessons 13–16, continuing MVCC and its next reading stop. This is
provisional; choose the actual scope after reviewing 9–12. A repeated problem can be fixed
immediately rather than waiting for the boundary. No automatic course-wide rewrite follows a
positive review.

## Review status

**Awaiting learner trial.** Technical validation can establish command preservation, functioning
navigation and reproducible observations; it cannot establish that the learner finds the UX good or
the estimates accurate. Record the first batch's decisions here after the learner tries it.
