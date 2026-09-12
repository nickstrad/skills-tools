# Two versions of one row, live at the same time

slug: two-sessions-see-different-versions
category: mvcc
difficulty: intermediate
tags: 
prerequisites: snapshot-anatomy
safety: writes-data
run-in: tool
sessions: 2
min-version: 16
minutes: 15
revision: 2

## Overview
An UPDATE in PostgreSQL never overwrites a row. It writes a new tuple and stamps the old one as
deleted by the updating xid, so both versions sit on the page at once and each session is routed to
the one its snapshot allows. Here a REPEATABLE READ reader keeps reading the old version while a
writer commits a new one, and you dump the page to see both.

## Syntax breakdown
### In plain terms

This experiment updates Alice while another session holds an older repeatable-read view. PostgreSQL
keeps the old and new row versions on the same heap page, so the writer sees the new physical address
while the reader still sees the old address and balance. This explains why readers and writers can
run together, and why later vacuum work is required to remove obsolete versions.

### What you are learning

- **Tuple versions:** An UPDATE appends a replacement tuple and marks the old tuple with the updater's
  xid instead of overwriting bytes in place.
- **Snapshot visibility:** The same page can yield different logical rows to sessions with different
  snapshots.
- **ctid and version chains:** A ctid is a physical page/slot address, and **t_ctid** links an old
  version to the replacement version.

### Piece by piece

- **BEGIN ISOLATION LEVEL REPEATABLE READ** (transaction and isolation command)
  - What it is: It starts a transaction with one snapshot retained for all its statements.
  - What it does here: Session A captures Alice before Session B updates her.
  - What it gives us: A stable reader that continues to see the old version after B commits.
- **ctid** (system column)
  - What it is: PostgreSQL's physical address for a tuple, written as **(block,line pointer)**.
  - What it does here: Both sessions select it for Alice before or after the update.
  - What it gives us: Different addresses such as **(0,1)** and **(0,4)**, proving two physical versions.
- **pg_current_snapshot()** (snapshot inspection function)
  - What it is: It prints the transaction boundaries and in-progress xids used for visibility.
  - What it does here: A records the snapshot that explains why it retains the old tuple.
  - What it gives us: A snapshot to compare with B's updating xid if needed.
- **UPDATE ... SET ... WHERE** (version-producing write)
  - What it is: It changes Alice's balance for **id = 1**; PostgreSQL creates a new tuple version.
  - What it does here: B adds 50 and then reads its own committed replacement.
  - What it gives us: New ctid **(0,4)** and balance 150 while A remains at 100.
- **pageinspect** (extension used through functions)
  - What it is: An extension that exposes raw PostgreSQL page and tuple layout for diagnostics.
  - What it does here: It lets the lesson inspect heap page 0 without applying normal visibility rules.
  - What it gives us: Physical line pointers and tuple header fields, not merely currently visible rows.
- **get_raw_page('mv_accounts', 0)** (pageinspect function)
  - What it is: It returns block 0 of the named relation as raw page bytes.
  - What it does here: **heap_page_items** decodes the returned bytes.
  - What it gives us: The exact page containing the initial rows and Alice's replacement.
- **heap_page_items(...)** (pageinspect set-returning function)
  - What it is: It decodes heap line pointers and tuple-header metadata from a raw page.
  - What it does here: The query prints **lp**, optional **lp_off**, **t_xmin**, **t_xmax**, and **t_ctid**.
  - What it gives us: The old tuple's deleting xid and forward pointer, plus the new tuple's creating xid.
- **ORDER BY lp** (SQL ordering clause)
  - What it is: It sorts decoded page items by their line-pointer number.
  - What it does here: It makes the version chain and the other account rows easy to compare.
  - What it gives us: Alice's old slot followed by the new slot in a stable display order.
- **COMMIT** (transaction control)
  - What it is: It publishes B's update and ends A's old snapshot when A commits.
  - What it does here: A's final SELECT runs outside the repeatable-read transaction.
  - What it gives us: The normal current view, ctid **(0,4)** and balance 150.
- **t_xmin, t_xmax, and t_ctid** (tuple-header fields, in the challenge)
  - What they are: They record the creating xid, deleting/updating xid, and tuple-chain target.
  - What they do here: Repeated updates expose a chain from the first line pointer; a non-indexed
    update can be a HOT (heap-only tuple) update when it fits on the same page.
  - What they give us: Evidence of version accumulation and whether the index needs a new entry.

## Setup
```sql
create table if not exists mv_accounts (
  id int primary key,
  owner text not null,
  balance int not null
);
truncate mv_accounts;
insert into mv_accounts (id, owner, balance)
values (1, 'alice', 100), (2, 'bob', 100), (3, 'carol', 100);
```

## Run
```sql
-- Session A
begin isolation level repeatable read;
select ctid, id, balance from mv_accounts where id = 1;
select pg_current_snapshot() as a_snapshot;

-- Session B
update mv_accounts set balance = balance + 50 where id = 1;
select ctid, id, balance from mv_accounts where id = 1;
select lp, lp_off, t_xmin, t_xmax, t_ctid from heap_page_items(get_raw_page('mv_accounts', 0)) order by lp;

-- Session A
select ctid, id, balance from mv_accounts where id = 1;
select lp, t_xmin, t_xmax, t_ctid from heap_page_items(get_raw_page('mv_accounts', 0)) order by lp;
commit;

-- Session A
select ctid, id, balance from mv_accounts where id = 1;
```

## Expected result
A first reads ctid (0,1) with balance 100. B updates and commits; B reads ctid (0,4) with balance
150. The page now holds four line pointers; lp 1 is alice's old version, stamped t_xmax = 3133 (the
updating xid) and pointing forward to the new version at lp 4, which was created by 3133:
   lp | t_xmin | t_xmax | t_ctid
  ----+--------+--------+--------
    1 |   3129 |   3133 | (0,4)
    2 |   3129 |      0 | (0,2)
    3 |   3129 |      0 | (0,3)
    4 |   3133 |      0 | (0,4)
Both versions of alice's row are physically present at the same instant. A, still inside its
repeatable-read transaction, re-reads ctid (0,1) and balance 100 -- and sees the exact same page
dump, because heap_page_items reads raw bytes, not tuples: the page is shared, only the visibility
decision differs. After A commits, its next SELECT reads (0,4) and balance 150.

## Systems lens
Multi-version concurrency control buys readers-never-block-writers by turning an update into an
append plus a tombstone. The consequences follow mechanically: the table grows even under a pure
UPDATE workload, indexes must point at versions rather than rows, and someone has to reclaim the
old versions later. That is the same trade every LSM tree and every append-only log makes -- cheap
concurrent reads now, compaction debt later -- and the next two lessons are about who pays it.

## Optional variation
Update alice three more times, then read t_ctid down the chain from lp 1: it is a linked list of
versions. Now do the same with an UPDATE that changes only a non-indexed column on a page with free
space and look for HOT (heap-only tuple) behaviour, where the new version stays off the index.
