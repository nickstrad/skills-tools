# Two valid decisions can break one shared rule

slug: multi-row-write-skew
category: concurrency-control
difficulty: intermediate
tags: isolation, repeatable-read, concurrency-control
prerequisites: reject-stale-edit
safety: ddl
run-in: tool
sessions: 2
min-version: 16
minutes: 25
revision: 1

## Overview
Put Alice and Bob on call under the rule that at least one doctor must remain. Two Repeatable Read transactions each see two available doctors and each remove a different doctor. The writes do not touch the same row, yet their combined result violates the rule.

## Syntax breakdown
### In plain terms
Alice and Bob may each leave on-call duty only when more than one doctor is currently on call. Repeatable Read
keeps each transaction's view stable, but it does not combine separate rows into one lock. Observe
the final count when both doctors decide from snapshots that contain both rows.

This failure is called write skew: concurrent transactions read overlapping facts, make decisions
that are separately valid, and write different rows. PostgreSQL therefore sees no same-row update
conflict at Repeatable Read, even though the decisions together break an application invariant.

### Mechanism map

```text
Repeatable Read: overlapping decisions

A: BEGIN -- read count 2 -- update Alice off -----------------> COMMIT
B: BEGIN -- read count 2 ----------- update Bob off ----------> COMMIT
                                      different rows             final count 0

Serial order: finish A before B starts

A: read count 2 -- update Alice off -- COMMIT
B:                                      read count 1 -- decline -- COMMIT

Each overlapping decision is valid for its own snapshot, but the pair breaks the shared rule.
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
- A stable snapshot keeps a transaction's reads consistent with each other; it does not guarantee
  that every multi-row rule remains true after concurrent commits.
- Write skew needs no lost update. Both updates survive because Alice and Bob are different rows.
- A serial schedule changes the second decision: after A commits, B reads one doctor and declines.

### Piece by piece
- **DROP TABLE IF EXISTS / CREATE TABLE / INSERT** recreate pe_on_call_rr with exactly two doctors,
  both initially on call. The primary key makes each doctor's row distinct.
- **SET default_transaction_isolation = 'repeatable read'** makes later BEGIN commands use
  PostgreSQL's Repeatable Read level. Each transaction keeps the snapshot established by its first
  query until it ends.
- **BEGIN / COMMIT** delimit each doctor's whole read, decision, and possible write. COMMIT makes
  that transaction's change visible to fresh snapshots.
- **SELECT count(*) FILTER (WHERE on_call)** counts the rows that currently satisfy on_call in the
  transaction's snapshot. **count(*) > 1 AS ..._can_leave** turns the rule into a labelled boolean.
  **\gset** stores both columns as psql variables with the supplied prefix for the following \if.
- **\if :a_can_leave / \if :b_can_leave / \endif** are psql client conditionals. PostgreSQL
  returned t, so each
  supplied branch executes its UPDATE. This makes the decision-to-write link explicit rather than
  asking you to type an unconditional update.
- **\echo** prints labelled psql variables. **:ROW_COUNT** is the number of rows affected by the
  immediately preceding UPDATE, while **:SQLSTATE** is the five-character outcome code of the
  immediately preceding COMMIT. Reading either later could report a different command's outcome.
- **UPDATE ... WHERE doctor = ...** changes only that doctor's row. The two transactions acquire
  row locks on different rows, so neither update waits for the other.
- **RESET default_transaction_isolation** restores each psql session's configured default after
  its transaction ends. The final SELECT observes both rows and the broken count; DROP TABLE removes
  the lesson fixture.

## Caution
Follow the terminal order exactly: both reads, both updates, A COMMIT, then B COMMIT. If a command is run out of order, ROLLBACK both sessions, rerun setup in A, and restart the experiment.

## Setup
```sql
set default_transaction_isolation = 'repeatable read';
drop table if exists pe_on_call_rr;
create table pe_on_call_rr (
  doctor text primary key,
  on_call boolean not null
);
insert into pe_on_call_rr values ('Alice', true), ('Bob', true);
```

## Run
```sql
-- Session A: begin and decide from a snapshot containing both doctors.
begin;
select count(*) filter (where on_call) as count,
       count(*) filter (where on_call) > 1 as can_leave
from pe_on_call_rr
\gset a_
\echo A read :a_count doctors; can Alice leave? :a_can_leave

-- Session B: establish its snapshot before either doctor changes a row.
set default_transaction_isolation = 'repeatable read';
begin;
select count(*) filter (where on_call) as count,
       count(*) filter (where on_call) > 1 as can_leave
from pe_on_call_rr
\gset b_
\echo B read :b_count doctors; can Bob leave? :b_can_leave

-- Session A: carry out A's decision, but do not commit yet.
\if :a_can_leave
update pe_on_call_rr set on_call = false where doctor = 'Alice';
\echo A UPDATE ROW_COUNT :ROW_COUNT
\endif

-- Session B: carry out B's decision on the different row before A commits.
\if :b_can_leave
update pe_on_call_rr set on_call = false where doctor = 'Bob';
\echo B UPDATE ROW_COUNT :ROW_COUNT
\endif

-- Session A: publish Alice's change first.
commit;
\echo A COMMIT SQLSTATE :SQLSTATE

-- Session B: Repeatable Read permits this disjoint write to commit too.
commit;
\echo B COMMIT SQLSTATE :SQLSTATE
reset default_transaction_isolation;

-- Session A: observe both surviving writes and the broken rule, then clean up.
select doctor, on_call from pe_on_call_rr order by doctor;
select count(*) filter (where on_call) as rr_final_on_call from pe_on_call_rr;
reset default_transaction_isolation;
drop table pe_on_call_rr;
```

## Expected result
The labelled echoes say “A read 2 doctors; can Alice leave? t” and “B read 2 doctors; can Bob
leave? t”. Each conditional UPDATE reports UPDATE 1. A's COMMIT and B's COMMIT both succeed.

The labelled UPDATE row counts are 1, and both labelled COMMIT SQLSTATE values are 00000. The final
rows show Alice = f and Bob = f, and rr_final_on_call = 0. Both writes survived and no
transaction updated a row touched by the other transaction. The failed evidence is the shared rule,
not a lost write or a same-row conflict. The table is dropped after the observation.

## Systems lens
Snapshot isolation can preserve each transaction's coherent view while allowing write skew across disjoint records. The invariant's scope matters more than the number of successful statements: if correctness depends on a set of rows, checking one snapshot and locking only the changed row may be insufficient. Similar failures appear in booking limits, approval quorums, and resource-allocation rules.

## Optional variation
Run the serial schedule and compare B's decision. Run this complete block in Session A:

    -- Session A
    set default_transaction_isolation = 'repeatable read';
    drop table if exists pe_on_call_rr;
    create table pe_on_call_rr (doctor text primary key, on_call boolean not null);
    insert into pe_on_call_rr values ('Alice', true), ('Bob', true);
    begin;
    select count(*) filter (where on_call) as count,
           count(*) filter (where on_call) > 1 as can_leave
    from pe_on_call_rr
    \gset a_serial_
    \echo A read :a_serial_count doctors; can Alice leave? :a_serial_can_leave
    \if :a_serial_can_leave
    update pe_on_call_rr set on_call = false where doctor = 'Alice';
    \endif
    commit;

Only after A finishes, run this complete transaction in Session B:

    -- Session B
    set default_transaction_isolation = 'repeatable read';
    begin;
    select count(*) filter (where on_call) as count,
           count(*) filter (where on_call) > 1 as can_leave
    from pe_on_call_rr
    \gset b_serial_
    \echo B read :b_serial_count doctors; can Bob leave? :b_serial_can_leave
    \if :b_serial_can_leave
    update pe_on_call_rr set on_call = false where doctor = 'Bob';
    \endif
    commit;
    select count(*) filter (where on_call) as rr_serial_final_on_call from pe_on_call_rr;
    reset default_transaction_isolation;

    -- Session A: clean up after B has observed the result.
    reset default_transaction_isolation;
    drop table pe_on_call_rr;

B should read 1, print f and decline, leaving rr_serial_final_on_call = 1. The final Session A
commands restore its default and drop the fixture.
