# A table is a file of 8 KB pages

slug: table-is-a-file
category: storage
difficulty: beginner
tags: storage, pages, files, relfilenode
prerequisites: shell-and-psql-toolkit
safety: ddl
run-in: mixed
sessions: 1
min-version: 16
minutes: 10
revision: 2

## Overview
Before any of the clever parts (MVCC, WAL, replication) make sense you need the physical picture: a
table is one or more OS files, cut into fixed 8 KB pages, addressed by relfilenode. In this lesson
you create a table, find its file on disk, and check that the number the server reports and the
number the filesystem reports are the same number.

## Syntax breakdown
### In plain terms

This experiment shows that a PostgreSQL table is stored as files made of fixed-size pages. You create
rows, ask PostgreSQL where the table and its index live, and compare the server byte count with the
operating system file size. A relation is PostgreSQL's name for a table or index; relfilenode is the
file identity, while an OID is the catalog object's identity.

### What you are learning

- Pages and forks: the main heap is divided into 8192-byte blocks, with optional FSM and visibility
  map forks stored beside it.
- File identity: relfilenode determines the path, and a rewrite can change it even when the table's
  OID remains the same.
- Catalog versus filesystem evidence: SQL functions can inspect the same files that ls would show.

### Piece by piece

- **DROP TABLE IF EXISTS** (DDL cleanup)
  - What it is: removes an old test relation when present and does nothing when absent.
  - What it does here: makes setup repeatable before creating st_events.
  - What it gives us: a known starting table; it must never target a real application table.
- **CREATE TABLE ... WITH (autovacuum_enabled = off)** (DDL and storage parameter)
  - What it is: creates a heap table and primary-key index; the parameter disables automatic cleanup.
  - What it does here: keeps vacuum from changing page evidence while we inspect it.
  - What it gives us: st_events and st_events_pkey as separate relations.
- **generate_series(1,1000)** (set-returning SQL function)
  - What it is: produces one integer for each value in the inclusive range.
  - What it does here: inserts 1000 predictable rows, making page counts reproducible.
  - What it gives us: ids 1 through 1000 and payload text in the heap.
- **ANALYZE st_events** (statistics command)
  - What it is: samples the table and updates planner statistics.
  - What it does here: refreshes pg_class's approximate page and row counts.
  - What it gives us: relpages near 6 and reltuples near 1000; these are catalog estimates.
- **current_setting('block_size')** (configuration-reading function)
  - What it is: returns a named server setting.
  - What it does here: reads PostgreSQL's compiled page size.
  - What it gives us: page_bytes = 8192.
- **pg_relation_filepath(rel)** (system function)
  - What it is: returns a relation's main-fork path relative to the data directory.
  - What it does here: finds st_events for later file checks.
  - What it gives us: a path such as base/database_oid/relfilenode.
- **pg_relation_size(rel, fork)** (system function)
  - What it is: reports relation bytes, optionally for main, fsm, or vm fork.
  - What it does here: converts heap bytes to pages and compares each fork.
  - What it gives us: main size is 49152 bytes or 6 pages; fork sizes show supporting files.
- **pg_stat_file(path)** (superuser file-stat function)
  - What it is: reads metadata for a file visible under the data directory.
  - What it does here: checks the size of the path returned by pg_relation_filepath.
  - What it gives us: file_size_on_disk, which should equal the main-fork byte count.
- **pg_ls_dir(path)** (superuser directory-listing function)
  - What it is: returns names in a server-side directory.
  - What it does here: lists files beginning with this table's relfilenode.
  - What it gives us: main, FSM, and possibly VM fork names and their sizes.
- **pg_class** (system catalog)
  - What it is: PostgreSQL's catalog describing relations.
  - What it does here: shows oid, relfilenode, relpages, and reltuples for st_events.
  - What it gives us: OID and file identity, plus estimates refreshed by ANALYZE.
- **\\t on / \\t off** (psql tuples-only option)
  - What it is: suppresses and restores column headers in psql output.
  - What it does here: leaves only the generated ls command for the shell pipe, then restores display.
  - What it gives us: clean input to the next shell command.
- **\\g | sh** (psql pipe command)
  - What it is: sends the preceding query's output to a shell.
  - What it does here: runs ls -l against the absolute relation path without leaving psql.
  - What it gives us: an OS listing whose size should match pg_relation_size.
- **ls -l** (shell file-list command)
  - What it is: prints permissions, owner, size, and name for a file.
  - What it does here: confirms the database file is owned by the postgres OS user.
  - What it gives us: filesystem size and path evidence independent of SQL catalogs.
- **pg_relation_filenode(rel)** (system function)
  - What it is: returns the current on-disk relfilenode number.
  - What it does here: supplies the prefix used to find table forks and explains dynamic path lookup.
  - What it gives us: the numeric file identity.
- **VACUUM FULL, TRUNCATE, and ALTER TABLE rewrites** (relation-rewrite operations)
  - What they are: operations that can build a replacement relation file.
  - What they do here: explain why relfilenode can change while OID stays stable.
  - What they give us: a reason to resolve the path dynamically instead of caching it.

## Setup
```text
drop table if exists st_events;
create table st_events(id int primary key, payload text) with (autovacuum_enabled = off);
insert into st_events select g, 'event-' || g from generate_series(1,1000) g;
analyze st_events;
```

## Run
```text
select current_setting('block_size') as page_bytes;

select pg_relation_filepath('st_events') as relpath,
       pg_relation_size('st_events') as bytes,
       pg_relation_size('st_events') / 8192 as pages;

-- The server's page count and the filesystem's byte count must agree.
select (pg_stat_file(pg_relation_filepath('st_events'))).size as file_size_on_disk;

-- The number in the path is pg_class.relfilenode. It happens to equal the OID
-- for a freshly created table, and stops equalling it after any rewrite.
select oid, relfilenode, relpages, reltuples
from pg_class where relname = 'st_events';

-- Every fork of the relation, as files in the database directory.
select f as file,
       (pg_stat_file('base/' ||
         (select oid from pg_database where datname = current_database()) || '/' || f)).size as bytes
from pg_ls_dir('base/' || (select oid from pg_database where datname = current_database())) f
where f like pg_relation_filenode('st_events')::text || '%'
order by f;

-- And from the shell, without leaving psql. (\g | sh pipes the result of the
-- query into a shell; \t off turns the column headers back on afterwards.)
\t on
select 'ls -l ' || current_setting('data_directory') || '/' || pg_relation_filepath('st_events')
\g | sh
\t off

-- The heap is not the whole story: the index is a separate file, and there are
-- extra "forks" (free space map, visibility map) beside the main fork.
select relname, pg_relation_filepath(oid) as relpath, pg_relation_size(oid) as bytes
from pg_class where relname in ('st_events','st_events_pkey') order by relname;
select pg_relation_size('st_events','main') as main_fork,
       pg_relation_size('st_events','fsm') as fsm_fork,
       pg_relation_size('st_events','vm') as vm_fork;
```

## Expected result
page_bytes is 8192. pg_relation_size('st_events') is 49152 bytes = 6 pages, and pg_stat_file
reports exactly 49152 for the same path: the file size is always a whole multiple of 8192. The path
looks like base/16568/17260 -- your database OID, then the relfilenode. oid and relfilenode print
as the same number here because the table was just created; they diverge the moment the relation is
rewritten (VACUUM FULL, TRUNCATE, some ALTER TABLEs), which is why the path is built from
relfilenode and not from the OID. After ANALYZE, relpages = 6 and reltuples = 1000.

The directory listing shows two files for this relation: 17260 at 49152 bytes (the main fork) and
17260_fsm at 24576 bytes (three pages of free space map). ls -l through the pipe prints the same
size against the absolute path, owned by the postgres OS user:
  -rw------- 1 postgres postgres 49152 ... /var/lib/postgresql/pglab/primary/base/16568/17260

st_events_pkey is a separate file of about 40960 bytes: an index is its own relation, with its own
relfilenode and its own pages. pg_relation_size by fork reports main 49152, fsm 24576, vm 0 -- the
visibility map does not exist until the table is vacuumed.

## Systems lens
Fixed-size pages are the unit of everything downstream: the buffer cache caches pages, WAL records
describe changes to pages, checksums protect pages, replication ships page changes, and torn-page
protection exists because a page is bigger than a disk sector. Any storage system that wants
crash-safe random updates ends up with the same choice, a fixed block plus a log describing block
deltas.

## Optional variation
Insert another 100000 rows and watch the file grow. Then look for a second file named
relfilenode.1: PostgreSQL splits a relation into 1 GB segments so it never depends on large-file
support. How many rows would you need to reach segment 1?
