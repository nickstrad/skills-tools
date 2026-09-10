import { code, type Module } from "../../../src/types.ts";

export const INDEX_ONLY_VISUAL = `A covering index still needs visibility evidence

covering B-tree: predicate + projected columns
          |
          +-- heap page all-visible? -- yes --> return index tuple (Heap Fetches: 0)
                                  +-- no  --> check heap tuple (Heap Fetches: positive)

VACUUM can mark eligible pages all-visible again; coverage and visibility do different jobs.`;

export const SORT_SPILL_VISUAL = `One Sort node, two transaction-local budgets

20,000 input rows -> Sort -> 20,000 ordered rows
                       |
        work_mem=64kB  +--> external merge + temporary blocks
        work_mem=32MB  +--> quicksort in memory + no temporary blocks

The allowance belongs to this sort operation; concurrent nodes, workers and queries multiply demand.`;

export const VISIBILITY_SORT: Module = {
  category: "query-execution",
  title: "Visibility checks and bounded sort memory",
  lessons: [
    {
      slug: "index-only-needs-visibility",
      title: "Covering the columns is only half an index-only scan",
      difficulty: "intermediate",
      prerequisites: ["composite-index-order"],
      tags: ["indexes", "mvcc", "visibility-map", "query-plans"],
      estimatedMinutes: 25,
      revision: 1,
      sessions: 1,
      safetyLevel: "ddl",
      runIn: "tool",
      overview:
        "Run the same selective covering-index query after vacuum, after a committed update, and after vacuum again. The plan remains an Index Only Scan, but Heap Fetches reveal when the executor must visit the heap to establish MVCC visibility. Use that evidence when deciding whether a covering index will actually avoid heap work under writes.",
      reading:
        'PostgreSQL 14 Internals, Chapter 20 "Index Scans" (section "Index-Only Scans"); Chapter 6 "Vacuum and Autovacuum" (section "Vacuum")',
      readingNotes:
        "Optional after the experiment: Chapter 20 connects covering indexes, index-only plans and Heap Fetches; Chapter 6 explains the vacuum work that maintains the visibility map. The experiment uses PostgreSQL 16 instrumentation but the page-level mechanism is the same.",
      caution:
        "This experiment disables autovacuum only on pe_visibility_cover so a background worker cannot repair the evidence between phases. Run every phase in order in one session. If interrupted, run ROLLBACK; DROP TABLE IF EXISTS pe_visibility_cover; RESET lock_timeout; RESET statement_timeout before rerunning setup.",
      syntaxBreakdown: code`
### In plain terms
A B-tree can contain every column a query needs and still be unable to prove that an index entry is
visible to the current transaction. PostgreSQL records an all-visible bit for each heap page. When
that bit is clear, an Index Only Scan checks the heap even though it gets the values from the index.

### What you are learning
- Index coverage answers whether values are available in the index; the visibility map answers
  whether the executor may skip the heap's MVCC check.
- A committed UPDATE clears all-visible state for affected heap pages. Its next index-only query can
  therefore report positive Heap Fetches.
- VACUUM can mark eligible pages all-visible again, returning the same plan to zero Heap Fetches.
- The visibility bit applies to a whole heap page, so changing some qualifying rows can make other
  index entries on those pages require heap checks too.

### Piece by piece
- **SET lock_timeout / statement_timeout** bound fixture locks and each statement. They are guards,
  not expected outcomes, and RESET restores the session defaults.
- **WITH (autovacuum_enabled = false)** affects only pe_visibility_cover. It prevents an automatic
  vacuum from changing the three labelled observations.
- **generate_series(1, 20000)** builds enough fixed-shape rows for a clear selective index path.
  **g % 100** assigns account IDs cyclically; **g::text** casts each integer for **md5**, which
  creates deterministic text, and **repeat(..., 4)** widens each payload without random input.
- **INCLUDE (status, payload)** stores projected columns as non-key index columns. They can be
  returned by the index but do not change the key order (account_id, id).
- **VACUUM (ANALYZE)** removes eligible dead versions, updates planner statistics and marks eligible
  heap pages all-visible. It runs outside an explicit transaction.
- **EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF)** executes the SELECT. ANALYZE adds actual
  rows and loops, BUFFERS adds buffer activity, TIMING OFF omits per-node timers, and SUMMARY OFF
  omits the final planning/execution summary. EXPLAIN output is evidence; it does not return the
  query's rows to the client.
- **Index Only Scan** means all selected values are available from the index. **Heap Fetches** counts
  index entries for which the executor still visited the heap for visibility in this execution.
- **UPDATE ... SET status = status || '-changed'** creates committed row versions for the exact
  queried range. Because status is included in the index, PostgreSQL also maintains index entries.
- **\echo phase=...** prints a stable label immediately before each plan so the three observations
  cannot be confused.
- **DROP TABLE** removes the table, its covering index and its table-local autovacuum setting.
`,
      setup: code`
set lock_timeout = '3s';
set statement_timeout = '60s';
drop table if exists pe_visibility_cover;
create table pe_visibility_cover (
  id integer primary key,
  account_id integer not null,
  status text not null,
  payload text not null
) with (autovacuum_enabled = false);
insert into pe_visibility_cover
select g, g % 100, 'ready', repeat(md5(g::text), 4)
from generate_series(1, 20000) as g;
create index pe_visibility_cover_lookup
  on pe_visibility_cover (account_id, id) include (status, payload);
vacuum (analyze) pe_visibility_cover;`,
      code: code`
-- Session A: coverage plus all-visible pages avoids heap checks.
\echo phase=vacuumed_baseline
explain (analyze, buffers, timing off, summary off)
select id, status, payload
from pe_visibility_cover
where account_id = 7 and id between 1 and 10000;

-- Session A: commit new versions on pages used by the same query.
begin;
update pe_visibility_cover
set status = status || '-changed'
where account_id = 7 and id between 1 and 10000;
commit;
\echo phase=after_update
explain (analyze, buffers, timing off, summary off)
select id, status, payload
from pe_visibility_cover
where account_id = 7 and id between 1 and 10000;

-- Session A: restore visibility-map evidence and repeat unchanged SQL.
vacuum pe_visibility_cover;
\echo phase=after_vacuum
explain (analyze, buffers, timing off, summary off)
select id, status, payload
from pe_visibility_cover
where account_id = 7 and id between 1 and 10000;

drop table pe_visibility_cover;
reset lock_timeout;
reset statement_timeout;`,
      expectedResult: code`
All three labelled plans contain Index Only Scan using pe_visibility_cover_lookup and return exactly
100 actual rows. At phase=vacuumed_baseline the scan reports Heap Fetches: 0. The committed UPDATE
affects 100 rows, and phase=after_update reports a positive Heap Fetches count because affected heap
pages are no longer all-visible. After explicit VACUUM, phase=after_vacuum reports Heap Fetches: 0
again. Buffer counts and the positive middle count can vary with page layout and cache state; the
zero / positive / zero sequence with the unchanged node type and row count is the stable evidence.
On the validated PostgreSQL 16 lab, the middle plan reported Heap Fetches: 200.
Cleanup drops pe_visibility_cover and restores the session settings.
`,
      systemsLens:
        "A secondary structure can contain the answer's values while still depending on metadata maintained elsewhere for correctness. PostgreSQL's visibility map is page-level proof that lets an index-only executor omit tuple-level heap checks. Update rate, page locality and vacuum progress therefore affect the realized benefit of a covering index, while INCLUDE columns also add write and storage cost. Treat plan shape together with Heap Fetches as workload evidence rather than assuming coverage guarantees heap-free reads.",
      challenge:
        "Optional non-covering variation, independently runnable. If interrupted, ROLLBACK, drop pe_visibility_variation and reset lock_timeout and statement_timeout. Predict the node type before running it:\n\n```sql\nset lock_timeout = '3s';\nset statement_timeout = '60s';\ndrop table if exists pe_visibility_variation;\ncreate table pe_visibility_variation (id int primary key, account_id int not null, payload text not null);\ninsert into pe_visibility_variation\nselect g, g % 100, repeat(md5(g::text), 4) from generate_series(1, 20000) g;\ncreate index pe_visibility_variation_lookup on pe_visibility_variation (account_id, id);\nvacuum (analyze) pe_visibility_variation;\n\\echo phase=variation_noncovering\nexplain (analyze, buffers, timing off, summary off)\nselect id, payload from pe_visibility_variation\nwhere account_id = 7 and id between 1 and 10000;\ndrop table pe_visibility_variation;\nreset lock_timeout;\nreset statement_timeout;\n```\n\nThe index omits payload, so the plan must use heap access (normally an Index Scan or Bitmap Heap Scan) even after VACUUM. Coverage is a prerequisite for Index Only Scan; all-visible pages cannot supply a value absent from the index. A Bitmap Heap Scan first collects matching tuple locations from the index, then visits heap pages in physical order; an ordinary Index Scan follows index entries to their heap tuples.",
    },
    {
      slug: "sort-spill",
      title: "Make a sort spill, then bring it back into memory",
      difficulty: "intermediate",
      prerequisites: ["index-only-needs-visibility"],
      tags: ["query-execution", "sorting", "work-mem", "temporary-io"],
      estimatedMinutes: 25,
      revision: 1,
      sessions: 1,
      safetyLevel: "ddl",
      runIn: "tool",
      overview:
        "Execute one full ordering of a modest wide table under two transaction-local memory budgets. Read the Sort Method and temporary-buffer evidence to distinguish an external merge from in-memory quicksort, then use the comparison to make a query-scoped memory decision without turning it into a global setting recommendation.",
      reading:
        'PostgreSQL 14 Internals, Chapter 23 "Sorting and Merging" (section "Sorting"); Chapter 16 "Query Execution Stages" (section "Simple Query Protocol")',
      readingNotes:
        "Optional after the experiment: Chapter 23 explains quicksort, top-N heapsort and external sorting, while Chapter 16 places work_mem at executor-operation scope. The live plans add PostgreSQL 16 buffer and temporary-I/O evidence for one bounded query.",
      caution:
        "The table is about 17 MB and both plans really execute the full sort. Keep the supplied statement timeout, use SET LOCAL only inside each BEGIN block, and COMMIT each block so its memory setting expires. If interrupted, run ROLLBACK; DROP TABLE IF EXISTS pe_sort_budget; RESET max_parallel_workers_per_gather; RESET lock_timeout; RESET statement_timeout before rerunning setup.",
      syntaxBreakdown: code`
### In plain terms
A Sort node uses its memory allowance to decide when to write working tuples to temporary files.
The allowance is not an exact process-memory ceiling; tuple bookkeeping can add overhead. You will hold the query and data constant while changing only a transaction-local work_mem.
The plan names the chosen algorithm and reports temporary block traffic when the small budget spills.

### What you are learning
- This fixture's full ORDER BY has no usable preordered input or matching index, so it sorts every
  input row before returning the result. Other plans can exploit full or partial input order.
- A 64 kB allowance forces this fixture into external merge; a 32 MB allowance permits quicksort.
- work_mem is an allowance per memory-consuming executor operation. Several sort/hash nodes, parallel
  workers and concurrent queries can each receive an allowance.
- One successful larger setting supports a bounded query decision. It does not establish a safe
  server-wide value under production concurrency.

### Piece by piece
- **SET lock_timeout = '3s'** bounds lock acquisition; **SET statement_timeout = '60s'** bounds each
  statement. Cleanup drops the table while these guards still apply, then RESET restores defaults.
- **SET max_parallel_workers_per_gather = 0** keeps one visible Sort consumer so worker multiplication
  does not obscure this comparison. RESET restores the session default.
- **generate_series(1, 20000)** supplies the IDs. **20001 - g** reverses their numeric order,
  **::text** converts the number to text, and **lpad(..., 6, '0')** makes a unique fixed-width
  sort_key. **md5(g::text)** supplies deterministic text and **repeat(..., 24)** widens payloads.
  No index matches sort_key, so both executions use the same sequential-input-plus-sort shape.
- **ANALYZE** collects planner statistics after loading the fixture.
- **BEGIN / SET LOCAL work_mem / COMMIT** scope each allowance to exactly one transaction. 64kB is
  PostgreSQL's minimum accepted value; 32MB is a bounded comparison value.
- **ORDER BY sort_key** uses ascending order by default. With no LIMIT, the executor returns all
  20,000 sorted rows; the optional **LIMIT 20** keeps only the best 20 candidates after consuming
  the unsorted scan input.
- **EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY OFF)** executes the full SELECT. ANALYZE reports
  actual rows and the sort method, BUFFERS reports shared and temporary blocks, TIMING OFF omits
  per-node timers, and SUMMARY OFF omits the final planning/execution summary. Instrumentation adds
  overhead, so this is mechanism evidence rather than a latency benchmark.
- **Sort Method: external merge Disk: ...** means the sort wrote runs to temporary storage and
  merged them. **temp read=... written=...** counts temporary 8 kB blocks used by the plan.
- **Sort Method: quicksort Memory: ...** means this sort completed in memory. Its plan has no temp
  buffer line.
- **\echo phase=...** labels each immediately following plan for deterministic validation.
- **DROP TABLE** releases the experiment's heap after both transactions have committed.
`,
      setup: code`
set lock_timeout = '3s';
set statement_timeout = '60s';
set max_parallel_workers_per_gather = 0;
drop table if exists pe_sort_budget;
create table pe_sort_budget (id integer primary key, sort_key text not null, payload text not null);
insert into pe_sort_budget
select g, lpad((20001 - g)::text, 6, '0'), repeat(md5(g::text), 24)
from generate_series(1, 20000) as g;
analyze pe_sort_budget;`,
      code: code`
-- Session A: constrain this Sort node enough to force temporary I/O.
begin;
set local work_mem = '64kB';
\echo phase=small_work_mem
explain (analyze, buffers, timing off, summary off)
select id, sort_key, payload from pe_sort_budget order by sort_key;
commit;

-- Session A: repeat identical work with a bounded in-memory allowance.
begin;
set local work_mem = '32MB';
\echo phase=larger_work_mem
explain (analyze, buffers, timing off, summary off)
select id, sort_key, payload from pe_sort_budget order by sort_key;
commit;

drop table pe_sort_budget;
reset max_parallel_workers_per_gather;
reset lock_timeout;
reset statement_timeout;`,
      expectedResult: code`
Both labelled plans contain one Sort above a sequential scan and report exactly 20000 actual rows at
the Sort. At phase=small_work_mem, Sort Method is external merge with a positive Disk amount; the
plan also reports positive temporary blocks read and written. At phase=larger_work_mem, Sort Method
is quicksort with a positive Memory amount and no temporary-buffer line. Disk, memory and buffer
counts vary by build and page layout; the algorithm names, presence versus absence of temporary I/O,
and equal actual row counts are the stable comparison. On the validated PostgreSQL 16 lab,
external merge used 15584kB of disk with temp read=7774 written=8165; quicksort used 16550kB of
memory. Cleanup drops pe_sort_budget and restores the session settings.
`,
      systemsLens:
        "Memory limits turn excess working state into I/O instead of letting one operation grow without bound. The capacity calculation is multiplicative: count eligible sort and hash nodes, parallel workers and concurrent queries rather than treating work_mem as a connection-wide ceiling. Raise it locally when measured spill costs justify the peak allocation and concurrency budget; a single plan cannot justify changing the global default.",
      challenge:
        "Optional bounded-LIMIT variation, independently runnable. If interrupted, ROLLBACK, drop pe_sort_variation and reset max_parallel_workers_per_gather, lock_timeout and statement_timeout:\n\n```sql\nset lock_timeout = '3s';\nset statement_timeout = '60s';\nset max_parallel_workers_per_gather = 0;\ndrop table if exists pe_sort_variation;\ncreate table pe_sort_variation (id int primary key, sort_key text not null, payload text not null);\ninsert into pe_sort_variation\nselect g, lpad((20001 - g)::text, 6, '0'), repeat(md5(g::text), 24)\nfrom generate_series(1, 20000) g;\nanalyze pe_sort_variation;\nbegin;\nset local work_mem = '64kB';\n\\echo phase=variation_top_n\nexplain (analyze, buffers, timing off, summary off)\nselect id, sort_key, payload from pe_sort_variation order by sort_key limit 20;\ncommit;\ndrop table pe_sort_variation;\nreset max_parallel_workers_per_gather;\nreset lock_timeout;\nreset statement_timeout;\n```\n\nExpect a Limit over a Sort whose method is top-N heapsort and whose actual output is 20 rows, while its sequential-scan child still reads 20,000 rows. Holding work_mem at the core's 64 kB isolates the effect of LIMIT: it lets the sort retain only the best bounded set but does not avoid consuming all unsorted input. The measured top-N plan reported Memory: 65kB; bookkeeping and rounding mean work_mem is not an exact byte ceiling.",
    },
  ],
};
