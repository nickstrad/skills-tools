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
      reading:
        code`PostgreSQL 14 Internals, Chapter 3 "Pages and Tuples" (sections "Operations on Tuples", "Subtransactions")`,
      readingNotes: code`
Chapter 3 explains how INSERT and UPDATE create row versions and how commit or abort marks those
versions visible or invisible. This lesson makes that mechanism observable with pgstattuple and
also shows the client-facing aborted-transaction error; read the chapter before or after the
experiment to connect the error to tuple-level state.`,
      syntaxBreakdown: code`
### In plain terms

This experiment asks whether rollback erases work or merely makes it invisible. You perform a
transfer, undo it, then trigger an error and observe that the transaction stays unusable until it
is rolled back. A tuple is PostgreSQL's stored row version, and the dead-tuple count shows that an
aborted update left physical versions for cleanup even though readers cannot see them.

### What you are learning

- **Atomic transactions** mean all statements commit together or none become visible.
- **Aborted transactions** remain failed after an error; a rollback is required before another command.
- **MVCC row versions** let PostgreSQL hide aborted or superseded versions instead of rewriting history.

### Piece by piece

- **BEGIN** (SQL transaction command)
  - What it is: Starts a transaction block, grouping later writes into one atomic unit.
  - What it does here: Opens the transfer and the error demonstration.
  - What it gives us: Statements before COMMIT or ROLLBACK are provisional.
- **UPDATE ... SET ... WHERE** (SQL data-change statement)
  - What it is: Changes matching rows; PostgreSQL writes new row versions rather than editing old bytes in place.
  - What it does here: Moves 10 between accounts, then creates an update that will be aborted.
  - What it gives us: Balances 90 and 110 inside the first transaction, and dead versions later.
- **SELECT ... ORDER BY id** (SQL query with ordering)
  - What it is: Reads rows and sorts them by numeric id so the accounts are easy to compare.
  - What it does here: Compares provisional balances with restored balances.
  - What it gives us: 90/110 before rollback and 100/100 afterward.
- **ROLLBACK** (SQL transaction command)
  - What it is: Ends the current transaction without publishing its changes.
  - What it does here: Removes the transfer's visibility and clears the failed state.
  - What it gives us: Original balances, not proof that physical row versions were erased.
- **SELECT 1 / 0** (SQL expression that raises an error)
  - What it is: Integer division by zero, deliberately invalid.
  - What it does here: Aborts the open transaction.
  - What it gives us: The division-by-zero error that starts the failed state.
- **\echo :SQLSTATE** (psql command and variable)
  - What it is: psql prints a client variable; SQLSTATE stores the last server error code.
  - What it does here: Prints the code for the aborted-transaction state.
  - What it gives us: 25P02, identifying the failed transaction block.
- **pgstattuple('iso_accounts')** (extension function)
  - What it is: A pgstattuple function that scans a relation and counts tuple states.
  - What it does here: Measures the heap after rollback.
  - What it gives us: tuple_count and dead_tuple_count, showing aborted versions occupy space.
`,
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
      reading:
        code`PostgreSQL 14 Internals, Chapter 2 "Isolation" (sections "Read Committed", "Repeatable Read")`,
      readingNotes: code`
Chapter 2 describes Read Committed snapshots per statement and Repeatable Read snapshots per
transaction. The two-session race below is the live version of those rules; the experiment adds
psql output and a direct comparison of values, so run it after reading the chapter or use it first
as a concrete preview.`,
      syntaxBreakdown: code`
### In plain terms

This experiment asks when a transaction decides what committed data it may see. Read Committed
takes a fresh snapshot for each statement, while Repeatable Read keeps the first visibility picture
for the whole transaction. Two psql sessions let one commit a change between the other session's
two SELECT statements.

### What you are learning

- **Read Committed** gives each statement its own view and can reveal a committed change mid-transaction.
- **Repeatable Read** pins one view for a transaction, so later statements can intentionally be stale.
- **Snapshots** are visibility rules, not copies of every row; a new transaction gets a new snapshot.

### Piece by piece

- **BEGIN** (SQL transaction command): Starts a transaction using the configured default isolation level.
  - What it does here: Starts Session A's Read Committed comparison.
  - What it gives us: Each later statement may use a new snapshot.
- **default_transaction_isolation** (server/session setting): Supplies an isolation level when BEGIN names none.
  - What it does here: Selects PostgreSQL's default, Read Committed.
  - What it gives us: A's second SELECT sees B's committed +500.
- **current_setting('transaction_isolation')** (SQL configuration function): Returns a named setting as text.
  - What it does here: Reports the active level in each transaction.
  - What it gives us: read committed, then repeatable read.
- **BEGIN ISOLATION LEVEL REPEATABLE READ** (SQL transaction command): Starts a transaction with a stable snapshot.
  - What it does here: Runs the second race under a fixed visibility picture.
  - What it gives us: A remains at 600 while B commits another +500.
- **UPDATE ... SET balance = balance + 500** (SQL data change): Creates B's newer row version using server-side arithmetic.
  - What it does here: Commits a change between A's reads.
  - What it gives us: 600 in the first round and 1100 after the second transaction ends.
- **COMMIT** (SQL transaction command): Publishes changes and ends the transaction snapshot.
  - What it does here: Lets B's update become visible and gives A a fresh snapshot.
  - What it gives us: The boundary after which A sees 1100.
- **Session A / Session B** (independent psql connections): Separate backends with separate snapshots.
  - What it does here: Coordinates a controlled reader/writer interleaving.
  - What it gives us: A can observe B's commit between statements.
`,
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
      reading:
        code`PostgreSQL 14 Internals, Chapter 2 "Isolation" (sections "Isolation Levels and Anomalies in SQL Standard", "Read Committed"); Chapter 13 "Row-Level Locks" (section "Row-Level Locking Modes")`,
      readingNotes: code`
Chapter 2 names lost updates as an isolation anomaly, while Chapter 13 explains the row-lock modes
used by FOR UPDATE. This lesson puts both ideas in one sequence: first an application-level race,
then server-side arithmetic and an explicit row lock. Read the chapters before the experiment if
you want the lock terminology; otherwise use the output to make the anomaly concrete.`,
      syntaxBreakdown: code`
### In plain terms

This experiment reproduces a lost update: two workers read 100, both calculate 90 outside the
database, and the second write silently overwrites the first. Then it compares two repairs that keep
the calculation next to the row or lock the row before reading it. A row lock means conflicting
writers must wait for the current transaction to finish.

### What you are learning

- **Read-modify-write races** lose updates when a value is read and written in separate steps.
- **Atomic server-side updates** calculate from the row version protected by the UPDATE.
- **FOR UPDATE** locks the row during the read, forcing a competing worker to wait and reread.

### Piece by piece

- **\gset** (psql command): Stores columns from a one-row query result as psql variables.
  - What it does here: Saves the selected balance as :balance, simulating an application variable.
  - What it gives us: Both naive sessions echo 100; a lock-aware read later echoes the current value.
- **\echo :balance** (psql command): Prints text after psql substitutes the variable value.
  - What it does here: Makes each session's read visible before it writes.
  - What it gives us: Evidence that both naive sessions started from 100.
- **UPDATE ... SET balance = :balance - 10** (SQL data change): Writes arithmetic based on a client value.
  - What it does here: Deliberately creates the lost-update bug.
  - What it gives us: after_naive = 90 instead of 80.
- **UPDATE ... SET balance = balance - 10** (server-side data change): Computes from the row while taking its update lock.
  - What it does here: Makes B wait, then apply its decrement to A's committed 90.
  - What it gives us: after_atomic_update = 80.
- **SELECT ... FOR UPDATE** (SQL locking clause): Reads matching rows and takes a lock suitable for a later update.
  - What it does here: Causes B's SELECT to block until A commits.
  - What it gives us: B wakes and reads 90, proving the read was serialized.
- **COMMIT** (SQL transaction command): Publishes changes and releases transaction-held row locks.
  - What it does here: Wakes the waiting UPDATE or SELECT in Session B.
  - What it gives us: A deterministic handoff between workers.
- **FOR NO KEY UPDATE / FOR SHARE** (alternative row-lock clauses in the challenge): Use weaker modes with different conflicts.
  - What it does here: Lets you test which reader/writer combinations can coexist.
  - What it gives us: A direct observation of the lock compatibility rules.
`,
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
      tags: [
        "isolation",
        "repeatable-read",
        "snapshots",
        "serialization-failure",
      ],
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
### In plain terms

This experiment asks what happens when a transaction tries to update a row after another transaction
has committed a newer version. Repeatable Read refuses to mix the old snapshot with the new row, so
the waiting writer fails instead of quietly changing its result. SQLSTATE 40001 identifies this
retryable serialization failure.

### What you are learning

- **Snapshot pinning** keeps all statements in one transaction consistent with one visibility point.
- **Serialization failure** deliberately aborts work that cannot fit the pinned snapshot.
- **Transaction cleanup** is mandatory: after an error, only ROLLBACK makes the connection usable.

### Piece by piece

- **BEGIN ISOLATION LEVEL REPEATABLE READ** (SQL transaction command): Starts a transaction with one stable snapshot after its first statement.
  - What it does here: Makes A retain a view from before B's update.
  - What it gives us: A's UPDATE must confront B's committed newer version.
- **SELECT balance ...** (SQL query): Reads the row and establishes A's snapshot.
  - What it does here: Records balance 100 before B changes it.
  - What it gives us: The baseline for detecting the later conflict.
- **UPDATE ... SET balance = balance + 5** (SQL data change): B creates and commits a newer row version.
  - What it does here: Holds the row lock until B commits.
  - What it gives us: A waits, then encounters a committed concurrent update.
- **\echo A woke up with SQLSTATE :SQLSTATE** (psql command): Prints the last server error code.
  - What it does here: Displays A's result after the wait.
  - What it gives us: 40001, distinguishing this from an ordinary SQL error.
- **ROLLBACK** (SQL transaction command): Ends the failed transaction and discards pending work.
  - What it does here: Clears A's aborted state so it can read again.
  - What it gives us: Balance 105, showing only B committed.
`,
      reading: code`PostgreSQL 14 Internals, Chapter 2 "Isolation" (section "Repeatable Read")`,
      readingNotes: code`
Chapter 2 explains that Repeatable Read protects a transaction's snapshot and raises a serialization
failure when a concurrent committed update would invalidate it. This lesson stages the wait and
shows SQLSTATE 40001 plus the failed-transaction state; run it after the chapter to connect the
visible error to snapshot rules.`,
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
      tags: [
        "isolation",
        "repeatable-read",
        "snapshot-isolation",
        "write-skew",
      ],
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
### In plain terms

This experiment asks whether two individually sensible decisions can break a shared rule. Each
doctor sees two people on call and turns off a different row; both commits succeed because their
writes do not overlap. An invariant is a condition that should always hold, here “at least two rows
have on_call = true.”

### What you are learning

- **Write skew** happens when transactions update different rows after reading a shared condition.
- **Repeatable Read** protects each snapshot but does not enforce arbitrary multi-row predicates.
- **Stronger locking or materialized constraints** are needed for rules spanning several rows.

### Piece by piece

- **BEGIN ISOLATION LEVEL REPEATABLE READ** (SQL transaction command): Starts each session with a stable snapshot.
  - What it does here: Lets A and B inspect the same initial roster.
  - What it gives us: Both sessions read on_call_now = 2.
- **SELECT count(*) ... WHERE on_call** (SQL aggregate with a filter): Counts rows whose boolean on_call value is true.
  - What it does here: Checks the invariant before either write.
  - What it gives us: The unsafe but apparently valid decision that one doctor may leave.
- **UPDATE iso_oncall SET on_call = false WHERE doctor = ...** (SQL row update): Changes one named doctor's status.
  - What it does here: A updates alice and B updates bob, with disjoint write sets.
  - What it gives us: No blocking and no 40001 under Repeatable Read.
- **COMMIT** (SQL transaction command): Publishes a transaction's changes and ends its snapshot.
  - What it does here: Allows both incompatible decisions to become visible.
  - What it gives us: alice = f, bob = f, carol = f, and on_call_after = 0.
- **ORDER BY doctor** (SQL ordering clause): Sorts the roster by doctor name.
  - What it does here: Makes each final row easy to inspect.
  - What it gives us: Stable evidence of which rows changed.
`,
      reading: code`PostgreSQL 14 Internals, Chapter 2 "Isolation" (section "Repeatable Read")`,
      readingNotes: code`
Chapter 2 explains Repeatable Read's snapshot isolation and why it detects write/write conflicts but
not every read/write dependency. This lesson turns that limitation into the on-call invariant and
then points toward predicate locking; read it after the chapter so the broken invariant has a clear
snapshot-isolation explanation.`,
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
      tags: [
        "isolation",
        "serializable",
        "predicate-locks",
        "serialization-failure",
      ],
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
### In plain terms

This repeats write skew with PostgreSQL's strongest transaction isolation. A predicate is a
condition such as “rows where on_call is true”; SERIALIZABLE remembers that A and B read it, then
aborts one when their writes cannot fit any serial order. The predicate record is not a blocking
lock, so the conflict appears as a commit-time error.

### What you are learning

- **Serializable Snapshot Isolation (SSI)** detects dangerous read/write dependency cycles.
- **SIReadLock** entries describe what a transaction read at relation, page, or tuple granularity.
- **COMMIT can fail**, so it belongs inside the retryable operation.

### Piece by piece

- **BEGIN ISOLATION LEVEL SERIALIZABLE** (SQL transaction command): Requests serializable results while retaining nonblocking reads.
  - What it does here: Runs both on-call decisions under SSI tracking.
  - What it gives us: One transaction can be canceled as a pivot at commit.
- **SELECT count(*) ... WHERE on_call** (SQL aggregate and predicate): Reads the true on-call set.
  - What it does here: Creates the read dependency SSI remembers.
  - What it gives us: on_call_now = 2 and predicate locks.
- **UPDATE ... WHERE doctor = ...** (SQL row update): Writes one different row in each session.
  - What it does here: Creates opposing read/write dependencies without row blocking.
  - What it gives us: The dangerous structure SSI must resolve.
- **pg_locks** (system view): Lists held and requested locks and lock-like entries.
  - What it does here: Exposes SSI's predicate-read records.
  - What it gives us: locktype, relation, page, and tuple, revealing tracking granularity.
- **mode = 'SIReadLock'** (pg_locks filter): Selects predicate records, not ordinary blocking locks.
  - What it does here: Limits the observation to dependencies from the count query.
  - What it gives us: Relation/page records for each backend on the tiny table.
- **COMMIT** (SQL transaction command): Attempts to publish changes and complete SSI validation.
  - What it does here: A succeeds; B is canceled as a pivot.
  - What it gives us: SQLSTATE 40001 and the read/write-dependencies error.
- **\echo B commit returned SQLSTATE :SQLSTATE** (psql command): Prints the code after COMMIT fails.
  - What it does here: Makes the commit-time failure explicit.
  - What it gives us: 40001, the signal to retry the whole transaction.
`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 2 "Isolation" (section "Serializable"); Chapter 14 "Miscellaneous Locks" (section "Predicate Locks")`,
      readingNotes: code`
Chapter 2 introduces Serializable Snapshot Isolation and its serialization failures; Chapter 14
describes predicate locks as records of read ranges rather than ordinary blocking locks. This lesson
shows SIReadLock rows while the on-call race is open and the failure at COMMIT. Read both chapters
before running it, then use the output to distinguish a predicate lock from a waiting row lock.`,
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
### In plain terms

This experiment shows why retrying a failed statement inside its old transaction cannot refresh the
stale snapshot. A PL/pgSQL exception block can catch the error, but it is only a subtransaction and
does not replace the outer transaction's snapshot. The working pattern is a new transaction plus an
idempotency key, a value that lets a repeated request be recognized and applied once.

### What you are learning

- **Subtransactions** can roll back one block, but do not replace the outer snapshot.
- **Fresh-transaction retries** reread current data and repeat the whole business operation.
- **Idempotency keys** make at-least-once retries safe by turning duplicate writes into no-ops.

### Piece by piece

- **DO $$ ... $$** (PL/pgSQL anonymous block): Executes procedural code without creating a permanent function.
  - What it does here: Loops through deliberately failed in-place attempts.
  - What it gives us: NOTICE output and a rollback boundary around the exception block.
- **DECLARE attempts int := 0** (PL/pgSQL variable): Creates a local counter initialized to zero.
  - What it does here: Increments once per attempted update.
  - What it gives us: The count later written to the retry log.
- **LOOP / attempts := attempts + 1 / EXIT** (PL/pgSQL control flow): Repeats until EXIT leaves the loop.
  - What it does here: Tries up to three updates against the stale snapshot.
  - What it gives us: Three failed attempts rather than a refreshed transaction.
- **EXCEPTION WHEN serialization_failure** (PL/pgSQL handler): Catches SQLSTATE 40001 from a snapshot conflict.
  - What it does here: Rolls back the inner block and prints a notice while the outer snapshot remains stale.
  - What it gives us: Failure notices containing attempt number and SQLSTATE 40001.
- **RAISE NOTICE** (PL/pgSQL diagnostic): Sends informational text to the client.
  - What it does here: Reports success, failure, and the give-up decision.
  - What it gives us: Three failure notices and a final “giving up” notice.
- **insert into iso_retry_log** (SQL insert): Adds an audit row with attempts and a note.
  - What it does here: Demonstrates that in-transaction observability also rolls back.
  - What it gives us: A row before outer ROLLBACK and zero rows afterward.
- **BEGIN ISOLATION LEVEL REPEATABLE READ / COMMIT** (SQL transaction commands): Start a fresh snapshot and publish its successful update.
  - What it does here: Performs the valid retry outside the stale transaction.
  - What it gives us: balance_after_retry = 95 and one durable log row.
- **INSERT ... ON CONFLICT DO NOTHING** (SQL conflict clause): Suppresses a duplicate-key conflict without changing the existing row.
  - What it does here: Repeats request key req-42 safely.
  - What it gives us: INSERT 0 1, then INSERT 0 0, with one transfer row.
- **request_key text primary key** (table constraint): Provides a unique, non-null deduplication identity.
  - What it does here: Detects the repeated request.
  - What it gives us: The second identical request becomes a no-op.
`,
      reading:
        code`PostgreSQL 14 Internals, Chapter 2 "Isolation" (sections "Serializable", "Which Isolation Level to Use?")`,
      readingNotes: code`
Chapter 2 says serializable transactions may fail and must be retried, but it does not prescribe a
client loop or idempotency keys. This lesson extends that guidance with a PL/pgSQL demonstration of
the wrong retry scope and an ON CONFLICT deduplication key. Read the chapter first for the failure
contract, then run this lesson for the application design consequences.`,
      revision: 3,
      studyCheckpoint: {
        core: [
          {
            source: "PostgreSQL 14 Internals",
            locator: `Chapter 2 §2.3 "Isolation Levels in PostgreSQL" (printed pp. 44–60)`,
          },
        ],
        rationale: code`
You observed statement snapshots, lost updates, snapshot-isolation anomalies, SSI, and serialization
retries in lessons 24–30. Read this section to consolidate the isolation behavior and the reason an
application must retry in a new transaction. Skip from the PG14 text: exact timing, default-setting
values, and example output; resume with lesson 31 when you finish.
`,
      },
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
