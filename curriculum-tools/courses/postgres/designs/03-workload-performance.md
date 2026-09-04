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
