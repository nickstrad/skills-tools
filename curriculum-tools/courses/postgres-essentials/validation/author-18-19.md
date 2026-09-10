# Lessons 18–19 author validation

Validated 2026-09-10 with PostgreSQL 16.15 in the owned Unix-socket-only cluster
`/tmp/pg-essentials-validation-indexes-20260910c` on port 55439. The cluster used 32 MB
`shared_buffers`, no backup, replica or archive, and was stopped and removed after the run. The root
filesystem had 16 GB free afterward. The executed statement inventory is `author-18-19.sql`;
`author-18-19.log` is the compact raw output.

Source SHA-256: `2739f8c44cef8106da0c804501233264b7c60415442a0e83b13957de910b60db` for
`curriculum/15-index-choice.ts`. Executed SQL SHA-256:
`a47891b666fd86e8a6bbf42a07d36ef79e5600a0d601dae5336c09699e2fdba6`. Raw output SHA-256:
`67963d513cafe1381f63f827a3d55c9cf63cd3772ed9c3e51d04603bdd1d1e0e`.

This author-stage statement inventory records prototype behavior. The primary standalone and
full-catalog source manifests establish final-source acceptance after review edits; the author
source hash above is not a claim that later lesson text is byte-identical.

## Measured outcomes

- Lesson 18 core: `phase_narrow_range` used `Index Scan` with estimated/actual rows `10/10`, one
  loop and 3 execution buffers. `phase_broad_range` used `Seq Scan` with estimated/actual rows
  `94871/95000`, one loop, `Rows Removed by Filter: 5000`, and 6,667 execution buffers. The original
  80,000-row broad predicate selected an Index Scan because the heap was perfectly correlated with
  `id`; changing only the broad bound to 95,000 produced the designed natural crossover without
  disabling a scan type.
- Lesson 18 independent variation: a freshly recreated fixture at 20,000 rows used `Index Scan`,
  estimated/actual rows `19988/20000`, one loop and 1,390 execution buffers. The lesson permits
  another scan choice at this medium selectivity and asks the learner to interpret it.
- Lesson 19 core: both identical queries returned 10 rows through `Limit`, used backward index scans
  and had no Sort. The time-first index displayed `tenant_id = 1` as an `Index Cond` but accessed
  384 execution buffers; the tenant-first index accessed 4. This is why the lesson does not equate
  the printed condition with a narrow leading-key search or claim filtered-row output.
- Lesson 19 independent variation: both ascending queries returned 10 rows through `Limit`, used
  forward index scans and had no Sort. The time-first index accessed 383 execution buffers and the
  tenant-first index accessed 4.

There were no SQL errors. Every core and variation dropped its fixture before restoring timeout
guards. The first attempted validation cluster never executed SQL because the postgres OS user could
not traverse `/root`; its owned root was nevertheless stopped/removed, and the accepted run used a
readable temporary SQL copy. Sandbox policy prevented the author process from connecting to the
protected learner socket for a final read-only readiness query; primary acceptance should make that
global check. No learner table, cluster, or progress database was written.

Primary cleanup correction: the earlier unsuffixed prototype root remained live despite retirement
of the suffix-c run. Final primary inventory verified it idle, stopped it normally and removed it,
reclaiming47 MiB. See batch-five-cleanup.json; all attempts are now retired.
