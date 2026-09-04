import { code, type Module } from "../../../src/types.ts";

const ACCOUNTS = code`
create table if not exists mv_accounts (
  id int primary key,
  owner text not null,
  balance int not null
);
truncate mv_accounts;
insert into mv_accounts (id, owner, balance)
values (1, 'alice', 100), (2, 'bob', 100), (3, 'carol', 100);`;

export const MVCC: Module = {
  category: "mvcc",
  title: "MVCC: versions, snapshots, and horizons",
  lessons: [
    {
      slug: "xids-and-the-transaction-counter",
      title: "Transaction ids are allocated lazily from one global counter",
      difficulty: "beginner",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 12,
      prerequisites: ["install-lab-extensions"],
      overview: code`
Every row version in PostgreSQL is stamped with the transaction id (xid) that created it and the
xid that deleted it, so the first thing to understand is where xids come from. They come from a
single cluster-wide counter, and they are handed out lazily: a transaction that only reads never
takes one. You will watch a transaction stay xid-less through several reads, take an xid at its
first write, and see a second session take the very next number from the same counter.`,
      reading:
        `PostgreSQL 14 Internals, Chapter 3 "Pages and Tuples" (sections "Operations on Tuples", "Virtual Transactions"); Chapter 12 "Relation-Level Locks" (section "Locks on Transaction IDs")`,
      readingNotes: code`
Chapter 3 explains where creating and deleting transaction IDs are recorded in tuple headers, while
Chapter 12 explains the transaction-ID locks that let concurrent transactions wait for one another.
This lesson makes the allocation timing visible with PostgreSQL's xid8 functions and pg_locks; run it
before reading those sections so the book's tuple and lock diagrams have a concrete experiment to
attach to.`,
      syntaxBreakdown: code`
### In plain terms

This experiment asks when PostgreSQL gives a transaction its numeric identity. A transaction that
only reads stays without a real transaction ID, then its first UPDATE allocates one; a second session
gets the next value from the same cluster-wide counter. That matters because IDs consume shared
metadata and eventually have to be frozen before the finite counter becomes unsafe.

### What you are learning

- **Lazy xid allocation:** Reads can use a snapshot without reserving a real transaction ID; the
  first write is the event that normally allocates one.
- **Cluster-wide ordering:** The counter is shared by all sessions, so two writers receive consecutive
  values even though they are in different client connections.
- **Virtual versus real identity:** A virtual transaction ID identifies a session cheaply, while a
  real xid is used for committed-row visibility and transaction locks.

### Piece by piece

- **CREATE TABLE IF NOT EXISTS** (SQL DDL)
  - What it is: It creates the lab table only when it is absent; **IF NOT EXISTS** makes setup safe to
    repeat. The primary key on **id** enforces uniqueness, and **NOT NULL** rejects missing owners or
    balances.
  - What it does here: It defines three integer-keyed account rows for the later reads and updates.
  - What it gives us: A deterministic table whose row changes can consume xids.
- **TRUNCATE** (table-reset command)
  - What it is: It removes all rows efficiently rather than issuing one DELETE per row.
  - What it does here: It makes repeated runs start with the same empty table before the three INSERTed
    accounts are loaded.
  - What it gives us: Stable row counts and predictable update targets.
- **BEGIN** (transaction control)
  - What it is: It starts a transaction, a group of statements that share one visibility context and
    commit or roll back together.
  - What it does here: It lets Session A and Session B remain open while their xid state is inspected.
  - What it gives us: A place to compare read-only and writing transaction state.
- **pg_current_xact_id_if_assigned()** (SQL inspection function)
  - What it is: It returns the current transaction's 64-bit **xid8**, or NULL if PostgreSQL has not
    assigned a real xid. Unlike the forcing function below, it does not allocate one.
  - What it does here: It is called outside a transaction, after two reads, and before and after each
    session's UPDATE.
  - What it gives us: Empty output before a write and a numeric value after it; the transition is the
    key evidence of lazy allocation.
- **COUNT(*) and SUM(balance)** (aggregate functions)
  - What they are: **COUNT** counts rows and **SUM** adds balances without changing data.
  - What they do here: They provide harmless reads inside Session A's transaction.
  - What they give us: Proof that ordinary reads do not themselves allocate a real xid.
- **pg_locks** (system view)
  - What it is: A live list of locks held or awaited by server processes.
  - What it does here: The query filters to the current backend and displays its lock types before
    and after the UPDATE.
  - What it gives us: A **virtualxid** row while the transaction is read-only, followed by a
    **transactionid** row whose **transactionid** matches the newly allocated xid.
- **pg_backend_pid()** (session identity function)
  - What it is: It returns the operating-system process ID of the current PostgreSQL backend.
  - What it does here: It limits **pg_locks** to this session rather than every client.
  - What it gives us: A precise view of the current connection's locks.
- **ORDER BY locktype** (SQL ordering clause)
  - What it is: It sorts result rows by lock category.
  - What it does here: It makes the before/after lock lists easier to compare.
  - What it gives us: The same lock kinds appear in a consistent order.
- **UPDATE ... SET ... WHERE** (data-change statement)
  - What it is: **UPDATE** creates a new row version; **SET balance = balance + 1** changes one value,
    and **WHERE id = ...** restricts the change to one account.
  - What it does here: It is the first write in each session and therefore the point where a real xid
    is assigned.
  - What it gives us: A numeric xid and, in **pg_locks**, a transaction-ID lock.
- **COMMIT** (transaction control)
  - What it is: It makes a transaction's changes visible to later snapshots and releases its locks.
  - What it does here: It completes both writer sessions before the final read-only test.
  - What it gives us: A clean comparison between completed writes and a later read-only transaction.
- **pg_current_xact_id()** (xid-forcing function)
  - What it is: It returns the current xid8 and allocates one if needed.
  - What it does here: The final call follows a read-only transaction and deliberately forces an xid.
  - What it gives us: A number despite the preceding read, proving that this function changes state.
- **pg_stat_activity** (backend activity view, in the challenge)
  - What it is: It lists sessions and their current transaction metadata.
  - What it does here: **backend_xid** shows a real xid, while **backend_xmin** shows the oldest xid the
    session's snapshot may still need; **pid <> pg_backend_pid()** excludes this session.
  - What it gives us: An idle read-only transaction with an empty **backend_xid** but a populated
    **backend_xmin**, which becomes important for vacuum horizons.
- **SELECT 1** (constant read, in the challenge)
  - What it is: A query that returns one constant and touches no user table.
  - What it does here: It creates a snapshot in the idle third session without writing.
  - What it gives us: Evidence that a snapshot can publish a cleanup horizon without a real xid.
`,
      setup: ACCOUNTS,
      code: code`
-- Session A
select pg_current_xact_id_if_assigned() as xid_outside_any_transaction;
begin;
select count(*) from mv_accounts;
select sum(balance) from mv_accounts;
select pg_current_xact_id_if_assigned() as xid_after_two_reads;
select locktype, virtualxid, transactionid from pg_locks where pid = pg_backend_pid() order by locktype;
update mv_accounts set balance = balance + 1 where id = 1;
select pg_current_xact_id_if_assigned() as xid_after_first_write;
select locktype, virtualxid, transactionid from pg_locks where pid = pg_backend_pid() order by locktype;

-- Session B
begin;
select pg_current_xact_id_if_assigned() as b_xid_before_write;
update mv_accounts set balance = balance + 1 where id = 2;
select pg_current_xact_id_if_assigned() as b_xid_after_write;

-- Session A
commit;

-- Session B
commit;

-- Session A
begin;
select count(*) from mv_accounts;
select pg_current_xact_id_if_assigned() as read_only_transaction_xid;
commit;
select pg_current_xact_id() as forced_xid;`,
      expectedResult: code`
Outside a transaction and after two reads inside one, pg_current_xact_id_if_assigned() prints an
empty cell: no xid was assigned. pg_locks at that point shows only relation locks (on the catalogs the
query itself reads) and one virtualxid lock such as 3/1102, with the transactionid column empty. The UPDATE assigns one, for example
  xid_after_first_write
  -----------------------
                    3099
and pg_locks now also holds a row with locktype "transactionid" and transactionid 3099.
Session B's transaction is likewise xid-less until its own UPDATE, which gets 3100 -- the next
number from the same global counter, not a per-session sequence. The read-only transaction at the
end still prints an empty xid, and the final pg_current_xact_id() forces a fresh number (3101).
Your absolute numbers will differ; the pattern (NULL, then consecutive integers across sessions)
is what matters.`,
      systemsLens: code`
Two ideas that recur in every distributed store. First, identity is allocated lazily because it is
expensive: an xid costs a slot in a shared array, a commit-log entry, and a claim on the wraparound
budget, so pure readers must not pay it. Second, the allocator is a single global counter, which
makes it a serialization point and a hard scalability limit -- exactly why systems that need to
scale writes move to per-node ids plus a partial order (Lamport clocks, HLCs) instead of one
totally ordered counter.`,
      challenge: code`
Open a third session, run "begin; select 1;" and leave it idle. Then check
select backend_xid, backend_xmin from pg_stat_activity where pid <> pg_backend_pid(): an idle
read-only transaction has no backend_xid but still publishes a backend_xmin. That column is the
subject of lesson 5.`,
    },
    {
      slug: "snapshot-anatomy",
      title: "A snapshot is xmin, xmax, and the in-progress list",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 14,
      prerequisites: ["xids-and-the-transaction-counter"],
      overview: code`
Visibility is decided by a snapshot, and a snapshot is a tiny data structure you can print. It is
three things: a low water mark (every xid below it has finished), a high water mark (every xid at or
above it started after us and is invisible), and the list of xids in between that were still running
when the snapshot was taken. You will watch a second session's xid appear in that in-progress list
and then vanish from it when it commits.`,
      reading:
        `PostgreSQL 14 Internals, Chapter 4 "Snapshots" (sections "What is a Snapshot?", "Snapshot Structure")`,
      readingNotes: code`
Chapter 4 describes the xmin, xmax, and in-progress transaction list that form a PostgreSQL snapshot.
The lesson prints each component while a writer remains open, then repeats the read after commit so
the list and visibility decision change live. Run the experiment first, then use the chapter to
formalize the watermarks and visibility rules shown by the output.`,
      syntaxBreakdown: code`
### In plain terms

This experiment opens one writer and lets another session take snapshots around it. You will see the
writer's xid listed as in progress, making its changed row invisible, and then see a fresh snapshot
after commit where that xid is no longer listed and the new balance is visible. A snapshot is the
reader's timestamp-like view of which transactions are finished, active, or from the future.

### What you are learning

- **xmin and xmax:** xmin is the lower settled boundary; xmax is the first xid that is too new for
  this snapshot to see.
- **In-progress list:** Xids between those boundaries that were still running need an explicit
  visibility check.
- **Statement snapshots:** READ COMMITTED takes a new snapshot for each statement, so two SELECTs
  can see different committed states.

### Piece by piece

- **pg_current_snapshot()** (snapshot inspection function)
  - What it is: It returns a snapshot in **xmin:xmax:xip_list** form, where xip means xids in progress.
  - What it does here: It is called before B starts, while B runs, and after B commits.
  - What it gives us: The same shape with B's xid appearing in the middle list only while B is open.
- **BEGIN** (transaction control)
  - What it is: It opens a transaction whose statements can hold locks and snapshots.
  - What it does here: B keeps its UPDATE uncommitted while A observes it; A also wraps a short
    write so B is no longer the newest xid.
  - What it gives us: The concurrency needed for a non-empty in-progress list.
- **UPDATE ... WHERE** (row-versioning write)
  - What it is: It changes the selected account row and creates a new version under the writer's xid.
  - What it does here: B changes Carol by 10; A changes Alice by 1 and commits to advance the xid
    boundaries.
  - What it gives us: A known row whose new version remains invisible to A while B is uncommitted.
- **pg_current_xact_id()** (xid inspection function)
  - What it is: It returns B's current xid8, allocating it if necessary.
  - What it does here: B records the xid that should later appear in the snapshot's xip list.
  - What it gives us: The number to match against **in_progress**.
- **pg_snapshot_xmin() and pg_snapshot_xmax()** (snapshot accessor functions)
  - What they are: They extract the lower and upper xid boundaries from a snapshot value.
  - What they do here: They are applied to a freshly captured snapshot in one SELECT.
  - What they give us: Named **snap_xmin** and **snap_xmax** columns that explain the printed snapshot.
- **pg_snapshot_xip()** (set-returning snapshot accessor)
  - What it is: It emits one xid per transaction listed as in progress.
  - What it does here: A scalar subquery feeds its rows to **array_agg**.
  - What it gives us: An **in_progress** array containing B's xid while B is open and empty after commit.
- **array_agg(...)** (aggregate function)
  - What it is: It collects multiple rows into one SQL array.
  - What it does here: It keeps the set-returning xip output beside xmin and xmax in one result row.
  - What it gives us: A compact list that is easy to compare with B's xid.
- **SELECT ... WHERE id = 3** (visibility observation)
  - What it is: A normal filtered read of Carol's row.
  - What it does here: It runs once while B is in progress and once after B commits.
  - What it gives us: Balance 100 first and 110 later, tying snapshot metadata to row visibility.
- **COMMIT** (transaction control)
  - What it is: It finishes a transaction and publishes its changes.
  - What it does here: B's commit removes its xid from future snapshots and makes Carol's new version
    visible.
  - What it gives us: The before/after comparison for the snapshot experiment.
- **REPEATABLE READ** (transaction isolation level, in the challenge)
  - What it is: An isolation mode that keeps one snapshot for the entire transaction.
  - What it does here: Repeated **pg_current_snapshot()** calls retain the same text despite another
    transaction committing.
  - What it gives us: Evidence of a stable view.
- **READ COMMITTED** (transaction isolation level, in the challenge)
  - What it is: PostgreSQL's default mode, which takes a snapshot for each statement.
  - What it does here: Repeating the same query allows xmax to advance after another commit.
  - What it gives us: A direct contrast with REPEATABLE READ.
`,
      setup: ACCOUNTS,
      code: code`
-- Session A
select pg_current_snapshot() as snapshot_before_b;

-- Session B
begin;
update mv_accounts set balance = balance + 10 where id = 3;
select pg_current_xact_id() as b_xid;

-- Session A
-- one more transaction starts and finishes after B, so B is no longer the newest xid
begin;
update mv_accounts set balance = balance + 1 where id = 1;
commit;
select pg_current_snapshot() as snapshot_while_b_runs;
select pg_snapshot_xmin(pg_current_snapshot()) as snap_xmin,
       pg_snapshot_xmax(pg_current_snapshot()) as snap_xmax,
       (select array_agg(x) from pg_snapshot_xip(pg_current_snapshot()) as x) as in_progress;
select id, balance from mv_accounts where id = 3;

-- Session B
commit;

-- Session A
select pg_current_snapshot() as snapshot_after_b_commits;
select id, balance from mv_accounts where id = 3;`,
      expectedResult: code`
Before B starts, A's snapshot has an empty in-progress list and xmin = xmax, for example
3121:3121:. B then takes xid 3123 and stays open, and A's throwaway transaction (3124) starts and
commits after it, so A's next snapshot is
  snapshot_while_b_runs
  -----------------------
   3123:3125:3123
that is snap_xmin = 3123, snap_xmax = 3125, in_progress = {3123}. B is the only xid in the middle
band, so it is the only one that needs checking; its row is invisible to A, which still reads
balance 100 for carol.
After B commits, A's next statement takes a fresh snapshot, 3126:3126: with an empty in-progress
list, and reads balance 110. B's xid did not move; it simply fell below the new xmin.
Note why A's own commit was needed: xmax is "last completed xid + 1", so while B held the newest
xid it sat at or above xmax and never made it into the list at all.`,
      systemsLens: code`
This is the general shape of a consistent read in any versioned store: a pair of watermarks plus an
exception list. Everything below xmin is settled, everything at or above xmax is from the future,
and the finite list in the middle is the only thing that needs per-item checking. The same structure
shows up as version vectors, read timestamps with a "pending" set, and GC horizons. Note the cost
model: the list is O(concurrent write transactions), which is why thousands of long-running writers
make snapshot taking itself expensive.`,
      challenge: code`
Run "begin isolation level repeatable read; select pg_current_snapshot();" twice in the same
transaction with a write committing in between: the snapshot text does not change. Then do the same
under read committed and watch xmax advance on every statement.`,
    },
    {
      slug: "two-sessions-see-different-versions",
      title: "Two versions of one row, live at the same time",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      prerequisites: ["snapshot-anatomy"],
      overview: code`
An UPDATE in PostgreSQL never overwrites a row. It writes a new tuple and stamps the old one as
deleted by the updating xid, so both versions sit on the page at once and each session is routed to
the one its snapshot allows. Here a REPEATABLE READ reader keeps reading the old version while a
writer commits a new one, and you dump the page to see both.`,
      reading:
        `PostgreSQL 14 Internals, Chapter 4 "Snapshots" (section "Row Version Visibility"); Chapter 2 "Isolation" (section "Repeatable Read")`,
      readingNotes: code`
Chapter 4 explains how a snapshot chooses among tuple versions, and Chapter 2 explains why
REPEATABLE READ keeps that choice stable. This lesson shows both sides at once: raw page inspection
reveals old and new tuples while Session A continues to read the old one. Run it before the chapters
if the page dump is new to you, then read the visibility rules afterward.`,
      syntaxBreakdown: code`
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
`,
      setup: ACCOUNTS,
      code: code`
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
select ctid, id, balance from mv_accounts where id = 1;`,
      expectedResult: code`
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
decision differs. After A commits, its next SELECT reads (0,4) and balance 150.`,
      systemsLens: code`
Multi-version concurrency control buys readers-never-block-writers by turning an update into an
append plus a tombstone. The consequences follow mechanically: the table grows even under a pure
UPDATE workload, indexes must point at versions rather than rows, and someone has to reclaim the
old versions later. That is the same trade every LSM tree and every append-only log makes -- cheap
concurrent reads now, compaction debt later -- and the next two lessons are about who pays it.`,
      challenge: code`
Update alice three more times, then read t_ctid down the chain from lp 1: it is a linked list of
versions. Now do the same with an UPDATE that changes only a non-indexed column on a page with free
space and look for HOT (heap-only tuple) behaviour, where the new version stays off the index.`,
    },
    {
      slug: "commit-visibility-and-clog",
      title: "Commit is a bit flip in pg_xact, not a rewrite of your rows",
      difficulty: "intermediate",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      estimatedMinutes: 15,
      prerequisites: ["two-sessions-see-different-versions"],
      overview: code`
A tuple header says which xid created it, but not whether that xid committed. That fact lives
somewhere else: the commit log, pg_xact, two bits per transaction. You will abort a transaction that
wrote rows, prove the rows are still physically on the page, and prove they are invisible only
because pg_xact says their creator aborted.`,
      reading:
        `PostgreSQL 14 Internals, Chapter 3 "Pages and Tuples" (section "Operations on Tuples")`,
      readingNotes: code`
Chapter 3 describes insert, commit, abort, and update as tuple operations whose physical effects are
separate from commit status. This lesson makes that separation concrete by reading pg_xact_status,
then inspecting aborted tuple headers that remain on the page. Read the chapter after running the
experiment to connect its tuple diagrams to the aborted and committed examples.`,
      revision: 4,
      studyCheckpoint: {
        core: [
          {
            source: "PostgreSQL 14 Internals",
            locator:
              `Chapter 3 §§3.2–3.3 "Row Version Layout" and "Operations on Tuples" (printed pp. 64–74)`,
          },
          {
            source: "PostgreSQL 14 Internals",
            locator: `Chapter 4 §§4.1–4.3 (printed pp. 80–86)`,
          },
        ],
        rationale: code`
You observed transaction IDs, snapshots, multiple row versions, and commit-log visibility.
Read these sections to connect the tuple headers and commit/abort status to the formal snapshot
model before the horizon and freezing work. Skip from the PG14 text: exact infomask bit values,
catalog output, and example transaction numbers; resume with the horizon experiment when you finish.
`,
      },
      syntaxBreakdown: code`
### In plain terms

This experiment writes an INSERT and an UPDATE, then rolls the transaction back. The bytes for those
row versions remain on the heap page, but ordinary queries hide them because the commit log says the
creating transaction aborted. A later committed transaction provides the contrast: the same metadata
path marks its version visible.

### What you are learning

- **Commit-log indirection:** Tuple headers identify transactions, while **pg_xact** separately records
  whether each transaction committed or aborted.
- **Rollback visibility:** ROLLBACK changes the transaction status; it does not need to rewrite every
  tuple created by the transaction.
- **Hint bits:** A later read can cache commit status in tuple-header flags, making future visibility
  checks cheaper while dirtying the page.

### Piece by piece

- **BEGIN** (transaction control)
  - What it is: It starts the transaction whose writes will be tested.
  - What it does here: The doomed transaction gets an xid, inserts Dave, and updates Bob before
    rollback; the second transaction repeats the pattern but commits.
  - What it gives us: A controlled pair of committed and aborted tuple versions.
- **pg_current_xact_id()** (xid inspection function)
  - What it is: It returns and, if necessary, allocates the current transaction's xid8.
  - What it does here: Its result is saved as **doomed_xid** and **good_xid** before each transaction ends.
  - What it gives us: Stable IDs that can be queried after COMMIT or ROLLBACK.
- **\\gset** (psql meta-command)
  - What it is: It stores each column of the preceding one-row query in a psql variable named after
    that column.
  - What it does here: It preserves each xid in **:doomed_xid** or **:good_xid** after the transaction
    that produced it has finished.
  - What it gives us: Variables for later status queries and the **\\echo** line.
- **INSERT** and **UPDATE ... WHERE** (data-change statements)
  - What they are: INSERT adds a row; UPDATE creates a replacement version for Bob where **id = 2**.
  - What they do here: They create physical work inside the doomed and good transactions.
  - What they give us: Four visible rows inside the first transaction, then aborted versions that
    disappear from ordinary reads after rollback.
- **ROLLBACK** (transaction control)
  - What it is: It marks the transaction aborted and discards its logical effects.
  - What it does here: Dave and Bob's zero-balance version become invisible without being erased yet.
  - What it gives us: The key contrast between **rows_visible_inside_txn** and after rollback.
- **\\echo** (psql output command)
  - What it is: It prints text after expanding psql variables.
  - What it does here: It displays the saved doomed xid so the following result is readable.
  - What it gives us: A label tying the status result to the transaction that was rolled back.
- **pg_xact_status(xid8)** (commit-log inspection function)
  - What it is: It looks up an xid in PostgreSQL's commit log and returns **in progress**,
    **committed**, or **aborted**.
  - What it does here: It checks both saved IDs after their transactions finish.
  - What it gives us: **aborted** for the doomed xid and **committed** for the good xid.
- **::text::xid8** (explicit cast chain)
  - What it is: psql substitutes **:name** as text, then PostgreSQL casts that text to the xid8 type.
  - What it does here: It gives **pg_xact_status** the typed xid it requires.
  - What it gives us: A status lookup instead of a type-resolution error.
- **heap_page_items(get_raw_page(...))** (pageinspect inspection)
  - What it is: **get_raw_page** reads heap block 0 and **heap_page_items** decodes its line pointers
    and tuple headers.
  - What it does here: It runs after rollback and shows Dave and Bob's aborted versions still present.
  - What it gives us: **t_xmin**/**t_xmax** values stamped with the doomed xid even though normal SELECT
    omits those rows.
- **SELECT ... ORDER BY id** (visible-row observation)
  - What it is: It reads account rows and sorts them by their logical ID.
  - What it does here: It compares visibility before and after rollback and after Erin commits.
  - What it gives us: Bob returns to 100, Dave never appears, and Erin adds the fourth visible row.
- **COMMIT** (transaction control)
  - What it is: It makes the second transaction's changes durable and visible.
  - What it does here: Erin remains visible and **good_xid** becomes committed in the log.
  - What it gives us: A committed status to compare with the aborted status.
- **pg_xact** (on-disk commit-log directory)
  - What it is: A directory of small 8 KiB status segments; each byte stores the status of four xids.
  - What it does here: The psql **\\! ls -l** shell escape lists the lab cluster's segment file.
  - What it gives us: Physical evidence that commit truth is kept in a compact side structure.
- **\\! ls -l PATH** (psql shell escape)
  - What it is: It runs the given operating-system command from psql; **ls -l** lists file sizes and
    ownership.
  - What it does here: It lists **$PGLAB/primary/pg_xact** using the shell environment established in the toolkit lesson.
  - What it gives us: The small **0000** segment that stores status for this short-lived lab.
- **t_infomask and HEAP_XMIN_COMMITTED (challenge)** (tuple hint metadata)
  - What they are: **t_infomask** contains tuple flags; bit 256 is the committed-creator hint.
  - What they do here: Comparing page dumps around an ordinary SELECT can show a visibility check setting the hint bit.
  - What they give us: Evidence that a SELECT can cache commit status and dirty a page.
`,
      setup: ACCOUNTS,
      code: code`
-- Session A
begin;
select pg_current_xact_id() as doomed_xid \gset
insert into mv_accounts (id, owner, balance) values (4, 'dave', 100);
update mv_accounts set balance = 0 where id = 2;
select count(*) as rows_visible_inside_txn from mv_accounts;
rollback;

\echo the aborted transaction was :doomed_xid
select pg_xact_status(:doomed_xid::text::xid8) as doomed_status;
select count(*) as rows_visible_after_rollback from mv_accounts;
select id, balance from mv_accounts order by id;

-- the rows the aborted transaction wrote are still on the page
select lp, t_xmin, t_xmax, t_ctid from heap_page_items(get_raw_page('mv_accounts', 0)) order by lp;

-- now a transaction that commits, for contrast
begin;
select pg_current_xact_id() as good_xid \gset
insert into mv_accounts (id, owner, balance) values (5, 'erin', 100);
commit;
select pg_xact_status(:good_xid::text::xid8) as good_status,
       pg_xact_status(:doomed_xid::text::xid8) as doomed_status;
select count(*) as rows_visible_now from mv_accounts;

-- the commit log is a handful of bytes per transaction, in its own directory
\! ls -l "$PGLAB/primary/pg_xact"`,
      expectedResult: code`
Inside the transaction rows_visible_inside_txn = 4 (dave is there) and bob's balance is 0. After
ROLLBACK, rows_visible_after_rollback = 3 and bob is back at 100 -- nothing was undone, the reader
just skipped the aborted versions. pg_xact_status prints 'aborted' for the doomed xid.
The page dump proves the writes happened: line pointers for dave's INSERT and for the new version of
bob's row are still there, stamped with the aborted xid, for example
   lp | t_xmin | t_xmax | t_ctid
  ----+--------+--------+--------
    1 |   3163 |      0 | (0,1)
    2 |   3163 |   3164 | (0,5)
    3 |   3163 |      0 | (0,3)
    4 |   3164 |      0 | (0,4)
    5 |   3164 |      0 | (0,5)
where 3164 is the doomed xid: lp 4 is dave, lp 5 is the zeroed version of bob's row, and bob's
original at lp 2 is even marked deleted by 3164. Nothing on the page distinguishes any of this
from a committed transaction's work.
The second transaction commits, so pg_xact_status prints 'committed' for good_xid and still
'aborted' for the doomed one, and rows_visible_now = 4 (erin joined; dave never did).
In this young lab, ls normally shows a small segment named "0000". A longer-running cluster can
have more segments, and old status history is eventually removed; this directory is not a permanent
audit log of every transaction the cluster has ever run.`,
      systemsLens: code`
Separating "what was written" from "was it committed" is what makes abort O(1) instead of O(work
done). The price is an extra lookup on every visibility check, which is why PostgreSQL caches
pg_xact in shared memory and then caches the answer per tuple in hint bits (t_infomask) so the
second reader does not pay for it. Every commit protocol has this shape: the durable, tiny commit
record is the truth, and the bulky data is speculative until it points at one. It is also why the
first reader after a crash is slower than the second.`,
      challenge: code`
Raw page inspection does not perform tuple visibility checks. Use a fresh committed tuple and put an
ordinary SELECT between the page dumps instead:

drop table if exists mv_hint;
create table mv_hint(id int);
insert into mv_hint values (1);
select lp, t_infomask from heap_page_items(get_raw_page('mv_hint', 0));
select * from mv_hint;
select lp, t_infomask from heap_page_items(get_raw_page('mv_hint', 0));

Compare the committed-creator hint (t_infomask & 256). A normal read can cache transaction status
in the header; an already-set hint need not change again. Explain why inspecting bytes twice alone
would not cause that visibility work.`,
    },
    {
      slug: "xmin-horizon-blocks-cleanup",
      title: "An old snapshot turns ordinary churn into retained history",
      difficulty: "advanced",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 20,
      prerequisites: ["commit-visibility-and-clog"],
      revision: 4,
      overview: code`
Dead versions can only be reclaimed once no snapshot could still need them. This experiment runs the
same bounded, separately committed update churn twice. In the baseline, VACUUM reclaims old versions.
In the pinned run, Session B holds a repeatable-read snapshot, so the same cleanup must retain them.
You will match VACUUM's removable cutoff to B's exact backend_xmin, release B, and measure that
logical rows never changed while dead versions became reusable space.`,
      reading:
        `PostgreSQL 14 Internals, Chapter 4 "Snapshots" (section "Transaction Horizon"); Chapter 6 "Vacuum and Autovacuum" (section "Database Horizon Revisited")`,
      readingNotes: code`
Chapter 4 defines the transaction horizon as the oldest snapshot that may still need a row version,
and Chapter 6 applies that horizon to vacuum cleanup. The matched baseline and pinned runs separate
ordinary pruning from retention caused by an old snapshot. Read after the experiment to connect B's
backend_xmin and VACUUM's removable cutoff to the formal horizon model.`,
      syntaxBreakdown: code`
### In plain terms

The baseline and pinned cases run the same separately committed updates. In one case VACUUM can
remove old versions immediately; in the other, B's old snapshot means it must retain them. The row
count stays fixed, so the changed dead-tuple and free-space measurements isolate reclamation.

### What you are learning

- **Snapshot horizon:** An old snapshot can make a logically dead version still unsafe to remove.
- **Matched experiment:** A no-reader baseline separates normal page pruning from retention caused by B.
- **Reusable space:** Plain VACUUM frees bytes inside the table; it does not normally shrink its file.

### Piece by piece

- **CREATE TABLE, ALTER TABLE, TRUNCATE, and INSERT** (setup commands)
  - What they are: They create the disposable table, disable only its autovacuum, reset it, and load
    ten padded rows.
  - What they do here: They give both cases identical logical starting data.
  - What they give us: A fair comparison without cleanup from an earlier run.
- **format, generate_series, and \gexec** (psql-generated SQL)
  - What they are: generate_series emits 100 rows, format creates one UPDATE string per row, and
    \gexec executes each generated string as a separate statement.
  - What they do here: They create independently committed churn instead of one giant transaction.
  - What they give us: Old versions from a bounded sequence of completed writes.
- **VACUUM (VERBOSE, ANALYZE)** (maintenance command)
  - What it is: It removes eligible versions, prints its removable cutoff and tuple accounting, and
    refreshes tuple estimates.
  - What it does here: It runs after baseline churn, while B pins the second case, and after B commits.
  - What it gives us: The before-release and after-release reclamation evidence.
- **pg_relation_size and pgstattuple** (physical inspection functions)
  - What they are: The first reports allocated main-fork bytes; the second scans live, dead, and free
    tuple space exactly.
  - What they do here: They compare page allocation and dead/reusable bytes across both cases.
  - What they give us: Ten logical rows with different retained-dead and free-space outcomes.
- **SET application_name** (session setting)
  - What it is: It labels B's backend in server activity views.
  - What it does here: It gives A a stable identity for the snapshot holder.
  - What it gives us: A query that identifies this reader without guessing among other sessions.
- **BEGIN ISOLATION LEVEL REPEATABLE READ and SELECT** (transaction and snapshot)
  - What they are: The first SELECT fixes B's snapshot for the transaction's life.
  - What they do here: B sees the ten rows before A's pinned churn and remains open.
  - What they give us: A backend_xmin that prevents old versions becoming removable.
- **pg_stat_activity.backend_xmin** (activity-view field)
  - What it is: The oldest xid B's advertised snapshot may still need.
  - What it does here: A reads B's state, xmin, and transaction start before its first pinned VACUUM.
  - What it gives us: The exact xid to compare with VACUUM's removable cutoff.
- **COMMIT** (transaction control)
  - What it is: It ends B's snapshot-holding transaction.
  - What it does here: It releases the blocker before A's final VACUUM.
  - What it gives us: Retained dead tuples becoming removable while row count remains ten.
`,
      setup: code`
create table if not exists mv_horizon (
  id int primary key,
  n int not null,
  pad text not null
);
alter table mv_horizon set (autovacuum_enabled = off);
truncate mv_horizon;
insert into mv_horizon select g, 0, repeat('x', 500) from generate_series(1, 10) g;
vacuum (analyze) mv_horizon;`,
      code: code`
-- Session A: baseline. Each generated UPDATE commits independently.
select pg_relation_size('mv_horizon') / 8192 as baseline_pages_before, count(*) as baseline_rows
from mv_horizon;
select format('update mv_horizon set n = n + 1;') from generate_series(1, 100) \gexec
vacuum (verbose, analyze) mv_horizon;
select count(*) as baseline_rows_after, pg_relation_size('mv_horizon') / 8192 as baseline_pages_after
from mv_horizon;
select tuple_count as baseline_live, dead_tuple_count as baseline_dead, free_percent as baseline_free
from pgstattuple('mv_horizon');

-- Session A: reset to the matched starting state.
truncate mv_horizon;
insert into mv_horizon select g, 0, repeat('x', 500) from generate_series(1, 10) g;
vacuum (analyze) mv_horizon;

-- Session B: take and hold the old snapshot.
set application_name = 'mvcc-horizon-reader';
begin isolation level repeatable read;
select count(*) as b_sees_before_churn from mv_horizon;

-- Session A: the same independently committed updates now run behind B's snapshot.
select format('update mv_horizon set n = n + 1;') from generate_series(1, 100) \gexec
select count(*) as pinned_rows, pg_relation_size('mv_horizon') / 8192 as pinned_pages_before_vacuum
from mv_horizon;
select pid, state, backend_xmin, xact_start
from pg_stat_activity where application_name = 'mvcc-horizon-reader';
vacuum (verbose, analyze) mv_horizon;
select tuple_count as pinned_live, dead_tuple_count as pinned_dead, free_percent as pinned_free
from pgstattuple('mv_horizon');

-- Session B
commit;

-- Session A
vacuum (verbose, analyze) mv_horizon;
select count(*) as released_rows, pg_relation_size('mv_horizon') / 8192 as released_pages
from mv_horizon;
select tuple_count as released_live, dead_tuple_count as released_dead, free_percent as released_free
from pgstattuple('mv_horizon');`,
      expectedResult: code`
The baseline starts and ends with 10 logical rows. Its 100 separately committed updates may grow the
heap while they run, but VACUUM reports old tuples removed and pgstattuple reports baseline_dead = 0.
The table may retain allocated pages; baseline_free is evidence that their bytes are reusable.

The reset also starts with 10 rows. Session B reports b_sees_before_churn = 10, then the activity
query identifies exactly one **mvcc-horizon-reader** backend with a non-NULL backend_xmin. The pinned
run still reports pinned_rows = 10, but its first verbose VACUUM reports old tuples that are dead but
not yet removable. Its **removable cutoff** is B's backend_xmin; absolute xid values and retained
physical-version counts vary with page pruning and server version.

After B commits, the next VACUUM reports those old versions removed. released_rows remains 10,
released_dead becomes 0, and released_free rises. released_pages commonly stays at the pinned size:
plain VACUUM made bytes reusable inside the relation; it did not promise to return pages to the OS.`,
      systemsLens: code`
Garbage collection in a multi-version system is bounded by its oldest relevant observer. The baseline
and pinned cases have the same writes and logical data; the old snapshot alone changes whether
versions can be reclaimed. PostgreSQL combines several horizon inputs for different cleanup duties,
so treat a user-table blocker as evidence about this relation's cleanup, not a complete inventory of
every cluster-wide retention source. Operations should bound transaction lifetime and alert on old
active snapshots before retention turns into capacity pressure.`,
      caution: code`
This lesson disables autovacuum only on its disposable table. Do not copy that setting to an
application table. In production, find the actual blocker before terminating a session: it may be a
valid report or migration, and cancelling it changes application behaviour.`,
      challenge: code`
Repeat only the pinned case with B running **begin;** but no query. Run the same generated updates,
inspect B in pg_stat_activity, and then VACUUM. If B has no snapshot/backend_xmin, cleanup should
match the baseline. That variation distinguishes an open connection from an old snapshot.`,
    },
    {
      slug: "wraparound-and-freezing",
      title: "Freezing: how a 32-bit counter avoids a 2^31 cliff",
      difficulty: "advanced",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      estimatedMinutes: 18,
      prerequisites: ["xmin-horizon-blocks-cleanup"],
      overview: code`
Transaction ids are 32 bits and visibility compares them modulo 2^32, so "older than me" only has a
meaning within a window of 2^31 transactions. A row whose creating xid falls out of that window
would suddenly look like it came from the future. Freezing is the escape hatch: mark a tuple as
unconditionally visible so its xid stops mattering. You will measure the age of the table, burn a
couple of thousand xids to move it, freeze, and watch the age snap back to zero.`,
      reading:
        `PostgreSQL 14 Internals, Chapter 7 "Freezing" (sections "Transaction ID Wraparound", "Tuple Freezing and Visibility Rules", "Manual Freezing")`,
      readingNotes: code`
Chapter 7 explains why a 32-bit xid needs freezing, how frozen tuples are treated as universally
visible, and how manual VACUUM FREEZE advances a relation's frozen horizon. This lesson burns xids in
a small lab and inspects the tuple flags before and after freezing. Run it first for intuition, then
read the chapter to understand the safety margins and freeze ages used in production.`,
      syntaxBreakdown: code`
### In plain terms

PostgreSQL transaction IDs are a finite 32-bit clock. If an old row's ID were compared after the
clock wrapped, it could look newer than a current transaction; freezing marks an old visible tuple as
safe forever so its original ID no longer matters. This experiment burns IDs, measures the growing
age, runs VACUUM FREEZE, and observes the age and tuple flags reset without rewriting the row.

### What you are learning

- **Xid wraparound:** Visibility comparisons are safe only within a half-range of the 32-bit counter.
- **Frozen horizon:** relfrozenxid/datfrozenxid record how far old tuple IDs have been made safe.
- **Freeze hint bits:** A pair of tuple flags represents “frozen” while t_xmin remains unchanged.

### Piece by piece

- **generate_series(1, 50)** (set-returning function)
  - What it is: It emits one integer per value in the inclusive range.
  - What it does here: It creates 50 predictable account rows with owner names built by **||**.
  - What it gives us: A small page whose tuples can all be inspected and frozen.
- **CREATE TABLE / TRUNCATE / INSERT ... SELECT** (lab setup)
  - What they are: CREATE defines the account and xid-burning tables, TRUNCATE resets them, and
    INSERT SELECT loads generated rows.
  - What they do here: They make repeated runs independent and ensure the account tuples are old
    enough to freeze.
  - What they give us: A known 50-tuple heap and an empty **mv_burn** target.
- **VACUUM** (maintenance command)
  - What it is: It marks dead space reusable and advances a relation's cleanup metadata.
  - What it does here: Setup establishes a clean frozen horizon before IDs are burned.
  - What it gives us: A starting relfrozenxid and no initially frozen tuples in the page dump.
- **age(relfrozenxid) and age(datfrozenxid)** (xid-age expressions)
  - What they are: They measure transactions since the relation or database's guaranteed-frozen xid.
  - What they do here: Queries against **pg_class** and **pg_database** report relation and database age.
  - What they give us: Small starting ages and an increase after the burn loop.
- **pg_class and pg_database** (system catalog tables)
  - What they are: They store relation definitions and database-wide metadata.
  - What they do here: **relfrozenxid** identifies the table's frozen boundary; **datfrozenxid** identifies
    the database boundary; **current_database()** restricts the latter to this lab database.
  - What they give us: The exact horizons that autovacuum's wraparound protection monitors.
- **current_setting(...)** (configuration inspection function)
  - What it is: It returns a setting's current text value.
  - What it does here: It reads **vacuum_freeze_min_age** and **autovacuum_freeze_max_age** before the burn.
  - What it gives us: The configured trigger values that put the tiny lab ages in context.
- **heap_page_items(get_raw_page(...))** (pageinspect functions)
  - What they are: They read and decode raw heap page 0, exposing tuple flags and xids.
  - What they do here: **count(*) FILTER (WHERE ...)** counts frozen tuples, while the final query prints
    the first three line pointers' **t_xmin** and **t_infomask**.
  - What they give us: Zero frozen tuples before, 50 after, unchanged t_xmin, and the frozen flag bits.
- **DO $$ ... $$** (anonymous PL/pgSQL block)
  - What it is: It executes procedural code without creating a permanent function.
  - What it does here: The **FOR i IN 1..2000** loop opens a nested block for each iteration; each INSERT
    consumes a transaction ID, and the exception handler keeps the loop going if one iteration fails.
  - What it gives us: An age increase of roughly 2000 xids.
- **EXCEPTION WHEN OTHERS THEN NULL** (PL/pgSQL error handler)
  - What it is: It catches any error in the nested insert block and does nothing for that iteration.
  - What it does here: It makes the xid-burning loop continue rather than aborting on one failure.
  - What it gives us: A best-effort burn; the measured age, not an assumed exact count, is authoritative.
- **VACUUM (FREEZE, VERBOSE)** (maintenance command with options)
  - What it is: FREEZE uses an effective minimum freeze age of zero for this run; VERBOSE prints work.
  - What it does here: It freezes every eligible visible tuple and reports the new relfrozenxid.
  - What it gives us: Age near zero, 50 frozen tuples, and “frozen” page counts in the INFO output.
- **(t_infomask & 768) = 768** (bit-mask predicate)
  - What it is: **&** keeps only selected bits; 768 is 0x0100 | 0x0200, the committed and invalid hint
    combination PostgreSQL uses to represent a frozen xmin.
  - What it does here: The FILTER counts tuples carrying both bits.
  - What it gives us: A numeric before/after test for freezing rather than relying only on log text.
- **ORDER BY lp LIMIT 3** (result-shaping clauses)
  - What they are: ORDER BY makes page slots stable; LIMIT restricts output to three examples.
  - What they do here: They keep the final tuple-header evidence short and comparable.
  - What they give us: Representative t_xmin and t_infomask values after freezing.
- **VACUUM with vacuum_freeze_min_age = 0** (challenge variation)
  - What it is: A session-level setting of zero makes an ordinary vacuum consider tuples immediately.
  - What it does here: The challenge compares plain VACUUM under that setting with explicit FREEZE.
  - What it gives us: A test of whether the setting produces the same amount of freezing.
`,
      setup: code`
create table if not exists mv_accounts (
  id int primary key,
  owner text not null,
  balance int not null
);
truncate mv_accounts;
insert into mv_accounts (id, owner, balance)
select g, 'owner' || g, 100 from generate_series(1, 50) g;
create table if not exists mv_burn (n int);
truncate mv_burn;
vacuum mv_accounts;`,
      code: code`
-- Session A
select relfrozenxid, age(relfrozenxid) as rel_age from pg_class where relname = 'mv_accounts';
select datfrozenxid, age(datfrozenxid) as db_age from pg_database where datname = current_database();
select current_setting('vacuum_freeze_min_age') as freeze_min_age,
       current_setting('autovacuum_freeze_max_age') as freeze_max_age;
select count(*) filter (where (t_infomask & 768) = 768) as frozen_tuples,
       count(*) as tuples_on_page
from heap_page_items(get_raw_page('mv_accounts', 0));

-- Session A
-- burn 2000 transaction ids without doing any useful work
do $$
begin
  for i in 1..2000 loop
    begin
      insert into mv_burn values (i);
    exception when others then null;
    end;
  end loop;
end $$;
select age(relfrozenxid) as rel_age_after_burning_2000 from pg_class where relname = 'mv_accounts';

-- Session A
vacuum (freeze, verbose) mv_accounts;
select relfrozenxid, age(relfrozenxid) as rel_age_after_freeze from pg_class where relname = 'mv_accounts';
select count(*) filter (where (t_infomask & 768) = 768) as frozen_tuples,
       count(*) as tuples_on_page
from heap_page_items(get_raw_page('mv_accounts', 0));
select lp, t_xmin, t_infomask from heap_page_items(get_raw_page('mv_accounts', 0)) order by lp limit 3;`,
      expectedResult: code`
Be honest about the scale here: this lab was created minutes ago, so the numbers are tiny. rel_age
starts at something like 2 and db_age at a few hundred, against a freeze_max_age of 200000000 and a
hard wall at 2^31. The mechanism is identical at any size; only the clock is short.
Before freezing, frozen_tuples = 0 out of tuples_on_page = 50.
The DO block moves the counter: rel_age_after_burning_2000 comes back around 2003 -- each of the
2000 subtransactions that wrote a row consumed an xid.
VACUUM (FREEZE) prints
  INFO:  aggressively vacuuming "lab.public.mv_accounts"
  frozen: 1 pages from table (100.00% of total) had 50 tuples frozen
  new relfrozenxid: 3018, which is 2002 XIDs ahead of previous value
and afterwards rel_age_after_freeze = 0 and frozen_tuples = 50 of 50.
Look at the last dump: t_xmin is unchanged (still the INSERT's xid, e.g. 1015) while t_infomask is
2818 = 0x0B02, which has both 0x0100 and 0x0200 set. The row was not rewritten; a two-bit flag now
says "visible to everyone, do not ask the counter".`,
      systemsLens: code`
This is epoch-based reclamation with a fixed-width clock. Comparisons are modular, so correctness
depends on all live references staying inside half the space, and the system must continuously
retire old references (freeze) to keep that invariant -- exactly like sequence numbers in TCP, epoch
numbers in Raft, or hazard-pointer/epoch GC in lock-free data structures. The failure mode is what
makes it famous: if freezing cannot keep up, PostgreSQL first screams in the log, then refuses new
transactions to avoid ambiguity, and the only cure is a single-user vacuum. Anything that blocks
vacuum -- lesson 5's horizon holders, an abandoned replication slot, a prepared transaction nobody
committed -- is therefore also a wraparound risk, and that is why age(datfrozenxid) belongs on your
dashboard next to disk space.`,
      caution: code`
Never leave a transaction, replication slot, or prepared transaction open for weeks on a busy
cluster. Wraparound protection failing is one of the few PostgreSQL faults that stops writes
completely.`,
      challenge: code`
Query "select datname, age(datfrozenxid) from pg_database order by 2 desc" and work out how many
transactions of headroom the lab has before autovacuum_freeze_max_age forces an aggressive vacuum.
Then set vacuum_freeze_min_age = 0 for a session, run a plain VACUUM, and check whether it freezes
as much as VACUUM (FREEZE) did.`,
    },
  ],
};
