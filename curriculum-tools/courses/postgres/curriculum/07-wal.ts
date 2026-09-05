import { CRASH_WORKLOAD } from "./crash-workload.ts";
import { code, type Module } from "../../../src/types.ts";
import { COMMIT_WORKLOAD } from "./commit-workload.ts";
import { WAL_RECORDS } from "./wal-records.ts";
import { WAL_PAGE_IMAGES } from "./wal-page-images.ts";
import { ARCHIVE_WORKLOAD } from "./archive-workload.ts";

export const WAL: Module = {
  category: "wal",
  title: "The write-ahead log: records, durability, crash redo",
  lessons: [
    WAL_RECORDS,
    WAL_PAGE_IMAGES,

    COMMIT_WORKLOAD,

    ARCHIVE_WORKLOAD,

    CRASH_WORKLOAD,

    {
      slug: "wal-size-of-operations",
      tags: ["wal", "write-amplification", "hot-updates", "capacity"],
      title: "What things cost: measuring WAL per operation",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 25,
      prerequisites: [
        "every-change-is-a-wal-record",
        "hot-updates-and-fillfactor",
      ],
      overview: code`
WAL volume is a first-class capacity number: it sets your archive bill, your replication
bandwidth, and how long recovery takes. It is also almost never proportional to the logical size
of the data. In this lesson you price four choices with pg_wal_lsn_diff -- batching rows into one
transaction, using COPY instead of INSERT, updating an indexed versus a non-indexed column, and
building an index -- and turn each into bytes per row so they can be compared directly.`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 11 "WAL Modes" (sections "Fault Tolerance", "WAL Levels"); Chapter 5 "Page Pruning and HOT Updates" (section "HOT Updates")`,
      readingNotes: code`
Chapter 11 provides WAL and WAL-level context, while Chapter 5 explains why HOT updates avoid index
work when a row stays on its page. This lesson prices batching, COPY, indexed updates, and index
builds, extending those mechanisms into practical write-amplification measurements.`,
      syntaxBreakdown: code`
### In plain terms

This experiment measures how many WAL bytes different ways of doing equivalent work produce. You
compare transaction batching, COPY, HOT versus indexed updates, and a new index build, then divide by
rows or updates so the costs are comparable. The measurements turn storage, archive, and replication
capacity into numbers rather than guesses.

### What you are learning

- **Batching:** A commit record and flush cost are overhead that can be amortized across many rows.
- **HOT updates:** Changing a non-indexed column may avoid new index entries when space permits.
- **Write amplification:** Logical row changes can produce very different WAL volumes.

### Piece by piece

- **pg_wal_lsn_diff()** (SQL function). What it is: subtraction of two LSN positions in bytes.
  - What it does here: It prices each insertion, update loop, and index build between saved endpoints.
  - What it gives us: **wal_bytes** and **bytes_per_row/bytes_per_update** for direct comparisons.
- **\gset** (psql command). What it is: query-result capture into psql variables.
  - What it does here: It stores **a1** through **i2**, the endpoints around each operation.
  - What it gives us: Exact reusable boundaries instead of hand-copied LSNs.
- **\gexec** (psql command). What it is: a command that executes each result row as SQL.
  - What it does here: It turns 2,000 generated INSERT strings into 2,000 autocommit transactions.
  - What it gives us: The separate-commit row in the cost table.
- **COPY ... TO/FROM ... CSV** (SQL data-transfer command). What it is: bulk export and import through a CSV file.
  - What it does here: It generates and then loads the same 2,000 rows using multi-row WAL records.
  - What it gives us: A much smaller **bytes_per_row** value than individual INSERT paths.
- **DO $$ ... FOR ... LOOP** (server-side PL/pgSQL block). What it is: a loop that runs many SQL statements in one transaction.
  - What it does here: It repeats 2,000 inserts or 1,000 updates while avoiding client round trips.
  - What it gives us: A controlled denominator and a batched transaction cost.
- **fillfactor = 70**, primary key, and **CREATE INDEX** (storage option and DDL). What they are: spare-page space, an indexed identifier, and a secondary index.
  - What it does here: It creates HOT-eligible plain updates and non-HOT indexed updates, then builds a new index.
  - What it gives us: Different record types and index size for explaining write amplification.
- **pg_get_wal_records_info()** (pg_walinspect function). What it is: a decoder of records in each update range.
  - What it does here: It groups HOT_UPDATE, INSERT_LEAF, SPLIT_L, and PRUNE records.
  - What it gives us: Counts and summed lengths showing why indexed updates cost more.
- **pg_stat_force_next_flush()** (SQL function). What it is: a request to publish buffered statistics now.
  - What it does here: It makes the following table-statistics query reflect the update loops.
  - What it gives us: Fresh counters rather than stale values.
- **pg_stat_user_tables.n_tup_upd** and **n_tup_hot_upd** (statistics columns). What they are: total and HOT-update counters.
  - What it does here: It reports how many updates used each path.
  - What it gives us: A behavioral cross-check for the WAL record breakdown.
- **pg_relation_size('wal_amp_id_idx')** (SQL size function). What it is: the physical byte size of the built index.
  - What it does here: It measures the output relation after CREATE INDEX.
  - What it gives us: **index_bytes** to compare with WAL bytes and quantify build amplification.`,
      setup: code`
drop table if exists wal_amp;
create table wal_amp(id int, v text) with (autovacuum_enabled = off);
drop table if exists wal_cols;
create table wal_cols(id int primary key, indexed int, plain int)
  with (autovacuum_enabled = off, fillfactor = 70);
insert into wal_cols select g, g, g from generate_series(1,200) g;
create index wal_cols_indexed_idx on wal_cols(indexed);
vacuum wal_cols;`,
      code: code`
-- A. The same 2000 rows, four ways.
select pg_current_wal_lsn() as a1 \gset
insert into wal_amp select g, 'v' from generate_series(1,2000) g;
select pg_current_wal_lsn() as a2 \gset

begin;
do $$ begin for i in 2001..4000 loop insert into wal_amp values (i,'v'); end loop; end $$;
commit;
select pg_current_wal_lsn() as a3 \gset

-- Session A
-- 2000 separate autocommit transactions. This takes several seconds: each one
-- is a commit, and each commit is an fsync.
select 'insert into wal_amp values (' || g || ', ''v'');'
from generate_series(4001,6000) g \gexec
select pg_current_wal_lsn() as a4 \gset

-- Session A
copy (select g, 'v' from generate_series(6001,8000) g) to '/tmp/wal_amp.csv' csv;
select pg_current_wal_lsn() as a5 \gset
copy wal_amp from '/tmp/wal_amp.csv' csv;
select pg_current_wal_lsn() as a6 \gset

select 'one multi-row INSERT, 1 txn' as how, pg_wal_lsn_diff(:'a2',:'a1') as wal_bytes,
       round(pg_wal_lsn_diff(:'a2',:'a1')/2000.0,1) as bytes_per_row
union all select '2000 INSERTs, 1 txn',     pg_wal_lsn_diff(:'a3',:'a2'),
                 round(pg_wal_lsn_diff(:'a3',:'a2')/2000.0,1)
union all select '2000 INSERTs, 2000 txns', pg_wal_lsn_diff(:'a4',:'a3'),
                 round(pg_wal_lsn_diff(:'a4',:'a3')/2000.0,1)
union all select 'COPY, 1 txn',             pg_wal_lsn_diff(:'a6',:'a5'),
                 round(pg_wal_lsn_diff(:'a6',:'a5')/2000.0,1);

-- Session A
-- B. The same 1000 updates to the same row, on a plain and an indexed column.
checkpoint;
update wal_cols set plain = plain + 1 where id = 1;   -- warm-up: this page pays its FPI here
select pg_current_wal_lsn() as u1 \gset
do $$ begin for i in 1..1000 loop update wal_cols set plain = plain+1 where id=1; end loop; end $$;
select pg_current_wal_lsn() as u2 \gset
do $$ begin for i in 1..1000 loop update wal_cols set indexed = indexed+1 where id=1; end loop; end $$;
select pg_current_wal_lsn() as u3 \gset

select '1000 updates of a NON-indexed column' as how, pg_wal_lsn_diff(:'u2',:'u1') as wal_bytes,
       round(pg_wal_lsn_diff(:'u2',:'u1')/1000.0,1) as bytes_per_update
union all select '1000 updates of an INDEXED column', pg_wal_lsn_diff(:'u3',:'u2'),
                 round(pg_wal_lsn_diff(:'u3',:'u2')/1000.0,1);

select 'non-indexed' as which, record_type, count(*), sum(record_length) as len
from pg_get_wal_records_info(:'u1',:'u2') group by 1,2 order by 4 desc limit 4;
select 'indexed' as which, record_type, count(*), sum(record_length) as len
from pg_get_wal_records_info(:'u2',:'u3') group by 1,2 order by 4 desc limit 4;

select pg_stat_force_next_flush();
select relname, n_tup_upd, n_tup_hot_upd from pg_stat_user_tables where relname = 'wal_cols';

-- Session A
-- C. Building an index: how does the WAL compare to the index itself?
select pg_current_wal_lsn() as i1 \gset
create index wal_amp_id_idx on wal_amp(id);
select pg_current_wal_lsn() as i2 \gset
select 'CREATE INDEX' as how, pg_wal_lsn_diff(:'i2',:'i1') as wal_bytes,
       pg_relation_size('wal_amp_id_idx') as index_bytes;`,
      expectedResult: code`
A. Inserting the same 2000 rows costs very different amounts depending on how you frame it:

  how                     | wal_bytes | bytes_per_row
  one multi-row INSERT    |    129968 |          65.0
  2000 INSERTs, 1 txn     |    128432 |          64.2
  2000 INSERTs, 2000 txns |    224712 |         112.4
  COPY, 1 txn             |     28944 |          14.5

Three separate findings. (1) Writing one INSERT statement for 2000 rows saves nothing over 2000
INSERT statements in the same transaction -- 64-65 bytes/row either way -- because INSERT logs one
Heap/INSERT record per tuple regardless of statement shape. (2) Committing 2000 times instead of
once adds 48 bytes/row of pure overhead (a 46-byte COMMIT record plus alignment), a 75% increase,
on top of 2000 fsyncs. (3) COPY is 4.4x cheaper per row than INSERT: it uses heap_multi_insert and
packs many tuples into a single record. Batching helps enormously, but only through the code path
that actually batches.

B. Updating the same row 1000 times:

  how                                  | wal_bytes | bytes_per_update
  1000 updates of a NON-indexed column |    117680 |            117.7
  1000 updates of an INDEXED column    |    219816 |            219.8

Nearly 2x, and the record breakdown says why:

  non-indexed | HOT_UPDATE   |  994 | 77532        indexed | INSERT_LEAF  | 1995 | 127680
  non-indexed | FPI_FOR_HINT |    3 | 24723        indexed | UPDATE       |  995 |  77610
  non-indexed | INSERT_LEAF  |   12 |  8866        indexed | SPLIT_L      |    2 |   3400
  non-indexed | UPDATE       |    1 |  3283        indexed | PRUNE        |    7 |   2389

The plain column produced 994 HOT_UPDATEs and only 12 index records; the indexed column produced
995 non-HOT UPDATEs and 1995 INSERT_LEAFs -- two index records per update -- plus page splits and
deduplication work. pg_stat_user_tables confirms it: n_tup_upd = 2001 with n_tup_hot_upd = 995,
so essentially all of the first loop was HOT and none of the second was. (A handful of records in
the non-indexed run are not HOT: once the free space that fillfactor 70 reserved is used up, the
row has to move to another page until pruning reclaims space, and that move triggers an index
insert and a fresh page image.)

C. CREATE INDEX on the 8000-row wal_amp cost 529464 bytes of WAL to produce a 196608-byte index --
about 2.7x the size of the thing it built, because the WAL carries the new index pages plus the
full-page images of everything the build dirtied. An index build is not a metadata change; it is a
full write of a new relation, logged.`,
      systemsLens: code`
Write amplification is the number that decides your storage and network bill, and this lesson
gives you the tool to measure it instead of guessing: bracket anything with two LSNs and divide.
The four results generalise cleanly. Per-operation overhead (the commit record, the fsync) is
amortised by batching, which is why every high-throughput ingestion path -- COPY here, batching
producers in Kafka, memtable writes in an LSM tree -- exists. Secondary indexes are not free
storage, they are a multiplier on every write that touches them, which is the real cost of "just
add an index". And bulk structural operations (index builds, table rewrites, mass updates)
generate WAL bursts that a replica must receive, an archive must store, and a recovery must
replay -- so the migration that is instant on your laptop is the one that saturates the
replication link at 3am.

The habit worth taking away: when you design a write path, ask what it costs in log bytes per
logical change, not just in rows. A queue table updated in place through an indexed status column
is cheap logically and expensive in WAL; the same queue as an append-only outbox with a
HOT-updatable flag is the same feature at a fraction of the write amplification. Module 14 builds
exactly that.`,
      challenge: code`
Price an UPDATE that changes nothing: "update wal_amp set v = v". PostgreSQL still writes a new
tuple version for every row. Now price the same statement with a "where v is distinct from 'v'"
guard. How many bytes of WAL, and how much replication bandwidth, does one WHERE clause save on a
million-row table?`,
    },
  ],
};
