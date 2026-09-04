# PostgreSQL pivot handoff

Updated 2026-09-04. **Sequential primary implementation adopted; chunk2 pushed; chunk3 drafts await
primary review.**

## User authorization and intended result

The learner completed original lessons 1–7. They approved the systems-engineering review and the
guided read/predict/run/inspect/explain/vary/apply loop, with supplied commands and gradually
reduced scaffolding. They requested plans, implementation, final code/wording review, and
commit/push for each chunk. Their latest instruction, “stop and pivot to that approach,” supersedes
the earlier Terra implementation assignments: primary now implements one section at a time. Agents
are limited to narrowly scoped verification of supplied commands or finished changes. All three
agents have finished their prior tasks; no parallel authoring remains active.

Read `REWORK-PLAN.md`, then the active contracts in `designs/`, and the prior review at
`../../../docs/knowledge/postgres-project1-review.md` (repository `docs/knowledge/`). Read repo
AGENTS, docs/README, AUTHORING and curriculum-author skill. Do not reinterpret this as a request for
another review or stop after planning: implementation and validation are authorized.

## Current state

- Chunk1 is pushed as948f2d1. Protocol helpers were pushed as1d3c378.
- Chunk2 is committed and pushed as d0ce060. Source05/06, helper checkpoint, new request-protocol.ts
  and optimistic-protocol.ts, removal of old optimistic object from14, guides05/06+registry,
  generated94-lesson artifact and identity map are the accepted change. See
  validation/02-integration.md for primary evidence and exact limitations. Original first7 objects
  and learner progress hash remain unchanged; copied refresh preserves all old IDs/history.
- Whole concurrency sequence selected17 lessons:16 actual psql experiments plus shell retry skipped
  by that harness. Retry was separately executed.30 engine/coaching tests pass. Unknown-outcome,
  both deadlock victim paths, optimistic rollback, bounded DDL, timeout and advisory session-loss
  variations were exercised by primary. Exact rendered request hint ran too.
- Unknown response is explicitly an output-withholding fixture, not a network-disconnect test.
  Receipts/payload/result and debit commit together. Real independent external effect/receiver
  commits and replication-history loss are still later protocol work.
- Planner/index private drafts follow designs/03-workload-performance.md. Primary now owns them.
  Preserve the drafts and their reports; do not replace root source until reviewed and corrected.
- /tmp/pg-pivot-planner-work contains curriculum/11-planner.ts, guides/11-planner.ts and
  validation/03-planner.md under courses/postgres/. All seven cores and their full sequence passed.
  Storage then executed all seven exact hint2 commands, fixing psql meta-command line breaks and
  adding explicit resets. Scripts/logs: /tmp/pg-pivot-planner-hints/ and
  /tmp/pg-pivot-planner-hint-*.log. Statistics hint used the core's pl_tenant fixture in addition to
  setup; primary must check that the learner-facing instructions make this dependency clear.
- /tmp/pg-pivot-visibility-work contains the corresponding12-indexes source, guide and report. Six
  cores passed. Hint validation found and fixed nonexistent ix_jobs to ix_orders. Immediate update
  counters were0/0, so HOT evidence is still unproven; primary must repair the observation boundary
  and execute it. The separate two-session RR pagination hint was NOT executed. Check every other
  hint against its report too; do not infer acceptance from a completed agent task. Retires
  index-only-scan-needs-visibility-map; update current mapping at integration.
- Primary owns all remaining source, coaching, capacity/migration and failure/protocol work. Next
  section is planner review/integration, then indexes, then capacity/migration/observability.
  Optional agent work is fixed-scope verification only; no new lesson authoring assignments.
- Private PostgreSQL16.15: /tmp/postgres-pivot-20260904/primary, socket in sibling/socket, port5540,
  rolepostgres. DBs pivot_primary(primary),pivot_storage(planner),pivot_visibility(index). Do not
  touch learner port5440. Coordinate global changes/restarts and timed benchmarks.
- Original progress SHA256: c7866ba1b78cb7b2aa6c1a2951149cd14c278130f92333c1e5b8dffd063f128f.
- Baseline object hashes: validation/completed-baseline.json. Original artifact:
  /tmp/postgres-pivot-original-lessons.json; original curriculum also survives in git history.
- Primary scratch helpers: /tmp/refresh-pg-map.py and /tmp/check-pg-progress.py; request and
  variation drivers /tmp/validate-pg-request.ts, /tmp/validate-pg-concurrency-variations.ts,
  /tmp/validate-pg-exact-hint.ts. Raw log names are in validation/02-integration.md.
- Unrelated Linux, article notes, repository-roadmap and Docker edits belong to other workstreams.
  Never blanket stage or reset them. The user explicitly excluded SQLite work as well.

## Next actions

1. Primary reviews the complete planner source and guides, checks the exact-hint report and fixture
   prerequisites, reruns representative experiments, then integrates that section. Chunk2 is pushed.
2. Primary reviews indexes next, repairs counter observation, executes RR pagination and resolves
   other evidence gaps. Then implement capacity and bounded migration synthesis sequentially.
   Arrange final performance ordering before replication while respecting true WAL/recovery
   prerequisites; do not create forward references.
3. Design and deliver remaining chunks4–7 (durability/recovery, replication/change processing,
   durable delivery/fencing/2PC, incidents/capstone) from REWORK-PLAN. None is complete.
4. Keep root final review, actual-tool evidence, stable identities/revisions and copied progress
   checks per chunk. Record durable findings, commit/push handoff updates, and delete this file only
   after every authorized chunk is complete. Do not stop after the concurrency checkpoint.

## Durable constraints

Preserve original lessons 1–7 exactly. Keep course revision 2, explicit revision 4 for material
edits (some existing checkpoint lessons already use3). Keep surviving slugs, map retirements and
ordinals. Do not edit learner progress. No blanket git add, reset, stash, force-push, or changes to
other agents' files. Do not crash the learner's port-5440 lab. Use an owned private cluster and
separate databases; coordinate global operations serially.

## Commits and evidence

- `4406657` pushed: initial plan, review, handoff and completed-seven baseline.
- `6d2fe8a` pushed: exact chunk1 contracts, guide interfaces and lab/agent ownership.
- `90e82d4` pushed: user-requested repo-wide project scale and progressive ownership alignment.
  Updated learning_path, AUTHORING, curriculum-author skill and wrapper template; recorded reusable
  findings in docs/knowledge/progressive-course-design.md and index. Skill validator and scoped
  format/diff checks passed. Installed author skill is a symlink to the edited repository source.
- `17df58c` pushed: previous handoff checkpoint. No learner progress mutation.
- `d4dfd08` pushed: concurrent-client design and implementation checkpoint.
- Foundation acceptance is in validation/01-integration.md; later protocol prototypes are not final
  course acceptance. Overall refactor remains incomplete: chunks3–7 require implementation,
  integration and validation. Repo-wide learning guidance is already pushed.

- `948f2d1` pushed: accepted guided foundation,93-lesson build, stable identity map, final runtime
  evidence, copied-progress preservation and durable experiment findings.

- `d0ce060` pushed: accepted concurrent clients, request-outcome recovery, 94-lesson build and
  chunk3 design. Latest user-facing estimate is roughly 30% complete / 70% remaining by effort, not
  a lesson count. Hard recovery, replication, durable protocols and final integration remain.

- `644138f` pushed: concurrency delivery and performance-review checkpoint.
- Latest workflow change: sequential primary implementation, bounded agent verification only.
  Updated REWORK-PLAN, design03 and durable progressive-course-design notes with this handoff.
