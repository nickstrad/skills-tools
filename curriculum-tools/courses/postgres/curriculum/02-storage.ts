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
      title: "HOT updates: how reserved page space can make writes cheaper",
      difficulty: "advanced",
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 20,
      prerequisites: ["update-writes-a-new-tuple"],
      revision: 4,
      overview: code`
A Heap-Only Tuple (HOT) update can put a replacement row version on the old row's page without a
new index entry, but it needs page space and unchanged indexed columns. Compare matched tables at
fillfactor 100 and 70, first with one long transaction and then with separately committed updates.
The counters, page counts, and tuple pointers show why both free space and transaction shape matter.`,
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

These matched tables receive the same logical updates, but one reserves 30 percent of each page at
initial load. PostgreSQL can make a HOT update when a non-indexed change fits on the old page.
You will compare one transaction with separate autocommit statements, because commit boundaries
change when an old version can become removable during later page access.

### What you are learning

- Fillfactor reserves page room for future updates, exchanging initial density for an opportunity
  to avoid index maintenance.
- HOT requires an unchanged indexed key and room for the replacement version on its old heap page.
- Transaction boundaries affect when old versions become removable; counters and page pointers are
  evidence, rather than a promise of a fixed HOT percentage.

### Piece by piece

- **fillfactor = 100 / fillfactor = 70** (table storage parameter)
  - What it is: the target percentage of each heap page filled by initial inserts.
  - What it does here: compares a packed table with one reserving space.
  - What it gives us: different starting page counts and HOT capacity.
- **DO ... FOR ... LOOP** (PL/pgSQL block)
  - What it is: an anonymous server-side procedure with a loop.
  - What it does here: repeats the non-indexed tag update 20 times for 100 rows in each table.
  - What it gives us: 2000 updates per table for a fair comparison.
- **CREATE TABLE ... (LIKE ... INCLUDING ALL)** (DDL copying clause)
  - What it is: creates a new table from another table's definition and copies its constraints and
    indexes as well as its columns.
  - What it does here: gives the separately committed case fresh tables with the same primary-key
    index as the first case.
  - What it gives us: a fair indexed-id phase; a plain LIKE would omit that index.
- **\\gexec** (psql query-result execution command)
  - What it is: sends each SQL command returned by the preceding query back to PostgreSQL.
  - What it does here: runs each generated UPDATE as its own psql statement, so normal autocommit
    gives every round a separate transaction.
  - What it gives us: a controlled contrast with the DO block, which is one transaction.
- **pg_stat_force_next_flush() and pg_stat_clear_snapshot()** (statistics functions)
  - What they are: the first requests a statistics flush; the second discards this session's cached
    statistics snapshot.
  - What they do here: make the following pg_stat_user_tables read as fresh as the server can provide.
  - What they give us: counters that can be compared without relying on an arbitrary sleep.
- **pg_stat_user_tables** (statistics view)
  - What it is: per-table update counters.
  - What it does here: reports n_tup_upd, n_tup_hot_upd, and pages.
  - What it gives us: total updates, HOT updates, their ratio, and page counts for each matched table.
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
  - What they do here: inspect line-pointer state and a tuple's physical target after the workload.
  - What they give us: flag 1 normal, 2 redirect, 3 dead, or 0 unused; redirects and changed t_ctid
    are qualitative chain evidence, while ordinary page pruning can affect other dead tuples too.
- **UPDATE ... SET id = id + 1000** (indexed-column update)
  - What it is: an update of the primary-key column, whose B-tree entry must change.
  - What it does here: provides a phase that cannot qualify as HOT.
  - What it gives us: total-update growth while the HOT counter remains unchanged.
- **DROP TABLE IF EXISTS / CREATE TABLE / INSERT ... generate_series** (challenge reset)
  - What they are: idempotent lab cleanup followed by the same primary-key schema and 100-row load
    used in the controlled cases.
  - What they do here: create fresh matched fillfactor-100 and fillfactor-80 histories.
  - What they give us: a comparison not distorted by the preceding twenty-round cases.
- **pg_stat_force_next_flush() followed by pg_stat_clear_snapshot()** (challenge statistics read)
  - What they are: a standalone request for the updater to publish counters, followed by discarding
    this session's cached statistics snapshot before reading it.
  - What they do here: occur after the ten separate update rounds and before the comparison query.
  - What they give us: fresh total and HOT counter deltas for just the variation tables.

`,
      setup: code`
drop table if exists st_hot_tx_100, st_hot_tx_70, st_hot_commit_100, st_hot_commit_70;
create table st_hot_tx_100(id int primary key, tag text, payload text)
  with (fillfactor = 100, autovacuum_enabled = off);
create table st_hot_tx_70(id int primary key, tag text, payload text)
  with (fillfactor = 70, autovacuum_enabled = off);
insert into st_hot_tx_100 select g, 'a', repeat('p', 200) from generate_series(1, 100) g;
insert into st_hot_tx_70  select g, 'a', repeat('p', 200) from generate_series(1, 100) g;`,
      code: code`
select relname, reloptions, pg_relation_size(oid) / current_setting('block_size')::int as pages
from pg_class where relname in ('st_hot_tx_100','st_hot_tx_70') order by relname;

-- Controlled case 1: the complete loop is one transaction.
do $sql$
begin
  for i in 1..20 loop
    update st_hot_tx_100 set tag = 'tx-' || i;
    update st_hot_tx_70  set tag = 'tx-' || i;
  end loop;
end
$sql$;
select pg_stat_force_next_flush();
select pg_stat_clear_snapshot();
select relname, n_tup_upd, n_tup_hot_upd,
       round(100.0 * n_tup_hot_upd / nullif(n_tup_upd,0), 1) as hot_pct,
       pg_relation_size(relid) / current_setting('block_size')::int as pages
from pg_stat_user_tables where relname in ('st_hot_tx_100','st_hot_tx_70') order by relname;

-- Controlled case 2 uses fresh matched tables, not the first case's history.
create table st_hot_commit_100 (like st_hot_tx_100 including all)
  with (fillfactor = 100, autovacuum_enabled = off);
create table st_hot_commit_70  (like st_hot_tx_70 including all)
  with (fillfactor = 70, autovacuum_enabled = off);
insert into st_hot_commit_100 select g, 'a', repeat('p', 200) from generate_series(1, 100) g;
insert into st_hot_commit_70  select g, 'a', repeat('p', 200) from generate_series(1, 100) g;

-- Each result is an UPDATE. psql's normal autocommit commits every \gexec command separately.
select format('update %I set tag = %L', relname, 'commit-' || round_no)
from generate_series(1, 20) round_no
cross join (values ('st_hot_commit_100'), ('st_hot_commit_70')) as t(relname)
order by round_no, relname
\gexec

select pg_stat_force_next_flush();
select pg_stat_clear_snapshot();
select relname, n_tup_upd, n_tup_hot_upd,
       round(100.0 * n_tup_hot_upd / nullif(n_tup_upd,0), 1) as hot_pct,
       pg_relation_size(relid) / current_setting('block_size')::int as pages
from pg_stat_user_tables where relname in ('st_hot_commit_100','st_hot_commit_70') order by relname;

-- An indexed-key change cannot be HOT. The total grows; the HOT counter does not.
select n_tup_upd as total_before, n_tup_hot_upd as hot_before
from pg_stat_user_tables where relname = 'st_hot_commit_70';
update st_hot_commit_70 set id = id + 1000;
select pg_stat_force_next_flush();
select pg_stat_clear_snapshot();
select n_tup_upd as total_after, n_tup_hot_upd as hot_after
from pg_stat_user_tables where relname = 'st_hot_commit_70';

-- Flags and t_ctid are physical chain evidence, not fixed quotas.
select lp, lp_flags, t_ctid
from heap_page_items(get_raw_page('st_hot_commit_70', 0))
where lp_flags <> 0
order by lp
limit 25;`,
      expectedResult: code`
Each controlled case reports 2,000 total non-indexed updates for each table. The fillfactor-70 table
starts with at least as many pages as its fillfactor-100 mate because it reserves room. Its HOT ratio
will often be higher, but neither a packed table's ratio nor either page count has a universal fixed
value: tuple size, page history, and opportunistic pruning all affect the outcome.

The second pair is fresh, so its separately committed rounds are not contaminated by the long
transaction's history. Compare its HOT ratio and pages with the first pair. A committed old version
can become removable before a later statement, while versions made earlier in one still-open
transaction cannot; page access and pruning determine how much of that opportunity is used.

For st_hot_commit_70, total_after is 100 greater than total_before after the indexed-id phase, while
hot_after equals hot_before. The page sample may contain normal, redirect, dead, or unused slots;
a redirect and a changed t_ctid show an in-page chain. Other dead tuples may be pruned too, so flags
are evidence to interpret with the counters, not a HOT-only census.`,
      systemsLens: code`
Reserved page space can lower update work when the workload repeatedly changes non-indexed columns,
but it costs density and can hurt read locality or cache use. The appropriate fillfactor depends on
the row width, update pattern, indexes, and space budget. This resembles B-tree fillfactor and slack
in other write-optimized structures: capacity reserved for future change is valuable only when that
change actually arrives.`,
      challenge: code`
Reset a fresh matched pair, then run the same ten separately committed tag-update rounds at
fillfactor 100 and 80. This is independent of the earlier tables:

drop table if exists st_hot_var_100, st_hot_var_80;
create table st_hot_var_100(id int primary key, tag text, payload text)
  with (fillfactor = 100, autovacuum_enabled = off);
create table st_hot_var_80(id int primary key, tag text, payload text)
  with (fillfactor = 80, autovacuum_enabled = off);
insert into st_hot_var_100 select g, 'a', repeat('p', 200) from generate_series(1, 100) g;
insert into st_hot_var_80  select g, 'a', repeat('p', 200) from generate_series(1, 100) g;
select format('update %I set tag = %L', relname, 'variation-' || round_no)
from generate_series(1, 10) round_no
cross join (values ('st_hot_var_100'), ('st_hot_var_80')) as t(relname)
order by round_no, relname
\gexec

-- Issue this as its own updater statement, then read a fresh statistics snapshot.
select pg_stat_force_next_flush();
select pg_stat_clear_snapshot();
select relname, n_tup_upd, n_tup_hot_upd,
       round(100.0 * n_tup_hot_upd / nullif(n_tup_upd, 0), 1) as hot_pct,
       pg_relation_size(relid) / current_setting('block_size')::int as pages
from pg_stat_user_tables
where relname in ('st_hot_var_100', 'st_hot_var_80')
order by relname;

Each table should show 1,000 total updates. Compare their HOT counters and pages as a workload
measurement, not a fixed promise. For a workload that mostly reads rows after a one-time load,
would the extra reserved pages still be a good trade?`,
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
      revision: 5,
      overview: code`
Create two rows with short labels and bodies of 100,000 characters: repeated x for id = 1 and
varied text for id = 2. Inspect how compression and TOAST chunk storage keep their heap tuples
small, then compare reading only the label with counting body characters for id = 2. Finally,
compare changing that row's label with replacing its body to explore when external storage is reused.`,
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

A row cannot contain an arbitrarily large value because it must fit on an 8 KB page. PostgreSQL tries compression first; if the value still does not fit, it stores chunks in a hidden TOAST table and leaves a pointer in the row. The table has id, label, and body columns: id = 1 holds repeated x and id = 2 holds varied text, both 100,000 characters long. First inspect their storage, then compare two reads of id = 2, and finally compare label and body updates. Keep the output for pgcoach 9 inspect.

### What you are learning

- Logical length and on-disk size differ when compression is possible.
- TOAST uses an indirection pointer, chunk rows, and an index to keep the heap tuple small.
- Out-of-line values can require more buffer accesses even when the SQL result has one row.

### Piece by piece

- **\x auto** (psql output format)
  - What it is: automatically switches wide results to vertical display.
  - What it does here: keeps inspection output readable in a narrow terminal.
  - What it gives us: the same named fields regardless of display orientation.
- **reltoastrelid::regclass** (catalog field and cast)
  - What it is: pg_class's OID for the hidden TOAST relation, cast to a readable name.
  - What it does here: identifies the side table for st_toast.
  - What it gives us: the toast_table name used to inspect chunks.
- **repeat, generate_series, md5, and string_agg** (SQL functions)
  - What they are: repeat duplicates text; generate_series supplies integers 1 through 3125;
    md5 turns each integer cast to text into 32 hexadecimal characters; string_agg joins those
    strings with an empty separator. This generates varied test data, not random secrets.
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
  - What it is: get_raw_page reads heap page 0; heap_page_items decodes its row-version slots.
    These functions come from the pageinspect extension installed earlier in the lab.
  - What it does here: inspects the initial tuples, then the page after both updates.
  - What it gives us: lp is a physical slot number, not the table's id; lp_len is the tuple's
    byte length. In the final query, t_ctid gives a tuple location or an update-chain link.
    Old row versions can remain on the page after they stop appearing in an ordinary SELECT.
- **chunk_id, chunk_seq, chunk_data** (TOAST columns)
  - What they are: the external value's identifier, chunk ordering number, and chunk bytes.
  - What they do here: count and inspect chunks in the relation named by :toast_name, the
    psql variable saved earlier.
  - What it gives us: chunks is the visible chunk count; first_seq and last_seq bound their
    order, starting at zero; chunk_bytes is the largest chunk in bytes. Later, count(distinct
    chunk_id) AS values counts visible external values, not every old version still on disk.
- **EXPLAIN (ANALYZE, BUFFERS, costs off, timing off, summary off)** (plan options)
  - What it is: reports a query's execution plan, with these options:
    - ANALYZE executes the query and records actual work.
    - BUFFERS reports page accesses through PostgreSQL's buffer cache.
    - COSTS OFF hides planner cost estimates.
    - TIMING OFF omits per-node timing while retaining actual rows and buffer counts.
    - SUMMARY OFF omits the final timing summary.
  - What it does here: compares selecting label with evaluating length(body), both WHERE id = 2.
  - What it gives us: shared buffer activity; accessing the out-of-line payload normally needs more
    buffer work than reading the label alone. A shared hit accesses a page already in the cache;
    a shared read brings one into the cache and may still be served by the operating system.
    Use the top execution node's totals; parent counts include child work. Planning buffers
    describe planning work, so keep them out of this execution comparison.
- **UPDATE ... SET label / UPDATE ... SET body** (row-version updates)
  - What they are: updates that replace the heap row version, first leaving the payload unchanged
    and then supplying a new value.
  - What they do here: separate a label-only change from replacement of an out-of-line datum.
  - What they give us: chunk and relation-size evidence that unchanged external values are normally
    preserved, while a replacement creates a new external value. The second update generates
    another 100,000-character body, using 'new-' || g to change the input to md5. The size
    query uses :'toast_name' to quote the saved relation name as a SQL string argument.
- **ALTER TABLE ... ALTER COLUMN body SET STORAGE external** (challenge DDL)
  - What it is: changes the TOAST policy to avoid compression while allowing external storage.
  - What it does here: changes the policy, then assigns a fresh copy of the same text to id = 1.
    The policy change alone does not rewrite the existing value.
  - What it gives us: a comparison of id = 1's stored size and the whole table's chunk count.
    Keep id = 2's existing chunks in mind when interpreting that total.

`,
      setup: code`
drop table if exists st_toast;
create table st_toast(id int primary key, label text, body text);`,
      code: code`
\x auto
select reltoastrelid::regclass as toast_table from pg_class where relname = 'st_toast';

-- 1. Create the two rows introduced in start: equal character counts, different text.
insert into st_toast values (1, 'compressible', repeat('x', 100000));
insert into st_toast values (2, 'incompressible',
  (select string_agg(md5(g::text), '') from generate_series(1, 3125) g));

-- 2. Inspect logical length, stored size, and the heap/TOAST layout. Save this output.
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

-- 3. Test your prediction: same id = 2, fetching label versus counting body characters.
-- Compare the execution Buffers lines; each query returns one result.
explain (analyze, buffers, costs off, timing off, summary off)
  select label from st_toast where id = 2;
explain (analyze, buffers, costs off, timing off, summary off)
  select length(body) from st_toast where id = 2;

-- 4. Record a baseline, change only id = 2's label, then replace its body.
-- Save all three values/chunks/size outputs to compare in inspect.
select count(distinct chunk_id) as values, count(*) as chunks,
       pg_relation_size(:'toast_name') as toast_bytes_before
from :toast_name;
update st_toast set label = 'incompressible-renamed' where id = 2;
select count(distinct chunk_id) as values, count(*) as chunks,
       pg_relation_size(:'toast_name') as toast_bytes_after_label
from :toast_name;
update st_toast set body = (select string_agg(md5(('new-' || g)::text), '')
                            from generate_series(1, 3125) g)
where id = 2;
select count(distinct chunk_id) as values, count(*) as chunks,
       pg_relation_size(:'toast_name') as toast_bytes_after_body
from :toast_name;
select lp, lp_len, t_ctid from heap_page_items(get_raw_page('st_toast', 0)) order by lp;

-- Keep this psql session open for the variation. Next: pgcoach 9 inspect.`,
      expectedResult: code`
The TOAST relation name contains this table's changing OID. Both values are 100,000 characters, but
the repeated value has a far smaller stored datum after compression, while the varied value is stored
out of line. The heap stays small; heap_page_items shows a compact inline tuple and an external-value
pointer, while the TOAST relation reports ordered chunks with chunk_seq beginning at zero.

The narrow label query has an index/heap plan that does not need TOAST chunks. The length(body) query
has more shared hits or reads because PostgreSQL retrieves the external value through its TOAST index
and chunks. Exact counters depend on what was already in shared buffers; a shared-buffer read can be
satisfied by the operating-system cache, so it is not proof of device I/O.

The chunk count and TOAST relation size are normally unchanged after the label-only update: the new
heap version still refers to the existing out-of-line datum. Replacing body creates a new external
value, so chunk population or relation allocation can grow until cleanup reclaims old versions. An
unchanged allocated file size alone never proves that no write occurred.`,
      systemsLens: code`
Chunking plus an indirection pointer is a common way to fit unbounded values into page-oriented
storage: TOAST here, overflow pages elsewhere, or a separate object store. It adds an index walk and
chunk reads when code needs the value, while changes that leave the value unchanged can retain the
existing external datum. Measure actual access patterns before splitting values into another table or
service; a split adds its own joins, integrity rules, and failure modes.`,
      challenge: code`
Force a controlled replacement of row 1's value without compression:

alter table st_toast alter column body set storage external;
update st_toast set body = repeat('x', 100000) where id = 1;
select id, pg_column_size(body) as stored_bytes from st_toast where id = 1;
select count(*) as chunks, max(length(chunk_data)) as chunk_bytes from :toast_name;

Compare the new stored size and chunks with the lesson's initial values. For a value an application
always reads in full, versus one it only sometimes fetches, what would you measure before changing
storage policy?`,
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
      revision: 4,
      studyCheckpoint: {
        core: [
          {
            source: "PostgreSQL 14 Internals",
            locator:
              `Chapter 1 §1.1, subheadings "Files and Forks" and "Pages" (printed pp. 24–28)`,
          },
          {
            source: "PostgreSQL 14 Internals",
            locator: `Chapter 3 §3.1 "Page Structure" (printed pp. 62–64)`,
          },
        ],
        rationale: code`
You have observed relation files, page allocation, tuple layout, cached pages, and dirty-page
flushing. Read these bounded sections to consolidate the physical model before the course moves into
transaction IDs. Skip exact example filenames, relfilenodes, and catalog output in the book.`,
      },
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

- **CREATE TABLE AS and pg_prewarm(..., 'buffer')** (challenge tools)
  - What they are: a query-built lab table and an extension function that loads a relation into
    shared buffers.
  - What they do here: create one controlled working-set variation and then warm it deliberately.
  - What they give us: a before/after buffer contrast, while reminding us that one sample cannot
    establish a production cache size.

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
st_cold's page count and shared_buffers setting establish the scale of this run. For the first scan,
the EXPLAIN line's shared hit plus shared read is normally close to the relation's scanned blocks;
the identical second scan normally has fewer reads, often none. The exact split depends on cache
contents and activity. A PostgreSQL "read" means shared_buffers did not already contain that block;
the operating system may still serve it from memory rather than a storage device.

Immediately after CHECKPOINT, st_events has resident buffers with dirty = 0. The UPDATE produces one
or more isdirty rows; a scan may also dirty pages by setting hint bits. After the second CHECKPOINT,
the same relation buffers can remain resident while dirty returns to 0. This proves a checkpoint
flushes dirty buffers; it does not evict them.`,
      systemsLens: code`
Three properties to carry away. (1) It is a write-back cache: a committed transaction is durable
because its WAL record is on disk, not because its page is - the page may sit dirty in memory for
minutes. (2) The checkpoint is the knob that trades steady-state write I/O against recovery time,
the same trade as an LSM's memtable flush interval or a Raft snapshot interval. (3) Scan-resistant
ring buffers mean a big sequential job does not evict everyone else's working set, which is why
"just look at the cache hit ratio" is a poor capacity signal.`,
      challenge: code`
Create one controlled working set, then compare an ordinary first scan with deliberate warming:

drop table if exists st_working_set;
create table st_working_set as select * from st_cold where id <= 10000;
explain (analyze, buffers, costs off, timing off, summary off) select count(*) from st_working_set;
select pg_prewarm('st_working_set', 'buffer');
explain (analyze, buffers, costs off, timing off, summary off) select count(*) from st_working_set;

Does warming remove shared reads for this table on this run? That answer alone cannot size
shared_buffers: the production working set, concurrent relations, operating-system cache, and
latency requirements still matter.`,
    },
  ],
};
