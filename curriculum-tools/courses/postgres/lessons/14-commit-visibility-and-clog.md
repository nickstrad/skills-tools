# Commit is a bit flip in pg_xact, not a rewrite of your rows

slug: commit-visibility-and-clog
category: mvcc
difficulty: intermediate
tags: 
prerequisites: two-sessions-see-different-versions
safety: writes-data
run-in: tool
sessions: 1
min-version: 16
minutes: 15
revision: 4

## Overview
A tuple header says which xid created it, but not whether that xid committed. That fact lives
somewhere else: the commit log, pg_xact, two bits per transaction. You will abort a transaction that
wrote rows, prove the rows are still physically on the page, and prove they are invisible only
because pg_xact says their creator aborted.

## Syntax breakdown
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
\! ls -l "$PGLAB/primary/pg_xact"
```

## Expected result
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
audit log of every transaction the cluster has ever run.

## Systems lens
Separating "what was written" from "was it committed" is what makes abort O(1) instead of O(work
done). The price is an extra lookup on every visibility check, which is why PostgreSQL caches
pg_xact in shared memory and then caches the answer per tuple in hint bits (t_infomask) so the
second reader does not pay for it. Every commit protocol has this shape: the durable, tiny commit
record is the truth, and the bulky data is speculative until it points at one. It is also why the
first reader after a crash is slower than the second.

## Optional variation
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
would not cause that visibility work.
