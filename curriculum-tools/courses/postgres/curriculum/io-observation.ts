import { code, type Draft } from "../../../src/types.ts";

function experiment(rows: number): string {
  return code`
show shared_buffers;
show track_io_timing;
show block_size;
-- Publish our own preceding work; this does not flush other backends' pending statistics.
select pg_stat_force_next_flush();
select pg_stat_clear_snapshot();
create temp table obs_io_snap as select 'before_load'::text as phase, s.* from pg_stat_io s;
insert into obs_io_load select g, repeat('x',700) from generate_series(1,` + rows + code`) g;
select pg_stat_force_next_flush();
select pg_stat_clear_snapshot();
insert into obs_io_snap select 'after_load', s.* from pg_stat_io s;
select pg_relation_size('obs_io_load') as heap_bytes,
       pg_size_bytes(current_setting('shared_buffers')) / 4 as quarter_cache_bytes,
       pg_relation_size('obs_io_load') > pg_size_bytes(current_setting('shared_buffers')) / 4
         as larger_than_quarter_cache;

-- Two identical aggregate scans: one records the plan, the other exposes the answer.
-- Local settings revert at COMMIT, including on ROLLBACK after an error.
begin;
set local max_parallel_workers_per_gather = 0;
set local statement_timeout = '30s';
explain (analyze, buffers, timing off) select count(*), sum(length(pad)) from obs_io_load;
select count(*) as rows, sum(length(pad)) as payload_bytes,
       count(*) = ` + rows + code` and sum(length(pad)) = ` + (rows * 700) + code` as answer_ok
from obs_io_load;
commit;
select pg_stat_force_next_flush();
select pg_stat_clear_snapshot();
insert into obs_io_snap select 'after_scan', s.* from pg_stat_io s;

select phases.label, a.backend_type, a.object, a.context,
       a.stats_reset = b.stats_reset as same_reset_epoch,
       a.op_bytes, a.reads-b.reads as reads, a.hits-b.hits as hits,
       a.writes-b.writes as writes, a.extends-b.extends as extends,
       a.evictions-b.evictions as evictions, a.reuses-b.reuses as reuses,
       (a.reads-b.reads)*a.op_bytes as read_bytes_from_os
from (values ('load','before_load','after_load'), ('scan','after_load','after_scan'))
     as phases(label,start_phase,end_phase)
join obs_io_snap b on b.phase = phases.start_phase
join obs_io_snap a on a.phase = phases.end_phase
  and (a.backend_type,a.object,a.context) = (b.backend_type,b.object,b.context)
where a.object = 'relation'
  and (a.reads is distinct from b.reads or a.hits is distinct from b.hits
    or a.writes is distinct from b.writes or a.extends is distinct from b.extends
    or a.reuses is distinct from b.reuses or a.evictions is distinct from b.evictions
    or a.stats_reset is distinct from b.stats_reset)
order by phases.label, a.backend_type, a.context;
select bool_and(a.stats_reset = b.stats_reset) as all_reset_epochs_unchanged
from obs_io_snap a join obs_io_snap b using(backend_type,object,context)
where a.phase = 'after_scan' and b.phase = 'before_load';
drop table obs_io_snap;
drop table obs_io_load;`;
}

export const IO_OBSERVATION: Draft = {
  slug: "pg-stat-io-by-backend-type",
  title: "Attribute I/O counters without inventing disk latency",
  tags: ["pg-stat-io", "buffer-cache", "observability", "checkpoints"],
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 9 "Buffer Cache".`,
  difficulty: "intermediate",
  safetyLevel: "ddl",
  runIn: "tool",
  estimatedMinutes: 25,
  revision: 4,
  prerequisites: ["buffer-cache-and-io", "checkpoint-anatomy"],
  overview:
    code`An I/O counter is useful only if you know its scope and interval. Compare relation growth during loading with two subsequent scans, join PostgreSQL 16's backend/object/context counters to the actual query plan, and decide which conclusions need operating-system evidence.`,
  caution:
    code`Use the PostgreSQL 16 lab with its 128MB shared_buffers setting and no competing workload. The core creates about 71MB of heap data; the variation about 7MB. Counters are cluster-wide, even when your table and database are private. If reset epochs change, discard that measurement and rerun; never reset the cluster's statistics to make the numbers tidy.`,
  setup: code`drop table if exists obs_io_load;
create table obs_io_load(id int, pad text) with (autovacuum_enabled = off);`,
  code: experiment(100000),
  expectedResult:
    code`The core returns rows=100000, payload_bytes=70000000 and answer_ok=true. In the 128MB lab its heap is larger than one quarter of shared_buffers. The variation returns rows=10000 and payload_bytes=7000000, also answer_ok=true, and its heap is below that boundary.

The load interval shows client relation extension and buffer activity. The large scan uses a sequential plan and records client bulkread activity; the small-table variation uses normal buffer activity. All reset checks must be true. Preserve blank cells: they mean the operation is not applicable to that row, not a measured zero.

Reads, hits, writes, evictions and reuses depend on existing cache state and background work. Reads can be zero when pages remain cached. The scan interval includes two aggregate executions plus small observation overhead; it is not one request's exact trace. EXPLAIN's shared reads count PostgreSQL buffer misses, and read_bytes_from_os describes read requests to the operating system, whose cache may satisfy them without device I/O.`,
  systemsLens:
    code`Metric dimensions determine attribution limits. pg_stat_io aggregates all databases and processes of each backend type, while a query plan narrows evidence to one execution. Joining these perspectives supports a hypothesis; it does not turn cluster totals into per-request device latency. Use OS/device telemetry and a defined application workload before proposing storage or memory changes.`,
  challenge:
    code`Change only the loaded row count from 100000 to 10000 and repeat the supplied measurement. Compare the relation-size boundary, scan context and buffer activity. Do not change cache settings or clear OS caches.`,
  syntaxBreakdown: code`
### In plain terms

Take counter snapshots around loading and scanning an owned table. The resulting differences tell you which PostgreSQL process types used which buffer strategies. A smaller table tests whether that strategy changes while the aggregate query stays the same.

### What you are learning

- Counter intervals and reset epochs are part of the measurement.
- PostgreSQL buffer misses are not necessarily storage-device reads.
- The bulkread strategy can limit a large sequential scan's disruption of shared buffers.

### Piece by piece

- **autovacuum_enabled = off** (owned-table setting): Keeps automatic table maintenance out of this short fixture; the table is dropped at the end. It does not stop other tables' maintenance from contributing cluster counters.
- **SHOW shared_buffers, track_io_timing and block_size** (configuration): Report the shared cache size, whether I/O durations are collected, and database block size. The experiment uses operation counts and op_bytes instead of assuming that timing is enabled or every operation is 8192 bytes.
- **pg_stat_force_next_flush()** (statistics publication): Requests that this backend publish pending statistics at the end of the current transaction. Each call here is an independent autocommit statement. It neither flushes every backend nor writes dirty relation pages to disk.
- **pg_stat_clear_snapshot()** (statistics refresh): Discards this session's cached observations before capturing the next snapshot. It does not reset counters.
- **CREATE TEMP TABLE ... AS and pg_stat_io** (snapshot storage and view): Save the cluster matrix under named phases. backend_type identifies the actor class, object identifies relation type, and context identifies its buffer strategy; no database or relation ID is available in this view.
- **generate_series and repeat** (controlled input): Create a fixed number of rows with 700-character payloads. Only row count changes in the variation.
- **pg_relation_size, pg_size_bytes and current_setting** (size comparison): Compare actual heap bytes with a quarter of the configured shared cache. This supports interpretation of the scan strategy in this lab.
- **SET LOCAL, BEGIN and COMMIT** (temporary controls): Disable parallel scan workers and bound each scan statement to 30 seconds inside one transaction. Commit or rollback restores the caller's original settings.
- **EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)** (executed plan): ANALYZE runs the aggregate, BUFFERS reports buffer activity, and TIMING OFF avoids per-node clock overhead while retaining counts. A second identical SELECT exposes the answer; both scans belong to the measured interval.
- **VALUES, joins and IS DISTINCT FROM** (delta construction): Pair each start/end snapshot using all three dimensions. Null-aware comparisons retain changed counters or reset epochs without converting nonapplicable values into zeros.
- **stats_reset, op_bytes and bool_and** (validity and units): Equal reset timestamps are necessary for subtraction. Multiply reads by op_bytes for requested bytes; bool_and checks every matched row's epoch. Discard an interval after any reset.
- **DROP TABLE** (cleanup): Remove the temporary observations and owned workload table after recording the result.
`,
};
export const IO_VARIATION = IO_OBSERVATION.setup + "\n" + experiment(10000);
