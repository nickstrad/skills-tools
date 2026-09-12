import { code, type Module } from "../../../src/types.ts";

export const INDEX_CHOICE: Module = {
  category: "query-evidence",
  title: "Choose indexes from measured access paths",
  lessons: [
    {
      slug: "index-crossover",
      title: "An index can stop being the cheaper path",
      difficulty: "intermediate",
      prerequisites: ["statistics-and-estimates"],
      tags: ["query-plans", "indexes", "cost-model", "performance"],
      estimatedMinutes: 25,
      revision: 1,
      sessions: 1,
      safetyLevel: "ddl",
      runIn: "tool",
      overview:
        "Run the same range query at narrow and broad selectivity against one analyzed table. PostgreSQL should use the B-tree to fetch a few heap rows, then prefer one sequential pass when most rows and their payload are needed. Predict the two access paths before revealing the plans, then use their row and buffer evidence to explain the choice.",
      caution:
        "This fixture creates about 100,000 rows and disables autovacuum only on pe_index_crossover so a background worker cannot change the comparison. Run it only in the supplied lab. If interrupted, run ROLLBACK; DROP TABLE IF EXISTS pe_index_crossover; RESET random_page_cost; RESET seq_page_cost; RESET effective_cache_size; RESET lock_timeout; RESET statement_timeout.",
      syntaxBreakdown: code`
### In plain terms
An index avoids examining most of a table when a predicate is selective, but each matching index
entry can lead to a heap-page visit for the requested payload. When a query needs most rows, one
sequential pass can cost less than many indexed visits. PostgreSQL estimates both alternatives and
chooses the cheaper plan; there is no fixed selectivity percentage at which every index loses.

### Mechanism map

${"```text"}
One table, two ranges, two ways to reach heap rows

narrow range -> B-tree finds a few row locations -> fetch a few heap pages
broad range  -> sequential scan reads the heap once -> discard nonmatches

The planner compares estimated work. The crossover depends on the table, row width,
correlation, cache assumptions and cost settings; it is not a universal percentage.
${"```"}

### Terminals and cleanup
Open one experiment terminal (Session A) and connect each psql session with:
${"```sh"}
psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off
${"```"}
The flags skip personal startup settings, select the learner socket, port, role and database, and
keep output in the terminal. Finish any earlier transaction with **ROLLBACK** before setup. Run every block in Session A in the order shown.
If you reach the fifteen-minute core limit or get stuck, ROLLBACK in the open sessions and follow
the lesson's exact cleanup command so its named pe_* table and session settings are removed.
### What you are learning
- Selectivity is the fraction of rows a predicate is expected to match.
- An Index Scan can cheaply locate a narrow range but still visits the heap for payload not stored
  in this index.
- A Seq Scan reads the heap in physical order and tests every row, which can be cheaper for a broad
  result.
- Plan choice is evidence about this table and cost model. It is not a disk-speed benchmark or a
  universal crossover rule.

### Piece by piece
- **SET lock_timeout = '3s'** bounds lock acquisition, and **SET statement_timeout = '30s'** bounds
  each statement. Keep them active until the table is dropped, then RESET their session defaults.
- **CREATE TABLE ... WITH (autovacuum_enabled = false)** confines background-maintenance control to
  this disposable fixture, keeping its statistics and visibility stable during the comparison.
- **generate_series(1, 100000)** creates a deterministic key range. **repeat('x', 500)** gives each
  heap row a payload wide enough to make broad heap access visible without exceeding the lab budget.
- **CREATE INDEX ... (id)** builds a B-tree containing the range key but not payload. An Index Scan
  therefore uses the index to find tuple locations and reads matching heap pages for payload.
- **ANALYZE** refreshes statistics used to estimate how many rows each predicate will return.
- **SET random_page_cost = 4**, **SET seq_page_cost = 1** and **SET effective_cache_size = '128MB'**
  state the local planner assumptions used to stabilize this small fixture. They affect estimated
  cost only, change no scan type directly, and are reset after the experiment. **random_page_cost**
  prices a nonsequential page fetch; **seq_page_cost** prices a sequential page fetch.
  **effective_cache_size** estimates cache capacity available to a query; setting it does not
  allocate memory or change shared_buffers.
- **EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)** executes the SELECT and reports estimated and actual
  rows, loops and shared-buffer hits/reads. TIMING OFF removes per-node clock overhead; total
  execution time may still print and is not the comparison here.
- **id BETWEEN 50000 AND 50009** is the narrow ten-row range. **id <= 95000** is the broad 95,000-row
  range. Both project payload, so this is not an index-only workload.
- **Rows Removed by Filter** on the sequential plan counts heap rows rejected by its predicate.
  Buffer counts show pages accessed through PostgreSQL's shared-buffer interface; a hit means the
  page was already cached there, not that no lower storage layer was involved earlier.
- **\echo phase_...** prints an unambiguous label immediately before each plan for review and
  automated evidence checks.
- **RESET** restores each session-level planner setting. **DROP TABLE** removes the table, index and
  table-local autovacuum setting.
`,
      setup: code`
set lock_timeout = '3s';
set statement_timeout = '30s';
drop table if exists pe_index_crossover;
create table pe_index_crossover (id int not null, payload text not null)
  with (autovacuum_enabled = false);
insert into pe_index_crossover
select g, repeat('x', 500) from generate_series(1, 100000) g;
create index pe_index_crossover_id_idx on pe_index_crossover (id);
analyze pe_index_crossover;
set random_page_cost = 4;
set seq_page_cost = 1;
set effective_cache_size = '128MB';`,
      code: code`
-- Session A: compare two ranges without disabling any scan type.
\echo phase_narrow_range
explain (analyze, buffers, timing off)
select payload from pe_index_crossover where id between 50000 and 50009;

\echo phase_broad_range
explain (analyze, buffers, timing off)
select payload from pe_index_crossover where id <= 95000;

-- Session A: remove the fixture while the timeout guards still apply, then restore the session.
drop table pe_index_crossover;
reset random_page_cost;
reset seq_page_cost;
reset effective_cache_size;
reset lock_timeout;
reset statement_timeout;`,
      expectedResult: code`
phase_narrow_range shows an Index Scan using pe_index_crossover_id_idx. Its estimate is near 10 and actual
output is exactly 10 rows with one loop, and only a small number of index and heap buffers are accessed.

phase_broad_range shows a Seq Scan returning 95,000 rows with one loop and Rows Removed by Filter =
5,000. It touches the table's heap pages once rather than following 95,000 index entries to fetch
payload. On the validated PostgreSQL 16 fixture the narrow scan accessed 3 shared buffers and the
broad scan accessed 6,667. Buffer hit/read state and execution time
depend on cache history. The stable evidence is the
Index Scan versus Seq Scan choice and their 10 versus 95,000 actual rows under the stated fixture
and cost assumptions. Cleanup drops pe_index_crossover and restores the session settings.
`,
      systemsLens:
        "An index is an alternate access path with its own traversal and heap-fetch costs. Choose it from the workload's predicates, projected columns, distribution and measured plans rather than from a generic selectivity rule. Production decisions also need representative data volume, cache state, write cost and concurrency; this bounded fixture isolates only the access-path crossover.",
      challenge:
        "Optional medium-range variation, independently runnable. Predict the node, then run the whole block; the lesson does not require one fixed choice because small cost or version differences can move the crossover. Explain the chosen node from its estimate and buffers.\n\n```sql\n" +
        "-- Session A: recreate the fixture and inspect an intermediate selectivity.\nset lock_timeout = '3s';\nset statement_timeout = '30s';\ndrop table if exists pe_index_crossover;\ncreate table pe_index_crossover (id int not null, payload text not null)\n  with (autovacuum_enabled = false);\ninsert into pe_index_crossover\nselect g, repeat('x', 500) from generate_series(1, 100000) g;\ncreate index pe_index_crossover_id_idx on pe_index_crossover (id);\nanalyze pe_index_crossover;\nset random_page_cost = 4;\nset seq_page_cost = 1;\nset effective_cache_size = '128MB';\n\\echo phase_medium_range\nexplain (analyze, buffers, timing off)\nselect payload from pe_index_crossover where id <= 20000;\ndrop table pe_index_crossover;\nreset random_page_cost;\nreset seq_page_cost;\nreset effective_cache_size;\nreset lock_timeout;\nreset statement_timeout;\n```\n\n" +
        "Mentally compare the scan node, actual rows and buffers. A different node from the validated run is a reason to inspect the cost estimates, not a failure of the experiment.",
    },
    {
      slug: "composite-index-order",
      title: "Match an index to filtering and ordering",
      difficulty: "intermediate",
      prerequisites: ["index-crossover"],
      tags: ["query-plans", "indexes", "b-tree", "performance"],
      estimatedMinutes: 25,
      revision: 1,
      sessions: 1,
      safetyLevel: "ddl",
      runIn: "tool",
      overview:
        "Serve one tenant's newest ten events with two composite B-trees, installing only one at a time. Both index orders can emit descending event time without a sort, but only the tenant-first index can jump directly into that tenant's ordered slice. Compare identical queries by scan conditions and buffers touched before choosing the index order.",
      caution:
        "This experiment creates and replaces indexes on a disposable 100,000-row pe_event table. Run it only in the supplied lab. If interrupted, run ROLLBACK; DROP TABLE IF EXISTS pe_event; RESET lock_timeout; RESET statement_timeout.",
      syntaxBreakdown: code`
### In plain terms
A multicolumn B-tree is ordered first by its leading column, then by the next column within equal
leading values. For WHERE tenant_id = 1 ORDER BY event_time DESC LIMIT 10, an index beginning with
tenant_id reaches that tenant's newest entries directly. An index beginning with event_time can
still walk in time order and avoid sorting, but may test many other tenants before finding ten
matches.

### Mechanism map

${"```text"}
Identical request: tenant 1, newest 10 events

(event_time, tenant_id)        (tenant_id, event_time)
ordered across every tenant    grouped by tenant, ordered within tenant
        |                                  |
walk past other tenants                 jump to tenant 1
        |                                  |
many index entries tested                 10 entries returned

Both B-trees can provide reverse time order here. Leading-column order changes
how directly the index reaches the requested tenant.
${"```"}

### Terminals and cleanup
Open one experiment terminal (Session A) and connect each psql session with:
${"```sh"}
psql -X -h /tmp -p 5440 -U postgres -d lab -P pager=off
${"```"}
The flags skip personal startup settings, select the learner socket, port, role and database, and
keep output in the terminal. Finish any earlier transaction with **ROLLBACK** before setup. Run every block in Session A in the order shown.
If you reach the fifteen-minute core limit or get stuck, ROLLBACK in the open sessions and follow
the lesson's exact cleanup command so its named pe_* table and session settings are removed.
### What you are learning
- Column order determines which prefix of a composite B-tree can locate a contiguous slice.
- Equality on the leading tenant column leaves event_time ordered inside that tenant's slice.
- An ORDER BY-compatible index can stop at LIMIT, but avoiding a Sort does not prove efficient
  filtering.
- Similar node names and ten output rows can hide very different index traversal; buffers reveal
  the extra page accesses even when no heap-level Filter rejects rows.

### Piece by piece
- **SET lock_timeout / statement_timeout** bound lock waits and total statement time. The table's
  **autovacuum_enabled = false** prevents background maintenance on this fixture alone.
- **generate_series(1, 100000)** supplies IDs and **repeat('e', 120)** gives events fixed payloads.
  **ANALYZE pe_event** refreshes sampled planning statistics after loading and replacing the index.
- **tenant_id = ((g - 1) / 1000) + 1** uses integer division to create 100 contiguous tenants with 1,000 events each.
  **event_time = timestamptz '2026-01-01 00:00:00+00' + g * interval '1 second'** gives every event
  a unique, deterministic time: **timestamptz** is a time-zone-aware timestamp and **interval** is
  the one-second duration multiplied by the ID. LIMIT never has ambiguous ties.
- **CREATE INDEX ... (event_time, tenant_id)** orders the entire table by time first. PostgreSQL can
  scan it backward for DESC, testing tenant_id = 1 inside the index as it walks past later tenants.
  This check can avoid their heap fetches without skipping their index entries.
- **DROP INDEX** ensures the comparison installs only one candidate index at a time.
- **CREATE INDEX ... (tenant_id, event_time)** groups entries by tenant and orders times within each
  tenant. The equality condition forms the leading search boundary in Index Cond, and a backward scan starts at tenant 1's
  newest entry.
- **ORDER BY event_time DESC LIMIT 10** states the actual workload. The projected event_id is unique,
  and event_time is also unique in this fixture, so the returned order is stable.
- **EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)** executes the identical query and reports rows, loops,
  filtering and shared buffers. Look below Limit at the index scan; the Limit's ten output rows do
  not describe all work performed by its child.
- The time-first scan may display tenant_id in **Index Cond**, but a condition on a later B-tree
  column does not necessarily narrow the contiguous index range scanned. Compare buffers and scan
  work rather than interpreting the label alone. The tenant-first condition bounds one tenant's
  contiguous slice.
- **\echo phase_...** labels each immediately following plan. **DROP TABLE** removes the heap,
  remaining index and table-local autovacuum setting.
`,
      setup: code`
set lock_timeout = '3s';
set statement_timeout = '30s';
drop table if exists pe_event;
create table pe_event (
  event_id int primary key,
  tenant_id int not null,
  event_time timestamptz not null,
  payload text not null
) with (autovacuum_enabled = false);
insert into pe_event
select g,
       ((g - 1) / 1000) + 1,
       timestamptz '2026-01-01 00:00:00+00' + g * interval '1 second',
       repeat('e', 120)
from generate_series(1, 100000) g;
analyze pe_event;
create index pe_event_time_tenant_idx on pe_event (event_time, tenant_id);`,
      code: code`
-- Session A: time first supplies order but examines entries beyond the requested tenant.
\echo phase_time_first
explain (analyze, buffers, timing off)
select event_id, event_time
from pe_event
where tenant_id = 1
order by event_time desc
limit 10;

-- Session A: replace it with tenant first and run the identical workload.
drop index pe_event_time_tenant_idx;
create index pe_event_tenant_time_idx on pe_event (tenant_id, event_time);
analyze pe_event;
\echo phase_tenant_first
explain (analyze, buffers, timing off)
select event_id, event_time
from pe_event
where tenant_id = 1
order by event_time desc
limit 10;

-- Session A: remove the fixture while the timeout guards still apply, then restore the session.
drop table pe_event;
reset lock_timeout;
reset statement_timeout;`,
      expectedResult: code`
Both labelled plans return ten rows through Limit with one loop, and neither needs an explicit Sort.
phase_time_first uses a backward scan of pe_event_time_tenant_idx. It cannot use tenant_id as the
leading search boundary. PostgreSQL may print tenant_id as an Index Cond, yet the scan still walks
past the later tenants before reaching tenant 1's final ten entries.

phase_tenant_first uses a backward scan of pe_event_tenant_time_idx with Index Cond: (tenant_id =
1). It returns the same ten-event result after visiting only that tenant's slice. On the validated
PostgreSQL 16 fixture, the time-first scan accessed 384 shared buffers and the tenant-first scan
accessed 4. Exact hit/read splits depend on cache history; the scan extent and large buffer difference
are the useful evidence.
Cleanup drops pe_event and restores the timeout settings.
`,
      systemsLens:
        "Composite index order encodes a workload hierarchy. Put columns constrained by equality before the column used for ordered range access when that matches the important query, then verify the plan and write overhead on representative data. A plan that avoids sorting can still scan or filter far more index entries than necessary, so inspect child-node work rather than stopping at the visible Limit.",
      challenge:
        "Optional reverse-order variation, independently runnable. Request tenant 100's oldest events: ASC reverses the direction and choosing the opposite tenant endpoint keeps the time-first traversal long. This changes both request parameters deliberately; run the block to inspect the forward scan.\n\n```sql\n" +
        "-- Session A: recreate the fixture and compare forward scans.\nset lock_timeout = '3s';\nset statement_timeout = '30s';\ndrop table if exists pe_event;\ncreate table pe_event (event_id int primary key, tenant_id int not null, event_time timestamptz not null, payload text not null) with (autovacuum_enabled = false);\ninsert into pe_event\nselect g, ((g - 1) / 1000) + 1, timestamptz '2026-01-01 00:00:00+00' + g * interval '1 second', repeat('e', 120)\nfrom generate_series(1, 100000) g;\nanalyze pe_event;\ncreate index pe_event_time_tenant_idx on pe_event (event_time, tenant_id);\n\\echo phase_time_first_ascending\nexplain (analyze, buffers, timing off) select event_id, event_time from pe_event where tenant_id = 100 order by event_time asc limit 10;\ndrop index pe_event_time_tenant_idx;\ncreate index pe_event_tenant_time_idx on pe_event (tenant_id, event_time);\nanalyze pe_event;\n\\echo phase_tenant_first_ascending\nexplain (analyze, buffers, timing off) select event_id, event_time from pe_event where tenant_id = 100 order by event_time asc limit 10;\ndrop table pe_event;\nreset lock_timeout;\nreset statement_timeout;\n```\n\n" +
        "Both plans should use forward index scans without Sort. Compare the time-first scan extent and buffers with the tenant-first bounded slice; direction alone does not repair a poor leading column.",
    },
  ],
};
