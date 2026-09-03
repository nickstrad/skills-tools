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
      syntaxBreakdown: code`
pg_current_xact_id_if_assigned() returns the current transaction's xid or NULL if it has not been
assigned one yet -- it never forces an assignment. pg_current_xact_id() forces one. Both return
xid8, a 64-bit value (32-bit xid plus epoch) so the numbers do not wrap in the output. pg_locks
shows a "virtualxid" lock for every backend: that is the cheap per-session identity a read-only
transaction uses instead of a real xid.`,
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
      syntaxBreakdown: code`
pg_current_snapshot() prints a snapshot as xmin:xmax:xip_list, for example 1035:1036:1035.
pg_snapshot_xmin(), pg_snapshot_xmax() and pg_snapshot_xip() pull the parts out; pg_snapshot_xip()
is a set-returning function, so it is wrapped in array_agg here. Under READ COMMITTED a new snapshot
is taken for every statement, which is why running the same SELECT twice can print different
snapshots.`,
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
      syntaxBreakdown: code`
heap_page_items(get_raw_page('mv_accounts', 0)) from pageinspect lists every line pointer on page 0
with t_xmin (creating xid), t_xmax (deleting xid), and t_ctid (the forward pointer an UPDATE leaves
from the old version to the new one). ctid is the physical address of the version a query actually
read, so selecting it from two sessions shows they touched different tuples.`,
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
      syntaxBreakdown: code`
pg_xact_status(xid8) reads the commit log and returns 'in progress', 'committed' or 'aborted'. A
psql variable interpolates as a bare integer literal, so it needs the explicit cast ::text::xid8.
psql's \gset captures a query result into a variable, so the doomed transaction's own xid survives
its rollback. pg_xact itself is a directory of 8 kB segments under the data directory, each byte
holding the status of four transactions.`,
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
\! ls -l /var/lib/postgresql/pglab/primary/pg_xact`,
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
The ls shows one small segment file, "0000", 8192 bytes, owned by postgres: that file is the entire
verdict on every transaction the cluster has ever run.`,
      systemsLens: code`
Separating "what was written" from "was it committed" is what makes abort O(1) instead of O(work
done). The price is an extra lookup on every visibility check, which is why PostgreSQL caches
pg_xact in shared memory and then caches the answer per tuple in hint bits (t_infomask) so the
second reader does not pay for it. Every commit protocol has this shape: the durable, tiny commit
record is the truth, and the bulky data is speculative until it points at one. It is also why the
first reader after a crash is slower than the second.`,
      challenge: code`
Run the page dump twice and diff t_infomask between the runs. The first read after the commit sets
the HEAP_XMIN_COMMITTED hint bit (256) in the header, so the second reader never consults pg_xact
again -- a cache write performed by a SELECT, which is why a read-only query can dirty pages.`,
    },
    {
      slug: "xmin-horizon-blocks-cleanup",
      title: "One idle transaction pins every dead row in the cluster",
      difficulty: "advanced",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 18,
      prerequisites: ["commit-visibility-and-clog"],
      overview: code`
Dead versions can only be reclaimed once no snapshot could still need them. The cutoff is the
minimum xmin over every snapshot in the cluster, so a single session sitting in an open transaction
holds the horizon down for everyone -- in this database and, for the shared horizon, beyond it. You
will delete rows, fail to vacuum them away, watch the blocker in pg_stat_activity, then release it
and vacuum again.`,
      syntaxBreakdown: code`
VACUUM (VERBOSE) reports what it could and could not remove; the lines that matter are
"tuples: N removed, M remain, K are dead but not yet removable" and "removable cutoff: X, which was
N XIDs old when operation ended". pg_stat_activity.backend_xmin is the oldest xid each backend's
snapshot still needs. pgstattuple counts live and dead tuples independently of vacuum.
VACUUM also reports on the table's TOAST relation; ignore those blocks.`,
      setup: ACCOUNTS,
      code: code`
-- Session A
vacuum mv_accounts;
select tuple_count as live, dead_tuple_count as dead from pgstattuple('mv_accounts');

-- Session B
begin isolation level repeatable read;
select count(*) as b_sees from mv_accounts;

-- Session A
delete from mv_accounts where id in (2, 3);
select tuple_count as live, dead_tuple_count as dead from pgstattuple('mv_accounts');
select pid, state, backend_xmin, xact_start is not null as in_txn
from pg_stat_activity where backend_xmin is not null order by backend_xmin;
vacuum (verbose) mv_accounts;

-- Session B
commit;

-- Session A
vacuum (verbose) mv_accounts;
select tuple_count as live, dead_tuple_count as dead from pgstattuple('mv_accounts');`,
      expectedResult: code`
After the DELETE, pgstattuple reports live = 1, dead = 2. Session B is idle in a transaction and
publishes the oldest backend_xmin, for example
    pid  |        state        | backend_xmin | in_txn
  -------+---------------------+--------------+--------
   89220 | idle in transaction |         1054 | t
   89222 | active              |         1056 | t
The first VACUUM refuses to reclaim anything:
  INFO:  vacuuming "lab.public.mv_accounts"
  tuples: 0 removed, 3 remain, 2 are dead but not yet removable
  removable cutoff: 1054, which was 3 XIDs old when operation ended
The cutoff is exactly B's backend_xmin. After B commits, the same VACUUM succeeds:
  tuples: 2 removed, 1 remain, 0 are dead but not yet removable
  removable cutoff: 1057, which was 0 XIDs old when operation ended
  index scan needed: 1 pages from table (100.00% of total) had 2 dead item identifiers removed
and pgstattuple then reports live = 1, dead = 0. B never touched mv_accounts after its first
SELECT: merely holding a snapshot was enough.`,
      systemsLens: code`
Garbage collection in a multi-version system is bounded by min(observers), and that minimum is
taken across the whole cluster, including replicas with hot_standby_feedback and unconsumed
replication slots. So the cost of one slow consumer is paid globally, in bloat and in scan time, by
workloads that have nothing to do with it. Every distributed system with reader-visible history has
this coupling -- Kafka retention held by a stuck consumer group, an S3-backed table format pinned by
an old snapshot id, a Cassandra tombstone kept for gc_grace_seconds. The operational answer is the
same everywhere: bound how long any observer may hold the horizon, which in PostgreSQL means
idle_in_transaction_session_timeout, statement_timeout, and alerting on the age of the oldest xmin.`,
      caution: code`
On a busy system this is the single most common cause of runaway bloat. An "idle in transaction"
session that a connection pool forgot about will stop vacuum cluster-wide for as long as it lives.`,
      challenge: code`
Repeat with B in a plain read-committed transaction that has only run "begin;" and no query at all:
B publishes no backend_xmin and vacuum succeeds. The horizon is held by snapshots, not by open
transactions -- the xmin appears at B's first statement.`,
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
      syntaxBreakdown: code`
age(relfrozenxid) is the number of transactions between a relation's guaranteed-frozen point and the
current counter; age(datfrozenxid) is the same for a whole database and is what autovacuum's
wraparound protection watches. VACUUM (FREEZE) sets vacuum_freeze_min_age to 0 for the run, so every
visible tuple is frozen. Freezing does not rewrite t_xmin: it sets HEAP_XMIN_COMMITTED and
HEAP_XMIN_INVALID together in t_infomask (0x0100 | 0x0200 = 0x0300 = 768), a combination that is
otherwise impossible and means "frozen". Hence the test (t_infomask & 768) = 768. The DO block burns
xids by opening 2000 subtransactions that each write a row.`,
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
