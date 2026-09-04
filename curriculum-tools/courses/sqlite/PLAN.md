# SQLite Systems: curriculum plan

Audience: a software engineer who wants to master SQLite as an embedded storage engine,
transactional file abstraction, local coordination primitive, and foundation for offline systems.
This is not a general SQL course. SQL syntax appears only when an experiment needs it.

The course contains 48 lessons in nine dependency-ordered modules. Every lesson must cause a
phenomenon, observe concrete evidence, state the expected result, and connect it to a reusable
systems idea. All work stays under a disposable learner-owned lab directory.

## Scope and guardrails

- Use only SQLite 3.53.4+, `sqlite3`, and standard shell tools such as `strace`, `xxd`, `stat`,
  `timeout`, and `dd`.
- Do not require language bindings, custom C code, Docker, network services, VFS implementations, or
  external projects built around SQLite.
- Teach WAL as same-host recovery and concurrency machinery, never as distributed replication or
  consensus.
- Never put a live database on NFS, SMB, or a cloud-synchronized directory.
- Never present a copy of the main file, or separately timed copies of main/WAL/SHM, as a safe
  online backup.
- Process termination demonstrates crash recovery, not power-loss durability. Power-loss claims must
  follow SQLite's documented synchronization contract and observed filesystem calls.
- Destructive exercises operate only on uniquely named copies inside the lab and preserve the
  original evidence before attempting recovery.
- Read-only inspection is the observation half of an experiment, not a lesson by itself.
- Multi-session code uses `-- Session A` through `-- Session D`; blocking steps include `(blocks` in
  the session header for the validation harness.
- Each lesson must be independently runnable through idempotent setup unless an explicit,
  backward-only prerequisite is essential.

Primary references:

- File format: <https://www.sqlite.org/fileformat.html>
- Application file format: <https://www.sqlite.org/appfileformat.html>
- Atomic commit: <https://www.sqlite.org/atomiccommit.html>
- Locking: <https://www.sqlite.org/lockingv3.html>
- Isolation: <https://www.sqlite.org/isolation.html>
- WAL: <https://www.sqlite.org/wal.html>
- PRAGMA behavior: <https://www.sqlite.org/pragma.html>
- Backup API and CLI behavior: <https://www.sqlite.org/backup.html>
- Corruption hazards: <https://www.sqlite.org/howtocorrupt.html>

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

---

## 01 Lab and SQLite as a file

Mental model: SQLite is an in-process state machine over a documented collection of local files.
Before reasoning about databases, learn to identify the files, processes, and build capabilities
that define the experiment.

1. `build-sqlite-lab` — Create `$SQLITE_LAB`, a disposable `lab.db`, and a small baseline schema.
   Use `sqlite3`, `.databases`, `.tables`, and shell path inspection. Expect one database at the
   chosen absolute path and a repeatable reset procedure. Lens: safe systems experiments require
   ownership, isolation, and a known initial state.
2. `inspect-build-capabilities` — Query `sqlite_version()`, `PRAGMA compile_options`, and relevant
   CLI help after opening the lab. Expect SQLite 3.53.4+ and explicitly record whether `dbstat` and
   other optional features are present. Lens: deployed capability is a runtime fact, not a package
   name or assumption.
3. `share-one-file-between-sessions` — Open two CLI processes on the same path; commit a row in A
   and observe it in B, then leave an uncommitted row in A and prove B cannot see it. Expect only
   committed state to cross the connection boundary. Lens: process-local connections coordinate
   through one filesystem object and its locks.
4. `decode-database-header` — Create state, close the database, and correlate `PRAGMA page_size`,
   `page_count`, and schema changes with `stat` and the first 100 bytes from `xxd`. Expect the
   `SQLite format 3` header, a power-of-two page size, and file size consistent with page count.
   Lens: durable abstractions ultimately have byte-level compatibility contracts.
5. `application-id-schema-versioning` — Set `application_id` and `user_version`, migrate a simple
   document schema in a transaction, then reopen and validate both values. Expect application
   identity and schema generation to survive as file metadata. Lens: a database can be a versioned
   application file format, not merely a server-side table store.

## 02 Pages, B-trees, and space

Mental model: tables and indexes are B-trees made of fixed-size pages; record shape and access paths
determine locality, amplification, and file growth.

1. `pages-and-dbstat` — Insert enough fixed-size rows to grow the database, then correlate
   `page_count`, file bytes, and `dbstat` page types. Expect file size to be page-aligned and the
   table to occupy internal/leaf pages once large enough. Lens: pages are the unit of I/O and
   persistence.
2. `btree-splits` — Insert ordered batches while sampling page count and `dbstat` depth. Expect
   discrete page growth and eventually an internal page rather than smooth byte-by-byte growth.
   Lens: bounded fanout produces structural splits and bursty write amplification.
3. `rowid-storage` — Compare a normal rowid table, an `INTEGER PRIMARY KEY` alias, and a secondary
   unique index holding equivalent data. Expect the alias to reuse the table key while the secondary
   index consumes additional pages. Lens: logical identity choices change physical indirection and
   storage cost.
4. `without-rowid-layout` — Build equivalent composite-key tables with and without `WITHOUT ROWID`
   and compare plans and page use. Expect the physical layouts and lookup paths to differ; record
   actual size rather than promise one layout always wins. Lens: clustering trades one access path
   against update and secondary-index costs.
5. `overflow-pages` — Insert large, poorly compressible values and inspect `dbstat` payload and
   overflow counts. Expect logical rows to span extra pages after exceeding local payload limits.
   Lens: oversized values turn a point lookup into multiple I/Os and amplify rewrites.
6. `freelist-vacuum-and-reuse` — Delete most rows, observe `freelist_count` and unchanged file size,
   reinsert to show reuse, then run `VACUUM` on a copy. Expect deletion to free pages without
   shrinking the file and `VACUUM` to rewrite it smaller. Lens: reuse and compaction are separate
   policies with different availability and I/O costs.

## 03 Atomic commit, journals, and durability

Mental model: rollback-mode atomicity comes from carefully ordered file writes, locks, syncs, and a
recoverable before-image—not from SQL syntax alone.

1. `rollback-journal-lifecycle` — Hold a rollback-mode write transaction open and inspect the
   `-journal` file before rollback and commit. Expect a sidecar during the transaction and behavior
   matching the selected journal mode afterward. Lens: transaction state is represented by files
   outside the main database.
2. `journal-modes` — Repeat a bounded write under DELETE, TRUNCATE, and PERSIST, observing sidecar
   existence and size. Discuss MEMORY and OFF without using them for durable state. Expect distinct
   cleanup behavior but identical committed logical data. Lens: cleanup strategy is independent from
   the higher-level atomicity interface until failure occurs.
3. `crash-leaves-hot-journal` — Start a writer against a disposable database copy, modify multiple
   pages without commit, kill the process, and preserve the files before reopening. Expect the main
   database plus a nonempty journal and no visible partial transaction through a separate normal
   connection. Lens: crash evidence must be preserved before recovery mutates it.
4. `hot-journal-recovery` — Reopen the crashed copy and run integrity plus domain checks. Expect
   automatic rollback to the last committed state and `integrity_check` returning `ok`. Lens:
   recovery is a deterministic state transition driven by durable metadata.
5. `synchronous-contracts` — Use `strace` to compare file synchronization calls for bounded FULL,
   NORMAL, and OFF workloads. Expect observable differences in sync behavior; do not claim timing
   ratios or simulate power loss. Lens: acknowledgement latency buys a specific persistence
   contract, not abstract safety.
6. `batching-changes-the-cost` — Insert the same rows in autocommit and one explicit transaction,
   comparing elapsed time and sync-call counts. Expect batching to reduce transaction-boundary work
   substantially while changing the amount lost if the transaction aborts. Lens: group commit
   amortizes durability costs and enlarges the unit of failure.

## 04 Concurrency, isolation, and safe retries

Mental model: SQLite coordinates many readers and one writer. Correct applications make the
serialization point, wait budget, and retry semantics explicit.

1. `deferred-write-race` — Begin DEFERRED transactions in A and B, read in both, then attempt
   writes. Expect neither to reserve the writer initially and one path eventually to receive a busy
   failure. Lens: optimistic acquisition delays contention discovery.
2. `immediate-reserves-writer` — Repeat with `BEGIN IMMEDIATE`. Expect the second writer to fail or
   wait at `BEGIN`, before performing application work. Lens: early admission control makes overload
   and retry boundaries easier to reason about.
3. `rollback-reader-writer-blocking` — Hold a reader open in rollback mode while a writer attempts
   to commit. Expect the commit to block or return busy until the reader ends. Lens: lock upgrade
   protocols can move contention to commit time.
4. `busy-timeout-bounds-wait` — Hold the write lock in A and compare B with zero timeout and a
   bounded `.timeout`; release A once to show success and once after the deadline to show failure.
   Expect wait duration near the configured bound, not an indefinite hang. Lens: every queue needs
   an explicit latency and cancellation budget.
5. `compare-and-swap-update` — Have two sessions read the same version, then update with
   `WHERE version = ?`. Expect exactly one update to change a row and the loser to observe zero
   changes. Lens: optimistic concurrency turns lost decisions into detectable conflicts.
6. `idempotent-retry-ledger` — Apply an operation and its domain update in one transaction using a
   unique operation ID, then repeat it. Expect one durable effect and a uniqueness/no-op signal on
   replay. Lens: retries become safe only when identity and effects share an atomic boundary.

## 05 WAL, snapshots, and checkpoints

Mental model: WAL adds an append-and-checkpoint lifecycle and reader snapshots, but it retains a
single writer and requires all participants to coordinate on one host.

1. `wal-sidecar-files` — Enable WAL, keep connections open, commit writes, and inspect main, `-wal`,
   and `-shm`. Expect all three to participate in live state and committed data to exist in WAL
   before checkpointing. Lens: a "single-file database" can have a multi-file live lifecycle.
2. `reader-and-writer-overlap` — Hold a read transaction in A while B commits new rows. Expect B to
   succeed and A to continue reading its original snapshot. Lens: immutable log frames decouple
   readers from the active writer.
3. `snapshot-reader` — Count rows in a long-lived A snapshot, commit several B transactions, and
   compare A before and after ending its transaction. Expect stable results inside the snapshot and
   current results afterward. Lens: snapshots create temporal isolation and a reclamation horizon.
4. `busy-snapshot-upgrade` — Let A establish a read snapshot, let B commit a change, then have A
   attempt to write. Expect `database is locked` at the CLI level, corresponding to a stale snapshot
   upgrade failure; explain the extended result code without requiring bindings. Lens: stale reads
   cannot safely become writes without revalidation.
5. `checkpoint-modes` — Generate WAL frames and run PASSIVE, FULL, RESTART, and TRUNCATE checkpoints
   while controlling open connections. Expect checkpoint result triples and sidecar sizes to show
   progressively stronger completion conditions. Lens: log application and log-space reuse are
   related but distinct operations.
6. `checkpoint-starvation` — Hold an old reader while repeatedly committing writes and attempting
   checkpoints, then release it and truncate. Expect WAL growth and incomplete checkpoint progress
   until the reader ends, followed by successful truncation. Lens: the slowest observer sets the
   garbage-collection horizon and can create backpressure.

## 06 Backup, integrity, and recovery

Mental model: a backup is useful only if it captures a consistent state and can be restored within
the promised recovery objective.

1. `unsafe-live-copy` — Keep committed frames in WAL, copy only the main file to a disposable
   destination, and compare domain state. Expect the copy to miss recent committed rows or otherwise
   differ, without damaging the source. Lens: filesystem copying ignores transactional snapshot
   boundaries.
2. `online-cli-backup` — Run `.backup` to a new file while another connection performs bounded
   writes, then open and check the result. Expect a self-consistent source snapshot at some point
   during the operation. Lens: online backup coordinates with the engine instead of guessing file
   ordering.
3. `vacuum-into-snapshot` — Use `VACUUM INTO` after creating free pages and compare source and
   destination size and contents. Expect an independent, compact, valid database. Lens: logical
   rewrite can combine snapshot creation with compaction at an explicit I/O cost.
4. `integrity-and-domain-checks` — Create a structurally valid database containing an application
   invariant violation, then compare `quick_check`, `integrity_check`, `foreign_key_check`, and a
   domain query. Expect structural checks alone not to detect every semantic error. Lens:
   consistency has engine-level and application-level layers.
5. `recover-damaged-copy` — Corrupt selected bytes in a copy, preserve it, run normal checks and
   `.recover`, and validate recovered data in a third file. Expect partial salvage to be possible
   without claiming full restoration. Lens: recovery tools maximize readable evidence; verified
   backups provide the actual recovery guarantee.

## 07 Performance and capacity envelopes

Mental model: performance work is an evidence loop connecting workload shape to pages, plans, cache
behavior, and the single-writer serialization point.

1. `query-plan-as-evidence` — Run a selective query before and after adding an index, using
   `EXPLAIN QUERY PLAN` and timing. Expect a scan to become an indexed search and improve for a
   sufficiently large table. Lens: performance hypotheses require both a mechanism and a measured
   outcome.
2. `index-read-write-tradeoff` — Measure lookup time, database pages, and batched insert/update time
   before and after multiple indexes. Expect reads to improve while storage and write work grow.
   Lens: indexes are maintained materialized views with write amplification.
3. `analyze-changes-plans` — Create skewed data, inspect the plan before and after `ANALYZE`, and
   read the relevant `sqlite_stat1` rows. Expect recorded statistics to influence at least one
   reproducible plan choice; revise the dataset if they do not. Lens: optimizers act on compressed,
   potentially stale models of reality.
4. `measure-the-writer-envelope` — Compare autocommit, batched writes, one writer, and competing
   writer processes over bounded runs. Record throughput and busy counts rather than a universal
   limit. Expect batching to help and added writers eventually to contend at the serialization
   point. Lens: capacity is a workload-specific envelope, not a product slogan.

## 08 Local systems and offline synchronization

Mental model: SQLite can durably record intent and local progress. Delivery, ordering, conflict
policy, and convergence remain explicit application responsibilities.

1. `transactional-outbox` — Update domain state and append an outbox record in one transaction, then
   force a rollback variant. Expect both changes or neither. Lens: colocating intent with state
   closes the dual-write gap.
2. `outbox-replay-after-crash` — Claim an outbox item, simulate worker death before acknowledgment,
   restart, and process it again using a stable operation ID. Expect at-least-once delivery with one
   logical downstream effect. Lens: exactly-once behavior is usually atomic state plus
   deduplication.
3. `durable-job-claims` — Use short `BEGIN IMMEDIATE` transactions to claim queued jobs from two
   workers, record owner/attempt/deadline, and complete outside the claim transaction. Expect unique
   claims and bounded lock time. Lens: durable queues separate ownership transitions from slow work.
4. `lease-expiry-and-fencing` — Expire worker A's lease, let B acquire a higher token, then submit
   A's late result. Expect the stale token update to affect zero rows. Lens: expiry enables
   takeover; fencing prevents an old owner from acting after takeover.
5. `local-oplog` — Store local mutations with operation ID, device ID, monotonically increasing
   device sequence, payload, and acknowledgment state. Expect state change and oplog append to be
   atomic. Lens: durable intent survives crashes and disconnection.
6. `duplicate-and-lost-ack` — Transfer operations between two SQLite files using `ATTACH`, apply one
   twice, and simulate losing the acknowledgment before retry. Expect a unique receipt ledger to
   prevent duplicate effects while eventually advancing the sender. Lens: retry-safe protocols
   assume messages and acknowledgments can both be lost.
7. `ordering-conflicts-and-tombstones` — Deliver operations out of order, make concurrent edits, and
   propagate deletion through tombstones. Enforce one documented deterministic conflict rule and a
   contiguous cursor. Expect gaps to remain unapplied, duplicates to no-op, both replicas to
   converge after missing operations arrive, and deletion not to resurrect. Lens: synchronization
   requires explicit ordering, conflict, retention, and compaction policies.

## 09 Incident and architecture capstone

Mental model: mastery means diagnosing evidence under failure, recovering safely, and knowing the
boundary of the tool—not merely recalling PRAGMAs.

1. `wal-growth-incident` — Given a held reader, write burst, growing WAL, failed checkpoints, and
   busy symptoms, identify the blocking snapshot, preserve evidence, restore checkpoint progress,
   and propose prevention. Expect no data loss, a truncated WAL after release, and a short incident
   timeline. Lens: incidents are interacting feedback loops, not isolated configuration mistakes.
2. `offline-agent-capstone` — Assemble a versioned application database with domain state, outbox,
   idempotent inbox, job leases, fencing, backup, and restore. Inject a process crash, duplicate
   transfer, lost acknowledgment, stale worker, and damaged backup copy. Expect verified recovery
   and convergence under the declared policy. Lens: reliable local systems combine several small
   invariants at transactional boundaries.
3. `sqlite-architecture-decision` — Measure the capstone workload and write an ADR/runbook covering
   concurrency, latency, durability mode, backup cadence, RPO, RTO, failure domain, invariant
   checks, and explicit exit criteria for moving beyond SQLite. Expect every claim to cite observed
   course evidence or SQLite documentation. Lens: choosing a storage system means matching
   guarantees and limits to requirements.

## Implementation contract

1. Replace the placeholder module and create these files in order: `01-lab-file.ts`, `02-pages.ts`,
   `03-journals.ts`, `04-concurrency.ts`, `05-wal.ts`, `06-recovery.ts`, `07-performance.ts`,
   `08-local-systems.ts`, and `09-capstone.ts`.
2. Register all modules in `curriculum/mod.ts` before parallel lesson authoring so authors edit
   separate files and slugs/prerequisites remain stable.
3. Add a course-local REPL wrapper selected by `course.json`. It must open the shared path in
   `TUTOR_SQLITE_DB`, reject an empty or unsafe path, and allow each validation run to select a
   unique scratch database.
4. Keep the generic tutor engine, public lesson types, progress schema, and explicit progress
   semantics unchanged unless validation proves an engine defect.
5. Build `lessons.json` with `deno task build sqlite`; never edit it or `progress.sqlite` manually.
6. Use realistic `difficulty`, `safetyLevel`, `runIn`, `sessions`, and `estimatedMinutes` values.
   Crash and corruption exercises are `dangerous`; locking exercises are `locking`.

## Validation and acceptance

- Run `deno task build sqlite`, `deno task check`, and `deno task test` after each module batch.
- Validate every tool lesson against SQLite 3.53.4 with a fresh `TUTOR_SQLITE_DB`. Compare real
  evidence with `expectedResult`; a timeout-free harness run alone is not a pass.
- Validate multi-session lessons against one shared file and run parallel module validation only
  with separate lab directories.
- Run crash, filesystem-copy, `strace`, and corruption lessons manually and serially. Capture actual
  filenames, sizes, checkpoint triples, error strings, exit codes, and integrity results.
- Grep validation output for unexpected parse errors, `database is locked`, missing capabilities,
  and shell failures. Busy errors count as success only when the lesson deliberately causes them.
- Independently rerun at least two lessons per module, every multi-session lesson, every dangerous
  lesson, and all capstones.
- Smoke-test `bin/tutor sqlite init`, `modules`, `topics`, `pretty`, `search`, isolated `--db`
  progress, completion, notes, skipping, and revision staleness.
- Accept a lesson only when its setup is safe and repeatable, its phenomenon reproduces, its
  expected result matches actual output, and its systems lens does not overstate SQLite's
  guarantees.
