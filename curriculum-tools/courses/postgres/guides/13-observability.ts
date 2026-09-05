import { CAPACITY } from "../curriculum/capacity-workload.ts";
import { WAIT_VARIATION } from "../curriculum/wait-observation.ts";
import { IO_VARIATION } from "../curriculum/io-observation.ts";
import { DEADLINE_VARIATION } from "../curriculum/deadline-observation.ts";
import { INDEX_USAGE_VARIATION } from "../curriculum/index-usage-observation.ts";
import { LOG_VARIATION } from "../curriculum/log-observation.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "wait-events-tell-you-where-time-goes": {
    brief:
      "A request's state, current wait and dependency describe different parts of its progress. Combine them before deciding which client to intervene on.",
    predict:
      "An idle transaction holds a row that an active writer needs. Which evidence would identify the cause of the writer's delay, and what should change when the holder commits?",
    inspect:
      "Match the holder's registered PID to the writer's blocker array. Compare all ten contended samples with the timer-only phase, then verify the committed balance.",
    explain:
      "Why can an idle client obstruct an active one? What does a NULL wait event leave unknown, and why are these sample counts not a request-latency breakdown?",
    vary:
      "Make the holder execute a timer while retaining the lock. Predict its wait event and whether the writer's dependency changes. Prepare the observer block before starting the timed commands.",
    apply:
      "Your service reports many active requests and an old idle transaction. Which evidence would justify contacting or cancelling the holder, and what transaction/outcome checks must follow the intervention?",
    hints: [
      "Distinguish the holder's own wait from the lock it retains. A timer neither commits the transaction nor releases that lock.",
      "Use three fresh psql sessions and the same lab. This complete variation recreates its fixture.\n\n```sql\n" +
      WAIT_VARIATION + "\n```",
    ],
  },
  "pg-stat-io-by-backend-type": {
    brief:
      "Interpret an I/O counter only after identifying its dimensions, interval and publication boundary. A PostgreSQL buffer miss can still be served by the operating-system cache.",
    predict:
      "Which counters should change during table loading versus scanning? Which evidence could distinguish a large scan's buffer strategy from a small scan's strategy without assuming physical disk reads?",
    inspect:
      "Check answer_ok and reset epochs first. Compare load/scan rows by backend type and context, then compare EXPLAIN BUFFERS with cluster deltas. Preserve nonapplicable blank cells.",
    explain:
      "Why can a sequential scan show bulkread hits but no reads? Why can't a checkpointer row or a cluster-wide read count establish this request's disk latency?",
    vary:
      "Change only row count from 100000 to 10000. Keep payload width, aggregate queries and session controls unchanged. Compare the heap/cache-size relationship and scan context.",
    apply:
      "A dashboard shows rising client read counters during slow jobs. Specify the query-level, operating-system and concurrent-workload evidence you need before recommending more memory or faster storage.",
    hints: [
      "Check heap bytes against one quarter of shared_buffers, then inspect normal versus bulkread. A different read/hit split can reflect cache history rather than a faster device.",
      "Run this complete smaller-table variation in one psql session.\n\n```sql\n" + IO_VARIATION +
      "\n```",
    ],
  },
  "idle-in-transaction-kills-you": {
    brief:
      "Deadlines act on statements or connections; transaction boundaries determine which earlier writes survive. The supplied clients make those outcomes observable.",
    predict:
      "Compare an idle connection timeout with a statement timeout inside BEGIN. Which connection should disappear, which earlier writes should survive, and when would a retry need a fresh transaction?",
    inspect:
      "Identify the exact owned PID, locked_rows before/after, stored note, error SQLSTATEs, new versus unchanged backend identity, and row 99's final presence.",
    explain:
      "Why does a successful connection probe require ROLLBACK after 57014 inside BEGIN? Why does a session's disappearance establish local cleanup without proving anything about an independent external effect?",
    vary:
      "Change only the second client's transaction scope to autocommit. Predict whether the earlier INSERT survives and whether the next SELECT receives 25P02.",
    apply:
      "A pool receives a timeout from a request that issued multiple SQL statements. Describe when to roll back, when to reconnect, and which committed-outcome evidence you need before retrying the request.",
    hints: [
      "An autocommit INSERT finishes its transaction before the later sleep begins. A statement deadline cannot retroactively roll back that completed transaction.",
      "Run this complete variation from a shell with the same lab PG connection variables.\n\n```bash\n" +
      DEADLINE_VARIATION + "\n```",
    ],
  },
  "table-and-index-usage-counters": {
    brief:
      "A query-use counter measures one index responsibility. Combine scoped workload evidence with correctness constraints before proposing removal.",
    predict:
      "The workload reads by primary key but never by request_key or customer. What could justify keeping either zero-scan index, and what experiment distinguishes those reasons?",
    inspect:
      "Check actual plans and answer checks, then join index deltas to indisunique and contype. Explain the duplicate insert's 23505 despite zero query scans on its constraint index.",
    explain:
      "Why is zero scans evidence about this window rather than proof of zero benefit? Why should you inspect the executed plan before equating index scans with statement counts?",
    vary:
      "Add customer=7 to the workload. Compare the same count and ID sum with and without the optional customer index inside a transaction; roll back its removal.",
    apply:
      "Recommend retain, investigate or remove for each index. State the query frequencies, integrity requirements, observation coverage and write-cost measurements that could change your recommendation.",
    hints: [
      "The unique request identity is an invariant; customer is an optional access path. A missing customer query is a workload gap, not proof that the index is useless.",
      "Run this complete variation in one psql session. ROLLBACK restores the dropped optional index.\n\n```sql\n" +
      INDEX_USAGE_VARIATION + "\n```",
    ],
  },
  "read-the-server-log": {
    brief:
      "Reconstruct the writer's wait and statement completion, then check its enclosing transaction separately. A completed statement is only one step in a business operation.",
    predict:
      "Which log events should remain if an UPDATE finishes successfully but its transaction later rolls back? What independent observation can settle the stored outcome?",
    inspect:
      "Use the registered writer PID to connect waiting, blocker detail, acquisition and UPDATE duration. Compare its in-transaction value with A's final independent read, retaining continuation lines.",
    explain:
      "Why does the log reader capture a filename and offset before the event, bound the byte range and poll for collector delivery? What does an UPDATE duration leave unknown about the caller's outcome?",
    vary:
      "Keep the workload and logging thresholds fixed; change only B's final COMMIT to ROLLBACK. Compare the UPDATE evidence and the committed value.",
    apply:
      "An incident report says 'the UPDATE succeeded, so retrying would duplicate it.' Identify which logged events support that claim and which durable operation/result evidence is still required.",
    hints: [
      "Both versions log the waited-for UPDATE and expose its value inside B. A's final read follows B's transaction decision and is the relevant stored-outcome check.",
      "Use two fresh psql sessions in the same disposable lab. This complete variation changes B's decision to ROLLBACK.\n\n```sql\n" +
      LOG_VARIATION + "\n```",
    ],
  },
  "connection-saturation": {
    brief:
      "Separate the number of admitted connections from the active workload a shared service point can complete.",
    predict:
      "Every transaction holds the same row lock for 5ms. What should happen to throughput and waiting as clients increase from one to eight, and which metric could falsify your prediction?",
    inspect:
      "First verify 400 committed increments and 400 successful log records with zero failures in each trial. Then compare both rounds' throughput, latency samples and peak observed lock waiters.",
    explain:
      "Why can more active clients raise p99 without buying much throughput? Why does a closed-loop benchmark reduce its own offered load as responses get slower?",
    vary:
      "Reduce only the row-lock hold time to 1ms and repeat the same two sweeps. Compare the useful concurrency range and explain any change in the bottleneck.",
    apply:
      "Choose an active-client limit that keeps measured p99 below 30ms in both rounds, and defend the throughput/latency tradeoff. What further arrival-rate, application and resource evidence would you need before using it for a real service?",
    hints: [
      "Keep client counts, total transactions, reverse order and observation method fixed. PCAP_HOLD_MS controls only the pause inside each transaction; the supplied variation changes it to 1.",
      "Run the same lab connection environment as the core. The only changed input is the hold time.\n\n```bash\n" +
      CAPACITY.code.replace("python3 - <<'PY'", "PCAP_HOLD_MS=1 python3 - <<'PY'") +
      "\n```",
    ],
  },
};
