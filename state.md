# DuckDB lessons 6–10 batch

Objective: implement the next five lessons of approved outline revision 8, requested 2026-09-16.
Primary agent owns all batch files; no delegation requested. Preserve the pre-existing modified
`curriculum-tools/tutor.sqlite`, all learner data, legacy backups, and unrelated work.
Delete this log only after implementation, validation, cleanup, and knowledge-store reflection
(including warranted updates) are complete. Follow docs/lesson-batch-workflow.md.

## Design and boundaries

All lessons are independent local-file labs, target 10–12 minutes, with 3–5 minutes learner work.
Both setup choices use the existing marked lifecycle; no servers or new extensions needed.

| Lesson | Learner decision / mechanism | Decisive evidence |
| --- | --- | --- |
| 6 organize-sql-stages | Interactive CSV subset; view versus stored table after update and reopen | Selected IDs and changed view total versus frozen table total survive restart |
| 7 inspect-change-reset-settings | Interactive null default change and explicit ordering | Same SQL changes order; explicit NULLS LAST survives either default; reset/fresh values |
| 8 clean-input-types | Preserve identifier text; decimal conversion and rejection policy | Leading zeros retained; accepted/rejected partition and exact amount total |
| 9 flatten-json-records | Unnest event lists retaining parent run identity | Three event rows from three runs, including an empty run, with correct parent IDs |
| 10 combine-file-batches | Union by name, retain filename, preserve unknown missing field | Four rows, two missing values, correct per-source identity and totals |

Owned files: new lessons 06–10, bounded lab helpers/fixtures, validation driver and report,
course README, canonical availability/indexes, repository knowledge, this log.
No changes to existing lesson identities, learner progress, future lesson scope or count.

## Baseline / resource budget

2026-09-16: root 139 GiB free, 7.1 GiB memory available, 2% inodes used; /tmp 511 MiB,
course cache 148 MiB. Sandbox process view is isolated; host check still needed. Persistent
PostgreSQL intentionally stopped per current knowledge/profile; preserve data and stopped state.
New trial peak budget <100 MiB including database files, copies and logs; run sequentially and
remove fixtures at each trial. Keep only compact validation text and manifests in repository.
Learner DB SHA256: 985549c8401fd6510465a1212cdec197afeb0d80ca589e0b0a1eb0ea80ce7885.
Authoring uses explicit temporary absolute --db paths, with progress-refresh verification on copy.

## Events

- 2026-09-16: Read repository index, resource guidance, authoring/workflow, learner profile,
  article index, route revision 8 and DuckDB findings. Reviewed current official CLI/settings/
  CSV/JSON/schema documentation; pinned runtime remains authority for experiment outcomes.
- 2026-09-16: Knowledge search 44 found existing data/duckdb-course-tools.md; read it.

## Remaining

Implement helpers and five lessons; review rendered teaching; real script/manual starter/answer/
wrong-choice and restart trials; generic harness and copied progress flow; commit coherent chunks;
update availability and durable findings; knowledge reflection; final resource/readiness/progress
checks and cleanup; remove log and commit completion.

## Implementation checkpoint

- 2026-09-16: Host process survey confirmed no postgres processes; persistent clusters remain
  stopped as intended. No existing resource is owned by this batch or eligible for removal.
- 2026-09-16: Authored lessons 6–10 and extended marked setup/inspection/cleanup lifecycle.
  Lessons 6–7 use labelled live CLI transcripts, not learner scripts; 8–10 supply editable SQL.
  All five have script/manual setup, bounded tasks, wrong-choice evidence, and cleanup.
- `bin/tutor duckdb check`: 10 lessons OK; helper Bash syntax check passed.
  Real evidence remains pending; expected values are not acceptance until checked.
- Validation design: translate only the two interactive transcript boundaries into input-fed
  CLI sessions for automated checks, preserving the SQL and reconnects; also exercise a real PTY.
  Shared shell validation cannot directly execute a mixed Bash/DuckDB transcript. Keep this
  adapter in the author driver/private catalog, not in learner-facing Run commands.

- 2026-09-16: 30 independent new-lesson trials, 10 same-fixture answer reruns, worked shared
  sequence 6–10 and exact shared starters 8–10 passed. First-batch regression also passed all
  30 independent paths plus both shared sequences. Go course/route/render/CLI tests passed.
- Progress verify on a byte copy preserved all 42 progress rows, 44 attempts, and existing
  identities; real learner hash unchanged. Reviewed all five complete rendered lessons on a
  temporary catalog. Simplified syntax examples to keep learner constructions unfinished.
- Extra lesson-10 probe caught an inaccurate failure description: without union_by_name,
  SELECT * succeeds but omits the new region column; selecting region then raises Binder Error.
  Corrected lesson text and added a specific extra assertion. The failed probe's trap removed
  its fixture. This is a reusable finding for the knowledge reflection.
- Live PTY lesson 6 passed table/view update and process reopen. PTY lesson 7 change/reset
  passed; fresh restart and cleanup remain. This virtual terminal lacks color-query responses;
  initial calls wait about 5s, then work. Validation-only -dark-mode avoids that presentation
  wait without changing SQL or wrapper defaults.
- Extra identifier probe corrected a second assumption: pinned CSV inference already retains
  leading-zero IDs as VARCHAR. Lesson 8 now teaches preserving that representation while choosing
  decimal amounts; an explicit BIGINT identifier conversion demonstrates the harmful choice.
  The new assertion checks actual 001/1 etc. evidence. All trial fixtures were cleaned.
- PTY lesson 7 fresh process restored NULLS_LAST and retained all three rows; explicit cleanup
  completed for both PTY labs, and the owned interactive shell exited.
- Final new-batch driver passed after correcting both source claims: 30 independent trials,
  10 answer reruns, extra schema/identifier probes and both shared sequences. Source manifests
  and compact outcome logs retained in the course validation directory. No live lab retained.
- Updated canonical availability and documentation to 1–10 authored. Complete rendered lessons
  reviewed on temporary catalog; done/skip worked. Initially tried unsupported `7 undone`;
  corrected to documented `undone 7` for the final progress-flow check.
- Implementation and real validation are complete. Remaining: final CLI flow result inspection,
  manifest audit, knowledge reflection/update, final cleanup/readiness and progress hash checks;
  then remove this log and commit completion.
