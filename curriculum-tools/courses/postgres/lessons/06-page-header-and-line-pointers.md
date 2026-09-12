# Inside a page: the header, line pointers, and tuples

slug: page-header-and-line-pointers
category: storage
difficulty: intermediate
tags: storage, pages, slotted-page, pageinspect, ctid
prerequisites: table-is-a-file, install-lab-extensions
safety: read-only
run-in: tool
sessions: 1
min-version: 16
minutes: 15
revision: 2

## Overview
Open one 8 KB page with pageinspect and read its layout: a 24-byte header, an array of 4-byte line
pointers growing forwards, and tuples packed backwards from the end. The gap between them is the
page's free space. This slotted-page layout is why a row has a stable address (ctid) even though
the bytes move around inside the page.

## Syntax breakdown
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

## Setup
```sql
drop table if exists st_events;
create table st_events(id int primary key, payload text) with (autovacuum_enabled = off);
insert into st_events select g, 'event-' || g from generate_series(1,1000) g;
analyze st_events;
```

## Run
```sql
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
order by lp limit 3;
```

## Expected result
page_header shows pagesize 8192, version 4, special 8192 (a heap page has no special area),
lower 764 and upper 792, so free_bytes is 28 and line_pointers is (764 - 24) / 4 = 185. checksum
prints as 0 in this view even though data checksums are on, and lsn is a real WAL position such as
0/29902E0.

heap_page_items shows lp 1..185, all with lp_flags = 1 (normal) and lp_len = 36. Every tuple has
the same t_xmin (the single INSERT's transaction id, e.g. 788), t_xmax = 0 (nobody has deleted it),
and t_ctid pointing at itself: (0,1), (0,2), (0,3)... The rows returned by "select ctid, id" are
(0,1) id 1, (0,2) id 2, (0,3) id 3 -- the same addresses.

lp_off runs downwards as lp runs upwards: lp 1 at offset 8152, lp 2 at 8112, lp 3 at 8072, each
ending 8 bytes short of the previous one's start (36 bytes of tuple rounded up to 40 by MAXALIGN).

## Systems lens
A slotted page is indirection inside a block: the line pointer is the stable name, the offset is
the current location. That one level of indirection lets the page compact itself without telling
anyone, which is exactly what index entries need (they store the ctid, not a byte offset). The same
trick shows up in log-structured file systems, object stores with content-addressed chunks, and any
system that wants to move data without invalidating references.

## Optional variation
Inspect the last page (block 5): select * from page_header(get_raw_page('st_events', 5)). Compare
lower, upper and upper - lower with block 0. The last page holds fewer tuples, leaving a larger
gap between its line-pointer array and tuple storage.
