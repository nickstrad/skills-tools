import { code, type Draft } from "../../../src/types.ts";

export const INDEX_USAGE: Draft = {
  slug: "table-and-index-usage-counters",
  title: "Decide whether a zero-scan index still earns its place",
  tags: ["statistics", "observability", "index-scans", "buffer-cache"],
  reading:
    code`PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 6 "Vacuum and Autovacuum".`,
  difficulty: "intermediate",
  safetyLevel: "ddl",
  runIn: "tool",
  estimatedMinutes: 25,
  revision: 4,
  prerequisites: ["index-scan-vs-seq-scan-crossover", "pg-stat-io-by-backend-type"],
  overview:
    code`A zero scan count describes an observation window, not an index's full responsibility. Compare query plans and scoped counter deltas, then test a uniqueness constraint whose backing index received no query scans. Add a missing workload before proposing an index removal.`,
  caution:
    code`Use the disposable lab only. Setup recreates obs_usage_orders and its indexes. The variation drops one optional index inside a transaction and rolls back; this takes locks and is an experimental comparison, not a production removal procedure. Never remove a uniqueness constraint merely because scan counts are zero.`,
  setup: code`drop table if exists obs_usage_orders;
create table obs_usage_orders(
  id int primary key, request_key text unique not null, customer int, note text)
  with (autovacuum_enabled = off);
insert into obs_usage_orders
select g, 'request-' || g, g%100, repeat('x',100) from generate_series(1,10000) g;
create index obs_usage_customer_idx on obs_usage_orders(customer);
vacuum analyze obs_usage_orders;`,
  code: code`
select pg_stat_force_next_flush();
select pg_stat_clear_snapshot();
create temp table obs_usage_table_before as
select * from pg_stat_user_tables where relid = 'obs_usage_orders'::regclass;
create temp table obs_usage_index_before as
select * from pg_stat_user_indexes where relid = 'obs_usage_orders'::regclass;
select coalesce(stats_reset::text,'') as before_reset from pg_stat_database where datname = current_database() \gset

begin;
set local max_parallel_workers_per_gather = 0;
explain (analyze, buffers, timing off) select sum(length(note)) from obs_usage_orders;
select sum(length(note)) = 1000000 as full_answer_ok from obs_usage_orders;
explain (analyze, buffers, timing off) select note from obs_usage_orders where id=42;
select note = repeat('x',100) as lookup_answer_ok from obs_usage_orders where id=42;
commit;
select pg_stat_force_next_flush();
select pg_stat_clear_snapshot();
select a.seq_scan-b.seq_scan as seq_scans, a.seq_tup_read-b.seq_tup_read as seq_rows,
       a.idx_scan-b.idx_scan as index_scans
from pg_stat_user_tables a join obs_usage_table_before b using(relid);
select a.indexrelname, a.idx_scan-b.idx_scan as query_scans,
       i.indisunique, c.contype, pg_size_pretty(pg_relation_size(a.indexrelid)) as index_size
from pg_stat_user_indexes a join obs_usage_index_before b using(indexrelid)
join pg_index i on i.indexrelid=a.indexrelid
left join pg_constraint c on c.conindid=a.indexrelid and c.conrelid=a.relid
order by a.indexrelname;
select stats_reset is not distinct from nullif(:'before_reset','')::timestamptz
  as database_reset_unchanged from pg_stat_database where datname=current_database();

-- A uniqueness check is useful work even when no query scans that index.
insert into obs_usage_orders values(10001,'request-1',7,'duplicate identity');
\echo Expected duplicate identity SQLSTATE=:SQLSTATE
select count(*) = 10000 as unchanged_rows,
       count(*) filter(where request_key='request-1') = 1 as one_request_identity
from obs_usage_orders;
drop table obs_usage_table_before;
drop table obs_usage_index_before;`,
  expectedResult:
    code`Both answer checks are true. In the supplied PostgreSQL 16 fixture the aggregate uses a sequential scan and the point lookup uses the primary key. Because each query runs once under EXPLAIN and once to show its answer, the table interval records two sequential scans (20000 rows visited) and two primary-key scans. Verify your plans if these counts differ; counters count access operations, not universally one per SQL statement.

The request_key unique index and optional customer index both have query_scans=0 in this window. Catalog metadata distinguishes them: the former has indisunique=true and contype=u; the latter has no constraint. The duplicate insert is deliberately rejected with SQLSTATE 23505, and unchanged_rows/one_request_identity remain true. That is a correctness benefit which query scan counts do not measure.

The reset check must be true. Sizes vary and zero scans do not establish absence of rare jobs, other traffic, past use, replica use or uniqueness enforcement. No conclusion about device I/O follows from buffer hit ratios.`,
  systemsLens:
    code`Optimization needs a workload contract and an invariant inventory. Query telemetry measures one kind of benefit; a database constraint enforces a separate responsibility. Before removing an index, identify the queries, integrity rules, observation interval and write/storage costs it serves. A controlled comparison with an unchanged answer supports a workload decision better than a global unused-index rule.`,
  challenge:
    code`Add customer=7 to the workload. Save its count and ID sum, compare its executed plan with and without the optional customer index inside a transaction, and roll back the drop. Decide whether a frequently used customer lookup changes your recommendation.`,
  syntaxBreakdown: code`
### In plain terms

Run a full-table aggregate and a primary-key lookup, then compare their plans with the counters they produced. Two indexes show no query use. A deliberately rejected duplicate demonstrates why one of those indexes is still necessary for the data contract.

### What you are learning

- Counter deltas describe a bounded workload, not every future caller.
- Uniqueness enforcement is not counted as a query scan.
- An optional index should be evaluated against representative queries and its write/storage cost.

### Piece by piece

- **PRIMARY KEY, UNIQUE NOT NULL and CREATE INDEX** (index responsibilities): The primary key identifies rows, request_key rejects duplicate request identities, and customer has an optional query index. The variation removes only the optional index, then restores it through rollback.
- **generate_series, repeat and %** (controlled data): Make 10000 rows, 100-character notes and 100 customer groups. Customer 7 has 100 rows; a full note-length sum is 1000000.
- **autovacuum_enabled and VACUUM ANALYZE** (fixture preparation): Disable automatic maintenance on this owned table and establish planner statistics explicitly. No shared statistics are reset.
- **pg_stat_force_next_flush and pg_stat_clear_snapshot** (publication and observation): Publish this backend's pending counters at the end of an autocommit statement, then clear its cached observations. Temporary baseline tables retain pre-workload values.
- **pg_stat_user_tables, pg_stat_user_indexes and regclass** (scope): Resolve the owned table's identity and compare relid/indexrelid deltas. seq_tup_read counts tuples visited, while idx_scan counts index searches; neither is a universal SQL-statement counter.
- **pg_stat_database.stats_reset and \gset** (interval check): Save the database reset timestamp as a psql variable. NULL can mean no recorded reset; nullif and IS NOT DISTINCT FROM compare nullable timestamps. An unchanged database epoch does not detect every targeted table/index reset; use a quiet owned fixture without concurrent resets.
- **SET LOCAL and EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)** (controlled plans): Disable parallel workers only in this transaction. Execute the plan with buffer counts and without per-node clock measurement, then repeat the query to expose its answer. COMMIT restores the prior setting.
- **pg_index, pg_constraint and LEFT JOIN** (integrity evidence): indisunique identifies unique indexes; contype=p or u identifies a primary-key or unique constraint. Keeping rows without constraints makes the optional index visible too.
- **pg_relation_size and pg_size_pretty** (footprint): Report current index bytes in readable units. Size alone does not quantify write amplification or prove an index is expendable.
- **\echo :SQLSTATE and FILTER** (outcome checks): Print the duplicate failure's 23505 code immediately, then verify the original row count and one retained request identity.
- **CREATE TEMP TABLE, DROP INDEX and ROLLBACK** (variation): Save count and ID sum, drop only obs_usage_customer_idx inside BEGIN, and compare the same answer and query work. ROLLBACK restores that index; to_regclass checks its presence.
`,
};

export const INDEX_USAGE_VARIATION = INDEX_USAGE.setup + code`
create temp table obs_customer_answer as
select count(*) as n, sum(id) as id_sum from obs_usage_orders where customer=7;
begin;
set local max_parallel_workers_per_gather = 0;
set local lock_timeout = '1s';
set local statement_timeout = '10s';
explain (analyze, buffers, timing off)
select count(*), sum(id) from obs_usage_orders where customer=7;
drop index obs_usage_customer_idx;
explain (analyze, buffers, timing off)
select count(*), sum(id) from obs_usage_orders where customer=7;
select a.n=100 and a.n=b.n and a.id_sum=b.id_sum as unchanged_answer, b.n, b.id_sum
from obs_customer_answer a cross join
  (select count(*) as n, sum(id) as id_sum from obs_usage_orders where customer=7) b;
rollback;
select to_regclass('obs_usage_customer_idx') is not null as optional_index_restored;
drop table obs_customer_answer;`;
