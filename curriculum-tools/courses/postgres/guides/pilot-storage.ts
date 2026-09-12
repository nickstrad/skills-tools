import { guides as original } from "./02-storage.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "toast-and-large-values": {
    ...original["toast-and-large-values"],
    brief: `The setup creates st_toast with id, a short label and a large text body. Row 1 contains
100,000 copies of x; row 2 contains 100,000 varied characters that compress poorly. Both have the
same logical length. TOAST is PostgreSQL's way of compressing a large value or storing it in chunks
in a separate table, leaving a pointer in the main table (the heap).

We will inspect their storage, compare two reads of row 2, then compare renaming its label with
replacing its body. A buffer is a cached page; accessing one need not mean reading a storage device.`,
    predict:
      "As you run, compare the buffer work for reading only the label with reading the body, then compare changing the label with replacing the body.",
    inspect:
      `Look at the outputs in order. First compare chars with stored_bytes, then the printed heap and
toast sizes, the heap page's lp/lp_len values, and the TOAST chunk fields chunks, first_seq, last_seq,
and chunk_bytes. Next compare the top execution node's shared hit/read counters for the label query
and length(body) query; leave planning counters out and treat an omitted counter as zero. Finally
compare values, chunks, and toast_bytes_before/after_label/after_body. In the final page output,
lp is a physical slot and t_ctid is a row-version location or link, so neither is the SQL id.
If toast_name is undefined, it is a psql variable belonging to the connection that ran the storage
block. Use that connection; the query ending in \\gset can restore the variable without resetting tables.`,
    explain:
      `Did this match your guess? Think about why equal character counts can have different stored
sizes, why the body expression needs different buffer work from the label projection, and what the
two updates show about reusing or replacing an external value. Keep allocated file size, visible
chunk rows, and actual writes as separate ideas: an unchanged file size or chunk count cannot prove
that no write occurred.`,
    vary:
      `Use the supplied optional variation once. It changes id = 1's storage policy to EXTERNAL and
assigns a fresh copy of the same text, so first guess how stored_bytes and the table-wide chunk count
will change. Compare the two returned values with the initial storage output, remembering that the
chunk query includes id = 2 as well.`,
    apply:
      `A service lists document labels often, renames them sometimes, and reads full bodies rarely;
another endpoint always reads the body. Which access pattern would you keep narrow, and what would
you measure on representative documents before changing compression policy or moving bodies to a
separate store? Consider one benefit and one cost of the decision.`,
    hints: [
      "Separate logical length, compressed datum size, visible TOAST chunks, allocated relation bytes, and shared-buffer activity. Each measures a different boundary.",
      "For the variation, the policy change affects newly assigned values; it does not rewrite the existing value. Compare id = 1's returned stored_bytes and the whole-table chunk-count delta.",
    ],
    pilot: {
      question:
        "How does PostgreSQL keep a very large value manageable, and when does reading or replacing it require extra page work?",
      visual: `Main table (heap)                   TOAST table
+----+-------+--------------+       +---------+---------+-----+
| id | label | body pointer | ----> | chunk 0 | chunk 1 | ... |
+----+-------+--------------+       +---------+---------+-----+
       ^ narrow read                  ^ body access`,
      review:
        `Compare chars with stored_bytes: equal-length text can occupy very different space because repeated text compresses well. For row 2, compare the top execution node's shared hit/read counters for label and length(body), excluding Planning buffers. Reading the body can require pages beyond the heap row; a shared read is not proof of device I/O.

The label update can reuse the external body; replacing the body creates fresh external storage. Compare the visible chunks and allocated bytes before and after each update. Neither unchanged file size nor unchanged chunk count proves that no writes occurred. Physical page slots are not SQL row IDs.

For a document list that rarely displays bodies, keep the projection narrow. Measure representative payload access before deciding to move bodies to another store.`,
      minutes: [35, 45],
      cap: 60,
      phases: [
        {
          from: "",
          title: "Storage shape",
          context:
            `This block connects logical text length to physical storage. The setup has already created
st_toast. repeat makes the repeated text; generate_series supplies numbers, md5 turns each into
varied text, and string_agg joins those pieces into the second body. \\x auto adjusts psql's display.

The pg_class catalog's reltoastrelid finds the separate TOAST table; ::regclass displays its name.
length(body) counts characters; pg_column_size(body) reports stored bytes. pg_relation_size measures
one relation's allocation, while pg_total_relation_size includes its associated storage and indexes.
The \\gset command stores the result columns as psql variables; \\echo prints heap, toast and total.
:toast_name substitutes the saved table name; :'toast_name' quotes it as a SQL string when needed.

get_raw_page reads page 0 and heap_page_items decodes its slots: lp is the slot number and lp_len
its tuple length. The chunk query counts external pieces; first_seq/last_seq show their order and
chunk_bytes the largest piece. Compare the two rows' chars/stored_bytes and their lp_len values.`,
        },
        {
          from:
            "explain (analyze, buffers, costs off, timing off, summary off)\n  select label from st_toast where id = 2;",
          title: "A narrow read versus the payload",
          context:
            `Now test the mental guess against two executions of the same row lookup. EXPLAIN ANALYZE
runs the query, BUFFERS reports shared-cache activity, COSTS OFF removes estimates, TIMING OFF suppresses per-node timing, and SUMMARY OFF omits the execution summary. Compare the top execution node's shared hit and shared read
counters for selecting label and for length(body); a shared read means the page was absent from
shared_buffers, not that a device read definitely occurred.`,
        },
        {
          from:
            "select count(distinct chunk_id) as values, count(*) as chunks,\n       pg_relation_size(:'toast_name') as toast_bytes_before",
          title: "Updates and external-value reuse",
          context:
            `The baseline counts visible external values and chunks and measures the TOAST relation's
allocated bytes. The two UPDATE statements create new heap row versions: the first changes only
label, while the second supplies a new body. Compare the before/after counts and sizes. In the final
page dump, lp is a physical line-pointer slot and t_ctid identifies a current row version or its
update-chain link; these fields show physical history rather than a simple row count.`,
        },
      ],
      variation: {
        minutes: [10, 15],
        intro:
          `The optional variation introduces ALTER TABLE ... SET STORAGE EXTERNAL: it permits out-of-line
storage while disabling compression for newly assigned values. The policy alone does not rewrite
existing data. Before running it, guess whether id = 1's stored_bytes and the whole-table chunk count
will rise, fall, or stay close to their earlier values.`,
        code: `alter table st_toast alter column body set storage external;
update st_toast set body = repeat('x', 100000) where id = 1;
select id, pg_column_size(body) as stored_bytes from st_toast where id = 1;
select count(*) as chunks, max(length(chunk_data)) as chunk_bytes from :toast_name;`,
        expected:
          "The id = 1 row should report a much larger stored_bytes value than its compressed starting value, and the table-wide chunks count should increase by the fresh external value's chunks. Exact sizes depend on the server run.",
      },
    },
  },
  "buffer-cache-and-io": {
    ...original["buffer-cache-and-io"],
    brief:
      `Question: what does PostgreSQL's shared buffer cache tell you about repeated reads, dirty pages,
and a checkpoint? The experiment uses st_events and a larger st_cold table. It scans st_cold twice,
then observes st_events before and after an update and CHECKPOINT. A dirty buffer is a cached page
changed in memory that has not yet been flushed to its relation file. A shared hit means the page was
already in shared_buffers; a shared read means it was not, while the operating system may still
satisfy that read from memory.`,
    predict:
      "Compare the two scans, then check whether writing dirty pages removes them from the cache. The counters can vary with background activity.",
    inspect:
      `Read the outputs in sequence. Start with st_cold's size, pages, and shared_buffers setting,
then compare the two EXPLAIN top execution nodes' shared hit/read values. Do not add parent and child counters or include Planning buffers; an omitted counter is zero. For st_events, compare buffers
and dirty after CHECKPOINT, inspect relblocknumber/isdirty/usagecount after the UPDATE, and compare
the final buffers and dirty values after the second CHECKPOINT. Keep shared-buffer misses separate
from device I/O. If both scans are already all hits, the table was cached; that is a valid result.
A background write can clear a dirty flag before a sample, so do not chase one exact dirty count.`,
    explain:
      `Did this match your guess? Think about what the two EXPLAIN lines say about shared-buffer
residency, then compare the dirty count before and after CHECKPOINT. The useful causal explanation is
short: a repeat can reuse resident pages, an UPDATE can leave changed pages dirty, and CHECKPOINT can
flush them while allowing the buffers to remain resident. Keep the shared-buffer observation separate
from device I/O, and remember that one bounded sample cannot choose a production cache size.`,
    vary:
      `Use the supplied optional working-set variation once. Before it runs, guess whether warming
st_working_set with pg_prewarm(..., 'buffer') will reduce shared reads from the following fixed
id <= 10000 scan, or whether both scans may already be hits. Compare the two EXPLAIN lines, then
keep the result bounded: it demonstrates a cache contrast but does not size shared_buffers by itself.`,
    apply:
      `A team wants to raise shared_buffers after a dashboard's cache-hit ratio changes. What would
you measure about the production working set, concurrent relations, tail latency, dirty-page write
behavior, and operating-system cache before making that decision? Choose the evidence that would
justify the memory tradeoff.`,
    hints: [
      "Read shared hit/read as PostgreSQL buffer-cache events: a read means a page was absent from shared_buffers, while the OS or storage layer may supply it. Do not call it device I/O without a separate measurement.",
      "For the optional warming comparison, table creation may already have cached every page. Equal zero shared reads is a valid outcome: pg_prewarm need not change a fully resident working set.",
    ],
    pilot: {
      question:
        "How do shared-buffer hits, misses, dirty pages, and checkpoints relate to cache residency and write-back?",
      visual: `Query --> shared_buffers -- miss --> OS cache --> storage
             |   ^                    (may hit)
          UPDATE |
             v   | remains cached
          dirty page -- CHECKPOINT --> relation file`,
      review:
        `Compare the two scans' top execution-node shared hit/read counts. Repeating a scan can reuse resident pages; both scans may already be all hits. Do not sum parent and child buffer counters. A shared read is a PostgreSQL cache miss; the operating system may still supply the page from memory.

Compare st_events' buffers and dirty counts around UPDATE and CHECKPOINT. Changed pages can become dirty, then be written while remaining cached. Background writes can clear dirty flags before your sample, so exact counts vary.

A cache-hit ratio alone cannot justify increasing shared_buffers. Check the working set and request latency, and distinguish read pressure from dirty-page write-back.`,
      minutes: [35, 50],
      cap: 60,
      readingMinutes: [15, 25],
      phases: [
        {
          from: "",
          title: "A first scan and a repeat",
          context:
            `Run the setup in Session A before this block. SET max_parallel_workers_per_gather keeps both
scans serial. pg_relation_size gives exact bytes, pg_size_pretty formats them, and shared_buffers
sets the cache scale to compare against st_cold's pages. CREATE TABLE AS built the scan table; the
EXPLAIN ANALYZE BUFFERS queries execute it and show shared hit/read counters. COSTS OFF, TIMING OFF,
and SUMMARY OFF keep the evidence focused on buffer work.`,
        },
        {
          from:
            "checkpoint;\nselect count(*) as buffers, count(*) filter (where isdirty) as dirty\nfrom pg_buffercache\nwhere relfilenode = pg_relation_filenode('st_events')\n  and reldatabase = (select oid from pg_database where datname = current_database())\n  and relforknumber = 0;\n\nupdate st_events",
          title: "Clean resident buffers",
          context:
            `The first CHECKPOINT establishes a clean observation point. pg_buffercache exposes buffer slots;
pg_relation_filenode identifies st_events' current file, reldatabase limits the view to this database,
and relforknumber = 0 selects the main fork. count(*) FILTER (WHERE isdirty) counts only dirty slots.
This block asks whether the table can remain resident while its observed dirty count is zero.`,
        },
        {
          from: "update st_events set payload = payload || '!' where id <= 20;",
          title: "Dirty pages and checkpoint write-back",
          context:
            `UPDATE changes rows and can make one or more main-fork buffers dirty. The detailed view shows
relblocknumber, isdirty, and usagecount for those resident blocks; a read can also set hint bits, so
not every dirty observation must come from the UPDATE alone. A hint bit is cached transaction-status information in a row header; setting it can also dirty a page.
relblocknumber identifies the page, isdirty reports whether it needs writing, and usagecount is a
cache-replacement hint rather than a count of your SQL reads. Compare the final dirty and buffers
counts after CHECKPOINT. Does clearing dirty pages also remove them from the cache?`,
        },
      ],
      variation: {
        minutes: [10, 15],
        intro:
          `The optional variation introduces pg_prewarm(..., 'buffer'), which deliberately loads a relation's
pages into shared_buffers. Before running it, guess whether the first st_working_set scan will show
more shared reads than the scan after warming. The fixed id <= 10000 predicate keeps the comparison
bounded; the result still depends on the rest of the cache.`,
        code: `drop table if exists st_working_set;
create table st_working_set as select * from st_cold where id <= 10000;
explain (analyze, buffers, costs off, timing off, summary off) select count(*) from st_working_set;
select pg_prewarm('st_working_set', 'buffer');
explain (analyze, buffers, costs off, timing off, summary off) select count(*) from st_working_set;`,
        expected:
          "The first scan may already show zero shared reads if table creation left this small relation cached. After pg_prewarm, the second scan may show the same zero reads; on a quiet lab both scans can remain all hits. Exact counters vary with cache activity, and this bounded result does not size shared_buffers.",
      },
    },
  },
};
