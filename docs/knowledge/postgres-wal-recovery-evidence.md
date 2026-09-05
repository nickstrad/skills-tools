# PostgreSQL WAL and recovery evidence

Use these findings when designing durability, WAL cost and restore experiments.
Verified2026-09-05 against PostgreSQL16.15; actual recovery findings will be
added as those experiments are accepted.

## What happened

WAL lesson review found three kinds of overclaim: physical records were equated
with committed business outcomes, an LSN interval with exact per-request bytes,
and the first post-checkpoint update with a fixed8KB record. The revised
experiments independently check rows, filter records by transaction identity,
inspect owned relation blocks and keep full-page protection enabled.

## Why it matters

A physically logged change can be invisible after abort. A record decoder
exposes retained history on the current timeline, not a complete standalone
database backup. WAL address-space movement, record bytes and page-image bytes
are distinct measurements. Confusing these boundaries produces incorrect
application retry, durability and capacity decisions.

## How to apply

- Save inserted WAL positions around the operation, then establish a later
  synchronous write outside that interval before decoding it. Verify the saved
  endpoint is flushed. Background WAL, alignment and page headers mean LSN
  distance is not the target transaction's exact payload size.
- Filter records by the measured xid and resolve block references only for the
  current database and correct tablespace/filenode. pg_get_wal_block_info's
  false argument omits raw data; it does not remove block references. Commit
  records have no block references. See
  [pg_walinspect](https://www.postgresql.org/docs/16/pgwalinspect.html).
- Treat SQL-visible domain assertions as separate evidence from physical record
  presence. An aborted insert still logged heap/index work; the row check
  establishes its logical absence. Recovery needs a valid starting state and all
  required WAL, not an arbitrary retained suffix.
- Keep full_page_writes enabled while comparing first and second page touches
  and session-local compression. A first-touch image can be carried by
  FPI_FOR_HINT before the UPDATE rather than the UPDATE record itself. Inspect
  every record referencing the owned page. In the validated repeated-content
  fixture pglz reduced5764 image bytes to555; this does not measure compression
  CPU overhead. See
  [WAL settings](https://www.postgresql.org/docs/16/runtime-config-wal.html).
- A later flush can cover earlier work, and concurrent commits can share a
  flush. Do not infer one physical fsync per transaction from the durable-commit
  contract. Write-ahead ordering requires WAL to reach durable storage before
  the corresponding data-page write; committing need not flush every changed
  heap page. See
  [write-ahead logging](https://www.postgresql.org/docs/16/wal-intro.html).

## Commit workload measurements,2026-09-05

Compare fixed useful work when changing application batch size. The accepted
commit experiment keeps400 increments per trial: batch1 has400 transactions,
batch5 has80. Report useful operations per second alongside transaction latency,
and state that the smaller sample weakens tail estimates. Use independent
per-client rows when a single hot-row lock is not the intended variable. Keep
the pgbench thread count and protocol fixed, repeat in reverse order, and retain
raw transaction logs, settings, summaries and WAL counter snapshots. Read
pgbench's failed-transaction count explicitly rather than labeling every
successfully parsed latency as proof of a successful transaction. See
[pgbench](https://www.postgresql.org/docs/16/pgbench.html).

Check actual wal_sync_method before interpreting wal_sync: methods that
synchronize as part of writing may not use the separate sync calls represented
by that counter. Cluster-wide deltas can include other backends or publication
lag. The accepted runs show group-sharing evidence under fdatasync, but require
no universal sync/transaction ratio. Current visible rows after an async commit
are not a crash-survival test.

Keep pg_test_fsync on a newly owned file, bound each sample and the overall
process, and retain its full output. Its parent filesystem must match the WAL
filesystem for a useful comparison; the operating system's default temporary
directory might be a different mount. A file-probe result is not the database
transaction path. See
[pg_test_fsync](https://www.postgresql.org/docs/16/pgtestfsync.html).

## Archive failure and repair (2026-09-05)

Accepted supplied archive-workload.ts creates a new private cluster using
owned-cluster.ts, including all helper code in each shell rendering. It clears
inherited PG variables, uses a unique /tmp socket with TCP disabled, retains
evidence and stops only its own server. Root uses the postgres OS owner;
non-root uses the invoking account. Server binaries come from PGBIN or pg_config
--bindir. One-MB initdb segments keep this failure bounded; the8MB max_wal_size
remains a soft target.

The archive gate returns exit1 before copying. Twelve selected segments remain
present with ready markers after CHECKPOINT:13,631,488 actual WAL bytes
exceed8,388,608. Repair removes the gate, produces a wake segment and polls
actual files/counters; all12 archived SHA-256 hashes match the pre-repair
sources, all target ready markers disappear, and a further checkpoint makes
all12 old names disappear. This proves eligibility for removal/recycling, not
which filesystem operation was used. Directory bytes settle at8MB; receipt
totals are13/130. Core failure count1 persists after repair and archived_count
reaches13.

Twenty-segment source and exact CLI variations each retain22,020,096 bytes and
end with21 receipts, amount210, archived_count21 and matching20 target hashes.
Retry counts vary (1–2 here). Never infer that last_archived_wal proves an
entire required range exists: verify selected inputs. Do not erase failure
counters to make a repaired system appear healthy. Initial sandbox chown was
denied; actual runs used authorized escalation and succeeded on PostgreSQL16.15.

This local archive script is deliberately a teaching boundary: temporary copy
plus rename, no storage durability protocol or off-host destination. Do not call
it a tested backup/restore. The next lessons must actually restore and exercise
missing inputs. Archive commands are launched by PostgreSQL; only driver
initdb/pg_ctl/psql and polling phases have explicit time limits here.

Official references: PostgreSQL16
[continuous archiving](https://www.postgresql.org/docs/16/continuous-archiving.html)
defines the archive command's success/retry contract and retention consequence;
[WAL settings](https://www.postgresql.org/docs/16/runtime-config-wal.html)
describes max_wal_size as soft;
[archiver statistics](https://www.postgresql.org/docs/16/monitoring-stats.html#PG-STAT-ARCHIVER-VIEW)
defines success/failure counters. Book Chapter10 covers segments/recycling, not
archive_command or pg_stat_archiver; keep that reading boundary explicit.

## Owned crash: physical replay versus transaction outcome (2026-09-05)

The accepted crash-workload.ts combines former crash-and-redo and
wal-replay-is-deterministic. Create extensions/tables, checkpoint, capture lower
LSN, commit receipt1, then keep a second psql client alive with receipt2 in an
unfinished transaction. Observe its idle-in-transaction state; a later
independent synchronous flush-marker commit and flush_lsn comparison ensure both
inserts' WAL is durable. Decode the selected xids, retaining transaction records
as well as heap records. Immediately stop the owned server BEFORE
closing/reaping that client, otherwise client EOF would change the fault into an
ordinary pre-crash rollback.

Core actual xids734/735 both have Heap INSERT; only734 has COMMIT. After unclean
stop and actual redo, pageinspect still sees both t_xmin values while SELECT
sees only receipt1/amount10. Commit- second variation adds735's COMMIT and
produces receipts[1,2]/amount30, with both physical tuples again present. Read
raw headers before ordinary SELECT can add visibility hints; disable table
autovacuum on this tiny fixture to preserve evidence. The experiment does not
establish whether a particular page was already on disk and skipped by redo;
physical presence alone cannot prove which page-write path occurred.
Service-ready/domain-ready times are sampled separately and not an RTO.

Use pg_controldata while stopped for the unclean in-production state and
pg_waldump -p/-s/-e for the saved workload interval. Capture a byte offset
before the crash to isolate fresh recovery messages, then require interruption,
redo start/done and readiness. The tested core's log had terminal zero magic
at0/8EA000 after redo0/8D1F48–0/8E8A50, then completed end-of-recovery
checkpoint and became ready with correct domain state. Do not infer corruption
from an isolated terminal message without its boundary and recovery result.
Local crash recovery kept timeline1; this says nothing about later divergent
promotion/PITR authority.

Official PostgreSQL16
[pg_ctl](https://www.postgresql.org/docs/16/app-pg-ctl.html) documents the
immediate shutdown/crash-recovery boundary;
[pg_walinspect](https://www.postgresql.org/docs/16/pgwalinspect.html) describes
the record/xid fields and current-timeline scope. The offline interval is
retained in each owned evidence directory. It is a subset of the recovery
stream, not a complete backup.

Retiring a lesson renumbers built prerequisite integers as well as ordinals. For
source/artifact scope audits, normalize each prerequisite integer to its catalog
slug before comparing unrelated lessons. Preserve old SQLite IDs/history and
inactive retirement without completion transfer. Current course94 lessons/seven
reading stops; first7 unchanged. See validation/04-crash.md for evidence.

## Matched WAL amplification and catalog-image confounding (2026-09-05)

Accepted wal-amplification.ts compares200 identical requested rows in freshly
created matching heaps: INSERT SELECT,200 statements in one transaction,200
file-driven autocommits, and COPY FROM STDIN. All three INSERT paths
produce20,800 owned heap-record bytes (104/row); COPY5 multi-insert records
total11,845 (59.23/row). Transaction COMMIT counts/bytes
are1/34,1/34,200/6800,1/34. A psql file with individually unwrapped statements
establishes autocommit boundaries; a multiple-command -c string would have
different transaction behavior. Client STDIN COPY avoids shared server CSVs.

A fresh heap does NOT match all catalog-page state. Full-image hint bytes in
these sequential intervals differ38,004/21,148/14,512/18,164, so whole-interval
costs59,416/42,336/43,616/30,344 could misrank intrinsic ingestion cost. Report
owned-heap record bytes (deduplicated by position after filtering
database/filenode/main fork), commit-record bytes and catalog/image detail
separately. Explain the difference instead of hiding unfavorable totals or
inferring a universal ratio.

The matched200-row amount update remains HOT for every row with only the
primary-key index, and for none when amount is also indexed. Both heap-record
totals31,510 match, but the indexed case adds400 B-tree INSERT_LEAF records and
its interval rises31,856→65,664. Non-HOT maintenance also creates new
primary-key entries because tuple locations change. Index-build output16,384
bytes coexists with72,232 WAL interval bytes including catalogs; these are
different denominators.

Exact guard comparison: amount already equals id for all200 rows. Unconditional
UPDATE writes200 HOT versions (31,832 interval bytes); WHERE amount IS DISTINCT
FROM id writes none (zero here), with identical independently verified values.
Use null-safe outcome checks too. A zero-row UPDATE can still take a write lock;
do not call it a read-only SQL operation. Equal measured endpoints need an empty
result path because a decoder cannot find a nonexistent record.
Trigger/per-attempt side effects require a separate equivalence decision before
applying such a guard in real software.

Core, source variation and exact CLI variation all executed on owned
PostgreSQL16.15 clusters. See validation/04-amplification.md for final paths and
scoped integration evidence. Volume alone establishes neither throughput nor
recovery duration; that distinction remains in the lesson.

Reference boundaries: the official
[psql command-string documentation](https://www.postgresql.org/docs/15/app-psql.html)
explains why one -c request groups SQL statements; this behavior was
independently verified here with PostgreSQL16 record counts. PostgreSQL16
[COPY](https://www.postgresql.org/docs/16/sql-copy.html) distinguishes
client-streamed STDIN from server filesystem inputs. The fixture's byte counts
above are live observations, not numbers supplied by those documents.

## Checkpoint page observations (2026-09-05)

### What happened

The owned checkpoint fixture compared page_header(get_raw_page(...)) with
page_header(pg_read_binary_file(pg_relation_filepath(...),0,block_size)). One
sample reads through shared buffers; the other bypasses them through the filesystem.
The first trial's flush assertion caught hint-bit WAL generated by a domain SELECT
*after* its update's synchronous commit. A later marker commit now establishes the
flush boundary after that observation. All final core/source/exact-hint runs pass.

With background writing and autovacuum disabled in a small private fixture, both
one and two update rounds leave 223 dirty heap buffers. Checkpoint makes them clean
while retaining all 223 cache entries. Cluster buffers_checkpoint rises by 246;
the log reports 247 buffers. The checkpoint record is CHECKPOINT_ONLINE and the
remaining redo distance is 176 bytes in these samples. These counts are observations,
not required PostgreSQL constants.

### Why it matters

A synchronous UPDATE commit need not flush later read-side hint WAL. File reads
can hit the OS page cache, so matching file bytes are not independent proof of
physical-device durability. Table dirty counts, cumulative cluster buffer counters
and checkpoint log accounting are not interchangeable scopes. A completed checkpoint
is neither cache eviction nor an empty remaining WAL interval.

### How to apply

Capture the entire observation interval before establishing its flush boundary.
Scope pg_buffercache with database, tablespace, filenode and fork identifiers;
sample residency before get_raw_page can fetch a page. Poll published checkpoint
counters, preserve reset epochs, and retain only fresh log bytes. Disable interference
only in the owned bounded fixture, leaving fsync/full_page_writes/synchronous_commit on.
Do not carry quiet-cluster zero-dirty assertions into a concurrently writing service.

Reference guarantees: PostgreSQL 16 [WAL configuration](https://www.postgresql.org/docs/16/wal-configuration.html)
explains checkpoint/redo and write-ahead ordering;
[pageinspect](https://www.postgresql.org/docs/16/pageinspect.html) documents raw pages and headers;
[pg_buffercache](https://www.postgresql.org/docs/16/pgbuffercache.html) documents cache observations.
The measured values above come from validation/04-checkpoint-anatomy.md's live runs.
