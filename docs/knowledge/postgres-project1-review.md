# PostgreSQL Project 1 review: lessons 8–96

2026-09-04. Recommendations for a learner who has completed lessons 1–7 and wants to design
performant, data-intensive and distributed applications. This is a source review and proposed
direction, not an implemented curriculum revision or a runtime validation report.

## What happened

Reviewed the remaining PostgreSQL source lessons, their experiments and explanations, the course
plan, AUTHORING.md, the canonical book research, and `docs/learning_path.md`. The in-progress SQLite
REWORK-PLAN.md provides additional context, but does not determine PostgreSQL's scope. All lesson
numbers below refer to the existing 96-lesson ordering. No course or learner-progress changes are
part of this review.

## Why it matters

The foundation matches the learner's goal unusually well: pages, MVCC, isolation races, WAL,
recovery, replication, query execution and contention are useful engineering knowledge. Keep
PostgreSQL deep, as the learning path explicitly requests. SQLite should later contrast the
embedded architecture rather than inherit responsibility for teaching general transaction and
delivery reasoning that PostgreSQL only mentions.

The biggest opportunity is to connect mechanisms to decisions and then test those decisions under
failure and load. Many lessons have strong observations but give the conclusion immediately.
Several of the most valuable application exercises exist only as optional challenges. The final
patterns module sometimes simulates effects with printed output instead of exercising the commit
boundaries on which the claimed guarantee depends.

The proposed change is a redistribution of effort, not a much larger feature catalog. Consolidate
repeated demonstrations, preserve important distinctions, and spend the recovered time on real
protocols, performance measurement and independent diagnosis. Do not choose an exact new lesson
count until the experiments and prerequisites are specified.

## How to apply

### Recommendations across all unfinished lessons

| Current lessons | Recommendation | Result the learner should earn |
| --- | --- | --- |
| 8 HOT/fillfactor | Keep; strengthen the comparison. Rename the “half empty” title: the experiment uses fillfactor 70. Compare independent committed update rounds as well as the existing single transaction; measure HOT ratio and pages now, revisit WAL bytes after the WAL module. | Choose free space and indexes for a specified read/write workload; understand the transaction shape behind the result. |
| 9 TOAST | Keep; add narrow-column reads versus payload reads, and unchanged-payload versus changed-payload updates. Correct the broad update-cost advice below. | Decide whether and how to separate large payloads using measured work. |
| 10 cache | Keep. Distinguish a PostgreSQL buffer miss from physical device I/O, and use controlled resident/nonresident conditions. | Explain what the counters prove and what they cannot prove. |
| 11 FSM | Merge the space-reuse experiment into 18–19; leave a short preview here if needed. Move its VACUUM FULL portion to 20. | One complete reclamation sequence with less repeated setup. |
| 12–13 XIDs/snapshots | Keep the mechanisms; potentially combine into one experiment with two stages. Do not equate allocation order with commit order. | Predict visibility from the snapshot and transaction outcomes. |
| 14 simultaneous versions | Keep the physical evidence; use it as the basis for the RC/RR contrast in 25 instead of repeating the full RR race there. | Connect shared bytes to different logical views. |
| 15 commit visibility; 24 atomic abort | Combine their overlapping aborted-version inspection. Retain the failed-transaction state from 24 near the retry lessons. | Explain logical rollback, physical garbage and required client recovery. |
| 16 horizon; 23 long-transaction bloat | Merge into a controlled comparison with and without a pinned snapshot. Keep the identification and release of the blocker. | Show how an observer delays reclamation and changes sustained write cost. |
| 17 freezing | Keep. Keep 94 as optional operational depth or turn it into an independent diagnosis. | Understand finite identifier space and reclamation deadlines without a second mandatory threshold tour. |
| 18–19 dead tuples/reuse | Combine as stages with 11; preserve exact inspection versus estimated counters. | Distinguish logical rows, dead versions, reusable bytes and allocated file size. |
| 20 VACUUM FULL | Keep. Relate lock duration and temporary storage needs to the decision to rewrite. | Evaluate reclamation against availability. |
| 21 visibility map; 74 index-only scans | Consolidate the repeated vacuum/heap-fetch cycle. Keep 74's useful additional case where the requested column is absent from the index. | Prove both requirements for an index-only scan. |
| 22 autovacuum | Keep; add bounded ongoing writes, then compare garbage creation and cleanup rather than only waiting for one threshold event. | Reason about maintenance capacity and sustained workload. |
| 25 RC/RR | Keep RC semantics; shorten the repeated RR round using 14. | Choose a snapshot scope for a real operation. |
| 26 lost updates; 88 version columns | Place together. Retain atomic SQL, pessimistic locking and version-checked updates as distinct alternatives. | Choose conflict handling based on transaction boundaries and contention. |
| 27–29 serialization/write skew/SSI | Keep as core; do not compress away write skew. Require an invariant before scheduling the race. Correct the challenge in 29. | Explain why individually plausible operations can violate a multi-row rule. |
| 30 retries | Rewrite around an actual bounded client loop using fresh transactions, SQLSTATE classification and observable attempts. Move the toy duplicate INSERT into 86. | Distinguish an aborted attempt from an unknown commit outcome. |
| 31–33 row locks/queues/deadlocks | Keep. Incorporate the basic wait-event observation from 79; require the learner to draw the wait-for edges. | Find the blocker and predict which change breaks the cycle. |
| 34, 82, 95 timeouts/cancellation | Teach as a connected deadline sequence. Preserve lock wait, statement runtime, idle transaction, cancel and disconnect as different mechanisms. | Set a coherent request budget and verify the transaction/session outcome. |
| 35 queued DDL | Keep and extend into a migration under load. Correct metadata-only versus lock-free wording. | Change a schema without allowing a queued exclusive lock to become an unbounded outage. |
| 36 advisory locks | Keep scope and release experiments. Remove lease terminology unless an actual expiry protocol is introduced. | State precisely what ownership lasts for and what the lock does not protect. |
| 37 work queue | Upgrade substantially; move durable claims from the challenge into the core. Use short claim transactions, work outside the transaction, takeover and guarded completion. | Recover abandoned work and reject a stale worker. |
| 38 uniqueness | Keep the race; connect it to request identity and constraint design. | Locate the serialization point rather than relying on a prior existence check. |
| 39–40 WAL/FPI | Keep. Prefer measured record types/lengths to slogans such as every first write costing exactly 8 KB. | Explain durability machinery and write amplification. |
| 41 commit cost | Keep the existing single-client, async and multi-client comparison; improve repeated measurement and latency distributions. | Separate group commit, durability policy, throughput and individual latency. |
| 42 segments/archive | Keep as preparation for restore. Make archive failure and retention an actual bounded variation. | Explain why a WAL budget is not a hard disk-space ceiling. |
| 43 crash/redo; 44 WAL inspection | Combine the recovery event and the inspection of its evidence, or make 44 an optional deeper stage. | Trace recovered state to durable records, including uncommitted records that remain invisible. |
| 45 WAL cost | Keep and explicitly revisit 8's index/fillfactor choices. Compare equivalent initial layouts and transaction boundaries. | Account for bytes per useful operation. |
| 46–48 checkpoint/recovery pressure | Keep the distinct questions but shorten repeated inventory. Measure service recovery as well as redo distance. | Trade foreground work, background work and recovery time; a redo point alone is not RTO. |
| 49–50 backup/PITR | Keep as core. Validate contents after restore and deliberately remove required WAL from a disposable restore input. | Prove recoverability and measure actual recovery-point/time outcomes. |
| 51 timeline history | Fold into 50 and 57–58; it currently mostly inspects artifacts produced earlier. | Identify shared and divergent history at the moment it matters. |
| 52–55 standby/lag/sync/conflicts | Keep. Bring 90's physical read-after-write experiment here, before removing the standby. Promote the hot_standby_feedback tradeoff from challenge to core. | Distinguish received, durable and applied data; choose where waiting or bloat occurs. |
| 56 physical slot | Keep as the first complete retention experiment. | Bound the producer's promise and explain the cost to a disconnected consumer. |
| 57–58 promotion/rewind | Keep the deliberate split-brain failure, then require a separate controlled failover with fencing before promotion. Preserve evidence before rewind. | Separate replication from authority, and report acknowledged operations lost or preserved. |
| 59 cascade/failback | Make cascading optional; keep correct failback and lab cleanup required. Replace sleep-based assumptions with position/readiness checks. | Understand the additional hop if desired; leave a known topology for subsequent lessons. |
| 60–61 decoding/offsets | Keep commit-order and peek/get distinctions. Add an independently committed consumer effect and failure before/after acknowledgement. | Prove replay and deduplication behavior instead of inferring delivery guarantees from offset movement. |
| 62–63 subscription/backfill | Keep; write/update/delete during the snapshot-to-stream handoff and verify end-state contents. | Explain how bootstrap and incremental change processing meet without gaps. |
| 64 apply conflicts | Keep; extend to schema compatibility and reconciliation after repair. | Distinguish worker recovery from restored data agreement. |
| 65 logical slot lag | Shorten the repeated disk-growth mechanics; focus on logical consumer progress, acknowledgement and resnapshot after lost history. | Apply the retention principle from 56 to a meaningfully different consumer. |
| 66–70 plans/stats/scans/joins/spills | Keep; move a small EXPLAIN primer earlier and put full performance work before the long replication sequence. Use normal planner choices first, then forced plans to test hypotheses. | Find the dominant work, change one cause, and verify unchanged answers. |
| 71 parallel query | Keep the resource-contention experiment. Respect the course's small-machine budget and avoid universal speedup claims. | Distinguish a parallel plan from available CPU and worker capacity. |
| 72 query telemetry | Keep and move workload measurement earlier. Pair aggregate query statistics with client latency samples. | Explain total cost and tail latency without treating an aggregate as a trace. |
| 73 B-tree anatomy | Keep; position a compact version before advanced access-path lessons. Add a controlled change in key width or insertion pattern. | Relate fanout and locality to workload cost. |
| 75 concurrent index build | Keep; join with the migration sequence from 35, including invalid-index cleanup. | Verify the final usable state of a multi-phase change. |
| 76 partial/covering indexes | Keep, incorporating the coverage part of 74 and an explicit read/write cost comparison. | Choose an index for both query benefit and maintenance cost. |
| 77 index churn | Keep only if it measures the consequence for the shared workload, not just the improved density after REINDEX. | Justify a rebuild using benefit, cost and availability. |
| 78 partial uniqueness | Preserve the new conditional-invariant case; fold the repeated insert race into 38/76. Move takeover/fencing practice to 37/89. | Enforce one active owner without confusing a unique row with a complete lease protocol. |
| 79–80 waits/I/O | Integrate basic observation into earlier experiments; retain a later mixed-workload diagnosis that requires choosing the right evidence. | Attribute delay to a mechanism rather than reciting views. |
| 81 connections | Expand from exhausting slots to workload capacity: clients, active transactions, queues, retries and deadlines. Optional pooler contrast after the direct case. | Find the point where more concurrency stops helping. |
| 83 usage counters | Fold into performance measurement; correct the zero-scan-index conclusion. | Decide from representative workloads and correctness responsibilities. |
| 84 server logs | Introduce the relevant log evidence earlier; retain correlation and interpretation as a synthesis exercise. | Join client symptoms, waits, logs and data outcomes. |
| 85 outbox | Rewrite the delivery simulation as two independently committed sides with an observable business effect. | Survive receiver commit followed by sender failure before acknowledgement. |
| 86 idempotency | Strengthen substantially: identity, payload agreement, effect plus receipt atomicity, result replay, concurrent retries and retention. | Specify exactly which effect is deduplicated and for how long. |
| 87 prepared transactions | Keep as an explicit participant-side introduction. Make the coordinator's durable decision and recovery a core second stage if it is titled as a complete 2PC lesson. | Explain why prepared participants block and how an outcome is recovered. |
| 89 fencing | Combine with durable workers; explicitly test takeover ordering, stale completion and missing-token bypass. | State which resource enforces the token and when a new epoch takes effect there. |
| 90 replica reads | Move the main experiment beside 53–54, using the physical standby. Actually enforce a bounded wait/fallback. Keep the logical-origin variant as advanced contrast. | Carry a position from the correct history and read only after the chosen readiness condition. |
| 91 LISTEN/NOTIFY | Keep the missed-notification demonstration; complete the table-backed polling/reconciliation path. | Treat notification as a wake-up, with durable state driving work. |
| 92 slot incident | Replace the third known-cause retention walkthrough with a diagnosis that could be a slot, archiver or increased production rate. | Choose the remedy from evidence and state its consumer-recovery cost. |
| 93 corruption | Keep detection and validated restore core; make destructive salvage/pg_surgery optional depth. Preserve a damaged copy and distinguish readable structure from complete data. | Recover meaning as well as a database that opens. |
| 94 freeze incident | Optional operational depth after 17, or a blind diagnosis using its knowledge. | Identify what prevents progress without repeating the introductory mechanism. |
| 96 postmortem | Replace log extraction as the sole deliverable with a combined correctness, recovery and capacity capstone. | Defend a design using an operation history, measured limits and a causal incident account. |

### Highest-value missing experiments

These should use consolidated slots where possible, and stay CLI-first: psql, SQL files, shell
workers and pgbench. A web application is unnecessary.

1. **Unknown commit outcome.** Exercise a transaction known to abort, then an operation that commits
   while the caller loses its response. Retry by stable request ID and inspect the effect. A
   controlled withheld response must be labelled as such; do not call it a real network partition.
2. **Durable work and delivery.** Make 37, 85, 86, 89 and 91 a connected progression. Use an
   independent receiver transaction for effect plus receipt. Interrupt after receiver commit and
   before sender acknowledgement; prove retry preserves one local effect. Also recover claims,
   reject stale completions, and drain work after a missed notification. Independent databases on
   one host demonstrate commit boundaries, not independent host failure domains.
3. **Capacity under contention.** Run a repeatable workload while varying clients, batch size and
   key skew. Record offered load, completed work, latency distribution, failures/retries, lock
   waits and WAL per successful operation. Include rate-driven arrivals so client slowdown does
   not hide overload. pgbench supports rate control and transaction logs; see its
   [documentation](https://www.postgresql.org/docs/16/pgbench.html).
4. **Composite indexes and pagination.** Compare tenant/filter/order index layouts, deep OFFSET
   and keyset pagination. Measure rows/pages examined while checking ordering and result
   semantics; this supplies a concrete application use for B-tree internals.
5. **Prepared plans and skew.** Give different tenants very different cardinalities, compare
   custom/generic plans and inspect execution work. PostgreSQL documents these alternatives and
   their controls in [PREPARE](https://www.postgresql.org/docs/16/sql-prepare.html).
6. **Online schema evolution.** Expand 35/75 into add, bounded backfill, constraint validation and
   compatibility with concurrent old/new writers. Verify both availability and the final rule.
7. **Retention by partition lifecycle.** Compare bounded deletes with detaching a time partition;
   inspect lock behavior, pruning, reclaimed storage and constraint consequences. Partitioning
   should earn its place through an operational requirement.
8. **Correctness under failover.** Track request IDs and acknowledged outcomes during controlled
   role change; separately observe asynchronous loss and stale-primary writes. Define the
   authority transition. PostgreSQL's
   [failover documentation](https://www.postgresql.org/docs/16/warm-standby-failover.html)
   explicitly separates failure detection and mechanisms preventing the old primary from writing.

Constraints under concurrent booking/reservation races are also a useful extension of 28/38/78.
BRIN on correlated event data and GIN for an actual JSON/search workload would be worthwhile later,
but have lower priority than the eight experiments above. Do not add every index type simply to
cover the product surface. Leave deep consensus and broker-specific protocols to their planned
projects.

### Corrections that should precede a broad rewrite

These are source-review findings. Documentation supports the engine behavior below; the proposed
replacement experiments still need real-tool validation before shipping.

- **9:** The systems lens suggests updating any column may rewrite a large TOAST chain and gives
  categorical schema advice. Ordinary updates preserve unchanged out-of-line values; measure an
  actual payload change separately. See
  [TOAST](https://www.postgresql.org/docs/16/storage-toast.html).
- **29:** The challenge asks for `count(*) ... FOR SHARE`, which cannot run because row-locking
  clauses do not apply to aggregation. Locking underlying rows requires a different query and
  schedule; shared-lock upgrades can also introduce deadlock. See
  [SELECT locking clauses](https://www.postgresql.org/docs/16/sql-select.html#SQL-FOR-UPDATE-SHARE).
- **29–30:** Retrying affects whether a requested operation eventually completes; serializability
  still protects committed transactions when an application elects to report an abort. A known
  serialization failure is not equivalent to a network timeout with an unknown outcome. The
  existing toy idempotency insert is also separate from the balance mutation. Teach these cases
  separately and retry the complete decision-making transaction. See
  [serialization failure handling](https://www.postgresql.org/docs/16/mvcc-serialization-failure-handling.html).
- **35:** A metadata-only ADD COLUMN avoids rewriting the table but still takes ACCESS EXCLUSIVE.
  A bounded lock timeout bounds the interruption; it does not guarantee later readers never
  wait. See [ALTER TABLE](https://www.postgresql.org/docs/16/sql-altertable.html).
- **83:** “idx_scan = 0” is presented as proof of cost with no benefit. Lesson 78 itself supplies
  the counterexample: uniqueness enforcement matters even when a read workload never scans that
  index. A short measurement interval also misses infrequent work. Correct this before giving
  index-removal advice.
- **85:** `SELECT 'PUBLISH ...'` prints an intended effect; ROLLBACK does not exercise an external
  delivery. Counting inbox IDs proves deduplication of those IDs, not atomicity of a separate
  consumer business mutation. This is an incomplete demonstration rather than a runtime SQL bug.
- **86:** The `WITH ins AS (INSERT ... DO NOTHING RETURNING ...) ... UNION ALL SELECT ...` pattern
  can return no result when a conflicting insert commits after its statement snapshot. This is
  inferred from PostgreSQL's documented Read Committed conflict behavior. The current race tests
  bare INSERT, not that combined result-returning query. Add the actual race and use a correctly
  scoped fresh-statement retry/result lookup, including concurrent deletion policy. See
  [Read Committed](https://www.postgresql.org/docs/16/transaction-iso.html#XACT-READ-COMMITTED).
- **89:** The trigger rejects a lower explicit epoch, but an UPDATE that omits epoch retains its
  old value and can pass. Thus it does not universally prevent a writer from forgetting the token.
  Also separate lease acquisition from the point at which the protected resource has accepted the
  newer token. Restrict the write interface or scope the claim to cooperative token-carrying
  writers, and test the interval before the newer token reaches the resource.
- **90:** Four watch iterations followed by an unconditional read do not enforce a wait-until-
  caught-up protocol. The origin query is unfiltered and its token is sampled separately from
  the write. Specify the relevant origin/history, bound the wait, fail or fall back when not
  ready, and begin a fresh read snapshot after readiness. Prefer the physical case as the initial
  lesson; an origin cursor needs its own precise progress contract.

Also narrow universal claims in systemsLens prose. For example, snapshots are not simply vector
clocks; PostgreSQL timelines are not Raft election terms; an advisory session lock is not an
expiring lease; one measured buffer count is not a universal tuning rule. Each analogy should name
both the shared principle and the boundary that differs.

### Proposed progression and learning method

Preserve completed lessons 1–7. Continue with storage and visibility, consolidate reclamation,
then teach concurrency and correct client behavior. Introduce minimum plan/wait/log literacy when
first used. Follow with query/index workload engineering, WAL/recovery, physical replication,
logical change processing, integrated worker/delivery protocols, and a final incident/capacity
exercise. Place local transaction patterns beside their primitives and revisit their composition
later; do not defer all application reasoning until lesson 85.

Use one recurring workload, such as a durable task runner with requests, jobs, attempts, results,
outbox entries and receipts. Keep tiny disposable tables for clean mechanism experiments; reuse
the workload for synthesis. Each module should end with an artifact: invariant query, race
schedule, performance report, validated restore, or a short design decision with rejected
alternatives. Do not require substantial application scaffolding.

Use the assistant to prepare bounded failure variants, critique a learner's proposed protocol,
inspect actual output and offer progressively stronger hints. Before executing, ask for a
prediction. Afterward, require an explanation using the evidence and one unobserved case that
could falsify the conclusion. Keep solutions separate from incident prompts so diagnosis occurs
before the cause is revealed. Completion remains the learner's explicit decision; no inferred
progress writes.

The final capstone should prove: accepted durable requests survive the tested crash; retries do
not duplicate the specified receiver effect; abandoned work becomes eligible again; superseded
workers cannot complete guarded work; missed wake-ups do not strand work; reads obey the chosen
freshness contract; and overload produces measured, bounded failure. Require a separate account
of what was demonstrated, what depends on documentation, and what the single-host lab cannot
establish. Preserve the log/history investigation from 96 as supporting evidence.

For an eventual implementation, retain surviving slugs, explicitly map retired lessons, preserve
completed work, update prerequisite and reading-checkpoint placement, and validate every changed
experiment in isolated labs. The current review establishes priorities, not authorization to
rewrite the course or mark any lesson complete.
