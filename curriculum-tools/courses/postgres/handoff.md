# PostgreSQL pivot handoff

Updated 2026-09-05. **Paused at user request for a fresh context. Planner, indexes, capacity and
bounded migration are accepted and pushed. Resume with the five remaining observability lessons.**

## Restart checkpoint

The user requested a clean stopping point and a committed/pushed handoff before clearing context. No
observability edits have started beyond the accepted capacity lesson. There is no partially
implemented section to recover. Latest implementation commit is `673f332`, confirmed on origin/main.
The only unrelated working-tree entry at this checkpoint was untracked root `bin/`; leave it alone.

Estimated remaining effort is roughly **50%**, not a lesson-count calculation. Chunks1–2 are
accepted; chunk3 has four accepted sections but five observability lessons remain. Chunks4–7 still
need implementation and validation, including the hardest recovery and distributed-protocol work.
Continue sequential primary implementation; do not restart parallel authoring.

For a small-context restart, read this file, REWORK-PLAN and design03, then only the active
observability source/guide and relevant durable findings. Accepted section reports are indexed
below; do not re-review obsolete agent worktrees or repeat completed experiments without a concrete
reason.

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
- Primary accepted planner source11, authored specific guides11, registered them and built94
  lessons. Every core and exact hint executed. See validation/03-planner.md, primary
  acceptance2026-09-05. Root source is now authoritative; the old /tmp/pg-pivot-planner-work is
  historical only. Logs: /tmp/pg-planner-primary-20260905.log and
  /tmp/pg-planner-exact-20260905/*.log. Core fixes: restored settings, explicit hash multiplier,
  tenant fixture in setup, accurate model/ buffer/rollback claims, top-level scoped aggregate deltas
  and retention check. Hint fixes include fixed inner-lookup shape for Memoize comparison (5,000
  cached vs100,000 uncached probes). All30 tests pass, first7 objects unchanged, copied
  progress/IDs/history preserved,7 reading stops.
- Primary accepted index source12, six authored guides, registry and module reorder. Root source is
  authoritative; old /tmp/pg-pivot-visibility-work is historical, not a pending assignment. See
  validation/03-indexes.md primary acceptance2026-09-05. All six cores and exact hints ran; exactly
  two deliberate uniqueness errors in each set, no other errors/timeouts. Cached progress snapshots
  required pg_stat_clear_snapshot inside the CIC polling block; final sequence rerun passed. Matched
  HOT trial: amount updates100HOT/plain vs0HOT/covered; unindexed-note hint100HOT/both. RR
  pagination hint now executed:6/6 inside RR, fresh OFFSET5 after commit, fixture row removed. Logs:
  /tmp/pg-index-primary-20260905.log, /tmp/pg-index-cic-final-20260905.log and
  /tmp/pg-index-hints-20260905.log. Driver: /tmp/pg-index-hints.ts.
- Planner and indexes now follow locking, before WAL/replication.94 lessons,7 reading stops, four
  retired slugs; current lesson-map regenerated. Original first7 built objects and real progress
  unchanged; copied refresh preserves IDs/history/progress.30 existing integration tests pass.
- Primary implemented capacity-workload.ts, replacing the old connection-saturation object in13.
  Authored guides13's capacity entry and registered it. Core5ms and exact1ms hint both executed
  eight 400-transaction trials with zero failures and exact committed-counter/log agreement. Fixed
  driver threads at1 after finding the initial min(2,clients) changed another variable.
  Validation/03-capacity.md records measurements and limits. Raw dirs /tmp/pg-capacity-ebeu3oeq and
  /tmp/pg-capacity-9bhs5l9e. Extracted scripts/logs /tmp/pg-capacity-core-20260905.* and
  /tmp/pg-capacity-variation-20260905.*.
- Observability now follows checkpoints and precedes replication; backward prerequisites pass. Only
  its capacity lesson is rewritten so far. The other five lessons in module13 still need primary
  review.
- Primary added migration-workload.ts after concurrent index creation, plus its exact retention
  guide in guides12.95-lesson build, current map refreshed, seven reading stops, first7 unchanged.
  Core direct run: 55P03/22P02/23514 were the only errors; B saw999 committed backfill rows while1
  remained locked. Final1001 rows/sum2002/consistent=true, both schema flags true. Exact retention
  variation completed with800 rows starting201 after reconciling the skipped eligible row. Logs:
  /tmp/pg-migration-core-20260905.log and /tmp/pg-retention-hint-20260905.log; driver:
  /tmp/pg-retention-hint.ts. Acceptance in validation/03-migration.md.
- Primary owns all remaining source/coaching/failure work. Next is remaining observability to finish
  chunk3. Agents remain verification-only; no new authoring assignments.
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

1. Resume directly with remaining observability source13 and authored guides13: wait-state/sample
   interpretation, cluster-wide pg_stat_io deltas and PostgreSQL/OS I/O distinction,
   idle-transaction deadlines and cleanup, index usage versus correctness, bounded log correlation.
   The new capacity helper and its validated guide are accepted; preserve them. Then accept chunk3
   after section integration.
2. Design and deliver remaining chunks4–7 (durability/recovery, replication/change processing,
   durable delivery/fencing/2PC, incidents/capstone) from REWORK-PLAN. None is complete.
3. Keep root final review, actual-tool evidence, stable identities/revisions and copied progress
   checks per chunk. Record durable findings, commit/push handoff updates, and delete this file only
   after every authorized chunk is complete. Do not stop after the concurrency checkpoint.

## Next section: review leads, not implemented decisions

Read `curriculum/13-observability.ts` and `guides/13-observability.ts`. Keep the accepted CAPACITY
helper/guide. Remaining slugs are wait-events-tell-you-where-time-goes, pg-stat-io-by-backend-type,
idle-in-transaction-kills-you, table-and-index-usage-counters and read-the-server-log. Consult the
original project review and design02 before deciding whether to merge anything: basic wait
inspection already appears in concurrency lessons. Keep each remaining experiment distinct and
useful; no retirement decision has been made for these five.

- Waits: old prose wrongly treats NULL wait events as proof of CPU execution and sample shares as a
  latency breakdown. Scope observation to owned clients; use bounded readiness checks and read
  state, wait, blocker and transaction age together. Refresh cached statistics during polling.
- I/O: distinguish PostgreSQL reads from device I/O; pg_stat_io is cluster-wide and has
  nonapplicable NULL fields. Use deltas without global resets, explicit publication/snapshot
  boundaries, restore changed settings, and do not claim CHECKPOINT evicts shared buffers.
- Idle transactions: exercise an owned client deadline and verify rollback/reconnection. Distinguish
  statement cancellation from session termination; avoid an unverified sleep-only timeout demo.
- Index counters: zero scans alone cannot justify dropping a correctness constraint. Use bounded,
  scoped workloads and check statistic publication plus constraint metadata.
- Logs: capture file/offset before an owned event, read a bounded appended range, correlate PID or
  application identity, account for collector lag/rotation and classify expected errors. Do not read
  the entire file merely to take its tail or imply server logging proves a business outcome.

Author an explicit bounded design, then source and specific coaching (predict/inspect/explain/vary/
apply with an exact runnable hint). Execute both supplied core and exact variation against the
private PostgreSQL lab. SQL harness skips shell lessons and does not establish that every SQL error
is expected: inspect logs. Run dependent experiments serially even if a tool returns a session ID.
Build from curriculum-tools with /root/.deno/bin/deno, refresh lesson-map via the scratch helper if
ordering/identities change, verify first7 and copied progress, record acceptance/durable findings,
then commit/push explicit paths and this handoff. Delete handoff only after the entire refactor.

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
  chunk3 design. The earlier estimate at that checkpoint was roughly30% complete; the current
  estimate is recorded at the top of this handoff. Hard recovery, replication, durable protocols and
  final integration remain.

- `644138f` pushed: concurrency delivery and performance-review checkpoint.
- Latest workflow change: sequential primary implementation, bounded agent verification only.
  Updated REWORK-PLAN, design03 and durable progressive-course-design notes with this handoff.

- `3bf2541` pushed: sequential primary implementation policy and superseding design/handoff notes.
- Planner acceptance2026-09-05 is a section of chunk3; chunk3 remains incomplete. Continue directly
  to index primary review after the scoped planner commit/push.

- `ba91880` pushed: primary planner acceptance, seven specific guides and durable measurement notes.
- Index acceptance2026-09-05 follows sequentially. Next primary-owned hard work is bounded capacity
  measurement; do not restart parallel lesson authoring or re-review obsolete private drafts.

- `05070cc` pushed: primary index acceptance, six exact guides, matched HOT trials, RR pagination
  and planner/index ordering before WAL/replication.
- Capacity acceptance2026-09-05: zero errors in6,400 benchmark transactions across core/variation,
  scoped evidence retained, owned schemas cleaned,94-lesson build and copied progress checks pass.

- `e811115` pushed: bounded capacity driver, verified core/exact variation, scoped evidence and
  observability ordering before replication.95 lessons now include bounded migration as well.
- `673f332` pushed: bounded migration and exact retention variation accepted,95-lesson build, 30
  tests passing, first7 unchanged and copied progress/IDs/history preserved. Continue with the five
  remaining observability lessons after the requested context reset.
