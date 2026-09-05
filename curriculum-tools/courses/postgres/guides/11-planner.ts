import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "explain-analyze-buffers": {
    "brief":
      "Separate what a query returns, what the planner estimates and what the executor touches.",
    "predict":
      "The cancelled query returns 100 of 100,000 rows. Before adding an index, how many rows must a sequential scan inspect? Which plan fields distinguish those counts?",
    "inspect":
      "Compare estimated rows, actual rows, rows removed, and buffers before and after the status index. Find the two counts proving the UPDATE ran and rolled back.",
    "explain":
      "Why can an aggregate return one row while its child scans 100,000? Why would adding parent and child buffers double-count work?",
    "vary":
      "Change only seq_page_cost for the same unindexed predicate. Compare modeled cost and actual buffer activity, then restore the session.",
    "apply":
      "A request takes 200ms but EXPLAIN reports 20ms. What does this experiment measure, and what would you measure next before choosing an index?",
    "hints": [
      "The cost setting changes an estimate. Keep data, predicate and parallelism fixed; SET LOCAL inside a transaction restores itself at rollback.",
      "Run this after the lesson setup (or after its core, which leaves the fixture available). Use a quiet lab session.\n\n```sql\nbegin;\nset local max_parallel_workers_per_gather=0;\nexplain (analyze,buffers,timing off) select * from pl_orders where status='cancelled';\nset local seq_page_cost=10;\nexplain (analyze,buffers,timing off) select * from pl_orders where status='cancelled';\nselect count(*) as answer_rows from pl_orders where status='cancelled';\nrollback;\n```",
    ],
  },
  "statistics-drive-plans": {
    "brief":
      "Use known data to distinguish sampling noise, stale summaries, column dependence and parameter skew.",
    "predict":
      "Paris implies France in this fixture. Should adding country=fr reduce the actual answer? How might independent column estimates treat it?",
    "inspect":
      "Find the stale estimate after DELETE, the two Paris estimates before and after extended statistics, and actual tenant rows under custom and generic plans.",
    "explain":
      "Why can a generic plan hide the frequent tenant behind an average? Which evidence suggests changing statistics, and which suggests investigating plan reuse?",
    "vary":
      "Raise the statistics target for pl_orders and compare its cancelled estimate with the known count. Restore the setting and refresh the ordinary statistics afterwards.",
    "apply":
      "Choose a first intervention for a noisy rare-value estimate versus a fivefold error caused by correlated columns. Explain what each intervention cannot fix.",
    "hints": [
      "The same small table may be sampled fully at the larger target. A better estimate need not change an access path; keep actual rows as the reference.",
      "Run this after the lesson setup (or after its core, which leaves the fixture available). Use a quiet lab session.\n\n```sql\nexplain select * from pl_orders where status='cancelled';\nbegin;\nset local default_statistics_target=1000;\nanalyze pl_orders;\nexplain (analyze,buffers,timing off) select * from pl_orders where status='cancelled';\nselect count(*) as actual_cancelled from pl_orders where status='cancelled';\ncommit;\nanalyze pl_orders;\n```",
    ],
  },
  "index-scan-vs-seq-scan-crossover": {
    "brief": "Access paths trade scattered fetches against reading more data in physical order.",
    "predict":
      "As the matching range grows from 0.1% to 80%, predict which paths remain plausible. Which property of the heap could move the crossover?",
    "inspect":
      "Compare actual rows and buffers for the half-range bitmap and forced plain index scans. Are the 50,000 buffer accesses distinct heap pages?",
    "explain":
      "Why can changing random_page_cost alter a plan without changing the machine or data? What evidence would show the model is a poor fit?",
    "vary":
      "Keep the projection fixed and compare customer ranges 5 and 4000. Report plan shape, rows returned and buffer work at each bound.",
    "apply":
      "Your service mixes point lookups with broad reports. What measurements would justify a shared cost-setting change, and how would you detect harm to the other query class?",
    "hints": [
      "A selectivity sweep intentionally changes the result size. Compare competing paths at the same predicate when judging which path does less work.",
      "Run this after the lesson setup (or after its core, which leaves the fixture available). Use a quiet lab session.\n\n```sql\nbegin;\nset local max_parallel_workers_per_gather=0;\nexplain (analyze,buffers,timing off) select * from pl_orders where customer_id<=5;\nexplain (analyze,buffers,timing off) select * from pl_orders where customer_id<=4000;\nselect count(*) filter (where customer_id<=5) as small_rows,\n       count(*) filter (where customer_id<=4000) as broad_rows from pl_orders;\nrollback;\n```",
    ],
  },
  "join-strategies": {
    "brief":
      "Match the same rows while measuring repeated probes, cache reuse and retained hash state.",
    "predict":
      "There are 100,000 orders and 5,000 customer keys. How many customer index probes could a nested loop need with and without successful reuse?",
    "inspect":
      "Find the inner Index Scan loops and Memoize hits/misses. Compare the full join answer and the low-memory Hash node batches and temporary blocks.",
    "explain":
      "Explain which work Memoize avoided and why a merge join still fetched heap tuples in these fresh tables. Keep physical-state effects separate from algorithm labels.",
    "vary":
      "Hold the full nested-loop query fixed and turn Memoize off. Compare the same answer and inner loops with the cache enabled.",
    "apply":
      "For a repeated-key workload, what would you check before choosing a cache or changing a join policy? Include evictions and memory cost in your answer.",
    "hints": [
      "The lateral subquery with OFFSET 0 keeps the customer lookup on the inner side; otherwise the planner can reverse the join and obscure the cache comparison. Keep that shape fixed and toggle only Memoize. Inspect the inner scan, not just the outer loop count.",
      "Run this after the lesson setup (or after its core, which leaves the fixture available). Use a quiet lab session.\n\n```sql\nbegin;\nset local max_parallel_workers_per_gather=0;\nset local enable_hashjoin=off;\nset local enable_mergejoin=off;\nset local enable_memoize=on;\nexplain (analyze,buffers,timing off) select count(*) from pl_orders o join lateral (select id from pl_customers c where c.id=o.customer_id offset 0) c on true;\nselect count(*) as cached_answer from pl_orders o join lateral (select id from pl_customers c where c.id=o.customer_id offset 0) c on true \\gset\nset local enable_memoize=off;\nexplain (analyze,buffers,timing off) select count(*) from pl_orders o join lateral (select id from pl_customers c where c.id=o.customer_id offset 0) c on true;\nselect count(*) as uncached_answer from pl_orders o join lateral (select id from pl_customers c where c.id=o.customer_id offset 0) c on true \\gset\nselect :cached_answer=100000 and :cached_answer=:uncached_answer as unchanged_answer;\nrollback;\n```",
    ],
  },
  "work-mem-spills-to-disk": {
    "brief": "Follow an operation as its working set moves between memory and temporary storage.",
    "predict":
      "Will adding LIMIT 10 eliminate the need to inspect all input rows, or primarily change what the sort retains? Which plan field can distinguish those?",
    "inspect":
      "Record Sort Method, memory/disk use and temporary blocks at each budget. Find the hash multiplier and database counter deltas before interpreting memory or I/O totals.",
    "explain":
      "Why can a disk representation be smaller than the reported in-memory sort? Why does one node under a budget not establish a bound for the whole service?",
    "vary":
      "Compare the same sorted projection at 64kB and 32MB, capturing the last ordered id under each policy.",
    "apply":
      "A larger work_mem helps one report. What overlapping operations and worker counts must you estimate before allowing 50 concurrent reports?",
    "hints": [
      "Keep the complete projection inside the sorted subquery so changing projection does not accidentally change the sort width. Compare the result as well as spill evidence.",
      "Run this after the lesson setup (or after its core, which leaves the fixture available). Use a quiet lab session.\n\n```sql\nbegin;\nset local max_parallel_workers_per_gather=0;\nset local work_mem='64kB';\nexplain (analyze,buffers,timing off) select * from pl_orders order by amount,id offset 99999;\nselect * from pl_orders order by amount,id offset 99999 \\gset low_\nset local work_mem='32MB';\nexplain (analyze,buffers,timing off) select * from pl_orders order by amount,id offset 99999;\nselect * from pl_orders order by amount,id offset 99999 \\gset high_\nselect :low_id=:high_id as unchanged_last_id;\nrollback;\n```",
    ],
  },
  "parallel-query": {
    "brief":
      "A plan requests parallel capacity; execution reveals what it received and what that capacity cost.",
    "predict":
      "If four workers are planned and one launches, which parts of the original cost estimate may no longer describe the run? Does the query answer change?",
    "inspect":
      "Record Workers Planned, Workers Launched and participant loops. Compare repeated serial/parallel client timings while keeping the count fixed.",
    "explain":
      "Why can more workers increase coordination work and memory demand? What does a single local timing pair fail to tell you about a busy service?",
    "vary":
      "With parallel cost assumptions held fixed, compare one and four requested workers for the same count. Record the launched counts too.",
    "apply":
      "Would you favor low latency for one report or more concurrent reports? Name a workload measurement that could change your choice of parallelism.",
    "hints": [
      "Local zero costs expose a parallel shape for study; they are not production recommendations. SET LOCAL restores all controls when the transaction ends.",
      "Run this after the lesson setup (or after its core, which leaves the fixture available). Use a quiet lab session.\n\n```sql\nbegin;\nset local min_parallel_table_scan_size=0;\nset local parallel_setup_cost=0;\nset local parallel_tuple_cost=0;\nset local max_parallel_workers_per_gather=1;\nexplain (analyze,buffers,timing off) select count(*) from pl_orders;\nselect count(*) as one_answer from pl_orders \\gset\nset local max_parallel_workers_per_gather=4;\nexplain (analyze,buffers,timing off) select count(*) from pl_orders;\nselect count(*) as four_answer from pl_orders \\gset\nselect :one_answer=100000 and :one_answer=:four_answer as unchanged_answer;\nrollback;\n```",
    ],
  },
  "pg-stat-statements-as-tracing": {
    "brief":
      "Normalized counters describe accumulated work, while individual request histories need separate evidence.",
    "predict":
      "Three customer lookups differ only in their literal values. How many aggregate entries should they increment? What execution details will those entries lose?",
    "inspect":
      "Check role/database/top-level scope, interval_retained and calls_delta. Distinguish interval execution-time deltas from lifetime min/mean/max fields.",
    "explain":
      "Why can a mean hide rare slow calls? Why can another client with the same role and database contribute even after you apply these scope filters?",
    "vary":
      "Capture a fresh baseline, execute exactly two literal variants of one lookup, and inspect their aggregate increment alongside client timings.",
    "apply":
      "Choose evidence for ranking total query cost versus diagnosing a particular slow request. What would make your before/after interval invalid?",
    "hints": [
      "Join counters within a fixed role, database and top-level scope. Check retention; do not reset shared telemetry or infer p99 from a mean.",
      "Run this after the lesson setup (or after its core, which leaves the fixture available). Use a quiet lab session.\n\n```sql\ndrop table if exists pg_temp.pl_hint_before;\nselect stats_reset as reset_before,dealloc as evictions_before from pg_stat_statements_info \\gset\ncreate temp table pl_hint_before as\nselect queryid,calls,total_exec_time from pg_stat_statements\nwhere dbid=(select oid from pg_database where datname=current_database())\n  and userid=(select usesysid from pg_user where usename=current_user) and toplevel;\n\\timing on\nselect count(*) from pl_orders where customer_id=7;\nselect count(*) from pl_orders where customer_id=42;\n\\timing off\nselect s.queryid,s.calls-coalesce(b.calls,0) as calls_delta,\n       s.total_exec_time-coalesce(b.total_exec_time,0) as exec_ms_delta\nfrom pg_stat_statements s left join pl_hint_before b using(queryid)\nwhere s.dbid=(select oid from pg_database where datname=current_database())\n  and s.userid=(select usesysid from pg_user where usename=current_user) and s.toplevel\n  and s.query like '%pl_orders%' and s.calls>coalesce(b.calls,0);\nselect stats_reset=:'reset_before'::timestamptz and dealloc=:evictions_before as interval_retained\nfrom pg_stat_statements_info;\ndrop table pl_hint_before;\n```",
    ],
  },
};
