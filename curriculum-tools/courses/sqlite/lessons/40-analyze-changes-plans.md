# Let ANALYZE replace a guess with observed statistics

slug: analyze-changes-plans
category: performance
difficulty: advanced
tags: statistics, query-planner, observability
prerequisites: index-read-write-tradeoff
safety: writes-data
run-in: tool
sessions: 1
min-version: 3.53.4
minutes: 25
revision: 3

## Overview
Create competing indexes whose usefulness differs sharply, inspect the plan before collecting statistics, then run ANALYZE. The lesson is how an embedded application's maintenance schedule shapes the planner's model—not a promise that every build will change its mind.

## Syntax breakdown
### In plain terms

The planner must choose a route before it knows which rows actually match. Without statistics it uses defaults; with statistics it has a compressed model of the data. We deliberately do not run PRAGMA optimize in setup, because that could collect the statistics whose absence this experiment needs.

### What you are learning

- **Selectivity:** An index that narrows 10,000 rows to about 100 is a better starting point here than one that narrows them to about 5,000.
- **Compressed statistics:** sqlite_stat1 describes average key populations, not every correlation or exact result.
- **Maintenance ownership:** An embedded application must decide when planner statistics are refreshed.

### Piece by piece

- **WITH RECURSIVE, CASE, printf, and %** create a controlled distribution. Only 100 rows use rare-region; half of those use common-kind, so the answer is 50.
- **CREATE INDEX** provides two competing single-column paths. Dropping and recreating the table removes its old indexes and statistics so the baseline is reproducible.
- **EXPLAIN QUERY PLAN** is run before and after ANALYZE. Record the chosen index even when both runs choose the same one; index choice is evidence, not an assertion we can demand of every future planner.
- **ANALYZE skewed_events** explicitly collects this table's index statistics. The experiment uses deterministic full analysis rather than relying on opportunistic maintenance.
- **sqlite_stat1(tbl, idx, stat)** stores one row per analyzed index here. The first integer in stat is the approximate total index rows; the next is the average rows sharing the first key column. A smaller second number means greater average selectivity.
- **PRAGMA optimize** is the application-oriented maintenance interface to consider after this experiment. It may run bounded ANALYZE work when useful; do not insert it before the baseline comparison.
- **The variation's extra common-region rows** change the model's input. Record both the distribution and refreshed stat text; a stable plan can still be a correct response.

## Caution
Do not edit sqlite_stat1 as a tuning shortcut in a lesson run. Statistics formats and planner decisions are implementation details; validate the chosen plan after each meaningful data-shape change.

## Setup
```sql
DROP TABLE IF EXISTS skewed_events;
CREATE TABLE skewed_events(id INTEGER PRIMARY KEY, region TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL);
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 10000)
INSERT INTO skewed_events
SELECT x, CASE WHEN x <= 100 THEN 'rare-region' ELSE 'region-' || printf('%03d', x % 99) END,
  CASE WHEN x % 2 = 0 THEN 'common-kind' ELSE 'other-kind' END, 'body-' || x FROM n;
CREATE INDEX skewed_region_idx ON skewed_events(region);
CREATE INDEX skewed_kind_idx ON skewed_events(kind);
```

## Run
```sql
EXPLAIN QUERY PLAN SELECT body FROM skewed_events WHERE region = 'rare-region' AND kind = 'common-kind';
SELECT count(*) AS expected_matches FROM skewed_events WHERE region = 'rare-region' AND kind = 'common-kind';
ANALYZE skewed_events;
SELECT tbl, idx, stat FROM sqlite_stat1 WHERE tbl = 'skewed_events' ORDER BY idx;
EXPLAIN QUERY PLAN SELECT body FROM skewed_events WHERE region = 'rare-region' AND kind = 'common-kind';
```

## Expected result
The count is 50. After ANALYZE, sqlite_stat1 contains one row for each named index with cardinality text (the exact numbers are build/data dependent but show region is much more selective than kind). The post-ANALYZE plan uses skewed_region_idx; on this fixed 10,000-row dataset it is a reproducible change from the pre-statistics choice of skewed_kind_idx. If a build chooses region before ANALYZE, record that the plan did not change and use the stats to explain why rather than claiming a change that did not occur.

## Systems lens
Statistics are cached knowledge, and stale knowledge can produce poor decisions even when execution is correct. PostgreSQL can delegate statistics collection to server maintenance; with SQLite, connection lifecycle and application scheduling determine when that maintenance gets requested. Keep that ownership in your operational design.

## Optional variation
After Run, append the bounded comparison data with `WITH RECURSIVE n(x) AS (VALUES(10001) UNION ALL SELECT x+1 FROM n WHERE x<110000) INSERT INTO skewed_events SELECT x,'common-region','common-kind','body-'||x FROM n;`. Repeat Run, including its pre-refresh plan, match count, ANALYZE, statistics query and final plan. The table now has 110000 rows while the rare-region/common-kind answer remains 50. Refreshed statistics describe the new average key populations; compare them with the old text even if the chosen index stays the same. Average statistics do not encode every skew or correlation.
