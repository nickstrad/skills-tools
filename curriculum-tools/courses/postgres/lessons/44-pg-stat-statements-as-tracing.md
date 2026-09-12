# pg_stat_statements: normalized aggregate workload telemetry

slug: pg-stat-statements-as-tracing
category: query-planning
difficulty: intermediate
tags: pg-stat-statements, observability, query-planning, explain
prerequisites: install-lab-extensions, explain-analyze-buffers
safety: privileged
run-in: tool
sessions: 1
min-version: 16
minutes: 20
revision: 4

## Overview
EXPLAIN tells you about one query you already suspect. pg_stat_statements tells you which normalized
query shape accumulated work. It keeps counters per fingerprint, user, database and top-level status; this lesson
captures scoped before/after counters around a bounded workload and compares them with client timing.
It cannot reconstruct request order, a trace, or a p99 distribution.

## Syntax breakdown
### In plain terms

This lesson turns query history into aggregate workload telemetry. PostgreSQL replaces literal values with
placeholders and accumulates counts, times, rows, and page activity for each normalized query shape.
You will rank a workload, then create a fast and a slow case that share one fingerprint and two
similar-looking IN queries that do not, exposing what aggregate observability hides.

### What you are learning

- **Normalization:** Literal values become placeholders so repeated query shapes share one row.
- **Capacity ranking:** Total execution time shows aggregate cost better than call count or mean time.
- **Distribution loss:** A mean can hide a bimodal workload; min, max, and standard deviation help.
- **Fingerprint boundaries:** Different IN-list lengths can create separate entries and fragment monitoring.

### Piece by piece

- **CREATE EXTENSION pg_stat_statements** (extension setup)
  - What it is: It installs the view and functions that collect normalized statement statistics; shared_preload_libraries must load it at server start.
  - What it does here: The lab setup makes the extension available before the workload runs.
  - What it gives us: The pg_stat_statements view.
- **temporary baseline table and queryid** (delta capture)
  - What they are: A session-local table holding counters before the workload and the normalized
    statement identifier that joins later counters to it.
  - What they do here: They calculate owned user/database deltas without resetting shared telemetry.
  - What they give us: Calls and execution-time increments for this scope during the interval; another session
    using the same role and database can contribute.
- **pg_stat_statements** (statistics view)
  - What it is: A cluster-wide view with one aggregate row per normalized statement fingerprint, role, database and top-level status.
  - What it does here: It ranks statements by total time and displays min, mean, max, standard deviation, planning time, and I/O counters.
  - What it gives us: calls, total_exec_time, mean_exec_time, rows, shared_blks_hit/read, temp blocks, and query text.
- **dbid and current_database()** (database identity expressions)
  - What they are: dbid identifies the database in the view; current_database returns this connection's name.
  - What they do here: They scope baselines and reports so unrelated databases do not pollute the lesson.
  - What they give us: A filter matching the OID selected from pg_database.
- **pg_database.oid** (system catalog column)
  - What it is: PostgreSQL's internal identifier for a database.
  - What it does here: The scalar subquery supplies the database-specific baseline and report filter.
  - What it gives us: The numeric dbid used by pg_stat_statements.
- **round, coalesce, and left** (SQL functions)
  - What they are: round formats numbers; coalesce treats a newly seen queryid's prior counter as zero; left shortens query text.
  - What they do here: They make deltas and fingerprints readable.
  - What they give us: Stable terminal columns for bounded counter increments.
- **pg_stat_statements.track_planning** (extension setting)
  - What it is: A switch for collecting planning-time totals in addition to execution time.
  - What it does here: SHOW reports whether new planning times are collected; stored totals can include earlier periods with tracking enabled.
  - What it gives us: A setting value explaining whether planning overhead is represented.
- **toplevel and pg_stat_statements_info** (scope and retention evidence)
  - What they are: toplevel distinguishes direct client statements from nested statements; the info view reports full resets and entry deallocations.
  - What they do here: Baselines and reports select only top-level statements. A final reset timestamp and deallocation comparison checks for visible retention changes.
  - What they give us: interval_retained must be true before interpreting deltas. It cannot detect every targeted reset; coordinate with other users of this lab.
- **pg_stat_statements.max** (extension capacity setting)
  - What it is: The maximum number of statement entries retained.
  - What it does here: SHOW exposes the finite cardinality budget.
  - What it gives us: The eviction limit to consider when query text creates many fingerprints.
- **\x auto** (psql display command)
  - What it is: It switches to expanded output when a row is too wide for the terminal.
  - What it does here: It keeps wide statistics rows readable.
  - What it gives us: One field per line when needed and compact output otherwise.
- **\timing on/off** (psql display command)
  - What it is: It toggles client-side elapsed-time display.
  - What it does here: It bounds the observed workload with timings from this psql client.
  - What it gives us: Per-command elapsed time alongside aggregate server counters.
- **generate_series, CREATE INDEX, and ANALYZE** (setup tools)
  - What they are: The function emits test rows; the command builds the customer index; ANALYZE refreshes estimates.
  - What they do here: They create the repeatable workload whose statements are recorded by the extension.
  - What they give us: Known scan and join shapes to rank by calls, time, and buffers.

## Caution
pg_stat_statements is shared by every database in the cluster. Do not reset it for this lesson:
snapshot the current user's counters in the current database and calculate a delta instead.

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
create index if not exists pl_orders_cust_idx on pl_orders(customer_id);
drop table if exists pl_customers;
create table pl_customers(id int primary key, name text not null, region text not null)
  with (autovacuum_enabled = off);
insert into pl_customers
select g, 'customer ' || g, (array['us-east','us-west','eu-west','ap-south'])[1 + g % 4]
from generate_series(1,5000) g;
analyze pl_orders;
analyze pl_customers;
```

## Run
```sql
\x auto
set max_parallel_workers_per_gather = 0;

-- Capture only this user's counters in this database; do not reset shared telemetry.
drop table if exists pg_temp.pl_stmt_before;
select stats_reset as reset_before, dealloc as evictions_before
from pg_stat_statements_info \gset
create temp table pl_stmt_before as
select queryid, calls, total_exec_time
from pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
  and userid = (select usesysid from pg_user where usename = current_user)
  and toplevel;

-- A tiny workload: the same shape three times with different literals, one
-- expensive scan, one join.
\timing on
select count(*) from pl_orders where customer_id = 7;
select count(*) from pl_orders where customer_id = 42;
select count(*) from pl_orders where customer_id = 99;
select count(*) from pl_orders where status = 'cancelled';
select sum(amount) from pl_orders o join pl_customers c on c.id = o.customer_id
  where c.region = 'eu-west';
\timing off

-- Rank this bounded workload by its scoped execution-time delta.
select s.queryid, s.calls - coalesce(b.calls, 0) as calls_delta,
       round((s.total_exec_time - coalesce(b.total_exec_time, 0))::numeric, 2) as exec_ms_delta,
       left(s.query, 58) as query
from pg_stat_statements s left join pl_stmt_before b using (queryid)
where s.dbid = (select oid from pg_database where datname = current_database())
  and s.userid = (select usesysid from pg_user where usename = current_user)
  and s.toplevel
  and s.query like '%pl_orders%'
  and s.calls > coalesce(b.calls, 0)
order by exec_ms_delta desc;

-- Start a second bounded interval. min/mean/max below remain lifetime aggregates for a fingerprint.
truncate pl_stmt_before;
insert into pl_stmt_before
select queryid, calls, total_exec_time
from pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
  and userid = (select usesysid from pg_user where usename = current_user)
  and toplevel;

\timing on
select count(*) from pl_orders where customer_id <= 1;
select count(*) from pl_orders where customer_id <= 1;
select count(*) from pl_orders where customer_id <= 1;
select count(*) from pl_orders where customer_id <= 5000;

-- Second: the fingerprint. These operations have different list lengths and return different counts.
select count(*) from pl_orders where id in (1,2);
select count(*) from pl_orders where id in (1,2,3);
\timing off

select s.calls - coalesce(b.calls, 0) as calls_delta,
       round(min_exec_time::numeric, 2) as min_ms,
       round(mean_exec_time::numeric, 2) as mean_ms,
       round(max_exec_time::numeric, 2) as max_ms,
       round(stddev_exec_time::numeric, 2) as stddev_ms,
       round(total_plan_time::numeric, 2) as plan_ms,
       left(s.query, 55) as query
from pg_stat_statements s left join pl_stmt_before b using (queryid)
where s.dbid = (select oid from pg_database where datname = current_database())
  and s.userid = (select usesysid from pg_user where usename = current_user)
  and s.toplevel
  and s.query like '%pl_orders%'
  and s.calls > coalesce(b.calls, 0)
order by s.total_exec_time - coalesce(b.total_exec_time, 0) desc;

show pg_stat_statements.track_planning;
show pg_stat_statements.max;
select stats_reset = :'reset_before'::timestamptz
  and dealloc = :evictions_before as interval_retained
from pg_stat_statements_info;
drop table pl_stmt_before;
reset max_parallel_workers_per_gather;
```

## Expected result
Use a quiet scratch database: another session using the same role and tables can
contribute to these scoped counters. interval_retained must be true; a visible reset or entry eviction makes
the before/after comparison unreliable and calls for a fresh interval.

No reset runs. The first \timing output is the psql client's elapsed time for each of the five
commands. It bounds this client-observed workload; pg_stat_statements is an aggregate server view
and cannot supply a request order, a trace, or a percentile distribution.

The first report contains only statements whose counters increased after the baseline, scoped to
the current user and database. Expect three rows: the normalized customer lookup with
calls_delta = 3, the cancelled-status count with calls_delta = 1, and the join with calls_delta = 1.
Their execution-time deltas vary with cache state and concurrent work. The three customer literals
collapse to a query containing customer_id = $1, demonstrating normalization. Rank this bounded
set by exec_ms_delta when deciding which shape consumed capacity in this interval.

The second report again contains only queryids whose calls increased after its new baseline. The
customer_id <= $1 fingerprint has calls_delta = 4; the two IN-list lengths appear as separate
fingerprints, each with calls_delta = 1. Its min_ms, mean_ms, max_ms, and stddev_ms are lifetime
aggregates for that fingerprint, not four individually recorded requests and not interval
percentiles. A large spread can suggest mixed behavior, but it cannot reconstruct the order or
distribution of executions. Different IN-list lengths can fragment one logical application query
across many entries.

The SHOW values report this server's extension configuration. With track_planning off, new planning
time is not collected; previously retained totals need not be zero. pg_stat_statements.max is the
finite entry budget.

## Systems lens
pg_stat_statements is normalized aggregate workload telemetry. Query text identifies a fingerprint,
and literal normalization avoids creating a row for every user id or order id. Snapshot-and-delta
turns its counters into an interval measurement without erasing other users' evidence, provided
the retained state stays intact.
That supports capacity ranking: a cheap statement called often can cost more than one slow report.

It does not retain individual requests, ordering, histograms, or percentiles. Its min, mean, max,
and standard deviation summarize the fingerprint's retained aggregate state, so use them as clues
and combine them with bounded client timings and other telemetry when you need latency behavior.
Fingerprint boundaries are also a design constraint: varying IN-list lengths can split one logical
operation into many entries and consume the finite statement budget.

## Optional variation
Snapshot the view into a table, run a workload, snapshot again, and difference the two by queryid
to get a real per-interval rate. Keep the dbid and userid filters, and compare the delta with the
client's \timing output. Then inspect SHOW pg_stat_statements.track_planning and explain whether this
server can report planning totals without a configuration change.
