# Open a B-tree: metapage, root, internal pages, leaves

slug: btree-page-anatomy
category: indexes
difficulty: intermediate
tags: btree, index-access-methods, pages-and-tuples, index-scans
prerequisites: page-header-and-line-pointers, install-lab-extensions
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 20
revision: 4

## Overview
Inspect the root and leaves of two B-trees containing the same 100,000 unique logical keys. Both
indexes are bulk-built after loading the table, so the comparison avoids mixing insertion and build
histories. Compare their integer and wide-text representations, then locate one leaf entry by its
heap address; page layout and cache behavior are separate observations.

## Syntax breakdown
### In plain terms

This experiment opens an index file as a tree of 8 KB pages. You compare a narrow integer key with a
wide text key, identify the root and leaf levels, and follow one key to the heap row it references.
The output turns the abstract idea of an index into pages, links, item offsets, and physical row
addresses that can be checked for consistency.

### What you are learning

- **B-tree fanout:** Wider keys fit fewer entries per page, increasing index size and sometimes height.
- **Internal versus leaf pages:** Internal pages choose child blocks; leaves hold searchable keys and heap addresses.
- **High keys and sibling links:** Boundary entries and links let scans move between leaf pages in key order.
- **Structural checking:** amcheck validates ordering and downlink invariants rather than returning query results.

### Piece by piece

- **pg_relation_size(...) / 8192** (size function and page conversion)
  - What it is: pg_relation_size returns relation bytes; dividing by 8192 converts them to PostgreSQL pages.
  - What it does here: It compares heap and index footprints for equal row counts.
  - What it gives us: Page counts showing the storage cost of wide keys.
- **bt_metap(index)** (pageinspect function)
  - What it is: It decodes block zero, the B-tree metapage.
  - What it does here: It identifies root, level, fastroot, fastlevel, and allequalimage for each index.
  - What it gives us: Tree height and root block; level 1 means root plus leaves.
- **bt_page_stats(index, blkno)** (pageinspect function)
  - What it is: It summarizes one B-tree page by block number.
  - What it does here: It groups the wide index by btpo_level and inspects root and leaf blocks.
  - What it gives us: type, live_items, avg_item_size, free_size, btpo_prev, btpo_next, and btpo_level.
- **bt_page_items(index, blkno)** (pageinspect function)
  - What it is: It lists individual items stored on one index page.
  - What it does here: It shows internal downlinks, leaf heap tuple addresses, item lengths, and key bytes.
  - What it gives us: itemoffset, ctid, itemlen, and data; item 1 is a high key except on the rightmost page.
- **generate_series and LATERAL** (SQL row generator and per-row subquery)
  - What they are: generate_series emits candidate block numbers; LATERAL lets page inspection use each number.
  - What they do here: They census every non-metapage block and search all leaves for one heap ctid.
  - What they give us: A per-level page count and the exact leaf/item containing id 50000.
- **ctid** (system column)
  - What it is: A physical tuple address written as block and item offset.
  - What it does here: The heap ctid is matched to the index item's ctid.
  - What it gives us: The bridge from an indexed key to its table page and tuple slot.
- **\gset and :leaf** (psql variable capture and substitution)
  - What they are: \gset saves a single-row query's columns as psql variables; :leaf substitutes one later.
  - What they do here: They capture the discovered leaf block instead of hard-coding it.
  - What they give us: Repeatable inspection of the exact page found by the search.
- **bt_index_check(index)** (amcheck function)
  - What it is: It checks B-tree ordering and link invariants and returns void on success.
  - What it does here: It validates both indexes after manual inspection.
  - What it gives us: A successful statement with blank values; corruption would raise an error.
- **generate_series and lpad** (SQL functions)
  - What they are: generate_series emits the 100000 test IDs; lpad left-pads text to a fixed width.
  - What they do here: They create distinct integer keys and corresponding 40-character text keys.
  - What they give us: A controlled key-width comparison.
- **VACUUM (ANALYZE)** (maintenance command)
  - What it is: It cleans eligible tuples and refreshes planner statistics.
  - What it does here: It prepares the index inspection with current row counts.
  - What it gives us: A stable, analyzed table before comparing the bulk-built structures; maintenance can affect layout in other states.

## Setup
```sql
drop table if exists ix_btree;
create table ix_btree(id int not null, wide text collate "C" not null, payload text) with (autovacuum_enabled = off);
insert into ix_btree
select g, 'key-' || lpad(g::text, 36, '0'), 'row-' || g from generate_series(1, 100000) g;
alter table ix_btree add primary key(id);
create unique index ix_btree_wide_idx on ix_btree(wide);
vacuum (analyze) ix_btree;
```

## Run
```sql
-- Two indexes over exactly the same 100000 rows, using narrow and wide key representations with matched bulk-build history.
select pg_relation_size('ix_btree') / 8192 as heap_pages,
       pg_relation_size('ix_btree_pkey') / 8192 as pkey_pages,
       pg_relation_size('ix_btree_wide_idx') / 8192 as wide_pages;

-- The metapage (block 0) says where the root is and how tall the tree is.
select 'pkey (int)' as index, root, level, fastroot, fastlevel, allequalimage
from bt_metap('ix_btree_pkey')
union all
select 'wide (text)', root, level, fastroot, fastlevel, allequalimage
from bt_metap('ix_btree_wide_idx');

-- Every page of the wide index, grouped by its level. Level 0 is the leaf level.
select btpo_level, type, count(*) as pages,
       round(avg(live_items)) as avg_items, round(avg(free_size)) as avg_free_bytes
from generate_series(1, pg_relation_size('ix_btree_wide_idx') / 8192 - 1) blk,
     lateral bt_page_stats('ix_btree_wide_idx', blk::int)
group by 1, 2 order by 1 desc;

-- The root of the int index: one downlink per leaf page.
select blkno, type, live_items, avg_item_size, free_size, btpo_level
from bt_page_stats('ix_btree_pkey', (select root::int from bt_metap('ix_btree_pkey')));

select itemoffset, ctid as downlink, itemlen, data as key_bytes
from bt_page_items('ix_btree_pkey', (select root::int from bt_metap('ix_btree_pkey'))) order by itemoffset limit 4;

-- A leaf page: item 1 is the high key, the rest are real entries, and btpo_prev /
-- btpo_next chain the leaf level together in key order.
select blkno, type, live_items, btpo_prev, btpo_next, btpo_level
from bt_page_stats('ix_btree_pkey', 2);

select itemoffset, ctid as heap_tuple, itemlen, data as key_bytes
from bt_page_items('ix_btree_pkey', 2) order by itemoffset limit 3;

-- Now locate the leaf entry by scanning the diagnostic page inventory. Where does id = 50000 live, physically?
select ctid as heap_ctid from ix_btree where id = 50000;

select b.blkno as leaf_page, i.itemoffset, i.ctid as heap_tuple, i.data as key_bytes
from generate_series(1, pg_relation_size('ix_btree_pkey') / 8192 - 1) b(blkno),
     lateral bt_page_stats('ix_btree_pkey', b.blkno::int) st,
     lateral bt_page_items('ix_btree_pkey', b.blkno::int) i
where st.btpo_level = 0 and (st.btpo_next = 0 or i.itemoffset > 1) and i.ctid = (select ctid from ix_btree where id = 50000);

-- Capture that leaf's block number so the next queries do not hard-code it.
select b.blkno as leaf
from generate_series(1, pg_relation_size('ix_btree_pkey') / 8192 - 1) b(blkno),
     lateral bt_page_stats('ix_btree_pkey', b.blkno::int) st,
     lateral bt_page_items('ix_btree_pkey', b.blkno::int) i
where st.btpo_level = 0 and (st.btpo_next = 0 or i.itemoffset > 1) and i.ctid = (select ctid from ix_btree where id = 50000) \gset

select blkno, type, live_items, btpo_prev, btpo_next from bt_page_stats('ix_btree_pkey', :leaf);
select itemoffset, ctid as heap_tuple, data as key_bytes
from bt_page_items('ix_btree_pkey', :leaf) order by itemoffset limit 2;

-- amcheck asserts the invariants you just read by eye.
select bt_index_check('ix_btree_pkey') as pkey_checked,
       bt_index_check('ix_btree_wide_idx') as wide_checked;
```

## Expected result
Both indexes contain 100,000 distinct logical keys built from the same rows. In the validated
8 KiB-page fixture the integer index occupied about276 pages at root level1 and the 40-character
text index about831 pages at root level2. This compares two key representations, including their
type and collation; it is not a byte-width-only microbenchmark. Inspect your measured page counts
and levels instead of assuming a fixed fanout or height threshold.

Level0 contains leaves, while higher levels direct searches to children. The metapage supplies the
root block rather than requiring a fixed block number. The leaf census locates the actual entry for
id50000 while excluding high keys and internal downlinks. That search scans the diagnostic page
inventory; it is not a simulation of a normal root-to-leaf index lookup.

A tree with an extra level can require extra traversal and has a larger cache footprint, but these
page-inspection calls do not measure device reads per query. Root metadata and pages can be cached.
bt_index_check succeeds with blank void results; that verifies its structural checks, not every
possible corruption or application invariant.

## Systems lens
Key representation affects the amount of ordered lookup state a system must retain. Wider keys can
reduce entries per page and increase cache footprint or height. Measure both traversal and workload
cost before choosing a compact representation: truncation or hashing needs its own collision and
correctness policy. Ordered leaves also support range continuation, unlike an unordered lookup map.

## Optional variation
Build a composite (wide,payload) index over the same rows, compare its bytes and root level with the
wide-only index, then drop it. Does a larger footprint necessarily add another tree level?
