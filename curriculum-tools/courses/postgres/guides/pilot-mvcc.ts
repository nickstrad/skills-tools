import { guides as original } from "./03-mvcc.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "xids-and-the-transaction-counter": {
    ...original["xids-and-the-transaction-counter"],
    brief:
      "Setup creates or resets mv_accounts: Alice is id = 1, Bob is id = 2, and Carol is id = 3, each starting with balance = 100. Two psql sessions are used to show when PostgreSQL assigns a real transaction ID (xid). BEGIN keeps a transaction open and COMMIT finishes it. A read-only transaction can have a virtual identity and a snapshot without reserving a numeric xid. Session A will count rows, sum balances, then update Alice; B will update Bob while A stays open. The function pg_current_xact_id_if_assigned() observes an existing numeric xid without forcing one, while pg_current_xact_id() requests one. The pg_locks view lets us connect this identity to a held lock.",
    predict:
      "When do you expect Session A to first show a numeric xid: at BEGIN, after its reads, or after UPDATE? Make a quick guess. Later compare B's number with A's too; unrelated writers may create gaps, so exact adjacency is not required.",
    inspect:
      "Using the output already produced by the labelled sessions, compare xid_outside_any_transaction and xid_after_two_reads with xid_after_first_write. Compare the before/after pg_locks rows filtered by pg_backend_pid(): virtualxid identifies the session's cheap transaction identity, while transactionid names a real xid lock. In Session B, compare b_xid_before_write with b_xid_after_write. At the end, compare read_only_transaction_xid with forced_xid and notice which call caused allocation.",
    explain:
      "Compare your guess mentally with the output: ordinary reads used a snapshot but did not need a real xid, while the first UPDATE needed one for the new row version and transaction visibility. Notice why pg_locks can show virtualxid before a transactionid row, and why pg_current_xact_id() changes the read-only case. Treat the observed IDs as examples from this run, not universal values or a promise that unrelated writers cannot consume numbers between two sessions.",
    vary:
      "Optionally run the supplied forced-ID variation in one labelled Session A. It repeats the read-only case, first checking pg_current_xact_id_if_assigned(), then deliberately calling pg_current_xact_id(), and finally committing. Compare the two result cells and notice why asking for the current xid is itself state-changing even though no table row was updated.",
    apply:
      "An xid is cluster-wide metadata with commit-status bookkeeping. For a read-heavy service, when would assigning a real xid to every read increase shared bookkeeping or cleanup pressure? Consider one workload signal you would inspect before changing transaction behavior.",
    hints: [
      "The comparison is about allocation timing: pg_current_xact_id_if_assigned() reports an already-assigned xid without creating one; pg_current_xact_id() creates one when needed. The UPDATE is the first ordinary write in each writer session. Use NULL versus a numeric value as your primary evidence, then use pg_locks to connect that number to a transactionid row.",
      "For the forced-ID variation, keep the comparison narrow: pg_current_xact_id_if_assigned() only reports an existing assignment, while pg_current_xact_id() allocates one when needed. Use the supplied Session A commands and compare the two named outputs; the absolute xid varies with other cluster activity.",
    ],
    pilot: {
      question:
        "When does PostgreSQL reserve a real transaction ID, and what does a read-only transaction have instead?",
      minutes: [25, 35],
      cap: 60,
      phases: [
        {
          from: "",
          title: "Session A: read first, then make the first write",
          context:
            "Use Session A for the first block. The prepared table has three account rows. COUNT(*) and SUM(balance) are reads; pg_current_xact_id_if_assigned() only reports an xid that already exists; pg_locks, filtered by pg_backend_pid(), shows this connection's virtualxid and any transactionid lock. First inspect the read-only state, then update account 1 and inspect again. Notice the point at which the evidence can change, without trying to guess exact cluster-wide numbers.",
        },
        {
          from: "-- Session B\nbegin;",
          title: "Session B: allocate an xid at its first write",
          context:
            "Switch to a second psql session for this block while Session A remains open. BEGIN starts B's transaction; pg_current_xact_id_if_assigned() checks without forcing an xid; UPDATE creates a new version for account 2. Compare b_xid_before_write with b_xid_after_write and compare the two writer IDs as observations from this run. Keep the session open until its block is complete.",
        },
        {
          from: "-- Session A\ncommit;",
          title: "Session A: publish its row version",
          context:
            "Return to Session A and run COMMIT. This ends A's writing transaction, publishes its account-1 version to later snapshots, and releases its transaction locks. There is no new measurement in this small boundary; it establishes the order for B's commit and the final read-only check.",
        },
        {
          from: "-- Session B\ncommit;",
          title: "Session B: publish its row version",
          context:
            "Run COMMIT in Session B. This completes the second writer and releases B's locks. The important boundary is that both data-changing transactions now finish before the final read-only transaction tests whether reading alone receives a real xid.",
        },
        {
          from:
            "-- Session A\nbegin;\nselect count(*) from mv_accounts;\nselect pg_current_xact_id_if_assigned() as read_only_transaction_xid;",
          title: "Session A: compare a read-only transaction with forced allocation",
          context:
            "Use Session A for the final block. BEGIN opens a new transaction, COUNT(*) reads the prepared table, and pg_current_xact_id_if_assigned() checks whether those reads assigned a real xid. After COMMIT ends that transaction, pg_current_xact_id() is called outside it and explicitly requests an xid. Compare the two calls and notice the difference between observing identity and forcing identity.",
        },
      ],
      variation: {
        minutes: [10, 15],
        intro:
          "This optional variation isolates the forcing function in a fresh read-only transaction. It uses one psql session and changes no table rows.",
        code:
          "-- Session A\nBEGIN;\nSELECT pg_current_xact_id_if_assigned() AS xid_before_force;\nSELECT pg_current_xact_id() AS forced_xid;\nCOMMIT;",
        expected:
          "xid_before_force is NULL because no real xid was assigned yet. forced_xid is a numeric xid because pg_current_xact_id() allocates one on demand; COMMIT then finishes that transaction. The numeric value is run-dependent and can be separated from other observed IDs by unrelated activity.",
      },
    },
  },
  "snapshot-anatomy": {
    ...original["snapshot-anatomy"],
    brief:
      "Setup creates or resets mv_accounts: Alice is id = 1, Bob is id = 2, and Carol is id = 3, each starting with balance = 100. Two psql sessions are used to print PostgreSQL's bounded snapshot representation while Session B adds 10 to Carol’s balance and stays open. BEGIN keeps each transaction open and COMMIT ends it. A snapshot is printed as xmin:xmax:xip_list: xids below xmin were no longer in progress when the snapshot was taken, xids at or above xmax are too new for that snapshot, and xids in the middle need the explicit in-progress list; commit versus abort still determines visibility. Session A performs one extra committed write after B starts so B is no longer the newest xid and can be represented in that middle list.",
    predict:
      "The supplied SQL names pg_current_snapshot(), pg_current_xact_id(), pg_snapshot_xmin(), pg_snapshot_xmax(), pg_snapshot_xip(), and array_agg(). Before running it, predict where B's b_xid will appear in A's snapshot while B is open, and what balance A will read for id = 3. Also predict what changes in the fresh snapshot and Carol row after B commits. The extra committed update by A is there to move xmax beyond B's xid; do not assume exact xid values.",
    inspect:
      "Use the output already in the terminals. Match Session B's b_xid from pg_current_xact_id() against Session A's snapshot_while_b_runs, its snap_xmin/snap_xmax columns, and the in_progress array produced by pg_snapshot_xip() plus array_agg(). Then compare A's SELECT for Carol while B is open with A's snapshot_after_b_commits and final Carol SELECT. Read the snapshot text and row together. If B is absent from the in-progress list, check that B is still uncommitted and that A completed its separate account-1 update; confirm A and B really are different psql connections.",
    explain:
      "Reflect mentally on the prediction before checking the causal model. Connect the snapshot to two bounds plus a finite exception list: xids below xmin were no longer in progress when this snapshot was taken, xids at or above xmax are outside this snapshot's visibility bound, and the listed middle xids are checked individually; commit versus abort still matters for visibility. Notice why A's extra committed write places B between the bounds, and why B's commit changes a later statement's fresh view and Carol's visible balance. Snapshot numbers and exact list contents vary with other activity.",
    vary:
      "Optionally run the supplied controlled interleaving variation. Session A starts REPEATABLE READ and prints both a snapshot and Carol's row; Session B updates Carol and commits while A is still open; A prints the snapshot and row again, commits, then prints a fresh snapshot and row. Compare the two reads inside A with the post-COMMIT read and notice which view stayed stable.",
    apply:
      "Choose between a stable transaction-wide view and a fresh statement view for two workloads: a report that must reconcile several reads, and an API endpoint that should see newly committed data on each request. Consider the consistency benefit and the stale-data cost you would accept, using the snapshot bounds and in-progress list as the mechanism.",
    hints: [
      "Keep the roles straight: B owns the uncommitted UPDATE and supplies b_xid; A takes the snapshots and reads Carol. pg_current_snapshot() returns xmin:xmax:xip_list, the pg_snapshot_* functions expose its parts, and array_agg() makes the set-returning xip rows visible in one result. A's committed account-1 write is an ordering device that makes B old enough to be in the middle band without changing Carol.",
      "For the controlled variation, use the supplied Session A/B order. REPEATABLE READ fixes A's snapshot at its first statement; B's commit therefore should not change A's second snapshot or row, while A's post-COMMIT statements use a fresh view. Compare the named before/during/after outputs and keep every transaction finished.",
    ],
    pilot: {
      question: "How do xmin, xmax, and the in-progress list bound a consistent read?",
      minutes: [30, 45],
      cap: 60,
      phases: [
        {
          from: "",
          title: "Session A: establish the view before B writes",
          context:
            "Use Session A for the first command. pg_current_snapshot() returns a compact xmin:xmax:xip_list value: xids below xmin were no longer in progress when this snapshot was taken, xids at or above xmax are too new for this snapshot, and xip_list names active xids in the middle. Commit versus abort still matters for visibility. This first snapshot is the baseline for the later snapshot while B is open; notice its shape before another writer exists.",
        },
        {
          from: "-- Session B\nbegin;",
          title: "Session B: update Carol and keep the transaction open",
          context:
            "Switch to Session B. BEGIN keeps B open; UPDATE creates a new version of Carol; pg_current_xact_id() returns B's assigned xid so A can identify it. Leave B uncommitted after this block. The question is where that named xid will be represented when A next takes a snapshot.",
        },
        {
          from:
            "-- Session A\n-- one more transaction starts and finishes after B, so B is no longer the newest xid",
          title: "Session A: advance the boundary, then inspect B",
          context:
            "Return to Session A. The short BEGIN/UPDATE/COMMIT changes account 1 and deliberately completes after B started, so the next snapshot has a newer boundary than B's xid. Then pg_current_snapshot() and the pg_snapshot_xmin(), pg_snapshot_xmax(), pg_snapshot_xip(), and array_agg() query expose the bounds and exception list; the Carol SELECT ties those metadata fields to normal visibility. Notice both the named xid and the row result.",
        },
        {
          from: "-- Session B\ncommit;",
          title: "Session B: commit the hidden version",
          context:
            "Run COMMIT in Session B. B's update becomes committed and its locks are released. This phase has no A query: it creates the event that a new statement in A can observe with a fresh snapshot.",
        },
        {
          from: "-- Session A\nselect pg_current_snapshot() as snapshot_after_b_commits;",
          title: "Session A: take a fresh view after B commits",
          context:
            "Return to Session A for the final snapshot and Carol SELECT. Because these statements run after B's COMMIT and after A's short transaction ended, they use a fresh view. Compare the snapshot text and Carol's balance with the while-B-running results, without treating any absolute xid as universal.",
        },
      ],
      variation: {
        minutes: [10, 15],
        intro:
          "REPEATABLE READ keeps one snapshot for Session A's entire transaction, so later A statements use that view even if B commits. Before running, make a quick mental guess about whether A's second snapshot and Carol row will change. Then use the supplied two-session variation with the existing mv_accounts rows; it finishes every transaction.",
        code:
          "-- Session A\nBEGIN ISOLATION LEVEL REPEATABLE READ;\nSELECT pg_current_snapshot() AS snapshot_before_b;\nSELECT id, balance AS carol_before_b FROM mv_accounts WHERE id = 3;\n\n-- Session B\nBEGIN;\nUPDATE mv_accounts SET balance = balance + 10 WHERE id = 3;\nCOMMIT;\n\n-- Session A\nSELECT pg_current_snapshot() AS snapshot_during_b_commit;\nSELECT id, balance AS carol_in_repeatable_read FROM mv_accounts WHERE id = 3;\nCOMMIT;\nSELECT pg_current_snapshot() AS fresh_snapshot_after_a_commit;\nSELECT id, balance AS carol_after_commit FROM mv_accounts WHERE id = 3;",
        expected:
          "Within Session A's REPEATABLE READ transaction, snapshot_before_b and snapshot_during_b_commit are the same snapshot representation, and carol_in_repeatable_read has the same balance as carol_before_b even though Session B committed an update. After A commits, fresh_snapshot_after_a_commit is taken in a new transaction context and carol_after_commit reflects B's committed increment, normally ten higher than the before value when no unrelated writer changes Carol. Absolute xid values vary; all transactions end at the final SELECT.",
      },
    },
  },
};
