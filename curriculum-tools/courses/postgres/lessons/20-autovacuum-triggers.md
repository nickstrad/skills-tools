# Autovacuum is a threshold, plus a delay you do not control

slug: autovacuum-triggers
category: vacuum
difficulty: intermediate
tags: 
prerequisites: vacuum-reclaims-in-place
safety: writes-data
run-in: tool
sessions: 1
min-version: 16
minutes: 15
revision: 4

## Overview
Autovacuum schedules routine cleanup when a table's estimated dead tuples exceed
threshold + scale_factor * reltuples; manual VACUUM also has operational uses. This lesson sets a small table-local
threshold, then performs three modest independently committed write batches and measures the growing
dead-version backlog. A bounded poll may observe an autovacuum completion, but timing is not a
guarantee: if it does not appear, the diagnostics still prove eligibility and tell you what to inspect.

## Syntax breakdown
### In plain terms

Autovacuum is a background garbage collector that wakes periodically and checks whether each table
has crossed its cleanup threshold. This experiment sets a very small threshold for one table, creates
three batches of 1,000 updates, and polls for completion evidence. Estimates arrive asynchronously,
and scheduling depends on the launcher and available workers; neither eligibility nor completion
is guaranteed to appear in the first sample.

### What you are learning

- **Threshold formula:** A table triggers vacuum after its estimated dead tuples exceed a fixed
  threshold plus a fraction of its estimated size.
- **Launcher versus worker:** The launcher notices eligible tables; a worker performs the scan, so
  progress and completion are separate observations.
- **Bounded polling:** psql's watch command can sample a changing view without running forever.

### Piece by piece

- **SHOW autovacuum** and **SHOW autovacuum_naptime** (configuration inspection)
  - What they are: SHOW returns effective server settings for the current session.
  - What they do here: They establish that autovacuum is enabled and show the launcher interval.
  - What they give us: The schedule explaining why cleanup does not start at UPDATE itself.
- **ALTER TABLE ... SET (autovacuum_vacuum_threshold = 50, autovacuum_vacuum_scale_factor = 0)**
  (per-table settings)
  - What it is: It overrides global vacuum trigger settings for vac_t; scale factor 0 removes the
    size-proportional term, leaving an absolute threshold of 50 dead tuples.
  - What it does here: It makes 1,000 dead tuples immediately eligible.
  - What it gives us: reloptions output recording the exact trigger values.
- **autovacuum_analyze_threshold = 1000000** (per-table analyze setting)
  - What it is: It is the threshold for automatic statistics analysis.
  - What it does here: The high value prevents autoanalyze competing with the vacuum event.
  - What it gives us: A cleaner observation of last_autovacuum and autovacuum_count.
- **pg_class.reloptions** (catalog column)
  - What it is: It stores table-specific options as text entries.
  - What it does here: The SELECT confirms ALTER TABLE settings were applied to vac_t.
  - What it gives us: A visible list containing enabled, threshold, scale-factor, and analyze values.
- **pg_stat_user_tables** (statistics view)
  - What it is: It reports approximate tuple counters and maintenance timestamps.
  - What it does here: It reads last_autovacuum, autovacuum_count, and n_dead_tup before and after
    churn.
  - What it gives us: a changing dead-tuple estimate and an increase from the recorded initial
    autovacuum_count if a worker completes; neither initial value must be zero.
- **UPDATE vac_t SET n = n + 1 WHERE id <= 1000** (churn operation)
  - What it is: It creates replacement versions for the first 1,000 rows.
  - What it does here: It crosses the table threshold while leaving other rows alone.
  - What it gives us: A dirtied_at timestamp and a dead-tuple estimate far above 50.
- **now()::time(0)** (timestamp function and cast)
  - What it is: now() returns the current transaction time; the cast keeps time to whole seconds.
  - What it does here: It labels the update and each poll.
  - What it gives us: A readable delay between dirtied_at and last_autovacuum.
- **\\watch i=5 c=12** (psql polling meta-command)
  - What it is: It repeats the previous query every 5 seconds (i) for 12 cycles (c), then stops.
  - What it does here: It observes n_dead_tup and autovacuum_count until a worker completes.
  - What it gives us: Repeated rows showing count 0, then n_dead_tup near zero and count 1.
- **pg_stat_progress_vacuum** (progress view)
  - What it is: It reports currently running vacuum workers and heap totals/scans.
  - What it does here: The query checks whether the short vacuum is still active.
  - What it gives us: Often no rows because cleanup finishes between polls; a live row exposes phase,
    heap_blks_total, and heap_blks_scanned.
- **ALTER TABLE ... RESET (...)** (relation-setting reset)
  - What it is: RESET removes table-specific options and returns to inherited defaults.
  - What it does here: It cleans up the lab after the experiment.
  - What it gives us: Future runs are not permanently affected by this lesson's low threshold.
- **autovacuum_vacuum_cost_delay = 20** (challenge throttle)
  - What it is: A per-table delay limiting how aggressively vacuum consumes I/O resources.
  - What it does here: It adds a table-local 20-millisecond cost delay during the variation.
  - What it gives us: a controlled throttle, though a short worker can still finish between samples.

## Setup
```sql
create table if not exists vac_t(id int primary key, n int, pad text);
alter table vac_t set (autovacuum_enabled = on);
truncate vac_t;
insert into vac_t select g, g, repeat('x', 100) from generate_series(1, 20000) g;
vacuum (analyze) vac_t;
```

## Run
```sql
-- Session A
show autovacuum;
show autovacuum_naptime;
alter table vac_t set (autovacuum_vacuum_threshold = 50,
                       autovacuum_vacuum_scale_factor = 0,
                       autovacuum_analyze_threshold = 1000000);
select reloptions from pg_class where relname = 'vac_t';
-- Session A
select last_autovacuum, autovacuum_count, n_dead_tup
from pg_stat_user_tables where relname = 'vac_t';
-- Session A
select format('update vac_t set n = n + 1 where id <= 1000;') from generate_series(1, 3) \gexec
select now()::time(0) as dirtied_at, n_dead_tup
from pg_stat_user_tables where relname = 'vac_t';
-- Session A
select now()::time(0) as t, n_dead_tup, autovacuum_count, last_autovacuum::time(0)
from pg_stat_user_tables where relname = 'vac_t' \watch i=5 c=12
-- Session A
select relid::regclass as relation, phase, heap_blks_total, heap_blks_scanned
from pg_stat_progress_vacuum where datid = (select oid from pg_database where datname=current_database())
  and relid = 'vac_t'::regclass;
alter table vac_t reset (autovacuum_vacuum_threshold, autovacuum_vacuum_scale_factor,
                         autovacuum_analyze_threshold);
```

## Expected result
The lab normally has autovacuum on and autovacuum_naptime = 1min; record your actual settings. After the ALTER, reloptions reads
{autovacuum_enabled=on,autovacuum_vacuum_threshold=50,autovacuum_vacuum_scale_factor=0,
autovacuum_analyze_threshold=1000000}. Record initial last_autovacuum and autovacuum_count;
rerunning the experiment can retain a previous timestamp and a nonzero count.

The three batches create roughly 3,000 updates, so n_dead_tup should exceed the threshold of 50 even
though the exact estimate reflects statistics timing and page pruning. The \watch output either shows
the useful transition--autovacuum_count increases, last_autovacuum advances, and the backlog falls--or
it ends with the table still eligible. The latter is not a failed lesson: record autovacuum,
autovacuum_naptime, reloptions, n_dead_tup, and pg_stat_progress_vacuum, then inspect worker slots
and server logs before deciding why a worker did not run.

pg_stat_progress_vacuum is often empty because a short worker can finish between samples. A live row
is extra evidence about phase and scanned pages, not a required outcome. The table settings are reset
at the end in either case.

## Systems lens
Background reclamation is a control loop: a trigger says when work is eligible, and scheduling plus
worker capacity says when it happens. The three batches show why a small hot table can accumulate a
backlog while it waits for that loop. The operational signal is the direction of dead versions and
completed autovacuums over time, together with the oldest snapshot that might block cleanup; one
minute of polling is deliberately not a promise about a shared server.

## Optional variation
Rerun setup, set autovacuum_vacuum_cost_delay = 20 on **vac_t**, and use the same three generated
batches. If pg_stat_progress_vacuum catches a worker, compare its phase and scanned blocks with the
normal run; always reset that table option afterwards.
