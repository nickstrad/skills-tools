# Reusable space is different from a smaller file

slug: reusable-space-versus-file-size
category: vacuum-and-reuse
difficulty: intermediate
tags: vacuum, storage, reclamation
prerequisites: old-reader-retains-history
safety: privileged
run-in: tool
sessions: 1
min-version: 16
minutes: 25
revision: 1

## Overview
Delete a bounded table population, vacuum it without allowing tail truncation, then insert the same rows again. Compare logical rows, physical dead versions, free bytes and allocated heap bytes at every phase. Before running it, predict whether vacuum must make the heap smaller for the refill to fit without growth.

## Syntax breakdown
### In plain terms
PostgreSQL can reuse room inside an already allocated table file without returning those bytes to
the filesystem. DELETE makes rows invisible but does not by itself make their physical slots safe
for new rows. VACUUM removes dead versions that no snapshot needs and records the resulting room as
free space. This experiment holds file allocation steady so you can see reuse directly.

### Mechanism map

```text
One heap allocation, four observations

loaded:    4,000 visible | 0 dead     | little free | size S
DELETE:        0 visible | 4,000 dead | little free | size S
VACUUM:        0 visible | 0 dead     | much free   | size S
refill:    4,000 visible | 0 dead     | little free | size S

                    reusable space is consumed
VACUUM (TRUNCATE FALSE) ----------------------------> INSERT
         keeps the allocation                         reuses it
```

### Terminals and cleanup
Open one experiment terminal (Session A) and connect each psql session with:
```sh
psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off
```
The flags skip personal startup settings, select the learner socket, port, role and database, and
keep output in the terminal. Finish any earlier transaction with **ROLLBACK** before setup. Run every block in Session A in the order shown.
If you reach the fifteen-minute core limit or get stuck, ROLLBACK in the open sessions and follow
the lesson's exact cleanup command so its named pe_* table and session settings are removed.
### What you are learning
- Visible row count, dead tuple count and free bytes describe different stages of reclamation.
- Ordinary vacuum can make space reusable while the heap's allocated byte count stays unchanged.
- A stable heap size after refill is evidence of reuse here; it is not a complete storage or
  capacity diagnosis for a production relation.

### Piece by piece
- **SET lock_timeout = '3s'** bounds accidental waits for a table lock. If it fires, finish any
  earlier transaction that still uses pe_reuse, then rerun setup.
- **CREATE EXTENSION IF NOT EXISTS pgstattuple** enables the physical inspection function used by
  this lesson. It stays installed in the lab database for later experiments.
- **WITH (autovacuum_enabled = false)** disables automatic vacuum only for pe_reuse. That keeps a
  background worker from changing the table between our labelled samples; dropping the table also
  removes this setting.
- **generate_series(1, 4000)** supplies 4,000 integer IDs, and **repeat('x', 400)** gives each row
  a fixed-size text payload. Repeating the same insert after cleanup gives the refill the same shape.
- **VACUUM pe_reuse** in setup removes any setup-time debris and gives the first measurement a
  clean baseline. VACUUM must run outside an explicit BEGIN block.
- **pg_relation_size('pe_reuse')** reports bytes in the table's main heap fork. The labelled
  **heap_bytes** value deliberately excludes the primary-key index, TOAST storage, auxiliary forks
  and filesystem effects; total relation or disk usage can therefore tell a different story.
- **pgstattuple('pe_reuse')** scans the heap's physical pages. **dead_tuple_count** counts obsolete
  row versions that still occupy tuple space; **free_space** counts bytes already available for
  reuse. Compare those columns with **visible_rows**, which is an ordinary SQL row count.
- **DELETE FROM pe_reuse** makes all 4,000 rows invisible to later statements and leaves their old
  physical versions dead. The deleted sample separates logical disappearance from reclamation.
- **VACUUM (TRUNCATE FALSE) pe_reuse** reclaims eligible dead versions and updates free-space
  information. **TRUNCATE FALSE** forbids this vacuum from shortening empty pages at the end of the
  heap, so unchanged heap_bytes is an intentional control rather than a promise about every vacuum.
- **INSERT ... SELECT ... generate_series(...)** recreates the same 4,000 rows. Falling free_space
  with unchanged heap_bytes shows that PostgreSQL placed them in the allocation vacuum made reusable.
- **DROP TABLE pe_reuse** removes the experiment's heap, index and table-specific autovacuum setting.

## Caution
Use the supplied disposable learner lab and its postgres role. This experiment disables autovacuum only on pe_reuse and drops that table at the end; it does not change server-wide maintenance. If interrupted, finish any open transaction with ROLLBACK, then run DROP TABLE IF EXISTS pe_reuse before starting again.

## Setup
```sql
set lock_timeout = '3s';
create extension if not exists pgstattuple;
drop table if exists pe_reuse;
create table pe_reuse (id int primary key, payload text not null)
  with (autovacuum_enabled = false);
insert into pe_reuse
select g, repeat('x', 400) from generate_series(1, 4000) g;
vacuum pe_reuse;
```

## Run
```sql
-- Session A: record the clean, populated baseline.
select 'loaded' as phase,
       (select count(*) from pe_reuse) as visible_rows,
       pg_relation_size('pe_reuse') as heap_bytes,
       dead_tuple_count, free_space
from pgstattuple('pe_reuse');

-- Session A: make every row logically absent, then inspect the still-dead versions.
delete from pe_reuse;
select 'deleted' as phase,
       (select count(*) from pe_reuse) as visible_rows,
       pg_relation_size('pe_reuse') as heap_bytes,
       dead_tuple_count, free_space
from pgstattuple('pe_reuse');

-- Session A: reclaim in place while explicitly keeping the heap allocation.
vacuum (truncate false) pe_reuse;
select 'vacuumed' as phase,
       (select count(*) from pe_reuse) as visible_rows,
       pg_relation_size('pe_reuse') as heap_bytes,
       dead_tuple_count, free_space
from pgstattuple('pe_reuse');

-- Session A: refill with the same row shape, inspect reuse, then clean up.
insert into pe_reuse
select g, repeat('x', 400) from generate_series(1, 4000) g;
select 'refilled' as phase,
       (select count(*) from pe_reuse) as visible_rows,
       pg_relation_size('pe_reuse') as heap_bytes,
       dead_tuple_count, free_space
from pgstattuple('pe_reuse');
drop table pe_reuse;
```

## Expected result
The four labelled samples report visible_rows as 4000, 0, 0 and 4000. The deleted sample has
dead_tuple_count = 4000. After VACUUM, dead_tuple_count = 0 and free_space rises sharply while
heap_bytes remains exactly equal to the loaded value. The vacuumed table is empty but still owns
its allocated heap pages.

After the same 4,000 rows are inserted again, free_space falls close to its loaded value and
heap_bytes still equals the loaded value. The refill consumed reusable room instead of extending
the heap. On the validated PostgreSQL 16 lab, heap_bytes stayed at 1826816 while free_space went
from 76572 to 1819680 after vacuum and back to 76572 after refill. Exact bytes depend on page
layout; the unchanged heap size and consumed free space are the comparison that matters. The final command drops pe_reuse.

## Systems lens
Logical deletion, internal reclamation and filesystem release are separate state changes. For expected churn, reusable space can be healthy capacity rather than waste. pg_relation_size here measures only the heap's main fork, so include indexes, TOAST, auxiliary forks and filesystem allocation before making an operational storage decision. Ordinary vacuum may truncate empty tail pages when allowed. VACUUM FULL can compact a relation by rewriting it, but it needs replacement capacity and an exclusive lock; this lesson does not run it or justify scheduling one.
