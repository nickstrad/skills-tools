# SQLite Essentials

Status: proposed route, 2026-09-12. Course ID: `sqlite-essentials`. No essentials lessons have been
implemented. The [existing 54-lesson SQLite Systems course](../../curriculum-tools/courses/sqlite/PLAN.md)
remains available as reference with its own progress.
Outline revision: 1. Final-outline sign-off: pending. This is a persistent working draft to revise
with learner feedback, not an approved implementation request.

## Goal and size

Learn how SQLite executes SQL, stores pages, coordinates writers, commits safely, and reclaims
history inside an application. Assume basic SQL and the PostgreSQL Essentials foundations, while
recapping unfamiliar terms before each experiment. Keep SQLite's distinctive internals; defer most
offline synchronization and distributed application work.

**32 lessons, target ten minutes each, core ceiling fifteen minutes.** That is 5 hours 20 minutes
at the target or 8 hours at the ceiling, including context, setup, execution, interpretation, and
cleanup. Two lessons per study day means 16 study days; one per day still means 32. Installation
will be prepared during authoring and any separate learner setup time declared before delivery.
These are design targets, not measured completion times.

Thirty-two preserves distinct lessons for writer admission, busy COMMIT, stale snapshots, and
checkpoint retention while retaining pages and execution. Forty would add breadth the learner does
not currently need; compressing to twenty-four would combine several of those mechanisms or cut
internals. See the [course comparison and reuse analysis](../../docs/readings/sqlite/essentials-proposal.md).

## Why this breakdown and order

Start with process/connection ownership, then pages and B-trees: those supply the objects later
commit and recovery protocols must protect. Teach rollback before WAL so before-images and in-place
updates provide a concrete contrast with appended page history. Separate writer admission,
read-to-write upgrade, and busy COMMIT because they require different retry decisions. Keep WAL
snapshots, checkpoint progress, retained history, and unfinished-query lifetime distinct so one
short experiment changes one cause. Then connect execution and caches to the storage model, and
finish with backup/checking and a bounded diagnosis using already-familiar evidence. Optional
distributed application patterns would add a different course's scope rather than clarify this
engine. These choices follow the linked research; proposed experiments still need validation.

## Learner feedback and final sign-off

Present this outline and ask Nick what he wants added, removed, deepened, shortened, or reordered.
Record suggestions, decisions, and unresolved questions here as discussion proceeds, then request
explicit sign-off on the final outline before implementation.

- Feedback: awaiting learner suggestions on this proposal.
- Final-outline approval: pending; record approval date, outline revision, and user direction here.
- Implementation request: none. Do not author the first batch until approval and a batch request.

## Canonical route

Each row describes a proposed experiment, not validated commands. Slugs identify future essentials
lessons; matching a reference topic does not transfer its completion. Implementation proceeds in
small requested batches and must not silently expand this route.

| # | Lesson / stable slug | Cause and observe | Systems insight |
| --- | --- | --- | --- |
| 1 | Where does SQLite run? / `embedded-file-ownership` | Two CLI processes open one owned file; one writes and the other reads. Show the architecture map and check the few required build capabilities in setup. | Embedded library, shared file, process ownership. |
| 2 | Why did the new connection lose my settings? / `connection-policy` | Set a connection policy, reopen, compare it with persistent WAL mode, then initialize the actual worker correctly. | Persistent state versus connection-local policy. |
| 3 | How does a table grow inside a file? / `pages-and-tree-growth` | Insert bounded batches and inspect page counts and B-tree shape with dbstat. Decode only the page-size/header fields needed to interpret it. | Pages, tree growth, physical allocation. |
| 4 | What does a secondary index point to? / `rowid-and-index-locators` | Compare INTEGER PRIMARY KEY with a separate indexed key and inspect their storage objects and lookup paths. | Logical identity versus physical locator. |
| 5 | What changes with WITHOUT ROWID? / `without-rowid-layout` | Store the same composite-key rows in both layouts and compare table/index pages. | Clustering and the cost of carrying a primary key. |
| 6 | Where does a value go when it cannot fit on a page? / `overflow-page-locality` | Enlarge a payload and observe overflow pages. | Indirection and locality; contrast with TOAST. |
| 7 | Why did DELETE leave the file large? / `reuse-versus-compaction` | Delete, refill, then compact a disposable copy; compare reusable pages and file length. | Reuse versus filesystem reclamation. |
| 8 | How can in-place updates be atomic? / `rollback-before-images` | Hold an update in rollback mode; inspect its journal and then undo it. | Before-images and ordered commit work. |
| 9 | What recovers an interrupted write? / `hot-journal-recovery` | Supplied controller kills its own writer after verified journal creation, preserves evidence, opens a working copy, and checks committed/aborted rows. | Recovery completes an interrupted protocol. |
| 10 | Which writes must reach durable storage? / `synchronization-boundary` | Compare two rollback synchronization policies using a short, file-attributed syscall trace. | Write versus synchronization; atomicity versus durability. |
| 11 | Why does batching change write cost? / `transaction-batching` | Same rows and connection count, two transaction sizes; compare sync counts and verified results. | Amortization across a commit boundary. |
| 12 | Can two writers change unrelated rows at once? / `single-writer-admission` | Hold BEGIN IMMEDIATE; a second writer targets another row and hits a bounded admission wait. | One writer per database; critical-section scope. |
| 13 | Why can a transaction fail only when it starts writing? / `deferred-writer-upgrade` | Start a deferred read and interleave a competing rollback-mode writer before upgrade. | Late resource acquisition and retrying the decision. |
| 14 | Can COMMIT be busy without losing the transaction? / `retry-busy-commit` | Hold a rollback reader, cause the writer's bounded COMMIT failure, release the reader and retry COMMIT. | Waiting versus abort; retry scope. |
| 15 | Does one failed statement undo the whole transaction? / `statement-error-scope` | Put a uniqueness failure between successful writes and inspect what commits; compare explicit rollback. | Statement error versus transaction error. |
| 16 | Where is a committed write before checkpointing? / `committed-wal-frames` | Keep connections open, commit in WAL mode, inspect main/WAL/SHM and visible rows. | Logical state can span several files. |
| 17 | How can a reader coexist with a writer? / `wal-reader-snapshot` | Pin A's snapshot, let B commit, then end A's read and compare results. | Page history and a reader's WAL end mark. |
| 18 | Why will a bigger timeout not fix this stale write? / `stale-snapshot-upgrade` | Try upgrading an old WAL snapshot after B commits; restart and reread. | An obsolete snapshot cannot be repaired by waiting. |
| 19 | Why does a checkpoint not necessarily shrink the WAL? / `checkpoint-versus-truncation` | Compare checkpointed-frame progress with retained bytes, then request truncation after readers finish. | Applying history, reusing space, and truncating are separate. |
| 20 | Who pays for automatic checkpoint work? / `automatic-checkpoint-work` | Same writer and durability policy, two thresholds; correlate commit markers with maintenance I/O. Explain WAL FULL/NORMAL in the lesson's interpretation. | Foreground maintenance and latency distribution. |
| 21 | How does a slow reader retain WAL history? / `reader-retains-wal` | Hold a read, commit a bounded sequence, checkpoint, release and checkpoint again. | Reclamation depends on the oldest remaining obligation. |
| 22 | Can unfinished query results keep a snapshot alive? / `unfinished-query-lifetime` | Supplied Go reader pauses mid-result without explicit BEGIN; writer/checkpointer runs; close the result and compare progress. | API resource lifetime becomes storage lifetime. |
| 23 | What does SQLite execute after parsing SQL? / `sql-to-bytecode` | Change a small indexed lookup and inspect its EXPLAIN program, identifying only seek, column, result, and loop work. | SQL compilation, bytecode, execution. |
| 24 | How does a covering index reduce actual work? / `covering-index-work` | Compare scan and covering lookup for the same answer using EQP and VM/full-scan counters. | Access paths; contrast PostgreSQL visibility checks. |
| 25 | When can index order remove a sort? / `index-order-removes-sort` | Add one workload-matched composite index; the temporary sorting B-tree disappears from EQP. | Ordered access can replace intermediate work. |
| 26 | What does an extra index cost the writer? / `index-write-cost` | Equal updates with and without one maintained index; compare VM work and storage. | Read acceleration creates write amplification. |
| 27 | Which cache did my second query hit? / `pager-cache-ownership` | Repeat a bounded scan on a persistent private-cache connection and a fresh one; compare scoped pager hit/miss deltas. | Connection memory versus OS cache versus device I/O. |
| 28 | Why is copying the main file not a live backup? / `unsafe-main-file-copy` | Copy only a controlled WAL database's main file and compare its committed rows with the intact live source. | A byte copy is not a coordinated snapshot. |
| 29 | What proves a backup is usable? / `backup-and-restore-inventory` | Use .backup, open the result independently, and verify a known committed inventory. | Recovery evidence, not file existence. |
| 30 | What does integrity_check actually prove? / `integrity-versus-domain` | Construct valid storage with a foreign-key/domain violation and compare engine, FK, and application checks. | Structural correctness versus semantic correctness. |
| 31 | Why do more writers mostly add waiting? / `writer-occupancy` | Supplied two-worker workload moves the same non-database delay inside/outside the writer transaction; compare successes, busy outcomes, and waiting. | Service time, serialization, and backpressure. |
| 32 | Can you diagnose and repair one SQLite incident? / `diagnose-and-verify` | One supplied familiar failure, hidden cause, runnable hints; choose evidence, apply one remedy, verify rows and restored progress. Discuss whether it is an application-lifetime issue or an engine-fit limit. | Evidence-driven intervention and an architecture decision. |

## Visual teaching plan

Use terminal diagrams before setup and commands, leaning toward inclusion. Reuse and develop these
pictures through the corresponding lessons:

- 1–2: application processes opening one file; persistent file state versus connection settings.
- 3–7: B-tree pages, rowid/index lookup arrows, overflow chains, and reused versus released space.
- 8–11: before-image → journal sync → main-file write ordering, a crash point, and batched commits.
- 12–15: two-session timelines, writer ownership, reader upgrade, and statement/transaction scope.
- 16–22: main file plus WAL frames, reader end marks, checkpoint frontier, and cursor lifetime.
- 23–27: bytecode execution path, covering lookup, sorted access, and pager/OS cache layers.
- 28–32: live-copy boundary, independent restore, correctness checks, and writer waiting.

For example, the snapshot diagram in the pre-experiment explanation should make the reader's
boundary visible before the learner runs either session:

```text
WAL:       [commit 1] -------- [commit 2] -------- [commit 3]
                ^                                  ^
A reads here ---+                                  +--- B's latest commit
                |
                +-- A keeps this view until its read transaction ends
```

Each diagram needs a short explanation connecting labels to evidence. Use plain ASCII where
practical; optional ANSI color must not carry meaning alone. Keep diagrams within ordinary terminal
widths and include them in the shared `syntaxBreakdown` Markdown, before the command explanation.
No SQLite-specific rendering code is needed.

## Delivery and implementation boundary

Use the generic `tutor sqlite-essentials <n> lesson|done` interface when the course is implemented.
Each lesson contains its pre-experiment explanation and diagram, supplied commands, expected
results, interpretation and cleanup. There is no separate review stage or required reading stop.
Interpretation includes a short PostgreSQL comparison where useful. Optional variations do not
count as unfinished core work. `tutor sqlite-essentials route` already displays this plan. Lesson
and completion commands become available as the essentials course is implemented.

Author lessons 1–4 first when implementation is requested. Supply short Go helpers only where
process or statement lifetime needs them; most experiments use sqlite3 and shell commands. Check
actual learner pacing before the next batch. New fixtures must be validated against the real
engine, including the SQLite version used by any Go binding, and cleaned up. Preserve the old
catalog and progress. Record actual availability in this file as batches land.

Highest pacing risks are 9, 19–22 and 31–32: use supplied orchestration, short traces, one-variable
comparisons and one familiar incident. The final lesson asks for an evidence-backed remedy and a
brief decision, not a written architecture report or application build.

Optional reference scope: detailed headers/journal modes, schema migration and STRICT typing,
statistics, quota/corruption salvage, ATTACH, FTS, offline histories, outboxes, fencing and rejoin.
These are useful branches, not hidden prerequisites. Do not author them simply to fill the route.

## Sources and limits

The [research/reuse analysis](../../docs/readings/sqlite/essentials-proposal.md) maps this route to
existing experiments and primary sources. Core references are SQLite's
[architecture](https://sqlite.org/arch.html), [file format](https://sqlite.org/fileformat.html),
[atomic commit](https://sqlite.org/atomiccommit.html), [transactions](https://sqlite.org/lang_transaction.html),
[WAL](https://sqlite.org/wal.html), [query plans](https://sqlite.org/eqp.html), and
[backup API](https://sqlite.org/backup.html). Existing
[validation findings](../../docs/knowledge/sqlite-lesson-gotchas.md) guide implementation.
A process kill does not establish power-loss durability; page-cache misses are not device reads;
a query plan does not establish runtime or a disk spill. New behavior and timings remain unvalidated.
