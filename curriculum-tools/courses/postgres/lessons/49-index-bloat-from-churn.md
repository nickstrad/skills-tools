# Measure index churn before deciding to rebuild

slug: index-bloat-from-churn
category: indexes
difficulty: intermediate
tags: bloat, rebuilding-tables-and-indexes, btree, vacuum, write-amplification
prerequisites: btree-page-anatomy, vacuum-reclaims-in-place
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 20
revision: 4

## Overview
Apply two bounded rounds of indexed-key updates, vacuum between them and measure the resulting
index structure. Then compare the same range answer and plan before and after a concurrent rebuild.
Two rounds can demonstrate reuse; they cannot establish an indefinitely stable size or justify a
rebuild for every workload.

## Syntax breakdown
### In plain terms

Updating an indexed value adds a new index entry; it cannot simply overwrite the old entry because
other transactions may still need the old row version. Vacuum can remove dead entries, but it does
not generally return the already-sized index file to the operating system. You will measure the
holes produced by two bounded rounds of churn and then watch a concurrent rebuild pack a fresh copy.

### What you are learning

- **Index bloat:** Dead entries and page splits leave a larger, less dense structure after updates.
- **Density versus file size:** Removing dead entries does not necessarily reduce the relation's bytes.
- **Fragmentation:** Leaf links can visit pages in an order that is no longer sequential on disk.
- **Concurrent rebuilding:** REINDEX CONCURRENTLY creates and swaps a replacement while allowing access.

### Piece by piece

- **pgstatindex('ix_churn_k')** (pgstattuple extension function)
  - What it is: It scans a B-tree and reports structural and density metrics.
  - What it does here: It measures the fresh index, both churn rounds, and the rebuilt result.
  - What it gives us: index_size, tree_level, leaf_pages, empty_pages, deleted_pages, avg_leaf_density, and leaf_fragmentation.
- **UPDATE of indexed column k** (DML operation)
  - What it is: It changes the value used as an index key.
  - What it does here: It rewrites half the keys to scattered positions, causing new entries and page splits.
  - What it gives us: A larger, lower-density index for pgstatindex to measure.
- **VACUUM** (index cleanup command)
  - What it is: It removes index entries whose row versions are no longer needed.
  - What it does here: It clears dead entries between churn rounds but leaves the relation file size.
  - What it gives us: A clean measure of persistent empty space rather than live dead tuples.
- **pg_class.relfilenode** (catalog column)
  - What it is: The physical file identity for a relation.
  - What it does here: It is read before and after the rebuild.
  - What it gives us: A changed number proving the index was replaced by a new file.
- **REINDEX INDEX CONCURRENTLY** (online rebuild command)
  - What it is: It constructs a packed replacement index and swaps it in through a concurrent protocol.
  - What it does here: It reduces the bloated index to its original page count while allowing ordinary access, with lock waits and extra resource demand still possible.
  - What it gives us: Smaller index_size, higher avg_leaf_density, low fragmentation, and a new relfilenode.
- **pg_index.indisvalid** (catalog flag)
  - What it is: It says whether the planner may trust an index.
  - What it does here: The final query verifies the rebuilt index is valid.
  - What it gives us: indisvalid = true for the surviving index.
- **generate_series and repeat** (SQL functions)
  - What they are: generate_series emits IDs; repeat creates fixed-width padding text.
  - What they do here: They create 100000 keys and predictable row sizes for the churn test.
  - What they give us: A repeatable baseline for index size and leaf density.

- **SET enable_seqscan=off, EXPLAIN and \gset** (range comparison)
  - What they are: A diagnostic planner bias, an executed plan and one-row result capture.
  - What they do here: They expose index buffer work and preserve the post-churn range count and sum across the rebuild.
  - What they give us: unchanged_range=true and measured before/after work; RESET restores ordinary planning.

## Setup
```sql
drop table if exists ix_churn;
create table ix_churn(id int primary key, k int, pad text) with (autovacuum_enabled = off);
insert into ix_churn
select g, (g * 7919) % 100000, repeat('p', 40) from generate_series(1, 100000) g;
create index ix_churn_k on ix_churn(k);
vacuum (analyze) ix_churn;
```

## Run
```sql
select index_size, tree_level, leaf_pages, empty_pages, deleted_pages,
       avg_leaf_density, leaf_fragmentation
from pgstatindex('ix_churn_k');

-- Round 1: rewrite the indexed column of half the rows to scattered new values.
update ix_churn set k = (k * 31 + 17) % 100000 where id % 2 = 0;
vacuum ix_churn;
select index_size, leaf_pages, deleted_pages, avg_leaf_density, leaf_fragmentation
from pgstatindex('ix_churn_k');

-- Round 2: exactly the same amount of churn again.
update ix_churn set k = (k * 31 + 17) % 100000 where id % 2 = 0;
vacuum ix_churn;
select index_size, leaf_pages, deleted_pages, avg_leaf_density, leaf_fragmentation
from pgstatindex('ix_churn_k');

-- Compare the current post-churn answer under the same forced range path.
set enable_seqscan=off;
select count(*) as range_count,sum(k) as range_sum from ix_churn where k between 1000 and 2000 \gset
explain(analyze,buffers,costs off) select count(*) from ix_churn where k between 1000 and 2000;
-- Rebuild it. Note that the file identity changes.
select relfilenode from pg_class where relname = 'ix_churn_k';
reindex index concurrently ix_churn_k;
select relfilenode from pg_class where relname = 'ix_churn_k';

select index_size, leaf_pages, deleted_pages, avg_leaf_density, leaf_fragmentation
from pgstatindex('ix_churn_k');
select indexrelid::regclass as index, indisvalid from pg_index where indrelid = 'ix_churn'::regclass;
explain(analyze,buffers,costs off) select count(*) from ix_churn where k between 1000 and 2000;
select count(*)=:range_count and sum(k)=:range_sum as unchanged_range
from ix_churn where k between 1000 and 2000;
reset enable_seqscan;
```

## Expected result
The fresh index measured about2,260,992 bytes in validation. After the first bounded churn and
VACUUM it measured about4,513,792 bytes; a second round reused space with little further growth.
These two rounds are evidence for this fixture's reuse, not proof that every index converges to2x
size. Splits, reclamation, key distribution and old snapshots affect later behavior.

Immediately before rebuilding, capture the current range count and sum: the churn intentionally
changed keys, so comparing with the original pre-churn answer would test a different result set.
REINDEX CONCURRENTLY changes the file identity and restores a denser index in validation. Both
range aggregates stay equal and final indisvalid is true. The forced range plan makes index work
visible; it does not claim the planner's ordinary choice or that rebuilding necessarily lowers
latency. Record your buffers before and after even if they barely change.

Density and logical leaf order describe layout. They do not measure physical-device access order
or establish an application slowdown. Budget time, extra storage and lock waits for rebuilding,
then decide whether the measured benefit warrants those costs.

## Systems lens
Reclamation can make existing space reusable without producing a smaller file. A rebuild creates
a replacement structure and has its own resource and availability costs. Distinguish waste that
harms the workload from spare capacity the workload will reuse; a density metric alone cannot
make that decision.

## Optional variation
Using the current post-churn data, repeat only the Run block from `set enable_seqscan=off;` through
`reset enable_seqscan;`, changing all four `between 1000 and 2000` predicates to
`between 1000 and 20000`. This captures the wider range's count and sum before rebuilding, measures
both plans and checks `unchanged_range` afterward. It also measures the new file identity, index
bytes and validity, then restores ordinary planning. The aggregates must stay equal; buffer use,
density and bytes are observations, and another rebuild of an already dense index may yield little
benefit. Compare those measurements with the rebuild's time, storage and lock costs.
