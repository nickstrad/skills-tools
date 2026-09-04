# Chunk 1A: staged PostgreSQL coaching

Owner: Terra/high agent `guided_cli`. Work independently while primary builds validation lab. Read
REWORK-PLAN, handoff, AUTHORING and curriculum-author skill. Exact owned files: `tools/coach.ts`,
`tools/coach_test.ts`, `bin/pgcoach`, `skill/postgres-tutor/SKILL.md` within this course. Do not
edit shared src/tests, guide files, course metadata, generated lessons or progress.

Implement executable `courses/postgres/bin/pgcoach [NUMBER] [STAGE] [--db PATH] [--topic TEXT]`.
Resolve Deno using repository launcher conventions. Supported stages: start (default), run, inspect,
explain, vary, apply, hint1, hint2, reveal, full. Reject unknown flags/stages/ambiguous arguments.
Lesson selection invokes existing exported `run` from `../../../src/main.ts` with a capturing IO:
postgres next --json or show NUMBER --json, forwarding db/topic. No own database queries and no
automatic init/done/skip or lesson execution. CLI failures propagate clearly. No matching/complete
topic states must remain useful. Display ordinal and slug every stage.

Join selected lesson with GUIDES from ../guides/mod.ts; type in ../guides/types.ts. For missing
guide return an explicit full-view fallback/instruction; do not invent generic per-lesson prompts.
The first seven legacy lessons are intentionally not guided in this change.

- start: title/identity, sessions/runIn/minVersion/safety, prerequisite IDs, full caution if any,
  Guide.brief, Guide.predict and concise next command. No expectedResult, systemsLens, full
  syntaxBreakdown or run code. Setup is withheld too; prediction precedes code comments.
- run: exact setup/code in appropriate fences, full syntaxBreakdown and safety/session guidance.
  Remind learner to stop after running and bring evidence. No expectedResult or systemsLens.
- inspect/explain/vary/apply: exact corresponding authored prompt; no expectedResult. Explain asks
  learner for causal reasoning before reveal. Vary offers hints and supplied commands on request.
- hint1/hint2: corresponding authored hint; hints may contain runnable variation code.
- reveal: full expectedResult and systemsLens plus full studyCheckpoint (core and optional depth)
  and optional reading/readingNotes; never silently omit a reading stop. Tell learner to complete
  the core stop before next lesson. No automatic completion.
- full: invoke existing pretty NUMBER --plain with same db. Preserve exact legacy full renderer.

Route wrapper skill's next/specific lesson requests through pgcoach start. Subsequent run/inspect/
explain/vary/apply/reveal use same known ordinal. Ask prediction then reveal runnable code; provide
help without demanding syntax recall. User-requested full lesson uses pretty, exactly as before.
Resolve topics via existing CLI. Keep progress invariants and explicit completion routes. Agent must
not run lesson commands on learner behalf without request. Skill must disclose whole safety
instructions before execution and study stops at end. Preserve explanations once the run phase
begins; don't truncate complex commands to create a guessing game.

Tests: pure rendering prevents expected-result/solution leaks in start/inspect, run retains exact
code and syntax, reveal contains checkpoint core/optional, full preserves renderer; CLI invalid
input/complete/topic-miss; temp progress init, mark first seven in FIXTURE, next selects lesson8,
run every stage and verify completion/notes unchanged. Never touch real progress. Test via private
copy if root generated artifact is in transition. Return exact commands/results, changed files, and
uncertainties. Do not commit. Primary owns guide registry and final integration.
