# Coach flow: navigation, per-stage context and guide substance

Audit and implementation contract, 2026-09-05. Requested by the learner after working lesson 9 and
finding its coaching materially better than the lessons around it. This document records what was
measured, what must change, and how to keep it from regressing. It is an audit and a plan; no
renderer or guide file was changed in producing it.

The learner's stated goal: walk the pgcoach flow with every needed context in the current pass, know
which terminals to open before running anything, never meet a step that depends on something a later
step introduces, and move between steps without remembering the stage vocabulary.

## Ownership and sequencing

The systems engineering refactor, final audit and resource cleanup were committed and pushed as
`e44cae6`. See [the final integration report](../validation/09-final-integration.md) and
[cleanup record](../validation/09-final-cleanup.md); the temporary handoff is retired. Lesson 9's
source, guide and knowledge changes are included in this stopping point, so the earlier collision
with in-progress integration is resolved.

`tools/coach.ts`, `tools/coach_test.ts` and `bin/pgcoach` remain the renderer workstream's scope per
[01-guided-cli.md](01-guided-cli.md). **Implement workstream 1 first**, then revise guide modules
against that navigation/context contract in workstream 2. Check the working tree and current
ownership before editing; any new concurrent changes require coordination.

**Stopping-point status:** this document preserves the coaching audit and proposed implementation
contract. Neither workstream is implemented by this commit checkpoint. The learner decisions below
remain open; committing this plan does not settle them or expand the current task into
implementation.

Preserve the untouched original lessons 1–7, surviving slugs, learner progress and the seven reading
stops. Author checks use a copied catalog; they never refresh the learner database.

## What was measured

Reproduce with `lessons.json` and a Deno dump of `GUIDES` from `guides/mod.ts`, joined on slug. All
counts below are against the built 92-lesson catalog.

**Coverage is correct and complete.** 85 of 92 built lessons have a guide. The 7 without are exactly
lessons 1–7, which 01-guided-cli.md excludes deliberately; they fall back to the `full` view. There
are no orphan guides. pgcoach was intended for every lesson except those, and it reaches every one
of them.

**Catalog divergence at audit time.** The learner's live database reported 95 active lessons; the
built catalog has 92. The completed refactor preserved the learner database. Refresh through
`bin/tutor postgres init` from the repository root only when the learner authorizes it; author
checks continue using `--db` with a disposable copy. See the course README for that distinction.

**Navigation is effectively absent.** The renderer emits a next command in exactly one place: the
`start` stage's closing line. Searching all 85 guides for a `pgcoach <stage>` pointer in any of
`brief`, `predict`, `inspect`, `explain`, `vary` or `apply` finds **one guide** —
`toast-and-large-values` (lesson 9). That is the whole reason lesson 9 feels navigable. Its pointers
are hand-written prose, carry no previous command, drop `--db`, and disagree with the documented
order: its `explain` sends the learner to `reveal` and then back to `vary`, while README and
01-guided-cli.md both order `inspect → explain → vary → apply` with reveal available on request.

The `start` stage's next command also prints the hardcoded absolute path in `tools/coach.ts`'s
`COACH` constant, not the `pgcoach` alias the learner actually uses.

**Guide substance falls off a cliff between lessons 11 and 37.** Total characters across the six
coached prompt fields, by module:

| Module                            | Lessons | Median      | Thinnest    |
| --------------------------------- | ------- | ----------- | ----------- |
| locking                           | 30–37   | 448         | 358 (#31)   |
| mvcc                              | 11–17   | 506         | 439 (#13)   |
| vacuum                            | 18–20   | 514         | 468 (#19)   |
| isolation                         | 21–29   | 583         | 497 (#25)   |
| query-planning                    | 38–44   | 808         | 789 (#40)   |
| indexes                           | 45–51   | 821         | 750 (#49)   |
| observability, checkpointing, wal | 52–68   | 1,010–1,130 |             |
| replication, logical, patterns    | 69–87   | 1,151–1,326 |             |
| reliability                       | 88–92   | 2,607       | 2,230 (#90) |
| **storage (lesson 9)**            | 9       | **4,592**   |             |

Lessons scoring under 700 characters form two contiguous runs: **11–28 and 30–37, 26 lessons.**
Lesson 9 is the richest guide in the course, roughly twelve times the thinnest. Per-field medians
across all 85 guides are brief 117, predict 163, inspect 177, explain 162, vary 143 and apply 190
characters — one or two sentences each.

For contrast, lesson 31 is a three-session lesson whose entire coaching is: inspect "Compare
pg_blocking_pids with wait_event_type and wait_event.", vary "Use FOR SHARE for B and C.", apply
"What query would you run first during a latency incident?"

**Terminal provisioning is missing where it matters most.** 65 of 92 lessons need more than one
session or a shell (53 psql-only, 37 shell, 2 mixed; 30 lessons use 2–3 sessions). Of the 62 such
lessons that have guides, **57 contain no session, terminal or shell wording anywhere in the text
`start` renders**, and 49 mention none across `inspect`/`explain`/`vary`/`apply` either. The `start`
stage prints a bare "Sessions: 3" with no statement of what those sessions are or what to connect
them to. Only 2 multi-session lessons (85, 87) lack Session labels inside the run code itself, so
the gap is in the coaching, not the experiments.

**Mid-flow stages render without context.** `inspect`, `explain`, `vary` and `apply` emit the lesson
identity plus the guide sentence and nothing else: no safety level, no session reminder, no pointer
back to the commands that produced the evidence. Lesson 9 reads well only because its author wrote
that continuity into the prose by hand ("Use the output saved from run, in this order", "Continue in
the same psql session after run"). Nothing requires it.

**Authored fields never reachable from the coach flow.** `prerequisites` (91 lessons), `challenge`
(91 lessons) and `overview` (92 lessons) are rendered by no pgcoach stage; only `full` shows them.
Prerequisites are a spec divergence — 01-guided-cli.md requires `start` to show prerequisite IDs and
the renderer does not.

**Hints are disproportionate.** Hint pairs run to a median of 1,487 characters, upper quartile
13,728 and maximum 31,166, against prompts of roughly 150. The nudge is often two orders of
magnitude larger than the question it answers.

**No authoring contract exists for guides.** `../../docs/AUTHORING.md` refers to coaching in a
single incidental line and the `curriculum-author` skill in two. Nothing defines guide field
content, substance floors, self-containment or navigation. That absence, not any individual author's
choice, is why quality varies twelvefold.

## Pace, for the learner's planning

Authored `estimatedMinutes` totals 2,360 minutes — **39.3 hours across 92 lessons**, median 25,
range 5–60; replication (5.1 h), distributed-patterns (4.2 h), logical-replication and reliability
(3.7 h each) are the heaviest modules. That figure covers running the experiment, not the coach loop
or the seven reading stops (lessons 10, 14, 20, 28, 37, 39, 60).

The learner's own completion timestamps give five same-session intervals: 40, 20, 25, 74 and 88
minutes against authored estimates of 10, 5, 10, 10 and 15 — a **median of 40 minutes per lesson and
a median ratio of 4.0×**. Two further intervals crossed overnight and were excluded. Treat this as
weak evidence: n=5, drawn from the unguided setup-heavy lessons 1–7, inclusive of breaks, and
timestamped when `pgtutor done` was run rather than when work stopped.

A defensible planning band, assumptions stated: **55–90 hours** at 35–60 minutes per lesson plus the
reading stops; 39 hours is a floor that ignores the coach loop, and the observed 4× extrapolates to
about 150 hours but is probably pessimistic because lesson 1 included building a cluster. Roughly 30
sessions at two hours and three lessons each. Do not present any of these as a measured course
duration.

## Workstream 1 — renderer, coach-owned files only

Structural fixes belong in the renderer so all 85 guided lessons improve at once. None of these may
leak `expectedResult` or `systemsLens` into a pre-reveal stage.

1. **One ordered stage flow.** Replace the unordered `STAGES` set with an ordered in-flow array
   `start → run → inspect → explain → vary → apply → reveal`, with `hint1`, `hint2` and `full`
   off-flow. Derive prev/next from that array so ordering has a single source of truth. Pin the
   README's reveal-after-apply order, then correct lesson 9's prose to match rather than leaving two
   documented orders in circulation.
2. **A navigation footer on every stage**, including off-flow ones, propagating `--db`, using the
   short `pgcoach` invocation rather than the hardcoded absolute path:

   ```
   ── Prev: pgcoach 31 inspect · Next: pgcoach 31 vary
      Anytime: pgcoach 31 hint1 · hint2 · reveal · full
      Finished? pgtutor done 31, then pgcoach start
   ```

   `start` has no previous within the lesson; offer the previous lesson's `reveal` or omit the
   field. `reveal` ends the flow and should point at completion and the next lesson.
3. **A context strip on `inspect`, `explain`, `vary` and `apply`:** run-in, session count, safety
   level, and one line telling the learner they can reopen the exact commands with `pgcoach N run`.
   This is what makes a stage survive being read on its own, hours later.
4. **A `## Terminals` block on `start`** whenever `sessions > 1` or `runIn != "tool"`: how many
   terminals to open, what each is for, and the connection command — stated without disclosing the
   experiment or its result. This is the learner's explicit request to have terminals ready before
   the run stage, and setup must stay withheld from `start` so the prediction remains honest.
5. **Render `prerequisites` in `start`**, closing the 01-guided-cli.md divergence.
6. **Decide where `challenge` belongs.** It is authored for 91 lessons and currently unreachable
   from the coach flow. Recommended: an off-flow `challenge` stage listed in the footer beside
   hints, so `apply` keeps its decision-and-tradeoff shape. This needs the learner's call before
   implementation.
7. **Tests in `coach_test.ts`:** every stage emits a footer; prev/next are consistent with the flow
   array in both directions; `--db` survives into every emitted command; the terminals block and
   context strip never contain expected-result or systems-lens text; `full` still delegates to the
   unchanged legacy renderer.

## Workstream 2 — guide substance, 26 lessons

8. **Write the contract before writing guides.** A course-local `guides/README.md`, referenced from
   `../../docs/AUTHORING.md`, stating for each field its purpose, a substance floor, and these
   rules: a stage may not depend on anything a later stage introduces; a stage may not refer to "the
   above" or "the previous step" without restating what it means; a guide for a multi-session lesson
   must name which session each observation comes from; a hint may not dwarf its prompt beyond a
   stated multiple. Lesson 9 is the reference implementation for all of it.
9. **Add `tools/guide_lint.ts` to the build** so this cannot silently regress. Proposed initial
   checks, thresholds to be calibrated against the existing rich guides rather than asserted: a
   prompt field below the floor; forward-reference phrases; a multi-session lesson whose guide never
   names a session; prompt-to-hint ratio beyond the stated multiple. Treat the first run as
   calibration — it will flag the 26 known lessons, and the thresholds are right only if it does not
   flag the reliability and replication guides.
10. **Backfill in module batches**, thinnest and most session-heavy first: `06-locking` (8 lessons,
    all multi-session) → `03-mvcc` (6) → `05-isolation` (9) → `04-vacuum` (3). Roughly 26 lessons.
    Raising a guide to the ~1,100-character band of the wal and replication modules is the target;
    lesson 9's 4,592 is a ceiling, not a quota.
11. **Repeatable verification.** A script rendering all 92 lessons across all stages against a
    copied catalog, checked for a missing footer, a leaked expected result, a dangling stage
    reference and an unnamed session. Run it as the acceptance gate for both workstreams and on
    every later guide change.

## Open decisions for the learner

- Where `challenge` should surface: an off-flow `challenge` stage, folded into `apply`, or left to
  `full`.
- Whether `reveal` stays after `apply` (README's order, recommended) or moves after `explain` as
  lesson 9's prose currently suggests.
- Whether the footer should show the next lesson's `start`, given that completion is explicit and
  pgcoach must never record progress on the learner's behalf.

## Limits

The substance thresholds in this document are proposals derived from the existing distribution, not
validated teaching minimums; a short prompt is not automatically a bad one, and character count is a
proxy for self-containment rather than a measure of it. The 26-lesson list is a starting queue, not
a defect list — each guide still needs an author's judgement about what context is actually missing.
The pace band rests on five intervals from the unguided lessons and will need revisiting once the
learner has completed a run of guided ones. Nothing here has been executed against the renderer; the
renderer contract above is a specification, and its acceptance is the tests and the verification
script, not this document.
