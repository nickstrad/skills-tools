# PostgreSQL observability evidence

Use these findings when designing monitoring experiments or interpreting their results. Verified
2026-09-05 against PostgreSQL16.15 during the course's observability refactor.

## What happened

The old lessons equated a NULL wait event with CPU execution, treated cluster I/O counters as one
workload's device activity, and described a zero-scan index as unnecessary. Their replacements use
owned client identities, bounded sample windows, explicit counter intervals, catalog constraints and
independent transaction-outcome checks. A completed UPDATE appears in both the commit and rollback
log experiments, but the final stored values differ.

A runtime check also found that psql's gset unsets a variable when its column is NULL. An unchanged
statistics reset timestamp can legitimately be NULL; substituting the unset variable then caused a
SQL syntax error that the harness did not classify as a failure.

## Why it matters

Observability is evidence with a scope, publication boundary and retention policy. If a lesson
ignores those limits it teaches an incorrect diagnosis even when its SQL prints plausible values. A
log line about statement completion, a scan counter and a wait sample answer different questions
from committed application state, integrity responsibility and end-to-end latency.

## How to apply

- Register exact owned client PIDs before their long transactions. Join state, wait event and
  blocker edges; a sleeping lock holder still obstructs a writer. Clear cached activity snapshots
  within a polling transaction and fail when a bounded readiness condition is missed. NULL means no
  reported instrumented wait, not proof of scheduled CPU time. Sample shares describe their
  collection window, not request latency. See the official
  [statistics and activity documentation](https://www.postgresql.org/docs/16/monitoring-stats.html).
- Publish the generating backend's pending statistics with pg_stat_force_next_flush in an autocommit
  statement before capturing a new interval. Clear observer caches separately. Neither operation
  resets counters or forces every other backend to publish. Keep pg_stat_io dimensions, op_bytes,
  reset epochs and nonapplicable NULLs. Cluster scope includes other databases and background work;
  PostgreSQL reads can be served by the OS cache.
- When saving nullable values with gset, first coalesce their text representation to an explicit
  sentinel, then restore NULL with nullif for comparison. Avoid silently treating NULL as a measured
  zero. This is documented under
  [psql gset](https://www.postgresql.org/docs/16/app-psql.html#APP-PSQL-META-COMMAND-GSET).
- Inspect actual plans before claiming one SQL statement equals one scan. Pair query-use deltas with
  pg_index and pg_constraint metadata. A unique index can reject a duplicate while its query scan
  count stays zero. Adding an omitted workload and comparing the same answer under a rolled-back
  optional-index removal makes a better decision exercise than a blanket drop rule.
- A statement deadline inside BEGIN produces cancellation followed by a failed transaction until
  ROLLBACK. In autocommit, an earlier successful statement remains committed. An idle-transaction
  deadline destroys the connection and its uncommitted work. Observe actual backend disappearance,
  released locks, stored rows and new versus surviving PIDs; do not infer cleanup from sleep alone.
  See [client timeout settings](https://www.postgresql.org/docs/16/runtime-config-client.html).
- Capture pg_current_logfile and byte offset before the event. Poll a bounded appended range for the
  owned writer's event, reject changed files/truncation/oversized windows, and retain continuation
  lines. Join the PID and transaction decision to an independent final read. A completed UPDATE can
  be rolled back; server logging does not prove an external effect or that a caller received an
  acknowledgement. File-reading functions are documented in
  [administration functions](https://www.postgresql.org/docs/16/functions-admin.html).
- Execute the exact coaching hint rendered from a refreshed copied lesson catalog. pgcoach reads
  lesson text through the tutor database: changing generated lessons.json alone does not refresh an
  existing catalog. The learner's explicit pgtutor init refreshes lesson metadata while retaining
  recorded progress; author validation must use --db with a scratch copy. Do not mistake new guide
  prompts paired with stale database lesson text for a tested learner experience.
