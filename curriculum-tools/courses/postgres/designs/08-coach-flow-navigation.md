# Coach flow: navigation, per-stage context and guide substance

> Historical design record. This proposal is retained for provenance, not as a current assignment.
> See [PLAN.md](../PLAN.md) and the
> [shared batch workflow](../../../../docs/lesson-batch-workflow.md) for current guidance and model
> choices.

**Implementation scope update:** the learner has approved a four-lesson pilot, **9–12**, followed by
a brief review before lesson 13. The [batch plan](09-coach-pilot-batches.md) now governs rollout.
The earlier lesson-8 prototype and broad backfill below remain design background; they are deferred,
and lesson 8 need not be repeated. Only lessons 9–12 opt into the revised renderer in this pass.

Audit and implementation contract, 2026-09-05. The learner completed lessons **1–7 with the old
non-pgcoach flow** and **only lesson 8 with the old pgcoach flow**. Lesson 9 is a richer authored
guide used for source comparison, not a lesson the learner reports completing or a validated UX
success. This corrects the original plan's mistaken attribution to a lesson-9 experience. This
document records what was measured, what must change, and how to keep it from regressing. It is an
audit and a plan; no renderer or guide file was changed in producing it.

**Review update, 2026-09-05:** Nick's subsequent feedback is specifically about a poor experience
with lesson **8**, much of which he worked through with ChatGPT. Steps introduced concepts needed
earlier, and their purpose and relationship were unclear. He wants pgcoach plus the experiment
terminal(s) to drive most lessons independently, with ChatGPT available for depth. He is taking this
course outside work while married with children; bounded sessions and an explicit stopping rule are
requirements. His clarification rules out a pause/resume system, required notes, written answers and
answer-submission commands. Ask for a quick guess at the relevant moment, then trust reflection as
the following steps explain and compare results. Practice is the outcome. The review and revised
proposals below supersede the original recommendations where noted. This remains a plan, not an
implemented coaching change.

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
[01-guided-cli.md](01-guided-cli.md). **Prototype lesson 8's content and flow together**, implement
workstream 1, then revise guide modules against that navigation/context contract in workstream 2.
Check the working tree and current ownership before editing; any new concurrent changes require
coordination.

**Stopping-point status:** this document preserves the coaching audit and proposed implementation
contract. Neither workstream is implemented by this commit checkpoint. The learner decisions below
remain open; committing this plan does not settle them or expand the current task into
implementation.

Preserve the untouched original lessons 1–7, surviving slugs and learner progress. Author checks use
a copied catalog; they never refresh the learner database.

## Review: strengths, weaknesses and proposed corrections

### Strengths to keep

- **The audit identifies systemic causes.** Navigation and recurring context belong in the renderer;
  lesson-specific explanations belong in guides. This makes improvements reusable across the course
  instead of depending on unusually careful prose in lesson 9.
- **It protects the experiment-led approach.** Prediction, evidence, causal explanation and an
  engineering decision are useful learning activities. Complete supplied commands keep unfamiliar
  SQL syntax from becoming the assignment.
- **It distinguishes coverage from quality.** All eligible lessons have guides, but that does not
  establish that a learner can follow them. The terminal and unreachable-field findings are
  concrete, actionable gaps.
- **It preserves identities and learner state**, calls for isolated checks, and labels the timing
  evidence as weak instead of treating completion timestamps as accurate study timers.

### Weaknesses that matter for this learner

| Gap in the original plan                                                    | Why it matters                                                                                                                             | Proposed correction                                                                                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Footers are treated as the main flow repair.                                | Knowing the next command does not explain why the current step exists.                                                                     | Every stage states its question, the evidence it uses, the small action to take, and what counts as enough.                                |
| Lesson 8 is outside the 26 thin-guide queue.                                | The learner's actual failure case would survive the first content pass.                                                                    | Make lesson 8 the first end-to-end prototype and acceptance case, then lesson 9 and a multi-session lesson.                                |
| Longer prompts and character floors stand in for teaching quality.          | More prose can add context time and repeat the same confusion.                                                                             | Review semantic completeness and context burden; use length only to locate candidates for review.                                          |
| The proposed path postpones `reveal` until after variation and application. | A mistaken explanation can drive two more tasks before any correction.                                                                     | Check the core explanation immediately after `explain`, then make a short application decision; offer extra variation explicitly.          |
| `run` prints all SQL followed by the full syntax breakdown.                 | The learner must connect several experiments to explanations below them; the breakdown includes later challenge material and some answers. | Group commands and just-in-time explanations by experiment phase; keep variation-only syntax with the variation.                           |
| Avoiding all conceptual disclosure is conflated with avoiding spoilers.     | Predicting an unfamiliar mechanism without its setup becomes guessing or requires ChatGPT.                                                 | Supply definitions, scenario and controls before prediction; withhold the specific comparison's worked answer until the learner has tried. |
| The estimate covers command execution, with no useful stopping guidance.    | “20 minutes” offers little help when interpretation and troubleshooting consume the evening.                                               | Estimate the whole core experience, publish a reassessment point and session cap, and give a simple cue to wrap up.                        |
| `vary` and `challenge` can describe the same experiment.                    | Exposing both as required work would duplicate effort.                                                                                     | Identify overlap by lesson; render one optional extension once unless its evidence is explicitly essential to the core objective.          |

The current lesson-8 source supports these concerns. Its `start` prediction asks for a “fillfactor
pair or transaction shape” without naming the pairs or explaining the two transaction cases in the
brief. `run` contains both cases, an indexed-key change and a physical page sample; its syntax
breakdown also introduces the later fillfactor-80 challenge. `vary` names supplied fresh tables but
does not include their commands; `hint2` carries a dense command string. These are source findings,
not a reconstruction of the exact older catalog/ChatGPT session Nick used.

### What “pgcoach is enough” means

For the normal core path, a learner can answer these questions from the current stage and explicitly
identified earlier evidence: **Why am I doing this? What do I run or think about now? Where do I run
it? What output matters? When can I move on?** No required task depends on a future stage, a hidden
hint or asking ChatGPT to supply missing instructions.

**Interaction contract:** ask the guess immediately before the comparison it concerns, after
introducing enough context to reason about it. Accept a thought or spoken guess; never require
entering it into pgcoach. Later say, for example, “Look at these two counters. Did that match your
guess? Here is why they differ…” and explain. Reflection should accompany the experiment, not become
a separate assignment. Required notes, answer capture, reflection logs, evidence worksheets and `-n`
note phrases are outside this flow. Do not add extra commands just to acknowledge thinking. Remove
note solicitations from every pgcoach view, including any inherited “Your note” prompt in `full`.
Preserve the complete lesson content and executable commands in that view; its historical note
prompt is not part of the content-preservation requirement.

Use one coaching terminal plus one experiment terminal for a single-session SQL lesson such as 8.
Multi-session experiments must announce additional terminals and their roles before setup; “two
terminals” is not a promise for the whole course. Connection commands belong in the environment
plan, including private fixture paths where relevant, rather than a guessed universal connection.

At each stage, put the next action first, followed by the short explanation needed now. Reuse a
compact lesson question and phase labels to connect the work; do not repeat the entire lesson.
Provide all unfamiliar executable commands on the required path. Hints are help with reasoning; they
are not the only place to obtain required setup or commands. Longer syntax/reference material
remains available on demand, with a direct pointer.

**Recommended default path:** `start → run → inspect → explain → reveal → apply`, then finish or
choose `vary`. `start` includes a brief mental prediction; `explain` asks the learner to consider
how the result compares with that guess; `reveal` explains the evidence and causal model. `apply`
poses a decision and tradeoff to think about. Existing stage names remain valid direct entry points.
A learner can request the worked answer sooner without failing the lesson. Where a variation
establishes an essential objective, label and budget it as core explicitly rather than silently
assuming all variations are optional. Preserve existing experiment commands while changing
presentation; removing or changing an experiment requires a separate semantic decision.

The old staged design included optional source material at the finish decision. It was never part of
the current route: no excerpt, source note or external reading is required before the next lesson.

## What was measured in the original audit

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
`toast-and-large-values` (lesson 9). This makes its source appear more navigable; learner experience
with that guide has not been established. Its pointers are hand-written prose, carry no previous
command, drop `--db`, and disagree with the documented order: its `explain` sends the learner to
`reveal` and then back to `vary`, while README and 01-guided-cli.md both order
`inspect → explain → vary → apply` with reveal available on request.

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

## Pace evidence from the original audit

Authored `estimatedMinutes` totals 2,360 minutes — **39.3 hours across 92 lessons**, median 25,
range 5–60; replication (5.1 h), distributed-patterns (4.2 h), logical-replication and reliability
(3.7 h each) are the heaviest modules. That figure covers running the experiment, not the coach loop
or any external source material.

The learner's own completion timestamps give five same-session intervals: 40, 20, 25, 74 and 88
minutes against authored estimates of 10, 5, 10, 10 and 15 — a **median of 40 minutes per lesson and
a median ratio of 4.0×**. Two further intervals crossed overnight and were excluded. Treat this as
weak evidence: n=5, drawn from the unguided setup-heavy lessons 1–7, inclusive of breaks, and
timestamped when `pgtutor done` was run rather than when work stopped. These intervals describe the
old **non-pgcoach** experience in lessons 1–7; they do not measure coaching overhead. Lesson 8 is
the only learner-reported trial of the old pgcoach flow, with ChatGPT assistance and no reliable
standalone coaching duration recorded here.

The original **55–90 hour** band was a rough extrapolation, not measured course duration. Its
suggestion of three lessons in each two-hour session does not accommodate the upper end of its own
35–60 minute per-lesson range. Do not use the observed 4× multiplier to inflate every lesson or use
the 39-hour authored total as a full learning estimate. Replace those scheduling suggestions with
the explicit, provisional budgets below.

## Time estimates, session caps and a stopping rule

These are **proposed design budgets**, not measured learner speed or a commitment Nick has made. The
aim is a course that fits ordinary evenings, including interruption by family responsibilities.
Reaching a cap means stop for the evening, seek targeted help or fix the guide; it is not evidence
of poor ability.

### What to show before starting

| Lesson kind                               | Core learning estimate | Reassess at | Session cap                                        |
| ----------------------------------------- | ---------------------- | ----------- | -------------------------------------------------- |
| Short, familiar mechanism                 | 20–30 min              | 25 min      | 40 min                                             |
| Standard internals experiment             | 30–45 min              | 40 min      | 60 min                                             |
| Dense comparison, concurrency or recovery | 45–60 min              | 45 min      | 60 min per sitting; flag longer lessons in advance |

Core time includes orientation, prediction, setup, running commands, inspecting evidence,
explaining/checking it, a short application decision, and safe wrap-up. Show optional variation
separately, usually **10–15 minutes**. Identify expected machine waits inside the core estimate.
Installation repair, unexpected failures, family breaks and optional exploration are not calibrated
learning time; troubleshooting still consumes the evening's available time and cannot silently
extend its cap.

Reserve the last **5 minutes** for wrap-up. A cap is a cue to end the sitting, not a timer that
kills a process or marks a lesson complete. If a lesson realistically needs 75–90 minutes, say so up
front and recommend spreading it over two evenings. Do not build a pause/resume workflow, saved
checkpoints or session-state machinery for this. Existing experiment safety and cleanup instructions
still apply.

Example of proposed lesson-8 start text (not current CLI output):

```text
Question: When does reserving page space reduce index work during updates?
Core: about 40–50 min. Reassess at 40 min; aim to wrap up by 60 min.
Optional fillfactor-80 variation: +10–15 min.
Terminals: this coaching shell + one psql session connected to the learner lab.
Enough today: compare the two update cases, check the indexed-key counter change,
interpret the page sample with its limits, and consider one benefit/cost of page slack.
```

### When time is becoming unproductive

1. **After about 5 minutes stuck on one instruction or unexplained output**, use the relevant
   nudge/worked explanation. A quick mental guess is enough before looking; there is no written
   answer to complete or submit.
2. **After 10–15 minutes on the same unresolved blocker**, stop blind retries. Use targeted ChatGPT
   help if useful, or stop for the evening. Missing prerequisite context or commands are guide
   defects to fix, not additional homework.
3. **At the reassessment point**, skip optional depth and head toward the explanation and wrap-up.
   Repeating a successful experiment to chase a “perfect” variable counter is not required.
4. **At the session cap**, finish the immediate safe action and wrap up. The learner can stop
   earlier whenever needed. No pause command, resume record, written summary or deferred-question
   list is required. Elapsed time alone must not mark the lesson complete.

**The outcome is practice with understanding:** run the experiment, notice the result, compare it
with the initial guess, and consider the coach's causal explanation and engineering implication. The
flow should trust this reflection rather than test for a written artifact. Deep implementation
details, memorizing SQL and external reading are not implicit completion criteria. Personal notes
are entirely the learner's choice and do not appear as a course task. Existing explicit completion
remains available without a note; do not add answer commands, `-n` phrases or per-stage
acknowledgements.

### Course-scale planning and calibration

Nick described a 93-lesson course. The checked-in catalog currently contains **92** lessons; the
original audit recorded 95 in the unrefreshed learner catalog. This review rechecked the built
92-lesson count and 2,360 authored minutes, but did not refresh or renumber the learner catalog. Use
93 for a conservative planning illustration: an eventual average of **35–50 minutes of core
learning** yields **54–78 hours**. The former proposal separately allowed about **2–4 hours** for
external source material; that material is no longer assigned. Rounded with modest scheduling
overhead, **60–85 hours** is an initial planning envelope, excluding optional deep dives and
substantial environment repair. The desired average still needs testing against the heavier lessons;
this is a design target, not a measured completion forecast.

At two hours per week that envelope is roughly **30–43 weeks**; at three hours, **20–29 weeks**,
before holidays or missed weeks. These are examples, not a prescribed weekly commitment. Prefer one
bounded lesson or a named half-lesson per sitting over a quota of three lessons per evening.

Calibrate with **5–10 guided lessons** of different kinds, including lesson 8 and multi-session
work. Use occasional conversational feedback about whether the estimate fit; do not add time logs,
forms or learner reporting tasks. Distinguish core work, getting stuck and elective depth from
family breaks when interpreting that feedback. Ask whether pgcoach alone supplied enough context and
where help was needed. Repeated cap overruns should trigger a content/flow review or a smaller scope
per sitting. Do not merely raise every estimate until unbounded lessons appear “on time.” Revisit
the course envelope using actual lesson-type counts and observed ranges. No background timer or
progress-schema migration is needed for the first implementation.

## Lesson 8 prototype: one connected experiment

Keep `hot-updates-and-fillfactor` and its existing experiment behavior. The following is a
presentation proposal to validate with the learner, not replacement SQL or a claim that a revised
guide has been tested.

| Stage / phase      | Purpose and required context                                                                                                                                                                                                                                                                     | Bounded learner action                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `start`            | Define HOT and reserved page space; introduce the 100/70 pair, unchanged indexed `id`, updated `tag`, and long-transaction versus separately committed cases. Explain why commit boundaries are being compared without requiring the later MVCC module. Show the experiment map and time budget. | Make a quick mental guess about one comparison; no written response or exact percentage required. |
| `run`, phase A     | “First compare reserved space while transaction shape stays fixed.” Introduce `st_hot_tx_100` / `st_hot_tx_70` and explain the loop before its commands.                                                                                                                                         | Notice initial page counts and compare the first total/HOT/page output.                           |
| `run`, phase B     | “Now compare transaction shape using fresh matched tables.” Explain why new tables avoid inheriting phase A's history and what separate commits mean here.                                                                                                                                       | Compare the second pair's counters/pages with phase A in terminal output.                         |
| `run`, phase C     | “Now test the indexed-key boundary, then inspect physical evidence.” Define the counter delta and page fields before reading them; distinguish physical slots from SQL rows.                                                                                                                     | Look at the before/after counters and page sample; do not chase a particular flag count.          |
| `inspect`          | Refer to outputs by those same phase labels and table names. Distinguish aggregate counters from a sample of one page.                                                                                                                                                                           | Look at the named columns: what changed, and does it match your guess?                            |
| `explain → reveal` | Connect space, indexed columns and transaction boundaries to the observed evidence. Invite reflection, then supply the checked explanation and variable-result limits.                                                                                                                           | Think about the explanation while comparing it with the output; use mismatch guidance if needed.  |
| `apply`            | Connect the result to update frequency versus read density.                                                                                                                                                                                                                                      | Consider which workload benefits and what you would measure; no answer submission required.       |
| Optional `vary`    | Introduce the fresh 100/80 pair only here; reuse the existing challenge once, with readable commands and expected comparison available directly.                                                                                                                                                 | Run one bounded extra comparison if desired; return to wrap-up.                                   |

Do not add a CLI invocation for every SQL block. A single `run` view can contain clearly labelled
phases with short explanations and clear labels for output comparisons. Audit its comments and
syntax text for accidental answer disclosure; checking only for literal copies of `expectedResult`
will miss it. Explain enough to operate and reason, while leaving the observed outcome worth
predicting.

## Workstream 1 — renderer, coach-owned files only

Structural fixes belong in the renderer so all 85 guided lessons improve at once. Keep worked
outcomes out of the prediction stage; permit necessary conceptual scaffolding. Review authored
comments and explanations as well as renderer field selection for spoilers.

1. **One ordered stage flow.** Replace the unordered `STAGES` set with an ordered in-flow array
   `start → run → inspect → explain → reveal → apply`, with optional `vary`, `hint1`, `hint2` and
   `full` branches. Derive prev/next from that contract so ordering has a single source of truth.
   Update the README and older design's order together, then remove hand-written navigation from
   lesson 9. Author explicit exceptions for essential variations and place optional source notes at
   finish.
2. **A navigation footer on every stage**, including off-flow ones, propagating `--db`, using the
   short `pgcoach` invocation rather than the hardcoded absolute path:

   ```
   ── Prev: pgcoach 31 inspect · Next: pgcoach 31 reveal
      Help: pgcoach 31 hint1 · pgcoach 31 hint2
      Worked answer: pgcoach 31 reveal · Full lesson: pgcoach 31 full
   ```

   `start` has no previous within the lesson; omit the field. At `apply` offer explicit finish and
   optional variation. Keep completion commands at that finish point, rather than suggesting
   completion in every footer. Off-flow stages have a clear default return target (variation help
   returns to `vary`); because the CLI is stateless, do not imply a remembered back stack. Preserve
   database selection in completion commands too, and topic selection when offering the next
   matching lesson. A direct stage jump never completes work automatically.
3. **A context strip on `inspect`, `explain`, `vary` and `apply`:** run-in, session count, safety
   level, current question/phase and named evidence needed, plus a way to reopen the commands with
   `pgcoach N run`. Distinguish reviewing those commands from executing setup again. Add a concise
   stage-specific “enough to continue” cue; no written response or checkpoint task.
4. **A `## Terminals` block on every `start`:** how many terminals to open, what each is for, and
   the connection command — stated without disclosing the result. State the scenario and necessary
   setup facts before prediction; executable setup can remain in `run`. Count the coaching shell
   separately from SQL sessions. Session counts alone cannot determine shell/private-cluster
   routing: add authored environment details where needed.
5. **Render `prerequisites` in `start`**, closing the 01-guided-cli.md divergence.
6. **Map `challenge` to `vary` without duplication.** It is authored for 91 lessons and currently
   unreachable directly. Where they are the same task, present its commands and help in one
   extension. Review distinct challenges individually; do not add another required stage merely to
   expose a field. Keep `full` available for complete source access.
7. **Tests in `coach_test.ts`:** every stage emits a footer; prev/next are consistent with the flow
   array in both directions; `--db` survives into every emitted command; the terminals block and
   context strip never contain expected-result or systems-lens text; `full` retains the complete
   lesson while omitting note solicitation in pgcoach. Also check answer-check order,
   optional-extension return paths, timing display and explicit-only completion. Phase rendering
   must preserve command order and session routing.

**Timing implementation:** add typed course-local coaching metadata for the core time range,
reassessment point, session cap and optional-extension time. Validate positive ordered ranges and
flag core estimates exceeding one sitting. Prefer authored ranges; label any provisional fallback
clearly. The existing `estimatedMinutes` must not silently become a measured end-to-end time or be
multiplied by four. This is an interface proposal to implement in guide types and the renderer, not
permission to hand-edit generated JSON or learner progress. Keep the first release informational and
stateless.

## Workstream 2 — lesson 8 prototype, then guide coverage

8. **Write the contract before writing guides.** A course-local `guides/README.md`, referenced from
   `../../docs/AUTHORING.md`, stating for each field its purpose, core/depth scope, and these rules:
   a stage may not depend on anything a later stage introduces; a stage may not refer to "the above"
   or "the previous step" without restating what it means; a guide for a multi-session lesson must
   name which session each observation comes from; required commands cannot be hidden in hints.
   Include natural reflection prompts, simple timing guidance and clear next actions. Use the
   reviewed lesson-8 prototype and corrected lesson 9 as examples, not length quotas.
9. **Add `tools/guide_lint.ts` to the build** so this cannot silently regress. Proposed initial
   checks: missing required metadata, invalid stage references and inconsistent time ranges can fail
   the build. Prompt length, forward-reference phrases, session wording and hint ratios should
   initially be review warnings. Long runnable help may be justified; a terse instruction may be
   complete. Replication and reliability guides also need review and are not presumed correct merely
   because they are longer. Semantic dependencies require an ordered walkthrough.
10. **Validate lesson 8 first**, then corrected lesson 9 and one three-session lesson (31) before
    broad rollout. Backfill in module batches, thinnest and most session-heavy first: `06-locking`
    (8 lessons, all multi-session) → `03-mvcc` (6) → `05-isolation` (9) → `04-vacuum` (3). Roughly
    26 lessons. These roughly 26 lessons remain a priority queue; the semantic/time review applies
    to every guided lesson. Preserve experiment behavior; optimize for sufficient context within the
    time budget rather than a target character count.
11. **Repeatable verification.** A script rendering all 92 lessons across all stages against a
    copied catalog, checked for a missing footer, a leaked expected result, a dangling stage
    reference and an unnamed session. Run it as the acceptance gate for both workstreams and on
    every later guide change. Retain the intended full-view fallback for lessons 1–7 rather than
    requiring them to have newly authored stages.

### Acceptance beyond structural tests

- Walk lesson 8 from a fresh copied catalog using only rendered coaching and the experiment
  terminal. At each stage, verify every named concept, table and referenced output is introduced
  before use; required commands and relevant field explanations are present; the next action is
  clear.
- Compare the rendered experiment's command order and session assignment with the accepted source.
  If presentation changes how runnable commands are assembled, execute that exact output in an owned
  disposable lab and compare its evidence; clean it up afterwards. Static footers alone do not
  require rerunning database experiments.
- Exercise an expected-output mismatch: provide a bounded next check instead of requiring the
  learner to guess or consult an external chat. Wrong predictions are acceptable. Check that
  reflection prompts do not require typed answers, notes, evidence worksheets or new CLI commands.
- Verify a standard finish, optional-variation skip/return and early reveal. Optional work cannot
  become a hidden prerequisite, and no render action may change progress.
- Record author walkthrough time as a **lower-bound rehearsal**, then collect voluntary learner
  feedback for calibration. Do not claim the UX or estimates are validated solely because tests
  pass. Success is that the learner can finish the core within a bounded sitting with occasional
  depth help chosen for interest, rather than routinely needed to make the instructions usable.

## Recommended decisions for the next implementation

- Use early feedback: `explain → reveal → apply`, with extra variation offered explicitly.
- Surface overlapping challenge/variation content once; retain distinct essential evidence as core.
- Show the next-lesson command at finish alongside explicit completion. Never infer completion from
  navigation.
- Start with the provisional time bands and a 60-minute normal sitting cap; prototype lesson 8
  before extending this contract across the course. Nick has requested bounded time, but has not
  selected these particular numbers or committed to a weekly schedule.

These are concrete recommendations for review, replacing the earlier unresolved menu. The current
request authorizes analysis and updating this plan; it does not implement the renderer or guides.

## Limits

The original character counts are diagnostic evidence, not validated teaching minimums. A short
prompt is not automatically a bad one. The 26-lesson list is a starting queue, not a defect list —
each guide still needs an author's judgement about what context is actually missing. The pace band
rests on five intervals from the unguided lessons and will need revisiting once the learner has
completed a run of guided ones. Nothing here has been executed against the renderer; the renderer
contract above is a specification, and its acceptance requires both structural checks and the
ordered walkthrough/learner calibration described above, not this document.
