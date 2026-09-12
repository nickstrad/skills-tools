# Transaction ids are allocated lazily from one global counter

slug: xids-and-the-transaction-counter
category: mvcc
difficulty: beginner
tags: 
prerequisites: install-lab-extensions
safety: writes-data
run-in: tool
sessions: 2
min-version: 16
minutes: 12
revision: 2

## Overview
Every row version in PostgreSQL is stamped with the transaction id (xid) that created it and the
xid that deleted it, so the first thing to understand is where xids come from. They come from a
single cluster-wide counter, and they are handed out lazily: a transaction that only reads never
takes one. You will watch a transaction stay xid-less through several reads, take an xid at its
first write, and see a second session take the very next number from the same counter.

## Syntax breakdown
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
- **pg_stat_activity** (backend activity view, in the variation)
  - What it is: It lists sessions and their current transaction metadata.
  - What it does here: **backend_xid** shows a real xid, while **backend_xmin** shows the oldest xid the
    session's snapshot may still need; **pid <> pg_backend_pid()** excludes this session.
  - What it gives us: The idle reader's actual xid and horizon. Under the default READ COMMITTED,
    both are empty after this statement; an open transaction alone does not retain its snapshot.
- **SELECT 1** (constant read, in the variation)
  - What it is: A query that returns one constant and touches no user table.
  - What it does here: It runs a read without allocating a real xid.
  - What it gives us: A contrast between transaction lifetime and statement-snapshot lifetime.

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
select pg_current_xact_id() as forced_xid;
```

## Expected result
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
is what matters.

## Systems lens
Two ideas that recur in every distributed store. First, identity is allocated lazily because it is
expensive: an xid costs a slot in a shared array, a commit-log entry, and a claim on the wraparound
budget, so pure readers must not pay it. Second, the allocator is a single global counter, which
makes it a serialization point and a hard scalability limit -- exactly why systems that need to
scale writes move to per-node ids plus a partial order (Lamport clocks, HLCs) instead of one
totally ordered counter.

## Optional variation
Open a third session, run "begin; select 1;" and leave it idle briefly. From another session, check
select backend_xid, backend_xmin from pg_stat_activity where pid <> pg_backend_pid(). Under the
default READ COMMITTED, this reader has no backend_xid and its statement snapshot has been released,
so backend_xmin is empty too. An open transaction and a retained snapshot are different states;
lesson15 demonstrates a retained repeatable-read horizon. Finish with ROLLBACK in the third session.
