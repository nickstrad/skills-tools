import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "btree-page-anatomy": {
    "brief":
      "Connect an ordered index to its stored pages and the heap tuples its leaves reference.",
    "predict":
      "The same100,000 logical keys have narrow and wide representations. Predict which footprint is larger, and whether that requires an extra tree level.",
    "inspect":
      "Compare bytes, metapage root levels and leaf item sizes. Find the filtered leaf entry that points to id50000 and distinguish a high key from a real heap pointer.",
    "explain":
      "Why must build history and row count match before attributing a layout difference to keys? Why is inspecting a tree level not a device-I/O measurement?",
    "vary":
      "Add payload to the wide composite key, compare bytes and level, and drop that trial index.",
    "apply":
      "Choose evidence for a compact key representation in a lookup-heavy system, including storage, cache demand and the correctness cost of any truncation or hashing.",
    "hints": [
      "A wider entry can grow the leaf count without crossing a height threshold. Use pg_relation_size and bt_metap together.",
      "Rerun this lesson's setup first, then use these commands. Follow session labels in the two-session variation; all other hints use one psql session. Deliberate errors are labelled.\n\n```sql\ncreate index ix_btree_wide_payload on ix_btree(wide,payload);\nselect 'wide' as index,pg_relation_size('ix_btree_wide_idx') as bytes,level from bt_metap('ix_btree_wide_idx')\nunion all\nselect 'wide_payload',pg_relation_size('ix_btree_wide_payload'),level from bt_metap('ix_btree_wide_payload');\ndrop index ix_btree_wide_payload;\n```",
    ],
  },
  "create-index-concurrently-and-invalid-indexes": {
    "brief": "Separate an index existing, being maintained and being valid for queries.",
    "predict":
      "A builder has filled the index but an old reader remains. Which flag could already be true while validity remains false?",
    "inspect":
      "Use the bounded progress observation, blocker PID and catalog flags. After failure, identify exactly which owned index is invalid; after retry, verify both flags and row counts.",
    "explain":
      "Why does a fresh observer see an index that the snapshot holder cannot see in its ordinary catalog query? What work might a ready-but-invalid index still impose?",
    "vary":
      "Cause the unique-build failure on one inserted duplicate, clean up that artifact, repair the input and retry.",
    "apply":
      "What states and deadlines would your deployment check before declaring an index migration successful? What information would it retain after an interrupted build?",
    "hints": [
      "An object name existing is insufficient. Do not retry using the same name until you inspect and remove the failed artifact; preserve the original5,000 rows.",
      "Rerun this lesson's setup first, then use these commands. Follow session labels in the two-session variation; all other hints use one psql session. Deliberate errors are labelled.\n\n```sql\nset statement_timeout='15s';\ninsert into ix_cic values(5001,'user1@example.com');\n-- Expected23505; continue with inspection and cleanup in this session.\ncreate unique index concurrently ix_cic_email_uk on ix_cic(email);\nselect indexrelid::regclass,indisready,indisvalid from pg_index where indrelid='ix_cic'::regclass;\ndrop index concurrently ix_cic_email_uk;\ndelete from ix_cic where id=5001;\ncreate unique index concurrently ix_cic_email_uk on ix_cic(email);\nselect indexrelid::regclass,indisready,indisvalid from pg_index where indrelid='ix_cic'::regclass;\nselect count(*) as rows,count(distinct email) as unique_emails from ix_cic;\ndrop index concurrently ix_cic_email_uk;\nreset statement_timeout;\n```",
    ],
  },
  "partial-and-covering-indexes": {
    "brief":
      "Choose which rows and columns to maintain in an index by comparing read work, write eligibility and footprint.",
    "predict":
      "If amount is included but note is not, which update changes indexed data? Can a covered read still need heap visibility checks?",
    "inspect":
      "Check unchanged_sum, key-only versus covering buffers, missing-note heap access and the matched transaction-local HOT counts. Verify same_contents before interpreting the physical difference.",
    "explain":
      "Why does the current data making status<>done equivalent to pending fail to prove that equivalence for future rows? Why can INCLUDE cost more than its payload bytes alone?",
    "vary":
      "Change note on the same100 well-spaced rows in both small fixtures. Neither tenant index stores note; compare their HOT counts.",
    "apply":
      "For a queue with a small pending subset and a frequently changing payload, which index would you try first and which read/write evidence could reverse that choice?",
    "hints": [
      "Read pg_stat_xact_user_tables before COMMIT. The supplied setup leaves equal spare space; changing an unindexed note is the one variable relative to the core amount update.",
      "Rerun this lesson's setup first, then use these commands. Follow session labels in the two-session variation; all other hints use one psql session. Deliberate errors are labelled.\n\n```sql\nbegin;\nupdate ix_hot_plain set note='changed' where id%20=0;\nupdate ix_hot_cover set note='changed' where id%20=0;\nselect relname,n_tup_upd,n_tup_hot_upd from pg_stat_xact_user_tables\nwhere relid in ('ix_hot_plain'::regclass,'ix_hot_cover'::regclass) order by relname;\ncommit;\nselect (select count(*) from ix_hot_plain where note='changed')=100\n   and (select count(*) from ix_hot_cover where note='changed')=100 as same_changed_rows;\n```",
    ],
  },
  "index-bloat-from-churn": {
    "brief":
      "Measure how updates leave reusable space before choosing whether a replacement index is worth building.",
    "predict":
      "After one update/vacuum round increases the file size, must another equal round increase it again? What could two rounds establish, and what could they not?",
    "inspect":
      "Compare post-churn range counts and sums across the rebuild, then bytes, density, file identity, validity and range buffers.",
    "explain":
      "Why can a smaller rebuilt index leave a sampled query almost unchanged? What separates layout evidence from application latency evidence?",
    "vary":
      "Measure a wider current range before and after a rebuild while keeping its count and sum fixed.",
    "apply":
      "Defend a rebuild or a decision to keep the existing index using workload benefit, space headroom, lock waits and expected future churn.",
    "hints": [
      "Both measurements must use the same post-update data. This hint creates one bounded churn round first; the rebuild changes only the structure.",
      "Rerun this lesson's setup first, then use these commands. Follow session labels in the two-session variation; all other hints use one psql session. Deliberate errors are labelled.\n\n```sql\nupdate ix_churn set k=(k*31+17)%100000 where id%2=0;\nvacuum ix_churn;\nset enable_seqscan=off;\nselect count(*) as before_rows,sum(k) as before_sum from ix_churn where k between 1000 and 10000 \\gset\nselect pg_relation_size('ix_churn_k') as before_bytes;\nexplain(analyze,buffers,costs off) select count(*) from ix_churn where k between 1000 and 10000;\nreindex index concurrently ix_churn_k;\nselect pg_relation_size('ix_churn_k') as after_bytes;\nexplain(analyze,buffers,costs off) select count(*) from ix_churn where k between 1000 and 10000;\nselect count(*)=:before_rows and sum(k)=:before_sum as unchanged_range\nfrom ix_churn where k between 1000 and 10000;\nreset enable_seqscan;\n```",
    ],
  },
  "unique-index-enforcement-under-concurrency": {
    "brief":
      "Enforce one active row inside the write path while retaining released ownership history.",
    "predict":
      "Both clients read zero active rows. What prevents two active inserts from committing, and why does a later released insert remain legal?",
    "inspect":
      "Observe B blocked by A, the duplicate-key error after A commits, and the final active_count and owner. Inspect the nonnull/state constraints defining the domain.",
    "explain":
      "Why is this stronger than check-then-insert but insufficient to reject an old process at a separate external service? What does an identity gap tell you?",
    "vary":
      "Retain another released history row, create one active row and try to create a second. Verify the active count after the expected error.",
    "apply":
      "Would zero idx_scan justify dropping this partial unique index? State the invariant a migration must preserve even if no read query uses the index.",
    "hints": [
      "Released history is outside the predicate. A local uniqueness error says nothing about a previous owner already sending external work.",
      "Rerun this lesson's setup first, then use these commands. Follow session labels in the two-session variation; all other hints use one psql session. Deliberate errors are labelled.\n\n```sql\ninsert into ix_uniq(resource,owner,state) values('shard-1','history','released');\ninsert into ix_uniq(resource,owner,state) values('shard-1','node-a','active');\n-- Expected23505: the first active row remains committed.\ninsert into ix_uniq(resource,owner,state) values('shard-1','node-b','active');\nselect state,count(*) from ix_uniq where resource='shard-1' group by state order by state;\nselect count(*)=1 as one_active from ix_uniq where resource='shard-1' and state='active';\n```",
    ],
  },
  "keyset-pagination-and-concurrent-writes": {
    "brief":
      "A cursor continues after an observed ordered pair; OFFSET skips a prefix of the current result.",
    "predict":
      "A reads ids1–5, then B inserts before them. Which id will A see at OFFSET5 in a fresh snapshot, and which follows its saved key pair?",
    "inspect":
      "Check same_deep_page, the deep scan rows/buffers, and the actual saved timestamp/id pair. After insertion compare the first returned ids.",
    "explain":
      "Why must both ORDER BY and the cursor include id for tied timestamps? Why does acquiring a deep cursor cost work, and why is a cursor not a fixed snapshot?",
    "vary":
      "Repeat the earlier insertion inside one repeatable-read transaction, then inspect the offset again after ending that transaction.",
    "apply":
      "Design a continuation contract for a list whose sort keys can change. State whether it promises a live continuation or a fixed snapshot and what storage/lifetime that requires.",
    "hints": [
      "A must acquire its snapshot before B inserts. Save both cursor fields in A; end its transaction before testing the fresh snapshot and cleaning up.",
      "Rerun this lesson's setup first, then use these commands. Follow session labels in the two-session variation; all other hints use one psql session. Deliberate errors are labelled.\n\n```sql\n-- Session A\nbegin isolation level repeatable read;\nselect id,created_at from ix_page order by created_at,id limit 5;\nselect created_at as boundary_created_at,id as boundary_id\nfrom ix_page order by created_at,id offset 4 limit 1 \\gset\n-- Session B: independent autocommit insert.\ninsert into ix_page values(100001,timestamptz '2025-12-31 23:59:59+00',repeat('n',80));\n-- Session A: both reads still use the original snapshot.\nselect id as rr_offset from ix_page order by created_at,id offset 5 limit 1 \\gset\nselect id as rr_keyset from ix_page\nwhere(created_at,id)>(:'boundary_created_at'::timestamptz,:boundary_id)\norder by created_at,id limit 1 \\gset\nselect :rr_offset as rr_offset,:rr_keyset as rr_keyset,:rr_offset=6 and :rr_keyset=6 as stable_page;\ncommit;\nselect id as fresh_offset from ix_page order by created_at,id offset 5 limit 1;\ndelete from ix_page where id=100001;\n```",
    ],
  },
};
