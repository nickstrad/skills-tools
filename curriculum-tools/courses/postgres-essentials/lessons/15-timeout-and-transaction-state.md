# A deadline does not always end the transaction

slug: timeout-and-transaction-state
category: concurrency-control
difficulty: intermediate
tags: timeouts, transactions, sqlstate, connection-pools
prerequisites: deadlock-cycle
safety: locking
run-in: tool
sessions: 2
min-version: 16
minutes: 25
revision: 1

## Overview
Trigger a lock timeout and a statement timeout inside explicit transactions. Capture each error and the failed transaction state that follows, then roll back before reusing the connection. Verify that a tentative write made before a cancelled statement does not survive.

## Syntax breakdown
### In plain terms
A server timeout cancels a statement when its configured limit expires. Inside an explicit BEGIN,
that error also marks the transaction as failed; the connection remains inside that failed block
until ROLLBACK. Before running, predict whether an earlier successful UPDATE in the same transaction
can still commit after a later statement times out.

### Mechanism map

```text
Timeout cancels one statement inside BEGIN

BEGIN -> tentative work -> timed statement fails -> transaction is failed
                                                   |
                         next SQL gets 25P02 <-----+
                                                   |
The error aborts the work. ROLLBACK clears the failed block for connection reuse.
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
- lock_timeout limits time spent acquiring a database lock. Its SQLSTATE is 55P03.
- statement_timeout limits the whole statement. PostgreSQL cancels the statement with 57014.
- After either error inside BEGIN, ordinary SQL gets 25P02. ROLLBACK clears the failed transaction
  block; none of its tentative changes can commit.
- PostgreSQL has already aborted the transaction's database work and released its ordinary locks;
  25P02 describes the connection's failed transaction-block state until the client sends ROLLBACK.
- A database timeout is server evidence. A caller-only deadline or a missing COMMIT response does
  not prove PostgreSQL aborted; lesson 11's unknown-outcome protocol still applies.

### Piece by piece
- **SET LOCAL lock_timeout = '500ms'** (transaction-local configuration) applies only until this
  transaction ends. B's UPDATE waits for A's row and then fails with 55P03.
- **SET LOCAL statement_timeout = '3s'** gives the lock round a larger overall bound, ensuring the
  more specific lock timeout should fire first.
- **\echo ... :SQLSTATE** (psql command and variable) prints the immediately preceding command's
  status. The labelled expected sequence is 55P03, 25P02, 57014, 25P02.
- **\set VERBOSITY terse / default** (psql commands) stabilize expected error lines, then restore
  normal error detail before B is reused.
- **ROLLBACK** ends the failed block and makes the connection ready for a new transaction. The
  server already aborted its work at the error, including earlier successful uncommitted writes.
- **SET LOCAL statement_timeout = '500ms'** bounds only the second transaction and automatically
  reverts at ROLLBACK.
- **pg_sleep(2)** (server function) keeps one statement running long enough for the 500 ms timeout
  to cancel it. The sleep has no useful side effect; it is a controlled delay.
- **current_setting('transaction_isolation')** (information function) is harmless SQL used to
  prove the failed block rejects the next command with 25P02.
- **RESET lock_timeout / RESET statement_timeout** restore session defaults. SET LOCAL already
  expires with its transaction; RESET also clears the session-level guard installed in setup.
- **SET application_name** labels A and B in activity views for an observer. The label does not
  change timeout behavior. The optional variation's plain **SET statement_timeout** lasts for the
  session, so its explicit RESET is required.
- **DROP TABLE** removes the fixture after A no longer holds it and B has rolled back.

## Caution
55P03, 57014 and 25P02 are expected only at the labelled commands. Capture SQLSTATE immediately each time. Keep A's holder open only through B's lock-timeout round, then roll it back. Finish every failed transaction with ROLLBACK before cleanup or connection reuse.

## Setup
```sql
set application_name = 'pe_timeout_a';
set lock_timeout = '60s';
set statement_timeout = '90s';
drop table if exists pe_timeout_account;
create table pe_timeout_account (id int primary key, balance int not null);
insert into pe_timeout_account values (1, 100);
```

## Run
```sql
-- Session A: hold the row only for B's lock-timeout round.
begin;
update pe_timeout_account set balance = balance + 10 where id = 1;

-- Session B: use transaction-local bounds; the blocked UPDATE fails after about 500 ms.
set application_name = 'pe_timeout_b';
\set VERBOSITY terse
begin;
set local lock_timeout = '500ms';
set local statement_timeout = '3s';
update pe_timeout_account set balance = balance + 20 where id = 1;
\echo lock_update_sqlstate :SQLSTATE
select current_setting('transaction_isolation') as should_not_run;
\echo after_lock_timeout_sqlstate :SQLSTATE
rollback;

-- Session A: discard the held +10 and release the row.
rollback;

-- Session B: make a tentative write, then cancel a later statement by its runtime.
begin;
update pe_timeout_account set balance = balance + 30 where id = 1;
set local statement_timeout = '500ms';
select pg_sleep(2);
\echo sleep_sqlstate :SQLSTATE
select current_setting('transaction_isolation') as should_not_run;
\echo after_statement_timeout_sqlstate :SQLSTATE
rollback;

-- Session B: prove rollback cleared the failure and discarded the tentative +30.
select balance as final_balance from pe_timeout_account where id = 1;
\set VERBOSITY default
reset lock_timeout;
reset statement_timeout;
reset application_name;

-- Session A: restore settings and remove the fixture.
reset lock_timeout;
reset statement_timeout;
reset application_name;
drop table pe_timeout_account;
```

## Expected result
In B's first transaction, the UPDATE waits about 500 ms and reports a lock-timeout error.
lock_update_sqlstate = 55P03. The following SELECT is rejected with “current transaction is
aborted,” and after_lock_timeout_sqlstate = 25P02. ROLLBACK returns B to a usable idle connection.

In B's second transaction, the +30 UPDATE initially succeeds, but pg_sleep is cancelled after about
500 ms. sleep_sqlstate = 57014. The next SELECT again fails and
after_statement_timeout_sqlstate = 25P02. ROLLBACK discards the whole transaction, including its
earlier +30. The fresh final query succeeds with final_balance = 100 because A's +10 was also
rolled back. Timing is approximate; the SQLSTATE sequence is the stable evidence.

## Systems lens
A timeout is both a latency control and an error boundary. When it fires inside BEGIN, return a pooled connection only after ROLLBACK succeeds; discard the connection if rollback fails, or the next borrower may inherit unusable state. Server-side cancellation establishes that the statement failed and the transaction needs cleanup. A client deadline that stops waiting supplies less evidence, and silence around COMMIT can leave the outcome unknown. Choose timeouts with the operation's lock budget and total request budget in mind.

## Optional variation
Optional autocommit contrast, independent of the fixture. Run the labelled block in A:

```sql
-- Session A: autocommit timeout and immediate reuse.
set application_name = 'pe_timeout_a';
\set VERBOSITY terse
set statement_timeout = '500ms';
select pg_sleep(2);
\echo autocommit_sleep_sqlstate :SQLSTATE
select 1 as connection_reusable;
\echo autocommit_next_sqlstate :SQLSTATE
reset statement_timeout;
reset application_name;
\set VERBOSITY default
```

The sleep gets 57014, then connection_reusable = 1 and the next SQLSTATE is 00000. Without BEGIN, the failed statement was its own transaction. Autocommit avoids a lingering failed transaction block, but it does not make a timed-out multi-statement operation atomic.
