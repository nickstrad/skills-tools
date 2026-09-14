# DuckDB setup simplification

2026-09-14: User requested completion of the setup helpers, all five lesson updates, and
refresh of the displayed catalog. Primary agent owns DuckDB lab, lessons, validation,
README and relevant knowledge/profile documentation. Initial working tree clean.

Preserve learning tasks, SQL results, lesson identities and all recorded progress. Move
starter creation and invocation plumbing into Bash glue; retain SQL observations in lessons.
Current resources: 142 GiB free, 7.2 GiB available RAM, no PostgreSQL processes. Persistent
PostgreSQL services intentionally remain stopped. Owned scratch and pre-refresh backup:
`/tmp/duckdb-setup-refresh`. Budget under 500 MiB peak; no retained fixtures.

Remaining: implement; run exact starter/answer/wrong-choice validation and lifecycle checks;
verify refresh on copy then refresh live catalog and compare progress; update knowledge;
remove owned scratch. Delete this log only after completion and knowledge-store reflection.

User steering: record simple setup → learner work → easy cleanup as a common rule across all
courses. Updated AGENTS, AUTHORING, both installed repository skills, learner profile and the
canonical learner-work knowledge entry. Existing non-DuckDB courses are guidance-only scope.
DuckDB now prepares starters and initial observations for lessons 1–5 with one sourced command;
duck_run supplies connection/staging plumbing. Lesson tasks/results/identities are unchanged;
retain revisions for this mechanical refactor to avoid reopening completed lessons.
Structural checks and Bash syntax pass. Full real-tool validation passed all 15 independent
variants and both shared sequences. Lifecycle checks passed; no fixture processes/directories
remain. Copy and live catalog refreshes preserve exact progress/attempt/roadmap dumps and all
five rendered lessons use the helpers (DuckDB 1 done, 4 todo, no stale lessons).

Knowledge reflection completed: updated and reread data/duckdb-course-tools.md and
data/pgcoach-course-authoring.md; both indexed with local host embedding access. Installed
Codex/Claude skills resolve to the edited repository sources. Durable acceptance is in
curriculum-tools/courses/duckdb/validation/setup-refresh.md. Final source manifest refreshed;
native-output trailing whitespace normalized. Remaining: commit changes, retire owned scratch
and this event log. Live tutor.sqlite catalog is intentionally modified but excluded from commit.
