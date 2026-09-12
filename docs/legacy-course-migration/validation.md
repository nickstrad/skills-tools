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
