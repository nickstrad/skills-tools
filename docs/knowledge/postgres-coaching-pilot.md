# PostgreSQL coaching: validate small batches before broad rollout

The first revised coaching batch is lessons 9–12, with a visible review before lesson 13. Updated
2026-09-05. The [batch plan](../../curriculum-tools/courses/postgres/designs/09-coach-pilot-batches.md)
records scope and future learner decisions; its UX and timing are awaiting a learner trial.

## What happened

The learner completed lessons 1–7 outside pgcoach and only lesson 8 through the old pgcoach flow,
with ChatGPT help. The coaching review identified missing context, forward references and ambiguous
step purpose. The learner requested estimates and bounded evenings, then explicitly rejected
required notes, typed answers and pause/resume machinery. He chose iterative batches with brief
conversational feedback before investing in the entire course.

Lessons 9–12 now opt into a pilot renderer through course-local guide metadata. Their authored
phases slice the selected catalog's existing command text at checked boundaries. Only full-line
comments are removed, preserving Session labels and executable SQL; normalized command/session
comparison is tested. Required commands appear in run; optional variations appear directly in vary.
The generic tutor catalog does not expose prerequisites in its show JSON, so this pilot does not
claim the broader plan's prerequisite-display item is implemented.

## Why it matters

Technical success and teaching success are different acceptance checks. A learner can still find a
passing experiment confusing or too long. Keep timing provisional until the learner reports how it
went. Character counts do not establish sufficient context; neither does an agent's assertion that
a guide is self-contained. Primary review removed future WAL/ring/retention questions and repaired
a misplaced Session A boundary after delegated drafting.

Exact variation execution also matters. A small table can already be entirely cached before
pg_prewarm: equal zero reads is valid. Printing a repeatable-read snapshot twice without a writer
between does not test stability across a commit. The pilot's complete two-session variation makes
that contrast: Carol stayed at 110 inside A's snapshot after B committed, then became 120 after A
committed and took a fresh view.

The learner's live catalog currently records lesson 8 as done at an earlier revision. An
unqualified next command therefore offers that revision again. Use explicit `pgcoach 9 start` for
this pilot; do not modify completion records to make navigation convenient. The four pilot
lessons' live setup/code/results matched the built catalog during verification, so no learner
catalog refresh was needed. Future phase mismatches fail visibly instead of silently omitting SQL.

## How to apply

- Read the batch plan before extending the approach. Update only the next 3–5 agreed lessons after
  the learner reviews the current batch; move the review boundary at that time.
- Lesson 12 apply/full and lesson 13 start show the review. This is an instructional stop, not a
  progress state, a dummy numbered lesson or a mandatory written report. Explicit full access
  remains available. Do not add an acknowledgement command or automatic completion.
- Maintain one shared navigation order and quoted database arguments. Keep core nudges distinct
  from variation help. Show core reading excerpts at apply/full and budget their time at start.
- For phase edits, compare session routing and executable commands to the accepted lesson. Run
  changed executable variations in an owned disposable cluster, using the exact rendered SQL.
- Check both a copied initialized catalog and the live read-only view. Preserve learner progress,
  retire validation clusters immediately and keep only concise acceptance records.

Actual observations and final validation are in the
[pilot validation report](../../curriculum-tools/courses/postgres/validation/10-coaching-pilot.md).
