# Legacy course migration acceptance

Implementation is in progress. This report records accepted checks; `plan.md` owns remaining work.
Baseline source: `2776655274115a95ebabf7dd1b62fd9e9d0ff818` (2026-09-12).
The [250-row ledger](lesson-audit.tsv) distinguishes reviewed lessons from pending ones.

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
