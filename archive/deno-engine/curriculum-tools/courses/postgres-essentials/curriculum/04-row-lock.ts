import { code, type Module } from "../../../src/types.ts";

export const ROW_LOCK: Module = {
  category: "concurrency-control",
  title: "Serialize decisions on one row",
  lessons: [
    {
      slug: "row-lock-protects-decision",
      title: "Protect a read-modify-write decision with a row lock",
      difficulty: "intermediate",
      tags: ["isolation", "row-locks", "concurrency-control"],
      prerequisites: ["lost-update-and-atomic-write"],
      estimatedMinutes: 25,
      sessions: 2,
      safetyLevel: "locking",
      runIn: "tool",
      overview:
        "Let two callers decide whether the last unit of stock can be reserved. First, both decide from ordinary reads and preserve both arithmetic changes, yet still accept one reservation too many. Then lock the stock row before deciding so the second caller waits, reads the committed current value, and declines the invalid action.",
      caution:
        "Keep each locking transaction open only for the supplied decision and write. In the second round, B is meant to wait: switch promptly to A and run its update and COMMIT. If the 60-second lock bound expires, ROLLBACK in both sessions, rerun setup in A, and start the experiment again.",
      syntaxBreakdown: code`
### In plain terms
The last lesson kept arithmetic in one UPDATE so concurrent increments were not lost. That does
not make an earlier yes-or-no decision current. Here a reservation is valid only while remaining
stock is positive. Before running, predict whether server-side arithmetic alone can preserve that
rule after two callers have both seen the same last unit.

SELECT FOR UPDATE is a locking read: it returns the row and reserves the right to change it until
the transaction ends. A competing locking reader waits. Under Read Committed, that reader then
receives the committed current row, so it can make its decision from the value that actually won.

### Mechanism map

${"```text"}
Round 1: decide from ordinary reads

A: read 1 --> decide accept --> write --> COMMIT        remaining 0, accepted 1
B: read 1 --> decide accept -----------------> write --> remaining -1, accepted 2
             B's decision is now stale

Round 2: lock before deciding

A: SELECT FOR UPDATE (reads 1 and locks) --> write --> COMMIT
B: SELECT FOR UPDATE -------- waits -----------------> reads 0 --> decline

The wait moves B's decision after A's committed change.
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
- A stale decision can be wrong even when each UPDATE performs correct server-side arithmetic.
  Preserving both writes is different from preserving the rule that justified them.
- SELECT FOR UPDATE makes one row a short critical section: only one competing transaction at a
  time can lock, inspect, decide, and change that row.
- The waiting transaction must re-evaluate the decision from the value returned after the wait.
  Waking up is not permission to repeat the earlier action.

### Piece by piece
- **SET default_transaction_isolation = 'read committed'** gives both sessions a known isolation
  level. Each statement starts with a fresh view of committed data. If a locking read waits for
  a concurrent updater, it rechecks that matching row after the updater commits; this does not
  restart the entire statement with a new snapshot.
- **SET lock_timeout = '60s' / SET statement_timeout = '90s'** bound an accidental abandoned wait
  while leaving enough time to switch terminals. If either expires, roll back both sessions and
  restart from setup; a timeout is not an expected result.
- **DROP TABLE IF EXISTS / CREATE TABLE / INSERT** reset only pe_stock with one widget, one unit
  remaining, and zero accepted reservations. The table deliberately permits a negative value so
  the first round makes the broken application decision visible; it is a teaching fixture, not a
  complete production inventory schema.
- **BEGIN / COMMIT** keep each read, decision, and write in one transaction. COMMIT publishes the
  change and releases any row lock; leaving the transaction open longer also lengthens another
  request's wait.
- **CASE WHEN remaining > 0 THEN 'accept' ELSE 'decline' END** prints the decision implied by the
  value each caller read. The aliases ending in **_read** and **_decision** label the evidence;
  they do not save the result for a later statement.
- **UPDATE ... SET remaining = remaining - 1, accepted_reservations =
  accepted_reservations + 1** performs both pieces of arithmetic on PostgreSQL's current row. In
  the stale round this correctly preserves both writes and therefore exposes the bad outcome as
  remaining = -1 and accepted_reservations = 2.
- **SELECT ... FOR UPDATE** reads the matching widget and takes a row lock until COMMIT. A uses it
  before deciding. B's identical statement waits for A, then returns A's committed value rather
  than the value from before the wait.
- **RESET lock_timeout / RESET statement_timeout** restore the configured defaults in both
  sessions once the transactions end. **DROP TABLE pe_stock** removes this lesson's fixture.
- **SELECT 'no write: stock is exhausted' AS b_locked_action** records B's supplied action after
  its locking read reports decline. B commits without changing the row, so the final state can be
  compared with the stale round.
`,
      setup: code`
set default_transaction_isolation = 'read committed';
set lock_timeout = '60s';
set statement_timeout = '90s';
drop table if exists pe_stock;
create table pe_stock (
  sku text primary key,
  remaining int not null,
  accepted_reservations int not null
);
insert into pe_stock values ('widget', 1, 0);`,
      code: code`
-- Session A: stale-decision round. Read the last unit and leave this transaction open.
begin;
select remaining as a_stale_read,
       case when remaining > 0 then 'accept' else 'decline' end as a_stale_decision
from pe_stock where sku = 'widget';

-- Session B: read the same last unit before A changes it. Leave B open too.
set default_transaction_isolation = 'read committed';
set lock_timeout = '60s';
set statement_timeout = '90s';
begin;
select remaining as b_stale_read,
       case when remaining > 0 then 'accept' else 'decline' end as b_stale_decision
from pe_stock where sku = 'widget';

-- Session A: follow A's accept decision, then commit.
update pe_stock
set remaining = remaining - 1,
    accepted_reservations = accepted_reservations + 1
where sku = 'widget';
commit;

-- Session B: follow B's earlier accept decision without reading again, then commit.
update pe_stock
set remaining = remaining - 1,
    accepted_reservations = accepted_reservations + 1
where sku = 'widget';
commit;

-- Session A: observe the invalid result, then reset the same row for the locking round.
select remaining as stale_remaining,
       accepted_reservations as stale_accepted
from pe_stock where sku = 'widget';
update pe_stock set remaining = 1, accepted_reservations = 0 where sku = 'widget';

-- Session A: locking round. Lock the row, decide from 1, and leave A open.
begin;
select remaining as a_locked_read,
       case when remaining > 0 then 'accept' else 'decline' end as a_locked_decision
from pe_stock where sku = 'widget' for update;

-- Session B (blocks until A commits): try to lock the row before making B's decision.
begin;
select remaining as b_locked_read,
       case when remaining > 0 then 'accept' else 'decline' end as b_locked_decision
from pe_stock where sku = 'widget' for update;

-- Session A: follow A's accept decision and commit, which releases the row lock.
update pe_stock
set remaining = remaining - 1,
    accepted_reservations = accepted_reservations + 1
where sku = 'widget';
commit;

-- Session B: the blocked SELECT has now returned 0 and decline. Record no write, then finish.
select 'no write: stock is exhausted' as b_locked_action;
commit;
reset lock_timeout;
reset statement_timeout;

-- Session A: compare the protected result, then remove this lesson's table.
select remaining as locked_remaining,
       accepted_reservations as locked_accepted
from pe_stock where sku = 'widget';
reset lock_timeout;
reset statement_timeout;
drop table pe_stock;`,
      expectedResult: code`
In the stale round, a_stale_read = 1 and b_stale_read = 1, so both labelled decisions are accept.
Both arithmetic updates succeed, and the result is stale_remaining = -1 with stale_accepted = 2.
No write was lost; the failure is that B acted on an eligibility decision made before A committed.

In the locking round, A reports a_locked_read = 1 and accept. B's SELECT FOR UPDATE prints no result
while A remains open. After A commits, B's same statement returns b_locked_read = 0 and decline.
B records “no write: stock is exhausted” and commits without changing the row. The final result is
locked_remaining = 0 and locked_accepted = 1.

The timing of B's wait varies with terminal switching, but it must not return before A commits. All
transactions finish, and the final command drops pe_stock.
`,
      systemsLens:
        "A pessimistic critical section moves a dependent decision behind earlier conflicting work. Use it when one row contains the state that must be current and waiting is an acceptable tradeoff. Keep the transaction short because application work done while holding the lock extends queueing. Ordinary SELECT still uses MVCC and can read an older committed version; competing locking readers and writers participate in the conflict. For this simple stock rule, one conditional UPDATE with WHERE remaining > 0 could combine the test and write; an explicit locking read is useful when the decision needs several steps on the protected row. Locking one stock row does not protect an arbitrary rule spanning other rows, tables, or services.",
    },
  ],
};
