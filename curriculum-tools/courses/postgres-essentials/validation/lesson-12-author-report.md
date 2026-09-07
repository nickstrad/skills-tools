# Lesson 12 author validation

Validated 2026-09-07 against PostgreSQL 16 using `validation/lesson-12-author.py` and the exact
exported draft in `curriculum/10-request-identity.ts`.

## Core race

- A returned `request-12 | acct-7 | 40 | credit accepted: acct-7 +40` and `a_inserted=1`, then held
  the transaction open.
- Before releasing A, `pg_stat_activity` plus `pg_blocking_pids` reported `wait_type=Lock`,
  `wait_event=transactionid`, waiter `l12-B`, blocker `l12-A`.
- After A committed, B returned zero rows and `b_inserted=0`. Its next statement returned the stored
  account, amount and receipt with `MATCH: return stored receipt`.
- After `\connect - - - -`, the replay returned zero rows and `replay_inserted=0`; its stored
  receipt decision was `MATCH`.
- Supplying amount 55 against stored amount 40 returned
  `REJECT: request key reused with different payload`.
- The final aggregate returned `request_rows=1` and `credited_total=40`. No ERROR, FATAL or PANIC
  appeared, and the fixture was dropped.

## Rollback variation

- B again visibly waited on A's transaction ID.
- A rolled back. B then returned the row and `b_inserted=1`, committed, and independently reported
  `request_rows=1` and `credited_total=40`.
- No ERROR, FATAL or PANIC appeared, and the fixture was dropped.

The controller allocated `/tmp/pg-essentials-l12-qc4ldxoo`, stopped its postmaster normally in
`finally`, and removed the root. It first verified that the protected learner server still resolved
to `/labs/pglab/primary`. The author run created no backup, replica, archive or progress copy.
