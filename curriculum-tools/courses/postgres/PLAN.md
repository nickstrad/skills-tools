# PostgreSQL Systems: module plan

Current acceptance, 2026-09-05: chunks1–4 are implemented. Current62 PITR incorporates the retired
original51 timeline-history through actual before/after named-target branches and archived ancestry.
The generated course has93 active lessons and seven reading stops. [REWORK-PLAN](REWORK-PLAN.md) and
[lesson-map](lesson-map.md) remain authoritative during the remaining replication/protocol/ incident
work and final outline refresh.

Refactor in progress: [REWORK-PLAN.md](REWORK-PLAN.md) and its bounded designs supersede affected
sections below. This original module outline remains a reference until final integration. Use
[lesson-map.md](lesson-map.md) for current numbers, surviving slugs and reading stops.

Audience: a software engineer who builds and operates distributed systems and wants to understand
PostgreSQL as a storage/replication system, not as a DBA. Every lesson is an experiment: setup,
action, observation, expected result, systems lens. The lab is the cluster from module 01 (port
5440, db `lab`, `$PGLAB=/var/lib/postgresql/pglab`). Slugs below are fixed; other modules reference
them as prerequisites, so keep them exactly.

Conventions for authors:

- `code` is executed by `tools/validate.ts`: one psql per session, split on `-- Session A/B` lines;
  a header containing `(blocks ...)` is sent without waiting. Use `\watch i=1 c=3` style bounds.
- Everything the learner creates lives in the `lab` database or under `$PGLAB`. Use table names
  prefixed with the module (`st_`, `mv_`, `vac_`, `iso_`, `lk_`, ...) so modules do not collide.
- `setup` must be idempotent (`drop table if exists ...; create table ...`).
- `expectedResult` must quote the real output: the error text, the wait_event, the row count, the
  LSN delta magnitude. "It works" is not an expected result.
- Prerequisites: reference only slugs in your own module or in module 01 unless the plan says
  otherwise (other modules may not be built yet).
- Keep data small: this machine has 1 CPU and under 1 GB RAM. 100k rows is plenty.
- Every lesson has `tags` from the vocabulary below (book chapter first, then concepts).
- Every lesson has the exact `reading` line assigned in `docs/reading-map.md`: either a citation to
  _PostgreSQL 14 Internals_ (Egor Rogov) by chapter number, exact title, and section, or a plain
  statement that the book does not cover the lesson with the closest background chapter. The chapter
  digest is `docs/pg14-internals-chapters.md`, and the book itself is
  `docs/postgresql_internals-14_en.pdf`; use the digest rather than re-reading the PDF so titles and
  coverage decisions stay consistent.
- When `reading` cites a chapter, `readingNotes` explains the overlap: which structure, mechanism or
  section the experiment shows live, what the book explains that the lesson does not, where the
  lesson differs (PostgreSQL 16 names versus the book's 14), and whether to read the chapter before
  or after the experiment. Lessons the book does not cover have no `readingNotes`.
- `syntaxBreakdown` follows the learning template in `../../docs/AUTHORING.md` (`In plain terms:`,
  `What you are learning:`, `Piece by piece:`), written for a learner who knows basic SQL but not
  PostgreSQL internals. No five-word blurbs; every command, flag, function, view, setting, and
  unusual clause gets what it is, what it does here, and what it gives us.

## Tag vocabulary (for `tags`, `--topic`, and `topics`)

Every lesson carries 2-5 kebab-case tags. The learner is reading _PostgreSQL 14 Internals_ (Egor
Rogov), so the first group mirrors its chapters; the second names systems concepts; add a new tag
only when nothing fits, and prefer reusing these exact strings.

Book chapters: `isolation`, `mvcc`, `pages-and-tuples`, `snapshots`, `page-pruning`, `hot-updates`,
`vacuum`, `autovacuum`, `freezing`, `rebuilding-tables-and-indexes`, `buffer-cache`, `wal`,
`wal-modes`, `checkpoints`, `recovery`, `relation-locks`, `row-locks`, `deadlocks`,
`advisory-locks`, `lightweight-locks`, `query-planning`, `statistics`, `table-access-methods`,
`index-access-methods`, `index-scans`, `nested-loop`, `hashing`, `sorting-and-merging`, `btree`,
`hash-index`, `gist`, `gin`, `brin`.

Finer PostgreSQL topics: `read-committed`, `repeatable-read`, `serializable`, `snapshot-isolation`,
`predicate-locks`, `serialization-failure`, `lost-update`, `write-skew`, `xid`, `clog`,
`visibility-map`, `free-space-map`, `toast`, `bloat`, `wraparound`, `fsync`, `full-page-writes`,
`timelines`, `backup`, `pitr`, `streaming-replication`, `replication-slots`, `hot-standby`,
`synchronous-replication`, `failover`, `logical-replication`, `logical-decoding`, `cdc`, `explain`,
`work-mem`, `parallel-query`, `pg-stat-statements`, `wait-events`, `pg-stat-io`, `connections`,
`timeouts`, `logging`, `checksums`, `corruption`, `process-model`, `background-processes`,
`configuration`, `extensions`, `psql`, `lab`, `ddl`, `migrations`, `unique-constraints`,
`skip-locked`, `lock-queue`, `listen-notify`, `two-phase-commit`.

Systems concepts: `transactions`, `durability`, `consistency`, `availability`, `replicated-log`,
`quorum`, `gc-horizon`, `write-amplification`, `caching`, `retries`, `idempotency`, `queues`,
`leases`, `leader-election`, `fencing`, `outbox`, `optimistic-concurrency`, `split-brain`,
`distributed-patterns`, `capacity`, `observability`, `incident`, `postmortem`.

---

## 02 storage (file: 02-storage.ts, export STORAGE, category "storage")

Mental model: a table is a file of 8 KB pages; a row is a tuple with a header; updates never
overwrite in place; the buffer cache sits between pages and disk.

1. `table-is-a-file` (ddl, shell/mixed, 1 session). Create `st_events(id int, payload text)`, insert
   1000 rows, find its file with `pg_relation_filepath`, `\! ls -l` it under `$PGLAB/primary`,
   compare `pg_relation_size` to file size and `pg_relation_size(...)/8192` to
   `pg_stat_user_tables.n_live_tup`-ish. Expect: file size is a multiple of 8192; the relfilenode in
   the path matches `pg_class.relfilenode`. Lens: everything is pages; the OS file is the unit of
   durability and replication.
2. `page-header-and-line-pointers` (read-only). `pageinspect`:
   `page_header(get_raw_page('st_events',0))` and `heap_page_items(...)` limit 5. Observe lp,
   lp_off, lp_len, t_xmin, t_xmax, t_ctid. Expect: first tuple ctid (0,1); pd_lower grows down from
   header, pd_upper grows up from the end. Lens: slotted pages, indirection via line pointers =
   stable addressing within a page.
3. `update-writes-a-new-tuple` (writes-data). Update one row twice, then heap_page_items for that
   page: old versions remain with t_xmax set, new version appended; ctid chain old -> new. Show
   `ctid` of the live row changed. Expect: 3 physical tuples for one logical row; xmax of old ones =
   the updating transaction's xid (`pg_current_xact_id` captured with \gset). Lens: MVCC by copy;
   append-only-ish storage; why bloat exists.
4. `hot-updates-and-fillfactor` (ddl). Two tables: `st_hot` fillfactor 100 with an index on id and
   `st_hot_ff` fillfactor 70. Update a non-indexed column N times on each; compare
   `pg_stat_user_tables.n_tup_hot_upd` vs `n_tup_upd` and the t_ctid chains staying on the same
   page. Then update the indexed column and see HOT stop (n_tup_hot_upd unchanged). Expect concrete
   counter values. Lens: in-page redirection avoids index writes; leaving space is a write
   amplification trade.
5. `toast-and-large-values` (writes-data). Insert a 100 KB `repeat('x', 100000)` text and a
   compressible vs `random`-ish incompressible value (use `gen_random_uuid()` concatenation or
   `encode(gen_random_bytes(...),'hex')` via pgcrypto? pgcrypto may not be installed; use
   `string_agg(md5(i::text))` for pseudo-random). Show `pg_relation_size` of the main table vs
   `pg_total_relation_size`, the toast relation name from `pg_class.reltoastrelid::regclass`, and
   `pg_column_size` before/after. Expect: main heap stays tiny, toast table holds chunks; compressed
   value much smaller than logical size. Lens: out-of-line storage; why big values are expensive to
   update; chunking as a general pattern.
6. `buffer-cache-and-io` (read-only, uses pg_buffercache, pg_prewarm, track_io_timing). Restart is
   not needed: evict by `select pg_prewarm('st_events')` vs cold read after `\!` cannot drop cache;
   instead observe `explain (analyze, buffers)` on `st_events` twice: first shows `read`, second
   shows `hit`; and `pg_buffercache` rows for the relation with `isdirty` after an update and
   before/after `checkpoint`. Expect: shared hit count == pages; isdirty flips true after update and
   false after `checkpoint`. Lens: write-back cache; dirty pages are the checkpoint's job; reads
   cost differently by tier.
7. `free-space-map-and-reuse` (writes-data, pg_freespacemap). Delete half of `st_events`, run
   `vacuum st_events` (just this once, as a black box; module 04 explains it), look at
   `pg_freespace('st_events')` and insert rows again: new tuples land in old pages (ctid page
   numbers < old max). Expect: relation size does not grow after reinsert. Lens: space reuse vs
   compaction; why heap files rarely shrink.

## 03 mvcc (file: 03-mvcc.ts, export MVCC, category "mvcc")

Mental model: every tuple carries xmin/xmax; a snapshot decides visibility; the oldest snapshot in
the cluster pins garbage.

1. `xids-and-the-transaction-counter` (writes-data). `select pg_current_xact_id_if_assigned()` in
   and out of a transaction: null until a write; two sessions get increasing xids; `txid_status`.
   Expect: read-only txn assigns no xid; xids monotonically increase across sessions. Lens: ids are
   allocated lazily; a global counter is a serialization point.
2. `snapshot-anatomy` (read-only, 2 sessions). B opens a transaction, writes, does not commit; A
   runs `select pg_current_snapshot()`; parse xmin:xmax:xip. Expect: B's xid appears in xip list of
   A's snapshot; after B commits and A takes a new snapshot it disappears. Lens: snapshot = (low
   water mark, high water mark, in-progress list); the same structure as vector clocks/GC horizons.
3. `two-sessions-see-different-versions` (writes-data, 2 sessions). A in `repeatable read` reads
   `mv_accounts`; B updates and commits; A re-reads (old value), A commits and reads again (new).
   Show xmin/xmax of both versions via heap_page_items. Expect: A's second read unchanged, third
   read changed. Lens: snapshot isolation is time travel per transaction.
4. `commit-visibility-and-clog` (writes-data). Show `pg_xact_status(xid)` for committed/aborted xids
   from earlier; abort a transaction and show its tuples remain on the page with xmin = the aborted
   xid but are invisible; `\! ls $PGLAB/primary/pg_xact`. Expect: 'aborted' status; row count
   excludes it; heap_page_items still lists the tuple. Lens: commit is a bit flip in the commit log,
   not a data rewrite; visibility = tuple header + clog + snapshot.
5. `xmin-horizon-blocks-cleanup` (locking, 2 sessions). B opens a transaction with a snapshot
   (`begin; select 1`), A deletes rows and runs `vacuum verbose mv_accounts` -> "dead row versions
   cannot be removed yet, oldest xmin"; A queries `pg_stat_activity.backend_xmin` for B. B commits;
   vacuum again removes them. Expect: verbose lines with the counts. Lens: GC horizon = min over all
   observers; one idle observer stalls the whole system (idle_in_transaction_session_timeout).
6. `wraparound-and-freezing` (read-only + writes). `age(relfrozenxid)` for mv_accounts and
   `age(datfrozenxid)`; `vacuum freeze mv_accounts`; heap_page_items shows t_infomask with the
   frozen bits (mask 0x0300); age resets to ~0. Explain the 2^31 horizon and
   `autovacuum_freeze_max_age`. Expect: age drops after freeze. Lens: 32-bit counters and
   epoch-based reclamation; the failure mode is a forced shutdown.

## 04 vacuum (file: 04-vacuum.ts, export VACUUM, category "vacuum")

1. `dead-tuples-accumulate` (writes-data). Update all rows of `vac_t` (20k rows) 3 times; watch
   `pg_stat_user_tables.n_dead_tup`, `pgstattuple` dead_tuple_percent, relation size growing 4x.
   Expect numbers.
2. `vacuum-reclaims-in-place` (writes-data). `vacuum verbose vac_t`: removed N dead versions, pages
   remain, size unchanged; `pg_freespace` now shows free space; reinsert refills. Lens: vacuum is a
   compactor within pages, not a file shrinker.
3. `vacuum-full-rewrites-and-locks` (locking, 2 sessions). A runs `vacuum full vac_t` while B tries
   a `select` -> B blocks (pg_locks shows AccessExclusiveLock). Show relfilenode changed. Lens:
   rewrite = new file + exclusive lock; compaction vs availability.
4. `visibility-map-and-index-only-scans` (read-only, pg_visibility). After vacuum,
   `pg_visibility_map_summary`; `explain (analyze, buffers)` an index-only scan shows Heap Fetches:
   0; then update some rows -> all_visible flips false for those pages; Heap Fetches > 0.
5. `autovacuum-triggers` (writes-data). Set `vac_t`
   `autovacuum_vacuum_scale_factor=0.01,
   autovacuum_vacuum_threshold=50, autovacuum_naptime` is
   global (1min default) so instead compute the threshold from `pg_settings`, dirty enough rows,
   then `select ... \watch i=5 c=12` on `pg_stat_user_tables.last_autovacuum` until it fires
   (bounded 60 s). If timing is unreliable, accept "may take up to a minute" and show
   `pg_stat_progress_vacuum` if caught. Lens: threshold GC triggers; why tiny hot tables are the
   problem.
6. `long-transaction-bloats-everyone` (locking, 2 sessions). B holds an old snapshot; A churns
   updates in a loop (`do $$ ... $$` 200 iterations on a tiny table) -> table grows to hundreds of
   pages although it has 10 logical rows; after B commits + vacuum, dead tuples go away but size
   stays. Lens: the cost of one straggler is paid by everyone; mitigations
   (`idle_in_transaction_session_timeout`, `old_snapshot_threshold`).

## 05 isolation (file: 05-isolation.ts, export ISOLATION, category "isolation")

All lessons use `iso_accounts(id int primary key, balance int)` with 2-3 rows; 2 sessions.

1. `atomic-abort` (writes-data). Update two rows, `rollback`; also an error mid-transaction
   ("current transaction is aborted, commands ignored until end of transaction block"). Expect exact
   error string. Lens: atomicity via undo-by-ignoring (MVCC) not undo logs.
2. `read-committed-sees-each-statement` (2 sessions). A `begin` (read committed), select; B updates
   & commits; A select again -> new value inside the same txn. Contrast with lesson 3 of mvcc.
3. `lost-update-under-read-committed` (2 sessions). A and B both `select balance` then
   `update ... set balance = <read value> - 10` with A committing first; B's update overwrites. Then
   repeat with `update ... set balance = balance - 10` (atomic RMW) and with
   `select ... for update`: B blocks (`(blocks until A commits)`) and then recomputes. Expect final
   balances for each variant.
4. `repeatable-read-blocks-then-fails` (2 sessions). A `begin isolation level repeatable read`,
   select, B updates & commits the same row, A updates it ->
   `ERROR:  could not serialize access
   due to concurrent update` (SQLSTATE 40001). Expect exact
   text.
5. `write-skew` (2 sessions, repeatable read). Doctors-on-call: both read count of on-call >= 2,
   each removes itself, both commit -> invariant broken. Expect 0 on call. Lens: snapshot isolation
   is not serializable; the anomaly requires reasoning about read sets.
6. `serializable-ssi` (2 sessions). Same as 5 under `serializable`: second commit fails with
   `could not serialize access due to read/write dependencies among transactions` (40001) and the
   hint about retry. Show `pg_locks` SIReadLock rows during the run. Lens: SSI tracks rw
   dependencies; the price is aborts and the need for retry loops.
7. `retry-loop-and-idempotency` (1-2 sessions). A `do $$` block or client-side loop pattern that
   retries on 40001 with `savepoint`; show `pg_stat_database.conflicts`? (that is standby). Instead
   count retries via a counter table. Keep it simple and honest; may be single session demonstrating
   `savepoint`/`rollback to savepoint` + SQLSTATE capture in plpgsql
   (`exception when serialization_failure`). Lens: retries need idempotent effects.

## 06 locking (file: 06-locking.ts, export LOCKING, category "locking")

Tables `lk_*`. Use `pg_locks`, `pg_blocking_pids`, `pg_stat_activity.wait_event`, `pgrowlocks`.

1. `row-locks-are-in-the-tuple` (2 sessions). A `select ... for update` on one row, no commit; B
   `pgrowlocks('lk_t')` shows the locker xid and mode; B `update` that row
   `(blocks until A
   commits)`; A commits; B proceeds. Expect pgrowlocks row with `For Update`,
   B's wait_event `transactionid`. Lens: row locks live in tuple headers (xmax) not a lock table;
   waiting is on the xid.
2. `lock-queue-and-blocking-pids` (3 sessions). A locks a row, B and C wait; from A run
   `pg_blocking_pids(pid)` for each and a query joining pg_stat_activity; show FIFO: when A commits
   B gets it, C still waits. Lens: wait-for graph; head-of-line blocking.
3. `deadlock-detection` (2 sessions). Classic A->1, B->2, A->2 (blocks), B->1 -> deadlock; after
   `deadlock_timeout` (1 s) one gets `ERROR:  deadlock detected` with the DETAIL lines. Expect exact
   error and that the other proceeds. Lens: cycle detection with a timer; lock ordering as
   prevention.
4. `lock-timeout-and-nowait` (2 sessions). `set lock_timeout = '500ms'` ->
   `canceling statement
   due to lock timeout`; `select ... for update nowait` ->
   `could not obtain lock on row`; `skip
   locked` returns other rows. Lens: bounded waits,
   fail-fast, and work stealing.
5. `ddl-behind-a-long-query` (3 sessions). A runs a long `select pg_sleep(20)` inside a txn on
   `lk_t` (holding AccessShareLock); B `alter table lk_t add column x int` blocks on
   AccessExclusiveLock; C's plain `select` now blocks behind B (lock queue is fair). Show `pg_locks`
   granted=false modes. Lens: schema changes are exclusive; a queued exclusive lock turns a harmless
   reader into an outage; `lock_timeout` + retry for migrations.
6. `advisory-locks-as-leases` (2 sessions). `pg_try_advisory_lock(42)` true in A, false in B;
   session-scoped vs transaction-scoped (`pg_advisory_xact_lock`); A disconnects/ends -> B acquires.
   Lens: leader election / leases; no fencing token, discuss what happens on partition.
7. `skip-locked-work-queue` (2 sessions). `lk_jobs` table; both sessions run
   `select ... for
   update skip locked limit 1`; they get different jobs; delete on commit. Show
   what happens without skip locked (B blocks). Lens: at-least-once queue on a database; visibility
   = commit.
8. `unique-constraint-race` (2 sessions). Both insert the same key in open transactions; B blocks on
   A's xid `(blocks until A commits)`; A commits -> B gets
   `duplicate key value violates unique
   constraint`; with `on conflict do nothing` B gets INSERT
   0 0. Lens: uniqueness needs a serialization point; how `insert ... on conflict` behaves under
   concurrency.

## 07 wal (file: 07-wal.ts, export WAL, category "wal")

1. `every-change-is-a-wal-record` (revision4, privileged, psql). Attribute records to writing xids
   and owned relations; establish flushed bounds. Compare committed/aborted row outcomes and
   physical records, including read-side hint images. Vary an indexed key; cluster LSN distance
   remains an interval, not exact request accounting. Accepted validation/04-wal-records-images.md.
2. `full-page-writes-after-checkpoint` (revision4, privileged, psql). Compare first, repeated and
   post-checkpoint updates on a fresh page with full_page_writes retained; inspect actual block
   image bytes. Exact pglz variation preserves row outcomes. Images are not necessarily8192 bytes.
3. `commit-means-fsync` (revision4, shell). Eight bounded pgbench trials compare synchronous_commit
   on/off and1/4 clients, then batch5 varies transaction size with400 useful increments unchanged.
   Verify all client counters, failures, raw latency samples and qualified cluster WAL-sync deltas.
   Optional owned-file pg_test_fsync is a separate storage probe. No universal speedup, fsync-per-
   transaction equivalence or demonstrated asynchronous lost-commit claim. Accepted04-commit-cost.
4. `wal-files-and-recycling` (revision4, privileged shell). Own a fresh1MB-segment cluster with
   an8MB WAL target. Cause archive-command exit1 and seal12 segments, then check actual retained
   bytes, ready markers and failure counters after checkpoint. Repair, verify every target hash and
   receipt, then observe old-name disappearance through removal/recycling. Vary to20 segments. Local
   archive copy is not yet a tested backup or host-loss boundary. Accepted04-archive.
5. `crash-and-redo` (revision4, dangerous shell). Own a fresh cluster; one committed and one
   unfinished transaction both produce flushed WAL. Verify xid-specific physical/transaction
   records, crash without first closing the unfinished client, inspect the unclean control file and
   offline pg_waldump, then restart and match fresh redo messages, raw tuple headers and independent
   receipts. Exact variation commits the second transaction before the same crash. Includes former
   `wal-replay-is-deterministic` coverage; that slug retires without moving its completion record.
   Accepted04-crash; local process recovery does not establish power-loss or disk-loss recovery.
6. `wal-size-of-operations` (revision4, privileged shell). Match fresh heap layouts and200 requested
   rows for INSERT SELECT,200 statements/one transaction,200 autocommits and client-streamed COPY.
   Separate owned heap-record bytes, commit-record bytes and unequal catalog hint-image overhead.
   Matched amount updates with/without its secondary index preserve results and show200/0 HOT;
   separate index build verifies valid/ready output. Exact no-op comparison preserves all values
   while its guard prevents200 redundant tuple updates. Accepted validation/04-amplification.md.

## 08 checkpoints & recovery (file: 08-checkpoints.ts, export CHECKPOINTS, category "checkpointing")

1. `checkpoint-anatomy` (privileged). `pg_control_checkpoint()` before/after `checkpoint`;
   `pg_stat_checkpointer`/`pg_stat_bgwriter` counters; the log line "checkpoint complete: wrote N
   buffers". Lens: bounding recovery time by flushing dirty pages.
2. `redo-point-bounds-recovery` (dangerous). Big write, no checkpoint, crash -> recovery replays
   from redo lsn (log shows how much); vs checkpoint then crash -> almost nothing to replay. Compare
   "redo starts at" to "redo done at" distances.
3. `max-wal-size-forces-checkpoints` (privileged). Set `max_wal_size='64MB'` + reload, generate WAL,
   log shows "checkpoint starting: wal". Lens: back-pressure between log growth and cache flushing.
4. `base-backup` (shell). `pg_basebackup -D $PGLAB/backup1 -c fast -X stream`; inspect
   `backup_label`; `pg_verifybackup`. Lens: a consistent snapshot = files + WAL from the redo point.
5. `point-in-time-recovery` (dangerous, shell). Insert marker rows with timestamps, "accidentally"
   drop the table, restore backup1 to `$PGLAB/pitr` with `restore_command` from `$PGLAB/archive`,
   `recovery_target_time` before the drop, `recovery_target_action=promote`, start on port 5441, see
   the table alive, note the new timeline id in `pg_control_checkpoint()`. Stop and remove it. Lens:
   the log + snapshots gives time travel; timelines are branches.
6. `timeline-history` (read-only, shell). Look at `$PGLAB/archive/*.history`, `pg_walfile_name`
   encodes timeline; explain why a rewound primary cannot follow. Sets up module 09.

## 09 replication (file: 09-replication.ts, export REPLICATION, category "replication") SERIAL

1. `build-a-streaming-standby` (accepted, shell, privileged). Owned source/copy, dedicated role,
   verified basebackup, actual sender/receiver/identity checks, post-backup receipt replay and
   rejected standby write. Variation replaces the receiver and verifies another streamed receipt.
2. `replication-lag-under-load` (accepted, shell, privileged). Pause actual replay; commit2,000
   receipts and require durable receive plus source flush acknowledgement while independent rows
   remain stale. Resume, gate replay and verify all values. Variation doubles only the workload.
3. `read-your-writes-on-a-replica` (accepted, moved from14, shell, privileged). Post-COMMIT token,
   pinned source history/topology,500ms replay deadline, timeout without stale payload,
   wrong-history rejection before comparison and a fresh profile/receipt snapshot after apply.
   Variation performs a separately bounded pinned-primary fallback while replay remains paused. No
   failover authority service is implied; system/timeline checks alone are insufficient for that
   contract.
4. `synchronous-replication-blocks-commit` (accepted, shell, privileged). Actual local/on commits
   during paused replay; remote_apply waits despite received/flushed COMMIT. Match active XID to
   locally durable WAL while a fresh primary snapshot still excludes that row. Stop the required
   standby; local completes and on waits. Cancel its acknowledgement, classify WARNING plus COMMIT
   and reconcile exact receipts. Variation reconnects instead; all five receipts finally replay.
   Observer sessions use local policy, writers SET LOCAL; no election/fencing or latency benchmark
   claim follows from these same-host acknowledgement observations.
5. `hot-standby-query-conflict` (accepted, shell, privileged). Two identically seeded tables;
   feedback off produces actual40001 snapshot cancellation after primary cleanup. Feedback on
   requires observed physical-slot xmin protecting the active old snapshot, retains5,000 deleted
   versions while fresh reads advance and the old reader survives. Release/disable feedback, observe
   the horizon clear, vacuum and verify reusable space plus complete source/copy agreement.
   Variation deletes one quarter instead of half. Sender backend_xmin may remain NULL when the slot
   owns xmin.
6. `replication-slot-retains-wal` (accepted, shell, privileged). Disconnect the actual owned
   physical consumer;32,000 later receipts retain35 one-MB WAL segments despite an8MB target.
   Reconnect, verify every receipt and reclaim obsolete segments. Variation caps the oversized
   inactive slot at4MB, observes lost state/missing segment and actual old-consumer rejection with
   stale baseline-only rows, then preserves that copy and rebuilds from a verified full backup. Both
   paths verify a post-return streamed receipt and complete32,002-row result before cleanup.
7. `promote-the-standby` (accepted, dangerous, shell). Two independent owned pairs: unsafe promotion
   preserves actual split-brain receipt inventories, then controlled cutover closes admission,
   blocks old app login, verifies zero app sessions and complete candidate replay/rows, stops the
   old source before promotion and rejects stale routing authority. Current authority accepts a
   later receipt and all acknowledged work is present. Variation refuses a paused/stale candidate
   before resuming the same gate. Driver-owned epoch is not a distributed election or durable lease;
   local exclusion assumes no uncontrolled supervisor restarts the old process.
8. `rewind-the-old-primary` (accepted, dangerous, shell). Fresh divergence, explicit timeline2
   choice and independent acknowledged-receipt sets. Fence/stop target; preserve a hash-verified
   compressed cold image. Actual dry run leaves target hashes unchanged; real pg_rewind identifies
   divergence/common checkpoint and rewrites files. Repair copied recovery/socket/slot settings,
   rejoin read-only, verify25006 on target writes and a later streamed receipt. Variation increases
   discarded old acknowledgements from one to three; all remain accounted for in preserved evidence.
9. `cascading-and-failback` (accepted, dangerous, shell). Controlled round trip on fresh owned
   nodes. Close admission, verify known-history replay and every receipt, exclude outgoing writer
   before each promotion. Rebuild original endpoint from a verified backup, refuse it while stale,
   then return and prove timeline3/full receipts after restart with zero slots. Optional hint2 adds
   a verified third hop with the middle still in recovery; stop leaf/release its slot before return.
   Cleanup is required in both scripts; no learner-cluster reset or inherited live topology.

## 10 logical (file: 10-logical.ts, export LOGICAL, category "logical-replication")

1. `decode-the-log` (accepted, privileged, shell). Fresh logical-WAL cluster: match
   committed/aborted XIDs to actual physical heap/transaction records and test_decoding events.
   Repeated peek/get, DDL empty envelope and later new-column row, then deliver a newer commit while
   an older writer stays open. Compare commit order with XID and individual row LSN order.
   FULL-identity variation adds old UPDATE/DELETE fields with the same final table. Explicit plugin
   mode and flush gates bound the claims; no receiver-effect acknowledgement is implied.
2. `slot-position-and-acknowledgement` (accepted, dangerous, shell). Independent owned
   source/receiver: consume-first failure, then atomic receipt plus credit and acknowledgement
   through a complete decoded transaction. Kill consumers before receiver commit, after commit and
   after source ack; replay deduplicates and later work stays pending. Variation crashes source
   before slot checkpoint, proving acknowledged-offset replay with receiver state intact. Final safe
   IDs10–21/total186 survive receiver restart; unsafe missing effects remain separately classified.
3. `publication-and-subscription` (privileged, shell). Combines initial subscription and new-table
   refresh with actual snapshot/tail evidence. Private replica row trigger holds COPY after a seed
   tuple arrives; concurrent source INSERT/UPDATE/DELETE batches commit. Audit exactly100 old seed
   images under the blocked worker XID and all later row changes under separate transaction IDs.
   Verify ready states, apply-origin COMMIT boundaries, full contents and post-ready receipts.
   Existing items continue streaming while refreshed ledger is still copying. Four-batch variation
   doubles overlap without changing final row counts; verify values/membership rather than counts.
   Former `initial-sync-vs-streaming` is consolidated here after both executed handoffs pass.
4. `conflicts-stop-the-apply-worker` (privileged, shell). Independent source/subscriber with
   disable_on_error and complete-transaction streaming. Actual23505 rolls back an update, delete and
   non-conflicting insert along with the collision; later source commits accumulate behind it. Core
   removes the preserved local collision and replays. Variation uses the logged COMMIT-start finish
   LSN to SKIP, inventories all four discrepancies despite advancing origin, then explicitly
   reconciles under stopped apply and paused source writes. Source-only ADD COLUMN causes actual
   55000; compatible target DDL recovers queued work. Both paths require all ten final payloads,
   fresh post-repair receipts and cleanup; counters remain cumulative rather than proving agreement.
5. `slot-lag-and-disk` (privileged, shell). Pause a real independent subscriber, retain bounded
   published changes plus unpublished WAL churn, then verify backlog replay and acknowledgement.
   Drop the inactive slot with new work pending; actual missing-slot startup fails while apply/sync
   counters remain zero. Recreating the name starts beyond the gap: new receipts arrive while
   IDs1/2/600 remain stale/extra/missing. Variation REFRESH(copy_data=true) does not recopy the
   existing table. Preserve stale rows, empty the owned target and create a fresh subscription under
   paused source writes; audit the actual copied snapshot and verify post-copy receipt902 with all
   15 final payloads. An inserted-then-deleted gap event remains missing from consumer history, so
   current-state recovery is not historical delivery. Drop every owned subscription/slot and stop
   both servers; full physical retention/invalidation mechanics remain in the earlier experiment.

## 11 planner (file: 11-planner.ts, export PLANNER, category "query-planning")

1. `explain-analyze-buffers` basics on `pl_orders` 100k rows: seq scan cost vs actual, buffers.
2. `statistics-drive-plans`: bad estimate after bulk load without analyze (rows=1 vs actual 100000),
   then `analyze`; `pg_stats` histogram; `n_distinct`.
3. `index-scan-vs-seq-scan-crossover`: same query with selectivity 0.1% vs 50%, planner switches;
   force with `enable_seqscan=off` to show the cost difference.
4. `join-strategies`: nested loop vs hash vs merge, `work_mem` influence; `Batches: 2` when
   spilling.
5. `work-mem-spills-to-disk`: sort with `work_mem=64kB`: `Sort Method: external merge  Disk:`;
   `pg_stat_database.temp_files`; log_temp_files.
6. `parallel-query`: `max_parallel_workers_per_gather`, `Workers Launched`, when it does not launch.
   Lens: scatter-gather inside one node.
7. `pg-stat-statements-as-tracing`: reset, run workload, top by total_exec_time, `shared_blks_hit`
   ratio; mean vs stddev. Lens: aggregate telemetry; normalization by query id.

## 12 indexes (file: 12-indexes.ts, export INDEXES, category "indexes")

1. `btree-page-anatomy` (`bt_metap`, `bt_page_stats`, `bt_page_items` on a 100k-row index):
   root/leaf levels, high keys.
2. `index-only-scan-needs-visibility-map` (cross-ref vacuum module).
3. `create-index-concurrently-and-invalid-indexes` (2 sessions): a concurrent build waits for an
   open transaction (`(blocks ...)`), and a failed one leaves `indisvalid = false`.
4. `partial-and-covering-indexes`: `include`, `where`, sizes and plans.
5. `index-bloat-from-churn`: updates + `pgstatindex` avg_leaf_density; `reindex concurrently`.
6. `unique-index-enforcement-under-concurrency` (cross-ref locking lesson 8): show
   `pg_stat_user_indexes` and why uniqueness is a btree property.

## 13 observability (file: 13-observability.ts, export OBSERVABILITY, category "observability")

1. `wait-events-tell-you-where-time-goes` (2 sessions): a blocked update shows `Lock:transactionid`;
   a sleeping one `Timeout:PgSleep`; an idle-in-transaction session.
2. `pg-stat-io-by-backend-type` (PG16): reads/writes/extends per context after a workload; the
   checkpointer's writes vs backend writes.
3. `connection-saturation` (shell): `max_connections` down to 10 via ALTER SYSTEM + restart? too
   heavy; instead open N psql via shell loop until `FATAL: sorry, too many clients already` (100
   default: set `max_connections=20` needs restart; acceptable, do it and restore). Lens:
   process-per-connection capacity; poolers.
4. `idle-in-transaction-kills-you` : `idle_in_transaction_session_timeout=2s` ->
   `FATAL:
   terminating connection due to idle-in-transaction timeout`; `statement_timeout`.
5. `table-and-index-usage-counters`: `pg_stat_user_tables` seq_scan vs idx_scan, `n_tup_*`,
   `pg_statio_user_tables` heap_blks_hit; reset and re-measure.
6. `read-the-server-log`: `log_lock_waits` lines from a real wait, `log_min_duration_statement`,
   checkpoint lines; tail via `\!`. Lens: logs as the ground truth for postmortems.

## 14 patterns (file: 14-patterns.ts, export PATTERNS, category "distributed-patterns")

1. `transactional-outbox` (privileged, shell). Source business/event atomicity with an actual killed
   uncommitted application; independent receiver receipt plus balance commit. Competing SKIP LOCKED
   claims commit briefly and leave no row locks during delivery. Kill a receiver client before
   commit and a real Python relay after receiver commit/before source acknowledgement. Controlled
   expiry permits new generations; stale acknowledgements fail, replay adds no duplicate credit, and
   full order/outbox/receipt payloads plus total18 survive normal restarts. Variation moves relay
   loss after the sent-marker commit, leaving only the other abandoned claim to recover.
2. `idempotency-keys` (privileged, shell). Reproduce the combined insert-or-select Read Committed
   snapshot race after an observed unique-conflict wait. A complete function uses a fresh SQL
   command for duplicate lookup and atomically commits request identity/payload, debit/history and
   saved answer. Concurrent duplicates apply once; changed payloads and insufficient funds fail
   without mutation. Actual caller loss before/after commit recovers through the same request key.
   Receipt deletion deliberately repeats a debit on an isolated account; in-place retirement retains
   the identity guard and refuses reexecution. Reconcile all balances, payloads and history through
   normal restart. Variation changes only the first winner from COMMIT to ROLLBACK.
3. `two-phase-commit` (dangerous, shell). Independently prepare debit/credit participants with
   stable GIDs, full outcome receipts and a registered operation. Observe actual blocked
   writers/null-PID locks,250 retained dead tuples and prepared-state recovery after a participant
   crash. A separate Python coordinator commits its SQLite FULL decision before finalization; kill
   it after A commits but before B, then recover B from COMMIT and verify both receipts/total200.
   Variation kills the coordinator before its decision commit; recovery first records ABORT, rolls
   back both participants and records zero-delta outcomes. Release locks/cleanup retention and prove
   repeated recovery is unchanged before and after normal restarts. Independent reads can see
   partial finalization.
4. `optimistic-concurrency-with-version-columns`: `update ... where version = :v` returning 0 rows
   as the conflict signal, vs `for update`.
5. `fencing-tokens-with-a-monotonic-counter` (privileged, shell). Actual restricted worker logins
   receive issued epochs and write through non-login-owned SECURITY DEFINER interfaces. Compare
   claim takeover with resource acceptance: A's old token still works before B's new resource fence
   commits. Race A against B's held update; B COMMIT fences A, while the rollback variation admits A
   before a fresh B fence. Require explicit tokens, reject forged/other-worker tokens, and verify
   direct writes, history/issuance forgery, schema creation, role escalation and temporary-table
   redirection fail. Reconcile full accepted history through restart. The issuer counter represents
   an authorized handoff, not lease expiry or election; same-epoch writes still need idempotency.
6. `listen-notify-as-a-bus` (privileged, shell). Commit LISTEN before a fresh durable scan; vary
   publication immediately before/after registration commit. A row trigger ties work and generic
   wake-ups to publisher commit/rollback; two jobs in one transaction produce one wake-up. Kill the
   actual listener after local credit/receipt/completion execute but before commit, then publish
   while it is absent. Reconnect/register and recover all five pending jobs despite only one new
   wake-up; redundant wake-ups and bounded polls add no effects. Match all six job/receipt payloads
   and total72 through normal restart. Notifications guide scans; they are not the work inventory.

## 15 incidents (file: 15-incidents.ts, export INCIDENTS, category "reliability") SERIAL

1. `abandoned-slot-fills-the-disk`: create slot, never consume, generate WAL, watch pg_wal grow
   against `max_slot_wal_keep_size`; recover by dropping the slot; log lines.
2. `corrupt-a-page-and-detect-it` (dangerous, shell): `dd` zeros/garbage into a block of a lab
   table's file (server stopped), start, select -> `ERROR: invalid page in block` (checksums);
   `pg_checksums --check`; recover with `pg_surgery` or `zero_damaged_pages` and from backup.
3. `wraparound-drill` (dangerous): use `vacuum_failsafe_age` and a synthetic approach: you cannot
   burn 2 billion xids; instead demonstrate the warning path by setting `autovacuum_freeze_max_age`
   low on a table and observing anti-wraparound autovacuum (`pg_stat_progress_vacuum`, log "to
   prevent wraparound"). Honest about limits.
4. `runaway-query-and-cancel`: `pg_cancel_backend` vs `pg_terminate_backend`, what the client sees,
   `pg_stat_activity` after.
5. `postmortem-from-the-log`: given the lab's log, reconstruct the timeline of the crash in module
   07 and the failover in module 09 using only log lines and LSNs.
