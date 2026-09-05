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

## Planner measurement boundaries, 2026-09-05

EXPLAIN node rows/time are per-loop averages, whereas buffer accesses accumulate and parent buffers
include child work. Repeated accesses are not distinct pages, and shared reads can come from the OS
cache. Rollback removes transactional row changes but does not undo the resource use of an EXPLAIN
ANALYZE write. Keep measured values separate from sample-dependent estimates and platform
assumptions. See [PostgreSQL16 EXPLAIN](https://www.postgresql.org/docs/16/using-explain.html).

When testing Memoize, disabling it can reverse the join order. A valid query alone therefore may not
isolate cached customer probes. Inspect the actual inner relation and loop counts in both runs. The
PostgreSQL variation uses an explained LATERAL/OFFSET0 barrier to retain the inner lookup and then
varies only Memoize; that fixture choice is not production tuning advice.

Hash operations apply hash_mem_multiplier to work_mem; neither is a whole-process memory cap.
Account for overlapping operations and workers before generalizing a single-query improvement. See
[PostgreSQL16 memory settings](https://www.postgresql.org/docs/16/runtime-config-resource.html).

For pg_stat_statements intervals, keep role, database and top-level status fixed. Another session
using that scope can contribute. Calls/time deltas do not make lifetime min/mean/max into interval
percentiles. Resets and entry eviction can invalidate subtraction: the course checks stats_reset and
dealloc, while stating that targeted resets still require coordination. Prior planning totals can
survive after tracking is disabled. See
[PostgreSQL16 pg_stat_statements](https://www.postgresql.org/docs/16/pgstatstatements.html).

## Index comparisons and observation snapshots, 2026-09-05

Match index build history as well as data: a primary key maintained during insertion is not the same
physical history as a secondary index bulk-built afterwards. Integer versus text also changes type
and collation, so describe it as a representation comparison. Index leaf inspection must exclude
high keys and internal downlinks before matching a heap tuple pointer. Tree height is not a direct
measurement of device reads per lookup.

INCLUDE prevents B-tree deduplication, so a covering index's size increase can exceed the extra
payload bytes alone. Demonstrate write eligibility on matched tables with spare space. Inside the
update transaction, pg_stat_xact_user_tables directly distinguishes HOT eligibility without waiting
for cumulative counters: a changed included payload prevents HOT, whereas changing an unindexed note
can allow HOT on both tables. See
[PostgreSQL16 CREATE INDEX](https://www.postgresql.org/docs/16/sql-createindex.html).

A bounded readiness loop can still be wrong if each iteration rereads cached statistics. In the
concurrent-build trial, the progress phase changed while a DO block retained its earlier
observation. Clearing the statistics snapshot each iteration made the actual phase visible. Keep
transaction-local counters, cumulative counter publication and cached observation snapshots
distinct. See [PostgreSQL16 statistics](https://www.postgresql.org/docs/16/monitoring-stats.html).

The repeatable-read pagination variation requires separate persistent sessions and a cursor acquired
before the other session inserts. Inspect both pages inside the transaction and a fresh read after
commit; merely writing out this schedule is not validation of the supplied hint.
