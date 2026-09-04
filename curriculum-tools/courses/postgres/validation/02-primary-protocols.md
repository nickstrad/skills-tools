# Primary concurrency protocol evidence

2026-09-04. PostgreSQL16.15 in the private port5540 lab. These helper drafts are the primary-owned
protocol implementation for chunk2; lesson05/06 integration and full chunk2 acceptance are separate.

## Whole-transaction retry

The actual Bash client loop in client-protocol.ts ran against pivot_primary. The first attempt
captured a snapshot, waited behind an observed advisory-lock gate, then attempted an update after a
competing committed write. PostgreSQL returned SQLSTATE40001 and psql exit3. A fresh connection and
transaction reread the balance and succeeded on attempt2. Final balance95 and one effect row were
asserted. This is a classified abort with bounded retry, not an uncertain commit response.

The supplied changed-input variation, competitor+20, also passed with final balance110 and one
effect. Evidence: /tmp/pg-retry-Potk2s and /tmp/pg-retry-yCqb11. Scripts: /tmp/pg-pivot-retry.sh and
/tmp/pg-pivot-retry-variation.sh. The isolation agent independently extracted and executed
RETRY.code on pivot_visibility, obtaining40001 then95|1.

## Durable claim and completion

Primary extracted WORK_QUEUE into a one-lesson harness driver, preserving its actual setup and
session order. /tmp/validate-pg-worker.ts ran against pivot_primary; raw log:
/tmp/pg-pivot-worker.log. No unexpected SQL errors or timeouts occurred.

- A claimed job1/generation1 and B skipped its locked row to claim job2/generation1.
- After both claim commits, pgrowlocks reported zero locks while jobs remained running.
- The explicitly labeled time-passage fixture expired job1. B claimed generation2 and held its
  transaction open. A's rival expired-row claim returned UPDATE0.
- After takeover committed, A's old-token completion inserted zero rows; stale_results was0.
- B completed jobs1 and2. A held a claim on job3; B's pending-claim attempt returned UPDATE0.
- A rolled back: job3 was pending/generation0. B's fresh claim got generation1 and completed it.
- Repeated completion inserted zero rows. Final all_done, one_result_per_job and
  no_stale_or_duplicate were all true.

The locking agent independently ran the latest helper in its private module sequence. These are
cooperative SQL clients and database results. The experiment does not establish that an external
side effect ran only once or that a paused worker ceased executing. Unknown commit outcomes,
receiver commits and enforced external-resource fencing remain later primary responsibilities.
