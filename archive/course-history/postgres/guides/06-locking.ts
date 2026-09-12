import type { Guide } from "./types.ts";

const guide = (
  brief: string,
  predict: string,
  inspect: string,
  explain: string,
  vary: string,
  apply: string,
  hints: [string, string],
): Guide => ({ brief, predict, inspect, explain, vary, apply, hints });

export const guides: Record<string, Guide> = {
  "row-locks-are-in-the-tuple": guide(
    "A tuple lock becomes a transaction-id wait for a competing writer.",
    "Which xid and PID should connect pgrowlocks to B's wait?",
    "Read pgrowlocks, pg_stat_activity, and pg_locks before A commits.",
    "Why does B wait on A's transaction outcome rather than a central row-lock entry?",
    "Use FOR SHARE in both sessions.",
    "Which transaction would you investigate to reduce a blocked writer's latency?",
    [
      "Leave A open through the inspection query.",
      "Rerun setup. In each session run BEGIN; SELECT id FROM lk_t WHERE id=1 FOR SHARE;. Inspect pgrowlocks('lk_t') while both remain open, then ROLLBACK in both sessions; do not attempt shared-to-exclusive upgrades in this variation.",
    ],
  ),
  "lock-queue-and-blocking-pids": guide(
    "A wait graph names the current blockers; compatible requests can change queue behavior.",
    "Which PID blocks B, and which blocks C before A commits?",
    "Compare pg_blocking_pids with wait_event_type and wait_event.",
    "Why diagnose actual blockers instead of assuming a universal FIFO rule?",
    "Use FOR SHARE for B and C.",
    "What query would you run first during a latency incident?",
    [
      "Keep B's transaction open after its UPDATE completes.",
      "Rerun setup and replace B/C UPDATEs with SELECT id FROM lk_t WHERE id=2 FOR SHARE; inspect the graph before A commits.",
    ],
  ),
  "deadlock-detection": guide(
    "A cycle has no safe waiter, so PostgreSQL aborts one transaction.",
    "Which session records :ERROR=true after its second UPDATE, and what must that client do next?",
    "Read both SQLSTATE lines and confirm the failed session rolls back while the other commits.",
    "Why is victim choice variable while lock ordering prevents the cycle?",
    "Make both transactions acquire rows in ascending order.",
    "Which retry boundary must contain all writes in a deadlock-prone operation?",
    [
      "Each client saves :ERROR immediately after its own second UPDATE. Its \\if block must ROLLBACK when that value is true; the other client COMMITs.",
      `Rerun setup and use this ordered schedule:

Session A:
begin;
update lk_t set val='A1' where id=1;
update lk_t set val='A2' where id=2;

Session B (the first UPDATE waits):
begin;
update lk_t set val='B1' where id=1;

Session A:
commit;

Session B:
update lk_t set val='B2' where id=2;
commit;

B waits for A, then finishes without a deadlock.`,
    ],
  ),
  "lock-timeout-and-nowait": guide(
    "A deadline, NOWAIT, and SKIP LOCKED make three distinct busy-resource decisions.",
    "Which form errors, which returns partial work, and which observes total runtime?",
    "Check the error text and rows returned by SKIP LOCKED.",
    "Why does a tiny timeout not prove a fast statement must fail?",
    "Compare a sleeping statement under statement_timeout.",
    "Where should a migration set a bounded lock deadline?",
    [
      "RESET lock_timeout after the first failed UPDATE.",
      `In a fresh autocommit session run:
set statement_timeout='100ms';
select pg_sleep(1);
\\echo timed_statement_SQLSTATE :SQLSTATE
reset statement_timeout;

The deliberately slow query should report 57014; a fast SKIP LOCKED query may finish before that deadline.`,
    ],
  ),
  "ddl-behind-a-long-query": guide(
    "Metadata-only ADD COLUMN still requests AccessExclusiveLock and can queue later readers.",
    "Which lock is granted and which request waits before the ALTER runs?",
    "Join pg_locks to pg_stat_activity before releasing A.",
    "Why can a later reader wait even though it is compatible with the original reader?",
    "Run the bounded metadata-only ALTER and confirm C resumes after B's lock timeout.",
    "How would you make a schema change fail quickly instead of becoming an outage?",
    [
      "Run the inspection while A's transaction remains open.",
      "Run the complete bounded_trial challenge from the lesson. Wait for B's first ALTER to return SQLSTATE55P03 while A remains open, then COMMIT A and run the retry/cleanup in B. A metadata-only change still needs AccessExclusiveLock; C can briefly wait behind B. Drop a leftover bounded_trial column before restarting the schedule.",
    ],
  ),
  "advisory-locks-as-leases": guide(
    "Advisory locks are cooperative mutual exclusion with session or transaction scope, not leases.",
    "How many acquisitions can A make while pg_locks still shows one lock row?",
    "Compare session-scope state after COMMIT with transaction-scope state after COMMIT.",
    "Why does this lock not fence an external service or prove an old owner stopped?",
    "Reacquire key 42 in a dedicated A session, then observe B acquire it only after that session ends.",
    "What extra interface would an external protected resource need for fencing?",
    [
      "Do not use pg_advisory_unlock_all until you have observed reentrancy.",
      `For the session-end variation, use two dedicated psql sessions.

Session A:
set application_name='lk-advisory-variation';
select pg_advisory_lock(42);

Session B:
select pg_try_advisory_lock(42) as busy_must_be_false;
select pid as victim_pid from pg_stat_activity
where datname=current_database() and application_name='lk-advisory-variation' \\gset
select pg_terminate_backend(:victim_pid,2000) as terminated;
select pg_try_advisory_lock(42) as acquired_after_session_end;
select pg_advisory_unlock(42);

Expect false, true, then true. Reconnect A afterward; do not substitute another PID.`,
    ],
  ),
  "skip-locked-work-queue": guide(
    "A durable claim needs guarded completion; SKIP LOCKED only distributes short claim transactions.",
    "Which job/generation belongs to A after takeover, and why is A's completion a no-op?",
    "Inspect jobs and results together, including stale_results and final checks.",
    "Why do generation and expiry protect only cooperative database writers?",
    "Rollback an open claim, then let the other worker claim that pending job.",
    "Which boundary still needs an outbox or receiver protocol for an external effect?",
    [
      "Run Session A/B blocks in order; psql variables come from RETURNING output.",
      "Rerun setup; have A begin the first claim and ROLLBACK, then run B's pending-row claim statement and inspect status/generation.",
    ],
  ),
  "unique-constraint-race": guide(
    "A unique index makes concurrent same-key inserts wait for the first transaction's outcome.",
    "Does B know whether it will fail before A commits?",
    "Inspect B's transactionid wait and final one-row invariant.",
    "Why is check-then-insert unsafe for an idempotent request key?",
    "Make A roll back the first key and see B succeed.",
    "Where should request identity and its effect be committed together?",
    [
      "Keep A open while B attempts the same key.",
      "Rerun setup; have A insert key 1 then ROLLBACK after B blocks. B's plain INSERT can then commit and own key 1.",
    ],
  ),
};
