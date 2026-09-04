# SQLite Systems: curriculum plan

A second deep transactional-storage course for a systems/distributed-systems engineer who is already
learning PostgreSQL. **54 lessons in ten modules**, with CLI-first experiments and no required
application framework, language binding, network service or live PostgreSQL dependency.

## What the learner should own

By the end, defend when SQLite belongs in a system: its file and connection contracts, writer
admission policy, durability and checkpoint policy, recoverable backup procedure, local/offline
protocol, measured workload limits, and conditions for choosing a different architecture.

Apply [the repository learning path](../../../docs/learning_path.md): **deep once, contrast
thereafter**. Retain the SQLite internals that separate general storage principles from PostgreSQL's
implementation. Consolidate repeated application-pattern introductions; spend that time on
independent commits, lost acknowledgments, stale owners, ordered histories and restores.

| PostgreSQL foundation      | SQLite contribution in this course                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| Heap/index layout and MVCC | Rowid table B-trees, WITHOUT ROWID locators, overflow chains and WAL page snapshots         |
| Transactions and errors    | Connection-local policy, statement ABORT, busy admission/COMMIT, stale snapshot retry scope |
| WAL and maintenance        | Rollback before-images, live sidecars and checkpoint work charged to the application        |
| Indexing and performance   | EQP versus VM counters, writer occupancy, equal-workload and unpaced capacity evidence      |
| Outbox and worker patterns | Separate sender/receiver files, crash between commit and acknowledgment, fenced completion  |
| Backup and replication     | Engine snapshots versus byte copying, stale restored identities and retained-history rejoin |
| Deployment decisions       | File-per-tenant writers, conditional ATTACH guarantees, cache hints and local FTS repair    |

## Scope, safety and teaching contracts

- Validated runtime: SQLite 3.53.4 with dbstat, sqlite_dbpage, bytecode and FTS5. Bootstrap enables
  FTS5 explicitly; capability lessons execute real probes. A missing required module is not a pass.
- Use sqlite3 plus ordinary Linux shell tools. No C/VFS implementation or hosted replication product
  is needed. The authoring-only offline-protocol helper renders its SQL in full.
- Run in a disposable learner-owned local directory. No live files on NFS, SMB or synchronized cloud
  folders. Crash experiments use unique scratch directories and exact owned PIDs; copy-based
  exercises reserve named lab artifacts and may overwrite those artifacts on rerun.
- A process kill is not a power-loss test. A clean attached commit is not a test of multi-file crash
  atomicity. Quota exhaustion is not host ENOSPC. State those distinctions explicitly.
- Preserve crash evidence before recovery; recover a working copy. Compare structure, application
  state and history, not only an integrity-check result.
- Initialize connection policies in each actual worker. Keep connections alive for live WAL and
  data_version evidence. Compare data_version only within one connection.
- Use full Session A/B blocks for concurrency, with bounded waits and explicit release points. Every
  lesson has its own setup; only hot-journal-recovery requires the preceding crash artifact.
- Early lessons guide setup and observation. Later lessons ask for predictions, variations,
  diagnosis and defended policies. The final ADR is intentionally incomplete learner work, not a
  script-generated approval or automatic completion.
- The six reading checkpoints remain after slugs now numbered **13, 19, 25, 31, 37 and 41**.
  Ordinary references and optional depth do not block progression.
- Surviving slugs preserve progress identity. Explicit lesson revisions preserve editorial-only
  completion credit; changed experiments use revision 3 and new lessons start at revision 1. Course
  release revision is 3. No authoring run marks learner progress.

## Tag vocabulary

Use two to five tags per lesson, preferring these exact values.

SQLite mechanics: `sqlite-cli`, `file-format`, `pager`, `pages`, `btree`, `rowid`, `without-rowid`,
`overflow-pages`, `freelist`, `vacuum`, `rollback-journal`, `journal-modes`, `locking`,
`transactions`, `busy`, `wal`, `snapshots`, `checkpoints`, `synchronous`, `backup`,
`integrity-check`, `recovery`, `query-planner`, `indexes`, `statistics`.

Systems concepts: `atomicity`, `durability`, `consistency`, `isolation`, `serialization`,
`write-amplification`, `crash-recovery`, `fsync`, `backpressure`, `retries`, `idempotency`,
`optimistic-concurrency`, `capacity`, `observability`, `rpo`, `rto`, `outbox`, `queues`, `leases`,
`fencing`, `oplog`, `deduplication`, `ordering`, `conflict-resolution`, `tombstones`, `incident`,
`architecture`.

Additional vocabulary: `connection-policy`, `strict-tables`, `migrations`, `error-scope`,
`savepoints`, `storage-quota`, `device-generation`, `retention`, `attach`, `sharding`,
`cache-invalidation`, `read-only`, `fts5`, `derived-state`, `writer-admission`, `failure-domain`,
`foreign-keys`, `constraints`, `data-quality`.

## Lesson-level specification

Each entry records the stable slug, action, observation, key tools and engineering purpose. The
TypeScript curriculum is the runnable source; generated lessons.json is its committed build.

### 01 — Connection ownership and application file contracts (7)

1. `build-sqlite-lab`: create owned lab/baseline with sqlite3, .databases, .tables, stat; rerun
   yields one baseline row. Explain ownership and reset scope.
2. `inspect-build-capabilities`: create/query introspection evidence; version, compile_options,
   module_list and real dbstat/dbpage/bytecode/FTS5 probes. Capability is runtime evidence.
3. `share-one-file-between-sessions`: two processes commit/rollback, compare visible rows. Minimal
   no-server visibility orientation.
4. `connection-settings-are-local`: set WAL, synchronous, foreign_keys, busy_timeout in A; reopen B;
   show persistent WAL versus connection policies, FK accepted/rejected, then initialize B
   correctly.
5. `decode-database-header`: change state, correlate committed header/page size/count and stat/xxd
   bytes. Durable compatibility boundary.
6. `application-id-schema-versioning`: successful migration plus failed/rolled-back migration,
   version update in same transaction, reopen and run reader acceptance gate. Version and schema
   agree.
7. `strict-storage-contracts`: ordinary INTEGER accepts nonnumeric text; STRICT rejects it, accepts
   losslessly coercible number; CHECK adds domain constraints. Observe typeof and errors.

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

20. `transaction-errors-have-scope`: unique error between successful statements then commit;
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
30. `automatic-checkpoint-cost`: low threshold on persistent writer, correlate commits with
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
36. `bounded-storage-failure`: isolated max_page_count causes SQLITE_FULL safely; inspect
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
    one/two writers, time under reservation. Instrumented 40-row runs plus unpaced 4000-row runs;
    throughput, per-transaction latency samples/percentiles, attempts/success/busy/errors and live
    WAL bytes. Handshakes/deadlines; no universal speed claim. Keep checkpoint.

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
47. `restore-and-rejoin-history`: backup A, exchange more ops, restore old A while B remembers; show
    sequence/ID reuse conflict. Replay/reconcile plus new device generation or full resync;
    retention assumptions and no duplicated effect.

### 10 — Application toolkit (4; registered before capstone)

48. `independent-database-writers`: hold tenant-A writer, B writes successfully, second A contends;
    files give independent writer domains but not different hosts or cross-file atomicity.
49. `attached-database-boundaries`: owned attached files, rollback-mode multi-file transaction and
    journal evidence; compare documented WAL per-file crash atomicity. No claim that process kill
    simulates multi-file power loss.
50. `cache-invalidation-and-snapshots`: same-connection data_version changes after other connection
    commits, refresh local cache; engine backup/read-only snapshot. data_version is not global
    replication cursor.
51. `fts-derived-state`: FTS5 external-content index misses old rows, rebuild; triggers cover
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

## Consolidation and learner history

| Retired slug             | Coverage retained in                        |
| ------------------------ | ------------------------------------------- |
| compare-and-swap-update  | idempotent-retry-ledger; durable-job-claims |
| snapshot-reader          | reader-and-writer-overlap                   |
| transactional-outbox     | local-oplog; outbox-replay-after-crash      |
| lease-expiry-and-fencing | durable-job-claims                          |

Retired completions are not reassigned. The engine refresh matches stable slugs to preserved IDs,
rather than using ordinal as identity. See [the old/new position map](LESSON-MAP.md). After updating
course content, the learner can run `bin/tutor sqlite init` to refresh metadata without marking
lessons done; authoring validation uses only an explicit copied progress path.

## Authoring and validation

Edit curriculum/*.ts, build with `deno task build sqlite`, and run:

```sh
deno run -A courses/sqlite/tools/validate-course.ts
deno run -A courses/sqlite/tools/validate-course.ts --isolated
deno run --allow-read --allow-write courses/sqlite/tools/verify-progress.ts
deno task check
deno task test
```

The course-local runner executes shell and multi-session native lessons serially, saves expected
results with complete logs, and retains evidence. Its native completion count only detects timeouts:
read every result and classify every intentional SQL error. Tracing must be permitted for
synchronization evidence; no trace is not zero synchronization. Review the final
[validation record](VALIDATION.md) for measured invariants and limits.

See [the implementation analysis](REWORK-PLAN.md) for the original lesson-level decisions and
[durable findings](../../../docs/knowledge/sqlite-curriculum-design.md) for reusable authoring
lessons. The checkpoint sources and bounded reading scopes live in
[the reading research](../../../docs/readings/sqlite/research-notes.md).
