import { code, type Module } from "../../../src/types.ts";

const ACCOUNTS = code`
create table if not exists iso_accounts (
  id int primary key,
  owner text not null,
  balance int not null
);
truncate iso_accounts;
insert into iso_accounts (id, owner, balance) values (1, 'alice', 100), (2, 'bob', 100);`;

const ONCALL = code`
create table if not exists iso_oncall (
  doctor text primary key,
  on_call boolean not null
);
truncate iso_oncall;
insert into iso_oncall (doctor, on_call) values ('alice', true), ('bob', true), ('carol', false);`;

export const ISOLATION: Module = {
  category: "isolation",
  title: "Transactions and isolation anomalies",
  lessons: [
    {
      slug: "atomic-abort",
      tags: ["transactions", "isolation", "mvcc"],
      title: "Atomicity: what a ROLLBACK actually undoes",
      difficulty: "beginner",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 1,
      estimatedMinutes: 10,
      prerequisites: ["install-lab-extensions"],
      overview: code`
A transaction is the unit of all-or-nothing. Here you abort one by hand and one by error, and see
that PostgreSQL does not undo anything: the new row versions stay on the page and are simply
declared invisible because their creating transaction is marked aborted. You also meet the error
every application eventually logs: "current transaction is aborted, commands ignored until end of
transaction block".`,
      syntaxBreakdown: code`
BEGIN opens a transaction block; COMMIT and ROLLBACK end it. Any error inside a transaction block
puts it in the aborted state (psql shows this in the prompt as an exclamation mark) and every
further command fails until ROLLBACK. pgstattuple('rel') scans a relation and counts live and dead
tuples, which is how you see that an aborted UPDATE still wrote bytes.`,
      setup: ACCOUNTS,
      code: code`
-- 1. An explicit rollback of a two-row transfer.
begin;
update iso_accounts set balance = balance - 10 where id = 1;
update iso_accounts set balance = balance + 10 where id = 2;
select id, owner, balance from iso_accounts order by id;
rollback;
select id, owner, balance from iso_accounts order by id;

-- 2. An error aborts the transaction; the rest of the block is refused.
begin;
update iso_accounts set balance = balance - 10 where id = 1;
select 1 / 0;
select id, balance from iso_accounts order by id;
\echo :SQLSTATE
rollback;
select id, owner, balance from iso_accounts order by id;

-- 3. Rollback did not erase the work: the aborted row versions are still in the heap.
select tuple_count, dead_tuple_count from pgstattuple('iso_accounts');`,
      expectedResult: code`
Inside the first transaction the balances read 90 and 110; after ROLLBACK they are 100 and 100.
In the second block the divide raises "ERROR:  division by zero", and the next SELECT fails with
"ERROR:  current transaction is aborted, commands ignored until end of transaction block"; psql
prints SQLSTATE 25P02 for that state. After the final rollback both balances are still 100.
pgstattuple reports tuple_count = 2 and dead_tuple_count = 3: three row versions were written
by transactions that aborted, and nothing was rewound to remove them.`,
      systemsLens: code`
Abort is cheap here because PostgreSQL never applies changes in place to be undone later. It writes
new versions and records the transaction's fate in a commit log (pg_xact); readers consult that log
to decide visibility. That is the same trick as an append-only log with a commit record: rollback is
"never publish the commit record", not "replay an undo log". The cost is deferred, not avoided --
the garbage is real and vacuum has to collect it.`,
      challenge: code`
Predict and then check what an aborted transaction does to the transaction ID counter:
select txid_current(); rollback and run it again. Aborted transactions still consume XIDs, which is
why an application that opens and aborts transactions in a hot loop still ages the cluster.`,
    },
    {
      slug: "read-committed-sees-each-statement",
      tags: ["isolation", "read-committed", "snapshots"],
      title: "Read committed takes a new snapshot for every statement",
      difficulty: "beginner",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 12,
      prerequisites: ["atomic-abort"],
      overview: code`
PostgreSQL's default isolation level is READ COMMITTED, and its rule is per statement, not per
transaction: each statement sees everything committed before that statement started. Two identical
SELECTs in one transaction can therefore return different rows. Repeat the same race under
REPEATABLE READ and the second SELECT does not move.`,
      syntaxBreakdown: code`
BEGIN with no level uses default_transaction_isolation (read committed). BEGIN ISOLATION LEVEL
REPEATABLE READ takes one snapshot at the first statement of the transaction and keeps it.
current_setting('transaction_isolation') reports the level of the transaction you are in. Open two
psql sessions before you start: Session A and Session B.`,
      setup: ACCOUNTS,
      code: code`
-- Session A
begin;
select current_setting('transaction_isolation') as level;
select id, balance from iso_accounts where id = 1;

-- Session B
update iso_accounts set balance = balance + 500 where id = 1;

-- Session A
select id, balance from iso_accounts where id = 1;
\echo A is still in the same transaction and already sees the new value
commit;

-- Session A
begin isolation level repeatable read;
select current_setting('transaction_isolation') as level;
select id, balance from iso_accounts where id = 1;

-- Session B
update iso_accounts set balance = balance + 500 where id = 1;

-- Session A
select id, balance from iso_accounts where id = 1;
\echo A is frozen at its first snapshot
commit;
select id, balance from iso_accounts where id = 1;`,
      expectedResult: code`
First round: A reads 100, B commits +500, and A's second SELECT inside the very same transaction
reads 600. Read committed gives you no repeatable reads at all.
Second round: A reads 600 under repeatable read, B commits +500, and A's second SELECT still reads
600. Only after A commits does a fresh statement in A see 1100.`,
      systemsLens: code`
"Isolation level" is really "when do I take a snapshot". Read committed = per statement, repeatable
read = per transaction. This is the same choice a distributed system makes between reading at the
latest timestamp on every RPC and pinning one read timestamp for a whole request; pinning gives you
a consistent picture at the cost of reading stale data and of having to fail when reality moves
underneath you (the next lessons).`,
      challenge: code`
Under read committed, run "select id, balance from iso_accounts" twice inside one transaction while
B inserts a new row in between. Read committed lets rows appear (a phantom) as well as change.`,
    },
    {
      slug: "lost-update-under-read-committed",
      tags: ["isolation", "read-committed", "lost-update", "row-locks"],
      title: "Lose an update, then stop losing it three ways",
      difficulty: "intermediate",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 20,
      prerequisites: ["read-committed-sees-each-statement"],
      overview: code`
The classic bug: two sessions read a balance, both subtract 10 in application code, and one of the
decrements disappears. You will cause it, then fix it twice -- with an atomic read-modify-write in
SQL, and with SELECT ... FOR UPDATE -- and watch the second session block and recompute in both
fixes.`,
      syntaxBreakdown: code`
\gset stores a single-row result into psql variables, so ":balance" is the value the session read
(this stands in for a value your application read into a local variable). "set balance = balance -
10" computes in the server from the row it locks. SELECT ... FOR UPDATE takes a row lock now, so a
second session waits at the SELECT instead of at the UPDATE. Under read committed, a statement that
was blocked by a writer re-reads the newly committed version of the row before applying itself.`,
      setup: ACCOUNTS,
      code: code`
-- Session A
update iso_accounts set balance = 100 where id = 1;
begin;
select balance from iso_accounts where id = 1 \gset
\echo A read balance :balance

-- Session B
begin;
select balance from iso_accounts where id = 1 \gset
\echo B read balance :balance

-- Session A
update iso_accounts set balance = :balance - 10 where id = 1;
commit;

-- Session B
update iso_accounts set balance = :balance - 10 where id = 1;
commit;

-- Session A
select balance as after_naive from iso_accounts where id = 1;

-- Fix 1: let the server do the arithmetic on the row it locks.
-- Session A
update iso_accounts set balance = 100 where id = 1;
begin;
update iso_accounts set balance = balance - 10 where id = 1;

-- Session B (blocks until A commits)
begin;
update iso_accounts set balance = balance - 10 where id = 1;

-- Session A
commit;

-- Session B
commit;

-- Session A
select balance as after_atomic_update from iso_accounts where id = 1;

-- Fix 2: take the row lock at read time, so the read itself is serialized.
-- Session A
update iso_accounts set balance = 100 where id = 1;
begin;
select balance from iso_accounts where id = 1 for update \gset
\echo A locked and read :balance

-- Session B (blocks until A commits)
begin;
select balance from iso_accounts where id = 1 for update \gset

-- Session A
update iso_accounts set balance = :balance - 10 where id = 1;
commit;

-- Session B
\echo B woke up and read :balance
update iso_accounts set balance = :balance - 10 where id = 1;
commit;

-- Session A
select balance as after_for_update from iso_accounts where id = 1;`,
      expectedResult: code`
Naive read-modify-write: both sessions echo "read balance 100", both write 90, and after_naive is
90. Ten units vanished and no error was raised anywhere.
Fix 1: B's UPDATE waits on A's row lock, then re-reads the committed row and subtracts from 90, so
after_atomic_update is 80.
Fix 2: B's SELECT ... FOR UPDATE is the statement that waits; when A commits, B echoes "woke up and
read 90" and after_for_update is 80.`,
      systemsLens: code`
Read committed does not detect write-write races -- it only serializes the instant of the write. A
lost update is a compare-and-swap you never performed. The three shapes here are the three shapes
everywhere: do the mutation atomically in the store (a server-side increment, a CAS), take a lock
that covers read and write, or use an isolation level that aborts you (next lesson). Anything that
reads in one round trip and writes in another needs one of them.`,
      challenge: code`
Replace FOR UPDATE with FOR NO KEY UPDATE and then with FOR SHARE, and see which combinations of
two sessions block each other. Then try the optimistic version: keep a version column and write
"update ... where id = 1 and version = :version", checking that the UPDATE reports 0 rows.`,
    },
    {
      slug: "repeatable-read-blocks-then-fails",
      tags: ["isolation", "repeatable-read", "snapshots", "serialization-failure"],
      title: "Repeatable read blocks, then refuses: SQLSTATE 40001",
      difficulty: "intermediate",
      safetyLevel: "locking",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      prerequisites: ["lost-update-under-read-committed"],
      overview: code`
A repeatable-read transaction cannot silently re-read a row the way a read-committed one does: if
the row it wants to update changed after its snapshot, re-reading would break the snapshot. So the
server aborts the transaction instead. This is the error every retry loop is written for.`,
      syntaxBreakdown: code`
BEGIN ISOLATION LEVEL REPEATABLE READ pins the snapshot at the first statement. A writer that
touches a row already updated and committed by another transaction after that snapshot raises
serialization_failure, SQLSTATE 40001. psql exposes the last SQLSTATE as the :SQLSTATE variable.
Once that error fires the whole transaction is dead: only ROLLBACK is accepted.`,
      setup: ACCOUNTS,
      code: code`
-- Session A
begin isolation level repeatable read;
select balance from iso_accounts where id = 1;

-- Session B
begin;
update iso_accounts set balance = balance + 5 where id = 1;

-- Session A (blocks until B commits)
update iso_accounts set balance = balance - 10 where id = 1;

-- Session B
commit;

-- Session A
\echo A woke up with SQLSTATE :SQLSTATE
select balance from iso_accounts where id = 1;
rollback;
select balance from iso_accounts where id = 1;`,
      expectedResult: code`
A's UPDATE waits on B's uncommitted row lock. The moment B commits, A does not proceed: it prints
"ERROR:  could not serialize access due to concurrent update" and psql echoes SQLSTATE 40001. The
next SELECT in A fails with "ERROR:  current transaction is aborted, commands ignored until end of
transaction block". After ROLLBACK the balance is 105: only B's update survived.`,
      systemsLens: code`
Snapshot isolation trades blocking for aborting. A read-committed writer waits and then quietly
works on newer data; a repeatable-read writer waits and then refuses, because continuing would mean
its reads and its writes came from two different points in time. Optimistic concurrency control in
any distributed store makes the same bargain: no coordination on the read path, a possible abort at
commit, and the application owns the retry.`,
      challenge: code`
Rerun with B never committing but issuing ROLLBACK instead. A's UPDATE unblocks and succeeds: the
abort is raised only against a committed conflicting version, not against a lock you merely waited
on.`,
    },
    {
      slug: "write-skew",
      tags: ["isolation", "repeatable-read", "snapshot-isolation", "write-skew"],
      title: "Write skew: two transactions that are each correct and jointly wrong",
      difficulty: "advanced",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 15,
      prerequisites: ["repeatable-read-blocks-then-fails"],
      overview: code`
Snapshot isolation only detects conflicts on rows you wrote. If two transactions read the same set
of rows and each writes a different row of that set, nothing conflicts and both commit -- yet the
invariant they both checked is now false. The textbook case: at least two doctors must stay on
call, and both on-call doctors take themselves off at once.`,
      syntaxBreakdown: code`
The invariant lives in a query ("count of on_call rows >= 2"), not in a constraint, so the database
has no way to enforce it. Both sessions run BEGIN ISOLATION LEVEL REPEATABLE READ, read the count
from their own snapshot, and update different rows of iso_oncall.`,
      setup: ONCALL,
      code: code`
-- Session A
begin isolation level repeatable read;
select count(*) as on_call_now from iso_oncall where on_call;

-- Session B
begin isolation level repeatable read;
select count(*) as on_call_now from iso_oncall where on_call;

-- Session A
update iso_oncall set on_call = false where doctor = 'alice';

-- Session B
update iso_oncall set on_call = false where doctor = 'bob';

-- Session A
commit;

-- Session B
commit;

-- Session A
select doctor, on_call from iso_oncall order by doctor;
select count(*) as on_call_after from iso_oncall where on_call;`,
      expectedResult: code`
Both sessions read on_call_now = 2 and each concludes it is safe to go off call. Both UPDATEs touch
different rows, so neither blocks and neither raises 40001: both COMMITs succeed. The final table
shows alice = f, bob = f, carol = f and on_call_after = 0. The invariant is broken with no error
anywhere in the logs.`,
      systemsLens: code`
This is why "snapshot isolation" is not "serializable". No serial order of these two transactions
produces this state: whichever ran second would have read a count of 1. The anomaly is invisible to
write-conflict detection because the conflict is between one transaction's writes and the other's
reads. Any system that validates only overlapping writes -- most optimistic CAS schemes, most
document stores' transactions -- has exactly this hole, and the usual application-level fix is to
make the read set into a write (lock the whole set, or materialize the invariant in a row you all
update).`,
      challenge: code`
Reproduce the anomaly with the classic booking version: two sessions check "no overlapping booking
exists" and each inserts a booking. Then close the hole with SELECT ... FOR UPDATE on the rows the
invariant reads, and explain why that still fails for the insert-based version (there is no row to
lock yet -- you need a predicate, which is the next lesson).`,
    },
    {
      slug: "serializable-ssi",
      tags: ["isolation", "serializable", "predicate-locks", "serialization-failure"],
      title: "SERIALIZABLE: predicate locks, rw-dependencies, and a commit that fails",
      difficulty: "advanced",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 18,
      prerequisites: ["write-skew"],
      overview: code`
Run the exact same on-call race under SERIALIZABLE. PostgreSQL's SSI tracks what each transaction
read, as SIReadLock entries in pg_locks, and aborts one of the pair when the read/write
dependencies between them cannot correspond to any serial order. You will see the predicate locks
while the transactions are open, and the second COMMIT fail.`,
      syntaxBreakdown: code`
BEGIN ISOLATION LEVEL SERIALIZABLE adds serializable snapshot isolation on top of repeatable read.
SIReadLock rows in pg_locks are predicate locks: not blocking locks, just a record of what was read
(and at which granularity -- relation, page or tuple). The failure is raised at COMMIT with
SQLSTATE 40001 and the message "could not serialize access due to read/write dependencies among
transactions", plus a HINT to retry.`,
      setup: ONCALL,
      code: code`
-- Session A
begin isolation level serializable;
select count(*) as on_call_now from iso_oncall where on_call;
update iso_oncall set on_call = false where doctor = 'alice';

-- Session B
begin isolation level serializable;
select count(*) as on_call_now from iso_oncall where on_call;
update iso_oncall set on_call = false where doctor = 'bob';

-- Session A
select locktype, mode, relation::regclass::text as rel, page, tuple
from pg_locks where mode = 'SIReadLock' order by locktype, page, tuple;
commit;

-- Session B
commit;
\echo B commit returned SQLSTATE :SQLSTATE

-- Session A
select doctor, on_call from iso_oncall order by doctor;
select count(*) as on_call_after from iso_oncall where on_call;`,
      expectedResult: code`
While both transactions are open, pg_locks shows four SIReadLock rows, two per backend: a relation
level predicate lock on iso_oncall (the count scanned the whole tiny table) and a page level one on
iso_oncall_pkey. Predicate locks are records of what was read; they never block anyone.
A's COMMIT succeeds. B's COMMIT fails with
  ERROR:  could not serialize access due to read/write dependencies among transactions
  DETAIL:  Reason code: Canceled on identification as a pivot, during commit attempt.
  HINT:  The transaction might succeed if retried.
and psql echoes SQLSTATE 40001. B's update is gone: alice = f, bob = t, carol = f, and
on_call_after = 1. The invariant survives because one transaction was thrown away.`,
      systemsLens: code`
SSI keeps snapshot isolation's cheap reads (no shared locks, readers never block writers) and adds
a detector for the one structure that snapshot isolation gets wrong: a transaction that is a "pivot"
with an incoming and an outgoing read-write dependency. The cost is false positives and aborts that
appear only at commit time, under load, in production. That is the standard shape of optimistic
concurrency control everywhere -- and it means SERIALIZABLE is only correct if every caller retries,
which is the next lesson.`,
      caution: code`
Under SERIALIZABLE a transaction can fail at COMMIT even when every statement in it succeeded. Never
treat COMMIT as an operation that cannot fail.`,
      challenge: code`
Rerun with both sessions reading with "select count(*) from iso_oncall where on_call for share".
Note the difference: FOR SHARE turns the read into a blocking lock and prevents the anomaly by
waiting, while SSI prevents it by aborting. Compare the two under contention.`,
    },
    {
      slug: "retry-loop-and-idempotency",
      tags: ["isolation", "serialization-failure", "retries", "idempotency"],
      title: "Retry loops: why the retry must be a new transaction, and idempotent",
      difficulty: "advanced",
      safetyLevel: "writes-data",
      runIn: "tool",
      sessions: 2,
      estimatedMinutes: 18,
      prerequisites: ["serializable-ssi"],
      overview: code`
Serialization failures are normal operation, so the application must retry. This lesson shows the
two things people get wrong: retrying inside the same transaction (it can never succeed, because the
snapshot is what is stale), and counting or logging the retry inside the transaction that is about
to be rolled back. Then it shows the shape that works: a new transaction plus an idempotency key.`,
      syntaxBreakdown: code`
A PL/pgSQL BEGIN ... EXCEPTION block is a subtransaction: "when serialization_failure" catches
SQLSTATE 40001 and rolls back to the block's start, leaving the outer transaction usable. GET
STACKED DIAGNOSTICS / the sqlstate variable expose the code. INSERT ... ON CONFLICT DO NOTHING makes
a write idempotent under a natural key, and reports "INSERT 0 0" when it is a no-op.`,
      setup: code`
create table if not exists iso_accounts (
  id int primary key,
  owner text not null,
  balance int not null
);
truncate iso_accounts;
insert into iso_accounts (id, owner, balance) values (1, 'alice', 100), (2, 'bob', 100);
create table if not exists iso_retry_log (
  attempt_id bigserial primary key,
  attempts int not null,
  note text not null
);
truncate iso_retry_log;
create table if not exists iso_transfers (
  request_key text primary key,
  amount int not null
);
truncate iso_transfers;`,
      code: code`
-- Session A
begin isolation level repeatable read;
select balance from iso_accounts where id = 1;

-- Session B
update iso_accounts set balance = balance + 5 where id = 1;

-- Session A
do $$
declare
  attempts int := 0;
begin
  loop
    attempts := attempts + 1;
    begin
      update iso_accounts set balance = balance - 10 where id = 1;
      raise notice 'attempt % succeeded', attempts;
      exit;
    exception when serialization_failure then
      raise notice 'attempt % failed with sqlstate %', attempts, sqlstate;
      if attempts >= 3 then
        raise notice 'giving up inside the transaction after % attempts', attempts;
        exit;
      end if;
    end;
  end loop;
  insert into iso_retry_log (attempts, note) values (attempts, 'retried in place');
end $$;
select attempts, note from iso_retry_log;
rollback;

-- Session A
select balance from iso_accounts where id = 1;
select count(*) as retry_log_rows_after_rollback from iso_retry_log;

-- Session A
begin isolation level repeatable read;
update iso_accounts set balance = balance - 10 where id = 1;
insert into iso_retry_log (attempts, note) values (1, 'fresh transaction');
commit;
select balance as balance_after_retry from iso_accounts where id = 1;
select attempts, note from iso_retry_log;

-- Session A
insert into iso_transfers (request_key, amount) values ('req-42', 10) on conflict do nothing;
insert into iso_transfers (request_key, amount) values ('req-42', 10) on conflict do nothing;
select request_key, amount from iso_transfers;`,
      expectedResult: code`
The DO block prints three NOTICEs: "attempt 1 failed with sqlstate 40001", the same for attempt 2,
then "attempt 3 failed ..." and "giving up inside the transaction after 3 attempts". Retrying under
the same snapshot is hopeless -- the snapshot is exactly what is stale. The in-transaction
iso_retry_log row is visible before the ROLLBACK and gone after it:
retry_log_rows_after_rollback = 0, and the balance is 105 (only B's +5 landed).
The retry as a fresh transaction succeeds: balance_after_retry = 95, and iso_retry_log holds one
row, (1, 'fresh transaction').
The two identical INSERTs report "INSERT 0 1" then "INSERT 0 0", and iso_transfers has one row: the
retry did not transfer twice.`,
      systemsLens: code`
A retry is only safe if the operation is idempotent and if the retry re-reads the world. Both halves
matter: a fresh snapshot without idempotency double-applies, and idempotency without a fresh
snapshot loops forever. This is exactly the at-least-once delivery problem -- the database's 40001
is the network's timeout, and the request key is the deduplication key. Note also that anything you
want to survive the failure (attempt counters, metrics, audit rows) must live outside the
transaction being retried, or it rolls back with it.`,
      caution: code`
Bound the retries and back off. An unbounded retry loop against a hot row turns a serialization
failure into a livelock that burns CPU on every attempt.`,
      challenge: code`
Make the retry loop honest: run the whole DO block, including its own BEGIN, from the client so each
attempt is a new transaction, and count attempts in a table written by an autonomous connection
(dblink) so the counter survives the rollback.`,
    },
  ],
};
