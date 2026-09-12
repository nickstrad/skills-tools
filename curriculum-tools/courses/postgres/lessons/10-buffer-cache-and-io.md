# The buffer cache: hits, reads, dirty pages, and what a checkpoint does

slug: buffer-cache-and-io
category: storage
difficulty: intermediate
tags: storage, buffer-cache, checkpoints, write-back-cache, io
prerequisites: table-is-a-file, install-lab-extensions
safety: writes-data
run-in: tool
sessions: 1
min-version: 16
minutes: 20
revision: 4

## Overview
Every page a backend touches goes through shared_buffers. Read a table whose pages were pushed out
of the cache and see the reads turn into hits on the second pass; then dirty some pages and watch a
CHECKPOINT clean them without evicting them. This is a write-back cache with an explicit flush
point, and the flush point is what bounds crash recovery time.

## Syntax breakdown
### In plain terms

The buffer cache is shared memory where PostgreSQL keeps recently used pages. The first scan can
require PostgreSQL to populate shared buffers, while the second reuses them; an UPDATE makes buffers
dirty, and CHECKPOINT writes them without throwing them away. A PostgreSQL buffer read can still be
satisfied by the operating-system cache, so the counters do not directly time physical storage.

### What you are learning

- A cache hit avoids a storage read; read and dirtied counters describe work done by the query.
- Dirty pages can remain cached after their contents are flushed to disk.
- Checkpoints bound crash recovery, and large sequential writes use a ring to limit cache pollution.

### Piece by piece

- **SET max_parallel_workers_per_gather = 0** (session setting)
  - What it is: disables parallel query workers for this session.
  - What it does here: keeps both scans comparable.
  - What it gives us: one serial aggregate plan.
- **pg_size_pretty and pg_relation_size** (size functions)
  - What they are: format bytes for people and return exact relation bytes.
  - What they do here: report st_cold size, page count, and shared_buffers.
  - What they give us: the table's scale relative to the cache.
- **CREATE TABLE AS** (DDL/query form)
  - What it is: creates a table from a query result.
  - What it does here: writes 100000 rows through a scan-resistant ring buffer.
  - What it gives us: a large table whose first read includes misses.
- **EXPLAIN (ANALYZE, BUFFERS, costs off, timing off, summary off)** (plan options)
  - What it is: executes and reports buffer counters without noisy estimates or timing.
  - What it does here: compares the first and second count(*) scans.
  - What it gives us: first hit + read is approximately the scanned relation's blocks; the repeat
    scan should have fewer reads, though concurrent activity and cache layout can change the split.
- **CHECKPOINT** (server command)
  - What it is: flushes dirty shared buffers and records a WAL checkpoint position.
  - What it does here: establishes clean state, then flushes updated st_events pages.
  - What it gives us: dirty count 0 while buffers remain resident.
- **pg_buffercache** (extension view)
  - What it is: one row for each shared buffer slot.
  - What it does here: filters by relfilenode, database OID, and main fork.
  - What it gives us: relblocknumber, isdirty, and usagecount; blocks are clean after checkpoint and dirty after update.
- **count(*) FILTER (WHERE isdirty)** (aggregate and filter clause)
  - What it is: counts rows satisfying a condition inside an aggregate.
  - What it does here: counts total relation buffers and only dirty buffers.
  - What it gives us: a compact clean/dirty comparison.
- **pg_relation_filenode and current_database** (identity functions)
  - What they are: resolve the current file identity and database identity.
  - What they do here: ensure cache rows belong to this table and database.
  - What they give us: safe filtering when other databases share the cache.

- **CREATE TABLE AS and pg_prewarm(..., 'buffer')** (variation tools)
  - What they are: a query-built lab table and an extension function that loads a relation into
    shared buffers.
  - What they do here: create one controlled working-set variation and then warm it deliberately.
  - What they give us: a before/after buffer contrast, while reminding us that one sample cannot
    establish a production cache size.

## Setup
```sql
drop table if exists st_events;
create table st_events(id int primary key, payload text) with (autovacuum_enabled = off);
insert into st_events select g, 'event-' || g from generate_series(1,1000) g;
drop table if exists st_cold;
create table st_cold as select g as id, repeat(md5(g::text), 7) as pad
  from generate_series(1, 100000) g;
```

## Run
```sql
set max_parallel_workers_per_gather = 0;
select pg_size_pretty(pg_relation_size('st_cold')) as size,
       pg_relation_size('st_cold') / 8192 as pages,
       current_setting('shared_buffers') as shared_buffers;

-- First scan: CREATE TABLE AS wrote this table through a small ring buffer, so
-- part of it is no longer resident and must be read back from the OS.
explain (analyze, buffers, costs off, timing off, summary off)
  select count(*) from st_cold;

-- Second scan: identical query, everything now resident.
explain (analyze, buffers, costs off, timing off, summary off)
  select count(*) from st_cold;

-- Which buffers hold st_events, and are they clean? (Filter the main fork of
-- this database: relfilenode is only unique per database, and the fsm/vm forks
-- have their own buffers.)
checkpoint;
select count(*) as buffers, count(*) filter (where isdirty) as dirty
from pg_buffercache
where relfilenode = pg_relation_filenode('st_events')
  and reldatabase = (select oid from pg_database where datname = current_database())
  and relforknumber = 0;

update st_events set payload = payload || '!' where id <= 20;

select relblocknumber, isdirty, usagecount
from pg_buffercache
where relfilenode = pg_relation_filenode('st_events')
  and reldatabase = (select oid from pg_database where datname = current_database())
  and relforknumber = 0
order by relblocknumber;

checkpoint;

select count(*) as buffers, count(*) filter (where isdirty) as dirty
from pg_buffercache
where relfilenode = pg_relation_filenode('st_events')
  and reldatabase = (select oid from pg_database where datname = current_database())
  and relforknumber = 0;
```

## Expected result
st_cold's page count and shared_buffers setting establish the scale of this run. For the first scan,
the EXPLAIN line's shared hit plus shared read is normally close to the relation's scanned blocks;
the identical second scan normally has fewer reads, often none. The exact split depends on cache
contents and activity. A PostgreSQL "read" means shared_buffers did not already contain that block;
the operating system may still serve it from memory rather than a storage device.

Immediately after CHECKPOINT, st_events has resident buffers with dirty = 0. The UPDATE produces one
or more isdirty rows; a scan may also dirty pages by setting hint bits. After the second CHECKPOINT,
the same relation buffers can remain resident while dirty returns to 0. This proves a checkpoint
flushes dirty buffers; it does not evict them.

## Systems lens
Three properties to carry away. (1) It is a write-back cache: a committed transaction is durable
because its WAL record is on disk, not because its page is - the page may sit dirty in memory for
minutes. (2) The checkpoint is the knob that trades steady-state write I/O against recovery time,
the same trade as an LSM's memtable flush interval or a Raft snapshot interval. (3) Scan-resistant
ring buffers mean a big sequential job does not evict everyone else's working set, which is why
"just look at the cache hit ratio" is a poor capacity signal.

## Optional variation
Create one controlled working set, then compare an ordinary first scan with deliberate warming:

drop table if exists st_working_set;
create table st_working_set as select * from st_cold where id <= 10000;
explain (analyze, buffers, costs off, timing off, summary off) select count(*) from st_working_set;
select pg_prewarm('st_working_set', 'buffer');
explain (analyze, buffers, costs off, timing off, summary off) select count(*) from st_working_set;

Does warming remove shared reads for this table on this run? That answer alone cannot size
shared_buffers: the production working set, concurrent relations, operating-system cache, and
latency requirements still matter.
