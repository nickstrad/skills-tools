# PostgreSQL pivot handoff

Updated 2026-09-05. **Chunks1–4 are accepted. Current62 PITR and timeline consolidation are
verified;93 active lessons remain. Next: chunk5 physical replication/change processing, then
chunks6–7 and the final audit. The full active goal is not complete.**

## Rewind and chosen-history rejoin accepted, 2026-09-05

Current76 rewind-the-old-primary is revision4. Fresh divergence acknowledges old-only ID1
(variation1–3) and chosen ID100. Before target rewrite, save complete independent receipt/client
inventories and timeline history, fence/stop old writer, then verify a compressed cold archive
against all982 regular-file hashes. Supported checksums/full-page/WAL-retention prerequisites are
checked. Dry run reports real divergence/common checkpoint and leaves target hashes unchanged;
actual -R executes repair. Correct copied endpoint/user/slot/timeline settings before startup.
Recovery=true, timeline2 streaming, actual25006 target write rejection and later receipt200
establish rejoin; exact final source/target IDs0,100,200 agree. Old acknowledgements remain
explicitly discarded and preserved, not business-reconciled. Control checkpoint timeline may still
be1 during streaming2.

Core/source/exact hint2 pass. Report validation/05-rewind-workload.md; roots /tmp/pg-owned-q8jhfat8,
/tmp/pg-owned-pb5xn_go and /tmp/pg-owned-9ecu9kjz are stopped with source slots removed. Raw logs
/tmp/pg-rewind-workload-{core,variation}.log and
/tmp/pg-rewind-workload-exact-rewind-the-old-primary.log. Thirty tests/full check pass. Scoped
builder /tmp/pg-rewind-workload-scoped-build.py changes only current76;93 lessons/seven stops, first
seven/capacity and copied IDs/history/progress are preserved. Fresh progress copy
/tmp/pg-observe-progress-wh7av505/progress.sqlite; learner hash unchanged. Prior promotion938a6fa is
pushed. No learner writes or agents; preserve unrelated storage source/guide/knowledge and bin/.

Next: current77 cascading-and-failback. Execute controlled failback on fresh owned topology with
closed writer admission, same-history/domain readiness, actual old-writer exclusion before
promotion, and complete acknowledged outcomes afterward. Cascading is optional depth only after
bounded actual extra-hop verification; cleanup stays required. Do not inherit a running topology or
operate on learner port5440. Then logical processing, chunks6–7 and final audit per design05. Full
goal remains active. About1.6GB was free after rewind fixtures; check before more retained clusters.
Final audit still includes current73 idle insertion-boundary findings.

## Promotion and controlled cutover accepted, 2026-09-05

Current75 promote-the-standby is revision4. Each full script runs two independent owned pairs.
Unsafe transport disconnect precedes an acknowledged source write; promotion leaves two writable
histories, old IDs0,1,2 and new IDs0,3, with complete independent receipt inventories. Controlled
cutover closes admission, changes old app role to NOLOGIN, verifies zero existing app sessions and
actual rejected login, requires known-history replay plus all source receipts, then stops the old
source and rejects endpoint access before promotion. Epoch2/new route accepts receipt2; epoch1
rejects without a DB attempt, and final inventory equals all three acknowledgements. Variation first
refuses an actually paused/stale candidate, then resumes into the same readiness/exclusion contract.
The driver epoch is not a distributed authority service; actual local role/process exclusion assumes
no uncontrolled supervisor restarts the old writer.

Core/source/exact hint2 pass. Report validation/05-failover-workload.md. Final core roots
/tmp/pg-owned-t2xtc3no and /tmp/pg-owned-zgfepid6; variation /tmp/pg-owned-b9qjbf23 and
/tmp/pg-owned-yhqkvigw; exact /tmp/pg-owned-g3ug_l0m and /tmp/pg-owned-6986vsaj. All stopped/slots
removed. Raw /tmp/pg-failover-workload-{core,variation}.log and
/tmp/pg-failover-workload-exact-promote-the-standby.log. Thirty tests/full check pass. Scoped
builder /tmp/pg-failover-workload-scoped-build.py changes only current75.93 lessons/seven stops,
first seven/capacity and copied IDs/history/progress preserved. Prior retention bd4d4b3 is pushed.
No learner writes or agents; preserve unrelated storage source/guide/knowledge and root bin/.

Next: current76 rewind-the-old-primary. Create fresh owned divergence, retain both complete
acknowledged-receipt inventories before modifying target files, explicitly choose the authoritative
history, fence/stop old writer and run actual pg_rewind with checksums/wal_log_hints prerequisites.
Verify rejoin/streaming/read-only behavior and classify any old-branch acknowledgements discarded by
that choice. Preserve target WAL needed for divergence scan; do not inherit a running topology from
this lesson. Then controlled failback (optional cascade depth), logical processing, chunks6–7 and
final audit per design05. Full goal remains active. Check disk before further retained pairs; all
lifecycle trials remain serial. Final audit includes the idle insertion-boundary finding from
current73 in durable replication knowledge.

## Physical slot retention and rebuild accepted, 2026-09-05

Current74 replication-slot-retains-wal is revision4. The actual owned consumer disconnects after a
baseline marker/receipt.32,000 later receipts leave the inactive restart anchor fixed and35 one-MB
segments retained despite an8MB target; status extended. Core reconnects, verifies all receipts and
advancing slot, then confirms a later streamed receipt and reclamation to8 segments. Variation's4MB
cap makes the oversized slot lost, removes its needed segment and causes an actual failed consumer
stream: postmaster startup succeeds but the receiver logs removed WAL and fresh rows remain only
ID0. Preserve the stopped failed copy, take a new verified full backup and prove post-backup receipt
streaming. Both paths finish32,002 correct rows/sum512,048,001, active/reserved slot, then cleanup.

Core/source/exact hint2 pass. Report validation/05-slot-retention.md; final roots
/tmp/pg-owned-e3c0q65i, /tmp/pg-owned-rtekv3mr and /tmp/pg-owned-yv1ysy9p are stopped/slots removed.
Raw /tmp/pg-slot-retention-{core,variation}.log and
/tmp/pg-slot-retention-exact-replication-slot-retains-wal.log. Thirty tests/full check pass. Scoped
builder /tmp/pg-slot-retention-scoped-build.py changes only current74.93 lessons/seven stops, first
seven/capacity and fresh copied IDs/history/progress preserved. Prior conflict3181613 is pushed. No
learner writes or agents; preserve unrelated storage source/guide/knowledge and root bin/.

Next: current75 promote-the-standby, following design05. Preserve a bounded deliberate split-brain
branch as actual failure evidence, then separately execute controlled failover: fence/stop the old
writer before promotion, inventory acknowledged receipts on both histories and exercise an authority
gate rejecting the old writer. Promotion alone must not imply election or fencing. Then actual
rewind/rejoin and controlled failback, logical processing, chunks6–7 and final audit. Full goal
stays active. Keep lifecycle runs serial, use fresh owned sockets/data and preserve the first seven
and learner state. Final audit also reviews the idle insertion-boundary finding from current73; see
durable replication knowledge. Available disk was a few GB before these fixtures; check capacity
before further retained topologies, preserving the accepted evidence.

## Standby conflicts and feedback accepted, 2026-09-05

Current73 hot-standby-query-conflict is revision4. Two seeded tables isolate feedback off/on. Actual
active old-snapshot reader gets40001 plus confl_snapshot+1 after off-policy DELETE/VACUUM. Feedback
protects the old reader while5,000/2,500 deleted versions remain physically retained; fresh
snapshots already see5,000/7,500 survivors. The old reader returns all10,000 rows again and commits
normally. Release plus feedback-off acknowledgement clears the actual horizon; new vacuum removes
all dead versions and increases reusable free space. Full source/copy membership passes.

Important corrected evidence: with the owned physical slot, primary sender backend_xmin stays NULL
while pg_replication_slots.xmin holds the reader's737 horizon. Requiring the sender field caused
failed prototypes; PostgreSQL16 source and runtime prove the slot is the retention owner. Design05
and docs/knowledge/postgres-replication-evidence.md record this. Also use explicit WAL record-end
markers for idle bootstrap/cleanup gates; an idle post-backup next-insertion location timed out.
Review generic idle-boundary assumptions during the final integration audit.

Core/source/exact hint2 pass; report validation/05-standby-conflicts.md. Final roots
/tmp/pg-owned-30hokd0p, /tmp/pg-owned-k1p51p6v and /tmp/pg-owned-6saz3w1h are stopped/slots removed.
Raw /tmp/pg-standby-conflicts-{core,variation}.log and
/tmp/pg-standby-conflicts-exact-hot-standby-query-conflict.log. Thirty tests/full check pass. Scoped
builder /tmp/pg-standby-conflicts-scoped-build.py changes only current73.93 lessons/seven stops,
first seven/capacity and copied IDs/history/progress preserved. Prior sync03db511 is pushed. No
learner writes or agents. Preserve unrelated storage source/guide/knowledge and root bin/.

Next: current74 replication-slot-retains-wal. Disconnect the actual owned consumer, generate bounded
WAL beyond a small private target, observe restart position/files and retention, then reconnect,
verify complete receipts and reclaim. Lost-history variation must actually classify slot
invalidation/reinitialization and rebuild the consumer rather than claim continuation is possible.
Then controlled failover/rewind/failback, logical processing, chunks6–7 and final audit per
design05. Full goal remains active; all owned topology lifecycle runs stay serial.

## Synchronous acknowledgement accepted, 2026-09-05

Current72 synchronous-replication-blocks-commit is revision4. Fresh owned source/standby and
per-transaction policies prove local/on complete during paused replay, while remote_apply waits in
actual IPC/SyncRep despite durable receipt. Active XID matches the locally flushed COMMIT record; a
fresh primary query still excludes that waiting row. Resume gives normal apply acknowledgement and
visible receipts. After actual standby shutdown, local completes and on waits without sender. Core
cancels the wait, requires WARNING/01000 plus COMMIT/exit0 and reconciles all primary receipts while
standby remains stopped. Variation reconnects instead, giving normal acknowledgement without
warning. Final replay/full values agree for five receipts; every client/server stops and slot drops.

Core/source/exact hint2 pass. Report validation/05-sync-acknowledgement.md; raw
/tmp/pg-sync-acknowledgement-{core,variation}.log and
/tmp/pg-sync-acknowledgement-exact-synchronous-replication-blocks-commit.log. Final roots
/tmp/pg-owned-4iu81ar9, /tmp/pg-owned-4mqp7h1h and /tmp/pg-owned-81v9f4kh retain stopped evidence.
Thirty tests/full check pass. Scoped builder /tmp/pg-sync-acknowledgement-scoped-build.py proves
only current72 changes;93 lessons/seven stops, first seven/capacity and copied IDs/history/progress
preserved. Prior readiness728e164 is pushed. No learner catalog/cluster writes or agents.

Next: current73 hot-standby-query-conflict. Use the unchanged owned-replication helper; cause an
actual snapshot recovery conflict/cancellation, then feedback on with observed primary backend_xmin,
retained old versions and surviving reader. Release reader/feedback, vacuum and verify reclamation
plus complete application agreement. Use bounded delays and real state gates; do not infer pinned
cleanup from configuration alone. Then retention/fenced failover/rewind/failback, logical
processing, chunks6–7 and final audit per design05. Full goal remains active. Preserve unrelated
storage source/guide/knowledge and root bin/; keep all owned topology lifecycles serial.

## Physical read-your-writes accepted, 2026-09-05

Stable read-your-writes-on-a-replica is now current71 in module09, revision4. It replaces the old
logical simulation in14 with a fresh owned physical standby: post-COMMIT token, pinned source
system/history/topology, actual paused replay plus flushed receipt WAL,500ms timeout with no data,
three mismatched-identity rejections before any LSN comparison, then a fresh matching profile and
receipt after resume. The source/exact variation explicitly reads from the pinned primary while the
standby remains paused and stale. Fixed topology is an assumption, not an authority service.

Core/source/exact rendered hint2 pass. Roots /tmp/pg-owned-sj6nx3xs, /tmp/pg-owned-67ks82gh and
/tmp/pg-owned-rw5s3j4x are stopped and slots removed. Report validation/05-replica-readiness.md; raw
/tmp/pg-replica-readiness-{core,variation}.log and
/tmp/pg-replica-readiness-exact-read-your-writes-on-a-replica.log. Thirty tests/full check pass.
Scoped builder /tmp/pg-replica-readiness-scoped-build.py normalizes moved ordinals/prerequisite
references and proves only this identity materially changed.93 lessons/seven stops, first seven,
capacity and fresh copied IDs/history/progress remain intact; no learner writes. PLAN, identity map
and canonical reading-map note reflect the move. Prior replay acceptance a5b7681 is pushed.

Next: current72 synchronous-replication-blocks-commit. Follow design05 sequentially: actual paused
replay allows remote flush but blocks remote_apply; disconnected required standby blocks synchronous
acknowledgement. Observe SyncRep waits and reconcile durable receipts after cancellation or
reconnection. Then standby conflicts/feedback, slot retention, controlled failover/rewind/failback,
logical processing and chunks6–7/final audit. Full goal remains active. Preserve unrelated storage
source/guide/knowledge and root bin/; no learner catalog/cluster operations.

## Paused replication replay accepted, 2026-09-05

Current70 replication-lag-under-load is accepted at revision4. Actual paused state/fixed replay
position precede2,000/4,000 committed receipts. Local flushed receive and acknowledged primary flush
advance while standby rows stay at original row0. Source has2,001/4,001 correct rows; resume plus
replay-bound and full data checks match both sides. Source feedback time-lag fields remain honest
nonzero samples rather than a readiness test. Core/source/exact-hint passed; all owned servers
stopped and slots removed. Report validation/05-replay-lag.md; core /tmp/pg-owned-e4_g2fpj,
variation /tmp/pg-owned-x7oa2uxc, raw /tmp/pg-replay-lag-{core,variation}.log and
/tmp/pg-replay-lag-exact-replication-lag-under-load.log.

Thirty tests/full check pass; scoped build changes only current70.93 lessons/seven stops, first
seven/capacity and fresh copied IDs/history/progress preserved. Standby fc580c7 is pushed. Next
implement read-your-writes-on-a-replica from14-patterns as an owned physical standby gate:
post-COMMIT bound, known source system/history, actual paused timeout without serving stale data,
resume/catch-up success, independent receipt, wrong-history rejection. Move its stable identity
immediately after replication-lag-under-load only after core/exact variation pass; no retirement
needed for this move. Update all ordinal references/mappings and copied progress checks. Then
synchronous acknowledgement and the rest of design05. Chunks5–7 remain unfinished. Preserve
unrelated storage source/guide/knowledge and root bin/; no learner catalog/cluster writes.

## Physical standby accepted, 2026-09-05

Current69 build-a-streaming-standby is accepted at revision4. New owned-replication.ts layers on the
unchanged owned-cluster helper; actual verified basebackup, dedicated role, physical slot,
sender/receiver endpoints, source/copy identity/roles and post-backup receipt replay all pass.
Standby write actually rejects25006 and preserves data. Source/exact variations SIGTERM the owned
receiver, observe its replacement PID/fresh streaming log, and verify a later receipt. Cleanup stops
standby, drops the inactive owned slot and stops source. All owned servers stopped.

Report validation/05-standby.md; final core /tmp/pg-owned-8qmu8egk, variation
/tmp/pg-owned-sqblgse6; raw /tmp/pg-standby-{core,variation}.log and
/tmp/pg-standby-exact-build-a-streaming-standby.log. Thirty tests/full check pass; scoped build
changes only this identity;93 lessons/seven stops, first seven/capacity and copied
IDs/history/progress preserved. PITR655baa1 is pushed. No agents.

Chunk5 contract is designs/05-replication-change-processing.md. Next: current70
replication-lag-under-load, then move read-your-writes-on-a-replica from14-patterns into this
physical sequence once its bounded same-history replay/domain gate passes. Keep all core/variation
lifecycle runs serial. Preserve unrelated storage source/guide/knowledge and root bin/. Chunks5–7
remain unfinished; never treat replication alone as authority/election/fencing.

## PITR and timeline consolidation accepted, 2026-09-05

Primary accepted pitr-workload.ts and guide08. Actual backup plus archived original history supports
both named targets before/after destructive commit. Core and source/exact reversed-order runs each
keep both branches and source available for comparison:20 jobs/10 receipts/amount55 before, 15
jobs/5 receipts/amount40 after; source alone retains job999. Complete values, distinct markers,
source system identity, parent1 history rows, record-end fork LSNs and branch WAL hashes pass.
Timeline2/3 allocation reverses with restore order; it is not a freshness/fencing guarantee. All
servers stopped. Report validation/04-pitr.md; source core /tmp/pg-owned-wp_nnpgm, variation
/tmp/pg-owned-d_0tl_r1; raw /tmp/pg-pitr-{core,variation}.log and
/tmp/pg-pitr-exact-point-in-time-recovery.log. No agents were spawned.

Retired timeline-history only after its replacement coverage ran. Promotion/postmortem prerequisites
now reference PITR. Scoped93-lesson build normalizes ordinal/prerequisite changes and proves other
surviving fields unchanged. Seven stops, first seven/capacity and copied IDs/history/progress remain
intact; retired identity inactive. Thirty tests/full check pass. Builders
/tmp/pg-pitr-scoped-build.py, /tmp/pg-pitr-progress.py and updated /tmp/refresh-pg-map.py
understand93 lessons; use these for the next copied-progress check. Canonical reading map and
PLAN/REWORK status updated.

Next: design and implement chunk5 sequentially, starting build-a-streaming-standby in09-replication.
Create owned source/standby topology and actual receive/replay/domain evidence; do not use
learner5440 or depend on the old shared backup/PGLAB layout. Then bounded replay/read-your-writes,
synchronous acknowledgement, conflict/feedback, slot retention, fenced promotion/rewind; logical
snapshot/tail and conflict reconciliation follow. Existing read-your-writes-on-a-replica
in14-patterns must move/consolidate only after physical readiness replacement passes. Preserve
unrelated storage source/guide/knowledge and root bin/. No learner catalog refresh. Backup
acceptance564dd7e is pushed.

## Backup/restore accepted, 2026-09-05

Current 61 base-backup is accepted at revision 4. Core/source/exact-hint runs create real streamed
backups, verify their manifests/WAL, stop the changed source and independently restore 2,000 jobs
and receipts with all values/relationships/constraint probes correct. Removing the required start
segment from a separate copy produces an actual bounded required-checkpoint startup failure.
Source/exact variations retrieve that byte-verified segment through a private archive and recover
the same data. Read-only readiness is not completion; an explicit pg_is_in_recovery=false poll now
precedes write probes. Pristine backups verify again. All owned servers stopped.

Report validation/04-backup-restore.md; final core /tmp/pg-backup-core.log and
/tmp/pg-owned-3bvqeum4; source variation /tmp/pg-backup-variation.log and /tmp/pg-owned-z8l8itbu;
exact /tmp/pg-backup-exact-base-backup.log. Drivers /tmp/pg-backup-validate.ts,
/tmp/pg-backup-exact.ts; scoped builder /tmp/pg-backup-scoped-build.py. Thirty tests/full check
pass; scoped artifact changes only current 61, with94 lessons/seven stops, first seven/capacity and
fresh copied IDs/history/progress preserved. No learner catalog refresh or lab writes.

This resume sequentially accepted checkpoint anatomy b2e90f5, matched recovery0570466 and WAL
pressure f0f9a30, all pushed. Preserve unrelated storage source/guide/knowledge and root bin/. No
agents were spawned; primary owns implementation and all validation. Next: implement current62
point-in-time-recovery from design04 using an actual backup, named target before destructive commit,
archived required history, full domain assertions and actual branch/history evidence. Run
later-target variation too; only then retire current63 timeline-history and update
prerequisites/maps/progress-copy checks for93 active lessons. Preserve both branch histories for
inspection and never compare bare LSNs from divergent histories as authority tokens. Chunks4–7
remain active, not complete.

## WAL-pressure checkpoints accepted, 2026-09-05

Current 60 max-wal-size-forces-checkpoints is accepted at revision 4. Core/source/exact-hint
comparisons each use two fresh owned clusters, equal receipt values and8MB/128MB targets. Core 32
batches: one versus zero WAL checkpoints; source64 batches: three versus zero. Actual settings,
sourcefiles, fixed epochs, fresh reason/completion logs, sampled9MB soft-target peak and final
receipt assertions pass. Each override is removed,128MB file source verified and server stopped.
Report validation/04-wal-pressure.md and /tmp/pg-wal-pressure-{core,variation}.log; exact
/tmp/pg-wal-pressure-exact-max-wal-size-forces-checkpoints.log.

Thirty tests/full check pass. Scoped artifact changes only current60;94 lessons/seven stops, first
seven/capacity and copied IDs/history/progress remain intact. Core book excerpts preserved; study
rationale no longer uses obsolete ordinals. Checkpoint anatomy b2e90f5 and matched recovery 0570466
are pushed. Next is current61 base-backup: create/verify/independently restore, assert complete
domain state, and require actual bounded missing-WAL recovery failure. Then current62 PITR and only
afterward consolidate timeline-history. Chunks4–7 remain active; no learner writes.

## Recovery cost accepted, 2026-09-05

Current 59 redo-point-bounds-recovery is accepted at revision 4. Four fresh owned clusters per
core/source/exact-hint run compare identical receipts and reversed checkpoint-pair order. All twelve
actual crashes preserve 20,001/40,001 receipts and correct individual values/totals. Old redo ranges
contain the bulk; recent ranges do not; both contain the common committed tail. Stopped control,
offline last record, fresh replay log and separate readiness/domain timings all match. Report
validation/04-recovery-cost.md and /tmp/pg-recovery-cost-{core,variation}.log; exact output
/tmp/pg-recovery-cost-exact-redo-point-bounds-recovery.log. All private clusters stopped.

Thirty tests/full check pass; scoped build changes only current 59 and fresh copied progress,
IDs/history, first seven/capacity, 94 lessons/seven stops remain intact. Checkpoint anatomy is
pushed as b2e90f5. Next is current 60 max-wal-size-forces-checkpoints, then actual backup/restore,
missing-WAL failure and PITR. The entire remaining refactor remains active.

## Checkpoint anatomy accepted, 2026-09-05

Primary resumed and accepted current 58 checkpoint-anatomy at revision 4. The core and source
variation run in newly owned PostgreSQL 16 clusters; exact copied-catalog hint2 also ran. Both
one/two-round fixtures retain 223 resident heap buffers after cleaning them; 2,000/4,000 HOT
updates, correct 2,000 receipts and amounts 2,000/4,000, checkpoint counter delta 246, new
control/record position and actual page/file convergence. First failed trial exposed post-commit
hint WAL; a separate marker commit fixes the flush observation boundary. Report
validation/04-checkpoint-anatomy.md; raw /tmp/pg-checkpoint-{core,variation}.log and
/tmp/pg-checkpoint-exact-checkpoint-anatomy.log. All owned clusters stopped.

Thirty tests and full repository check pass. Scoped build changes only current 58; 94 lessons, seven
reading stops, first seven/capacity and fresh copied IDs/history/progress preserved. Next is current
59 redo-point-bounds-recovery: matched actual crash/replay and readiness costs, then WAL pressure,
real backup/restore/missing-history/PITR. Chunks 4–7 remain active. Preserve unrelated storage
source/guide/knowledge and root bin/. No learner catalog refresh.

## Previous user-requested context reset (historical)

The user chose this verified stopping point on2026-09-05. Resume from current58 checkpoint-anatomy
in08-checkpoints.ts using designs/04-durability-recovery.md. Do not redo the accepted WAL module or
start new work before the user resumes. All reviewer agents are completed; all primary validation
commands finished. Primary implementation and handoff are pushed; remaining uncommitted storage
source/guide/knowledge and root bin/ belong to other work. Preserve those changes.

## Active goal

User authorized finishing all remaining items linearly. The goal is active; do not stop after a
single accepted subsection or mark the entire task complete until chunks4–7 and the final audit are
verified. Primary is implementing design04-durability-recovery.md. WAL records/images/commit cost,
archive failure, actual crash/replay and matched write amplification are accepted;
checkpoint/restore work comes next.

At this goal's start, guides/02-storage.ts had an existing uncommitted change and root bin/ was
untracked. Preserve both. The latest authoritative implementation commit was5fcf82f; documentation
checkpoint c9dca16 followed it. Learner progress can advance independently; use a fresh copy.

## WAL module checkpoint

Accepted and pushed: **ab6eb7a** amplification, **7f66e01** crash/replay, **be2bc76** archive. All
three accepted subsections and their handoff updates are on origin/main.

Primary accepted wal-amplification.ts and guide07. Four matched200-row ingestion trials verified
heap/commit records and exact values. Primary caught unequal catalog hint-image overhead and
separated owned-heap bytes (20800 INSERT versus11845 COPY) from decision and whole-interval costs.
Matched amount update:200 HOT/plain versus0 HOT/indexed, same final values; index build valid/ready.
Source and exact CLI guards preserve all200 values with zero tuple work versus200 unconditional HOT
updates. Report validation/04-amplification.md; final core /tmp/pg-owned-4573r03w, variation
tpq4t7lj, exact g3_ms5wq; raw /tmp/pg-amplification-{core,variation}.log and
/tmp/pg-amplification-exact-wal-size-of-operations.log. All owned clusters stopped.

Thirty tests/full repo check pass; scoped build changes only current57,94 lessons/seven stops,
first7 and capacity unchanged, copied IDs/history/progress preserved. Terra/high only reviewed final
code read-only; primary owns runtime and wording acceptance.7f66e01 is the pushed prior crash/replay
subsection; be2bc76 is archive. WAL module07 is now fully accepted.

Next: implement08-checkpoints from design04, sequentially. Current58 checkpoint-anatomy,59 redo-
point-bounds-recovery,60 max-wal-size-forces-checkpoints,61 base-backup,62 point-in-time-recovery,
63 timeline-history. Reuse owned-cluster.ts by embedding its full helper in runnable shell lessons;
never crash learner5440. Require actual matched recovery trials, actual backup/restore and missing-
WAL failure, actual PITR branches before retiring timeline-history. Then chunks5–7. Active goal is
not complete. No pending primary edits or active validation processes at this checkpoint.

## Crash/replay checkpoint

Primary accepted crash-workload.ts and guide07. Actual owned crash keeps the second client open
until server shutdown. Core has two flushed INSERTs, one COMMIT, two physical tuple headers and one
visible receipt/amount10. Source and final copied-catalog CLI variations commit the second
transaction and verify two receipts/amount30. Stopped control file, offline pg_waldump, fresh redo
log and independent row assertions all reviewed; every private server stopped. Report
validation/04-crash.md. Raw logs /tmp/pg-crash-{core,variation}.log and
/tmp/pg-crash-exact-crash-and-redo.log; final exact evidence /tmp/pg-owned-m2pjno40. Terra/high
read-only review found no concrete defects.

Duplicate wal-replay-is-deterministic retired only after combined behavior passed.94 lessons, seven
stops, first7 unchanged; all other content/prerequisite identities preserved after normalizing
renumbered references. Copied catalog preserves IDs/history/progress and marks retired slug
inactive. Thirty tests and full repo check pass. Plan, identity map, book map and knowledge updated.
Builders /tmp/pg-crash-scoped-build.py and /tmp/pg-crash-progress.py understand94 lessons and
prerequisite renumbering; use these rather than the old95-lesson progress assertions. No generated
JSON hand edits. be2bc76 is the pushed prior archive subsection. Next: wal-size-of-operations
(current57), then all six checkpoint/restore lessons (current58–63) with timeline consolidation only
after actual PITR. Chunks5–7 remain active future work; do not mark the overall goal complete.

## Archive checkpoint

Primary accepted archive-workload.ts, reusable owned-cluster.ts, module07 replacement and guide07.
Core12 segments retained13MB despite8MB target; source20 and exact CLI20 variations retained21MB.
Every selected archived hash matched after repair, ready markers disappeared, old names became
reclaimable after checkpoint; final receipts13/130 or21/210. Private servers stopped; no learner
cluster changes. Report validation/04-archive.md; raw /tmp/pg-archive-{core,variation}.log and
/tmp/pg-archive-exact-wal-files-and-recycling.log. One Terra/high read-only reviewer found no
blocking issues; primary adopted precise wording and verified all runtime outputs. Thirty tests and
full repo check pass; scoped build changes only current55, first7/capacity and copied history
preserved. 6c181bd is the pushed prior commit-cost subsection. Next: actual crash plus WAL decoding
and row assertions, then retire duplicate replay lesson only after replacement coverage passes.

## Commit-cost checkpoint

Primary accepted commit-workload.ts, its replacement in07-wal and exact guide07. Core and batch5
variation have eight trials each; final exact CLI hint adds eight more. All24 final trials preserve
400 increments and correct per-client shares with zero pgbench-reported failures (9600 increments).
A Terra/high agent only reviewed the finished driver; primary added its failed-count precision
suggestion, reran and reviewed every result. Optional owned-file pg_test_fsync probe ran too. Report
validation/04-commit-cost.md; core/raw dirs /tmp/pg-commit-cost-jfgandx7 and dmy8zbbt; exact hint
elg81_oi. Drivers /tmp/pg-commit-evidence.ts/.sh and /tmp/pg-commit-exact.ts/.sh. All30 tests/full
repo checks pass;95 lessons/seven stops, first7/capacity unchanged, current copied history
preserved.54e9ff3 is the pushed prior records/images subsection.

Concurrent storage work now modifies curriculum/02-storage.ts, guides/02-storage.ts and repository
docs/knowledge/postgres-experiment-evidence.md. Leave those edits unstaged. Published 54e9ff3's
artifact already includes concurrent TOAST revision5 while its source edit is not yet committed;
building only HEAD source would revert it. /tmp/pg-commit-scoped-build.py copies the matching
current storage source into its isolated snapshot and asserts the newly generated artifact differs
only at commit-means-fsync. It does not hand-edit JSON. Final integration must recheck the storage
owner's source/artifact reconciliation and not mistake it for our acceptance.

The archive and crash directions from this earlier checkpoint are now accepted above. Continue with
matched write amplification and checkpoint/restore/PITR work. No port5440 crashes, no learner
progress writes, no other agent authoring assignments.

## Latest implementation checkpoint

Primary accepted wal-records.ts and wal-page-images.ts, replacing the first two objects in07-wal;
guides07 and registry provide exact predictions/evidence/variations. Both cores and variations ran,
then both exact CLI-rendered hints ran. Record core shows committed/aborted physical work and
independent row outcomes; read-side hint scan emits23 FPI_FOR_HINT blocks. Image core5764/0/5768
bytes; pglz555/0/569, same100 rows/three increments, protection retained. No SQL errors. Report:
validation/04-wal-records-images.md. Design: designs/04-durability-recovery.md. Durable notes:
docs/knowledge/postgres-wal-recovery-evidence.md.95-lesson build, first7/capacity unchanged,7
reading stops, current copied progress preserved, all30 tests and full repo checks pass.

Raw drivers/logs: /tmp/pg-wal-evidence.ts/.sh,
/tmp/pg-wal-{records,page-images}-{core,variation}.log; /tmp/pg-wal-exact.ts/.sh and
/tmp/pg-wal-exact-SLUG.log. Current progress hash at verification:
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6; do not assume it stays fixed. The
next primary-owned subsection is commit-means-fsync: repeated bounded pgbench trials with fixed
generator settings, per-client rows, synchronous_commit on/off,1/4 clients, exact committed
counter/log agreement, latency percentiles and qualified cluster WAL-sync deltas. Preserve distinct
raw storage-flush measurement only as bounded optional depth on an owned file. Never overwrite
learner PG connection variables with hard-coded port5440 settings.

## Restart checkpoint

The user resumed from context-reset checkpoint a288b21 and requested sequential observability work.
Primary designed and implemented all five remaining lessons, authored specific guides and exact
runnable hints, executed every core and CLI-rendered variation, and completed integration checks.
See designs/03-observability.md and validation/03-observability.md. No agents were spawned. The
accepted capacity lesson and original first7 built objects remain identical.

Estimated remaining effort is roughly **45–50%**, not a lesson-count calculation: the hardest
recovery and distributed-protocol work is still ahead. Chunks4–7 remain pending. Do not restart
parallel authoring or re-review accepted sections without a concrete concern.

For a small-context restart: read this file, REWORK-PLAN, relevant durability sources07/08 and the
existing project review. Design the recovery chunk before editing. The only unrelated work-tree
entry at this section's start was untracked root bin/; leave it alone. SQLite and Linux remain
outside this task.

The user completed lesson8 at revision2 while the refactor proceeded. Full-path pgcoach and pgtutor
aliases were added to /root/.bashrc at their request. pgcoach reads lesson content from the tutor
catalog; generated lessons.json updates need an explicit pgtutor init to refresh an existing
catalog. Author checks used a copied catalog and did not refresh the learner's database. Completion
remains explicit (pgtutor done NUMBER). Do not assume progress stays frozen at seven completions on
future turns: compare current before/after snapshots and preserve legitimate learner progress.

Final validation repeated the copied refresh after the learner's new completion. It preserved every
current progress/attempt row and original lesson ID. Current learner database hash at that check:
167c9c50091f4b3bb6988b71652e382dd0b02d4f7536d6509f7ad088d2695045. The live catalog still had96
original active lessons and lesson8 revision2; author tools did not refresh it. The learner was told
to run pgtutor init to load revisions; changed lessons can then be offered again while earlier
completion records and notes remain. Implementation5fcf82f and handoff checkpoint2eed93e are pushed.

## User authorization and intended result

The learner completed original lessons 1–7. They approved the systems-engineering review and the
guided read/predict/run/inspect/explain/vary/apply loop, with supplied commands and gradually
reduced scaffolding. They requested plans, implementation, final code/wording review, and
commit/push for each chunk. Their latest instruction, “stop and pivot to that approach,” supersedes
the earlier Terra implementation assignments: primary now implements one section at a time. Agents
are limited to narrowly scoped verification of supplied commands or finished changes. All three
agents have finished their prior tasks; no parallel authoring remains active.

Read `REWORK-PLAN.md`, then the active contracts in `designs/`, and the prior review at
`../../../docs/knowledge/postgres-project1-review.md` (repository `docs/knowledge/`). Read repo
AGENTS, docs/README, AUTHORING and curriculum-author skill. Do not reinterpret this as a request for
another review or stop after planning: implementation and validation are authorized.

## Current state

- Chunk1 is pushed as948f2d1. Protocol helpers were pushed as1d3c378.
- Chunk2 is committed and pushed as d0ce060. Source05/06, helper checkpoint, new request-protocol.ts
  and optimistic-protocol.ts, removal of old optimistic object from14, guides05/06+registry,
  generated94-lesson artifact and identity map are the accepted change. See
  validation/02-integration.md for primary evidence and exact limitations. Original first7 objects
  and learner progress hash remain unchanged; copied refresh preserves all old IDs/history.
- Whole concurrency sequence selected17 lessons:16 actual psql experiments plus shell retry skipped
  by that harness. Retry was separately executed.30 engine/coaching tests pass. Unknown-outcome,
  both deadlock victim paths, optimistic rollback, bounded DDL, timeout and advisory session-loss
  variations were exercised by primary. Exact rendered request hint ran too.
- Unknown response is explicitly an output-withholding fixture, not a network-disconnect test.
  Receipts/payload/result and debit commit together. Real independent external effect/receiver
  commits and replication-history loss are still later protocol work.
- Primary accepted planner source11, authored specific guides11, registered them and built94
  lessons. Every core and exact hint executed. See validation/03-planner.md, primary
  acceptance2026-09-05. Root source is now authoritative; the old /tmp/pg-pivot-planner-work is
  historical only. Logs: /tmp/pg-planner-primary-20260905.log and
  /tmp/pg-planner-exact-20260905/*.log. Core fixes: restored settings, explicit hash multiplier,
  tenant fixture in setup, accurate model/ buffer/rollback claims, top-level scoped aggregate deltas
  and retention check. Hint fixes include fixed inner-lookup shape for Memoize comparison (5,000
  cached vs100,000 uncached probes). All30 tests pass, first7 objects unchanged, copied
  progress/IDs/history preserved,7 reading stops.
- Primary accepted index source12, six authored guides, registry and module reorder. Root source is
  authoritative; old /tmp/pg-pivot-visibility-work is historical, not a pending assignment. See
  validation/03-indexes.md primary acceptance2026-09-05. All six cores and exact hints ran; exactly
  two deliberate uniqueness errors in each set, no other errors/timeouts. Cached progress snapshots
  required pg_stat_clear_snapshot inside the CIC polling block; final sequence rerun passed. Matched
  HOT trial: amount updates100HOT/plain vs0HOT/covered; unindexed-note hint100HOT/both. RR
  pagination hint now executed:6/6 inside RR, fresh OFFSET5 after commit, fixture row removed. Logs:
  /tmp/pg-index-primary-20260905.log, /tmp/pg-index-cic-final-20260905.log and
  /tmp/pg-index-hints-20260905.log. Driver: /tmp/pg-index-hints.ts.
- Planner and indexes now follow locking, before WAL/replication.94 lessons,7 reading stops, four
  retired slugs; current lesson-map regenerated. Original first7 built objects and real progress
  unchanged; copied refresh preserves IDs/history/progress.30 existing integration tests pass.
- Primary implemented capacity-workload.ts, replacing the old connection-saturation object in13.
  Authored guides13's capacity entry and registered it. Core5ms and exact1ms hint both executed
  eight 400-transaction trials with zero failures and exact committed-counter/log agreement. Fixed
  driver threads at1 after finding the initial min(2,clients) changed another variable.
  Validation/03-capacity.md records measurements and limits. Raw dirs /tmp/pg-capacity-ebeu3oeq and
  /tmp/pg-capacity-9bhs5l9e. Extracted scripts/logs /tmp/pg-capacity-core-20260905.* and
  /tmp/pg-capacity-variation-20260905.*.
- Observability now follows checkpoints and precedes replication; backward prerequisites pass. Its
  five remaining lessons are now accepted as well; see the current observability acceptance below.
- Primary added migration-workload.ts after concurrent index creation, plus its exact retention
  guide in guides12.95-lesson build, current map refreshed, seven reading stops, first7 unchanged.
  Core direct run: 55P03/22P02/23514 were the only errors; B saw999 committed backfill rows while1
  remained locked. Final1001 rows/sum2002/consistent=true, both schema flags true. Exact retention
  variation completed with800 rows starting201 after reconciling the skipped eligible row. Logs:
  /tmp/pg-migration-core-20260905.log and /tmp/pg-retention-hint-20260905.log; driver:
  /tmp/pg-retention-hint.ts. Acceptance in validation/03-migration.md.
- Primary accepted all remaining observability work: wait-observation.ts, io-observation.ts,
  deadline-observation.ts, index-usage-observation.ts, log-observation.ts, module13 and guides13.
  Current ordinals65/66/68/69/70 are revision4; capacity67 is unchanged. Every core and exact
  CLI-rendered hint ran with correct outcomes. Full repo check passes. Report:
  validation/03-observability.md. Thirty tests pass;95 lessons/seven reading stops; first7 and
  capacity identical; copied IDs/history/progress preserved. Durable findings:
  docs/knowledge/postgres-observability-evidence.md.
- Primary owns remaining chunks4–7. Next is durability/recovery; no new authoring assignments.
- Private PostgreSQL16.15: /tmp/postgres-pivot-20260904/primary, socket in sibling/socket, port5540,
  rolepostgres. DBs pivot_primary(primary),pivot_storage(planner),pivot_visibility(index). Do not
  touch learner port5440. Coordinate global changes/restarts and timed benchmarks.
- Original progress SHA256: c7866ba1b78cb7b2aa6c1a2951149cd14c278130f92333c1e5b8dffd063f128f.
- Baseline object hashes: validation/completed-baseline.json. Original artifact:
  /tmp/postgres-pivot-original-lessons.json; original curriculum also survives in git history.
- Primary scratch helpers: /tmp/refresh-pg-map.py and /tmp/check-pg-progress.py; request and
  variation drivers /tmp/validate-pg-request.ts, /tmp/validate-pg-concurrency-variations.ts,
  /tmp/validate-pg-exact-hint.ts. Raw log names are in validation/02-integration.md.
- Unrelated Linux, article notes, repository-roadmap and Docker edits belong to other workstreams.
  Never blanket stage or reset them. The user explicitly excluded SQLite work as well.

## Next actions

1. Design and implement chunk4, durability/recovery (original39–51; current52–64) from REWORK-PLAN.
   Strengthen measured WAL costs, crash/recovery evidence within the same exercise, actual restore
   with domain assertions, missing-history failure and bounded checkpoint work. Restart/crash runs
   are serial in owned private clusters. Never touch learner port5440.
2. Continue chunks5–7: replication/change processing, durable delivery/fencing/2PC, then incidents
   and final integration. None is accepted. Snapshot/tail handoff, read-your-writes readiness,
   receiver commit/lost acknowledgement and enforced fencing remain the hardest work.
3. Keep real-tool evidence, exact-hint runs, current progress-copy checks, durable knowledge and
   commit/push checkpoints. Update final PLAN, mappings and wrapper/book references at final
   integration; delete handoff only after the entire authorized refactor is finished.

## Latest section: accepted observability

Design and evidence: designs/03-observability.md and validation/03-observability.md. Wait core has
10 registered blocker edges; variation holder sleeps while still blocking the writer; final
balance1000. I/O core71MB heap,18,182 bulkread hits and zero bulkread reads in the initial run;
small variation uses normal context. Answers/epochs pass. Deadline verifies actual disappearance,
lock cleanup, rollback and new connection; statement timeout keeps its PID, with row99 absent after
explicit rollback but present with autocommit. Index has2seq/20000rows/2PK scans; zero-use unique
index rejects23505. Optional-index variation preserves100rows/sum495700 and rolls back its drop.
Both log runs record UPDATE completion, but independent reads reflect COMMIT versus ROLLBACK.

Scratch drivers: /tmp/pg-observe-validate.ts, /tmp/pg-observe-run.sh, /tmp/pg-observe-exact.ts and
/tmp/pg-observe-exact.sh. Exact rendered hints and logs use /tmp/pg-observe-rendered-SLUG.md and
/tmp/pg-observe-exact-SLUG.log. Individual logs use /tmp/pg-observe-UNIT-{core,variation}.log, where
UNIT is the helper filename without .ts. Copied progress verifier /tmp/pg-observe-progress.py
records its copy path in /tmp/pg-observe-progress-path. Repo check: /tmp/pg-observe-repo-check.log.

Important findings: NULL passed to psql gset unsets its variable; coalesce nullable reset timestamps
before saving them. Published statistics and cleared observer caches are separate boundaries. The
SQL harness neither classifies expected errors nor executes shell code. The deadline shell ran
separately. Log reader guards reject invalid intervals rather than reconstructing rotated history.
Preserve these limits in future edits.

## Durable constraints

Preserve original lessons 1–7 exactly. Keep course revision 2, explicit revision 4 for material
edits (some existing checkpoint lessons already use3). Keep surviving slugs, map retirements and
ordinals. Do not edit learner progress. No blanket git add, reset, stash, force-push, or changes to
other agents' files. Do not crash the learner's port-5440 lab. Use an owned private cluster and
separate databases; coordinate global operations serially.

## Commits and evidence

- `4406657` pushed: initial plan, review, handoff and completed-seven baseline.
- `6d2fe8a` pushed: exact chunk1 contracts, guide interfaces and lab/agent ownership.
- `90e82d4` pushed: user-requested repo-wide project scale and progressive ownership alignment.
  Updated learning_path, AUTHORING, curriculum-author skill and wrapper template; recorded reusable
  findings in docs/knowledge/progressive-course-design.md and index. Skill validator and scoped
  format/diff checks passed. Installed author skill is a symlink to the edited repository source.
- `17df58c` pushed: previous handoff checkpoint. No learner progress mutation.
- `d4dfd08` pushed: concurrent-client design and implementation checkpoint.
- Foundation acceptance is in validation/01-integration.md; later protocol prototypes are not final
  course acceptance. Overall refactor remains incomplete: chunks3–7 require implementation,
  integration and validation. Repo-wide learning guidance is already pushed.

- `948f2d1` pushed: accepted guided foundation,93-lesson build, stable identity map, final runtime
  evidence, copied-progress preservation and durable experiment findings.

- `d0ce060` pushed: accepted concurrent clients, request-outcome recovery, 94-lesson build and
  chunk3 design. The earlier estimate at that checkpoint was roughly30% complete; the current
  estimate is recorded at the top of this handoff. Hard recovery, replication, durable protocols and
  final integration remain.

- `644138f` pushed: concurrency delivery and performance-review checkpoint.
- Latest workflow change: sequential primary implementation, bounded agent verification only.
  Updated REWORK-PLAN, design03 and durable progressive-course-design notes with this handoff.

- `3bf2541` pushed: sequential primary implementation policy and superseding design/handoff notes.
- Planner acceptance2026-09-05 is a section of chunk3; chunk3 remains incomplete. Continue directly
  to index primary review after the scoped planner commit/push.

- `ba91880` pushed: primary planner acceptance, seven specific guides and durable measurement notes.
- Index acceptance2026-09-05 follows sequentially. Next primary-owned hard work is bounded capacity
  measurement; do not restart parallel lesson authoring or re-review obsolete private drafts.

- `05070cc` pushed: primary index acceptance, six exact guides, matched HOT trials, RR pagination
  and planner/index ordering before WAL/replication.
- Capacity acceptance2026-09-05: zero errors in6,400 benchmark transactions across core/variation,
  scoped evidence retained, owned schemas cleaned,94-lesson build and copied progress checks pass.

- `e811115` pushed: bounded capacity driver, verified core/exact variation, scoped evidence and
  observability ordering before replication.95 lessons now include bounded migration as well.
- `673f332` pushed: bounded migration and exact retention variation accepted,95-lesson build, 30
  tests passing, first7 unchanged and copied progress/IDs/history preserved. Continue with the five
  remaining observability lessons after the requested context reset.

- Observability acceptance2026-09-05 completes chunk3. All five remaining cores and exact rendered
  hints ran against the private lab; full repository checks and30 integration tests pass. Next
  implementation is chunk4 durability/recovery.

- `5fcf82f` pushed: accepted observability helpers/guides, full repo checks, real core/exact-hint
  evidence, updated knowledge notes, plan and handoff. This follow-up checkpoint records the new
  learner completion and repeat copied-progress preservation check; it changes no lesson code.
