import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "xids-and-the-transaction-counter": {
    brief:
      "Transaction IDs identify writes. Predict the first statement that needs one before running the two sessions.",
    predict: "Which calls return NULL, and which two values should be consecutive?",
    inspect: "Compare xid_after_first_write with the transactionid row in pg_locks.",
    explain: "Explain why a snapshot can exist without a real xid, but a write cannot.",
    vary: "Force an xid in a read-only transaction and compare it with the lazy case.",
    apply: "When would spending a global identifier on every read become an operational cost?",
    hints: [
      "Start with the supplied Session A commands; do not call pg_current_xact_id early.",
      "Run: begin; select pg_current_xact_id_if_assigned(); select pg_current_xact_id(); commit;",
    ],
  },
  "snapshot-anatomy": {
    brief: "A snapshot is a bounded view of committed and still-running transaction IDs.",
    predict:
      "Where should B's xid appear while B is open, and why does A need its extra committed write?",
    inspect: "Match b_xid against in_progress, then compare Carol before and after B commits.",
    explain:
      "Explain xmin, xmax, and the exception list without treating the snapshot as a vector clock.",
    vary:
      "Hold a repeatable-read snapshot across a commit and compare its text with read committed.",
    apply:
      "Which application read needs a stable view, and which benefits from a fresh view per statement?",
    hints: [
      "Read the snapshot in the same statement that extracts xmin, xmax, and xip.",
      "Run: begin isolation level repeatable read; select pg_current_snapshot(); select pg_current_snapshot(); commit;",
    ],
  },
  "two-sessions-see-different-versions": {
    brief:
      "One page can hold both row versions while different snapshots choose different visible ones.",
    predict: "Will A's second SELECT show B's update before A commits?",
    inspect: "Follow lp 1's t_ctid to the newer tuple and compare A's visible ctid with B's.",
    explain: "Why can raw page inspection show bytes that an ordinary SELECT does not return?",
    vary: "Update Alice again and trace the resulting tuple chain.",
    apply: "How does this let readers proceed while a writer commits a replacement version?",
    hints: [
      "Keep Session A's repeatable-read transaction open until after its second SELECT.",
      "Run in Session B: update mv_accounts set balance = balance + 1 where id = 1; then inspect heap_page_items(get_raw_page('mv_accounts', 0)).",
    ],
  },
  "commit-visibility-and-clog": {
    brief: "Row bytes and commit status are separate facts; abort changes the latter first.",
    predict: "Which rows are visible inside the doomed transaction and after ROLLBACK?",
    inspect: "Compare pg_xact_status for the saved xids with the raw page's t_xmin values.",
    explain: "Why can rollback be cheap even after several writes?",
    vary:
      "Run the supplied fresh mv_hint variation: inspect, perform a normal SELECT, then inspect again.",
    apply: "What small durable record tells a recovery process whether bulky data became visible?",
    hints: [
      "Use the supplied \\gset commands so each xid survives the transaction boundary.",
      "Use the challenge's fresh mv_hint table; run SELECT lp, t_infomask FROM heap_page_items(get_raw_page('mv_hint', 0)); then SELECT * FROM mv_hint; then repeat the page query. Raw inspection alone does not check tuple visibility.",
    ],
  },
  "xmin-horizon-blocks-cleanup": {
    brief: "The matched runs separate ordinary cleanup from retention caused by one old snapshot.",
    predict:
      "Which measurements must stay at ten rows, and which must differ between the baseline and pinned run?",
    inspect:
      "Match mvcc-horizon-reader.backend_xmin to VACUUM's removable cutoff, then compare pinned_dead and released_dead.",
    explain: "Why do released pages often remain allocated even after released_dead becomes zero?",
    vary: "Repeat the pinned run with B open but without a SELECT.",
    apply: "Which dashboard should identify a long-lived snapshot before bloat consumes capacity?",
    hints: [
      "The generated UPDATE statements must remain outside BEGIN; \\gexec sends them separately.",
      "For the variation, run in B: begin; then run A's generated updates and VACUUM without issuing a SELECT in B.",
    ],
  },
  "wraparound-and-freezing": {
    brief: "Freezing makes old committed tuples safe across the finite xid counter's half-range.",
    predict:
      "Which value changes after burning xids, and which header field should not change after freezing?",
    inspect: "Compare rel_age and the frozen-tuple count before and after VACUUM FREEZE.",
    explain: "Why are physical xmin bytes preserved while visibility treats the tuple as frozen?",
    vary: "Use a session freeze minimum age of zero, then compare ordinary VACUUM with FREEZE.",
    apply:
      "Why is wraparound prevention a correctness deadline rather than optional space cleanup?",
    hints: [
      "Treat the measured ages, not an assumed exact number of burned xids, as evidence.",
      "Run: set vacuum_freeze_min_age = 0; vacuum mv_accounts; then recheck age(relfrozenxid).",
    ],
  },
};
