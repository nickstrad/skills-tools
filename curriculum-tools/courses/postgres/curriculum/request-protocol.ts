import { code, type Draft } from "../../../src/types.ts";

export const REQUEST_SETUP = code`
drop table if exists uc_receipts;
drop table if exists uc_accounts;
create table uc_accounts(id int primary key, balance int not null check(balance >= 0));
insert into uc_accounts values(1,100),(2,100);
create table uc_receipts(
  request_id text primary key,
  account_id int not null references uc_accounts(id),
  amount int not null check(amount > 0),
  balance_after int
);
create or replace function uc_apply(p_request text,p_account int,p_amount int)
returns int language plpgsql volatile as $fn$
declare
  inserted_count int;
  saved public.uc_receipts%rowtype;
  result_balance int;
begin
  if p_request is null or btrim(p_request)='' or p_account is null
     or p_amount is null or p_amount <= 0 then
    raise exception using errcode='22023', message='request identity and positive payload required';
  end if;
  insert into public.uc_receipts(request_id,account_id,amount)
    values(p_request,p_account,p_amount) on conflict(request_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count=0 then
    -- Separate SQL command: a fresh snapshot inside this VOLATILE function at READ COMMITTED.
    select * into saved from public.uc_receipts where request_id=p_request;
    if not found or saved.balance_after is null then
      raise exception using errcode='40001', message='receipt unavailable; retry a fresh transaction';
    end if;
    if saved.account_id <> p_account or saved.amount <> p_amount then
      raise exception using errcode='22023', message='request identity reused with different payload';
    end if;
    return saved.balance_after;
  end if;
  update public.uc_accounts set balance=balance-p_amount
    where id=p_account and balance>=p_amount returning balance into result_balance;
  if not found then
    raise exception using errcode='22003', message='insufficient balance';
  end if;
  update public.uc_receipts set balance_after=result_balance where request_id=p_request;
  return result_balance;
end
$fn$;`;

export const UNKNOWN_COMMIT: Draft = {
  slug: "unknown-commit-outcome",
  title: "Recover an unknown commit outcome with a durable request identity",
  revision: 1,
  difficulty: "advanced",
  safetyLevel: "locking",
  runIn: "tool",
  sessions: 2,
  estimatedMinutes: 35,
  prerequisites: ["retry-loop-and-idempotency"],
  tags: ["transactions", "idempotency", "retries", "distributed-patterns"],
  overview: code`
An explicit serialization failure tells a client its transaction aborted. A missing commit response
leaves a different question: did the database commit before the response was lost? You will withhold
responses in two controlled fixtures, replay the same request in a fresh transaction, and inspect
one debit and a stored result for each successful request. A competing replay then tests the same
identity while the first caller still has an open transaction.`,
  reading: code`
PostgreSQL 14 Internals does not provide this application protocol; Chapter 2 "Isolation" and Chapter 13 "Row-Level Locks" provide transaction and contention background.`,
  syntaxBreakdown: code`
### In plain terms

The client creates a request identity once and keeps it across retries. The database stores that
identity, its immutable payload and the result in the same transaction as the debit. If that
transaction committed, replay returns its stored result. If it rolled back, replay can perform the
debit. The caller uses the same recovery action for both possibilities.

### What you are learning

- A missing response is uncertainty about an outcome, not evidence of rollback.
- Receipt and business effect must commit together. A unique key on an unrelated log is insufficient.
- Duplicate callers can wait on the same identity. Lookup after that wait needs visibility of the
  winner's committed receipt; this experiment uses fresh READ COMMITTED statements.
- Reusing an identity with another payload is a request error. Generating a new identity on every
  retry defeats deduplication. Retention limits how long a replay remains recognizable.

### Piece by piece

- **uc_accounts** holds the protected balance. Its CHECK rejects negative balances. **uc_receipts**
  stores request identity, account, amount and the original result. The primary key arbitrates
  duplicates; the foreign key rejects requests for nonexistent accounts. balance_after is temporarily
  NULL inside the function and filled before success. Cooperative clients call the complete function;
  direct table writers could bypass this protocol.
- **CREATE OR REPLACE FUNCTION ... LANGUAGE plpgsql VOLATILE** packages several SQL commands in the
  caller's transaction. It does not commit by itself. At READ COMMITTED, its separate SQL commands
  can see commits made while a previous command waited. This is deliberate; declaring it STABLE or
  replacing the statements with a single insert-or-read CTE changes snapshot behavior.
- **INSERT ... ON CONFLICT DO NOTHING** tries to reserve the identity. **GET DIAGNOSTICS ... ROW_COUNT**
  distinguishes a new receipt from a conflicting one. A conflict with an uncommitted receipt waits
  for its creating transaction's outcome; the later SELECT reads a committed receipt.
- **%ROWTYPE, SELECT INTO, FOUND, IF and RETURN** store the receipt, check whether it exists, compare
  its payload and return its original balance result. Replay does not recompute the operation using
  today's balance. The function raises 40001 if a receipt cannot be read instead of inventing success.
- **UPDATE ... WHERE balance >= amount RETURNING** checks funds and debits the current locked row in
  one statement. If no row qualifies, **RAISE EXCEPTION** with SQLSTATE22003 aborts the function's
  statement, including its new receipt. SQLSTATE22023 rejects missing or inconsistent request data.
- **BEGIN ISOLATION LEVEL READ COMMITTED, COMMIT and ROLLBACK** delimit whole attempts. All core
  writes use this isolation level. A stronger isolation level can introduce serialization failures
  requiring a fresh whole-transaction retry; this lesson is not a universal retry library.
- **\o /dev/null** temporarily directs psql query responses away from the caller's display; bare
  **\o** restores it. This is an explicitly controlled withheld-response fixture. The script author
  knows whether COMMIT or ROLLBACK was sent; we do not claim to have broken a network or measured
  driver behavior. The recovery code repeats the same request in either case.
- **SET application_name** labels the racing replay for observation in pg_stat_activity. **\echo
  :SQLSTATE** reports deliberately rejected requests. Counts, balances and the final conservation
  query verify the stored relationship instead of relying on a printed success message.
`,
  setup: REQUEST_SETUP,
  code: code`
-- Session A: fixture 1 commits, but its response is deliberately withheld.
\o /dev/null
begin isolation level read committed;
select uc_apply('req-unknown',1,10);
commit;
\o

-- Session A: caller recovery uses the SAME request identity and payload.
begin isolation level read committed;
select uc_apply('req-unknown',1,10) as replayed_result;
commit;
select * from uc_accounts where id=1;
select * from uc_receipts where request_id='req-unknown';

-- Session A: fixture 2 rolls back, with its response also withheld.
\o /dev/null
begin isolation level read committed;
select uc_apply('req-notcommitted',1,7);
rollback;
\o

-- Session A: identical recovery policy, regardless of the hidden outcome.
begin isolation level read committed;
select uc_apply('req-notcommitted',1,7) as recovered_result;
commit;

-- Session A: a successful request is still provisional until its caller commits.
begin isolation level read committed;
select uc_apply('req-race',2,20) as a_result;

-- Session B
set application_name='uc-competing-replay';
-- Session B (blocks: the same identity is still uncommitted in A)
select uc_apply('req-race',2,20) as b_result;

-- Session A
select pid,wait_event_type,wait_event from pg_stat_activity
where application_name='uc-competing-replay';
commit;

-- Session B
select * from uc_accounts where id=2;
select * from uc_receipts where request_id='req-race';

-- Session A: an identity cannot mean a different debit on replay.
select uc_apply('req-race',2,21);
\echo mismatched_payload_SQLSTATE :SQLSTATE

-- Session A: a failed debit must not leave a successful receipt behind.
select uc_apply('req-declined',2,200);
\echo declined_debit_SQLSTATE :SQLSTATE
select count(*)=0 as no_declined_receipt from uc_receipts where request_id='req-declined';

-- Session A: stored operation result and current balance are different observations.
select uc_apply('req-unknown',1,10) as original_result,
       (select balance from uc_accounts where id=1) as current_balance;
select * from uc_receipts order by request_id;
select (select count(*) from uc_receipts)=3 as three_requests,
       (select sum(balance) from uc_accounts)+(select sum(amount) from uc_receipts)=200 as conserved,
       not exists(select 1 from uc_receipts where balance_after is null) as all_results_recorded;`,
  expectedResult: code`
The first replay returns90; account1 is90 and req-unknown has one receipt for amount10/result90.
The second hidden attempt rolled back; recovery applies amount7 once and returns83. A's racing
request returns80 provisionally. B waits for A's transaction and then returns the same80; account2
is80 and there is only one req-race receipt. Activity observation should show B waiting on a Lock
while A remains open; backend IDs and exact sample timing vary.

The changed-payload request raises22023 and the insufficient-funds request raises22003. Neither
changes a committed balance or leaves a new receipt. no_declined_receipt is true. Replaying the
first request again returns its original90 even though account1 is now83. Final three_requests,
conserved and all_results_recorded are all true. These assertions cover successful database debits
and receipts, not an external API call or recovery after lost acknowledged database history.`,
  systemsLens: code`
A durable request identity lets a caller resolve uncertainty through replay. The linearization
boundary is the transaction committing both the receipt and the business effect; returning from
an inner function is not that boundary. The protocol's scope is one database history with retained,
immutable receipts and cooperative clients. Receipt deletion, a new identity on retry, an external
effect or promotion that loses acknowledged commits each changes the guarantee and needs its own
policy. Later delivery and replication experiments exercise those boundaries explicitly.`,
  caution: code`
Use only the disposable lab. Run the labeled steps in order and use READ COMMITTED for the fresh
calls. Restore output with bare \o if you stop during a hidden-response fixture. Setup discards this
lesson's uc_ tables and their receipts; that is a lab reset, not a production retention policy.`,
  challenge: code`
Rerun setup and the two hidden-response fixtures with the first debit amount changed from10 to15,
keeping its identity and payload consistent across every replay. Predict the final balances before
running. Then deliberately give a replay a new identity: compare the extra debit and receipt, and
explain why caller-generated identities must survive retries. Keep the incorrect variant isolated
from the core's conservation and receipt-count assertions.`,
};
