import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "vacuum-reclaims-in-place": {
    brief:
      "VACUUM changes whether bytes can be reused; it does not normally shorten the heap file.",
    predict: "Which numbers should change after vacuum: page count, dead tuples, or free bytes?",
    inspect:
      "Compare pgstattuple and pg_freespace before and after the verbose VACUUM, then after reinsertion.",
    explain: "Why can new rows fit without a smaller relation file?",
    vary:
      "Immediately after the first VACUUM, before reinserting rows, run a second VACUUM and inspect its scan and index-cleanup output.",
    apply:
      "How would you distinguish healthy reusable bloat from a table that is still losing the cleanup race?",
    hints: [
      "The setup is self-contained; rerun it before trying the variation.",
      "Run: vacuum (verbose) vac_t; and compare the tuple-removal and index-scan lines with the first run.",
    ],
  },
  "vacuum-full-rewrites-and-locks": {
    brief: "A rewrite returns file space by moving live rows, so it needs an exclusive lock.",
    predict: "Which lock request waits while B holds its reader transaction?",
    inspect:
      "Find granted and ungranted pg_locks rows, then compare the relation filepath before and after.",
    explain:
      "Why does reclaiming interior holes differ from truncating an empty tail or rewriting live rows?",
    vary:
      "Repeat the same lock schedule with a longer reader hold; compare the lock modes before releasing B.",
    apply: "What availability window would you need before scheduling a rewrite on a busy table?",
    hints: [
      "B holds the reader lock and also runs the observation query while A is blocked.",
      "In B, replace select pg_sleep(1) with select pg_sleep(3); run B's supplied pg_locks query, then commit in B to release A.",
    ],
  },
  "visibility-map-and-index-only-scans": {
    brief:
      "The visibility map lets an index-only scan skip heap visibility checks for all-visible pages.",
    predict: "What will the scattered updates change even though the index itself is unchanged?",
    inspect: "Compare all_visible and Heap Fetches across the three EXPLAIN outputs.",
    explain: "Why does write locality affect index-only scan cost?",
    vary: "Concentrate the updates on id <= 200 and compare Heap Fetches with the scattered case.",
    apply: "Which write pattern could make a read-heavy covering index quietly lose its advantage?",
    hints: [
      "Keep the supplied planner settings so plan shape does not hide the visibility effect.",
      "After rerunning setup, run: update vac_t set pad = 'z' where id <= 200; then repeat the supplied EXPLAIN.",
    ],
  },
  "autovacuum-triggers": {
    brief: "Eligibility, launcher scheduling, and worker completion are separate observations.",
    predict:
      "What proves that the table crossed its threshold even if no worker appears during the poll?",
    inspect:
      "Record reloptions, n_dead_tup, autovacuum_count, last_autovacuum, and any progress row.",
    explain: "Why does a one-minute poll provide evidence but not a deadline guarantee?",
    vary: "Repeat the bounded batches with a table-local vacuum cost delay, then reset it.",
    apply:
      "Which time-series signals show a sustained cleanup backlog rather than a single delayed run?",
    hints: [
      "The final RESET is part of the experiment; run it even when no worker was observed.",
      "After rerunning setup, run: alter table vac_t set (autovacuum_vacuum_cost_delay = 20); then use the supplied three-batch command and RESET the option.",
    ],
  },
};
