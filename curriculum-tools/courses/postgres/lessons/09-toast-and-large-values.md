# TOAST: what happens to a value that does not fit on a page

slug: toast-and-large-values
category: storage
difficulty: intermediate
tags: storage, toast, compression, chunking, large-values
prerequisites: page-header-and-line-pointers
safety: writes-data
run-in: tool
sessions: 1
min-version: 16
minutes: 15
revision: 5

## Overview
Create two rows with short labels and bodies of 100,000 characters: repeated x for id = 1 and
varied text for id = 2. Inspect how compression and TOAST chunk storage keep their heap tuples
small, then compare reading only the label with counting body characters for id = 2. Finally,
compare changing that row's label with replacing its body to explore when external storage is reused.

## Syntax breakdown
### In plain terms

A heap tuple must fit on a page (8 KB in this lab). With the default storage policy, PostgreSQL can compress large values and move them into a hidden TOAST table to keep the tuple small. External storage leaves a pointer in the heap tuple. A compressible value can remain inline; a large logical length alone does not imply external storage.

```text
100,000-character body
          |
   compression / external storage
          |
   +------+-------------------+
   |                          |
heap tuple                 TOAST table
[id | label | pointer] --> [chunk 0][chunk 1] ...
   |                          |
read label              read external body
```

The map shows the external-storage branch. The table has id, label, and body columns: id = 1 holds repeated x and id = 2 holds varied text, both 100,000 characters long. Compare logical length with stored size, heap-tuple length, and TOAST chunks to distinguish the storage branches. Then compare buffer accesses for two reads of id = 2, followed by label-only and body-replacement updates. The expected evidence below explains each comparison.

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
- **ALTER TABLE ... ALTER COLUMN body SET STORAGE external** (optional comparison DDL)
  - What it is: changes the TOAST policy to avoid compression while allowing external storage.
  - What it does here: changes the policy, then assigns a fresh copy of the same text to id = 1.
    The policy change alone does not rewrite the existing value.
  - What it gives us: a comparison of id = 1's stored size and the whole table's chunk count.
    Keep id = 2's existing chunks in mind when interpreting that total.

## Setup
```sql
drop table if exists st_toast;
create table st_toast(id int primary key, label text, body text);
```

## Run
```sql
\x auto
select reltoastrelid::regclass as toast_table from pg_class where relname = 'st_toast';

-- 1. Create the two rows introduced above: equal character counts, different text.
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

-- 3. Compare the same id = 2, fetching label versus counting body characters.
-- Compare the execution Buffers lines; each query returns one result.
explain (analyze, buffers, costs off, timing off, summary off)
  select label from st_toast where id = 2;
explain (analyze, buffers, costs off, timing off, summary off)
  select length(body) from st_toast where id = 2;

-- 4. Record a baseline, change only id = 2's label, then replace its body.
-- Compare all three values/chunks/size outputs.
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

-- Keep this psql session open for the optional storage-policy comparison below.
```

## Expected result
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
unchanged allocated file size alone never proves that no write occurred.

## Systems lens
Chunking plus an indirection pointer is a common way to fit unbounded values into page-oriented
storage: TOAST here, overflow pages elsewhere, or a separate object store. It adds an index walk and
chunk reads when code needs the value, while changes that leave the value unchanged can retain the
existing external datum. Measure actual access patterns before splitting values into another table or
service; a split adds its own joins, integrity rules, and failure modes.

## Optional variation
Force a controlled replacement of row 1's value without compression:

```sql
alter table st_toast alter column body set storage external;
update st_toast set body = repeat('x', 100000) where id = 1;
select id, pg_column_size(body) as stored_bytes from st_toast where id = 1;
select count(*) as chunks, max(length(chunk_data)) as chunk_bytes from :toast_name;
```

Compare the new stored size and chunks with the lesson's initial values. Disabling compression for
the freshly assigned repeated value increases its stored size and adds external chunks. The chunk
count covers both rows. Before changing an application's storage policy, compare payload-fetch
frequency, stored bytes, and buffer work for its actual queries.

### Cleanup

After finishing either comparison, repeat Setup's first statement, `drop table if exists st_toast;`,
to remove this experiment's table and its TOAST storage. Keep the pageinspect extension for later
storage lessons.
