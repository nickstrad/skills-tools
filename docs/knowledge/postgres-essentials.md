# PostgreSQL essentials: publish the route, then author its real lessons

Updated 2026-09-13. The active route is 40 small lessons, with its first 31 implemented. The
[plan](../../curriculum-tools/courses/postgres-essentials/PLAN.md) fixes titles, stable slugs,
intended outcomes and reference-source mappings for every entry.

## What happened

Nick rejected spending time on old lessons merely to test coaching UX. He asked for actual first
lessons of a specified shorter course, then chose 40 meaningful chunks over 24 dense sessions. The
20–30 minute estimates recorded at the time were nominal; he now reports roughly ten minutes per
current lesson while studying around parenting and a full-time job. No TOAST/cache/numeric-XID
detour is required.

The Go CLI serves the Essentials route as `tutor postgres-essentials`. Its course ID gives separate
numbering and progress without rewriting the original eight completions or migrating the 92-lesson
reference catalog. Thirty-one real lessons are authored; future entries are held in `PLAN.md`.
Rendering or finishing the available batch must not report all 40 complete. The old course-specific
launchers are retired; original course data is preserved.

On 2026-09-12 the learner flow became one complete `lesson` output: mechanism context, a useful
terminal diagram, setup and commands, expected evidence, interpretation, optional references or
variations, and cleanup. There are no review, full, start, prediction, or reveal stages. The generic
Go CLI supports the same `tutor <course> <number> lesson|done|skip` contract for every course, so
future courses need no custom renderer.

## Why it matters

Authoring a short flow around unrelated old lessons did not satisfy the learner's goal. Scope and
UX need to advance together. A wrapper cannot make an oversized experiment concise. Each new
lesson has one bounded comparison, supplied syntax, short mechanism context, a labelled diagram
before commands when useful, expected evidence, interpretation, and cleanup. Plain text must carry
the diagram's meaning; ANSI colour is optional. Lessons are self-contained, with no assigned external reading,
review stage, checkpoint, homework, or written response.

Two-course identity also prevents accidental completion of a different lesson with the same number.
The installed `tutor` skill points to the repository source. Use `tutor postgres-legacy route` for
the 92-lesson reference course (`postgres` remains its alias) and `tutor postgres-essentials route`
for Essentials.

## How to apply

- Follow the fixed plan when authoring remaining lessons. Record agreed changes to scope; do not
  improvise an unrelated next topic or add an extra UX prerequisite batch.
- Keep commands printed by `lesson` identical to the built setup/code. Route tests cover this,
  available-lesson identity matching, diagrams before setup, explicit completion, progress-byte
  preservation, pending lessons, and the installed launcher.
- Keep `tutor postgres-essentials route` aligned with the plan: completed lessons, authored
  available lessons, and planned lessons are different statuses. Planned rows are navigation, not
  progress records.
- Validate each new experiment on a private PostgreSQL cluster. The first batch ran in two real
  sessions; the final third lesson was rerun after removing noisy VERBOSE vacuum output. Tuple
  counts still prove retention/reclamation directly. Check exact outcomes, not just timeouts.
- Preserve the learner lab and reference progress. The validation controller owns one unique
  `/tmp/pg-essentials-validation-*` root, verifies identity and removes it after normal shutdown in
  `finally`. Both roots allocated during this batch were retired. Retain only small logs, outcome
  assertions, controller and report under the course's `validation/` directory.

The [first batch validation report](../../curriculum-tools/courses/postgres-essentials/validation/README.md)
records the measured results and limits. Its timing estimates are historical; learner pace is now
reported at roughly ten minutes.

The remaining sections are historical batch acceptance and validation records. Mentions of the old
two-view presentation describe what was tested at that time; they do not restore a separate learner
stage.


## Second batch accepted

Nick enjoyed the two-view flow in lessons 1–3 and requested the next three of this same route.
Lessons 4–6 add heap-space reuse, lost-update versus atomic arithmetic, and a row-locked stock
reservation decision. See the [second-batch acceptance](../../curriculum-tools/courses/postgres-essentials/validation/batch-two.md)
and the historical root handoff. That checkpoint's feedback point was lesson 6; the third batch below supersedes availability.

A shared validator's asynchronous `(blocks ...)` send does not itself prove the second backend
actually waited before the first committed. The Go harness now waits for an observed lock event and
the expected blocker before releasing A. It adds this synchronization only to validation; the
learner still follows the supplied terminal-switch instructions. Scalar outcome checks alone could
accept a serial execution of the atomic-write experiment.

Keep observations separate: lesson 4 fixes heap truncation off and measures the main fork; it does
not claim every vacuum preserves file size. Lesson 6 deliberately permits negative stock in the
fixture so the stale decision has a visible failure; this is not a recommended inventory schema.
Its supplied manual decline is an experiment action, not an implemented application branch.

When adding a batch, refresh the lesson catalog through `tutor postgres-essentials init` after
checking a copy. Compare progress and attempt rows, not whole-file bytes across that intentional
catalog update. Check logical progress/attempt rows as well as file bytes: WAL-mode updates can leave the main
SQLite file hash unchanged while the WAL contains the refreshed catalog. Views must still leave
learner history unchanged, and reference progress must stay untouched.

## General authoring checks from the third batch

Added during the 2026-09-07 batch and verified by its final acceptance.

- Follow [the durable batch workflow](../lesson-batch-workflow.md) for primary design, bounded
  Sol assignments, primary review and per-chunk commits. Resolve prerequisite names against
  `PLAN.md`, even when the prerequisite is being authored concurrently. A plausible invented
  slug breaks integration despite an otherwise type-correct module.
- A course gaining its first shell lesson needs both renderer and validator dispatch by
  `runIn`. SQL fencing, a psql connection command and ROLLBACK instructions are incorrect for
  a supplied shell client. Verify rendered commands against source in the correct language,
  and check shell exit status as well as completion markers.
- Quiet psql suppresses command tags. Capture `ROW_COUNT` immediately after a conditional
  write and `SQLSTATE` immediately after COMMIT when those values establish acceptance.
  A later query overwrites those variables. Do not infer a committed write merely from a
  client's earlier success message.
- Expected failures need an exact per-lesson error inventory. A blanket rejection of ERROR
  prevents teaching serialization failures; globally allowing 40001 could hide a failure in
  another lesson. Check the expected session/phase, count, immediate SQLSTATE and final
  committed state together, and reject all other errors.
- `Run` is a verbatim Markdown code block: preserve one literal backslash for psql commands in
  both SQL and prose. Optional runnable variations need Markdown code blocks too; unformatted SQL may
  collapse into prose even when it looks readable in the source file.

The supplied retry client passed its first real acceptance checkpoint on 2026-09-07. A useful
teaching distinction is **request completion versus the originally requested mutation**: after
40001, the fresh read changes the decision from leaving to staying. Test that changed decision,
the independent committed state, and error/attempt limits; a second successful COMMIT alone
would also accept a client that blindly reused the stale decision. Keep controlled scheduling
separate from retry policy. Completed command responses establish overlap here; elapsed sleeps
do not. A short delay only spaces retries. Include supplied client source hashes alongside
lesson hashes because a short launcher command can remain unchanged while its behavior changes.

For optimistic-edit demonstrations, capture the reread into client variables first, then print
those same variables and use them for the proposed merge. A diagnostic SELECT followed by a
second SELECT for the write token can observe different versions under Read Committed. The
conditional write still detects a later conflict, but the evidence should represent the exact
body/token used by the decision. Primary lesson-7 validation now checks that correspondence.


## Third batch accepted

Lessons 7–10 are available, with primary designs, Sol implementations for 7–9 and primary review
and refinement. The [batch-three report](../../curriculum-tools/courses/postgres-essentials/validation/batch-three.md)
records standalone and full-catalog PostgreSQL 16.15 evidence, optional variations, bounded client
failure cases, 37 passing tests and resource cleanup. The full-run source manifest also hashes the
supplied retry client. The next availability boundary is lesson 11; previous lessons and revisions
are unchanged.

Use persistent psql sessions for client-variable experiments: one-shot psql calls discard values
saved by `\gset`. Execute displayed variation blocks through the same session splitter and check
their outcomes independently. A variation is not accepted merely because its core lesson passed.

When the learner is studying during authoring, compare history immediately around each catalog
refresh or render check. A legitimate new completion can appear between validation checkpoints.
Preserve that current history; do not restore the start-of-run snapshot or treat a larger completion
count as an author migration failure. SQLite backup copies include WAL state, unlike a raw file copy.
The batch-three live refresh preserved all four completion/attempt rows present at its start,
including learner progress made since the earlier three-row copied-refresh checkpoint.

## Fourth-batch design and validation findings

Lessons 11–15 extend the same route through uncertain outcomes, request identity and transaction
lifetime. The [design](../../curriculum-tools/courses/postgres-essentials/designs/11-15.md) fixes the
boundary of each experiment. See the [acceptance report](../../curriculum-tools/courses/postgres-essentials/validation/batch-four.md)
for measured evidence and resource closure.

- Name the response boundary explicitly. Withholding an application's reply after the service
  receives COMMIT is a useful unknown-outcome experiment for its caller. It does not test lost
  PostgreSQL protocol packets or crash recovery. Keep caller evidence separate from the
  investigator's fresh connection, and compare before-COMMIT closure to show that identical
  caller silence can accompany different committed states.
- Keep the request-identity effect small enough to prove. In lesson 12 the uniquely keyed ledger
  row is both the credit and receipt. This avoids an unexamined gap between separate effects.
  A duplicate INSERT returning no row still requires a fresh Read Committed query and payload
  comparison. Reconnect with `\connect - - - -` to inherit the private or learner connection
  parameters; never hard-code the learner socket inside a reusable validation experiment.
- Different contributions from the two deadlock participants make final state diagnostic:
  `{10,10}` versus `{1,1}` identifies the whole surviving attempt. Correlate it with the actual
  ERROR session and immediate 40P01/00000 statuses; do not assume a fixed victim. A same-order
  comparison should still exhibit a real wait while allowing both contributions to commit.
- Scope output labels and expected errors by lesson and phase. Both a blocker and a timeout
  lesson can legitimately print `final_balance`; a whole-log search can read the earlier lesson's
  value. SQLSTATE inventories must permit only the intentional deadlock/timeout errors, including
  the separate autocommit variation, while rejecting unexpected errors elsewhere.
- Optional multi-session variations need complete fenced, labelled blocks with their own setup,
  guards and cleanup. Prose terminal switches disappear when extracting runnable evidence, and
  the variation runner intentionally skips the core setup. Verify the actual displayed commands.


## Query-work batch: review and validation rules

Lessons 16–21 follow [the fifth-batch design](../../curriculum-tools/courses/postgres-essentials/designs/16-21.md).
The following distinctions guided primary review:

- An EXPLAIN node's row estimate describes output, not every row examined. Actual rows and filtered
  rows are reported per loop; parent buffer counts include child work, so summing the tree double
  counts. Costs are model units, and a shared-buffer read does not establish physical disk I/O.
  See [PostgreSQL 16 EXPLAIN](https://www.postgresql.org/docs/16/using-explain.html).
- A trailing B-tree equality condition can appear as Index Cond even when it does not bound the
  leading-column range. Thus both index orders can avoid a sort and heap-level filtering while
  examining very different index ranges. Compare buffer work, not an invented Rows Removed count.
  This batch targets PostgreSQL 16; do not silently import later planner features into its claims.
  See [multicolumn indexes](https://www.postgresql.org/docs/16/indexes-multicolumn.html).
- After UPDATE grows a heap, PostgreSQL can scale the old cardinality using the current relation
  size. A stale estimate therefore need not remain the original equality count. Verify a material
  error and its repair, keeping live data unchanged across the ANALYZE comparison.
  See [planner statistics](https://www.postgresql.org/docs/16/planner-stats.html).
- A covering index needs visibility-map evidence to skip heap checks. The middle Heap Fetches
  count can exceed the final output row count because index entries for obsolete versions can
  also lead to checks. Accept zero/positive/zero with equal query output counts, rather than a
  fixed middle count. See [index-only scans](https://www.postgresql.org/docs/16/indexes-index-only-scans.html).
- A sort's work_mem allowance is not a connection-wide or server-wide cap. Keep the comparison
  local to the transaction and account for simultaneous operations and workers. The LIMIT
  variation keeps the small budget unchanged so the bounded retained set is the changed condition.
  See [resource settings](https://www.postgresql.org/docs/16/runtime-config-resource.html#GUC-WORK-MEM).
- Hand-copied SQL can establish prototype behavior but cannot establish exact-source acceptance.
  A hash captured after such a run does not close that gap. Import the authored setup/code or
  drive the built catalog and extract the displayed variation fences. This catches raw-template
  backticks and doubled psql backslashes that a manually copied SQL script can conceal.

The final resource inventory must cover failed author attempts as well as the accepted run. In this
batch it found an earlier index prototype still running after the accepted suffix-c root had been
retired. A report that one root was removed does not close every allocation. Put ownership setup
(including mkdir/chown) inside the validator's cleanup scope, and independently check actual data
directories and processes before final completion.

The [fifth-batch acceptance](../../curriculum-tools/courses/postgres-essentials/validation/batch-five.md)
records all six standalone core/variation checks and the final21-lesson run,37 passing tests,
unchanged first15 lesson objects, preserved13 learner history/attempt rows during catalog refresh,
and final cleanup with only the learner server remaining. Lesson22 is the next planned entry.


## WAL/recovery batch: evidence and owned-controller boundaries

Lessons 22–26 follow [the sixth-batch design](../../curriculum-tools/courses/postgres-essentials/designs/22-26.md).
Use the [acceptance report](../../curriculum-tools/courses/postgres-essentials/validation/batch-six.md)
for exact-source results. These review findings matter for later restore/replication fixtures:

- A supplied controller must query its writer's values, not print a hard-coded label that agrees
  with the UPDATE it attempted. Check every expected row and use the exact backend PID when proving
  that a particular transaction remains open across a checkpoint.
- Bound client reads and server commands. Put ownership setup and partially successful startup
  inside cleanup scope; attempt shutdown and verify stopped status before removing a newly allocated
  root. Do not catch a stop error, delete the tree anyway and print successful cleanup. Close-client
  errors must not prevent server shutdown. Clear inherited PG connection/options variables so a
  private fixture cannot be redirected or have its experiment settings silently changed.
- Force later synchronous marker WAL after an unfinished update when demonstrating that logged
  unfinished work stays invisible after recovery. This establishes a flush boundary covering the
  unfinished change. Check that the baseline checkpoint did not move, parse WAL positions, require
  actual redo log lines, and separately compare the recovered inventory. Equal rows after a clean
  stop prove that row outcomes alone cannot identify the recovery path.
- Bracket full transaction workloads with insert LSNs to include COMMIT WAL; EXPLAIN WAL alone
  omits it. Hold individual statement shape fixed when changing transaction grouping, including the
  optional intermediate batch. Cluster-wide intervals and page images limit attribution on a busy
  learner server. An asynchronous commit may already be flushed when sampled; do not require a
  race-dependent gap or infer a power-loss result from a running-server LSN query.
- Shell lessons can own whole clusters rather than schemas. Render the correct cleanup record,
  extract their actual fenced shell variations, and hash imported helper dependencies as well as
  the short learner launcher. First-view commands must stay identical to the built lesson text.

The mechanism claims were checked against PostgreSQL 16's [resource settings](https://www.postgresql.org/docs/16/runtime-config-resource.html),
[WAL settings](https://www.postgresql.org/docs/16/runtime-config-wal.html),
[asynchronous commit](https://www.postgresql.org/docs/16/wal-async-commit.html),
[WAL configuration](https://www.postgresql.org/docs/16/wal-configuration.html),
[administration functions](https://www.postgresql.org/docs/16/functions-admin.html),
[pg_buffercache](https://www.postgresql.org/docs/16/pgbuffercache.html), and
[pg_ctl](https://www.postgresql.org/docs/16/app-pg-ctl.html). The experiments test a live or crashed
PostgreSQL process on one running host, not failed storage or power loss.

## Recovery and replication batch: native learner actions and exact boundaries

Lessons 27–31 follow [the seventh-batch design](../../curriculum-tools/courses/postgres-essentials/designs/27-31.md).
[Acceptance](../../curriculum-tools/courses/postgres-essentials/validation/batch-seven.md) records
the Go fixture and generic-CLI checks. New lessons use a short native learner task with a safe
incomplete starter and a labelled worked completion in the same output. An unchanged starter
intentionally reports its unmet requirement; author validation must test that failure and execute
the actual worked completion, not equate every nonzero starter exit with broken infrastructure.

- **psql -c transaction boundaries matter around restore points.** Multiple SQL statements in one
  `-c` string execute in one implicit transaction unless explicitly divided. A restore point placed
  between two INSERTs in that string can precede both commits. Use separate completed calls when
  the lesson claims a marker follows a committed operation; inspect recovered rows to verify it.
  The initial validation caught this by recovering only the baseline. See
  [psql command processing](https://www.postgresql.org/docs/16/app-psql.html).
- **A backup inventory needs values, not just counts.** The three-row fixture changes one quantity
  after the physical backup. Manifest verification and startup both pass; only a query including
  the changed field distinguishes the later source from the intended restored state. Compare to
  a known baseline, then separately assess source changes after the backup.
- **Classify archive lookup failures by recovery obligation.** A missing timeline-history probe
  or a lookahead segment can accompany successful target recovery. A missing start segment named
  by backup_label causes a required-checkpoint failure here. Repair only the disposable archive copy
  and preserve the original file hash. Never remove backup_label as an attempted fix for a real
  backup restoration. Full logs, a paused named target, and visible operations establish the repair.
- **Receipt and apply need separate observations.** Wait for confirmed pause before committing,
  then require receive LSN at least the post-commit marker, replay LSN below it, and a fresh query
  without the row. Resume and require both replay through the marker and visible data. The marker
  is a conservative position measured after commit, not the exact commit-record location.
- **Control process lifetime through failure as well as success.** The Go controller gives child
  commands their own process groups, cancels the group on interruption, and uses an uncancelled
  cleanup context. It verifies stopped servers before deleting files. Acceptance interrupts a
  fixture after both primary and standby are live and checks the emitted tree no longer exists.

Catalog adoption is separate from author validation. Follow AUTHORING.md: initialize only a
temporary `--db` while authoring and use `progress verify` for a copied refresh with all course
history checked. The shared learner catalog can later adopt these authored files through
`tutor postgres-essentials init`; no new completion or attempt is implied by that command.
