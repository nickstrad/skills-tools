import type { Guide } from "./types.ts";
import { REQUEST_SETUP, UNKNOWN_COMMIT } from "../curriculum/request-protocol.ts";

export const guides: Record<string, Guide> = {
  "atomic-abort": {
    brief:
      "In this fixture, which has no savepoint, a failed transaction needs a full rollback before more business SQL.",
    predict:
      "After the divide-by-zero error, which command is accepted before ROLLBACK in this no-savepoint fixture?",
    inspect:
      "Record the division error, SQLSTATE 25P02, and the balances after the final rollback.",
    explain:
      "Why does this fixture need a full rollback instead of another update, and what recovery boundary would a savepoint provide?",
    vary:
      "Change the first transfer amount from 10 to 25 and verify rollback still restores both rows.",
    apply:
      "Where would a request handler put its top-level rollback so a pooled connection cannot leak failed state?",
    hints: [
      "The setup resets both balances to 100 before the experiment.",
      "Rerun setup, replace both 10 values in the first transfer with 25, then run the same ROLLBACK and ordered balance query.",
    ],
  },
  "read-committed-sees-each-statement": {
    brief:
      "Read Committed decides visibility when each statement begins, even inside an open transaction.",
    predict: "After B commits its increment, will A's second SELECT read 100 or 600?",
    inspect: "Compare A's first and second balance rows and the isolation-level value it printed.",
    explain: "Why is A seeing a committed change without ending its transaction?",
    vary:
      "Insert a third account between two A SELECT statements and observe whether the new row appears.",
    apply:
      "Which request decisions become unsafe if their two reads can see different committed worlds?",
    hints: [
      "Rerun setup first so accounts 1 and 2 are the only starting rows.",
      "Session A: begin; select id from iso_accounts order by id; Session B: insert into iso_accounts values (3,'carol',100); Session A: select id from iso_accounts order by id; commit;",
    ],
  },
  "lost-update-under-read-committed": {
    brief:
      "A value carried out of a read and written back later can overwrite another worker's decision.",
    predict:
      "When both sessions calculate from 100, what final balance will the naive schedule leave?",
    inspect:
      "Compare after_naive, after_atomic_update, and after_for_update; identify which B statement blocks.",
    explain:
      "Why does server-side arithmetic preserve both decrements while client-side arithmetic loses one?",
    vary: "Use FOR NO KEY UPDATE in both locking reads and observe the same serialized handoff.",
    apply:
      "For a balance, inventory counter, or quota, when should the mutation stay inside one SQL statement?",
    hints: [
      "Rerun setup before the variation; it resets account 1 to 100.",
      "Replace both SELECT balance ... FOR UPDATE statements with SELECT balance ... FOR NO KEY UPDATE, then keep the same A commit before B continues.",
    ],
  },
  "optimistic-concurrency-with-version-columns": {
    brief:
      "A version predicate turns a stale save into a zero-row result, leaving the application to decide how to recover.",
    predict:
      "After A advances version 1 to 2, will B's save with its captured version 1 overwrite A or return zero rows?",
    inspect:
      "Compare B's empty stale-save result with the fresh body/version and the final both_edits and three_versions checks.",
    explain:
      "Why does the version check detect a stale edit without choosing whether two document edits should merge?",
    vary:
      "Roll back A's in-flight save instead of committing it, then observe B's original version-1 save succeed at version 2.",
    apply:
      "Which conflicts can your application merge safely, and when must it show the user both versions instead?",
    hints: [
      "Both initial reads occur in autocommit mode. Only A's short save transaction is held open; finish it with COMMIT or ROLLBACK so B can continue.",
      `Rerun setup and use this rollback variation; stop after B's first UPDATE because it has already saved its edit.

Session A:
select body,version from pat_docs where id=1 \\gset a_

Session B:
select body,version from pat_docs where id=1 \\gset b_

Session A:
begin;
update pat_docs set body=:'a_body'||' | A edit',version=version+1
where id=1 and version=:a_version returning *;

Session B (waits for A):
update pat_docs set body=:'b_body'||' | B edit',version=version+1
where id=1 and version=:b_version returning *;

Session A:
rollback;

Session B:
select body,version from pat_docs where id=1;

B returns draft | B edit at version 2. Do not run the merge phase after that successful first save.`,
    ],
  },
  "repeatable-read-blocks-then-fails": {
    brief: "A pinned snapshot cannot silently switch to B's committed row version after waiting.",
    predict:
      "If B commits its update, will A apply its decrement after the wait or receive SQLSTATE 40001?",
    inspect: "Capture A's error, 40001, the failed-state error, and the balance after ROLLBACK.",
    explain: "Why would continuing A's update mix a stale decision with a newer row version?",
    vary: "Make B ROLLBACK instead of COMMIT and compare A's unblocked outcome.",
    apply:
      "Which errors should a client classify as a transaction retry rather than a malformed request?",
    hints: [
      "Keep A's first SELECT before B starts; that establishes the snapshot.",
      "Rerun setup. In B, replace COMMIT with ROLLBACK. After A unblocks, COMMIT A and select the balance in a fresh statement.",
    ],
  },
  "write-skew": {
    brief:
      "Two transactions can each preserve a local rule while their combined commits break the shared rule.",
    predict:
      "With two doctors on call, can both Repeatable Read transactions turn off different doctors?",
    inspect:
      "Record both commit outcomes and on_call_after; compare it with the at-least-one invariant.",
    explain: "Why are disjoint writes insufficient when both decisions read the same roster?",
    vary:
      "Use the supplied fresh Read Committed ordered row-lock schedule and verify B counts one doctor after waiting.",
    apply:
      "What row or materialized guard would every transaction need to write for this invariant?",
    hints: [
      "Rerun setup so alice and bob start on call and carol is off call.",
      "Session A: begin; select doctor,on_call from iso_oncall order by doctor for update; update iso_oncall set on_call=false where doctor='alice'; Session B: begin; select doctor,on_call from iso_oncall order by doctor for update; Session A: commit; Session B: select count(*) from iso_oncall where on_call; commit;",
    ],
  },
  "serializable-ssi": {
    brief:
      "Serializable Snapshot Isolation records read dependencies and may abort one commit to preserve the roster rule.",
    predict: "Will the two serializable updates block, or will one COMMIT receive 40001?",
    inspect:
      "Find SIReadLock rows before commit, then record the failed commit SQLSTATE and final on-call count.",
    explain:
      "Why can SSI preserve the committed invariant without making readers take blocking row locks?",
    vary:
      "Run the ordered real-row locking schedule from write-skew and compare its wait with SSI's abort.",
    apply:
      "If a caller declines to retry 40001, what safety property still holds and what liveness outcome does it accept?",
    hints: [
      "Rerun setup before either schedule; do not assume a prior failed COMMIT restored the roster.",
      "Use the write-skew hint2 schedule with FOR UPDATE on iso_oncall rows; B waits, counts one after A commits, and leaves bob on call.",
    ],
  },
  "retry-loop-and-idempotency": {
    brief:
      "A known 40001 aborts one database attempt; the client repeats the whole read, decision, and write in a fresh transaction.",
    predict:
      "Which attempt log will contain 40001, and how many committed effect rows should remain?",
    inspect:
      "Read attempts.log and both attempt logs, then verify balance_and_effect_count reports 95|1.",
    explain:
      "Why does the second attempt need a new snapshot and why is an unknown COMMIT response a different problem?",
    vary:
      "Change the competing increment to 20 and update only the predicted final balance assertion after writing it down.",
    apply:
      "What retry budget and SQLSTATE classification would fit a request deadline without retrying SQL bugs?",
    hints: [
      "The shell script creates and cleans a unique schema; rerun the whole supplied script before varying it.",
      "In the script, change the competing update from balance+5 to balance+20 and the expected balance_and_effect_count from 95|1 to 110|1, then rerun it in the disposable lab.",
    ],
  },
  "unknown-commit-outcome": {
    brief:
      "A withheld response leaves the caller uncertain, so both controlled outcomes use the same replay with one durable request identity.",
    predict:
      "Will the same recovery call be correct after the hidden COMMIT and after the hidden ROLLBACK, and what result should each replay return?",
    inspect:
      "Compare original_result with current_balance, then inspect receipts, their amounts, and the final conservation checks.",
    explain:
      "Why can a stored receipt answer a replay without recomputing a debit from the current balance?",
    vary:
      "Change only req-unknown's amount from 10 to 15 throughout its hidden attempt and replay, then compare its original result with the later current balance.",
    apply:
      "What receipt retention and payload-consistency policy would make a request identity useful after a caller loses a response?",
    hints: [
      "\\o /dev/null is a controlled output-withholding fixture: the lesson author still knows whether COMMIT or ROLLBACK ran. Restore normal output with a bare \\o before recovery; this does not simulate a network failure.",
      "Rerun this complete controlled variation in the disposable lab. The request amount is 15 everywhere that identity is replayed; other amounts remain unchanged. Predict the resulting balances first.\n\n```sql\n" +
      REQUEST_SETUP + "\n" +
      UNKNOWN_COMMIT.code.replaceAll("'req-unknown',1,10", "'req-unknown',1,15") + "\n```",
    ],
  },
};
