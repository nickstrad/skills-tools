# PostgreSQL 14 Internals (Egor Rogov) — chapter digest for course authors

Source: `docs/books/postgresql-14-internals/postgresql_internals-14_en.pdf`
(English edition, translated by Liudmila Mantrova, Postgres Professional
2022–2023, ISBN 978-5-6045970-4-0, 548 PDF pages, 548 = 540 numbered pages +
front matter). All page numbers below are the book's printed page numbers. All
examples in the book run on PostgreSQL 14.7; a margin mark "v. NN" flags
features that appeared in a later or earlier version.

The book is organised as an introductory chapter plus five Parts. Chapter
numbers are global (1–29); section numbers are `chapter.section`. Sub-headings
without numbers are the book's own run-in headings inside a section.

---

## 1. Table of contents (verbatim from the book's TOC)

**About This Book** — 15

**1 Introduction** — 20

- 1.1 Data Organization — 20: Databases 20 · System Catalog 21 · Schemas 22 ·
  Tablespaces 22 · Relations 24 · Files and Forks 24 · Pages 28 · TOAST 28
- 1.2 Processes and Memory — 33
- 1.3 Clients and the Client-Server Protocol — 34

### Part I — Isolation and MVCC (37)

**2 Isolation** — 39

- 2.1 Consistency — 39
- 2.2 Isolation Levels and Anomalies in SQL Standard — 41: Lost Update 41 ·
  Dirty Reads and Read Uncommitted 42 · Non-Repeatable Reads and Read Committed
  42 · Phantom Reads and Repeatable Read 42 · No Anomalies and Serializable 43 ·
  Why These Anomalies? 43
- 2.3 Isolation Levels in PostgreSQL — 44: Read Committed 45 · Repeatable Read
  52 · Serializable 58
- 2.4 Which Isolation Level to Use? — 61

**3 Pages and Tuples** — 62

- 3.1 Page Structure — 62: Page Header 62 · Special Space 63 · Tuples 63 · Item
  Pointers 63 · Free Space 64
- 3.2 Row Version Layout — 64
- 3.3 Operations on Tuples — 66: Insert 67 · Commit 70 · Delete 72 · Abort 72 ·
  Update 73
- 3.4 Indexes — 74
- 3.5 TOAST — 74
- 3.6 Virtual Transactions — 75
- 3.7 Subtransactions — 76: Savepoints 76 · Errors and Atomicity 78

**4 Snapshots** — 80

- 4.1 What is a Snapshot? — 80
- 4.2 Row Version Visibility — 81
- 4.3 Snapshot Structure — 82
- 4.4 Visibility of Transactions' Own Changes — 86
- 4.5 Transaction Horizon — 87
- 4.6 System Catalog Snapshots — 89
- 4.7 Exporting Snapshots — 90

**5 Page Pruning and HOT Updates** — 92

- 5.1 Page Pruning — 92
- 5.2 HOT Updates — 95
- 5.3 Page Pruning for HOT Updates — 98
- 5.4 HOT Chain Splits — 99
- 5.5 Page Pruning for Indexes — 101

**6 Vacuum and Autovacuum** — 102

- 6.1 Vacuum — 102
- 6.2 Database Horizon Revisited — 104
- 6.3 Vacuum Phases — 107: Heap Scan 107 · Index Vacuuming 107 · Heap Vacuuming
  108 · Heap Truncation 108
- 6.4 Analysis — 109
- 6.5 Automatic Vacuum and Analysis — 109: About the Autovacuum Mechanism 110 ·
  Which Tables Need to be Vacuumed? 111 · Which Tables Need to Be Analyzed? 113
  · Autovacuum in Action 113
- 6.6 Managing the Load — 117: Vacuum Throttling 117 · Autovacuum Throttling 118
- 6.7 Monitoring — 119: Monitoring Vacuum 119 · Monitoring Autovacuum 121

**7 Freezing** — 123

- 7.1 Transaction ID Wraparound — 123
- 7.2 Tuple Freezing and Visibility Rules — 124
- 7.3 Managing Freezing — 127: Minimal Freezing Age 127 · Age for Aggressive
  Freezing 129 · Age for Forced Autovacuum 131 · Age for Failsafe Freezing 132
- 7.4 Manual Freezing — 132: Freezing by Vacuum 133 · Freezing Data at the
  Initial Loading 133

**8 Rebuilding Tables and Indexes** — 135

- 8.1 Full Vacuuming — 135: Why is Routine Vacuuming not Enough? 135 ·
  Estimating Data Density 136 · Freezing 139
- 8.2 Other Rebuilding Methods — 140: Alternatives to Full Vacuuming 140 ·
  Reducing Downtime During Rebuilding 140
- 8.3 Precautions — 141: Read-Only Queries 141 · Data Updates 142

### Part II — Buffer Cache and WAL (145)

**9 Buffer Cache** — 147

- 9.1 Caching — 147
- 9.2 Buffer Cache Design — 148
- 9.3 Cache Hits — 149
- 9.4 Cache Misses — 153: Buffer Search and Eviction 154
- 9.5 Bulk Eviction — 156
- 9.6 Choosing the Buffer Cache Size — 158
- 9.7 Cache Warming — 161
- 9.8 Local Cache — 163

**10 Write-Ahead Log** — 164

- 10.1 Logging — 164
- 10.2 WAL Structure — 165: Logical Structure 165 · Physical Structure 168
- 10.3 Checkpoint — 170
- 10.4 Recovery — 173
- 10.5 Background Writing — 176
- 10.6 WAL Setup — 177: Configuring Checkpoints 177 · Configuring Background
  Writing 179 · Monitoring 179

**11 WAL Modes** — 182

- 11.1 Performance — 182
- 11.2 Fault Tolerance — 185: Caching 186 · Data Corruption 187 · Non-Atomic
  Writes 189
- 11.3 WAL Levels — 191: Minimal 192 · Replica 193 · Logical 196

### Part III — Locks (197)

**12 Relation-Level Locks** — 199

- 12.1 About Locks — 199
- 12.2 Heavyweight Locks — 201
- 12.3 Locks on Transaction IDs — 202
- 12.4 Relation-Level Locks — 204
- 12.5 Wait Queue — 206

**13 Row-Level Locks** — 210

- 13.1 Lock Design — 210
- 13.2 Row-Level Locking Modes — 211: Exclusive Modes 211 · Shared Modes 213
- 13.3 Multitransactions — 213
- 13.4 Wait Queue — 215: Exclusive Modes 215 · Shared Modes 221
- 13.5 No-Wait Locks — 224
- 13.6 Deadlocks — 225: Deadlocks by Row Updates 227 · Deadlocks Between Two
  UPDATE Statements 228

**14 Miscellaneous Locks** — 231

- 14.1 Non-Object Locks — 231
- 14.2 Relation Extension Locks — 232
- 14.3 Page Locks — 233
- 14.4 Advisory Locks — 234
- 14.5 Predicate Locks — 235

**15 Locks on Memory Structures** — 240

- 15.1 Spinlocks — 240
- 15.2 Lightweight Locks — 240
- 15.3 Examples — 241: Buffer Cache 241 · WAL Buffers 242
- 15.4 Monitoring Waits — 243
- 15.5 Sampling — 245

### Part IV — Query Execution (249)

**16 Query Execution Stages** — 251

- 16.1 Demo Database — 251
- 16.2 Simple Query Protocol — 252: Parsing 254 · Transformation 255 · Planning
  257 · Execution 264
- 16.3 Extended Query Protocol — 266: Preparation 266 · Parameter Binding 267 ·
  Planning and Execution 267 · Getting the Results 270

**17 Statistics** — 271

- 17.1 Basic Statistics — 271
- 17.2 NULL Values — 274
- 17.3 Distinct Values — 276
- 17.4 Most Common Values — 277
- 17.5 Histogram — 279
- 17.6 Statistics for Non-Scalar Data Types — 283
- 17.7 Average Field Width — 284
- 17.8 Correlation — 284
- 17.9 Expression Statistics — 285: Extended Expression Statistics 286 ·
  Statistics for Expression Indexes 287
- 17.10 Multivariate Statistics — 288: Functional Dependencies Between Columns
  288 · Multivariate Number of Distinct Values 290 · Multivariate MCV Lists 291

**18 Table Access Methods** — 294

- 18.1 Pluggable Storage Engines — 294
- 18.2 Sequential Scans — 296: Cost Estimation 296
- 18.3 Parallel Plans — 300
- 18.4 Parallel Sequential Scans — 301: Cost Estimation 301
- 18.5 Parallel Execution Limitations — 305: Number of Background Workers 305 ·
  Non-Parallelizable Queries 308 · Parallel Restricted Queries 309

**19 Index Access Methods** — 313

- 19.1 Indexes and Extensibility — 313
- 19.2 Operator Classes and Families — 315: Operator Classes 315 · Operator
  Families 320
- 19.3 Indexing Engine Interface — 322: Access Method Properties 322 ·
  Index-Level Properties 326 · Column-Level Properties 327

**20 Index Scans** — 330

- 20.1 Regular Index Scans — 330: Cost Estimation 331 · Good Scenario: High
  Correlation 331 · Bad Scenario: Low Correlation 334
- 20.2 Index-Only Scans — 337: Indexes with the Include Clause 339
- 20.3 Bitmap Scans — 340: Bitmap Accuracy 342 · Operations on Bitmaps 343 ·
  Cost Estimation 343
- 20.4 Parallel Index Scans — 347
- 20.5 Comparison of Various Access Methods — 348

**21 Nested Loop** — 350

- 21.1 Join Types and Methods — 350
- 21.2 Nested Loop Joins — 351: Cartesian Product 352 · Parameterized Joins 355
  · Caching Rows (Memoization) 359 · Outer Joins 362 · Anti- and Semi-joins 363
  · Non-Equi-joins 365 · Parallel Mode 366

**22 Hashing** — 367

- 22.1 Hash Joins — 367: One-Pass Hash Joins 367 · Two-Pass Hash Joins 372 ·
  Dynamic Adjustments 374 · Hash Joins in Parallel Plans 377 · Parallel One-Pass
  Hash Joins 378 · Parallel Two-Pass Hash Joins 380 · Modifications 382
- 22.2 Distinct Values and Grouping — 384

**23 Sorting and Merging** — 387

- 23.1 Merge Joins — 387: Merging Sorted Sets 387 · Parallel Mode 390 ·
  Modifications 391
- 23.2 Sorting — 392: Quicksort 393 · Top-N Heapsort 394 · External Sorting 396
  · Incremental Sorting 399 · Parallel Mode 401
- 23.3 Distinct Values and Grouping — 403
- 23.4 Comparison of Join Methods — 405

### Part V — Types of Indexes (409)

**24 Hash** — 411

- 24.1 Overview — 411
- 24.2 Page Layout — 412
- 24.3 Operator Class — 417
- 24.4 Properties — 418: Access Method Properties 419 · Index-Level Properties
  419 · Column-Level Properties 420

**25 B-tree** — 421

- 25.1 Overview — 421
- 25.2 Search and Insertions — 422: Search by Equality 422 · Search by
  Inequality 423 · Search by Range 424 · Insertions 425
- 25.3 Page Layout — 426: Deduplication 429 · Compact Storage of Inner Index
  Entries 431
- 25.4 Operator Class — 432: Comparison Semantics 432 · Multicolumn Indexes and
  Sorting 437
- 25.5 Properties — 441: Access Method Properties 441 · Index-Level Properties
  442 · Column-Level Properties 443

**26 GiST** — 444

- 26.1 Overview — 444
- 26.2 R-Trees for Points — 445: Page Layout 447 · Operator Class 448 · Search
  for Contained Elements 450 · Nearest Neighbor Search 452 · Insertion 456 ·
  Exclusion Constraints 457 · Properties 459
- 26.3 RD-Trees for Full-Text Search — 462: About Full-Text Search 462 ·
  Indexing tsvector Data 463 · Properties 469
- 26.4 Other Data Types — 470

**27 SP-GiST** — 472

- 27.1 Overview — 472
- 27.2 Quadtrees for Points — 473: Operator Class 475 · Page Layout 477 · Search
  479 · Insertion 480 · Properties 482
- 27.3 K-Dimensional Trees for Points — 483
- 27.4 Radix Trees for Strings — 485: Operator Class 486 · Search 487 ·
  Insertion 489 · Properties 490
- 27.5 Other Data Types — 490

**28 GIN** — 492

- 28.1 Overview — 492
- 28.2 Index for Full-Text Search — 493: Page Layout 494 · Operator Class 496 ·
  Search 497 · Frequent and Rare Lexemes 499 · Insertions 501 · Limiting Result
  Set Size 503 · Properties 505 · GIN Limitations and RUM Index 506
- 28.3 Trigrams — 507
- 28.4 Indexing Arrays — 508
- 28.5 Indexing JSON — 511: jsonb_ops Operator Class 512 · jsonb_path_ops
  Operator Class 514
- 28.6 Indexing Other Data Types — 516

**29 BRIN** — 517

- 29.1 Overview — 517
- 29.2 Example — 518
- 29.3 Page Layout — 519
- 29.4 Search — 521
- 29.5 Summary Information Updates — 522: Value Insertion 522 · Range
  Summarization 522
- 29.6 Minmax Classes — 523: Choosing Columns to be Indexed 525 · Range Size and
  Search Efficiency 525 · Properties 528
- 29.7 Minmax-Multi Classes — 530
- 29.8 Inclusion Classes — 533
- 29.9 Bloom Classes — 536

**Conclusion** — 540 · **Index** — 541

---

## 2. What each chapter actually covers

Notation: _commands_ are SQL/CLI, `identifiers` are functions, views, catalogs,
extensions and parameters that the chapter uses in its examples or explains in
prose.

### 1 Introduction (pp. 20–36)

A whistle-stop tour of physical layout and the process model, meant as shared
vocabulary for the rest of the book. 1.1 walks from the cluster (`PGDATA`,
`template0`/`template1`/`postgres`) through the system catalog (`pg_class`,
`pg_attribute`, `pg_database`, `pg_index`, `pg_catalog`, `pg_toast`, `pg_temp`
schemas), tablespaces (`pg_default`, `pg_global`, `PGDATA/pg_tblspc`),
relations, and **files and forks**: the main fork, free space map (`_fsm`),
visibility map (`_vm`) and init fork of `CREATE UNLOGGED TABLE`, located with
`pg_relation_filepath` and sized with `pg_stat_file`; then 8 KB pages and
**TOAST** (the four strategies, `toast_tuple_target`, `reltoastrelid`,
`\d+ pg_toast.pg_toast_NNN`). 1.2 names the postmaster and the background
processes (startup, autovacuum, wal writer, checkpointer, writer/bgwriter, stats
collector, wal sender, wal receiver), shared memory and the double caching with
the OS cache, and the WAL as the crash-recovery mechanism. 1.3 covers
one-backend-per-connection, why that needs connection pooling (PgBouncer,
Odyssey), `libpq` and the wire protocol, and authentication. No introspection
extensions yet.

### 2 Isolation (pp. 39–61)

User-visible transaction semantics, done with two psql sessions on an `accounts`
table. 2.2 defines the SQL-standard anomalies (lost update, dirty read,
non-repeatable read, phantom) and the four levels. 2.3 shows what PostgreSQL
really does at each level with `BEGIN ISOLATION LEVEL ...` /
`default_transaction_isolation`: Read Committed (per-statement snapshots, read
skew, lost update even with re-read of a locked row, inconsistent reads),
Repeatable Read (serialization failure `40001` instead of lost update, then the
two anomalies snapshot isolation still allows: **write skew** and the read-only
transaction anomaly), and Serializable (SSI; `DEFERRABLE` read-only
transactions; the need to retry). 2.4 gives practical advice on level choice.
Uses `pg_sleep` for races; no catalog views or extensions.

### 3 Pages and Tuples (pp. 62–79)

The physical MVCC representation, watched with `pageinspect`. 3.1 dissects a
page: header, special space, tuples, **item pointers** (line pointers) and free
space, via `get_raw_page`, `page_header`, `heap_page_items`. 3.2 explains the
tuple header: `xmin`, `xmax`, `t_infomask`/`t_infomask2` (with
`heap_tuple_infomask_flags`), `t_ctid`, null bitmap, alignment padding. 3.3 runs
INSERT / COMMIT / DELETE / ABORT / UPDATE and shows the header bits after each
step, using `pg_current_xact_id`, `pg_current_xact_id_if_assigned`; this is
where the **commit log (clog)** in `PGDATA/pg_xact` (formerly `pg_clog`) and the
hint bits (`xmin_committed`, `xmin_aborted`, ...) are explained. 3.4 peeks at an
index page with `bt_page_items`; 3.5 shows TOAST chunks carry no versioning of
their own; 3.6 covers virtual transaction IDs; 3.7 covers savepoints,
`pg_subtrans`, and why an error inside a transaction forces a rollback ("Errors
and Atomicity").

### 4 Snapshots (pp. 80–91)

How visibility is decided. 4.1–4.3 define a snapshot as `xmin`, `xmax`, `xip`
(in-progress list) and print it with `pg_current_snapshot()`; visibility rules
for a tuple's xmin/xmax against the snapshot; `ProcArray` in shared memory. 4.4
explains command IDs (`cmin`/`cmax`, combo cids) and seeing one's own changes.
4.5 introduces the **transaction (database) horizon**: `backend_xmin` in
`pg_stat_activity`, `pg_backend_pid`, why a long transaction pins dead tuples
and causes bloat. 4.6 explains that catalog reads use fresh snapshots; 4.7
covers `pg_export_snapshot` / `SET TRANSACTION SNAPSHOT` (used by parallel
`pg_dump`). Mentions `track_commit_timestamp`.

### 5 Page Pruning and HOT Updates (pp. 92–101)

Intra-page cleanup. 5.1: `fillfactor` as a storage parameter, page pruning
triggered on reads/updates when the page is over fillfactor, dead vs redirect
line pointers seen with `heap_page_items` (`lp_flags`). 5.2: Heap-Only Tuple
updates (same page, no indexed column changed), HOT chains, and that no index
entry is written; verified with a helper over `bt_page_items`. 5.3–5.4: pruning
inside a HOT chain and chain splits when the page fills up. 5.5: B-tree's own
"pruning" (simple deletion of known-dead entries and bottom-up deletion before a
page split) and why index bloat cannot shrink. Uses `EXPLAIN (analyze)` to show
heap fetches.

### 6 Vacuum and Autovacuum (pp. 102–122)

Routine cleanup. 6.1 runs `VACUUM VERBOSE` and checks the visibility map with
the `pg_visibility` extension (`pg_visibility_map`). 6.2 re-examines the horizon
(`backend_xmin`, `pg_stat_activity`). 6.3 describes the phases (heap scan, index
vacuuming, heap vacuuming, heap truncation; `maintenance_work_mem`,
`vacuum_truncate`, `min_parallel_index_scan_size`). 6.4 is `ANALYZE`. 6.5 covers
the autovacuum launcher/workers (`autovacuum_naptime`, `autovacuum_max_workers`,
`autovacuum_work_mem`, `track_counts`), the thresholds
(`autovacuum_vacuum_threshold` / `_scale_factor`, `_vacuum_insert_*`,
`_analyze_*`, per-table `autovacuum_enabled`) computed against
`n_dead_tup`/`n_mod_since_analyze` in `pg_stat_all_tables`, and a live demo. 6.6
is cost-based throttling (`vacuum_cost_delay/limit`,
`vacuum_cost_page_hit/miss/dirty`, `autovacuum_vacuum_cost_*`). 6.7 monitors
with `pg_stat_progress_vacuum`, `pg_stat_progress_analyze`, `pg_stat_all_tables`
(`last_vacuum`, `last_autovacuum`), `log_autovacuum_min_duration`.

### 7 Freezing (pp. 123–134)

Transaction ID wraparound and its cure. 7.1 explains 32-bit xids, modulo-2^31
comparison and `age()`. 7.2 shows frozen tuples with `heap_page_items`
(`t_infomask` bits) and `pg_visibility_map` `all_frozen`, and the visibility
rules for frozen rows; `relfrozenxid` in `pg_class`, `datfrozenxid` in
`pg_database`. 7.3 walks the four ages: `vacuum_freeze_min_age`,
`vacuum_freeze_table_age` (aggressive), `autovacuum_freeze_max_age` (forced
autovacuum), `vacuum_failsafe_age`; also `vacuum_index_cleanup`. 7.4 covers
`VACUUM FREEZE` and `COPY ... FREEZE`. Uses `pageinspect`, `pg_visibility`,
`ALTER SYSTEM`, `pg_reload_conf`.

### 8 Rebuilding Tables and Indexes (pp. 135–144)

When plain vacuum is not enough. 8.1 explains `VACUUM FULL` (rewrites table and
indexes, takes Access Exclusive, needs double disk space), estimates density
with the `pgstattuple` extension (`pgstattuple`, `pgstatindex`),
`pg_table_size`, `pg_indexes_size`, `pg_relation_filepath`, watches it with
`pg_stat_progress_cluster`, and shows it advances `relfrozenxid`. 8.2 lists
`CLUSTER`, `REINDEX`, `TRUNCATE` and low-downtime tools (`pg_repack`,
pgcompacttable). 8.3 gives precautions: long read-only transactions and the
horizon, `old_snapshot_threshold`, `idle_in_transaction_session_timeout`, and
batching mass updates with `SELECT ... FOR UPDATE SKIP LOCKED`.

### 9 Buffer Cache (pp. 147–163)

Shared buffers in depth. 9.2 describes buffer headers, the hash table, pins and
usage counts. 9.3 installs `pg_buffercache` and reads hits with
`EXPLAIN (analyze, buffers)` (`shared hit=`/`read=`), `pg_relation_filenode`.
9.4 covers misses, the free list and the **clock sweep** eviction algorithm. 9.5
covers buffer rings for bulk reads/writes (seq scans of big tables, `VACUUM`,
`COPY`/bulk writes). 9.6 discusses `shared_buffers` sizing using usage-count
histograms from `pg_buffercache` and `pg_statio_all_tables`. 9.7 covers
`pg_prewarm` and `autoprewarm` (`shared_preload_libraries`,
`pg_prewarm.autoprewarm_interval`). 9.8 covers the local cache for temporary
tables (`temp_buffers`, `Buffers: local hit`). Also `track_io_timing`,
`pg_ctl restart`.

### 10 Write-Ahead Log (pp. 164–181)

WAL mechanics and checkpoints. 10.1 states the rule (log before data). 10.2:
logical structure (records, LSNs, `pg_lsn` type, `pg_current_wal_insert_lsn`,
`pg_current_wal_lsn`, `wal_buffers`) and physical structure (`PGDATA/pg_wal`, 16
MB segments, `wal_segment_size`, segment names incl. the timeline prefix,
`pg_walfile_name_offset`, `pg_ls_waldir`). 10.3: what the checkpointer does, the
redo point, `pg_control` shown with `pg_controldata`, records shown with
`pg_waldump -p -s -e`. 10.4: crash recovery by the startup process
(`pg_ctl stop -m immediate`, "redo starts at / redo done at" log lines,
full-page images applied, init forks of unlogged tables, `backup_label`
mention). 10.5: bgwriter. 10.6: `checkpoint_timeout`, `max_wal_size`,
`min_wal_size`, `checkpoint_completion_target`, `wal_keep_size`,
`bgwriter_delay`, `bgwriter_lru_maxpages`, `bgwriter_lru_multiplier`,
`checkpoint_warning`, `log_checkpoints`, and `pg_stat_bgwriter`
(`checkpoints_timed`, `checkpoints_req`, `buffers_backend_fsync`...).

### 11 WAL Modes (pp. 182–196)

Trading durability for speed, and what the WAL contains. 11.1:
`synchronous_commit` (on/off/local/remote_*), the walwriter (`wal_writer_delay`,
`wal_writer_flush_after`), `commit_delay`/`commit_siblings`, measured with
`pgbench`. 11.2: OS/controller caches and `fsync`, `wal_sync_method`,
`pg_test_fsync`; data corruption, page checksums (`data_checksums`,
`pg_checksums`, `ignore_checksum_failure`), a deliberate corruption demo; torn
pages and `full_page_writes`, `wal_compression`, `wal_log_hints`, sized with
`pg_waldump --stats`. 11.3: `wal_level` minimal (skips logging of bulk loads
into new relations, `wal_skip_threshold`, requires `max_wal_senders = 0`),
replica (needed for backup recovery and physical replication; standby snapshot
records written by bgwriter) and logical (enables logical decoding/replication)
— each level's extra records shown with `pg_waldump`. This is the only place the
book touches replication.

### 12 Relation-Level Locks (pp. 199–209)

Heavyweight locks. 12.1–12.2: lock types (`pg_locks` `locktype` values),
`max_locks_per_transaction`, `max_connections`. 12.3: every transaction holds an
exclusive lock on its own `transactionid` and `virtualxid`; waiting on another
transaction is done by requesting a share lock on its xid. 12.4: the eight
relation modes and their conflict table (`LOCK TABLE`, `CREATE INDEX` vs
`CREATE INDEX CONCURRENTLY` (Share Update Exclusive), `ALTER TABLE` flavours,
`VACUUM FULL`/`DROP`/`TRUNCATE` = Access Exclusive). 12.5: the fair wait queue
demonstrated with an UPDATE, a `CREATE INDEX` and a `VACUUM FULL` queuing behind
each other; `pg_blocking_pids`, `pg_backend_pid`, `wait_event_type` in
`pg_stat_activity`.

### 13 Row-Level Locks (pp. 210–230)

Locks stored in tuples. 13.1: a row lock is `xmax` plus infomask bits, no
shared-memory table. 13.2: `FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE`,
`FOR KEY SHARE` and their relation to foreign keys. 13.3: multixacts
(`pg_multixact`, `xmax_is_multi`, freezing of multixact ids:
`vacuum_multixact_*`, `autovacuum_multixact_freeze_max_age`,
`vacuum_multixact_failsafe_age`). 13.4: the wait queue for exclusive and shared
modes, inspected with the `pgrowlocks` extension, `pg_locks` tuple locks,
`pg_blocking_pids`, `pg_stat_activity` `wait_event`, `heap_page_items`,
`txid_current`. 13.5: `NOWAIT`, `SKIP LOCKED`, `lock_timeout` vs
`statement_timeout`. 13.6: deadlock detection (`deadlock_timeout`,
`ERROR: deadlock detected`), deadlocks between row updates and between two
single `UPDATE` statements.

### 14 Miscellaneous Locks (pp. 231–239)

The rest of the heavyweight lock family. 14.1: locks on non-relation objects
(databases, tablespaces, roles), `object` lock type. 14.2: relation extension
locks. 14.3: page locks (used by GIN). 14.4: advisory locks —
`pg_advisory_lock`, `pg_advisory_xact_lock`, `pg_try_*`, `pg_advisory_unlock*`,
`locktype = 'advisory'` in `pg_locks`. 14.5: **predicate locks** for SSI —
`SIReadLock` rows in `pg_locks`, tuple/page/relation granularity,
`max_pred_locks_per_transaction`, `_per_relation`, `_per_page`, and how
rw-dependencies cause serialization failures (revisits write skew and the
read-only anomaly from Chapter 2).

### 15 Locks on Memory Structures (pp. 240–248)

Low-level synchronization. 15.1: spinlocks (compare-and-swap, no
instrumentation). 15.2: lightweight locks (shared/exclusive, tranches). 15.3:
worked examples in the buffer cache (buffer header spinlock, `BufferMapping`
partitions, buffer content locks, buffer strategy lock) and WAL buffers
(`WALBufMapping`, `WALWrite`, the eight `WALInsert` locks, insert position
spinlock). 15.4: **monitoring waits** — `log_lock_waits`, `pg_stat_activity`
`wait_event_type` / `wait_event`, the wait classes, `backend_type`. 15.5:
sampling with the third-party `pg_wait_sampling` extension
(`pg_wait_sampling_profile`, `profile_period`) under `pgbench`; explains why WAL
flush waits dominate.

### 16 Query Execution Stages (pp. 251–270)

From SQL text to rows, using the "bookings" demo database (16.1). 16.2 simple
query protocol: parsing, transformation (view expansion via `pg_rewrite`),
planning — plan tree, cardinality and cost estimation, `EXPLAIN`,
`join_collapse_limit`, `from_collapse_limit`, `geqo_threshold`,
`cursor_tuple_fraction` — and execution (portal, pull-based node tree,
`work_mem` per node, temp files). 16.3 extended query protocol:
`PREPARE`/`EXECUTE`, `pg_prepared_statements`, parameter binding, custom vs
generic plans and the five-execution rule, `plan_cache_mode`.

### 17 Statistics (pp. 271–293)

Everything the planner knows. `ANALYZE`, `default_statistics_target`,
`pg_class.reltuples/relpages/relallvisible`, `pg_statistic` and the `pg_stats`
view: `null_frac`, `n_distinct`, `most_common_vals`/`most_common_freqs`,
`histogram_bounds`, `most_common_elems` (arrays), `avg_width`, `correlation`.
Expression statistics via `CREATE STATISTICS ... (expression)` and expression
indexes; multivariate statistics (`dependencies`, `ndistinct`, `mcv`) in
`pg_statistic_ext`, `pg_statistic_ext_data`, `pg_stats_ext`,
`pg_mcv_list_items`. Every section pairs a selectivity formula with an `EXPLAIN`
row estimate.

### 18 Table Access Methods (pp. 294–312)

18.1: the `pg_am` table-AM interface, `default_table_access_method`, zheap.
18.2: sequential scan cost (`seq_page_cost`, `cpu_tuple_cost`,
`cpu_operator_cost`) reproduced by hand from `pg_class`. 18.3–18.5: **parallel
query** — Gather, leader participation (`parallel_leader_participation`),
parallel seq scan cost (`parallel_setup_cost`, `parallel_tuple_cost`,
`min_parallel_table_scan_size`), worker limits (`max_worker_processes`,
`max_parallel_workers`, `max_parallel_workers_per_gather`, per-table
`parallel_workers`), non-parallelizable and parallel-restricted queries,
`force_parallel_mode`. `EXPLAIN (analyze)` shows "Workers Planned/Launched".

### 19 Index Access Methods (pp. 313–329)

The indexing engine's contract. `pg_am` with `amhandler`; operator classes and
families (`pg_opclass`, `pg_opfamily`, `pg_amop`, `pg_amproc`,
`CREATE INDEX ... USING`); properties queried with `pg_indexam_has_property`,
`pg_index_has_property`, `pg_index_column_has_property` (can_order, can_unique,
can_multi_col, can_exclude, can_include; clusterable, index_scan, bitmap_scan,
backward_scan; asc/desc/nulls_first, orderable, distance_orderable, returnable,
search_array, search_nulls). Shows `INCLUDE` columns on a unique index and
**partial indexes** (`CREATE INDEX ... WHERE`). Notes that predicate-lock
support and `CONCURRENTLY` builds are not interface properties.

### 20 Index Scans (pp. 330–349)

20.1: regular index scan cost with `random_page_cost`, `effective_cache_size`,
`cpu_index_tuple_cost`, and how `correlation` in `pg_stats` makes the good/bad
scenarios. 20.2: **index-only scans** — `relallvisible`, "Heap Fetches" in
`EXPLAIN (analyze)`, `VACUUM` to set the visibility map, `INCLUDE` covering
indexes. 20.3: bitmap index/heap scans, exact vs lossy pages under `work_mem`,
`BitmapAnd`/`BitmapOr`, `effective_io_concurrency`. 20.4: parallel index and
index-only scans. 20.5: a seq-vs-index-vs-bitmap cost comparison as selectivity
changes (`enable_seqscan`, `enable_bitmapscan`).

### 21 Nested Loop (pp. 350–366)

Join taxonomy (21.1) and the nested loop join (21.2): Cartesian product cost,
parameterized inner index scans, Memoize (`enable_memoize`), outer/anti/semi
joins, non-equi joins (uses the `earthdistance` extension for a demo), parallel
nested loop. Everything is read off `EXPLAIN (analyze)` plans against the
bookings database.

### 22 Hashing (pp. 367–386)

22.1: hash join in one pass and two passes (batches spilled to temp files),
`work_mem` and `hash_mem_multiplier`, "Batches"/"Memory Usage" in
`EXPLAIN (analyze)`, dynamic batch increase, parallel hash joins
(`enable_parallel_hash`), outer/semi/anti modifications. 22.2: `HashAggregate`
for `DISTINCT`/`GROUP BY` and its spill, `log_temp_files`, `temp_file_limit`.

### 23 Sorting and Merging (pp. 387–408)

23.1: merge join over sorted inputs, parallel merge, outer/anti/semi forms.
23.2: **sorting** algorithms as chosen by `work_mem` — quicksort, top-N heapsort
for `LIMIT`, external merge sort with temp files, incremental sort, parallel
sort. 23.3: `Unique`/`GroupAggregate`. 23.4: cost comparison of nested loop vs
hash vs merge (`enable_hashjoin`, `enable_mergejoin`).

### 24 Hash (pp. 411–420)

The hash access method: metapage, bucket, overflow and bitmap pages seen with
`pageinspect` (`hash_metapage_info`, `hash_page_stats`), the operator class
(hash functions in `pg_amproc`), and its properties (no ordering, no unique, no
index-only scan).

### 25 B-tree (pp. 421–443)

`btree` internals: search by equality/inequality/range descending from the root,
insertion and page splits; page layout read with `bt_metap` and `bt_page_items`
(high keys, sibling links, **deduplication** posting lists, suffix truncation of
inner entries); operator class comparison semantics, collations, multicolumn
indexes and sort order; full property list. Nothing on
`CREATE INDEX CONCURRENTLY`, `REINDEX` or `amcheck`.

### 26 GiST (pp. 444–471)

Generalized search trees: R-trees for points (`gist_page_items`,
consistent/union/penalty/picksplit support functions, containment search, k-NN
ordering by `<->`, insertion, `EXCLUDE` constraints), RD-trees for `tsvector`
full-text search (`default_text_search_config`), and other types via
`btree_gist`, `cube`, `hstore`, `intarray`, `ltree`, `pg_trgm`.

### 27 SP-GiST (pp. 472–491)

Space-partitioned trees: quadtrees and k-d trees for points, radix trees for
strings; operator classes, page layout, search and insertion for each;
properties; other types (`pg_trgm` mention).

### 28 GIN (pp. 492–516)

Inverted indexes: full-text search layout (entry tree, posting lists/trees,
`gin_metapage_info`, `gin_page_opaque_info`, `gin_leafpage_items`), search with
frequent/rare lexemes, the pending list (`fastupdate`,
`gin_pending_list_limit`), `gin_fuzzy_search_limit`, GIN limits and the RUM
extension; then trigrams (`pg_trgm`), arrays, JSON (`jsonb_ops` vs
`jsonb_path_ops`), `btree_gin`.

### 29 BRIN (pp. 517–539)

Block-range indexes: `pages_per_range`, page layout (`brin_metapage_info`,
`brin_revmap_data`, `brin_page_items`), lossy bitmap search, summarization
(`brin_summarize_new_values`, `autosummarize`), and the operator-class families:
minmax, minmax-multi, inclusion, bloom (also the `bloom` extension is mentioned
in Chapter 19).

---

## 3. What the book does not cover

The preface ("About This Book", pp. 15–19) does not give an itemised exclusion
list. What it says is:

> "This book is not a collection of recipes. ... But this book is not a tutorial
> either. While delving deeply into some fields (in which I am more interested
> myself), it may say nothing at all about the other. By no means is this book a
> reference. ... In any unclear situation read the documentation."

> "I will not tell anything about how to install the server, enter psql
> commands, or set configuration parameters."

> "This book will not teach you how to develop the PostgreSQL core. ... this
> book is mainly intended for database administrators and application
> developers."

And, describing scope: "Part I ... isolation ... MVCC ... Part II describes
buffer cache and WAL, which is used to restore data consistency after a failure.
Part III ... locks. Part IV ... plans and executes SQL queries. Part V extends
the discussion of indexes."

Topics verified absent or only mentioned in passing (word search over the full
text):

- **Physical/streaming replication, standbys, failover, `pg_rewind`** — not
  covered. `wal_level = replica` and the standby snapshot records are explained
  (11.3), `max_wal_senders` is set to 0 for the minimal-level demo, and the
  walsender/walreceiver processes are named in 1.2. `pg_rewind` gets one
  sentence (p. 165). No `pg_stat_replication`, `primary_conninfo`,
  `hot_standby`, promotion, timelines beyond the segment-name prefix (p. 169),
  replication conflicts, or cascading.
- **Replication slots** (physical or logical) — zero occurrences.
- **Logical decoding / logical replication / publications / subscriptions /
  CDC** — one paragraph (11.3 "Logical", p. 196) saying the logical level
  enables them.
- **Backups, `pg_basebackup`, WAL archiving, `archive_command`,
  `restore_command`, PITR, recovery targets** — not covered. Backup recovery is
  mentioned as motivation for `wal_level = replica` (pp. 193–194),
  `backup_label` in one sentence (p. 174), and "WAL files that are yet to be
  replicated or handled by continuous archiving" as a disk-overflow risk (p.
  179). `pg_dump` appears only as the user of exported snapshots (4.7).
- **Two-phase commit / `PREPARE TRANSACTION`** — zero occurrences.
- **`pg_stat_statements`, `auto_explain`, `pg_stat_io`, `pg_stat_wal`,
  `pg_walinspect`, `pg_freespacemap`, `amcheck`, `pg_surgery`** — zero
  occurrences (`pg_stat_io`, `pg_stat_wal`, `pg_walinspect` postdate PG 14). The
  book uses `pg_waldump` where the course uses `pg_walinspect`.
- **`pg_cancel_backend` / `pg_terminate_backend`**, server log configuration
  (`log_min_duration_statement`, `log_line_prefix`), `pg_hba.conf`, SSL,
  roles/authentication — not covered (only `log_checkpoints`, `log_lock_waits`,
  `log_autovacuum_min_duration`, `log_temp_files` appear, each once, in their
  own chapter).
- **Declarative partitioning, foreign data wrappers, `postgres_fdw`, `dblink`,
  sharding** — not covered (partitioned tables get one sentence about unique
  indexes, p. 324).
- **LISTEN/NOTIFY, connection poolers** beyond a mention of PgBouncer/Odyssey
  (p. 35), `max_connections` capacity failures,
  `idle_in_transaction_session_timeout` beyond one bullet (p. 141).
- **`CREATE INDEX CONCURRENTLY` / `REINDEX CONCURRENTLY`** — only as lock modes
  in the 12.4 table and one paragraph on p. 205; no discussion of the
  multi-phase protocol or invalid indexes. `REINDEX` is one sentence in 8.2.
- **JIT, extended query protocol pipelining, cursors, triggers, PL/pgSQL, data
  types, full SQL semantics** — outside scope.
- **`pg_stat_user_tables` scan counters (`seq_scan`, `idx_scan`)** — not
  discussed; the book uses `pg_stat_all_tables` only for vacuum bookkeeping and
  `pg_statio_all_tables` for cache hits.
- **Checksum repair / corruption incident response** — the book shows how to
  detect corruption and `ignore_checksum_failure` (11.2) but not
  `pg_checksums --enable` or restoring from backup.

---

## 4. Where to look for ... (course topic → chapter/section)

| Course topic                                                                                                    | Where in the book                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process model, postmaster, backends, auxiliary processes                                                        | Ch 1 §1.2 "Processes and Memory" (p. 33); process list also visible in Ch 15 §15.4 (`backend_type` in `pg_stat_activity`, p. 244); autovacuum launcher/workers in Ch 6 §6.5; checkpointer, bgwriter, startup in Ch 10 §10.3–10.5; walwriter in Ch 11 §11.1 |
| Shared memory / buffer cache overview                                                                           | Ch 1 §1.2; full treatment Ch 9                                                                                                                                                                                                                             |
| Connections, one backend per client, pooling                                                                    | Ch 1 §1.3 "Clients and the Client-Server Protocol" (p. 34). `max_connections` exhaustion itself: not covered                                                                                                                                               |
| Files, forks (main, fsm, vm, init), relfilenode, `pg_relation_filepath`                                         | Ch 1 §1.1 "Files and Forks" (p. 24); `pg_relation_filenode` used in Ch 9 §9.3                                                                                                                                                                              |
| Pages and line (item) pointers                                                                                  | Ch 3 §3.1 "Page Structure" (p. 62)                                                                                                                                                                                                                         |
| Tuple header fields (xmin, xmax, infomask, ctid)                                                                | Ch 3 §3.2 "Row Version Layout" (p. 64) and §3.3 "Operations on Tuples" (p. 66)                                                                                                                                                                             |
| Heap page items via pageinspect (`get_raw_page`, `heap_page_items`, `page_header`, `heap_tuple_infomask_flags`) | Ch 3 §3.1–3.3; reused in Ch 5, 7, 13                                                                                                                                                                                                                       |
| TOAST                                                                                                           | Ch 1 §1.1 "TOAST" (p. 28); Ch 3 §3.5 "TOAST" (p. 74); buffer-ring note in Ch 9                                                                                                                                                                             |
| Xid allocation, lazy assignment, virtual xids                                                                   | Ch 3 §3.3 (`pg_current_xact_id_if_assigned`), §3.6 "Virtual Transactions" (p. 75); xid locks Ch 12 §12.3                                                                                                                                                   |
| Xid wraparound                                                                                                  | Ch 7 §7.1 "Transaction ID Wraparound" (p. 123); multixact wraparound Ch 13 §13.3                                                                                                                                                                           |
| Snapshots, `pg_current_snapshot`, xmin/xmax/xip                                                                 | Ch 4 §4.1–4.3 (p. 80–86)                                                                                                                                                                                                                                   |
| Commit log (clog, `pg_xact`), hint bits, abort is a bit flip                                                    | Ch 3 §3.3 "Commit" and "Abort" (pp. 70–73)                                                                                                                                                                                                                 |
| Savepoints, subtransactions, error atomicity                                                                    | Ch 3 §3.7 "Subtransactions" (p. 76)                                                                                                                                                                                                                        |
| Transaction horizon / long transactions pin dead rows                                                           | Ch 4 §4.5 "Transaction Horizon" (p. 87); Ch 6 §6.2 "Database Horizon Revisited" (p. 104); Ch 8 §8.3 "Precautions" (p. 141)                                                                                                                                 |
| HOT updates and fillfactor                                                                                      | Ch 5 §5.1 "Page Pruning" (fillfactor, p. 92), §5.2 "HOT Updates" (p. 95), §5.3–5.4                                                                                                                                                                         |
| Page pruning                                                                                                    | Ch 5 §5.1, §5.3; index-side pruning §5.5 (p. 101)                                                                                                                                                                                                          |
| Vacuum (phases, VERBOSE), autovacuum thresholds, throttling, monitoring                                         | Ch 6 (all); `pg_stat_progress_vacuum` §6.7 (p. 119)                                                                                                                                                                                                        |
| Freezing, `VACUUM FREEZE`, freeze ages, failsafe                                                                | Ch 7 §7.2–7.4                                                                                                                                                                                                                                              |
| `VACUUM FULL`, `CLUSTER`, `REINDEX`, `pg_repack`, `pgstattuple`                                                 | Ch 8 §8.1 "Full Vacuuming" (p. 135), §8.2 "Other Rebuilding Methods" (p. 140)                                                                                                                                                                              |
| Free space map (concept, `_fsm` fork)                                                                           | Ch 1 §1.1 "Files and Forks" (p. 26–27); updated by vacuum Ch 6 §6.1, §6.3. `pg_freespacemap` extension: not used                                                                                                                                           |
| Visibility map, all-visible/all-frozen bits, `pg_visibility`                                                    | Ch 1 §1.1 (p. 27); Ch 6 §6.1 "Vacuum" (p. 102–104); Ch 7 §7.2                                                                                                                                                                                              |
| Index-only scans, Heap Fetches, `relallvisible`                                                                 | Ch 20 §20.2 "Index-Only Scans" (p. 337); property "returnable" Ch 19 §19.3                                                                                                                                                                                 |
| Buffer cache internals: buffer headers, pins, usage count, clock sweep, buffer rings, `pg_buffercache`          | Ch 9 §9.2 "Buffer Cache Design", §9.3 "Cache Hits", §9.4 "Cache Misses", §9.5 "Bulk Eviction"                                                                                                                                                              |
| `pg_prewarm`, autoprewarm                                                                                       | Ch 9 §9.7 "Cache Warming" (p. 161)                                                                                                                                                                                                                         |
| `shared_buffers` sizing, `temp_buffers`, local cache                                                            | Ch 9 §9.6, §9.8                                                                                                                                                                                                                                            |
| `EXPLAIN (ANALYZE, BUFFERS)` — reading `shared hit/read`                                                        | Ch 9 §9.3 (p. 151) introduces it; used throughout Part IV                                                                                                                                                                                                  |
| WAL records, LSNs, `pg_lsn`, `pg_current_wal_*_lsn`, segment naming                                             | Ch 10 §10.1–10.2 "WAL Structure" (p. 164–169)                                                                                                                                                                                                              |
| `pg_waldump`                                                                                                    | Ch 10 §10.3–10.4 (p. 169, 173, 176); `--stats` in Ch 11 §11.2–11.3 (p. 190–195). `pg_walinspect`: not covered (PG 15+)                                                                                                                                     |
| Checkpoints, redo point, `pg_control`, `pg_controldata`                                                         | Ch 10 §10.3 "Checkpoint" (p. 170)                                                                                                                                                                                                                          |
| Crash recovery / redo, startup process                                                                          | Ch 10 §10.4 "Recovery" (p. 173)                                                                                                                                                                                                                            |
| Background writer, `pg_stat_bgwriter`                                                                           | Ch 10 §10.5 "Background Writing" (p. 176), §10.6 "Monitoring" (p. 179–180)                                                                                                                                                                                 |
| `checkpoint_timeout`, `max_wal_size`, `checkpoint_completion_target`, `log_checkpoints`                         | Ch 10 §10.6 "WAL Setup" (p. 177)                                                                                                                                                                                                                           |
| Full page writes, torn pages, `wal_compression`                                                                 | Ch 11 §11.2 "Non-Atomic Writes" (p. 189); FPI replay in Ch 10 §10.4 (p. 174)                                                                                                                                                                               |
| `fsync`, `synchronous_commit`, walwriter, `pg_test_fsync`, `commit_delay`                                       | Ch 11 §11.1 "Performance" (p. 182), §11.2 "Caching" (p. 186)                                                                                                                                                                                               |
| Page checksums, `data_checksums`, corruption detection                                                          | Ch 11 §11.2 "Data Corruption" (p. 187)                                                                                                                                                                                                                     |
| `wal_level` minimal / replica / logical, `max_wal_senders`, unlogged bulk load                                  | Ch 11 §11.3 "WAL Levels" (p. 191)                                                                                                                                                                                                                          |
| Replication slots                                                                                               | Not covered. Closest background: Ch 10 §10.6 (WAL retention warning, `wal_keep_size`, p. 179)                                                                                                                                                              |
| Streaming replication, standbys, lag, promotion, `pg_rewind`, cascading                                         | Not covered. Closest background: Ch 11 §11.3 "Replica" (why standby snapshot/lock records exist); Ch 10 §10.2 (LSNs, timelines in segment names)                                                                                                           |
| Hot-standby query conflicts                                                                                     | Not covered. Closest background: Ch 11 §11.3 "Replica" (p. 194) plus Ch 4 §4.5 (horizon)                                                                                                                                                                   |
| Logical decoding, publications/subscriptions, CDC                                                               | Not covered. Closest background: Ch 11 §11.3 "Logical" (p. 196); initial-sync snapshots relate to Ch 4 §4.7 "Exporting Snapshots"                                                                                                                          |
| Base backups, WAL archive, PITR, timelines, `pg_basebackup`                                                     | Not covered. Closest background: Ch 10 §10.4 "Recovery" (`backup_label` mention) and Ch 11 §11.3 "Replica" (backup recovery motivation)                                                                                                                    |
| Isolation levels: read committed, repeatable read, serializable                                                 | Ch 2 §2.3 "Isolation Levels in PostgreSQL" (p. 44–61)                                                                                                                                                                                                      |
| Lost update, read skew, write skew, read-only anomaly                                                           | Ch 2 §2.2 (definitions, p. 41), §2.3 "Read Committed" (lost update p. 51), "Repeatable Read" (write skew p. 55)                                                                                                                                            |
| SSI, predicate locks, `SIReadLock`, serialization failure & retry                                               | Ch 2 §2.3 "Serializable" (p. 58); Ch 14 §14.5 "Predicate Locks" (p. 235)                                                                                                                                                                                   |
| Heavyweight locks, `pg_locks`, lock types                                                                       | Ch 12 §12.1–12.2 (p. 199–202)                                                                                                                                                                                                                              |
| Locks on transaction ids (waiting on another xid)                                                               | Ch 12 §12.3 "Locks on Transaction IDs" (p. 202)                                                                                                                                                                                                            |
| Relation locks, DDL, `LOCK TABLE`, conflict matrix, `ALTER TABLE`                                               | Ch 12 §12.4 "Relation-Level Locks" (p. 204)                                                                                                                                                                                                                |
| Lock queue fairness, `pg_blocking_pids`, DDL behind a long query                                                | Ch 12 §12.5 "Wait Queue" (p. 206); Ch 13 §13.4 "Wait Queue" (p. 215)                                                                                                                                                                                       |
| Row locks live in the tuple (xmax + infomask), `pgrowlocks`                                                     | Ch 13 §13.1 "Lock Design" (p. 210), §13.2, §13.4                                                                                                                                                                                                           |
| `FOR UPDATE` / `FOR SHARE` / `FOR NO KEY UPDATE` / `FOR KEY SHARE`, multixacts                                  | Ch 13 §13.2 "Row-Level Locking Modes" (p. 211), §13.3 "Multitransactions" (p. 213)                                                                                                                                                                         |
| `NOWAIT`, `SKIP LOCKED`, `lock_timeout`, `statement_timeout`                                                    | Ch 13 §13.5 "No-Wait Locks" (p. 224); work-queue batching with `SKIP LOCKED` in Ch 8 §8.3 "Data Updates" (p. 142)                                                                                                                                          |
| Deadlocks, `deadlock_timeout`, detector output                                                                  | Ch 13 §13.6 "Deadlocks" (p. 225)                                                                                                                                                                                                                           |
| Advisory locks                                                                                                  | Ch 14 §14.4 "Advisory Locks" (p. 234)                                                                                                                                                                                                                      |
| Unique-key insert races (waiting on the other inserter's xid)                                                   | Not treated explicitly. Closest background: Ch 12 §12.3 (xid locks); Ch 19 §19.3 (can_unique property)                                                                                                                                                     |
| Wait events (`wait_event_type`, `wait_event`), sampling, `log_lock_waits`                                       | Ch 15 §15.4 "Monitoring Waits" (p. 243), §15.5 "Sampling" (p. 245); also Ch 12 §12.5                                                                                                                                                                       |
| Lightweight locks and spinlocks, `LWLock` waits                                                                 | Ch 15 §15.1–15.3 (p. 240–243)                                                                                                                                                                                                                              |
| `EXPLAIN` / `EXPLAIN ANALYZE`: cost, rows, width, actual time, loops                                            | Ch 16 §16.2 "Planning" (p. 257–264) and "Execution" (p. 264)                                                                                                                                                                                               |
| Statistics, `pg_stats`, `ANALYZE`, `default_statistics_target`, extended statistics                             | Ch 17 (all)                                                                                                                                                                                                                                                |
| Seq scan cost                                                                                                   | Ch 18 §18.2 "Sequential Scans" (p. 296)                                                                                                                                                                                                                    |
| Index scan vs seq scan crossover, correlation, `random_page_cost`                                               | Ch 20 §20.1 "Regular Index Scans" (p. 330), §20.5 "Comparison of Various Access Methods" (p. 348)                                                                                                                                                          |
| Bitmap scans                                                                                                    | Ch 20 §20.3 "Bitmap Scans" (p. 340)                                                                                                                                                                                                                        |
| Nested loop / hash join / merge join                                                                            | Ch 21 §21.2; Ch 22 §22.1; Ch 23 §23.1; comparison Ch 23 §23.4 (p. 405)                                                                                                                                                                                     |
| Sorting algorithms and `work_mem` spills, `hash_mem_multiplier`, temp files                                     | Ch 23 §23.2 "Sorting" (p. 392); Ch 22 §22.1 "Two-Pass Hash Joins" (p. 372); `work_mem` defined Ch 16 §16.2 "Execution" (p. 265)                                                                                                                            |
| Parallel query: Gather, workers planned vs launched, limits                                                     | Ch 18 §18.3–18.5 (p. 300–312); parallel index scans Ch 20 §20.4; parallel joins Ch 21–23 "Parallel Mode" subsections                                                                                                                                       |
| Prepared statements, generic vs custom plans, `plan_cache_mode`                                                 | Ch 16 §16.3 "Extended Query Protocol" (p. 266)                                                                                                                                                                                                             |
| `pg_stat_statements`                                                                                            | Not covered. Closest background: Ch 16 §16.2 (query stages)                                                                                                                                                                                                |
| B-tree page structure, `bt_metap`, `bt_page_items`, deduplication                                               | Ch 25 §25.1 "Overview" (p. 421), §25.3 "Page Layout" (p. 426)                                                                                                                                                                                              |
| Index build, `CREATE INDEX CONCURRENTLY`, invalid indexes                                                       | Not covered as a process. Closest background: Ch 12 §12.4 (lock modes, p. 204–205); Ch 19 §19.3 (p. 329, one sentence)                                                                                                                                     |
| Partial indexes                                                                                                 | Ch 19 §19.3 "Column-Level Properties" (p. 329)                                                                                                                                                                                                             |
| Covering indexes (`INCLUDE`)                                                                                    | Ch 19 §19.3 "Index-Level Properties" (p. 326); Ch 20 §20.2 "Indexes with the Include Clause" (p. 339)                                                                                                                                                      |
| Index bloat, `REINDEX`, `pgstatindex`                                                                           | Ch 5 §5.5 "Page Pruning for Indexes" (p. 101); Ch 8 §8.1 "Estimating Data Density" (p. 136–139), §8.2 (p. 140); Ch 25 §25.3 "Deduplication" (p. 429)                                                                                                       |
| Uniqueness as an index property, `EXCLUDE` constraints                                                          | Ch 19 §19.3 (can_unique, can_exclude); Ch 26 §26.2 "Exclusion Constraints" (p. 457)                                                                                                                                                                        |
| Operator classes / families                                                                                     | Ch 19 §19.2 (p. 315)                                                                                                                                                                                                                                       |
| Hash index                                                                                                      | Ch 24                                                                                                                                                                                                                                                      |
| GiST                                                                                                            | Ch 26                                                                                                                                                                                                                                                      |
| SP-GiST                                                                                                         | Ch 27                                                                                                                                                                                                                                                      |
| GIN (full text, trigrams, arrays, jsonb)                                                                        | Ch 28                                                                                                                                                                                                                                                      |
| BRIN                                                                                                            | Ch 29                                                                                                                                                                                                                                                      |
| Server log as a diagnostic source                                                                               | Not covered as a topic; individual log lines shown for checkpoints (Ch 10 §10.6), recovery (Ch 10 §10.4), lock waits (Ch 15 §15.4), autovacuum (Ch 6 §6.7)                                                                                                 |
| `pg_cancel_backend`, `pg_terminate_backend`, idle-in-transaction timeouts                                       | Not covered. Closest background: Ch 8 §8.3 "Precautions" (`idle_in_transaction_session_timeout`, `old_snapshot_threshold`); Ch 13 §13.5 (`statement_timeout`)                                                                                              |
| `pg_stat_io`, per-backend I/O accounting                                                                        | Not covered (PG 16). Closest background: Ch 9 §9.5 "Bulk Eviction" (buffer rings by backend type) and Ch 10 §10.6 (`pg_stat_bgwriter` counters)                                                                                                            |
| Table/index usage counters (`seq_scan`, `idx_scan`, `pg_stat_user_indexes`)                                     | Not covered. Closest background: Ch 6 §6.5 (`pg_stat_all_tables` for vacuum) and Ch 9 §9.6 (`pg_statio_all_tables`)                                                                                                                                        |
| Two-phase commit, transactional outbox, idempotency keys, fencing tokens, LISTEN/NOTIFY, read-your-writes       | Not covered (application patterns). Closest background: Ch 13/14 for locks, Ch 2 for read-committed re-check semantics                                                                                                                                     |
