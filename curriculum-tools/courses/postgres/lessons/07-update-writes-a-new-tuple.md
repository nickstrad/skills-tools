# UPDATE never overwrites: one row, three physical tuples

slug: update-writes-a-new-tuple
category: storage
difficulty: intermediate
tags: storage, mvcc, tuple-header, bloat, copy-on-write
prerequisites: page-header-and-line-pointers
safety: writes-data
run-in: tool
sessions: 1
min-version: 16
minutes: 15
revision: 2

## Overview
Update one row twice and then look at the page. You will find three tuples for one logical row,
chained together by t_ctid, with the transaction ids that created and killed each version written
into the tuple headers. This is the physical fact underneath everything module 03 says about MVCC,
and the reason bloat exists at all.

## Syntax breakdown
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

## Setup
```sql
drop table if exists st_versions;
create table st_versions(id int, v text) with (autovacuum_enabled = off);
insert into st_versions values (1, 'v1');
```

## Run
```sql
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
from pgstattuple('st_versions');
```

## Expected result
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
a full non-heap-only tuple. Lesson 8 makes that the whole point.

## Systems lens
Copy-on-write at the row level: a writer never mutates a version another reader might be looking
at, so readers need no locks and writers need no undo log. The cost is that every update creates
garbage that some background process must reclaim, and that the "current" address of a row changes
over time. Every multi-version store makes this trade - Postgres pays it in vacuum, InnoDB and
Oracle pay it in an undo segment that rollback and long readers must walk, LSM trees pay it in
compaction.

## Optional variation
Run "update st_versions set v = 'v4'" inside an open transaction and, from a second psql, read
heap_page_items. You can see the uncommitted version on the page before it is visible to anyone:
visibility is decided at read time from the header, not by hiding the bytes. Finish with ROLLBACK
in the writing session to discard the tentative v4 and close the transaction.
