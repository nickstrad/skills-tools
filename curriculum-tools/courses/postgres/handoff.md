# PostgreSQL pivot handoff

Updated2026-09-05. **Chunks1–3 are accepted. Chunk4 WAL is accepted through current57, including
archive failure, actual crash/replay and matched amplification. Replay-only lesson is consolidated;
94 lessons remain. Next: checkpoint anatomy, recovery cost, WAL pressure, backup/restore and PITR.**

## User-requested context reset

The user chose this verified stopping point on2026-09-05. Resume from current58 checkpoint-anatomy
in08-checkpoints.ts using designs/04-durability-recovery.md. Do not redo the accepted WAL module or
start new work before the user resumes. All reviewer agents are completed; all primary validation
commands finished. Primary implementation and handoff are pushed; remaining uncommitted storage
source/guide/knowledge and root bin/ belong to other work. Preserve those changes.

## Active goal

User authorized finishing all remaining items linearly. The goal is active; do not stop after a
single accepted subsection or mark the entire task complete until chunks4–7 and the final audit are
verified. Primary is implementing design04-durability-recovery.md. WAL records/images/commit cost,
archive failure, actual crash/replay and matched write amplification are accepted;
checkpoint/restore work comes next.

At this goal's start, guides/02-storage.ts had an existing uncommitted change and root bin/ was
untracked. Preserve both. The latest authoritative implementation commit was5fcf82f; documentation
checkpoint c9dca16 followed it. Learner progress can advance independently; use a fresh copy.

## WAL module checkpoint

Accepted and pushed: **ab6eb7a** amplification, **7f66e01** crash/replay, **be2bc76** archive. All
three accepted subsections and their handoff updates are on origin/main.

Primary accepted wal-amplification.ts and guide07. Four matched200-row ingestion trials verified
heap/commit records and exact values. Primary caught unequal catalog hint-image overhead and
separated owned-heap bytes (20800 INSERT versus11845 COPY) from decision and whole-interval costs.
Matched amount update:200 HOT/plain versus0 HOT/indexed, same final values; index build valid/ready.
Source and exact CLI guards preserve all200 values with zero tuple work versus200 unconditional HOT
updates. Report validation/04-amplification.md; final core /tmp/pg-owned-4573r03w, variation
tpq4t7lj, exact g3_ms5wq; raw /tmp/pg-amplification-{core,variation}.log and
/tmp/pg-amplification-exact-wal-size-of-operations.log. All owned clusters stopped.

Thirty tests/full repo check pass; scoped build changes only current57,94 lessons/seven stops,
first7 and capacity unchanged, copied IDs/history/progress preserved. Terra/high only reviewed final
code read-only; primary owns runtime and wording acceptance.7f66e01 is the pushed prior crash/replay
subsection; be2bc76 is archive. WAL module07 is now fully accepted.

Next: implement08-checkpoints from design04, sequentially. Current58 checkpoint-anatomy,59 redo-
point-bounds-recovery,60 max-wal-size-forces-checkpoints,61 base-backup,62 point-in-time-recovery,
63 timeline-history. Reuse owned-cluster.ts by embedding its full helper in runnable shell lessons;
never crash learner5440. Require actual matched recovery trials, actual backup/restore and missing-
WAL failure, actual PITR branches before retiring timeline-history. Then chunks5–7. Active goal is
not complete. No pending primary edits or active validation processes at this checkpoint.

## Crash/replay checkpoint

Primary accepted crash-workload.ts and guide07. Actual owned crash keeps the second client open
until server shutdown. Core has two flushed INSERTs, one COMMIT, two physical tuple headers and one
visible receipt/amount10. Source and final copied-catalog CLI variations commit the second
transaction and verify two receipts/amount30. Stopped control file, offline pg_waldump, fresh redo
log and independent row assertions all reviewed; every private server stopped. Report
validation/04-crash.md. Raw logs /tmp/pg-crash-{core,variation}.log and
/tmp/pg-crash-exact-crash-and-redo.log; final exact evidence /tmp/pg-owned-m2pjno40. Terra/high
read-only review found no concrete defects.

Duplicate wal-replay-is-deterministic retired only after combined behavior passed.94 lessons, seven
stops, first7 unchanged; all other content/prerequisite identities preserved after normalizing
renumbered references. Copied catalog preserves IDs/history/progress and marks retired slug
inactive. Thirty tests and full repo check pass. Plan, identity map, book map and knowledge updated.
Builders /tmp/pg-crash-scoped-build.py and /tmp/pg-crash-progress.py understand94 lessons and
prerequisite renumbering; use these rather than the old95-lesson progress assertions. No generated
JSON hand edits. be2bc76 is the pushed prior archive subsection. Next: wal-size-of-operations
(current57), then all six checkpoint/restore lessons (current58–63) with timeline consolidation only
after actual PITR. Chunks5–7 remain active future work; do not mark the overall goal complete.

## Archive checkpoint

Primary accepted archive-workload.ts, reusable owned-cluster.ts, module07 replacement and guide07.
Core12 segments retained13MB despite8MB target; source20 and exact CLI20 variations retained21MB.
Every selected archived hash matched after repair, ready markers disappeared, old names became
reclaimable after checkpoint; final receipts13/130 or21/210. Private servers stopped; no learner
cluster changes. Report validation/04-archive.md; raw /tmp/pg-archive-{core,variation}.log and
/tmp/pg-archive-exact-wal-files-and-recycling.log. One Terra/high read-only reviewer found no
blocking issues; primary adopted precise wording and verified all runtime outputs. Thirty tests and
full repo check pass; scoped build changes only current55, first7/capacity and copied history
preserved. 6c181bd is the pushed prior commit-cost subsection. Next: actual crash plus WAL decoding
and row assertions, then retire duplicate replay lesson only after replacement coverage passes.

## Commit-cost checkpoint

Primary accepted commit-workload.ts, its replacement in07-wal and exact guide07. Core and batch5
variation have eight trials each; final exact CLI hint adds eight more. All24 final trials preserve
400 increments and correct per-client shares with zero pgbench-reported failures (9600 increments).
A Terra/high agent only reviewed the finished driver; primary added its failed-count precision
suggestion, reran and reviewed every result. Optional owned-file pg_test_fsync probe ran too. Report
validation/04-commit-cost.md; core/raw dirs /tmp/pg-commit-cost-jfgandx7 and dmy8zbbt; exact hint
elg81_oi. Drivers /tmp/pg-commit-evidence.ts/.sh and /tmp/pg-commit-exact.ts/.sh. All30 tests/full
repo checks pass;95 lessons/seven stops, first7/capacity unchanged, current copied history
preserved.54e9ff3 is the pushed prior records/images subsection.

Concurrent storage work now modifies curriculum/02-storage.ts, guides/02-storage.ts and repository
docs/knowledge/postgres-experiment-evidence.md. Leave those edits unstaged. Published 54e9ff3's
artifact already includes concurrent TOAST revision5 while its source edit is not yet committed;
building only HEAD source would revert it. /tmp/pg-commit-scoped-build.py copies the matching
current storage source into its isolated snapshot and asserts the newly generated artifact differs
only at commit-means-fsync. It does not hand-edit JSON. Final integration must recheck the storage
owner's source/artifact reconciliation and not mistake it for our acceptance.

The archive and crash directions from this earlier checkpoint are now accepted above. Continue with
matched write amplification and checkpoint/restore/PITR work. No port5440 crashes, no learner
progress writes, no other agent authoring assignments.

## Latest implementation checkpoint

Primary accepted wal-records.ts and wal-page-images.ts, replacing the first two objects in07-wal;
guides07 and registry provide exact predictions/evidence/variations. Both cores and variations ran,
then both exact CLI-rendered hints ran. Record core shows committed/aborted physical work and
independent row outcomes; read-side hint scan emits23 FPI_FOR_HINT blocks. Image core5764/0/5768
bytes; pglz555/0/569, same100 rows/three increments, protection retained. No SQL errors. Report:
validation/04-wal-records-images.md. Design: designs/04-durability-recovery.md. Durable notes:
docs/knowledge/postgres-wal-recovery-evidence.md.95-lesson build, first7/capacity unchanged,7
reading stops, current copied progress preserved, all30 tests and full repo checks pass.

Raw drivers/logs: /tmp/pg-wal-evidence.ts/.sh,
/tmp/pg-wal-{records,page-images}-{core,variation}.log; /tmp/pg-wal-exact.ts/.sh and
/tmp/pg-wal-exact-SLUG.log. Current progress hash at verification:
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6; do not assume it stays fixed. The
next primary-owned subsection is commit-means-fsync: repeated bounded pgbench trials with fixed
generator settings, per-client rows, synchronous_commit on/off,1/4 clients, exact committed
counter/log agreement, latency percentiles and qualified cluster WAL-sync deltas. Preserve distinct
raw storage-flush measurement only as bounded optional depth on an owned file. Never overwrite
learner PG connection variables with hard-coded port5440 settings.

## Restart checkpoint

The user resumed from context-reset checkpoint a288b21 and requested sequential observability work.
Primary designed and implemented all five remaining lessons, authored specific guides and exact
runnable hints, executed every core and CLI-rendered variation, and completed integration checks.
See designs/03-observability.md and validation/03-observability.md. No agents were spawned. The
accepted capacity lesson and original first7 built objects remain identical.

Estimated remaining effort is roughly **45–50%**, not a lesson-count calculation: the hardest
recovery and distributed-protocol work is still ahead. Chunks4–7 remain pending. Do not restart
parallel authoring or re-review accepted sections without a concrete concern.

For a small-context restart: read this file, REWORK-PLAN, relevant durability sources07/08 and the
existing project review. Design the recovery chunk before editing. The only unrelated work-tree
entry at this section's start was untracked root bin/; leave it alone. SQLite and Linux remain
outside this task.

The user completed lesson8 at revision2 while the refactor proceeded. Full-path pgcoach and pgtutor
aliases were added to /root/.bashrc at their request. pgcoach reads lesson content from the tutor
catalog; generated lessons.json updates need an explicit pgtutor init to refresh an existing
catalog. Author checks used a copied catalog and did not refresh the learner's database. Completion
remains explicit (pgtutor done NUMBER). Do not assume progress stays frozen at seven completions on
future turns: compare current before/after snapshots and preserve legitimate learner progress.

Final validation repeated the copied refresh after the learner's new completion. It preserved every
current progress/attempt row and original lesson ID. Current learner database hash at that check:
167c9c50091f4b3bb6988b71652e382dd0b02d4f7536d6509f7ad088d2695045. The live catalog still had96
original active lessons and lesson8 revision2; author tools did not refresh it. The learner was told
to run pgtutor init to load revisions; changed lessons can then be offered again while earlier
completion records and notes remain. Implementation5fcf82f and handoff checkpoint2eed93e are pushed.

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
- Observability now follows checkpoints and precedes replication; backward prerequisites pass. Its
  five remaining lessons are now accepted as well; see the current observability acceptance below.
- Primary added migration-workload.ts after concurrent index creation, plus its exact retention
  guide in guides12.95-lesson build, current map refreshed, seven reading stops, first7 unchanged.
  Core direct run: 55P03/22P02/23514 were the only errors; B saw999 committed backfill rows while1
  remained locked. Final1001 rows/sum2002/consistent=true, both schema flags true. Exact retention
  variation completed with800 rows starting201 after reconciling the skipped eligible row. Logs:
  /tmp/pg-migration-core-20260905.log and /tmp/pg-retention-hint-20260905.log; driver:
  /tmp/pg-retention-hint.ts. Acceptance in validation/03-migration.md.
- Primary accepted all remaining observability work: wait-observation.ts, io-observation.ts,
  deadline-observation.ts, index-usage-observation.ts, log-observation.ts, module13 and guides13.
  Current ordinals65/66/68/69/70 are revision4; capacity67 is unchanged. Every core and exact
  CLI-rendered hint ran with correct outcomes. Full repo check passes. Report:
  validation/03-observability.md. Thirty tests pass;95 lessons/seven reading stops; first7 and
  capacity identical; copied IDs/history/progress preserved. Durable findings:
  docs/knowledge/postgres-observability-evidence.md.
- Primary owns remaining chunks4–7. Next is durability/recovery; no new authoring assignments.
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

1. Design and implement chunk4, durability/recovery (original39–51; current52–64) from REWORK-PLAN.
   Strengthen measured WAL costs, crash/recovery evidence within the same exercise, actual restore
   with domain assertions, missing-history failure and bounded checkpoint work. Restart/crash runs
   are serial in owned private clusters. Never touch learner port5440.
2. Continue chunks5–7: replication/change processing, durable delivery/fencing/2PC, then incidents
   and final integration. None is accepted. Snapshot/tail handoff, read-your-writes readiness,
   receiver commit/lost acknowledgement and enforced fencing remain the hardest work.
3. Keep real-tool evidence, exact-hint runs, current progress-copy checks, durable knowledge and
   commit/push checkpoints. Update final PLAN, mappings and wrapper/book references at final
   integration; delete handoff only after the entire authorized refactor is finished.

## Latest section: accepted observability

Design and evidence: designs/03-observability.md and validation/03-observability.md. Wait core has
10 registered blocker edges; variation holder sleeps while still blocking the writer; final
balance1000. I/O core71MB heap,18,182 bulkread hits and zero bulkread reads in the initial run;
small variation uses normal context. Answers/epochs pass. Deadline verifies actual disappearance,
lock cleanup, rollback and new connection; statement timeout keeps its PID, with row99 absent after
explicit rollback but present with autocommit. Index has2seq/20000rows/2PK scans; zero-use unique
index rejects23505. Optional-index variation preserves100rows/sum495700 and rolls back its drop.
Both log runs record UPDATE completion, but independent reads reflect COMMIT versus ROLLBACK.

Scratch drivers: /tmp/pg-observe-validate.ts, /tmp/pg-observe-run.sh, /tmp/pg-observe-exact.ts and
/tmp/pg-observe-exact.sh. Exact rendered hints and logs use /tmp/pg-observe-rendered-SLUG.md and
/tmp/pg-observe-exact-SLUG.log. Individual logs use /tmp/pg-observe-UNIT-{core,variation}.log, where
UNIT is the helper filename without .ts. Copied progress verifier /tmp/pg-observe-progress.py
records its copy path in /tmp/pg-observe-progress-path. Repo check: /tmp/pg-observe-repo-check.log.

Important findings: NULL passed to psql gset unsets its variable; coalesce nullable reset timestamps
before saving them. Published statistics and cleared observer caches are separate boundaries. The
SQL harness neither classifies expected errors nor executes shell code. The deadline shell ran
separately. Log reader guards reject invalid intervals rather than reconstructing rotated history.
Preserve these limits in future edits.

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

- Observability acceptance2026-09-05 completes chunk3. All five remaining cores and exact rendered
  hints ran against the private lab; full repository checks and30 integration tests pass. Next
  implementation is chunk4 durability/recovery.

- `5fcf82f` pushed: accepted observability helpers/guides, full repo checks, real core/exact-hint
  evidence, updated knowledge notes, plan and handoff. This follow-up checkpoint records the new
  learner completion and repeat copied-progress preservation check; it changes no lesson code.
