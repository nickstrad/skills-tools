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
    brief: `The experiment will create st_toast, a table with three columns: id, label (short text),
and body (large text). It will insert these two rows; you do not need to create them yet:

| Row identified by | label | body |
| --- | --- | --- |
| id = 1 | compressible | The character x repeated 100,000 times. |
| id = 2 | incompressible | 100,000 characters of varied text that compresses poorly. |

Both bodies have the same character count. TOAST is PostgreSQL's way of keeping a row small:
it can compress a large value or store it in chunks in a separate table, leaving a pointer in
the main table (the heap). A value kept in the heap row is called inline; one stored separately
is called out of line.

You will first inspect how the two bodies are stored, then compare two reads of id = 2,
and finally compare changing its label with replacing its body. The read comparison below
is your prediction. A buffer access means accessing a page through PostgreSQL's shared cache;
it does not necessarily mean reading from disk.`,
    predict:
      `For the row WHERE id = 2, compare fetching its short label with computing length(body),
which counts the characters in its large text value. Both queries find the same row and return
one result; only the requested column or expression changes.

Which do you expect to need more buffer accesses, or do you expect a tie? Explain what data
each operation needs. A sentence is enough; you do not need to predict an exact count. The run
step supplies both queries and uses EXPLAIN (ANALYZE, BUFFERS) to measure them.`,
    inspect: `Use the output saved from run, in this order:

1. **Storage:** compare chars and stored_bytes for id = 1 and id = 2. Then look at heap and
   toast sizes, the first lp_len output (heap tuple lengths in bytes), and chunks, first_seq,
   last_seq, and chunk_bytes. Which observations distinguish logical text length from its
   physical storage?
2. **Your prediction:** compare the execution Buffers lines for selecting label and computing
   length(body), both WHERE id = 2. Record shared hit and read counts, treating an omitted
   counter as zero. Compare the top execution node's totals; do not add parent and child
   counts together or include Planning buffers. Did the observed accesses match your prediction?
3. **Updates:** compare the three values/chunks outputs and toast_bytes_before,
   toast_bytes_after_label, and toast_bytes_after_body. These are visible external-value counts
   and allocated file sizes, respectively. What changed after each update? In the final page
   output, lp identifies a physical row-version slot, not the SQL id; t_ctid is a row-version
   location or link. Do not equate the number of slots with the number of current SQL rows.

Keep observations separate from explanations for now. Next: pgcoach 9 explain.`,
    explain: `Use your measurements to explain three things in your own words:

1. How can two bodies with the same character count occupy different amounts of storage?
2. Why did the two reads of id = 2 produce the buffer counts you observed? Trace where each
   query gets its data: the heap row, and any separate TOAST data it needs.
3. What do the label-only and body-replacement updates suggest about reusing an existing
   external value? Does an unchanged visible chunk count or file size prove that no write occurred?

Use pgcoach 9 reveal to check your explanation, then pgcoach 9 vary for one controlled change.`,
    vary: `Return to id = 1, whose body is still 100,000 copies of x. Predict what will happen to
its stored_bytes and the table's visible chunk count if compression is disabled for a freshly
supplied copy of that same text. The setting is called STORAGE EXTERNAL: it permits out-of-line
storage but disables compression. Changing the setting alone does not rewrite existing values.

Continue in the same psql session after run. Save id = 1's original stored_bytes and the most
recent chunks count for comparison. Run the commands supplied by pgcoach 9 hint2; use
pgcoach 9 hint1 if you want a smaller nudge first. The chunk query counts chunks for the whole
table, including id = 2. Compare its before/after difference, not its total as if it were all
id = 1. Afterwards, continue with pgcoach 9 apply.`,
    apply: `An API frequently lists document labels, occasionally renames them, and rarely reads
full bodies. Another endpoint always reads the full body. Based on this experiment, what would
you select for the listing query, and what would you measure on representative documents before
changing compression policy or moving bodies to another table or service? Name one benefit and
one cost of the change you would consider.`,
    hints: [
      "For the variation, keep id = 1's text identical. Set body's storage policy to EXTERNAL, then assign repeat('x', 100000) again so PostgreSQL stores a fresh value under that policy. Compare its stored_bytes and the change in the whole table's visible chunk count. You do not need to recreate the table.",
      "Run this once after the main experiment, in the same psql session. toast_name is the variable saved by run; if you lost the session, rerun pgcoach 9 run's setup and SQL first. Compare with your saved values before running the variation again.\n\n```sql\nalter table st_toast alter column body set storage external;\nupdate st_toast set body = repeat('x', 100000) where id = 1;\nselect id, pg_column_size(body) as stored_bytes from st_toast where id = 1;\nselect count(*) as chunks, max(length(chunk_data)) as chunk_bytes from :toast_name;\n```\n\nThese are the same commands as the full lesson's challenge. Next: pgcoach 9 apply.",
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
