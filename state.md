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
