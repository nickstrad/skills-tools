import { code, type Module } from "../../../src/types.ts";

export const STORAGE: Module = {
  category: "storage",
  title: "Storage: pages, tuples, and the buffer cache",
  lessons: [
    {
      slug: "table-is-a-file",
      tags: ["storage", "pages", "files", "relfilenode"],
      title: "A table is a file of 8 KB pages",
      difficulty: "beginner",
      safetyLevel: "ddl",
      runIn: "mixed",
      estimatedMinutes: 10,
      prerequisites: ["shell-and-psql-toolkit"],
      overview: code`
Before any of the clever parts (MVCC, WAL, replication) make sense you need the physical picture: a
table is one or more OS files, cut into fixed 8 KB pages, addressed by relfilenode. In this lesson
you create a table, find its file on disk, and check that the number the server reports and the
number the filesystem reports are the same number.`,
      reading: code`
PostgreSQL 14 Internals, Chapter 1 "Introduction" (sections "Files and Forks", "Pages")`,
      readingNotes: code`
The experiment makes Chapter 1's physical model concrete: a relation has a main file made of pages,
and its relfilenode identifies that file. The book explains forks, page size, and naming in more
detail than the queries do; run this lesson first, then read those sections while matching the
database OID, relfilenode, and fork files on disk.`,
      syntaxBreakdown: code`
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
`,
      setup: code`
drop table if exists st_events;
create table st_events(id int primary key, payload text) with (autovacuum_enabled = off);
insert into st_events select g, 'event-' || g from generate_series(1,1000) g;
analyze st_events;`,
      code: code`
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
       pg_relation_size('st_events','vm') as vm_fork;`,
      expectedResult: code`
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
visibility map does not exist until the table is vacuumed.`,
      systemsLens: code`
Fixed-size pages are the unit of everything downstream: the buffer cache caches pages, WAL records
describe changes to pages, checksums protect pages, replication ships page changes, and torn-page
protection exists because a page is bigger than a disk sector. Any storage system that wants
crash-safe random updates ends up with the same choice, a fixed block plus a log describing block
deltas.`,
      challenge: code`
Insert another 100000 rows and watch the file grow. Then look for a second file named
relfilenode.1: PostgreSQL splits a relation into 1 GB segments so it never depends on large-file
support. How many rows would you need to reach segment 1?`,
    },
    {
      slug: "page-header-and-line-pointers",
      tags: ["storage", "pages", "slotted-page", "pageinspect", "ctid"],
      title: "Inside a page: the header, line pointers, and tuples",
      difficulty: "intermediate",
      safetyLevel: "read-only",
      runIn: "tool",
      estimatedMinutes: 15,
      prerequisites: ["table-is-a-file", "install-lab-extensions"],
      overview: code`
Open one 8 KB page with pageinspect and read its layout: a 24-byte header, an array of 4-byte line
pointers growing forwards, and tuples packed backwards from the end. The gap between them is the
page's free space. This slotted-page layout is why a row has a stable address (ctid) even though
the bytes move around inside the page.`,
      reading: code`
PostgreSQL 14 Internals, Chapter 3 "Pages and Tuples" (section "Page Structure")`,
      readingNotes: code`
Chapter 3 describes the same PageHeaderData, item pointers, free-space gap, and tuple placement
that pageinspect decodes here. The lesson provides a live page from PostgreSQL 16, while the book's
examples use PostgreSQL 14; read the section after running it so the field names have physical
meaning rather than being an unexplained list.`,
      syntaxBreakdown: code`
### In plain terms

This lesson opens one physical heap page instead of treating a table as an abstract set of rows. You will decode its header, line-pointer slots, tuple headers, and the ctid addresses returned by normal SQL. The gap between the slot array and tuple bytes is reusable page space.

### What you are learning

- A page header records boundaries and page metadata; lower and upper show the free gap.
- A line pointer is a stable slot whose offset points to tuple bytes that can move.
- A ctid is a block number plus slot number, not a permanent logical row ID.

### Piece by piece

- **\\x auto** (psql display command)
  - What it is: automatic expanded output for wide rows.
  - What it does here: makes the page-header fields readable one per line.
  - What it gives us: labels such as pagesize, lower, upper, and lsn.
- **get_raw_page('st_events', 0)** (pageinspect function)
  - What it is: returns block 0 as raw page bytes.
  - What it does here: supplies the page that the decoding functions inspect; 0 is the first block.
  - What it gives us: a bytea page image; a missing extension or invalid block causes an error.
- **page_header(page)** (pageinspect function)
  - What it is: decodes the standard 24-byte heap-page header.
  - What it does here: reports lsn, checksum, lower, upper, special, pagesize, version, and prune_xid.
  - What it gives us: pagesize 8192 and upper - lower as the free-space gap; lower ends the pointer array and upper begins tuple storage.
- **heap_page_items(page)** (pageinspect set-returning function)
  - What it is: decodes each item slot and tuple header in a heap page.
  - What it does here: returns the first five slots, counts all items, and shows offsets.
  - What it gives us: lp slot number, lp_off byte offset, lp_len tuple length, lp_flags (1 normal, 2 redirect, 3 dead, 0 unused), transaction IDs, and t_ctid links.
- **ctid** (system tuple identifier)
  - What it is: a physical pair of block number and line-pointer slot.
  - What it does here: compares normal query output with the pageinspect slot addresses.
  - What it gives us: rows such as (0,1), proving the first rows are on block 0 in slots 1 onward.
- **ORDER BY lp LIMIT 5** (SQL clauses)
  - What they are: ordering and row limiting clauses.
  - What they do here: make the first slots easy to compare.
  - What they give us: a small, ordered sample rather than every tuple.
- **upper - lower and (lower - 24) / 4** (page arithmetic)
  - What it is: calculations using header boundaries and 4-byte line pointers after the 24-byte header.
  - What it does here: computes free bytes and the number of slots.
  - What it gives us: a directly checkable layout relationship.

`,
      setup: code`
drop table if exists st_events;
create table st_events(id int primary key, payload text) with (autovacuum_enabled = off);
insert into st_events select g, 'event-' || g from generate_series(1,1000) g;
analyze st_events;`,
      code: code`
\x auto
select * from page_header(get_raw_page('st_events', 0));

-- Free space is exactly the hole between the pointer array and the tuple area.
select lower, upper, upper - lower as free_bytes,
       (lower - 24) / 4 as line_pointers
from page_header(get_raw_page('st_events', 0));

select lp, lp_off, lp_len, lp_flags, t_xmin, t_xmax, t_ctid
from heap_page_items(get_raw_page('st_events', 0))
order by lp limit 5;

select count(*) as items_on_page_0
from heap_page_items(get_raw_page('st_events', 0));

-- The ctid a query returns is the (page, slot) pair you just decoded.
select ctid, id, payload from st_events order by id limit 3;

-- Tuples are laid out from the end of the page backwards.
select lp, lp_off, lp_off + lp_len as ends_at
from heap_page_items(get_raw_page('st_events', 0))
order by lp limit 3;`,
      expectedResult: code`
page_header shows pagesize 8192, version 4, special 8192 (a heap page has no special area),
lower 764 and upper 792, so free_bytes is 28 and line_pointers is (764 - 24) / 4 = 185. checksum
prints as 0 in this view even though data checksums are on, and lsn is a real WAL position such as
0/29902E0.

heap_page_items shows lp 1..185, all with lp_flags = 1 (normal) and lp_len = 36. Every tuple has
the same t_xmin (the single INSERT's transaction id, e.g. 788), t_xmax = 0 (nobody has deleted it),
and t_ctid pointing at itself: (0,1), (0,2), (0,3)... The rows returned by "select ctid, id" are
(0,1) id 1, (0,2) id 2, (0,3) id 3 -- the same addresses.

lp_off runs downwards as lp runs upwards: lp 1 at offset 8152, lp 2 at 8112, lp 3 at 8072, each
ending 8 bytes short of the previous one's start (36 bytes of tuple rounded up to 40 by MAXALIGN).`,
      systemsLens: code`
A slotted page is indirection inside a block: the line pointer is the stable name, the offset is
the current location. That one level of indirection lets the page compact itself without telling
anyone, which is exactly what index entries need (they store the ctid, not a byte offset). The same
trick shows up in log-structured file systems, object stores with content-addressed chunks, and any
system that wants to move data without invalidating references.`,
      challenge: code`
Predict lower and upper for the last page (block 5), then check: select * from
page_header(get_raw_page('st_events', 5)). Why is upper - lower much larger there?`,
    },
    {
      slug: "update-writes-a-new-tuple",
      tags: ["storage", "mvcc", "tuple-header", "bloat", "copy-on-write"],
      title: "UPDATE never overwrites: one row, three physical tuples",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 15,
      prerequisites: ["page-header-and-line-pointers"],
      overview: code`
Update one row twice and then look at the page. You will find three tuples for one logical row,
chained together by t_ctid, with the transaction ids that created and killed each version written
into the tuple headers. This is the physical fact underneath everything module 03 says about MVCC,
and the reason bloat exists at all.`,
      reading: code`
PostgreSQL 14 Internals, Chapter 3 "Pages and Tuples" (sections "Row Version Layout", "Operations on Tuples")`,
      readingNotes: code`
The three physical versions expose Chapter 3's row-version layout and its insert/update operations:
t_xmin records the creating transaction, t_xmax the transaction that replaces a version, and t_ctid
links the chain. The book explains visibility and tuple header bits more fully; run this experiment
first, then read the cited sections before module 03 introduces snapshots.
`,
      syntaxBreakdown: code`
### In plain terms

An UPDATE changes a logical row while preserving the old physical version for readers that may still need it. This experiment performs two committed updates, then inspects the page to see three tuple versions linked together. Transaction IDs and flags show which version is current and whether the update stayed on the page.

### What you are learning

- MVCC keeps old row versions rather than overwriting bytes in place.
- t_xmin, t_xmax, and t_ctid describe who created, replaced, and follows each version.
- Physical tuple count can exceed visible row count, creating garbage that vacuum must reclaim.

### Piece by piece

- **\\x auto** (psql display command)
  - What it is: expanded output mode for wide result rows.
  - What it does here: keeps tuple-header output readable.
  - What it gives us: one field per line where needed.
- **pg_current_xact_id()** (SQL function)
  - What it is: returns the current transaction ID and forces allocation if none exists.
  - What it does here: records xid1 and xid2 immediately before each update.
  - What it gives us: psql variables to compare with t_xmin and t_xmax.
- **BEGIN / COMMIT** (transaction commands)
  - What they are: start and finish an atomic unit of work.
  - What they do here: make each update a separate committed transaction.
  - What they give us: distinct transaction IDs and visible versions after commit.
- **\\gset and \\echo** (psql commands)
  - What they are: save a one-row result as variables, then print text with substitution.
  - What they do here: preserve and display xid1/xid2 for comparison.
  - What they give us: exact IDs to match in tuple headers.
- **heap_page_items(get_raw_page(...))** (pageinspect functions)
  - What they are: decode page 0's item slots and headers.
  - What they do here: expose t_xmin, t_xmax, t_ctid, and flags for all three versions.
  - What they give us: old -> new -> current; newest has t_xmax 0 and points to itself.
- **t_infomask2 & 16384 / & 32768** (bit tests)
  - What they are: masks for HEAP_HOT_UPDATED and HEAP_ONLY_TUPLE bits.
  - What they do here: turn raw flags into boolean columns.
  - What they give us: hot_updated and heap_only true/false values.
- **pgstattuple('st_versions')** (extension function)
  - What it is: measures live tuple bytes, dead tuple bytes, and free space.
  - What it does here: contrasts one visible row with two dead physical versions.
  - What it gives us: tuple_count 1 and dead_tuple_count 2 in this small table.
`,
      setup: code`
drop table if exists st_versions;
create table st_versions(id int, v text) with (autovacuum_enabled = off);
insert into st_versions values (1, 'v1');`,
      code: code`
\x auto
select ctid, xmin, xmax, * from st_versions;

begin;
select pg_current_xact_id() as xid1 \gset
update st_versions set v = 'v2' where id = 1;
commit;
\echo first update ran as xid :xid1

begin;
select pg_current_xact_id() as xid2 \gset
update st_versions set v = 'v3' where id = 1;
commit;
\echo second update ran as xid :xid2

-- One logical row. Look at what is physically on page 0.
select lp, lp_len, lp_flags, t_xmin, t_xmax, t_ctid,
       (t_infomask2 & 16384) <> 0 as hot_updated,
       (t_infomask2 & 32768) <> 0 as heap_only
from heap_page_items(get_raw_page('st_versions', 0))
order by lp;

select count(*) as physical_tuples from heap_page_items(get_raw_page('st_versions', 0));
select count(*) as visible_rows, ctid as live_ctid from st_versions group by ctid;

-- The dead versions still occupy the page: the table is 1 page holding 3 tuples.
select pg_relation_size('st_versions') as bytes;
select tuple_count, dead_tuple_count, dead_tuple_percent, free_percent
from pgstattuple('st_versions');`,
      expectedResult: code`
The row starts at ctid (0,1). After the two updates the page holds three tuples:

  lp | t_xmin | t_xmax | t_ctid | hot_updated | heap_only
   1 |    951 |    952 | (0,2)  | t           | f
   2 |    952 |    953 | (0,3)  | t           | t
   3 |    953 |      0 | (0,3)  | f           | t

Your xids will differ, but the relationships hold exactly: t_xmax of lp 1 equals :xid1 and t_xmin
of lp 2 equals :xid1 (the same transaction killed the old version and created the new one);
t_xmax of lp 2 and t_xmin of lp 3 both equal :xid2. The newest version has t_xmax = 0 and points at
itself. physical_tuples is 3 while "select * from st_versions" returns 1 row, at ctid (0,3).

The table is still 8192 bytes (one page), and pgstattuple reports tuple_count 1,
dead_tuple_count 2, dead_tuple_percent 0.76 and free_percent 98.34 -- two thirds of the tuples in
this table are garbage waiting for vacuum.

Versions 2 and 3 are heap_only = t: this table has no index, so both updates qualified as HOT and
no index entry was ever written for them. Only lp 1, the version an index would have pointed at, is
a full non-heap-only tuple. Lesson 8 makes that the whole point.`,
      systemsLens: code`
Copy-on-write at the row level: a writer never mutates a version another reader might be looking
at, so readers need no locks and writers need no undo log. The cost is that every update creates
garbage that some background process must reclaim, and that the "current" address of a row changes
over time. Every multi-version store makes this trade - Postgres pays it in vacuum, InnoDB and
Oracle pay it in an undo segment that rollback and long readers must walk, LSM trees pay it in
compaction.`,
      challenge: code`
Run "update st_versions set v = 'v4'" inside an open transaction and, from a second psql, read
heap_page_items. You can see the uncommitted version on the page before it is visible to anyone:
visibility is decided at read time from the header, not by hiding the bytes.`,
    },
    {
      slug: "hot-updates-and-fillfactor",
      tags: [
        "storage",
        "hot-updates",
        "fillfactor",
        "write-amplification",
        "indexes",
      ],
      title: "HOT updates: why leaving a page half empty makes writes cheaper",
      difficulty: "advanced",
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 20,
      prerequisites: ["update-writes-a-new-tuple"],
      overview: code`
If a new row version fits on the same page and no indexed column changed, PostgreSQL can do a
Heap-Only Tuple update: the new version is chained off the old line pointer and no index entry is
written at all. Run the identical workload against two tables that differ only in fillfactor and
count how many updates qualify.`,
      reading: code`
PostgreSQL 14 Internals, Chapter 5 "Page Pruning and HOT Updates" (sections "Page Pruning", "HOT Updates")`,
      readingNotes: code`
This workload demonstrates the book's HOT condition directly: free space on the same page plus no
indexed-column change lets PostgreSQL avoid a new index entry, while pruning turns old chain slots
into redirects or dead items. The book works through chain mechanics in more depth; run the lesson,
then read both sections to explain the counters and page flags.
`,
      syntaxBreakdown: code`
### In plain terms

These two tables receive the same updates, but one leaves 30 percent of each page empty. PostgreSQL can use that reserved room for a new version when the changed column is not indexed; that is a HOT update. Counters and page slots show the space-for-write trade.

### What you are learning

- Fillfactor reserves page room for future updates and trades initial density for fewer index writes.
- HOT requires the new version to fit on the same page and no indexed column to change.
- Statistics count all updates separately from HOT updates, while page flags reveal pruning.

### Piece by piece

- **fillfactor = 100 / fillfactor = 70** (table storage parameter)
  - What it is: the target percentage of each heap page filled by initial inserts.
  - What it does here: compares a packed table with one reserving space.
  - What it gives us: different starting page counts and HOT capacity.
- **DO ... FOR ... LOOP** (PL/pgSQL block)
  - What it is: an anonymous server-side procedure with a loop.
  - What it does here: repeats the non-indexed tag update 20 times for 100 rows in each table.
  - What it gives us: 2000 updates per table for a fair comparison.
- **pg_sleep(1)** (SQL function)
  - What it is: pauses one second.
  - What it does here: allows cumulative statistics to flush before they are read.
  - What it gives us: reliable n_tup_upd and n_tup_hot_upd values.
- **pg_stat_user_tables** (statistics view)
  - What it is: per-table update counters.
  - What it does here: reports n_tup_upd, n_tup_hot_upd, and pages.
  - What it gives us: st_hot near 0 percent HOT and st_hot_ff in the hundreds; exact counts vary.
- **round(..., 1) and nullif(..., 0)** (SQL functions)
  - What they are: round formats the percentage to one decimal place, and nullif changes a zero
    denominator to NULL instead of raising a division-by-zero error.
  - What they do here: calculate hot_pct safely from the cumulative counters.
  - What they give us: a readable percentage even if statistics have not flushed yet.
- **pg_relation_size(rel) / 8192** (size calculation)
  - What it is: relation bytes divided by one page.
  - What it does here: compares page growth after updates.
  - What it gives us: heap-page cost of write amplification.
- **heap_page_items and get_raw_page** (pageinspect functions)
  - What they are: decode each block's item slots.
  - What they do here: count lp_flags after HOT chains are pruned opportunistically.
  - What they give us: flag 1 normal, 2 redirect, 3 dead, 0 unused; qualitative counts matter more than exact totals.
- **UNION ALL** (SQL set operator)
  - What it is: combines result rows while retaining duplicates.
  - What it does here: puts the two tables' flag counts into one census before ordering them.
  - What it gives us: side-by-side evidence for st_hot and st_hot_ff.
- **generate_series and LATERAL** (SQL row generation and correlation)
  - What they are: generate one block number per page and run pageinspect once per block.
  - What they do here: census every page in both relations.
  - What they give us: evidence from all scanned blocks rather than a sample.
- **ALTER TABLE ... SET (fillfactor = 70); VACUUM FULL** (challenge operations)
  - What they are: change future fill and rewrite the table.
  - What they do here: rebuild st_hot before repeating the workload.
  - What they give us: a test of the HOT prediction; VACUUM FULL takes an exclusive lock.

`,
      setup: code`
drop table if exists st_hot;
drop table if exists st_hot_ff;
create table st_hot(id int primary key, tag text, payload text)
  with (fillfactor = 100, autovacuum_enabled = off);
create table st_hot_ff(id int primary key, tag text, payload text)
  with (fillfactor = 70, autovacuum_enabled = off);
insert into st_hot    select g, 'a', repeat('p', 200) from generate_series(1, 100) g;
insert into st_hot_ff select g, 'a', repeat('p', 200) from generate_series(1, 100) g;`,
      code: code`
select relname, reloptions, pg_relation_size(oid) / 8192 as pages
from pg_class where relname in ('st_hot','st_hot_ff') order by relname;

-- Same workload on both tables: 20 rounds x 100 rows, touching only the
-- non-indexed column "tag". Only fillfactor differs.
do $sql$
begin
  for i in 1..20 loop
    update st_hot    set tag = 'a' || i;
    update st_hot_ff set tag = 'a' || i;
  end loop;
end
$sql$;

select pg_sleep(1);
select relname, n_tup_upd, n_tup_hot_upd,
       round(100.0 * n_tup_hot_upd / nullif(n_tup_upd,0), 1) as hot_pct,
       pg_relation_size(relid) / 8192 as pages
from pg_stat_user_tables where relname in ('st_hot','st_hot_ff') order by relname;

-- Now change the INDEXED column. HOT is impossible: the index must be updated.
update st_hot_ff set id = id + 1000;
select pg_sleep(1);
select relname, n_tup_upd, n_tup_hot_upd
from pg_stat_user_tables where relname = 'st_hot_ff';

-- The fingerprint HOT leaves behind. lp_flags: 0 unused, 1 normal, 2 REDIRECT
-- (an index still points here; follow it to the current version), 3 dead.
-- Nothing has been vacuumed; this is opportunistic pruning on page access.
select 'st_hot' as rel, lp_flags, count(*)
from generate_series(0, pg_relation_size('st_hot')::int / 8192 - 1) b,
     lateral heap_page_items(get_raw_page('st_hot', b))
group by 1, 2
union all
select 'st_hot_ff', lp_flags, count(*)
from generate_series(0, pg_relation_size('st_hot_ff')::int / 8192 - 1) b,
     lateral heap_page_items(get_raw_page('st_hot_ff', b))
group by 1, 2
order by 1, 2;`,
      expectedResult: code`
Both tables start about the same size (st_hot 4 pages at fillfactor 100, st_hot_ff 5 pages at 70:
reserving space costs you space up front).

After the identical 2000 updates each:

  relname   | n_tup_upd | n_tup_hot_upd | hot_pct | pages
  st_hot    |      2000 |             0 |     0.0 |    64
  st_hot_ff |      2000 |           619 |    31.0 |    65

Zero HOT updates on the packed table: with fillfactor 100 there is never room for the new version
on the row's own page, so every update writes a new heap tuple AND a new index entry. Your
st_hot_ff number will be near 619 but need not match exactly; what must hold is st_hot = 0 and
st_hot_ff in the hundreds.

The last 100 updates change the indexed column id: n_tup_upd goes 2000 -> 2100 while n_tup_hot_upd
stays at 619, i.e. not one of them was HOT.

The line-pointer census is the clearest evidence of all. st_hot has 2100 pointers, all lp_flags = 1
(normal): 100 live tuples and 2000 dead ones that nothing has been able to clean up. st_hot_ff (in
our run) has 200 normal, 31 lp_flags = 2 REDIRECT pointers, 1381 lp_flags = 3 dead, and 6 unused.
The redirects are HOT chains that page pruning collapsed: the index still points at that slot, and
the slot forwards to the current version. Neither table has been vacuumed - HOT pruning happens
opportunistically when a backend touches a full page, and only HOT chains can be pruned that way.
Exact counts drift between runs; the qualitative split (st_hot: only flag 1, st_hot_ff: redirects
and reclaimed dead pointers) is the result.`,
      systemsLens: code`
This is the classic space-for-writes trade: reserve free space on every page and you buy cheaper
updates (one page dirtied instead of one page plus every index), pack pages full and you buy
density at the cost of write amplification. The same knob appears as B-tree fill factor, LSM
compaction thresholds, and slack in log-structured allocators. The second half of the lesson is the
harder lesson for schema design: an index on a column your workload updates is not just a read
optimisation you pay for once, it disables HOT for every update of that row.`,
      challenge: code`
Rebuild st_hot with fillfactor 70 (alter table st_hot set (fillfactor = 70); vacuum full st_hot;)
and rerun the loop. Does the HOT ratio match st_hot_ff? Then try fillfactor 40 - is the ratio
monotonic in free space?`,
    },
    {
      slug: "toast-and-large-values",
      tags: ["storage", "toast", "compression", "chunking", "large-values"],
      title: "TOAST: what happens to a value that does not fit on a page",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 15,
      prerequisites: ["page-header-and-line-pointers"],
      overview: code`
A tuple must fit in an 8 KB page, so a 100 KB value cannot be stored inline. PostgreSQL first tries
to compress it, and if it still does not fit, moves it to a side table in chunks and leaves an
18-byte pointer in the row. Store one compressible and one incompressible 100 KB value and watch
the two paths diverge.`,
      reading: code`
PostgreSQL 14 Internals, Chapter 1 "Introduction" (section "TOAST"); Chapter 3 "Pages and Tuples" (section "TOAST")`,
      readingNotes: code`
The two values show the TOAST path described in Chapters 1 and 3: compression can keep a large
datum inline, while an incompressible datum becomes a pointer plus chunks in a side relation. The
book explains the tuple and chunk layout; this lesson additionally measures detoasting buffers and
PostgreSQL 16 output. Read after running it, when heap_bytes and toast_bytes have concrete meaning.
`,
      syntaxBreakdown: code`
### In plain terms

A row cannot contain an arbitrarily large value because it must fit on an 8 KB page. PostgreSQL tries compression first; if the value still does not fit, it stores chunks in a hidden TOAST table and leaves a pointer in the row. This lesson compares a compressible and incompressible value and measures the extra reads.

### What you are learning

- Logical length and on-disk size differ when compression is possible.
- TOAST uses an indirection pointer, chunk rows, and an index to keep the heap tuple small.
- Out-of-line values can require more buffer accesses even when the SQL result has one row.

### Piece by piece

- **reltoastrelid::regclass** (catalog field and cast)
  - What it is: pg_class's OID for the hidden TOAST relation, cast to a readable name.
  - What it does here: identifies the side table for st_toast.
  - What it gives us: the toast_table name used to inspect chunks.
- **repeat and string_agg(md5(...), '')** (SQL functions)
  - What they are: repeat creates compressible text; md5 plus string_agg creates varied text.
  - What they do here: make two values of 100000 characters with different compression behavior.
  - What they give us: small stored_bytes for repeated x and roughly 100000 for varied text.
- **length(body) and pg_column_size(body)** (SQL functions)
  - What they are: logical character length versus stored datum size.
  - What they do here: compare the same logical size after compression.
  - What they give us: chars 100000 for both and the storage difference.
- **pg_relation_size and pg_total_relation_size** (size functions)
  - What they are: heap/main-fork size versus heap plus indexes and TOAST.
  - What they do here: separate the small heap from chunk-table bytes.
  - What they give us: heap_bytes, toast_bytes, and total_bytes.
- **\\gset and \\echo** (psql commands)
  - What they are: save a single result row into psql variables, then print substituted values.
  - What they do here: preserve the three size measurements and the TOAST relation name for the
    following queries.
  - What they give us: heap=:heap_bytes, toast=:toast_bytes, and total=:total_bytes output that can
    be compared with the later chunk and EXPLAIN evidence.
- **heap_page_items(get_raw_page(...))** (pageinspect)
  - What it is: decodes heap tuple lengths.
  - What it does here: shows the compressed value inline and the pointer-sized tuple.
  - What it gives us: lp_len evidence that the logical value is not stored inline.
- **chunk_id, chunk_seq, chunk_data** (TOAST columns)
  - What they are: identifier, ordering number, and bytes for each chunk.
  - What they do here: count and bound chunks for the incompressible value.
  - What they give us: sequence 0 through 50 and maximum chunk size near 1996 bytes.
- **EXPLAIN (ANALYZE, BUFFERS, costs off, timing off, summary off)** (plan options)
  - What it is: executes and reports buffer activity without noisy estimates or timings.
  - What it does here: compares inline row 1 with out-of-line row 2.
  - What it gives us: shared hit counts; the TOAST fetch has more hits than inline fetch.
- **ALTER TABLE ... ALTER COLUMN body SET STORAGE external** (challenge DDL)
  - What it is: changes the TOAST policy to avoid compression while allowing external storage.
  - What it does here: forces the compressible value to use chunks when reinserted.
  - What it gives us: a comparison of stored size and chunk count.

`,
      setup: code`
drop table if exists st_toast;
create table st_toast(id int primary key, label text, body text);`,
      code: code`
\x auto
select reltoastrelid::regclass as toast_table from pg_class where relname = 'st_toast';

-- Two values, both exactly 100000 characters. One compresses, one does not.
insert into st_toast values (1, 'compressible', repeat('x', 100000));
insert into st_toast values (2, 'incompressible',
  (select string_agg(md5(g::text), '') from generate_series(1, 3125) g));

select id, label, length(body) as chars, pg_column_size(body) as stored_bytes
from st_toast order by id;

select pg_relation_size('st_toast') as heap_bytes,
       pg_relation_size(reltoastrelid) as toast_bytes,
       pg_total_relation_size('st_toast') as total_bytes,
       reltoastrelid::regclass::text as toast_name
from pg_class where relname = 'st_toast' \gset
\echo heap=:heap_bytes toast=:toast_bytes total=:total_bytes

-- What is actually left in the heap tuple?
select lp, lp_len from heap_page_items(get_raw_page('st_toast', 0)) order by lp;

-- The out-of-line value, in chunks, in its own table.
select count(*) as chunks, min(chunk_seq) as first_seq, max(chunk_seq) as last_seq,
       max(length(chunk_data)) as chunk_bytes
from :toast_name;

-- Reading the out-of-line value means walking the TOAST index and every chunk.
-- Same query shape, same row count, two very different buffer counts.
explain (analyze, buffers, costs off, timing off, summary off)
  select length(body) from st_toast where id = 1;   -- inline, compressed
explain (analyze, buffers, costs off, timing off, summary off)
  select length(body) from st_toast where id = 2;   -- out of line, 51 chunks`,
      expectedResult: code`
The TOAST table exists from the moment the table has a varlena column: pg_toast.pg_toast_17134 (the
number is st_toast's OID).

  id | label          | chars  | stored_bytes
   1 | compressible   | 100000 |         1156
   2 | incompressible | 100000 |       100000

Both are 100000 characters. The repeated 'x' compresses 86x with pglz and, at 1156 bytes, fits
inline. The md5 concatenation is incompressible, so it is pushed out of line whole.

heap=8192 toast=106496 total=172032: the heap is still a single 8 KB page even though the table
holds 200 KB of text. heap_page_items proves it - lp 1 has lp_len 1200 (the compressed value stored
inline) and lp 2 has lp_len 61 (id, label, and an 18-byte TOAST pointer).

The TOAST table holds 51 chunks, chunk_seq 0..50, each up to 1996 bytes: 50 full chunks plus a
remainder, four chunks per TOAST page.

The two EXPLAINs price the difference. Fetching the inline value costs "Buffers: shared hit=2";
fetching the out-of-line one costs "Buffers: shared hit=16" for the same single row - one heap page
plus a descent of the TOAST index plus all thirteen chunk pages. Detoasting does not appear as a node in
the plan, only as buffer traffic, which is why a query over a wide table can be far slower than its
plan suggests.`,
      systemsLens: code`
Chunking plus an indirection pointer is the universal answer to "values whose size the block layout
cannot bound": TOAST here, extents and overflow pages elsewhere, blob storage with a key in the row
in an application. The consequences are all the ones you would predict for such a scheme. A large
value costs an extra index lookup and N chunk fetches on read, an UPDATE of any column may rewrite
the whole chain, and logical decoding and replication move the reassembled value. Two design rules
follow: keep large blobs in their own table so scans of the hot columns stay cheap, and never store
something you only ever fetch whole in a column you index or update frequently.`,
      challenge: code`
Force the compressible value out of line with
"alter table st_toast alter column body set storage external" and reinsert row 1. Compare
pg_column_size and the chunk count. Which do you want for a value your application always reads in
full, and which for one it substring()s?`,
    },
    {
      slug: "buffer-cache-and-io",
      tags: [
        "storage",
        "buffer-cache",
        "checkpoints",
        "write-back-cache",
        "io",
      ],
      title: "The buffer cache: hits, reads, dirty pages, and what a checkpoint does",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 20,
      prerequisites: ["table-is-a-file", "install-lab-extensions"],
      overview: code`
Every page a backend touches goes through shared_buffers. Read a table whose pages were pushed out
of the cache and see the reads turn into hits on the second pass; then dirty some pages and watch a
CHECKPOINT clean them without evicting them. This is a write-back cache with an explicit flush
point, and the flush point is what bounds crash recovery time.`,
      reading: code`
PostgreSQL 14 Internals, Chapter 9 "Buffer Cache" (sections "Cache Hits", "Cache Misses"); Chapter 10 "Write-Ahead Log" (section "Checkpoint")`,
      readingNotes: code`
The EXPLAIN buffer counters and pg_buffercache rows make Chapter 9's cache hits and misses visible,
while CHECKPOINT connects them to Chapter 10's dirty-page flushing and recovery boundary. The book
explains eviction and checkpoint design in more depth; run the scans first, then read both chapters
to interpret hit/read/dirtied and why a checkpoint does not evict pages.
`,
      syntaxBreakdown: code`
### In plain terms

The buffer cache is shared memory where PostgreSQL keeps recently used pages. The first scan can read pages from the operating system, while the second reuses cached pages; an UPDATE makes buffers dirty, and CHECKPOINT writes them without throwing them away. You will observe all three states.

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
  - What it gives us: first hit + read equals page count; second scan should be all hits.
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

- **LEFT JOIN, coalesce, and LIMIT 10** (challenge query clauses/functions)
  - What they are: LEFT JOIN keeps buffers with no matching relation, coalesce supplies the label
    unused when the relation name is null, and LIMIT 10 keeps the largest ten groups.
  - What they do here: rank cache consumers while retaining unassigned buffer slots.
  - What they give us: relation names and counts, including unused space that helps judge cache size.

`,
      setup: code`
drop table if exists st_events;
create table st_events(id int primary key, payload text) with (autovacuum_enabled = off);
insert into st_events select g, 'event-' || g from generate_series(1,1000) g;
drop table if exists st_cold;
create table st_cold as select g as id, repeat(md5(g::text), 7) as pad
  from generate_series(1, 100000) g;`,
      code: code`
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
  and relforknumber = 0;`,
      expectedResult: code`
st_cold is 26 MB / 3264 pages against 128MB of shared_buffers, so the whole table fits - yet the
first scan is not all hits:

  first  scan: Buffers: shared hit=2048 read=1216 dirtied=1216
  second scan: Buffers: shared hit=3264

hit + read = 3264 = the page count of the table, exactly. The 1216 reads are the pages that CREATE
TABLE AS pushed out through its 16 MB ring buffer; "dirtied" is the first reader setting hint bits.
The second scan reads nothing.

For st_events: 6 buffers, dirty 0 right after CHECKPOINT. After the UPDATE all six blocks report
isdirty = t with usagecount 5 - and only twenty rows on block 0 actually changed. The other five
blocks are dirty because the sequential scan that looked for id <= 20 set hint bits on every tuple
it inspected. Reads dirty pages in PostgreSQL; that is not a typo in your monitoring. After the
second CHECKPOINT all 6 buffers are still resident and dirty is back to 0: a checkpoint writes
pages out, it does not evict them.`,
      systemsLens: code`
Three properties to carry away. (1) It is a write-back cache: a committed transaction is durable
because its WAL record is on disk, not because its page is - the page may sit dirty in memory for
minutes. (2) The checkpoint is the knob that trades steady-state write I/O against recovery time,
the same trade as an LSM's memtable flush interval or a Raft snapshot interval. (3) Scan-resistant
ring buffers mean a big sequential job does not evict everyone else's working set, which is why
"just look at the cache hit ratio" is a poor capacity signal.`,
      challenge: code`
Sum pg_buffercache by relation to find your top cache consumers:
select coalesce(c.relname, 'unused') as rel, count(*) from pg_buffercache b left join pg_class c on
b.relfilenode = pg_relation_filenode(c.oid) group by 1 order by 2 desc limit 10. How many buffers
are still unused, and what does that say about whether shared_buffers is too large here?`,
    },
    {
      slug: "free-space-map-and-reuse",
      tags: [
        "storage",
        "free-space-map",
        "vacuum",
        "bloat",
        "space-reclamation",
      ],
      title: "The free space map: why a heap file almost never shrinks",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      estimatedMinutes: 15,
      prerequisites: ["update-writes-a-new-tuple", "install-lab-extensions"],
      overview: code`
Delete half a table and the file stays exactly the same size. Vacuum it and the file still stays
the same size - but now the free space map knows about the holes, and the next inserts go into old
pages instead of extending the file. Space is recycled in place, not returned to the OS.`,
      reading: code`
PostgreSQL 14 Internals, Chapter 1 "Introduction" (section "Files and Forks"); Chapter 6 "Vacuum and Autovacuum" (section "Vacuum")`,
      readingNotes: code`
The lesson separates the relation file's high-water mark from reusable space: Chapter 1 introduces
the FSM fork, and Chapter 6 explains how VACUUM removes dead tuples and publishes free space. The
book does not use pg_freespacemap itself, so the view is a course-facing measurement; run first,
then read the cited sections to connect avail values to vacuum's work.
`,
      syntaxBreakdown: code`
### In plain terms

Deleting rows marks their versions dead but does not normally shorten the table file. VACUUM makes that space reusable and records it in the free-space map (FSM), so later inserts fill old holes. VACUUM FULL is different: it rewrites the table and can return pages to the operating system.

### What you are learning

- File size is a high-water mark; reusable holes and filesystem size are separate facts.
- The FSM reports approximate free bytes per block after vacuum has inspected dead tuples.
- A rewrite changes relfilenode and can shrink a relation, but needs an exclusive lock.

### Piece by piece

- **pg_relation_size('st_events') / 8192** (size calculation)
  - What it is: exact heap bytes divided by one page.
  - What it does here: compares page count through delete, vacuum, and rewrite.
  - What it gives us: ordinary VACUUM leaves the page count unchanged.
- **pg_freespace('st_events')** (pg_freespacemap function)
  - What it is: returns blkno and approximate avail bytes from the FSM fork, rounded to 32 bytes.
  - What it does here: shows no reusable space after DELETE, then holes after VACUUM.
  - What it gives us: per-block free-space evidence.
- **DELETE** (DML operation)
  - What it is: marks matching row versions deleted for MVCC.
  - What it does here: removes even IDs, then a later quarter of rows.
  - What it gives us: fewer visible rows but unchanged file size.
- **VACUUM st_events** (maintenance command)
  - What it is: removes reclaimable dead versions and updates FSM and visibility information.
  - What it does here: makes deleted space available while retaining the file.
  - What it gives us: larger avail values and reused blocks.
- **generate_series(2001,2500)** (row generator)
  - What it is: produces 500 new IDs.
  - What it does here: inserts rows after vacuum.
  - What it gives us: ctid block numbers showing old-page reuse rather than a new tail block.
- **(ctid::text::point)[0]::int** (cast and subscripting expression)
  - What it is: converts ctid text to a point and extracts its first coordinate, the block number.
  - What it does here: groups newly inserted rows by heap block.
  - What it gives us: block distribution proving space reuse.
- **VACUUM FULL** (rewriting maintenance command)
  - What it is: compacts a relation by writing a replacement file.
  - What it does here: runs after the second delete and vacuum.
  - What it gives us: fewer pages and a different filenode; it needs ACCESS EXCLUSIVE and extra disk space.

`,
      setup: code`
drop table if exists st_events;
create table st_events(id int primary key, payload text) with (autovacuum_enabled = off);
insert into st_events select g, 'event-' || g from generate_series(1,1000) g;`,
      code: code`
select pg_relation_size('st_events') / 8192 as pages_before;
select blkno, avail from pg_freespace('st_events') order by blkno;

delete from st_events where id % 2 = 0;
select pg_relation_size('st_events') / 8192 as pages_after_delete;
select blkno, avail from pg_freespace('st_events') order by blkno;

-- VACUUM (module 04 explains it properly; here it is just the thing that
-- reclaims dead tuples and publishes the free space).
vacuum st_events;
select pg_relation_size('st_events') / 8192 as pages_after_vacuum;
select blkno, avail from pg_freespace('st_events') order by blkno;

-- New rows should land in the recycled space, not at the end of the file.
insert into st_events select g, 'reinserted-' || g from generate_series(2001, 2500) g;
select pg_relation_size('st_events') / 8192 as pages_after_reinsert;
select (ctid::text::point)[0]::int as blk, count(*)
from st_events where id >= 2001 group by 1 order by 1;

-- What it takes to actually give the space back. Delete a quarter of the rows,
-- VACUUM (recycles in place), then VACUUM FULL (rewrites the relation).
delete from st_events where id % 4 = 1;
vacuum st_events;
select count(*) as live_rows from st_events;
select pg_relation_size('st_events') / 8192 as pages_before_full,
       pg_relation_filenode('st_events') as filenode_before;
vacuum full st_events;
select pg_relation_size('st_events') / 8192 as pages_after_full,
       pg_relation_filenode('st_events') as filenode_after;`,
      expectedResult: code`
pages_before is 6 and every FSM entry reads avail = 0: the pages were packed by the initial insert.

After deleting 500 of the 1000 rows, pages_after_delete is still 6 and the FSM still says 0
everywhere. DELETE writes a transaction id into t_xmax and nothing else; the space is not free yet
because other snapshots may still need those versions.

After VACUUM, pages_after_vacuum is still 6 - the file did not shrink - but the FSM now reports
about 3680-3744 bytes free on blocks 0-4 and 6368 on the last, partly filled block.

Reinserting 500 rows leaves pages_after_reinsert at 6, and the new rows are spread over the old
pages (roughly 77, 78, 77, 78, 77 on blocks 0-4 and 113 on block 5), not appended to a block 6.

Deleting a further quarter (625 live_rows remain) and vacuuming again still leaves
pages_before_full = 6. VACUUM FULL is the only thing here that returns space to the filesystem:
pages_after_full is 4, and filenode_after is a different number from filenode_before, because
VACUUM FULL does not compact the file - it writes a brand new relation and swaps it in. That is
also why it needs an ACCESS EXCLUSIVE lock and twice the disk space, and why it is not something
you run on a live table.`,
      systemsLens: code`
Storage engines reclaim space by recycling blocks, not by returning them, because giving memory or
disk back to the allocator requires compaction and compaction requires either a lock or a rewrite.
This is why a table's file size is a high-water mark of its historical peak, why bloat is a
steady-state property you monitor rather than an error, and why "the deletes ran, why is the disk
still full" is a recurring incident. The same shape appears in heap fragmentation, in LSM trees
before compaction, and in log segments that only free on rotation.`,
      challenge: code`
Repeat the experiment but delete the FIRST half (id <= 500) instead of every other row, then vacuum
and check pg_relation_size. When does vacuum truncate the file, and why does deleting the tail
behave differently from deleting the head?`,
      caution: code`
VACUUM FULL rewrites the whole table under an ACCESS EXCLUSIVE lock. It is safe on this 6-page lab
table and dangerous on a production one.`,
    },
  ],
};
