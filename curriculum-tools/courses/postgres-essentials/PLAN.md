# PostgreSQL essentials: the 40-lesson route

Current learner direction, 2026-09-06. **Lessons 1–6 are authored and available.** The full sequence
below fixes the intended scope; 7–40 are planned, not placeholder lessons. Nick explicitly prefers
smaller meaningful chunks over compressing the same work into 24 long sessions. Target **20–30
minutes per lesson**, including context, setup, experiment, reflection and cleanup. Timings remain
estimates until learner feedback. Changes to scope must be recorded here, not invented as we go.
Refine presentation while the learner progresses through this actual course.

Assume basic SQL and the eight completed reference lessons: lab, psql, extensions, processes, pages,
row versions and HOT. No requirement to repeat them or take the old TOAST/cache/XID pilot. Each
lesson teaches the mechanism and useful terminal diagram before commands in `lesson`; `review`
interprets evidence, implications and limits. Optional references are not hidden homework. No typed
guesses, reports or extra coaching stages. Nick enjoyed the first batch and requested lessons 4–6.
Ask about clarity and pacing after lesson 6 while preparing lessons 7 onward; feedback improves the
course rather than being a UX-only detour.

## Fixed sequence and intended outcomes

These entries are 40 further lessons after the eight already completed. Reference numbers below
refer to the original 92-lesson catalog and indicate source material, not required extra lessons.
Future command descriptions are design intentions until their experiments are authored and tested.

| #  | Lesson / stable slug                                                                                     | Cause and observe                                                                                   | Decision or capability                                        | Reference source         |
| -- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------ |
| 1  | **An uncommitted write is private to its transaction** (`committed-row-visibility`)                      | Hold an UPDATE open, compare two readers, then commit or roll back; BEGIN, SELECT, COMMIT, ROLLBACK | Distinguish private writes from committed visible data        | 13, 14, 21, 22           |
| 2  | **Choose a fresh statement view or a stable transaction view** (`statement-versus-transaction-snapshot`) | Commit between two reads under Read Committed and Repeatable Read                                   | Choose snapshot lifetime for multi-query work                 | 12, 13, 22               |
| 3  | **An old reader can prevent vacuum from removing history** (`old-reader-retains-history`)                | Hold a snapshot across DELETE and VACUUM, release it, vacuum again; pgstattuple, pg_stat_activity   | Find the retention obligation before repeating maintenance    | 15, 17                   |
| 4  | **Reusable space is different from a smaller file** (`reusable-space-versus-file-size`)                  | Delete, vacuum and refill; pg_relation_size and free space                                          | Distinguish reuse from filesystem reclamation                 | 17, 18                   |
| 5  | **Lose an update, then keep arithmetic in the database** (`lost-update-and-atomic-write`)                | Race stale read/modify/write operations; compare atomic UPDATE                                      | Avoid unnecessary read-modify-write races                     | 23                       |
| 6  | **Protect a read-modify-write decision with a row lock** (`row-lock-protects-decision`)                  | Repeat a race with SELECT FOR UPDATE and observe waiting                                            | Choose a short pessimistic critical section                   | 23, 30                   |
| 7  | **Reject a stale edit with a version check** (`reject-stale-edit`)                                       | Race conditional UPDATEs and inspect affected row counts                                            | Choose optimistic conflict detection and re-evaluation        | 24                       |
| 8  | **Two valid decisions can break one shared rule** (`multi-row-write-skew`)                               | Interleave two RR transactions that violate a multi-row invariant                                   | Recognize snapshot isolation’s limit                          | 26                       |
| 9  | **Make the conflicting decision fail under Serializable** (`serializable-protects-invariant`)            | Repeat the invariant with SERIALIZABLE and inspect SQLSTATE                                         | Select isolation based on the invariant                       | 27                       |
| 10 | **Retry a known-aborted transaction from the beginning** (`whole-transaction-retry`)                     | Run a supplied bounded retry client and inspect attempts                                            | Retry fresh decisions rather than one failed statement        | 25, 28                   |
| 11 | **A lost response leaves the commit outcome unknown** (`unknown-commit-outcome`)                         | Withhold a response after COMMIT and inspect durable state                                          | Separate caller knowledge from database outcome               | 29                       |
| 12 | **Reconcile a repeated request by its durable identity** (`durable-request-identity`)                    | Race duplicate requests and reconnect after a lost response                                         | Avoid repeating the specified database effect                 | 29, 84                   |
| 13 | **Find the transaction controlling a wait** (`find-the-blocker`)                                         | Create a blocker and inspect pg_blocking_pids and wait_event                                        | Trace waiting to a responsible transaction                    | 31, 63                   |
| 14 | **Cause a deadlock and explain the cycle** (`deadlock-cycle`)                                            | Acquire two row locks in opposite orders and read the error                                         | Choose consistent ordering and classify a failed attempt      | 32                       |
| 15 | **A deadline does not always end the transaction** (`timeout-and-transaction-state`)                     | Trigger lock/statement timeouts and inspect subsequent commands                                     | Define rollback and connection handling after cancellation    | 33, 66, 91               |
| 16 | **Read a plan as measured work** (`read-a-plan-as-evidence`)                                             | Execute a query with EXPLAIN ANALYZE BUFFERS                                                        | Separate estimates, actual rows and buffer work               | 38                       |
| 17 | **Repair a misleading row estimate** (`statistics-and-estimates`)                                        | Change distribution and compare before/after ANALYZE                                                | Fix information before forcing a plan                         | 39                       |
| 18 | **An index can stop being the cheaper path** (`index-crossover`)                                         | Vary selectivity with the same indexed table                                                        | Explain scan choice from work rather than index presence      | 40                       |
| 19 | **Match an index to filtering and ordering** (`composite-index-order`)                                   | Compare two composite indexes for one bounded workload                                              | Choose column order from the access pattern                   | 48, 51                   |
| 20 | **Covering the columns is only half an index-only scan** (`index-only-needs-visibility`)                 | Update, vacuum and compare Heap Fetches                                                             | Account for visibility and write cost in index design         | 19, 48                   |
| 21 | **Make a sort spill, then bring it back into memory** (`sort-spill`)                                     | Change local work_mem and inspect sort method/temp I/O                                              | Choose a query-scoped memory tradeoff                         | 42                       |
| 22 | **A join adds another memory consumer** (`join-memory`)                                                  | Compare a hash join under two budgets; batches/temp work                                            | Account for per-operation and concurrent memory               | 41, 42                   |
| 23 | **Connect commit acknowledgement to durable log work** (`commit-and-wal`)                                | Observe WAL progress around writes and commit settings                                              | State the durability boundary of a success response           | 52, 54                   |
| 24 | **Measure WAL per useful operation** (`wal-per-useful-write`)                                            | Compare supplied batched and unbatched writes with equal final rows                                 | Balance throughput, waiting and write amplification           | 57                       |
| 25 | **A checkpoint writes pages without ending transactions** (`checkpoint-writeback`)                       | Observe dirty buffers and checkpoint work in an owned fixture                                       | Distinguish page write-back from commit                       | 10, 58                   |
| 26 | **Reconcile committed and aborted work after a crash** (`crash-replay`)                                  | Crash an owned cluster and inspect recovered rows and log                                           | Explain replay and outcome visibility                         | 56, 59                   |
| 27 | **Prove a backup can restore the intended data** (`restore-and-verify`)                                  | Restore into a separate fixture and compare a known inventory                                       | Require tested recovery rather than backup-file existence     | 61                       |
| 28 | **Recovery can fail when one required segment is missing** (`recovery-needs-history`)                    | Remove required history from an owned recovery copy                                                 | Identify the obligation before deleting archived WAL          | 55, 61                   |
| 29 | **Recover to a chosen point and account for excluded work** (`targeted-recovery`)                        | Use a named recovery target and compare operation histories                                         | Choose a recovery point with explicit data consequences       | 62                       |
| 30 | **Build and verify a streaming standby** (`build-a-standby`)                                             | Start an owned standby and verify recovery mode and data                                            | Distinguish replica setup from a freshness guarantee          | 69                       |
| 31 | **Received WAL is not yet visible data** (`received-is-not-replayed`)                                    | Pause replay, commit on primary and compare positions and rows                                      | Locate where replica progress stopped                         | 70                       |
| 32 | **Give a replica read a bounded freshness guarantee** (`bounded-read-your-writes`)                       | Gate on the right replay position with deadline/fallback                                            | Enforce a read-your-writes contract                           | 71                       |
| 33 | **Choose what a synchronous acknowledgement waits for** (`synchronous-acknowledgement`)                  | Contrast remote flush and apply with a controlled pause                                             | Trade commit availability against remote progress             | 72                       |
| 34 | **More clients can produce more waiting instead of more work** (`connection-capacity`)                   | Step a supplied workload’s client count; measure completions/latency                                | Bound concurrency from observed useful capacity               | 65                       |
| 35 | **Keep a schema change from becoming an unbounded queue** (`bounded-online-change`)                      | Bound DDL waiting and backfill a small fixture in short batches                                     | Verify migration progress and decide when to stop             | 34, 46, 47, selected     |
| 36 | **Commit business state and pending delivery together** (`transactional-outbox`)                         | Crash around a local business/outbox transaction                                                    | Close the local dual-write gap                                | 83, local half           |
| 37 | **Commit the receiver effect before acknowledging delivery** (`receiver-effect-before-ack`)              | Crash between receiver commit and acknowledgement, then redeliver                                   | Make one receiver effect survive duplicate delivery           | 79, 83, receiver half    |
| 38 | **Make abandoned work eligible again** (`recover-abandoned-claim`)                                       | Claim briefly, terminate a supplied worker and reclaim the task                                     | Separate claiming work from successfully completing it        | 36, claim/recovery slice |
| 39 | **Choose evidence before seeing an incident’s cause** (`investigate-an-unfamiliar-incident`)             | Use a supplied symptom fixture with graduated runnable hints                                        | Distinguish waiting, expensive execution and retained history | 63, 88, 91, selected     |
| 40 | **Verify that the remedy restored correct useful work** (`intervene-and-verify`)                         | Repair the incident and check operation history, state and latency                                  | Defend a remedy and state its remaining limits                | 92, narrowed             |

## First batch and dependencies

1 introduces visibility through commit and rollback. 2 uses that concept to compare snapshot
lifetimes. 3 applies the stable view to physical retention and reclamation. Each resets its own
small `pe_*` table and finishes open transactions. Their only course prerequisites are 1 → 2 → 3;
there is no snapshot-number anatomy or TOAST detour. Each matches its corresponding row above.

Later sequences build on these foundations: 4 on 3; 5–12 on visibility and prior race experiments;
13–15 on transaction lifetime; 16–22 develop query evidence in order; 23–29 develop durability and
recovery in order; 30–33 build replication on WAL; 34–38 combine earlier concurrency/durability
mechanisms; 39–40 integrate them. Future authored prerequisites must name earlier stable slugs. Do
not silently expand a 30-minute lesson into several unbudgeted experiments: narrow or explicitly
revise this route if validation or learner timing shows it is too large.

Supply code for unfamiliar mechanisms throughout. Increase independence through interpretation, then
choice of observation and remedy in 39–40. Final evidence is a checked operation history, restored
useful work and an explanation of what the chosen intervention does not establish. No application
scaffolding is required. Later replication/recovery lessons use supplied owned fixtures with
teardown included in their time budget. A single-host lab tests process/transaction boundaries, not
independent-host availability or cloud durability.

## What stays optional

Detailed TOAST/page/XID tours, full index taxonomy, freeze administration, WAL binary anatomy,
failover/rewind/failback, logical bootstrap/repair, two-phase commit and resource fencing are later
reference branches. The worker-claim lesson does not claim to solve external-side-effect fencing.
Retain PostgreSQL storage internals already learned; do not repeat them just to fill a route slot.

## Identity, implementation and validation

`curriculum/*.ts` is source; `lessons.json` is generated and contains only real available lessons.
`route.ts` holds the exact ordered titles/slugs for `pgcoach route`; tests check all available
entries against the built catalog. A separate `postgres-essentials` course ID keeps numbering 1–40
and new progress separate from the original 92-lesson catalog. `pgcoach` opens essentials by
default; `pgcoach --reference NUMBER full` preserves old access. Old completion records are never
copied to new lesson identities. Only explicit `pgcoach NUMBER done` or tutor completion commands
write status.

Canonical book research remains under `docs/books/postgresql-14-internals/`; no PDF copy is needed.
The first batch's tags are mvcc, snapshots, isolation, vacuum and retention. Batch two adds storage,
reclamation, read-committed, lost-update, concurrency, row-locks and concurrency-control. Validate
exact setup and session blocks against a private PostgreSQL 16 cluster, check outcomes rather than
timeouts alone, then remove the cluster. Keep only the small validation log/report and script.
Maintain at least 2 GB free, budget <200 MB peak for this batch, and verify learner-lab readiness
and unchanged reference progress before finishing. No backup, replica or archive is needed for
lessons 1–6.
