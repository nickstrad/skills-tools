# An old reader can prevent vacuum from removing history

slug: old-reader-retains-history
category: visibility-and-retention
difficulty: intermediate
tags: mvcc, snapshots, vacuum, retention
prerequisites: statement-versus-transaction-snapshot
safety: privileged
run-in: tool
sessions: 2
min-version: 16
minutes: 30
revision: 1

## Overview
Keep a stable reader open while another session deletes all rows and runs vacuum. Release the reader and repeat the same vacuum. Use physical tuple counts to see why a successful maintenance command can leave history behind.

## Syntax breakdown
### In plain terms
DELETE makes a row disappear from new snapshots but leaves a physical version an older snapshot
may still need. VACUUM reclaims versions only when no relevant transaction needs them. The oldest
needed history sets a cleanup horizon: finishing the command cannot override that boundary.

### Mechanism map

```text
A's stable snapshot --------------------------> ends
          |                                       |
          needs old rows                           releases need
          |                                       |
B:     DELETE commits --> VACUUM                VACUUM again
       new reads: 0       must keep history      may reclaim it

Logical disappearance and physical reclamation are separate events.
```

### Terminals and cleanup
Open 2 experiment terminals, labelled Session A and Session B and connect each psql session with:
```sh
psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off
```
The flags skip personal startup settings, select the learner socket, port, role and database, and
keep output in the terminal. Finish any earlier transaction with **ROLLBACK** before setup. Run setup once in A, keep both connections open, and follow the Session A/B labels. If B is intentionally waiting, switch to A and run its next block.
If you reach the fifteen-minute core limit or get stuck, ROLLBACK in the open sessions and follow
the lesson's exact cleanup command so its named pe_* table and session settings are removed.
### What you are learning
- Logical row count and physical dead-version count answer different questions. A fresh reader
  can see zero rows while an older reader still sees all of them.
- Release the old reader, then repeat the same maintenance. That controlled change tests whether
  the snapshot was preventing cleanup; a completed VACUUM alone does not prove reclamation.

### Piece by piece
- **CREATE EXTENSION IF NOT EXISTS pgstattuple** enables a physical table inspection function in
  the lab database. It stays installed for later labs. **SET lock_timeout = '3s'** bounds lock waits.
- **WITH (autovacuum_enabled = false)** disables automatic vacuum on this one table so it cannot
  perform the comparison between our samples. The final DROP removes this setting with the table.
- **generate_series(1, 1000)** supplies 1,000 integers; **repeat('x', 100)** creates a short payload
  for each row. These functions populate a small controlled table rather than a production workload.
- **BEGIN ISOLATION LEVEL REPEATABLE READ** and the first **count(*)** establish A's old snapshot.
  **SET application_name** labels A so B can find it in **pg_stat_activity**. The view's **state**
  and **backend_xmin** show the open transaction and its advertised snapshot horizon. The numeric
  xid varies; its presence while A holds the snapshot matters here.
- **VACUUM (TRUNCATE FALSE)** reclaims what is safe and leaves allocated
  file pages in place. Run it outside BEGIN: VACUUM cannot run inside a transaction block.
- **pgstattuple('pe_history')** scans physical storage. **dead_tuple_count** counts dead versions,
  and **free_percent** measures free space. It does not apply A's old SELECT snapshot to its counts.
  We keep writers still during each sample. The two calls differ only in whether A remains open.
- **COMMIT** releases A's snapshot. **DROP TABLE** then removes the small lab table after B has
  repeated vacuum and inspected the result. Physical file-size tradeoffs belong to lesson 4.

## Caution
Use the supplied disposable learner lab and its postgres role. This experiment disables autovacuum only on pe_history and removes that table at the end. It does not change server-wide maintenance. If interrupted, ROLLBACK in both sessions, then DROP TABLE IF EXISTS pe_history in either session; this releases the retained snapshot and removes the table-specific setting.

## Setup
```sql
set lock_timeout = '3s';

set default_transaction_isolation = 'read committed';

create extension if not exists pgstattuple;

drop table if exists pe_history;

create table pe_history (id int primary key, payload text not null)
with
  (autovacuum_enabled = false);

insert into
  pe_history
select
  g,
  repeat('x', 100)
from
  generate_series(1, 1000) g;

vacuum pe_history;
```

## Run
```sql
-- Session A: establish the reader that still needs the original rows. Leave it open.
set application_name = 'pe-history-reader';

begin isolation level repeatable read;

select
  count(*) as reader_before
from
  pe_history;

-- Session B: delete in a committed statement, then try to reclaim the old versions.
set default_transaction_isolation = 'read committed';

set lock_timeout = '3s';

delete from pe_history;

select
  count(*) as fresh_rows
from
  pe_history;

select
  state,
  backend_xmin
from
  pg_stat_activity
where
  application_name = 'pe-history-reader'
  and datname = current_database();

vacuum (truncate false) pe_history;

select
  dead_tuple_count as retained_dead,
  free_percent as retained_free
from
  pgstattuple ('pe_history');

-- Session A: prove the retained versions are still readable, then release the snapshot.
select
  count(*) as reader_after_delete
from
  pe_history;

commit;

reset application_name;

-- Session B: repeat the same vacuum with that reader gone, then clean up.
vacuum (truncate false) pe_history;

select
  dead_tuple_count as released_dead,
  free_percent as released_free
from
  pgstattuple ('pe_history');

select
  count(*) as final_rows
from
  pe_history;

drop table pe_history;
```

## Expected result
reader_before = 1000. After DELETE commits, B sees fresh_rows = 0 while A still reports
reader_after_delete = 1000. The labelled reader is idle in transaction with a non-NULL backend_xmin.

After the first VACUUM, pgstattuple still reports retained_dead = 1000. After A commits, the same VACUUM removes those versions: released_dead = 0, released_free
rises, and final_rows remains 0. Exact free-space percentages and xid values vary. If released_dead
stays nonzero, investigate another old transaction rather than assuming vacuum failed.

All transactions finish and pe_history is dropped, leaving no disabled-autovacuum table behind.

## Systems lens
An observer can impose storage costs without writing. Repeating vacuum or increasing its frequency cannot reclaim a version still required by a snapshot. Before changing maintenance settings, identify the retention obligation and decide whether the reader must finish or can be stopped. This lab isolates one reader; it does not show every cause of retained history or establish a production vacuum policy.
