# PostgreSQL experiment evidence

Use these causal and validation checks when revising database experiments; verified2026-09-04.

## What happened

The PostgreSQL foundation review found plausible explanations that exceeded the experiments:
fillfactor comparisons mixed physical histories, raw page inspection was supposed to set visibility
hints, and ordinary VACUUM was described as never shortening a file. A progress query used a column
absent from the actual view, yet the validator reported completion. A rendered hint put more SQL
after a psql meta-command on the same line, although a separately handwritten validation script
worked.

## Why it matters

A lesson must cause the claimed mechanism and teach a boundary that transfers to architecture.
Matching expected-looking numbers or reproducing a different script does not establish this.

## How to apply

- Compare fresh tables with matched rows, indexes and transaction boundaries when isolating
  fillfactor. Report phase counters or deltas, not accumulated ratios from different histories.
  Separately committed updates and one long transaction expose different pruning opportunities.
- Raw page inspection reads physical bytes. To observe visibility hint writes, insert a fresh
  committed tuple, inspect its header, run a normal table SELECT, then inspect again. Already-set
  hints need not change.
- Ordinary VACUUM reuses interior holes and can truncate an empty tail. It does not relocate live
  rows to consolidate holes. Growth requires diagnosis of horizons, cleanup capacity and live data;
  a rewrite is not the automatic remedy. Other engines can use different relocation protocols.
- PostgreSQL buffer reads can come from the OS cache. Keep projection, payload access, physical
  allocation and device-I/O claims distinct; unchanged file allocation does not prove no writes.
- Use pg_stat_progress_vacuum.relid (cast to regclass for a name); filter database and relation.
  Statistics are asynchronous and reruns can preserve counters. Compare against captured initial
  state rather than assuming zero. A short worker may finish between polls.
- Give bounded watches enough harness time: a12-sample,5-second watch needs more than the default 30
  seconds. Still inspect actual SQL errors: tool-mode completion counts do not validate results.
- Execute the exact rendered hint or extracted lesson source. psql meta-commands end at a newline,
  not at a SQL semicolon. A correct handwritten equivalent cannot validate broken rendered syntax.
- Exercise contention explicitly: a takeover claim held open should make a rival return zero rows; a
  rolled-back claim should become available to a fresh attempt. Distinguish an empty candidate
  result from a database error. Never use gset where the deliberate outcome is zero rows.

## Concurrent clients: additional findings,2026-09-04

A known transaction abort and an unknown commit response require different reasoning. For a replay
protocol, test receipt and business effect in the same transaction, concurrent same-key callers,
immutable payload checks, and failure after receipt reservation. Compare the operation's stored
result with current business state: they need not be equal after later operations. Use a retained
identity on retry; a new identity deliberately authorizes a new operation.

At READ COMMITTED, a conflicting INSERT DO NOTHING can wait for a row absent from its starting
snapshot. A separate lookup inside a VOLATILE function can see the newly committed row; a single
insert-or-read CTE does not automatically get that later snapshot. Validate the actual two-session
schedule.
[PostgreSQL16 transaction isolation](https://www.postgresql.org/docs/16/transaction-iso.html) and
[function volatility](https://www.postgresql.org/docs/16/xfunc-volatility.html) explain these
snapshot rules. This does not remove whole-transaction retries at stronger isolation levels.

Capture psql's ERROR flag immediately after each side of a deadlock and clean up the actual victim.
Changing expected prose to “either victim” while leaving a fixed B-rollback/A-commit schedule is
insufficient. To test advisory-lock release at session end, first acquire the lock in the dedicated
victim session; terminating a session after it already unlocked proves nothing about release.

For optimistic edits, a fresh version token alone does not preserve another user's intent. A blind
replacement can pass the new token check and still discard their content. Teach conflict detection
and the explicit merge/reject policy together, with a final assertion that accepted edits survive.
