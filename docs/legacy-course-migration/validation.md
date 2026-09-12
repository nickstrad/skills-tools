# Legacy course migration acceptance

Implementation is in progress. This report records accepted checks; `plan.md` owns remaining work.
Baseline source: `2776655274115a95ebabf7dd1b62fd9e9d0ff818` (2026-09-12).
The [250-row ledger](lesson-audit.tsv) distinguishes reviewed lessons from pending ones.

## Complete250-lesson content acceptance

All250 ledger rows are primary accepted. SQLite45–51/53 complete the final eight: direct failure,
snapshot, FTS repair and pre-ACK replay comparisons;53 states invariants without a writing stage.
Every Setup/Run byte, existing block, metadata field and revision in this group matches baseline.
All eight actual plain/ANSI/JSON views pass. Final contextual search changed only PostgreSQL17/18/33
syntax terminology; those three complete views and parity checks also pass. Remaining search hits
are actual SQL submission, physical/invalidation hints, controller inspect/apply operations or
ordinary observation language, not learner coaching stages.

All five source checks pass:92/54/72/26/6 authored lessons. Canonical discovery lists exactly seven
entries with total routes40/32/44 where planned. Evidence uses `.cache/legacy-migration/sqlite-final-8*`
and `postgres-final-terminology*`; temporary catalogs are removed. Existing runtime evidence covers
unchanged cores. Final integration, installation and live history rollout are still pending.

## SQLite37–44 content group

All eight accepted with direct optional comparisons, explicit expected outcomes and retired ADR
submission wording. Setup/Run, existing blocks, metadata and revisions match baseline. All eight
actual plain/ANSI/JSON views and the54-lesson source check pass. Core runtime behavior is unchanged.
Lesson44's token-only omission previously promised a stale write, but its owner predicate still
rejects b's takeover. A focused real SQLite :memory: fixture using the source schema and claim,
takeover and completion statements verified token_only_omission=0, current_completion=1, final
job1=done|b|2|current-b and job2=claimed|b|1. The prose now reports that actual result and explains
the distinct generation role. No file/process was allocated for this SQL-only check.
Temporary review catalog removed. Evidence uses `.cache/legacy-migration/sqlite-37-44*` until final
acceptance. The ledger has242 accepted and8 pending.

## SQLite25–36 content group

All12 accepted: ten prose edits,33/36 unchanged. Direct WAL comparisons specify local outcomes,
bounded admission/release and fresh-read retry. Quiescent copy, larger-payload compact snapshots
and declared CHECK comparisons distinguish their measured guarantees. Alert policy is interpreted
locally without a submission stage. Lesson30's syntax drops a flag absent from the unchanged script.
Setup/Run, existing blocks, metadata and revisions match baseline. All12 actual plain/ANSI/JSON
views and the54-lesson source check pass. Existing runtime evidence applies; no new lab allocated.
Temporary catalog removed. Evidence uses `.cache/legacy-migration/sqlite-25-36*` until acceptance.
The ledger has234 accepted and16 pending.

## SQLite13–24 content group

Primary accepted all12 lessons:13–18 unchanged,19–24 direct optional comparisons with local results.
The prose now specifies batch loop bounds, surviving rows under FAIL/outer COMMIT, reader release
before retrying a busy COMMIT, bounded admission waits, successful WAL publication and longer wait
costs. No Setup/Run, existing block, metadata or revision changed. All12 actual plain/ANSI/JSON
views and the54-lesson source check pass. Existing runtime evidence applies; no new lab allocated.
The temporary catalog is removed. Logs/manifests/views use `.cache/legacy-migration/sqlite-13-24*`
until final acceptance. The ledger has222 accepted rows and28 pending.

## SQLite01–12 content group

Primary accepted all12 complete early lessons: eight prose edits and four unchanged (04/05/09/12).
Direct optional instructions provide copied-path/count evidence, COMMIT visibility, failed-migration
same-connection inspection followed by rollback/reopen, STRICT/CHECK rejection and larger-page
observations. Lesson11 points to its already-supplied secondary-index phase, avoiding an attempted
duplicate CREATE INDEX. Syntax uses variation terminology, and01 replaces its irrelevant .shell
description with the actual host-copy comparison. Copied-file/transaction cleanup is explicit.

All Setup/Run bytes, existing blocks, identities, sessions, safety and revisions match baseline.
All12 actual CLI plain/ANSI/JSON views pass and SQLite check reports54 lessons. The temporary
catalog is removed. Existing runtime evidence applies; no lab or file-copy trial was allocated.
Logs/manifests/views use `.cache/legacy-migration/sqlite-01-12*` until final acceptance. The ledger
now has210 accepted and40 pending.

## Linux61–72 and complete Linux acceptance

All72 Linux lessons are primary accepted. The final12 replace staged prompts with direct namespace
and capstone comparisons while retaining every executable diagnostic and bounded variation.
Capstone overviews identify the observations directly. Lesson72 removes hypothesis/reveal/incident
submission obligations and replaces exactly two Run comments; every executable statement, service
protocol, signal sequence, watchdog, assertion and cleanup is unchanged, as is revision2.

The accepted [Linux integration evidence](../../curriculum-tools/courses/linux/validation/04-integration.md)
already covers72's core and exact six-file comparison: healthy baseline, timeout while stopped with
a listener, healthy reply after CONT, then zero graceful status and no service files/listener.
Wrong-response and watchdog negative checks rejected failure while cleaning up. The same report
covers all earlier cores and actual variations. No behavior changed here, so no lab was rerun.

All12 parsed allowed-field checks preserve metadata/revisions and all executable content; the
manifest explicitly lists the two comment substitutions. All12 complete actual plain/ANSI/JSON
CLI views and the72-lesson source check pass. Contextual searches find no staged coaching prompts
in active Linux lessons. Temporary review catalog removed; no Linux resource was allocated.
Logs/manifests/views use `.cache/legacy-migration/linux-61-72*` until final acceptance.

The ledger has198 accepted rows and52 pending, all in SQLite01–51/53. Scratch is22MB; learner
progress hash and live lab identity/readiness remain unchanged. Final integration, installation
and live catalog refresh still follow the remaining content audit.

## Linux49–60 content group

Primary accepted all12 resource-limit/socket walkthroughs with direct optional comparisons and
local outcomes. All supplied numeric/assertion substitutions, identity boundaries, bounded forks,
watchdog settings, fresh cgroups, loopback/port0 binds and exact-process cleanup remain available.
Lesson57 identifies the second client sleep immediately before sendall;59 adds only an inline
print of its already-collected tcp_row so the hexadecimal endpoint can actually be inspected.

Exact parsed checks preserve Setup/Run, existing blocks, identities, sessions, safety and revisions.
All12 actual CLI plain/ANSI/JSON views pass and Linux check reports72 lessons. The temporary catalog
is removed. Existing runtime evidence applies; no workload, listener, cgroup or lab was allocated.
Logs/manifests/views use `.cache/legacy-migration/linux-49-60*` until final acceptance. The ledger
now has186 accepted and64 pending.

## Linux37–48 content group

Primary accepted all12 memory/scheduling lessons with direct optional comparisons. Every supplied
parameter/assertion substitution, live-process query, allocation bound, readiness/phase marker,
scoped counter and exact-resource cleanup remains available. The comparisons distinguish mapping
from residency, first-touch from subsequent writes, cache snapshots from device behavior, pressure
events from OOM evidence, and scheduling configuration from measured service outcomes. Lesson48
explicitly states that its existing read finishes before the I/O-class change.

All Setup/Run bytes, existing code/diagram blocks, identities, safety, sessions and revisions match
baseline. All12 complete actual CLI plain/ANSI/JSON views and the72-lesson source check pass.
The temporary catalog is removed; no workload, cgroup, mount or lab was allocated. Prior runtime
evidence applies. Logs/manifests/views use `.cache/legacy-migration/linux-37-48*` until final
acceptance. The ledger now has174 accepted and76 pending.

## Linux25–36 content group

Primary accepted all12 complete filesystem/storage walkthroughs after replacing staged prompts
with direct optional instructions and outcomes. Every existing optional script is byte-identical,
including hard-link/rename, moved symlink, subshell umask, direct publication, replacement pathname,
mount lookup, close-before-unlink and sparse-byte comparisons. The three full reruns preserve
their existing tmpfs4MiB payload/assertion,48MiB overfill and8MiB retained-file substitutions.
Lesson34's unrelated16MiB/1MiB prediction is retired; its actual32MiB mount remains unchanged.

Exact parsed comparison confirms Setup/Run, all fenced/indented blocks, metadata and revisions
match baseline. All12 actual CLI plain/ANSI/JSON views pass from a temporary catalog, which is
removed. Linux check passes with72 lessons. Existing real evidence applies; no mount/image or
lab was allocated. Logs/manifests/views use `.cache/legacy-migration/linux-25-36*` until final
acceptance. The ledger now has162 accepted and88 pending.

## Linux13–24 content group

Primary read all12 complete lessons and replaced staged Predict/Inspect/Hint/Vary/Apply prompts
with direct optional comparisons and local interpretation. Every supplied variation remains:
shorter sleeps/polling, changed exit statuses and pipeline payloads, wider zombie observation,
changed input/stdio/inherited-file text, half-size pipe stream, changed FIFO message and lower
subshell descriptor limit. Their assertion substitutions, immediate status capture, readiness,
exact-PID cleanup, descriptor lifetime and session order are preserved. Lesson13 also changes one
syntax reference from challenge to variation.

All Setup/Run bytes, existing prose code/diagram blocks, identities, safety, sessions and revisions
match baseline. All12 pass complete actual CLI plain/ANSI/JSON rendering from a temporary catalog,
which was removed; `linux-legacy check` passes with72 lessons. No experiment changed, so no runtime
repeat was needed. Logs/manifests/views use `.cache/legacy-migration/linux-13-24*` and remain only
until final acceptance. The ledger has150 accepted rows and100 pending.

## Final PostgreSQL content group

All92 PostgreSQL lessons are primary accepted. The last12 are39–45/48/50–53: nine unchanged and
three prose-only changes. Lesson39 renames a variation reference. Lesson48 replaces the unavailable
hint reference with the existing matched-update subsection, the archived `note='changed'`
substitution and direct committed-note counts. Lesson52 replaces prediction with the archived
`id=1003` update and `id=1003 and amount=10` result-check substitutions. Setup/Run and every
identity, session, safety and revision field are unchanged. These comparisons already existed;
the changes make their exact substitutions and local interpretation available in the lesson.

Prior real-tool evidence covers48's100 HOT updates in both matched tables and52's ordinary UPDATE,
additional B-tree work and correct final rows: see
[index acceptance](../../curriculum-tools/courses/postgres/validation/03-indexes.md) and
[WAL acceptance](../../curriculum-tools/courses/postgres/validation/04-wal-records-images.md).
Source correspondence was checked against `9fc73b2`'s archived `guides/12-indexes.ts` and
`curriculum/wal-records.ts`. No experiment was changed and no new lab was allocated.

All12 pass exact parsed allowed-field/command/metadata parity and complete actual CLI
plain/ANSI/JSON rendering from an independently created and removed catalog. PostgreSQL check
passes with92 lessons. Manifest/log/views use `.cache/legacy-migration/postgres-final-12*`.
The ledger now has138 accepted rows and112 pending; Linux and SQLite audits, final integration
checks, installation and live catalog refresh remain outstanding.

## PostgreSQL88–92 continuation acceptance

Primary accepted88–91 at revision5 with self-contained inspection/recovery commands and explicit
owned cleanup. All12 real incident branches passed independent domain/resource audits and supplied
cleanup. Lesson92's before-commit comparison is now direct prose; unchanged Run/revision4 reuses
its existing accepted capstone evidence. Exact source differences, actual results, error
classification, copied-history/revision checks and cleanup are recorded in
[the course-local continuation report](../../curriculum-tools/courses/postgres/validation/11-legacy-continuations.md).
All five complete CLI views pass and PostgreSQL's92-lesson source check passes. The ledger now has
88 accepted rows and162 pending. Live learner progress/backups remain unchanged; final rollout is pending.

## PostgreSQL01–08 review

Primary read all eight complete lessons. Lessons02/04/05 are unchanged. Lessons01/08 replace
“challenge” labels with “optional variation”;06 directly inspects the last page instead of requesting
a prediction. Lesson07 preserves its open-transaction page comparison and explicitly closes the
writing transaction with ROLLBACK afterward. That inline cleanup is the only new command wording;
Setup, Run, session ordering, identities, safety and revisions remain byte-for-byte unchanged.

Lesson03 had a pre-existing expected-result error: the extension inventory cannot show
`test_decoding` as installed=false because that output plugin has no extension control-file row.
The installed filesystem contains its library and the other three extension control files; the
exact existing SELECT, executed read-only, returns pageinspect/pg_stat_statements/pg_walinspect
with installed=true. The corrected prose agrees with PostgreSQL16's
[extension inventory](https://www.postgresql.org/docs/16/view-pg-available-extensions.html) and
[output-plugin documentation](https://www.postgresql.org/docs/16/test-decoding.html).
SQL and revision2 remain unchanged; no extension was installed or removed for this check.

All eight pass exact parsed allowed-field/command/metadata comparison and complete CLI
plain/ANSI/JSON rendering from a disposable catalog. The conservative command-block checker
initially treated03's four-space nested explanatory prose as code; the accepted manifest explicitly
names that exact prose replacement while retaining strict parity for actual commands/diagrams.
The PostgreSQL92-lesson check passes. Existing experiment validation remains applicable; no lab was
allocated. Log/manifest: `.cache/legacy-migration/postgres-01-08-parity.log` and `postgres-01-08.json`.
The ledger now has96 accepted rows and154 pending.

## PostgreSQL10–20 review

Primary accepted all11 lessons: eight prose changes, three unchanged (15/17/18). Variation labels
replace “challenge”;12 clarifies that only SELECT repeats inside the open reader transaction and
explicitly closes the readers;16 points to current lesson15's horizon experiment. Setup/Run,
identities, revisions, safety and session ordering are unchanged, as are all existing comparison SQL
blocks. Complete parsed-field and plain/ANSI/JSON checks pass, with one exact nested explanatory
prose exception in11. Logs/manifests use `.cache/legacy-migration/postgres-10-20*`.

Lesson11's prior optional explanation incorrectly said an idle `BEGIN; SELECT 1;` reader retains
backend_xmin under default READ COMMITTED. A Go driver created one private PostgreSQL16 cluster and
held a real reader idle while a separate observer checked it: READ COMMITTED returned
`idle in transaction|t|t` for state/xid-is-null/xmin-is-null; REPEATABLE READ returned
`idle in transaction|t|f`; rollback returned `idle|t|t`. The corrected prose retains the original
READ COMMITTED commands and supplies explicit rollback. The contrasting retained snapshot is
already taught in15. These observations agree with PostgreSQL16's
[transaction isolation](https://www.postgresql.org/docs/16/transaction-iso.html) and
[activity fields](https://www.postgresql.org/docs/16/monitoring-stats.html#MONITORING-PG-STAT-ACTIVITY-VIEW).
The driver stopped and removed its own cluster and clients; no learner connection was used.
Retained concise evidence: `verify-readonly-horizon.go` and `pg11-horizon.log` in migration scratch.

PostgreSQL's92-lesson source check passes. The ledger has107 accepted rows and143 pending.

## PostgreSQL21–37 review

Primary accepted both review groups (21–29 and30–37): four prose changes and13 unchanged lessons.
Lesson21 directly explains successful connection reuse and closes its optional read-only
transaction;23 uses variation terminology. Lesson28 removes the prediction prerequisite and names
the existing competitor increment/assertion substitutions (+20 and110|1). Lesson29 removes its
prediction prerequisite, states85/78/63 for the supplied amount/identity comparisons and explicitly
stops after the two hidden-response fixtures before the incorrect new-identity replay.

The remaining isolation, lock queue, deadlock, DDL, advisory-lock and work-queue lessons have direct
experiments and comparisons. Genuine wait instructions, native SQL error HINT output, physical
observation and the queue's five-minute fixture deadline are retained. Neither group changes
Setup/Run, existing optional SQL blocks, metadata, revisions or stable identities. Independent
disposable catalogs pass exact allowed-field comparison and complete plain/ANSI/JSON checks for
every lesson. Existing experiment evidence applies; no new lab was allocated. Logs/manifests use
`.cache/legacy-migration/postgres-{21-29,30-37}*`. The ledger has124 accepted rows and126 pending.

## PostgreSQL47/49 restored comparisons

Lesson47 now includes the exact archived retention SQL and advances revision1→2. Lesson49 directly
names its existing wider-range comparison and stays revision4. The primary ran47 core, two retention
trials,49 core and its wider-range trial in one serial owned fixture, independently checked complete
domain contents and cleanup, and verified exact source/render/revision/history boundaries.
[The course-local report](../../curriculum-tools/courses/postgres/validation/12-restored-comparisons.md)
records actual results and retained small evidence. All owned resources are removed; live learner
state is unchanged. The ledger now has126 accepted rows and124 pending.

## Public names and skipping

Commits `d0c5511` and `8ee20a9` separate public names from stored identities and add number-first
skip plus visible skipped states. Primary reviewed every production diff and the independent
`legacy_flow_test.go`, then ran the focused course, route, CLI, scaffold and render suites.
All passed. Fixtures cover public/old names, shared progress/notes/attempts, stale and retired rows,
unrelated history, quoted paths, repeated refresh, read-only display, collisions, malformed metadata
and maintenance routing. Harmless Bash fixtures exercise validation routing without course labs.

All five public checks passed (92/54/72/26/6 authored), and discovery listed seven canonical entries.
Canonical legacy `progress verify` preserved all251 existing lesson identities,36 progress rows
and37 attempts on disposable copies. The real learner file remained byte-identical to SHA256
`2dc0facf7d98431d09ecaba690cf44a717b5bef6f8af9c5b2ff18267653538a3`.
Independent full tests/vet and focused race passed at this checkpoint; the required final complete
suite and rollout acceptance remain pending after content integration.

## Editorial exemplars

Linux01–12 retain identical Setup/Run, metadata, revisions and identities. Their supplied optional
comparisons now include direct instructions and local evidence instead of five coaching prompts.
Primary reviewed source and rendered comparisons, including immediate PID capture, parent filters,
session ordering and cleanup. PostgreSQL09 retains its SQL and metadata; exactly four navigation
comments changed. Its added diagram distinguishes inline compression from external TOAST storage.
The optional storage-policy SQL remains identical and now has a code fence and local interpretation.
Its cleanup repeats the already supplied first Setup statement to remove only st_toast/TOAST storage.

All13 rendered in plain and ANSI through the actual CLI from a refreshed disposable history copy.
Parsed comparisons against the baseline allow only the reviewed fields/comment substitutions.
Existing real-tool evidence remains applicable because executable behavior did not change.

## PostgreSQL38/46/54–57 editorial acceptance

Primary reviewed all six diffs and their complete local experiment flow. Lesson38 removes an
unsupplied cost-setting coaching prompt and its dangling syntax bullet;46 removes a hint-dependent
replay of the duplicate/index repair sequence already present in Run. Lessons54–57 now identify
their existing WAL_BATCH, segments, commit_second and noop_comparison switches directly. Primary
checked the associated workload and outcome assertions and supplied local interpretation for55–57.
The existing optional pg_test_fsync program remains byte-identical.

The parsed baseline comparison rejects every change outside the reviewed prose fields. Setup,
Run, metadata, revisions, identities and session ordering are identical. All six were rendered
through the CLI from a fresh disposable catalog in plain, ANSI and JSON; JSON matches every source
field and ANSI matches styling of the complete plain view. PostgreSQL's92-lesson check passed.
These are editorial changes, so the existing real-tool evidence applies without new cluster runs.
Concise verification log: `.cache/legacy-migration/postgres-six-parity.log`; its renders are retained
until final migration acceptance. The temporary catalog was removed and no lab was allocated.

## PostgreSQL58–68 editorial acceptance

All11 lessons are reviewed. Lessons58–62/66 now name their existing rounds, rows, batches, repair,
selected_target and OBS_AUTOCOMMIT controls and locally explain the outcomes. Lesson63 retires its
unsupplied holder-timer hint, the associated syntax sentence, and exactly one nonexecuting Run
comment: `-- If A is running the variation's timer, wait for its prompt, then commit.` The core
three-session experiment is unchanged. No other Setup/Run byte changes are allowed in this chunk.

The64 variation now names its matching10000-row/7000000-byte answer check;68 names its rollback
expected-value expression. Both recover the already documented optional outcome rather than
changing the comparison. The course's dated [observability acceptance](../../curriculum-tools/courses/postgres/validation/03-observability.md)
records both successful answer checks and the exact intended row/log outcomes under these stable
slugs (that historical report uses older ordinals). Lesson67's explicit cleanup repeats its first
Setup DROP after the optional transaction ends. Lesson65's direct workload choice stays unchanged.

All11 pass complete parsed comparison, rejecting nonapproved fields, and actual CLI plain/ANSI/JSON
rendering from a fresh disposable catalog. All prose code blocks/diagrams remain identical, and the
sole main Code exception is checked as an exact string deletion. Metadata/revisions remain stable;
the92-lesson check passes. No new real-tool run was needed for these editorial clarifications.
Log: `.cache/legacy-migration/postgres-58-68-parity.log`. Its render views remain until final
acceptance; temporary catalogs are removed and no server or experiment lab was allocated.

## PostgreSQL69–87 editorial acceptance

All19 lessons now point directly to their existing controller switches, with local comparison
outcomes. The switches cover receiver restart, paused-replay workloads, primary fallback,
synchronous-wait resolution, feedback retention, slot invalidation/rebuild, cutover readiness,
rewind history and cascade/failback; then replica identity, acknowledged-slot crash replay,
snapshot/tail overlap, conflict skip/reconciliation, resnapshot, outbox acknowledgement loss,
idempotency-race abort, coordinator-decision loss, rolled-back fences and LISTEN registration order.

Primary verified switch-dependent assertions and outcome inventories. Lesson75 specifies the
second controlled=True controller, so its unsafe baseline remains intact. Remaining hint references
in77–83 and86's introductory prediction were removed contextually. Source SQL/programs, session
coordination, cleanup, safety, revisions and all fenced/indented prose blocks match the baseline.
No runtime behavior changed; existing accepted branch evidence remains applicable.

The69–77 and78–87 passes each refreshed a disposable catalog and verified every lesson's JSON
against parsed source, complete plain content, ANSI styling and canonical footer. Both passed,
as did the92-lesson source check. Logs are
`.cache/legacy-migration/postgres-{69-77,78-87}-parity.log`; paired renders remain under matching
`review/` directories until final acceptance. Temporary catalogs were removed, and no servers,
replicas, workload clients or lab directories were allocated.

## Essentials and gRPC presentation audit

All26 authored Essentials lessons and all6 gRPC lessons are primary-reviewed. Essentials has19
wording-only edits:04–16,18,20,23–26. The other7 Essentials lessons and all6 gRPC lessons remain
byte-identical in parsed content. The broader audit found optional/core prompts beyond the initial
examples in the plan, including05/08/11/16/20/23/24. Lesson19 already had a direct comparison.

The revised prose gives observations and local interpretation without a prediction/reveal task.
Essentials10/11 now describe one shell with controller-managed connections to the learner lab;
25/26 explicitly describe their private-cluster controllers. Required manual A/B terminal schedules
remain unchanged. Searches were reviewed in context: planner predictions, a waiting database
statement and submitting an application edit remain legitimate technical language.

All32 lessons passed exact parsed command/metadata/revision comparison and CLI plain/ANSI/JSON
rendering against a fresh disposable catalog. All fenced and indented blocks in every prose field
(including diagrams, connection commands and optional SQL/programs) match the baseline exactly.
Primary reviewed changed prose, evidence and representative rendered diagrams/cleanup/footer flow.
`postgres-essentials check` and `grpc check` pass with26/6 authored lessons. No experiment was
changed, so existing runtime evidence remains applicable; the pruned gRPC tools were not reinstalled.

Verification log: `.cache/legacy-migration/essentials-grpc-parity.log`; the32 paired views remain in
`review/essentials-grpc/` until final acceptance. The temporary catalog was removed. All legacy backup
hashes still match the baseline manifest. Essentials' live catalog refresh remains pending with the
final rollout, and its current learner history has not been changed.

## SQLite52/54 real-tool acceptance

2026-09-12: `bin/tutor sqlite-legacy validate --isolated --keep 52 54` passed with SQLite3.53.4.
Primary inspected the actual output and independently reopened the resulting databases read-only.

| Evidence | Observed result |
| --- | --- |
| 52 old reader / committed writer | A_start=0, A_now=0, B_committed=600 |
| 52 retained WAL / partial PASSIVE | 1,268,992 bytes; checkpoint tuple0/308/2 |
| 52 after reader COMMIT | TRUNCATE0/0/0; WAL0 bytes; verified_rows600; integrity_check ok |
| 52 independent domain check | 600 rows, every payload1400 characters, integrity_check ok |
| 54 indexed lookup | by_tenant plan;50 initial tenant matches |
| 54 contender | verified database-is-locked admission error;114ms against100ms configured wait |
| 54 restore | 38ms including checks;5001 restored rows; integrity_check ok |
| 54 independent full comparison | source EXCEPT restored and reverse both empty;51 tenant7 rows |

The52 Run change is exactly one `.print` output replacement. Its SQL/session sequence is unchanged.
The54 Run change removes only the trailing generated TODO ADR and assignment-location message;
contention, backup, restore and assertions are unchanged. Unrelated copied syntax descriptions were
replaced with explanations of this experiment. The lesson now supplies architecture tradeoffs and
owned-directory cleanup. Revisions remain3 because database behavior and expected outcomes remain
the same; no prior completion is silently made current at a different revision.

The expected busy error is evidence of the intended admission failure. Timing is one local sample,
not p95 latency or production capacity. Full row comparison verifies the local restore only; the
experiment does not test host-loss survival or off-host retrieval.

Raw SQLite fixture `/tmp/tutor-validation-4220041435` was1.8MB. It is disposable after the independent
comparison and supplied cleanup check. The concise harness log is retained under
`curriculum-tools/.cache/legacy-migration/sqlite52-54-validation.log` until final acceptance;
the following cleanup checkpoint records retirement. Learner history and legacy backup hashes
remain unchanged.

Cleanup checkpoint: the supplied `rm -r -- "$lab"` removed only the printed SQLite54 evidence
directory; its absence was checked. The rest of the owned1.8MB validation root and redundant review
database were then removed. No SQLite process remained. The learner readiness query still returned
`lab|/labs/pglab/primary|f|1`. Resource headroom is14GB disk and6.8GiB memory; normal Go build caches
are retained. The13MB baseline/render directory remains solely for the outstanding migration audit.
