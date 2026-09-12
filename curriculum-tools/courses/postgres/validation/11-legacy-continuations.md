# Self-contained incident continuations

Primary acceptance, 2026-09-12. Lessons88–91 retain their stable identities and advance revision4
to5 because the available experiments now include the missing inspection/recovery continuation.
Lesson92 changes only Overview/Optional variation; its revision4 and complete Run remain identical.

## Source and execution correspondence

Lesson88 keeps randomized preparation and supplies inspection in Run, then four explicitly
alternative recovery commands with their evidence boundaries in Expected result. The same section
supplies cleanup. Its existing Python controller gains a cleanup phase that checks the registered
owned root, pg_ctl status3 and absence of postmaster.pid; a nonblocking file lock excludes overlapping
phases. The existing preparation, workload, receiver and remedy algorithms remain unchanged.

Lessons89–91 append their existing inspect-all and restore/resolve/cancel-request calls to Run.
Their controllers remain byte-identical. All four lessons remove their bootstrap/location files
after successful preparation and supply an explicit stopped-fixture cleanup command. Useful
comparisons name the existing invocation changes: early→late, ABORT→COMMIT, explicit→autocommit
and cancel-request→terminate-request. Retired coaching/prediction/submission prose is removed.

All12 trials ran serially. Current core Run blocks for88's three causes and89–91 were executed
through `bin/tutor postgres-legacy validate --isolated --timeout 120000|180000 N`. These shell
controllers allocate their own private sockets on port6543, clear inherited PG settings and disable
TCP; no tool-mode learner connection is opened. Remaining variants execute the parsed Run verbatim
except the exact invocation replacements specified above. Lesson88's recovery alternatives run
after the harness preparation/inspection. Each trial then receives an independent Go outcome audit
and the actual supplied cleanup command before the next fixture starts.

## Observed outcomes

| Lesson / branch | Decisive application evidence | Additional boundary |
| --- | --- | --- |
| 88 resume | 12,301 exact receiver rows; balance226,990,353 | 12,000 missing operations delivered; WAL17→3MiB |
| 88 repair-archive | Same12,301 rows and balance | All12 saved pending file hashes verified; WAL15→6MiB |
| 88 reduce-demand | 12,601 rows; balance238,196,703 | 300-row window has lower actual WAL/rate than all3,000-row windows; WAL15→4MiB |
| 88 discard-reseed | Empty new decoded tail still lacks12,000 old rows; complete snapshot restores projection | Later delivery reaches12,301 rows; WAL16→2MiB |
| 89 early backup | Accepted IDs501–510 absent; later511 yields501 rows/amount880,327 | One payload byte damaged; original backup/source preserved through recovery |
| 89 late backup | All510 accepted IDs recovered; later511 yields511 rows/amount915,712 | Same physical checks, with no missing accepted operations |
| 90 ABORT | All200 ledger rows and amount60,300 preserved; no separate effect | Frozen rows100→200; prepared entry removed; restart preserves result |
| 90 COMMIT | Same ledger; separate effect exactly(id1,amount41) | Same freeze/horizon progress, following the independent coordinator decision |
| 91 explicit/cancel | Balance100, baseline note1 only; same connection,57014 then25P02 until rollback | Request response0.130s against2s budget |
| 91 autocommit/cancel | Balance100, exact notes1/2; same connection and immediate successful probe | Request response0.143s |
| 91 explicit/terminate | Balance100, baseline note1 only;57P01 and disconnected request | Request response0.145s |
| 91 autocommit/terminate | Balance100, exact notes1/2;57P01 and disconnected request | Request response0.141s |

Every88 branch delivers exactly one later operation, leaves an empty archive backlog and returns
the slot to reserved status while reclaiming old names and reducing allocation. The Go audit
independently regenerates every source ID, amount and MD5-derived payload, reads the actual SQLite
receipts read-only and recomputes the balance. It verifies the selected remedy's specific obligation.
An irrelevant archive remedy in the slot fixture was rejected with “No remedy applied”; the same
fixture subsequently recovered correctly. Cleanup under an externally held phase lock was rejected;
normal cleanup after releasing it succeeded.

The89 audit regenerates complete accepted/backup/restored/later-write payloads, hashes every actual
backup file and verifies the complete file inventory. It hashes the preserved damaged relation,
replaces its page with the retained original image and checks the original whole-file hash, then
compares page bytes to establish exactly one alteration. Actual read SQLSTATEXX001 and offline
checksum counts1/0 match the damaged/restored boundaries. Only the deliberate invalid-page error
appears in each source server log; restored server logs have no unexpected errors.

The90 audit regenerates every ledger payload and checks full before/final equality, visibility-map
all-frozen bits, prepared-entry absence, effect and restart state. The91 audit verifies exact notes,
response SQLSTATE, probe usability, measured deadline and no forced client kills in survey/apply
lifecycle files. Survey termination, chosen cancellation/termination, the explicit aborted-transaction
probe and later owned comparisons account for its ERROR/FATAL lines; no unexpected panic/traceback
occurred in successful trials. The measured latencies are fixture observations, not service guarantees.

## Rendering, history and resources

The primary comparison accepts only an explicit list of exact Run substitutions, added recovery/
cleanup fences and the four revision increments. Setup, safety, sessions, slugs, ordinals, other
metadata and existing prose code/diagrams remain identical. All five lessons pass full JSON/source,
plain-content, ANSI-style and canonical-footer checks from a temporary catalog. The92 before-commit
comparison reuses its unchanged controller and accepted [core/variation evidence](07-task-runner-capstone.md).
The92 revision remains4; no capstone runtime was repeated for this prose-only change.

A disposable catalog seeded from the baseline recorded synthetic revision4 completions for88–92.
Two current-source refreshes preserved every progress/attempt/identity row;88–91 display stale and92
remains done. Separately, `progress verify` preserved all251 live-baseline lesson identities,
36 progress rows and37 attempts on its own copy. No live catalog refresh occurred.

All12 owned fixtures and harness evidence directories are removed. Peak budgeting allowed300MB for
one fixture and its copies, with14GB free throughout; the measured first88 retained fixture was83MB.
Only small logs, scripts, outcome summaries, exact-difference manifests and rendered views remain in
`curriculum-tools/.cache/legacy-migration/`, now19MB including all earlier acceptance baselines.
Remove this scratch after final migration acceptance; no PostgreSQL backup/WAL image is retained.
Final read-only readiness returns `lab|/labs/pglab/primary|f|1`, only learner postmaster348739 remains,
and all legacy-backup hashes match. Learner SHA256 remains
`2dc0facf7d98431d09ecaba690cf44a717b5bef6f8af9c5b2ff18267653538a3`.

Scratch entrypoints are `run-incidents.go`, `audit-incident.go`, `verify-continuations.go` and
`verify-incident-revisions.go`; logs use `pg88-*` through `pg91-*`, `pg88-92-revisions.log` and
`postgres-88-92-parity.log`. Exact allowed substitutions are in `postgres-88-92.json`.
