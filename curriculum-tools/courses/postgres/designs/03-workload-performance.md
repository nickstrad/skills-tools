# Chunk 3: measured workload decisions

Execution update, 2026-09-04: the user stopped parallel implementation. The primary now owns the
remaining implementation, corrections, review and integration sequentially. The private planner and
index drafts below are retained as review inputs; their old assignments are historical. Agents may
only receive bounded verification tasks. The experiment requirements below still apply.

Primary contract,2026-09-04. Implement in private copies while chunk2 integrates. Preserve original
slugs unless retirement is explicit below. Existing material changes revision4; new lessons
revision1. No root generated builds or commits by agents. No cluster settings/restarts or learner
progress. Use current AUTHORING, knowledge and learner-article notes; article analogies are
motivation, not proof.

## Planner subset: 11-planner.ts, guides/11-planner.ts, validation/03-planner.md

Keep seven existing mechanisms and their order. Each lesson needs specific prediction/evidence/
explanation/variation/application prompts with a runnable hint2. Supply core code; learner autonomy
is choosing a diagnosis and defending one changed variable. Do not claim an aggregate is a trace.

- explain-analyze-buffers: state a question about a bounded query's work. Distinguish estimated
  rows, actual rows, loops, total execution time, and cumulative buffer activity. ANALYZE executes
  side effects. Add an explicit unchanged-answer check around a controlled index or query change.
- statistics-drive-plans: retain stale/distribution/correlation evidence. Extend with a skewed
  prepared query on an explicitly indexed tenant key (frequent tenant vs rare tenant, payload needed
  so covering access cannot hide heap cost). Compare force_custom_plan and force_generic_plan using
  PREPARE/EXPLAIN EXECUTE; both answers must agree. This is a controlled plan-sensitivity
  experiment, not a claim that auto always chooses one policy. RESET and DEALLOCATE at end. Keep
  data at100k rows or less, report work/counters rather than a universal speedup.
- index-scan-vs-seq-scan-crossover: default planner first; small and broad selectivity, same query
  semantics. Forced paths only as hypothesis tests, then RESET. Vary selectivity or row width, not
  both. Connect to workload choice rather than advice to disable scans globally.
- join-strategies: compare the same joined answer under distinct join methods with local controls.
  Count join output and inner loops; distinguish bad row estimate from the algorithm's work.
- work-mem-spills-to-disk: bounded sort/hash input; low/high session work_mem, same answer/order,
  spill evidence. Explain budget per operation/worker, not per connection or whole server. Reset.
- parallel-query: workers planned vs launched, actual local limits, same answer. No unconditional
  speedup. Supply fallback interpretation when workers unavailable; do not change shared settings.
- pg-stat-statements-as-tracing: rename title/prose to aggregate workload telemetry; normalized
  totals cannot establish p99, per-request order or a trace. Capture deltas for owned
  queryid/user/db without resetting shared cluster stats. Repeat a controlled workload and join
  aggregate work to its client-observed duration; leave proper percentile/capacity sweep to
  primary's later synthesis.

Validate every changed core and exact rendered variation/hint. Use pivot_storage; avoid measuring
while another benchmark runs. Record errors, output invariants and resource limits, not just harness
completed counts. Keep changes private until primary requests transfer.

## Index subset: 12-indexes.ts, guides/12-indexes.ts, validation/03-indexes.md

- btree-page-anatomy: keep metapage/root/leaf inspection, add one controlled key-width comparison
  with equal row count/indexed key uniqueness and report index pages/levels. Avoid fixed fanout.
- Retire index-only-scan-needs-visibility-map, whose vacuum cycle already exists earlier. Move its
  missing-column projection contrast into partial-and-covering-indexes. Update only owned backward
  prerequisites; report external references for primary. Record retirement coverage explicitly.
- create-index-concurrently-and-invalid-indexes: keep the actual two-session phase wait and invalid
  build failure. Check indisready/indisvalid, clean only owned invalid index, demonstrate successful
  retry. Explain failure and usable-state checks; broader bounded migration is primary-owned.
- partial-and-covering-indexes: frequent narrow pending-job predicate vs complete table, included
  payload vs missing payload. Same-result checks and index sizes. Include controlled update costs
  (HOT eligibility/counter deltas or WAL already taught at current order), without claiming that a
  larger covering index is automatically best. Preserve visibility prerequisite by surviving slug.
- index-bloat-from-churn: preserve anatomy but qualify steady-state/rebuild claims. Measure same
  bounded range query and index size before/after rebuilding; unchanged rows. Rebuild justified by
  workload evidence and availability cost, not one density number. Prereq vacuum-reclaims-in-place.
- unique-index-enforcement-under-concurrency: retain conditional uniqueness, rename lease framing to
  one-active-owner invariant. Demonstrate reject competing active entry and allow historical
  inactive rows. This is not a timed lease or stale external-writer protection. Avoid repeating a
  full worker lifecycle now supplied by worker-protocol.ts.
- Append new keyset-pagination-and-concurrent-writes,revision1,session2. Use100k ordered rows with
  nonunique sort timestamps and a unique id tie-breaker plus composite B-tree(created_at,id).
  Compare deep OFFSET and keyset from the same previously acquired boundary, assert matching rows,
  inspect rows visited/buffers; explain cursor acquisition is separate and keyset cannot jump to an
  arbitrary page for free. A reads first5 rows and saves actual last(created_at,id); B inserts a row
  sorting before them; A's OFFSET5 page repeats an item while keyset > saved pair continues. All
  reads autocommit READ COMMITTED. State keyset does not supply a stable snapshot across deletions
  or updates to sort keys. Variation fixes snapshot in RR and repeats insertion; explicit cleanup.

Use pivot_visibility for SQL correctness, coordinate benchmarks with planner agent. Keep root files
untouched until transfer. Return built/typecheck evidence and real core/variation output. Primary
will audit benchmark methodology, arrange final ordering and implement capacity/migration synthesis.

## Primary capacity implementation, 2026-09-05

Replace the old connection-saturation cluster-exhaustion/restart exercise with a bounded measured
workload, preserving its slug at revision4. This is primary-owned sequential implementation.

- Supplied shell/Python driver uses psql and pgbench against explicit lab PG connection variables.
  It creates one uniquely named schema and an evidence directory; cleanup drops only that schema.
- One transaction increments a shared counter and holds its row lock for5ms before committing.
  Run1,2,4,8 closed-loop clients for400 total transactions per trial, two rounds in reverse order.
  Keep the pgbench thread count fixed at1; do not vary generator threads with client count. The
  fixture isolates a serialized service point, not general PostgreSQL maximum capacity.
- Retain per-transaction pgbench logs, summary output and scoped wait samples. Parse the log's
  latency microseconds; report empirical median/p95/p99, pgbench throughput and failures per trial.
  Assert400 log successes, zero failures and exactly400 durable counter increments per run.
- Bound each run to30 seconds, terminate only its owned pgbench process on failure and clean up the
  generated schema. No global settings, restarts, connection-slot exhaustion or global resets.
- Distinguish concurrency from hard admission capacity, measured service time from scheduling waits,
  and closed-loop latency from an external fixed arrival rate. Small tail samples and an observer
  sharing the machine limit inference; no universal throughput or production pool-size advice.
- Variation changes only lock-hold time to1ms and reruns the same matrix. Provide exact invocation
  and explain all supporting commands. Execute both extracted core and variation, inspect counters,
  log failures and wait evidence, then integrate and commit/push with handoff and durable findings.

## Primary bounded migration synthesis, 2026-09-05

Add bounded-online-migration after the concurrent-index lesson, revision1. Two persistent sessions,
owned mig_jobs table and mig_bridge trigger function; setup drops/recreates only these objects.

- Start with1,000 jobs storing priority_text. B holds a row lock; A's short-budget ADD COLUMN fails
  with55P03, then rolls back. Release B and retry in a short transaction that atomically adds
  priority_int and a BEFORE-write compatibility trigger. Legacy text remains canonical during this
  phase; malformed input rejects the write and no conflicting dual-write policy is implied.
- Add a CHECK(priority_int IS NOT NULL) NOT VALID in a bounded DDL transaction. New/updated rows
  must satisfy it while historical rows may still be null. B inserts a new legacy-format row and
  verifies the trigger populated priority_int, then holds old row1 locked.
- A uses supplied psql gexec to execute11 independent100-row SKIP LOCKED backfill batches in
  autocommit. B's lock leaves row1 unfilled; the final empty batch is not completion. Query
  remaining nulls and deliberately attempt validation, which must fail23514 without marking the
  check valid.
- Release B, execute one final batch and validate the check. Set NOT NULL under a short lock budget
  with the valid check retained; explain PostgreSQL's documented scan avoidance separately from
  measured lock/file observations. Validate row count, equality with canonical text and catalog
  state.
- Keep the compatibility bridge and old column: retiring them needs a writer/read-contract rollout
  outside this lab. Do not claim one synchronous trigger is an independent application deployment.
- Exact variation supplies a bounded retention deletion over a fixed id cutoff using the same
  separately committed batches and a held eligible row. Empty work is again not complete; after
  releasing the holder, delete the remaining row and assert only the intended id range remains. No
  automatic claim that deleting rows shrinks the physical file or achieves an archival policy.
