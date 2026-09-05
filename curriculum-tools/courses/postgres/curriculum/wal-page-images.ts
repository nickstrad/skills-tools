import { code, type Draft } from "../../../src/types.ts";

function experiment(compression: "off" | "pglz"): string {
  return code`
select current_setting('synchronous_commit') as saved_sync,
       current_setting('wal_compression') as saved_compression \gset
set synchronous_commit = on;
set wal_compression = '` + compression + code`';
show full_page_writes;
show wal_compression;
show data_checksums;
do $fn$
begin
  if current_setting('full_page_writes') <> 'on' then
    raise exception 'Use the course lab with full_page_writes=on';
  end if;
end
$fn$;
create temp table wal_image_ranges(label text, begin_lsn pg_lsn, end_lsn pg_lsn);
checkpoint;
select pg_current_wal_insert_lsn() as a \gset
update wal_image_rows set version=version+1 where id=1;
select pg_current_wal_insert_lsn() as b \gset
insert into wal_image_ranges values('first',:'a',:'b');
select pg_current_wal_insert_lsn() as a \gset
update wal_image_rows set version=version+1 where id=1;
select pg_current_wal_insert_lsn() as b \gset
insert into wal_image_ranges values('second',:'a',:'b');
checkpoint;
select pg_current_wal_insert_lsn() as a \gset
update wal_image_rows set version=version+1 where id=1;
select pg_current_wal_insert_lsn() as b \gset
insert into wal_image_ranges values('after_next_checkpoint',:'a',:'b');
-- A later synchronous write flushes every saved endpoint for decoding.
insert into wal_image_flush values(1);
select bool_and(pg_current_wal_flush_lsn() >= end_lsn) as all_ranges_flushed
from wal_image_ranges;
select r.label, pg_wal_lsn_diff(r.end_lsn,r.begin_lsn) as interval_bytes,
       sum(w.record_length) as record_bytes, sum(w.fpi_length) as image_bytes,
       count(*) filter(where w.fpi_length>0) as records_with_image
from wal_image_ranges r cross join lateral pg_get_wal_records_info(r.begin_lsn,r.end_lsn) w
 group by r.label,r.begin_lsn,r.end_lsn order by r.begin_lsn;
select r.label, b.record_type, b.relblocknumber, b.block_fpi_length, b.block_fpi_info
from wal_image_ranges r cross join lateral pg_get_wal_block_info(r.begin_lsn,r.end_lsn,false) b
where b.reldatabase=(select oid from pg_database where datname=current_database())
  and b.relfilenode=pg_relation_filenode('wal_image_rows')
order by r.begin_lsn,b.start_lsn,b.block_id;
select count(*)=100 and sum(version)=3 as unchanged_rows_three_increments from wal_image_rows;
select set_config('synchronous_commit',:'saved_sync',false),
       set_config('wal_compression',:'saved_compression',false);
drop table wal_image_ranges;
drop table wal_image_flush;
drop table wal_image_rows;`;
}

export const WAL_PAGE_IMAGES: Draft = {
  slug: "full-page-writes-after-checkpoint",
  title: "Measure first-touch page images and their compression tradeoff",
  tags: ["wal", "full-page-writes", "checkpoints", "write-amplification", "checksums"],
  difficulty: "intermediate",
  safetyLevel: "privileged",
  runIn: "tool",
  estimatedMinutes: 25,
  revision: 4,
  prerequisites: ["every-change-is-a-wal-record", "page-header-and-line-pointers"],
  reading:
    code`PostgreSQL 14 Internals, Chapter 11 "WAL Modes" (section "Fault Tolerance"); Chapter 10 "Write-Ahead Log" (section "Recovery")`,
  readingNotes:
    code`The book explains torn-page protection and how recovery applies full-page images. Measure the first-touch evidence, then read those sections to connect the extra bytes to recovery correctness. The compression variation changes the representation cost while keeping protection enabled.`,
  overview:
    code`A checkpoint changes which page modifications need a recovery image. Measure two updates of the same row, checkpoint again, and repeat the update. Then compress the page images and compare bytes for the same logical result without disabling protection.`,
  caution:
    code`CHECKPOINT affects the whole disposable lab, so run without competing work. Keep full_page_writes enabled throughout. Only synchronous_commit and wal_compression change in this session and are restored. If another checkpoint occurs between the first two updates, it can explain an unexpected second image; repeat the short controlled interval before drawing a conclusion.`,
  setup: code`drop table if exists wal_image_rows;
drop table if exists wal_image_flush;
create table wal_image_rows(id int primary key, version int, payload text)
with (autovacuum_enabled=off,fillfactor=70);
insert into wal_image_rows select g,0,repeat('x',100) from generate_series(1,100) g;
vacuum wal_image_rows;
create table wal_image_flush(id int);`,
  code: experiment("off"),
  expectedResult:
    code`All ranges are flushed and unchanged_rows_three_increments=true:100 rows remain and the version sum is3. The first update and the update after the next checkpoint have page-image bytes. The intervening update normally has none. The block report ties the images to the owned heap page, rather than attributing an unrelated image to the row update.

Image and interval lengths are measured values, not an exact8KB charge. Page holes, compression, record headers, pruning and other WAL activity affect their sizes. The pglz variation uses the same rows and three updates, keeps full_page_writes=on and reduces the repeated-content image bytes in this fixture. A smaller image demonstrates representation savings; this tiny run does not measure compression CPU cost or prove a universal throughput gain.`,
  systemsLens:
    code`Recovery protection has a workload-dependent cost. A checkpoint causes later first touches to carry recovery images, so write amplification depends on which pages the workload revisits. Compression can reduce bytes while adding CPU work. Measure both mechanisms and useful outcomes before choosing checkpoint frequency or a compression policy. A checksum detects damaged content; it is not a substitute for enough valid recovery information.`,
  challenge:
    code`Repeat with only wal_compression changed from off to pglz. Compare image_bytes and block_fpi_info while verifying the same final rows and version sum. State which CPU and workload measurements remain before recommending compression for a service.`,
  syntaxBreakdown: code`
### In plain terms

The same row receives three increments. A checkpoint separates the first two from the third so the decoded log shows when PostgreSQL includes a page image. A second run changes only image compression and preserves the data result.

### What you are learning

- Full-page images support recovery when a data-page write is torn.
- The first modification after a checkpoint can carry a much larger record than a later delta.
- Compression changes representation cost; measuring bytes alone does not measure CPU cost.

### Piece by piece

- **fillfactor, autovacuum_enabled, generate_series, repeat and VACUUM** (repeatable fixture): Create100 rows with identical100-character payloads and reserved page room, then prepare their visibility state. Automatic maintenance is disabled only for the owned table.
- **current_setting, \gset, SET and set_config** (session controls): Save synchronous_commit and wal_compression, set synchronous commits and the chosen compression mode, then restore the exact prior values. pglz is PostgreSQL's built-in compression method.
- **full_page_writes and data_checksums** (protection settings): SHOW reports their actual state; the PL/pgSQL DO block raises an explicit error if page-image protection is off. The experiment never disables it globally.
- **CREATE TEMP TABLE** (measurement intervals): Keep labels and LSN bounds in session-local storage. Its own data is not WAL-logged; metadata creation occurs before measured intervals.
- **CHECKPOINT** (recovery boundary): Write required dirty state and establish a new recovery starting point. It does not evict the shared buffer cache or mean all database activity has stopped.
- **pg_current_wal_insert_lsn and pg_wal_lsn_diff** (position and interval bytes): Bracket each update's inserted WAL. Subtraction includes WAL address-space overhead and possible concurrent records.
- **wal_image_flush and pg_current_wal_flush_lsn** (inspection readiness): A later synchronous marker makes the earlier positions durable before the decoder reads them. bool_and verifies all saved endpoints are covered.
- **LATERAL, pg_get_wal_records_info, sum and FILTER** (record measurement): Decode each interval separately and report total record bytes, image bytes and the number of records carrying images. Record bytes and LSN distance need not match.
- **pg_get_wal_block_info(...,false), pg_relation_filenode and pg_database** (page attribution): Omit raw block data while preserving image metadata. Filter to the current database and owned heap filenode, then inspect block_fpi_length and block_fpi_info to identify the representation used.
- **DROP TABLE and final aggregate** (cleanup and invariant): Check100 rows and three total increments, restore settings, then remove only this experiment's tables.
`,
};
export const WAL_PAGE_IMAGES_VARIATION = WAL_PAGE_IMAGES.setup + "\n" + experiment("pglz");
