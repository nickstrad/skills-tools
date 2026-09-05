import { code, type Draft } from "../../../src/types.ts";

function experiment(indexed: boolean): string {
  return code`
select current_setting('synchronous_commit') as saved_sync \gset
set synchronous_commit = on;
select pg_current_wal_insert_lsn() as insert_lsn,
       pg_current_wal_lsn() as write_lsn,
       pg_current_wal_flush_lsn() as flush_lsn;
select pg_current_wal_insert_lsn() as start_lsn \gset
begin;
select pg_current_xact_id()::text as target_xid \gset
insert into wal_record_orders values(1002,'ada',10);
update wal_record_orders set ` + (indexed ? "id=1003" : "amount=99") + code` where id=1002;
delete from wal_record_orders where id=6;
commit;
select pg_current_wal_insert_lsn() as end_lsn \gset
-- A later synchronous write establishes a flushed bound for inspection, outside the measured range.
insert into wal_record_flush values(1);
select pg_current_wal_flush_lsn() >= :'end_lsn'::pg_lsn as range_flushed;
select pg_wal_lsn_diff(:'end_lsn',:'start_lsn') as cluster_interval_bytes;
select start_lsn, xid, resource_manager, record_type, record_length, fpi_length
from pg_get_wal_records_info(:'start_lsn',:'end_lsn')
where xid = :'target_xid'::xid order by start_lsn;
select reltablespace, reldatabase, relfilenode,
       pg_filenode_relation(reltablespace,relfilenode) as relation,
       relforknumber as fork, relblocknumber as block, record_type
from pg_get_wal_block_info(:'start_lsn',:'end_lsn',false)
where xid = :'target_xid'::xid
  and reldatabase = (select oid from pg_database where datname=current_database())
order by start_lsn,block_id;
select count(*)=100 as committed_row_count_ok,
       count(*) filter(where id=6)=0 as deleted_row_absent,
       count(*) filter(where id=` + (indexed ? "1003 and amount=10" : "1002 and amount=99") +
    code`)=1
         as committed_change_present
from wal_record_orders;

select pg_current_wal_insert_lsn() as abort_start \gset
begin;
select pg_current_xact_id()::text as aborted_xid \gset
insert into wal_record_orders values(2002,'aborted',1);
rollback;
select pg_current_wal_insert_lsn() as abort_end \gset
insert into wal_record_flush values(2);
select pg_current_wal_flush_lsn() >= :'abort_end'::pg_lsn as abort_range_flushed;
select xid, resource_manager, record_type, record_length, fpi_length
from pg_get_wal_records_info(:'abort_start',:'abort_end')
where xid = :'aborted_xid'::xid order by start_lsn;
select count(*)=0 as aborted_row_absent from wal_record_orders where id=2002;
-- Read-side bookkeeping can log images without changing logical rows in the checksummed lab.
show data_checksums;
checkpoint;
select pg_current_wal_insert_lsn() as hint_start \gset
select count(*)=5000 as hint_rows_unchanged from wal_record_hints;
select pg_current_wal_insert_lsn() as hint_end \gset
insert into wal_record_flush values(3);
select record_type, count(*) as images, sum(block_fpi_length) as image_bytes
from pg_get_wal_block_info(:'hint_start',:'hint_end',false)
where reldatabase=(select oid from pg_database where datname=current_database())
  and relfilenode=pg_relation_filenode('wal_record_hints')
group by record_type;
select set_config('synchronous_commit',:'saved_sync',false);
drop table wal_record_hints;
drop table wal_record_flush;
drop table wal_record_orders;`;
}
export const WAL_RECORDS: Draft = {
  slug: "every-change-is-a-wal-record",
  title: "Read physical WAL work and verify the transaction outcome",
  tags: ["wal", "replicated-log", "durability", "transactions"],
  difficulty: "intermediate",
  safetyLevel: "privileged",
  runIn: "tool",
  estimatedMinutes: 25,
  revision: 4,
  prerequisites: ["install-lab-extensions", "update-writes-a-new-tuple"],
  reading:
    code`PostgreSQL 14 Internals, Chapter 10 "Write-Ahead Log" (sections "Logging", "WAL Structure")`,
  readingNotes:
    code`Chapter 10 explains ordered WAL records and their physical layout. Decode a known transaction first, then use the chapter to connect its heap, index and transaction records to write-ahead ordering. Record inspection alone does not test crash recovery; a later exercise does.`,
  overview:
    code`Physical work and committed business state are different evidence. Identify one transaction's WAL records and relation blocks, verify its resulting rows, then show that an aborted transaction still consumed WAL. Vary the indexed key to connect an application update with its additional storage work.`,
  caution:
    code`Use the disposable lab with pg_walinspect installed and a role allowed to read server WAL. Use the course lab with data checksums enabled. CHECKPOINT affects this whole lab. These functions inspect the current timeline and require the selected WAL to remain available. Run the complete short experiment without an unrelated benchmark; interval bytes can include other cluster activity. A later synchronous marker write flushes the range but is excluded from its bounds.`,
  setup: code`drop table if exists wal_record_orders;
drop table if exists wal_record_flush;
create table wal_record_orders(id int primary key, customer text, amount int)
with (autovacuum_enabled=off,fillfactor=70);
insert into wal_record_orders select g,'customer-'||g,g from generate_series(1,100) g;
vacuum wal_record_orders;
create table wal_record_flush(id int);
drop table if exists wal_record_hints;
create table wal_record_hints(id int, payload text) with (autovacuum_enabled=off);
insert into wal_record_hints select g,'v' from generate_series(1,5000) g;`,
  code: experiment(false),
  expectedResult:
    code`All flush and row checks are true. In the measured committed transaction, the decoded stream contains the heap INSERT, its B-tree work, the UPDATE, the DELETE and a Transaction/COMMIT. The supplied non-indexed update uses HOT in the validated fixture, but record counts, page images and byte lengths depend on page state and PostgreSQL version. Identify the actual record types rather than assuming one record per SQL statement.

Block references resolve to wal_record_orders and its primary-key index. The false argument to pg_get_wal_block_info omits raw block data; it does not filter out relation blocks. Transaction records have no block references.

The final count of5000 unchanged hint rows scans fresh committed pages after a checkpoint. In the
checksummed lab it produces FPI_FOR_HINT block records for wal_record_hints, demonstrating physical
bookkeeping on a logical read. No fixed image count or total byte size is required.

The second transaction's xid has physical insertion/index work and Transaction/ABORT records even though aborted_row_absent=true. The synchronous marker belongs to a later transaction outside the saved interval. Cluster interval bytes include alignment, WAL page overhead and possible unrelated records; filtering by xid narrows record attribution but does not turn that interval length into an exact request bill.`,
  systemsLens:
    code`Write-ahead ordering permits recovery to redo data-page changes using durable log records. Transaction visibility additionally depends on commit/abort state and the reader's snapshot. Retained WAL is a physical history, not a table of successful application requests, and recovering a database requires suitable starting data plus all required history. An aborted operation can consume log, CPU and storage work while leaving no visible row.`,
  challenge:
    code`Repeat on a fresh fixture, changing only the UPDATE target from the unindexed amount column to the indexed id key. Predict whether HOT remains possible, inspect the additional index work and verify the different intended final row.`,
  syntaxBreakdown: code`
### In plain terms

Mark a short transaction's log interval and save its transaction identity. Decode the records, resolve their relation blocks, then check the actual rows. An explicit rollback demonstrates why physical work is not a committed result.

### What you are learning

- WAL positions bound physical history, while transaction IDs identify a transaction's records.
- Heap and index changes can require separate records; changing an indexed key prevents HOT here.
- Aborted work remains in WAL even when it is absent from SQL-visible results.

### Piece by piece

- **fillfactor, autovacuum_enabled and VACUUM** (fixture controls): Reserve page room, disable automatic maintenance on the owned table and establish an initial visibility state. They make the small comparison repeatable without guaranteeing a universal record count.
- **generate_series** (input generator): Load100 deterministic rows into the same fresh layout on each run. The extra INSERT and DELETE cancel in the final row count.
- **current_setting, \gset and set_config** (saved settings and values): Save the caller's synchronous_commit value and store observed LSNs/xids as psql variables. Restore the original setting before cleanup; backslash commands end at a newline.
- **pg_current_wal_insert_lsn, pg_current_wal_lsn and pg_current_wal_flush_lsn** (WAL stages): Report inserted, written and durably flushed positions. These are separately sampled moving positions, not one atomic telemetry snapshot. Use insert positions for both interval bounds so pending records are not silently omitted.
- **BEGIN, pg_current_xact_id, COMMIT and ROLLBACK** (transaction identity and decision): Allocate and save the target xid inside its transaction. Cast its text to xid for comparison with decoder output in this short lab. Commit publishes changes for eligible snapshots; rollback abandons their logical result.
- **synchronous_commit=on and wal_record_flush** (inspection boundary): A later autocommit marker waits for its WAL flush, which also covers preceding positions. Compare the saved endpoint with pg_current_wal_flush_lsn before decoding; the marker is outside the measured range.
- **pg_wal_lsn_diff** (interval size): Subtract positions to measure the cluster's log address-space movement. This includes record alignment and page overhead, not just sums of record_length.
- **pg_get_wal_records_info** (pg_walinspect decoder): Return record identity, resource manager, type, total length and full-page-image length. Filter xid to distinguish the target transaction from other activity; unavailable retained WAL makes inspection fail.
- **pg_get_wal_block_info(...,false)** (block-reference decoder): Expand one record into its referenced blocks while omitting raw block bytes. reltablespace/reldatabase/relfilenode identify the physical relation; fork/block locate the page.
- **pg_filenode_relation and pg_database** (name resolution): Filter to the current database, then resolve the correct tablespace/filenode pair. Physical identifiers are meaningful only in their database and history context.
- **CHECKPOINT, data_checksums and the hint-table scan** (read-side WAL): Checkpoint establishes a new image boundary without evicting pages. A normal SELECT on previously unread committed tuples can set commit-status hint bits; in this checksummed lab those page changes can require FPI_FOR_HINT records. Filter block references to the owned hint table rather than charging the later flush marker to the SELECT.
- **FILTER and boolean comparisons** (domain checks): Verify the committed inserted/updated row, absent deleted row, final row count and absent aborted row independently of the WAL decoder.
`,
};
export const WAL_RECORDS_VARIATION = WAL_RECORDS.setup + "\n" + experiment(true);
