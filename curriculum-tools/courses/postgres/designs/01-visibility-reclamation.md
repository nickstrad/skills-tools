# Chunk 1C: visibility and reclamation

Owner: Terra/high `visibility`. Owned: curriculum/03-mvcc.ts, curriculum/04-vacuum.ts,
guides/03-mvcc.ts, guides/04-vacuum.ts, validation/01-visibility.md. Private engine copy at
/tmp/pg-pivot-visibility-work, no learner progress. Primary supplies isolated lab and DB. Read
AUTHORING, curriculum-author, book digest/research and review. No global settings/restart or other
agents' files. Existing semantic edits revision4. Preserve all 03-mvcc slugs.

MVCC: keep XID allocation, snapshot anatomy, simultaneous raw versions, commit/abort visibility,
horizon and freezing experiments. Narrow overclaims: XIDs allocate rather than order commits;
snapshot isn't a vector clock; user table horizons need not be described as cluster-wide; pg_xact
file is not all historical transactions forever. Preserve physical xmin during modern freezing. Keep
15's checkpoint resources; rewrite rationale without numeric lesson references.

Expand `xmin-horizon-blocks-cleanup` to absorb long-transaction bloat: matched baseline without
pinned snapshot and pinned case, same bounded separately committed churn (gexec or coordinated
statements, NOT one giant DO txn as the sole causal comparison). Measure rows/pages/dead versus
removable versions and exact blocker backend_xmin. VACUUM before/after reader release; assert same
logical row count and changed reclamation. Explicitly distinguish allocated versus reusable space.
Remove `long-transaction-bloats-everyone` from04 and transfer its studyCheckpoint to final
autovacuum lesson. Keep exact resource scopes, replace stale ordinal references.

Consolidate dead-tuples-accumulate + vacuum-reclaims-in-place + storage's free-space-map-and-reuse
under surviving `vacuum-reclaims-in-place`. Retire dead-tuples-accumulate, update prerequisites
inside owned files. Setup self-contained fresh table, churn/deletion; compare estimated n_dead_tup
to pgstattuple, VACUUM, FSM bytes and reinsert reuse. Counts should reflect actual variable pruning;
do not insist all dead data remains. No VACUUM FULL here: keep that in next existing lesson,
including lock and relation-identity evidence. No broken forward prerequisites.

Keep visibility-map experiment in04; later index duplicate will retire. Keep autovacuum trigger and
add modest bounded sustained write batches with independent commits, measuring how dead
versions/backlog change with elapsed time and observed autovacuum counts. No claim poll guarantees
worker completion in a minute; supply bounded retry/diagnostic instruction if not observed. Table
settings only; always restore, and don't change cluster launcher naptime. Avoid large benchmark or
two long workloads at once on the small host. No added generic DBA tuning advice.

Guide entries for each surviving lesson in owned modules: specific brief/predict/inspect/explain/
vary/apply and two hints, second provides runnable help for a single bounded variation. Early
lessons supply all core commands and define vocabulary; ask for reasoning not syntax recall.
Vary/hints must be safe to run after the core or explicitly rerun setup. Full syntaxBreakdown
coverage and correct safety/session metadata required.

Validate every changed lesson separately, then module sequence on private DB (extensions installed).
Read output/errors; harness 'completed' is not correctness. Validate variation code. Report retired
slugs, replaced prerequisites, checkpoint placements, real per-lesson evidence and uncertainties. Do
not commit. Primary updates cross-module prerequisites, built output, ordinal map and docs.
