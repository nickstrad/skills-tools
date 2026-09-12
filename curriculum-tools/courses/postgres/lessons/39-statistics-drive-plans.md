# Where row estimates come from, and three ways they go wrong

slug: statistics-drive-plans
category: query-planning
difficulty: intermediate
tags: statistics, query-planning, explain
prerequisites: explain-analyze-buffers
safety: ddl
run-in: tool
sessions: 1
min-version: 16
minutes: 35
revision: 4

## Overview
Planner statistics summarize data that may be missing, stale or correlated. Cause each case and
compare estimated rows with known answers before choosing a statistics fix. Then hold a skewed
tenant workload fixed while comparing parameter-specific and generic prepared plans.

## Syntax breakdown
### In plain terms

The planner does not inspect every row each time it chooses a plan; it consults summaries produced
by ANALYZE. You will see how missing or stale summaries lead to bad row guesses, and how a known
relationship between two columns defeats the default assumption that they are independent. This
matters because a wrong row count can make PostgreSQL choose an expensive join or scan strategy.

### What you are learning

- **Sampling:** ANALYZE examines a sample rather than the entire table, trading exactness for a cheap refresh.
- **Column statistics:** Frequencies, histograms, distinct counts, and physical correlation describe a column's shape.
- **Stale statistics:** Data can change long before the planner's stored summary does, so estimates can lag reality.
- **Extended statistics:** Dependencies and distinct-count information teach the planner about correlated columns.

### Piece by piece

- **ANALYZE** (statistics-maintenance command)
  - What it is: It samples table rows and stores planner statistics.
  - What it does here: It first analyzes pl_orders and later refreshes pl_fresh and pl_geo after data changes or extended-statistics creation.
  - What it gives us: Updated reltuples and entries in pg_stats; the sample means estimates can vary slightly.
- **default_statistics_target** (planner-statistics setting)
  - What it is: A target controlling the amount of statistics collected.
  - What it does here: Its default value determines the usual sample size; the challenge raises it to test accuracy and planning overhead.
  - What it gives us: Larger MCV and histogram summaries, at the cost of more analysis and possibly planning work.
- **pg_class.relpages and reltuples** (system catalog columns)
  - What they are: Approximate physical page and row counts for a relation.
  - What they do here: They reveal reltuples = -1 before pl_fresh is analyzed and show how ANALYZE refreshes the table estimate.
  - What they give us: The baseline row count the planner multiplies by selectivity.
- **EXPLAIN (ANALYZE, TIMING OFF, SUMMARY OFF)** (plan command and options)
  - What it is: It runs the query, suppresses per-node timing, and omits the footer.
  - What it does here: It keeps attention on estimated rows versus actual rows for missing, stale, and extended statistics.
  - What it gives us: The rows= estimate beside actual rows, plus filter rows removed.
- **pg_stats** (readable statistics view)
  - What it is: A view over PostgreSQL's per-column statistics catalog.
  - What it does here: It shows null_frac, avg_width, n_distinct, most_common_vals, most_common_freqs, histogram_bounds, and correlation for selected columns.
  - What it gives us: The stored evidence behind an estimate; MCV frequency multiplied by reltuples approximates expected rows.
- **most_common_vals and most_common_freqs** (pg_stats arrays)
  - What they are: Matching arrays of frequently observed values and their fractions.
  - What they do here: They expose the sampled frequency of cancelled and support the hand estimate.
  - What they give us: Find cancelled in most_common_vals, then use the same position in most_common_freqs.
- **histogram_bounds** (pg_stats array)
  - What it is: Ordered boundaries for equal-frequency buckets outside the MCV list.
  - What it does here: It shows how amount and created_at ranges are summarized without listing every value.
  - What it gives us: A compact view of distribution; left truncates its text for readability.
- **CREATE STATISTICS ... (dependencies, ndistinct)** (extended-statistics DDL)
  - What it is: It defines a multi-column summary object for relationships ordinary per-column stats miss.
  - What it does here: pl_geo_stx records that city determines country and counts distinct city/country combinations.
  - What it gives us: A named object that ANALYZE fills and the final catalog query inspects.
- **pg_statistic_ext and pg_statistic_ext_data** (system catalogs)
  - What they are: Catalogs for extended-statistics definitions and collected data.
  - What they do here: The join finds pl_geo_stx and reads stxddependencies and stxdndistinct.
  - What they give us: Dependency strength such as 1.0 and the observed number of combinations.
- **array_position and left** (SQL functions)
  - What they are: array_position finds an array element's position; left keeps the first characters of text.
  - What they do here: They locate cancelled's frequency and shorten histogram output.
  - What they give us: A readable estimate and bounded terminal output.
- **\x auto** (psql display command)
  - What it is: It selects expanded output automatically when rows are too wide.
  - What it does here: It keeps the statistics columns readable while inspecting pg_stats.
  - What it gives us: One field per line when needed instead of a wrapped wide table.
- **generate_series and array subscripting** (SQL data-building tools)
  - What they are: generate_series creates test rows; array subscripting chooses a value by position.
  - What they do here: They build controlled order and city/country distributions.
  - What they give us: Known data relationships against which estimates can be checked.
- **md5, repeat and length** (payload fixture functions)
  - What they are: md5 produces a hexadecimal digest, repeat copies it and length counts characters.
  - What they do here: They create 128-character payloads for 100,000 tenant rows; the tenant-only index cannot return that payload without heap access.
  - What they give us: A controlled row width and an explicit reason that a frequent tenant may make many heap accesses.
- **PREPARE / EXECUTE / DEALLOCATE** (prepared-statement commands)
  - What they are: They store a parameterized query, run it with a supplied tenant key, and release it.
  - What they do here: They compare the frequent tenant and a rare tenant without changing query semantics.
  - What they give us: Plan and buffer evidence for parameter sensitivity; both query values are checked
    against the same payload-returning statement.
- **plan_cache_mode = force_custom_plan / force_generic_plan** (session planner controls)
  - What they are: Test-only controls that require parameter-specific or parameter-independent plans.
  - What they do here: They make the contrast explicit rather than claiming PostgreSQL's automatic
    heuristic always picks either policy.
  - What they give us: Four comparable EXPLAIN EXECUTE outputs; RESET restores ordinary behavior.

## Setup
```sql
drop table if exists pl_orders;
create table pl_orders(
  id int primary key,
  customer_id int not null,
  status text not null,
  amount numeric(10,2) not null,
  created_at timestamptz not null,
  note text
) with (autovacuum_enabled = off);
insert into pl_orders
select g,
       (g % 5000) + 1,
       case when g % 1000 = 0 then 'cancelled' when g % 10 = 0 then 'shipped' else 'paid' end,
       (g % 10000)::numeric / 100,
       timestamptz '2025-01-01' + (g % 365) * interval '1 day',
       'note for order ' || g
from generate_series(1,100000) g;
analyze pl_orders;
drop table if exists pl_fresh;
drop table if exists pl_geo;
drop table if exists pl_tenant;
create table pl_tenant(id int primary key, tenant_id int not null, payload text not null)
  with (autovacuum_enabled = off);
insert into pl_tenant
select g, case when g <= 90000 then 1 else 2 + (g % 999) end, repeat(md5(g::text), 4)
from generate_series(1,100000) g;
create index pl_tenant_key_idx on pl_tenant(tenant_id);
analyze pl_tenant;
```

## Run
```sql
set max_parallel_workers_per_gather = 0;
\x auto

-- A. No statistics at all.
create table pl_fresh (id int, customer_id int, status text, amount numeric(10,2))
  with (autovacuum_enabled = off);
insert into pl_fresh
select g, (g % 5000) + 1,
       case when g % 1000 = 0 then 'cancelled' when g % 10 = 0 then 'shipped' else 'paid' end,
       (g % 10000)::numeric / 100
from generate_series(1,100000) g;

select relpages, reltuples from pg_class where relname = 'pl_fresh';
explain (analyze, timing off, summary off) select count(*) from pl_fresh;
explain (analyze, timing off, summary off) select * from pl_fresh where status = 'cancelled';

analyze pl_fresh;
select relpages, reltuples from pg_class where relname = 'pl_fresh';
explain (analyze, timing off, summary off) select count(*) from pl_fresh;
explain (analyze, timing off, summary off) select * from pl_fresh where status = 'cancelled';

-- B. What ANALYZE actually stored.
select attname, null_frac, avg_width, n_distinct, most_common_vals, most_common_freqs, correlation
from pg_stats where tablename = 'pl_orders' and attname in ('id','status','customer_id')
order by attname;

select attname, n_distinct, left(histogram_bounds::text, 60) as first_histogram_bounds
from pg_stats where tablename = 'pl_orders' and attname in ('amount','created_at')
order by attname;

-- The 'cancelled' estimate is just its sampled frequency times reltuples.
select (most_common_freqs)[array_position(most_common_vals::text::text[], 'cancelled')] as freq,
       (most_common_freqs)[array_position(most_common_vals::text::text[], 'cancelled')]
         * (select reltuples from pg_class where relname = 'pl_orders') as estimated_rows
from pg_stats where tablename = 'pl_orders' and attname = 'status';

-- C. Stale statistics: change the data, do not tell the planner.
delete from pl_fresh where status <> 'cancelled';
explain (analyze, timing off, summary off) select count(*) from pl_fresh;
analyze pl_fresh;
explain (analyze, timing off, summary off) select count(*) from pl_fresh;

-- D. The independence assumption: city determines country.
create table pl_geo(id int, city text, country text) with (autovacuum_enabled = off);
insert into pl_geo
select g,
       (array['paris','lyon','berlin','munich','madrid','sevilla','rome','milan','tokyo','osaka'])[1 + g % 10],
       (array['fr','fr','de','de','es','es','it','it','jp','jp'])[1 + g % 10]
from generate_series(1,100000) g;
analyze pl_geo;

explain (analyze, timing off, summary off)
  select count(*) from pl_geo where city = 'paris';
explain (analyze, timing off, summary off)
  select count(*) from pl_geo where city = 'paris' and country = 'fr';

create statistics pl_geo_stx (dependencies, ndistinct) on city, country from pl_geo;
analyze pl_geo;
explain (analyze, timing off, summary off)
  select count(*) from pl_geo where city = 'paris' and country = 'fr';

select stxname, stxddependencies, stxdndistinct
from pg_statistic_ext join pg_statistic_ext_data on oid = stxoid
where stxname = 'pl_geo_stx';

-- E. Plan sensitivity under skew. Both parameter values return the same shaped
-- answer, but tenant 1 needs almost every heap row while tenant 999 is rare.
select tenant_id, count(*) as answer_rows, min(length(payload)) as payload_characters
from pl_tenant where tenant_id in (1, 999) group by tenant_id order by tenant_id;
prepare pl_tenant_q(int) as select payload from pl_tenant where tenant_id = $1;
set plan_cache_mode = force_custom_plan;
explain (analyze, buffers, timing off, summary off) execute pl_tenant_q(1);
explain (analyze, buffers, timing off, summary off) execute pl_tenant_q(999);
set plan_cache_mode = force_generic_plan;
explain (analyze, buffers, timing off, summary off) execute pl_tenant_q(1);
explain (analyze, buffers, timing off, summary off) execute pl_tenant_q(999);
reset plan_cache_mode;
deallocate pl_tenant_q;
reset max_parallel_workers_per_gather;
```

## Expected result
Before ANALYZE, pl_fresh has no collected row statistics (reltuples = -1). PostgreSQL can still
estimate using physical size and fallback selectivity. In the validated fixture it estimated about
61,789 total rows and 309 cancelled rows, against actual counts of 100,000 and 100. ANALYZE refreshes
the total and gives a sampled cancelled estimate near 100; exact samples and estimates vary.

pg_stats exposes the summary behind those estimates. Negative n_distinct is a fraction of table
rows: -1 describes a unique column, while approximately -0.1 predicts distinct values growing with
row count. It does not mean a fixed 10,000 values forever. Physical correlation describes agreement
between key order and heap order; it is different from dependence between two columns.

After deleting 99,900 rows, pl_fresh still has an old row estimate until ANALYZE refreshes it.
The remaining actual count is 100. For pl_geo, both Paris predicates return 10,000 rows. Without
extended statistics, adding country='fr' typically lowers the estimate toward 2,000 by multiplying
marginal frequencies. The dependencies object plus ANALYZE brings the estimate closer to 10,000.
This repairs a supported estimation case; it does not prove every correlation is modeled correctly.

The prepared-plan fixture has 90,000 tenant-1 payload rows and 10 tenant-999 payload rows. Compare
actual rows in all four EXPLAIN EXECUTE outputs against these answers. Validation used a custom
sequential scan for tenant 1 and custom index scan for tenant 999; a generic index plan served both,
estimating about 102 rows per value. That generic estimate is especially poor for the frequent
value. Compare buffers as well as estimates; the experiment does not predict the automatic policy.
The payload is 128 ASCII characters; the index covers tenant_id but not payload.

RESET and DEALLOCATE restore defaults and release the prepared statement. The retained pl_tenant
fixture is recreated by setup, so the variation can also run in a fresh session.

## Systems lens
Missing data, stale data and a poor model need different interventions. A larger statistics sample
may improve a noisy frequency estimate without fixing a wrong independence assumption. Likewise,
one reusable generic plan can hide important workload classes behind an average. Identify the input
that failed, then measure the chosen remedy on frequent and rare requests before adopting it.

## Optional variation
Raise default_statistics_target for one analysis of pl_orders, then compare the cancelled estimate
with the known 100-row answer. Restore the setting and re-analyze afterwards. Does a better estimate
necessarily change the plan, and what extra analysis work did you buy?
