# Planner validation

Private PostgreSQL 16.15 validation on 2026-09-04 used `pivot_storage` at the supplied socket and
port. This report records completed planner subphases; later subphases append their evidence.

## Explain, actual work, and buffers

`deno run -A tools/validate.ts postgres explain-analyze-buffers` ran without errors.

- The baseline cancelled-order scan estimated 127 rows and returned 100, with 1,031 shared hits.
- The controlled status-index stage returned `unchanged_answer = true`; its index scan returned the
  same 100 rows with 102 shared hits. The index was dropped before the primary-key and aggregate
  observations.
- The rollback check reported `rows_actually_updated = 100` and `rows_after_rollback = 0`.

## Index/sequence crossover

`deno run -A tools/validate.ts postgres index-scan-vs-seq-scan-crossover` ran without errors.

- At 0.1% selectivity, the bitmap path returned 100 rows with 23 shared hits; at 50%, it returned
  50,000 rows with 537 hits and 47 reads; at 80%, the default plan was a sequential scan returning
  80,000 rows with 1,031 hits.
- The forced half-table plain index scan touched 50,049 shared buffers, which distinguishes its work
  from the default bitmap path. With bitmap scans disabled, changing only random_page_cost changed
  the same `customer_id <= 50` plan from sequential to index scan.
- The answer check after all session setting resets printed `unchanged_answer = true`.

Raw output: `/tmp/pg-pivot-planner-subphase1.log`. Private `deno fmt`, `deno check`, and build
succeeded; the private build contained 93 lessons due to concurrent integrated retirements.

## Joins and work memory

`join-strategies` and `work-mem-spills-to-disk` ran without errors in
`/tmp/pg-pivot-planner-subphase2.log`.

- The full join returned 100,000 rows under hash, merge, nested-loop, and low-memory hash paths;
  `unchanged_join_answer = true`. The selective nested-loop inner index scan showed
  `rows=1,
  loops=100`; the full nested-loop Memoize node showed 95,000 hits and 5,000 misses.
  Low-memory hash evidence was `Batches: 4` and `temp read=236 written=236`.
- The sort kept the same input count and amount sum (`unchanged_input = true`). At 32MB it used
  quicksort; at 4MB and 64kB it used external merge, with the latter reading/writing 2,320/2,514
  temporary blocks. The hash aggregate reported 21 batches and 3,368kB disk use. All local planner
  and work-memory settings reset before the final input check.

## Parallelism and aggregate telemetry

`parallel-query` and `pg-stat-statements-as-tracing` ran without errors in
`/tmp/pg-pivot-planner-subphase3-final.log`.

- The serial count scanned 100,000 rows. The enabled plan requested and launched four workers;
  limiting the pool produced `Workers Planned: 4` and `Workers Launched: 1`. The ordered case used
  Gather Merge with four launched workers. Client timings ranged from about 14–18 ms serial and
  18–21 ms parallel on this one-core lab, while `unchanged_answer = true` and the final
  parallel-worker count was zero.
- The telemetry lesson did not reset shared statistics. Its first user/database-scoped delta had
  three rows: the join (`calls_delta = 1`, `exec_ms_delta = 35.88`), cancelled count (1, 21.68), and
  normalized customer count (3, 0.25). `\\timing` printed the client durations for every workload
  command. The second scoped interval reported the mixed customer predicate with `calls_delta = 4`
  and separate two- and three-item IN fingerprints with `calls_delta = 1` each; track_planning was
  `off` and max was 5000.

## Full private sequence

After regenerating the private lesson objects, the seven planner slugs ran together without an error
or timeout. The final run is `/tmp/pg-pivot-planner-full.log`; it reproduced all answer checks, plan
shapes, spill evidence, worker counts, and scoped telemetry deltas above.

## Exact rendered guide hints

After each lesson's own setup (and, for the prepared-plan guide, a fresh 100,000-row `pl_tenant`
fixture matching its core), I executed the second rendered hint exactly as it appears in
`guides/11-planner.ts`. The scripts are under `/tmp/pg-pivot-planner-hints/` and raw output is in
`/tmp/pg-pivot-planner-hint-*.log`.

- `explain-analyze-buffers` returned `unchanged_answer = true`, used the status index for 100 rows
  and 102 shared hits, then dropped that temporary index.
- `statistics-drive-plans` showed a custom sequential scan for tenant 1 (90,000 actual rows), a
  custom index scan for tenant 999 (10 rows), and generic index scans for both. It printed `RESET`
  and `DEALLOCATE`.
- `index-scan-vs-seq-scan-crossover` produced a 100-row bitmap path at `customer_id <= 5` and an
  80,000-row sequential scan at `<= 4000`; it changes no session setting.
- `join-strategies` returned `unchanged_answer = true`. With only hash joins disabled it used a
  parallel nested loop, then printed `RESET enable_hashjoin`.
- `work-mem-spills-to-disk` returned `unchanged_input = true`; the 64kB per-operation setting
  spilled both participant sorts (3,408kB leader and 2,824kB worker) and printed `RESET work_mem`.
- `parallel-query` preserved its count and showed serial execution at a zero per-Gather limit,
  followed by four planned and four launched workers. It reset all four local parallel-planning
  settings before `unchanged_answer = true`.
- `pg-stat-statements-as-tracing` created a session-local baseline, timed the one lookup at 0.856ms
  in this run, and reported one current-user/current-database queryid delta. `\\timing off` restored
  client display state; its temporary table vanished with the psql session. No shared statistics
  reset occurred.

## Primary acceptance, 2026-09-05

The primary took over implementation sequentially and reviewed every source field and guide. This
supersedes the earlier draft's guide descriptions. Seven individually authored guides now ask
mechanism-specific prediction, evidence, explanation and workload-decision questions. Core fixes
include restoring session settings, explicit hash_mem_multiplier, moving the tenant fixture into
setup, correcting sampled/fixed-value claims, and separating top-level scoped statement deltas from
lifetime aggregate fields. The memory lesson consolidates log-reading into later observability and
uses explicit statistics publication/refresh boundaries for its database counter deltas.

The full seven-lesson core ran on PostgreSQL16.15 in pivot_storage. Output:
`/tmp/pg-planner-primary-20260905.log`. No SQL errors or timeouts appeared. The first sandbox
attempt could not access the Unix socket; the authorized elevated rerun produced this evidence.

- All unchanged-answer/input checks were true. The write/rollback experiment observed100 changed
  rows inside its transaction and0 remaining after rollback.
- Custom/generic prepared plans returned90,000 frequent-tenant and10 rare-tenant payload rows;
  generic estimated about102 for either value.
- Low memory exposed sort/hash spills. Published database deltas were3 temporary files and
  16,113,664 bytes; these are database totals for the interval, not isolated per-query totals.
- Parallel execution showed4 planned/4 launched and then4 planned/1 launched; answers stayed fixed.
- Aggregate telemetry reported expected scoped call increments and interval_retained=true.

Every final hint was extracted directly from guides/11-planner.ts and executed with only its own
lesson setup using psql -X -v ON_ERROR_STOP=1. Scripts and logs: `/tmp/pg-planner-exact-20260905/`.
All seven completed without SQL errors.

- Cost variation: the same cancelled predicate returned100 while its modeled page cost changed.
- Statistics target variation: actual cancelled100; larger-sample estimate100 in this run; ordinary
  analysis followed after the local target expired.
- Selectivity variation:100 versus80,000 rows with bitmap versus sequential access.
- Memoize variation: the first attempt changed join order, so it did not isolate the repeated inner
  customer lookup. Primary added an explained LATERAL/OFFSET0 barrier and reran the exact hint.
  Corrected output:95,000 cache hits/5,000 misses and5,000 customer index loops with Memoize;
  100,000 customer loops without it; unchanged_answer=true. This is an experimental barrier, not a
  proposed production query rewrite.
- Sort variation:64kB external merge (6,208kB disk) versus32MB quicksort (10,885kB memory);
  unchanged_last_id=true using the identical full-row projection.
- Parallel variation: requested1 and4 workers, inspected actual launch counts;
  unchanged_answer=true.
- Telemetry variation: exactly two literal lookups produced one calls_delta=2 entry and
  interval_retained=true; no shared reset, temporary baseline explicitly removed.

Build retains94 lessons and seven reading stops. Source/guide lint, formatting and type checks pass;
30 engine, validation and coaching tests pass. First seven built lesson objects remain exactly equal
to the pre-refactor baseline. Refreshing a copy of learner progress preserves all previous IDs,
progress and attempts, keeps first seven completed, and selects lesson8 in coaching. The real
progress SHA256 remains c7866ba1b78cb7b2aa6c1a2951149cd14c278130f92333c1e5b8dffd063f128f.

Index integration, capacity/migration/observability and the final performance ordering are still
pending. Accepting this section does not mark chunk3 or the overall refactor complete.
