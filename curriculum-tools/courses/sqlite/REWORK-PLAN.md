# SQLite course implementation plan — 2026-09-04

## Objective

Make SQLite a practical tool for a systems/distributed-systems engineer after PostgreSQL. Apply
`docs/learning_path.md`: deep once, contrast thereafter. Keep the physical storage, journaling,
locking, WAL and recovery foundation; teach the responsibilities that move into an application when
its database is embedded. Every lesson causes a phenomenon, observes it, and earns a design
decision.

Target: **54 lessons in ten modules**, through consolidation and focused additions. This records the
original implementation analysis; PLAN.md now describes the integrated course and its contracts.
Module filenames stay stable; new `10-toolkit.ts` is registered BEFORE `09-capstone.ts`.

## Contracts for implementation

- Read AUTHORING.md, the curriculum-author skill, repository AGENTS.md and relevant knowledge files.
- Full syntaxBreakdown for every lesson: In plain terms, What you are learning, Piece by piece.
  Explain unfamiliar commands/flags, output columns, coordination and failure. Reference PostgreSQL
  briefly; no live PostgreSQL dependency and no repeated general transaction tutorial.
- Materially changed existing lessons use revision 3; new lessons use revision 1. Pure explanation
  expansion preserves the existing revision and working experiment. Preserve surviving slugs; retire
  only the four listed below. Never edit generated lessons or real learner progress directly.
- Retain the six reading checkpoints on their surviving slugs and refresh ordinal references.
- Unique learner-owned scratch directories for shell experiments; no clearing the main lab database
  for convenience. Print evidence paths. Bound readiness with markers/deadlines, not unverified
  sleeps. Trap and reap owned subprocesses. Preserve original crash/corruption evidence before
  recovery.
- Explicit journal/page assumptions and per-connection settings. Identify expected errors
  individually; unrelated SQL/process errors must not be counted as busy or ignored.
- CLI/shell interfaces only. No language bindings, services, Docker, network filesystems or custom
  VFS. FTS5 can be enabled in the existing bootstrap/runtime. Primary owns that capability change.
- Integration exception established by inspection: the existing engine seeds identity by ordinal,
  which would misattribute progress after this reordering. Primary will fix seed to preserve IDs by
  slug and add reorder/removal/reintroduction tests; no progress schema change or real progress
  write.
- WAL is local recovery/concurrency machinery. Process termination is not power loss. Separate files
  model independent commits but still share a physical host failure domain.
- Shell experiments are validated explicitly; the existing database harness skips shell lessons and
  only detects timeouts for tool lessons. Validate actual evidence, not its completion count.

## Lesson-level specification

Each entry fixes the slug, action, observation, tools and systems purpose. Adjust bounded dataset
sizes when real-tool validation requires it, recording the evidence. Do not silently change scope.

### 01 — Connection ownership and application file contracts (7)

1. `build-sqlite-lab`: create owned lab/baseline with sqlite3, .databases, .tables, stat; rerun
   yields one baseline row. Explain ownership and reset scope.
2. `inspect-build-capabilities`: create/query introspection evidence; version, compile_options,
   module_list and real dbstat/dbpage/bytecode/FTS5 probes. Capability is runtime evidence.
3. `share-one-file-between-sessions`: two processes commit/rollback, compare visible rows. Minimal
   no-server visibility orientation.
4. `connection-settings-are-local` (new): set WAL, synchronous, foreign_keys, busy_timeout in A;
   reopen B; show persistent WAL versus connection policies, FK accepted/rejected, then initialize B
   correctly.
5. `decode-database-header`: change state, correlate committed header/page size/count and stat/xxd
   bytes. Durable compatibility boundary.
6. `application-id-schema-versioning`: successful migration plus failed/rolled-back migration,
   version update in same transaction, reopen and run reader acceptance gate. Version and schema
   agree.
7. `strict-storage-contracts` (new): ordinary INTEGER accepts nonnumeric text; STRICT rejects it,
   accepts losslessly coercible number; CHECK adds domain constraints. Observe typeof and errors.

### 02 — Physical identity, locality and space reuse (6)

8. `pages-and-dbstat`: grow table; inspect page geometry/leaf/internal counts and bytes. Contrast
   SQLite table B-tree with PostgreSQL heap.
9. `btree-splits`: bounded batches show page/depth growth; avoid claiming unmeasured per-insert
   amplification.
10. `rowid-storage`: compare logical key, INTEGER PRIMARY KEY and explicit unique index
    objects/pages; physical indirection.
11. `without-rowid-layout`: equivalent composite-key layouts/plans; secondary-key variation exposes
    clustering tradeoff, no universal size winner.
12. `overflow-pages`: create overflow, inspect local/overflow payload; contrast TOAST without
    implying SQLite compresses values.
13. `freelist-vacuum-and-reuse`: delete/reuse/compact safe copy, measure bytes. Contrast VACUUM file
    rewrite with PostgreSQL ordinary VACUUM. Keep checkpoint.

### 03 — Rollback atomicity as an ordered file protocol (6)

14. `rollback-journal-lifecycle`: hold update, inspect sidecar and reader visibility,
    rollback/commit. Locate undo evidence.
15. `journal-modes`: DELETE/TRUNCATE/PERSIST with equivalent rows; inspect cleanup/size/header
    meaning.
16. `crash-leaves-hot-journal`: unique scratch DB, forced spill plus journal magic, bounded
    readiness, kill owned writer, preserve pair before open. Never delete main lab.
17. `hot-journal-recovery`: recover WORKING COPY of preserved pair; all committed rows, zero dirty
    rows, integrity ok. Explicit prerequisite is previous lesson; deterministic artifact discovery
    under lab.
18. `synchronous-contracts`: trace FULL/NORMAL/OFF rollback sync calls with file attribution where
    possible. Requests/order versus documented persistence guarantee.
19. `batching-changes-the-cost`: identical process/connection count and SQL, different transaction
    boundaries; sync counts/time. Call it transaction batching, not group commit. Keep checkpoint.

### 04 — Error scope, writer admission and retries (6)

20. `transaction-errors-have-scope` (new): unique error between successful statements then commit;
    contrast ABORT, explicit/OR ROLLBACK and savepoint. Show surviving effects versus PostgreSQL
    failed transaction.
21. `deferred-write-race`: reader upgrade race; immediate busy despite budget, transaction state and
    justified retry.
22. `immediate-reserves-writer`: admission fails even for different rows/tables; release/retry.
    Database-wide writer reservation.
23. `rollback-reader-writer-blocking`: reader causes bounded busy at writer COMMIT; release and
    retry COMMIT itself, showing transaction remains active.
24. `busy-timeout-bounds-wait`: readiness-controlled lock holder, success/failure within/beyond
    budget; measured wait and classified errors.
25. `idempotent-retry-ledger`: identity+effect in one local commit; same payload replay, detect
    different payload for same ID; targeted conflict handling versus IGNORE, changes() adjacency.
    Keep checkpoint.

### 05 — WAL work placement, snapshots and reclamation (6)

26. `wal-sidecar-files`: commit live frames, inspect main/WAL/SHM, distinguish live set from
    portable file.
27. `reader-and-writer-overlap`: merge old snapshot-reader here; B commits, A stable snapshot, fresh
    A sees current state.
28. `busy-snapshot-upgrade`: stale upgrade refuses without waiting; full transaction
    restart/re-read; CLI evidence versus inferred extended code.
29. `checkpoint-modes`: controlled reader and frame backlog, PASSIVE/FULL/RESTART/TRUNCATE triples
    and bytes distinguish apply/reuse/coordination.
30. `automatic-checkpoint-cost` (new): low threshold on persistent writer, correlate commits with
    checkpoint I/O/timing; explicit checkpoint comparison and WAL FULL/NORMAL traces with same
    workload. Who pays maintenance?
31. `checkpoint-starvation`: pinned reader, growing WAL, incomplete checkpoint, release/reclaim/no
    row loss. Keep checkpoint.

### 06 — Recovery of structure and meaning (6)

32. `unsafe-live-copy`: main-only copy misses committed WAL, source stays intact. Filesystem copy is
    not a snapshot protocol.
33. `online-cli-backup`: backup during uncommitted writer, validate committed snapshot then later
    source state.
34. `vacuum-into-snapshot`: fragmentation then compact copy, same contents/lower bytes.
35. `integrity-and-domain-checks`: structural ok with FK/domain violation; each checker has a
    boundary.
36. `bounded-storage-failure` (new): isolated max_page_count causes SQLITE_FULL safely; inspect
    transaction/domain state, increase bound and recover. Page quota is not filesystem ENOSPC or WAL
    bound.
37. `recover-damaged-copy`: preserve source/evidence; damage working copy, range salvage and
    .recover, verify omissions and integrity. Keep checkpoint.

### 07 — Workload capacity as measured evidence (4)

38. `query-plan-as-evidence`: SCAN/SEARCH/covering, same result; add .stats/bytecode where useful to
    quantify work. Plan is not a profile.
39. `index-read-write-tradeoff`: equivalent workloads, measured maintained pages/work and plans;
    covering versus PostgreSQL visibility-map requirement.
40. `analyze-changes-plans`: controlled absence of statistics (no pre-optimize), competing
    selectivities, stat1/plan; explain later PRAGMA optimize maintenance.
41. `measure-the-writer-envelope`: persistent CLI workers, identical settings/rows; vary batch size,
    one/two writers, time under reservation. Throughput, per-transaction latency
    samples/percentiles, attempts/success/busy/errors and live WAL bytes. Handshakes/deadlines; no
    universal speed claim. Keep checkpoint.

### 08 — Independent local histories and reconciliation (6)

42. `local-oplog`: merge outbox here; domain change plus immutable ID/payload, device
    generation/local sequence commit or rollback together. Topology: independent offline origins,
    deterministic merge.
43. `outbox-replay-after-crash`: two files/processes; terminate sender after receiver commit before
    ack, restart/resend. Effect+receipt atomic at receiver, exactly one local logical effect.
44. `durable-job-claims`: short competing BEGIN IMMEDIATE claims, work outside transaction, logical
    expiry/takeover and stale token/version completion rejection. Consolidates CAS/fencing;
    demonstrate writer available during work.
45. `duplicate-and-lost-ack`: separate receiver effect/receipt/progress transaction and sender ack;
    file batch transport, lost ack/duplicate/different payload under same ID. No ATTACH delivery
    protocol.
46. `ordering-conflicts-and-tombstones`: per-origin contiguous cursors/gap buffers; opposite
    cross-origin arrival orders in two files; SAME apply procedure with (logical_time, origin)
    including equal-time conflict/deletion. Verify convergence, then expose premature tombstone-GC
    resurrection.
47. `restore-and-rejoin-history` (new): backup A, exchange more ops, restore old A while B
    remembers; show sequence/ID reuse conflict. Replay/reconcile plus new device generation or full
    resync; retention assumptions and no duplicated effect.

### 10 — Application toolkit (4; registered before capstone)

48. `independent-database-writers` (new): hold tenant-A writer, B writes successfully, second A
    contends; files give independent writer domains but not different hosts or cross-file atomicity.
49. `attached-database-boundaries` (new): owned attached files, rollback-mode multi-file transaction
    and journal evidence; compare documented WAL per-file crash atomicity. No claim that process
    kill simulates multi-file power loss.
50. `cache-invalidation-and-snapshots` (new): same-connection data_version changes after other
    connection commits, refresh local cache; engine backup/read-only snapshot. data_version is not
    global replication cursor.
51. `fts-derived-state` (new): FTS5 external-content index misses old rows, rebuild; triggers cover
    insert/update/delete and rollback. Cause/repair derived-state divergence; clear capability
    prerequisite.

### 09 — Diagnose, compose and decide (3)

52. `wal-growth-incident`: symptoms/evidence before remedy; learner distinguishes pinned snapshot
    versus writer contention, restores progress and verifies state. Put diagnosis after prediction
    task.
53. `offline-agent-capstone`: independent intent/receipt commits, short fenced jobs, uncommitted
    crash, lost ack/duplicate, stale owner and damaged restore candidate. Assert all invariants; no
    unchecked success output.
54. `sqlite-architecture-decision`: workload requirements plus incomplete ADR, actual
    contention/restore evidence; learner chooses durability/cadence/RPO/RTO, measurable acceptance
    and exit criteria. No hardcoded approved decision or cadence; mark unmeasured guarantees.

## Consolidation/progress

| Retired slug             | Surviving coverage                          |
| ------------------------ | ------------------------------------------- |
| compare-and-swap-update  | idempotent-retry-ledger; durable-job-claims |
| snapshot-reader          | reader-and-writer-overlap                   |
| transactional-outbox     | local-oplog; outbox-replay-after-crash      |
| lease-expiry-and-fencing | durable-job-claims                          |

Do not reassign retired completions to new lessons. Test existing slug-based refresh on a COPY of
progress, preserving real files byte-for-byte. Record old/new ordinal map for learners.

## Delegation

Use user-requested **gpt-5.6-luna, high**. Primary owns this plan, module08, runtime capability,
integration/docs and independent review. Agents use private copies and own only assigned files:

1. Foundations: 01-lab-file.ts, 02-pages.ts, 04-concurrency.ts (19 lessons).
2. Mechanisms/performance: 03-journals.ts, 05-wal.ts, 07-performance.ts (16 lessons).
3. Recovery/toolkit/capstone: initially 06-recovery.ts, 10-toolkit.ts, 09-capstone.ts (13 lessons).
   Primary took back capstone ownership and wrote its final implementation directly.

Primary subsequently rewrote the mechanism/performance explanations and substantially edited all
other module narratives, corrected experiment designs, and independently reviewed actual logs. Agent
ownership was explicitly returned before integration; final writing and acceptance were not
delegated to an agent-generated aggregate.

Return real per-lesson evidence and uncertainties; no commits, progress writes, engine changes,
shared generated artifacts or other agents' files. Crash/corruption validation runs serially with
primary coordination; timing benchmarks are independently rerun without other agent load.

## Verification and completion

1. Build/check/test; 54 unique slugs, backward prerequisites, full explanation fields, correct
   revisions, six checkpoints. Review every semantic change against this plan and actual evidence.
2. Each lesson isolated (except explicit crash pair), plus sequential full course in one private
   lab. Tool harness plus explicit shell runs; compare rows/errors/status/files/frames/invariants,
   not just timeout completion. Preserve logs and a per-lesson validation report.
3. Primary independently reruns changed failure/concurrency experiments and performance
   measurements.
4. Isolated progress rendering and migration smoke tests; real progress hashes unchanged.
5. Update PLAN.md to reflect final course, checkpoint/readings docs, course description, wrapper
   guidance, bootstrap capability and durable knowledge. Report remaining limits accurately.

## Added tags

Use existing PLAN.md vocabulary plus connection-policy, strict-tables, migrations, error-scope,
savepoints, storage-quota, device-generation, retention, attach, sharding, cache-invalidation,
read-only, fts5, derived-state. Two to five meaningful tags per lesson.
