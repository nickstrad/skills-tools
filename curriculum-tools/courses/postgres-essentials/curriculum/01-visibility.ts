import { code, type Module } from "../../../src/types.ts";

export const VISIBILITY: Module = {
  category: "visibility-and-retention",
  title: "Reader visibility and the cost of keeping history",
  lessons: [
    {
      slug: "committed-row-visibility",
      title: "An uncommitted write is private to its transaction",
      difficulty: "intermediate",
      tags: ["mvcc", "isolation"],
      estimatedMinutes: 25,
      sessions: 2,
      safetyLevel: "writes-data",
      runIn: "tool",
      overview:
        "Change one account balance while another connection reads it. Observe the writer's own view, a different reader's view, and what commit or rollback makes visible. This is the starting point for reasoning about concurrent application requests.",
      syntaxBreakdown: code`
### In plain terms
You already saw that UPDATE creates a new row version. PostgreSQL's multiversion concurrency
control (MVCC) chooses which version a read may use. A transaction sees its own writes, but another
transaction cannot see those writes before they commit. An ordinary SELECT can read the older
committed version while the writer is still open; it does not need to wait for this row update.

### Mechanism map

${"```text"}
One logical row, different visible versions

Session A: BEGIN --> UPDATE --> own SELECT --> COMMIT
                       |                        |
                 private version          accepted version
                       |                        |
Session B:       older committed row       fresh read can see it

ROLLBACK abandons A's change instead of publishing it.
${"```"}

### Terminals and cleanup
Open 2 experiment terminals, labelled Session A and Session B and connect each psql session with:
${"```sh"}
psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off
${"```"}
The flags skip personal startup settings, select the learner socket, port, role and database, and
keep output in the terminal. Finish any earlier transaction with **ROLLBACK** before setup. Run setup once in A, keep both connections open, and follow the Session A/B labels. If B is intentionally waiting, switch to A and run its next block.
If you reach the fifteen-minute core limit or get stuck, ROLLBACK in the open sessions and follow
the lesson's exact cleanup command so its named pe_* table and session settings are removed.
### What you are learning
- A transaction groups work between BEGIN and COMMIT or ROLLBACK. COMMIT accepts its changes;
  ROLLBACK discards their logical effects.
- Under Read Committed, a SELECT gets a snapshot of committed data as of that statement's start,
  plus its transaction's own changes. “Snapshot” means visibility rules, not a copy of the table.

### Piece by piece
- **SET default_transaction_isolation = 'read committed'** establishes the isolation level for
  subsequent transactions in each session, so a previous lesson's settings cannot change this one.
- **SET lock_timeout = '3s'** bounds time waiting for a conflicting lock. If it fires, finish an
  earlier open transaction before retrying setup; that error is not the intended result.
- **DROP TABLE IF EXISTS / CREATE TABLE / INSERT** reset only pe_visibility with one balance of 100.
  Setup runs once, in A, while neither session has an open transaction.
- **BEGIN / COMMIT / ROLLBACK** start, accept or abandon the writer's transaction. psql normally
  commits each standalone statement automatically, so B's separate SELECTs get fresh views.
- **AS a_private, b_before_commit, b_after_commit, a_aborted, b_after_rollback** label the output
  cells to compare. They are column aliases, not saved variables. Keep the A/B blocks in order.
`,
      setup: code`
set lock_timeout = '3s';
set default_transaction_isolation = 'read committed';
drop table if exists pe_visibility;
create table pe_visibility (id int primary key, balance int not null);
insert into pe_visibility values (1, 100);`,
      code: code`
-- Session A: write, then inspect your own uncommitted version. Leave A open.
begin;
update pe_visibility set balance = 120 where id = 1;
select balance as a_private from pe_visibility where id = 1;

-- Session B: read from a separate connection while A is still open.
set default_transaction_isolation = 'read committed';
set lock_timeout = '3s';
select balance as b_before_commit from pe_visibility where id = 1;

-- Session A: make the first change committed.
commit;

-- Session B: take a fresh statement view after A's commit.
select balance as b_after_commit from pe_visibility where id = 1;

-- Session A: try a different value, but abandon this transaction.
begin;
update pe_visibility set balance = 999 where id = 1;
select balance as a_aborted from pe_visibility where id = 1;
rollback;

-- Session B: check which value survived, then remove this lesson's table.
select balance as b_after_rollback from pe_visibility where id = 1;
drop table pe_visibility;`,
      expectedResult: code`
The labelled cells are a_private = 120, b_before_commit = 100, b_after_commit = 120,
a_aborted = 999 and b_after_rollback = 120. B's first SELECT returns while A is still open.

A's ability to read 999 did not mean another request could read it, nor that it would survive
ROLLBACK. The final SELECT proves the committed value remained 120. All transactions are finished
and the last command removes the experiment table.
`,
      systemsLens:
        "Commit changes which versions later statements may see; it does not cause every existing reader to adopt a new view. This run used fresh Read Committed statements. The next lesson tests an already-established stable snapshot. Ordinary SELECT behavior here does not imply that competing writes or DDL never wait.",
    },
    {
      slug: "statement-versus-transaction-snapshot",
      title: "Choose a fresh statement view or a stable transaction view",
      difficulty: "intermediate",
      tags: ["mvcc", "snapshots", "isolation"],
      prerequisites: ["committed-row-visibility"],
      estimatedMinutes: 25,
      sessions: 2,
      safetyLevel: "writes-data",
      runIn: "tool",
      overview:
        "Run the same read–writer commit–read schedule twice, changing only the reader's isolation level. Decide whether a multi-query operation needs fresh data at each statement or a view that stays consistent across its reads.",
      syntaxBreakdown: code`
### In plain terms
A snapshot defines which committed row versions a read can use. Read Committed takes a fresh
snapshot for each statement. Repeatable Read keeps the snapshot established by its first ordinary
query for the rest of that transaction. Merely typing BEGIN is not when this snapshot is established.
Another session can commit meanwhile; the stable reader continues using an older version.

### Mechanism map

${"```text"}
Same schedule: A reads --> B commits an update --> A reads again

READ COMMITTED:   [snapshot 1]                 [snapshot 2]
REPEATABLE READ:  [snapshot 1 ----------------------------]
                  first SELECT                 same view

After A ends its transaction, its next read takes a fresh view.
${"```"}

### Terminals and cleanup
Open 2 experiment terminals, labelled Session A and Session B and connect each psql session with:
${"```sh"}
psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off
${"```"}
The flags skip personal startup settings, select the learner socket, port, role and database, and
keep output in the terminal. Finish any earlier transaction with **ROLLBACK** before setup. Run setup once in A, keep both connections open, and follow the Session A/B labels. If B is intentionally waiting, switch to A and run its next block.
If you reach the fifteen-minute core limit or get stuck, ROLLBACK in the open sessions and follow
the lesson's exact cleanup command so its named pe_* table and session settings are removed.
### What you are learning
- Two SELECTs inside one Read Committed transaction can see different committed values.
- Repeatable Read keeps this read-only transaction's view fixed until it ends. Stable does not mean
  latest, and it does not mean every multi-row application invariant is protected from other writers.

### Piece by piece
- **SET lock_timeout = '3s'** bounds accidental lock waits during setup; **SET
  default_transaction_isolation** makes standalone reset/update statements use a known default.
- **DROP TABLE IF EXISTS / CREATE TABLE / INSERT** prepare pe_snapshot with balance 100. The
  between-round UPDATE restores 100, giving both rounds the same initial data.
- **BEGIN ISOLATION LEVEL READ COMMITTED / REPEATABLE READ** choose the reader's snapshot lifetime
  for that one transaction. A's first SELECT establishes the starting observation.
- **B's UPDATE without BEGIN** is an automatically committed statement. Finish that block before
  returning to A; both rounds test visibility after a successful writer commit.
- **AS rc_before, rc_after, rr_before, rr_after, fresh_after_end** name the five cells to compare.
  **COMMIT** ends each read transaction; the final standalone SELECT gets a fresh view.
`,
      setup: code`
set lock_timeout = '3s';
set default_transaction_isolation = 'read committed';
drop table if exists pe_snapshot;
create table pe_snapshot (id int primary key, balance int not null);
insert into pe_snapshot values (1, 100);`,
      code: code`
-- Session A: first round, Read Committed. Leave the reader transaction open.
begin isolation level read committed;
select balance as rc_before from pe_snapshot where id = 1;

-- Session B: commit a change between A's reads.
set default_transaction_isolation = 'read committed';
set lock_timeout = '3s';
update pe_snapshot set balance = 120 where id = 1;

-- Session A: read again inside the SAME transaction, then end it.
select balance as rc_after from pe_snapshot where id = 1;
commit;

-- Session B: restore the starting value before the second round.
update pe_snapshot set balance = 100 where id = 1;

-- Session A: second round, Repeatable Read. The SELECT establishes its snapshot.
begin isolation level repeatable read;
select balance as rr_before from pe_snapshot where id = 1;

-- Session B: make the same committed change.
update pe_snapshot set balance = 120 where id = 1;

-- Session A: read in the stable view, then finish and take a fresh view.
select balance as rr_after from pe_snapshot where id = 1;
commit;
select balance as fresh_after_end from pe_snapshot where id = 1;
drop table pe_snapshot;`,
      expectedResult: code`
Read Committed reports rc_before = 100 and rc_after = 120 within one transaction.
Repeatable Read reports rr_before = 100 and rr_after = 100 despite B committing 120.
After A commits, fresh_after_end = 120. Both runs allowed B's update to finish.

The controlled difference was A's isolation level. BEGIN alone did not give Read Committed a
stable transaction-wide view. In the second round, an unchanged value did not mean B's commit
failed: the final fresh read proves it was accepted. The final DROP removes the experiment table.
`,
      systemsLens:
        "For a report whose separate reads must reconcile, a stable snapshot can be useful. For a request that should observe recent commits at each statement, fresh views may be appropriate. Both have a freshness tradeoff; neither demonstration establishes serializable execution. Holding the stable view also creates a retention obligation, which the next lesson measures.",
    },
    {
      slug: "old-reader-retains-history",
      title: "An old reader can prevent vacuum from removing history",
      difficulty: "intermediate",
      tags: ["mvcc", "snapshots", "vacuum", "retention"],
      prerequisites: ["statement-versus-transaction-snapshot"],
      estimatedMinutes: 30,
      sessions: 2,
      safetyLevel: "privileged",
      runIn: "tool",
      overview:
        "Keep a stable reader open while another session deletes all rows and runs vacuum. Release the reader and repeat the same vacuum. Use physical tuple counts to see why a successful maintenance command can leave history behind.",
      caution:
        "Use the supplied disposable learner lab and its postgres role. This experiment disables autovacuum only on pe_history and removes that table at the end. It does not change server-wide maintenance. If interrupted, ROLLBACK in both sessions, then DROP TABLE IF EXISTS pe_history in either session; this releases the retained snapshot and removes the table-specific setting.",
      syntaxBreakdown: code`
### In plain terms
DELETE makes a row disappear from new snapshots but leaves a physical version an older snapshot
may still need. VACUUM reclaims versions only when no relevant transaction needs them. The oldest
needed history sets a cleanup horizon: finishing the command cannot override that boundary.

### Mechanism map

${"```text"}
A's stable snapshot --------------------------> ends
          |                                       |
          needs old rows                           releases need
          |                                       |
B:     DELETE commits --> VACUUM                VACUUM again
       new reads: 0       must keep history      may reclaim it

Logical disappearance and physical reclamation are separate events.
${"```"}

### Terminals and cleanup
Open 2 experiment terminals, labelled Session A and Session B and connect each psql session with:
${"```sh"}
psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off
${"```"}
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
`,
      setup: code`
set lock_timeout = '3s';
set default_transaction_isolation = 'read committed';
create extension if not exists pgstattuple;
drop table if exists pe_history;
create table pe_history (id int primary key, payload text not null)
  with (autovacuum_enabled = false);
insert into pe_history select g, repeat('x', 100) from generate_series(1, 1000) g;
vacuum pe_history;`,
      code: code`
-- Session A: establish the reader that still needs the original rows. Leave it open.
set application_name = 'pe-history-reader';
begin isolation level repeatable read;
select count(*) as reader_before from pe_history;

-- Session B: delete in a committed statement, then try to reclaim the old versions.
set default_transaction_isolation = 'read committed';
set lock_timeout = '3s';
delete from pe_history;
select count(*) as fresh_rows from pe_history;
select state, backend_xmin from pg_stat_activity
where application_name = 'pe-history-reader' and datname = current_database();
vacuum (truncate false) pe_history;
select dead_tuple_count as retained_dead, free_percent as retained_free
from pgstattuple('pe_history');

-- Session A: prove the retained versions are still readable, then release the snapshot.
select count(*) as reader_after_delete from pe_history;
commit;
reset application_name;

-- Session B: repeat the same vacuum with that reader gone, then clean up.
vacuum (truncate false) pe_history;
select dead_tuple_count as released_dead, free_percent as released_free
from pgstattuple('pe_history');
select count(*) as final_rows from pe_history;
drop table pe_history;`,
      expectedResult: code`
reader_before = 1000. After DELETE commits, B sees fresh_rows = 0 while A still reports
reader_after_delete = 1000. The labelled reader is idle in transaction with a non-NULL backend_xmin.

After the first VACUUM, pgstattuple still reports retained_dead = 1000. After A commits, the same VACUUM removes those versions: released_dead = 0, released_free
rises, and final_rows remains 0. Exact free-space percentages and xid values vary. If released_dead
stays nonzero, investigate another old transaction rather than assuming vacuum failed.

All transactions finish and pe_history is dropped, leaving no disabled-autovacuum table behind.
`,
      systemsLens:
        "An observer can impose storage costs without writing. Repeating vacuum or increasing its frequency cannot reclaim a version still required by a snapshot. Before changing maintenance settings, identify the retention obligation and decide whether the reader must finish or can be stopped. This lab isolates one reader; it does not show every cause of retained history or establish a production vacuum policy.",
    },
  ],
};
