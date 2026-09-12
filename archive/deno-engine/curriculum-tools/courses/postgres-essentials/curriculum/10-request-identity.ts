import { code, type Module } from "../../../src/types.ts";

export const REQUEST_IDENTITY: Module = {
  category: "reliable-requests",
  title: "Reconcile requests by durable identity",
  lessons: [{
    slug: "durable-request-identity",
    title: "Reconcile a repeated request by its durable identity",
    difficulty: "intermediate",
    prerequisites: ["unknown-commit-outcome"],
    tags: ["transactions", "uniqueness", "idempotency", "reconciliation"],
    estimatedMinutes: 25,
    revision: 1,
    sessions: 2,
    safetyLevel: "locking",
    runIn: "tool",
    overview:
      "Race two deliveries of one credit request and watch PostgreSQL's unique constraint make the second delivery wait for the first transaction's outcome. Then reconnect as a caller might after lesson 11's lost response, reconcile the durable payload and receipt, and prove that replay did not add a second credit.",
    caution:
      "Session B is meant to wait at its labelled INSERT. Switch promptly to session A and COMMIT. The 60-second lock bound is only a guard: if it expires, ROLLBACK both sessions and rerun setup in A. Never treat a duplicate key alone as success; compare the stored account and amount with the request you are handling.",
    syntaxBreakdown: code`
### In plain terms
A request identity is a durable key chosen so every delivery of one logical request carries the
same value. Here the row identified by request-12 is the credit itself: its amount contributes to
the account total, and its stored receipt records the result. Before running, predict what B can
know while A's row exists but A has not committed or rolled back.

The unique constraint makes PostgreSQL arbitrate competing inserts of the same key. It does not
make every duplicate a successful replay. A caller must read the winner and accept it only when
the stored account and amount match the request it is reconciling.

### Mechanism map

${"```text"}
One request key, one transactional effect

A: INSERT request-12 ---------------- holds transaction ----------------> COMMIT
B: INSERT request-12 ---- waits for A's unique-key decision ------------> inserts 0 rows
                                                                         |
                                                        fresh SELECT reads stored receipt

Reconnect/replay: same key + same payload -> return the stored receipt
                  same key + different payload -> reject the key reuse

The ledger row is both the credit and its receipt: one row, credited total 40.
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
- A unique request key can make one transactional database effect durable once. Concurrent
  deliveries cannot both create the ledger row with that key.
- A waiter learns the winner only after the earlier transaction ends. Under Read Committed, its
  following SELECT is a new statement with a fresh snapshot that can see the committed row.
- Reconciliation includes payload equality. Reusing request-12 for a different account or amount
  is an error, even though the key already exists.
- This table makes the ledger row and receipt one atomic object. A separate balance table or a
  remote side effect would require more protocol; this experiment makes no external exactly-once
  claim, and retained keys define how long old deliveries remain recognizable.

### Piece by piece
- **SET default_transaction_isolation = 'read committed'** selects PostgreSQL's default statement-
  snapshot behavior explicitly. B's INSERT and its later SELECT are separate statements, so the
  SELECT can see A's commit even though B connected before it happened.
- **SET lock_timeout = '60s' / SET statement_timeout = '90s'** bound an abandoned wait while
  leaving time to switch terminals. A timeout is not expected evidence; roll back and restart if
  either guard fires.
- **DROP TABLE IF EXISTS / CREATE TABLE / PRIMARY KEY** recreate only pe_credit_ledger. PRIMARY KEY
  makes request_id unique and not null, so two committed rows cannot represent request-12.
- **BEGIN / COMMIT** hold A's insert uncommitted long enough for B to contend with it. COMMIT makes
  A's complete ledger row visible and releases the unique-key waiter.
- **INSERT ... ON CONFLICT (request_id) DO NOTHING** attempts the credit, but suppresses a duplicate-
  key error after PostgreSQL resolves the conflict. B waits while A's outcome is unknown. If A
  commits, B affects zero rows; if A rolls back, B can insert its own row.
- **RETURNING request_id, account_id, amount, receipt** returns the accepted row only when this
  statement inserted it. No returned row is evidence to reconcile, not evidence that an arbitrary
  duplicate payload is valid.
- **\echo ... :ROW_COUNT** prints psql's row count from the immediately preceding INSERT. A prints
  1; after A commits, B prints 0. Another SQL statement would replace this psql variable.
- **CASE WHEN account_id = ... AND amount = ... THEN 'MATCH: return stored receipt' ELSE 'REJECT'**
  compares the supplied request payload with the durable winner. The second query deliberately
  supplies amount 55 and must print REJECT; it performs no write.
- **\connect - - - -** opens a fresh psql connection while inheriting the current database, user,
  host and port. It models reconnecting after a response was lost without claiming that this lesson
  loses a network packet.
- **count(*) / sum(amount) FILTER (WHERE account_id = 'acct-7')** prove the durable effect directly.
  Healthy evidence is one request-12 row and a credited total of 40, not merely a client message.
- **RESET default_transaction_isolation / RESET lock_timeout / RESET statement_timeout / DROP
  TABLE** restore each changed session setting and remove the lesson fixture after every
  transaction has ended.
`,
    setup: code`
set default_transaction_isolation = 'read committed';
set lock_timeout = '60s';
set statement_timeout = '90s';
drop table if exists pe_credit_ledger;
create table pe_credit_ledger (
  request_id text primary key,
  account_id text not null,
  amount integer not null check (amount > 0),
  receipt text not null
);`,
    code: code`
-- Session A: accept the request, but keep its unique-key decision uncommitted.
begin;
insert into pe_credit_ledger (request_id, account_id, amount, receipt)
values ('request-12', 'acct-7', 40, 'credit accepted: acct-7 +40')
on conflict (request_id) do nothing
returning request_id, account_id, amount, receipt;
\echo a_inserted=:ROW_COUNT

-- Session B (blocks until A commits): race the same key and same payload.
set default_transaction_isolation = 'read committed';
set lock_timeout = '60s';
set statement_timeout = '90s';
begin;
insert into pe_credit_ledger (request_id, account_id, amount, receipt)
values ('request-12', 'acct-7', 40, 'credit accepted: acct-7 +40')
on conflict (request_id) do nothing
returning request_id, account_id, amount, receipt;
\echo b_inserted=:ROW_COUNT

-- Session A: publish the ledger row and release B's unique-key wait.
commit;

-- Session B: its INSERT returned no row. Reconcile in a fresh Read Committed statement.
select request_id, account_id, amount, receipt,
       case when account_id = 'acct-7' and amount = 40
            then 'MATCH: return stored receipt'
            else 'REJECT: request key reused with different payload'
       end as reconciliation
from pe_credit_ledger
where request_id = 'request-12';
commit;

-- Session A: reconnect with inherited parameters, as after an unknown response, and replay.
\connect - - - -
set lock_timeout = '60s';
set statement_timeout = '90s';
insert into pe_credit_ledger (request_id, account_id, amount, receipt)
values ('request-12', 'acct-7', 40, 'credit accepted: acct-7 +40')
on conflict (request_id) do nothing
returning request_id, account_id, amount, receipt;
\echo replay_inserted=:ROW_COUNT
select receipt as replay_receipt,
       case when account_id = 'acct-7' and amount = 40
            then 'MATCH: return stored receipt'
            else 'REJECT: request key reused with different payload'
       end as replay_decision
from pe_credit_ledger where request_id = 'request-12';

-- Session A: test a conflicting payload without applying another effect.
select account_id as stored_account, amount as stored_amount,
       'acct-7' as supplied_account, 55 as supplied_amount,
       case when account_id = 'acct-7' and amount = 55
            then 'MATCH: return stored receipt'
            else 'REJECT: request key reused with different payload'
       end as payload_decision
from pe_credit_ledger where request_id = 'request-12';

-- Session A: prove one ledger effect and one credited amount, then clean up.
select count(*) filter (where request_id = 'request-12') as request_rows,
       sum(amount) filter (where account_id = 'acct-7') as credited_total
from pe_credit_ledger;
reset lock_timeout;
reset statement_timeout;
drop table pe_credit_ledger;

-- Session B: restore this connection's settings after A has removed the fixture.
reset default_transaction_isolation;
reset lock_timeout;
reset statement_timeout;`,
    expectedResult: code`
A's INSERT returns request-12, acct-7, 40 and “credit accepted: acct-7 +40”; a_inserted = 1.
B's INSERT prints no result while A's transaction remains open. After A commits, B's INSERT
finishes without a returned row and b_inserted = 0. B's following SELECT uses a fresh Read
Committed statement snapshot: it reads A's account, amount and receipt and reports “MATCH: return
stored receipt”.

After \connect, replaying the same request returns no inserted row and replay_inserted = 0. The
stored receipt query reports the same receipt and MATCH. The deliberately supplied amount 55 is
compared with stored_amount = 40 and reports “REJECT: request key reused with different payload”.
It does not create or change a ledger row.

The final aggregate reports request_rows = 1 and credited_total = 40. Thus the one durable row is
both the receipt and the complete database effect. Wait duration and backend identities vary, but
B must not finish its INSERT before A commits. Both sessions restore their timeout settings, and A
drops pe_credit_ledger.
`,
    systemsLens:
      "Durable identity turns redelivery into reconciliation. Uniqueness serializes claims for one key, while a stored payload prevents a key collision from being mistaken for success. Keeping the effect and receipt in one row gives them one commit boundary; splitting a balance update from a receipt row could let them disagree unless one transaction protects both. The guarantee lasts only as long as the key and payload record are retained. A remote payment, message, or email has another commit boundary, so this pattern alone cannot promise exactly-once effects outside PostgreSQL.",
    challenge:
      "Optional, after the core time budget: run this self-contained reset and test the other outcome of the unique-key wait. B waits behind A as before, but A rolls back. B becomes the sole accepted insert and reports one credited amount of 40.\n\n```sql\n-- Session A: reset the fixture, then hold an uncommitted candidate row.\nset default_transaction_isolation = 'read committed';\nset lock_timeout = '60s';\nset statement_timeout = '90s';\ndrop table if exists pe_credit_ledger;\ncreate table pe_credit_ledger (\n  request_id text primary key,\n  account_id text not null,\n  amount integer not null check (amount > 0),\n  receipt text not null\n);\nbegin;\ninsert into pe_credit_ledger values\n  ('request-12', 'acct-7', 40, 'credit accepted: acct-7 +40')\non conflict (request_id) do nothing\nreturning request_id, account_id, amount, receipt;\n\\echo a_inserted=:ROW_COUNT\n\n-- Session B (blocks until A rolls back): use the same guards and payload.\nset default_transaction_isolation = 'read committed';\nset lock_timeout = '60s';\nset statement_timeout = '90s';\nbegin;\ninsert into pe_credit_ledger values\n  ('request-12', 'acct-7', 40, 'credit accepted: acct-7 +40')\non conflict (request_id) do nothing\nreturning request_id, account_id, amount, receipt;\n\\echo b_inserted=:ROW_COUNT\n\n-- Session A: remove A's candidate and release B.\nrollback;\n\n-- Session B: B is now the sole accepted insert.\ncommit;\nselect count(*) as request_rows, sum(amount) as credited_total\nfrom pe_credit_ledger where request_id = 'request-12';\nreset default_transaction_isolation;\nreset lock_timeout;\nreset statement_timeout;\n\n-- Session A: restore settings and remove the fixture.\nreset default_transaction_isolation;\nreset lock_timeout;\nreset statement_timeout;\ndrop table pe_credit_ledger;\n```\n\nThis variation changes only A's outcome. B's successful insert follows A's rollback; it does not bypass uniqueness.",
  }],
};
