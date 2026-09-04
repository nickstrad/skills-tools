import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "hot-updates-and-fillfactor": {
    brief:
      "A HOT update keeps an index entry pointing at the same heap page while a later row version is reached through an in-page chain. Fillfactor is the amount of room PostgreSQL leaves during initial loading, so it can affect whether that chain fits.",
    predict:
      "Before running it, name one controlled contrast: for the same non-indexed tag changes, which fillfactor pair or transaction shape do you expect to show the larger HOT/total ratio, and why?",
    inspect:
      "Read reloptions and pages first, then n_tup_upd, n_tup_hot_upd, hot_pct, and finally lp_flags and t_ctid. Which output establishes the update count, and which one gives physical chain evidence?",
    explain:
      "Explain the causal chain from reserved page room and unchanged indexed keys, through an in-page replacement version, to less index maintenance. Then explain how separately committed statements change when old versions can become removable.",
    vary:
      "Use the supplied fresh st_hot_var_100 and st_hot_var_80 pair. Compare their ten-round total/HOT counters and pages; do not change row width, indexes, or the transaction shape.",
    apply:
      "A service has a narrow, read-heavy table with occasional status updates, and another with frequent updates to a non-indexed status field. What measurements would justify different fillfactors, and what read-space cost would you accept?",
    hints: [
      "HOT is about an unchanged index key and space on the old heap page; it is not a guarantee attached to a fillfactor value.",
      "In psql run: DROP TABLE IF EXISTS st_hot_var_100, st_hot_var_80; CREATE TABLE st_hot_var_100(id int primary key, tag text, payload text) WITH (fillfactor=100, autovacuum_enabled=off); CREATE TABLE st_hot_var_80(id int primary key, tag text, payload text) WITH (fillfactor=80, autovacuum_enabled=off); INSERT INTO st_hot_var_100 SELECT g, 'a', repeat('p',200) FROM generate_series(1,100) g; INSERT INTO st_hot_var_80 SELECT g, 'a', repeat('p',200) FROM generate_series(1,100) g; SELECT format('update %I set tag = %L', relname, 'variation-' || round_no) FROM generate_series(1,10) round_no CROSS JOIN (VALUES ('st_hot_var_100'),('st_hot_var_80')) AS t(relname) ORDER BY round_no, relname \\gexec\nSELECT pg_stat_force_next_flush(); SELECT pg_stat_clear_snapshot(); SELECT relname,n_tup_upd,n_tup_hot_upd FROM pg_stat_user_tables WHERE relname IN ('st_hot_var_100','st_hot_var_80') ORDER BY relname;",
    ],
  },
  "toast-and-large-values": {
    brief:
      "TOAST is PostgreSQL's storage path for variable-length values that do not fit comfortably in a heap tuple. Compression can reduce a value enough to remain inline; otherwise the heap stores a pointer to ordered chunks in a side relation.",
    predict:
      "Name one controlled contrast: for row 2, which plan should show more buffer activity, selecting label or computing length(body), and what data must the latter reach?",
    inspect:
      "Inspect chars and stored_bytes, then toast_name, chunks, chunk_seq, and EXPLAIN's shared hit/read fields. After each update, compare values, chunks, toast_bytes, lp_len, and t_ctid rather than file size alone.",
    explain:
      "Explain the chain from a wide datum to compression or an external pointer, then from payload access to a TOAST index and chunk reads. Explain why a label-only update can preserve the existing external datum while replacing body creates another value version.",
    vary:
      "Run the provided STORAGE EXTERNAL challenge for row 1, update its body, and compare pg_column_size(body) with the chunk query already in the lesson. Change only the storage policy.",
    apply:
      "An API lists document titles frequently but reads full documents rarely, while another endpoint always reads full values. How would you measure whether their schema needs a different projection, table boundary, or storage policy?",
    hints: [
      "A narrow projection can use the heap tuple without asking PostgreSQL to reconstruct the external body.",
      "After rerunning setup and the lesson's code, run: SELECT reltoastrelid::regclass AS toast_name FROM pg_class WHERE oid = 'st_toast'::regclass \\gset\nALTER TABLE st_toast ALTER COLUMN body SET STORAGE EXTERNAL; UPDATE st_toast SET body = repeat('x',100000) WHERE id = 1; SELECT id, pg_column_size(body) FROM st_toast WHERE id = 1; SELECT count(*) AS chunks, max(length(chunk_data)) AS chunk_bytes FROM :toast_name;",
    ],
  },
  "buffer-cache-and-io": {
    brief:
      "shared_buffers is PostgreSQL's shared page cache. A dirty buffer contains a changed page that still needs writing; a checkpoint flushes eligible dirty buffers but does not require them to leave memory.",
    predict:
      "Name one controlled contrast: for the same st_cold scan, how should the first and repeat EXPLAIN buffer lines differ, and what does each shared read actually prove?",
    inspect:
      "Inspect the relation's pages and shared_buffers setting, then EXPLAIN's shared hit/read/dirtied values. For st_events, inspect buffers, dirty, relblocknumber, isdirty, and usagecount before the update, after it, and after CHECKPOINT.",
    explain:
      "Explain the causal chain from a buffer miss to shared-buffer population, from an update or hint bit to a dirty page, and from CHECKPOINT to a clean but still resident buffer. Include why an OS-cache hit is still possible after PostgreSQL reports a read.",
    vary:
      "Run the supplied st_working_set challenge exactly once: compare the first scan with the scan after pg_prewarm(..., 'buffer'). Keep the row predicate fixed at id <= 10000.",
    apply:
      "A team wants to raise shared_buffers after a cache-hit dashboard changes. Which workload sizes, concurrent relations, tail-latency observations, and OS-cache limits would you need before making that tradeoff?",
    hints: [
      "PostgreSQL's buffer counters describe shared_buffers; they cannot by themselves separate operating-system memory from device I/O.",
      "Use EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY OFF) SELECT count(*) FROM st_working_set; before and after the supplied pg_prewarm call.",
    ],
  },
};
