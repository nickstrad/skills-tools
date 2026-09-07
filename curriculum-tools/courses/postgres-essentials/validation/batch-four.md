# Batch four acceptance: lessons 11–15

Accepted 2026-09-07 on PostgreSQL 16.15. All 15 authored lessons are available through pgcoach;
16–40 remain planned. The primary followed the committed
[batch workflow](../../../../docs/lesson-batch-workflow.md): design first, bounded Sol assignments,
primary source review and real validation, coherent commits with a temporary handoff, then cleanup.
The [design](../designs/11-15.md) fixes each experiment's teaching and safety boundary.

## Measured evidence

| Lesson | Accepted core evidence                                                                                                                                                                                             | Optional or additional acceptance                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11     | Caller gets no outcome; a fresh connection sees balance 110 after the request connection closes. The explicitly unsafe repeat produces 120 and two increments.                                                     | Before-COMMIT closure gives the same caller UNKNOWN but balances 100 then 110. An injected real 42P01 stops after one attempted write, with no replay and verified schema removal. |
| 12     | B visibly waits on A's transaction ID. Insert counts are A=1, B=0, reconnected replay=0. Stored receipt matches; amount 55 is rejected against stored 40. Final ledger has one request and total credit 40.        | A rollback lets waiting B become the sole accepted insert: count 1, total 40.                                                                                                      |
| 13     | Displayed waiting/blocking PIDs match the actual A/B backends; Lock/transactionid edge points to A with a populated transaction start and positive age. A appears active during its diagnostic. Final balance 130. | Rolling back A preserves only B's increment, leaving 120; actual wait still observed.                                                                                              |
| 14     | Exactly one second UPDATE gets 40P01 and the other 00000. Finishing both leaves one complete contribution.                                                                                                         | Separate private detector probes exercise both victims: A victim leaves {1,1}/2; B victim leaves {10,10}/20. Same-order variation still waits but both commit, leaving {11,11}.    |
| 15     | B errors are exactly 55P03, 25P02, 57014, 25P02 at the named commands. Final balance is 100 after both transaction rounds are rolled back.                                                                         | Autocommit sleep gets 57014, then the next SELECT succeeds with 00000 and connection_reusable=1.                                                                                   |

Each new lesson ran standalone against the exact built setup and command blocks. Then all 15 ran in
sequence, including displayed SQL variations and both supplied clients' additional checks. The
shared persistent REPL Session/splitSteps implementation drives terminal switching. The local runner
confirms an actual wait before releasing each intentional blocker, including earlier lessons 5–6.
Shell commands must return successful exit status as well as the expected evidence.

The validator scopes columns and error inventories to their lesson. Expected errors are one B 40001
in lesson 9, one deadlock error in either lesson-14 participant, and the four named B timeout errors
in lesson 15; the autocommit variation allows its single named timeout only. Immediate SQLSTATE
labels, actual error session and committed final values are checked together. No other SQL errors
are accepted. The two detector probes change only private per-session deadlock_timeout settings; the
authored SQL and lock order run unchanged. They test both outcomes, not a production promise about
victim selection.

## Review and source correspondence

Primary review corrected a submitted deadlock contribution mismatch before acceptance: the prototype
report's claimed survivor values did not match the submitted UPDATE amounts. It also completed
lesson 13's variation so setup, terminal switches, transaction endings and cleanup are all
executable from the displayed fences, and corrected the explanation of table functions' implicit
LATERAL behavior. The author report is retained as qualified prototype evidence; the primary
exact-source records below establish acceptance.

The timeout lesson distinguishes aborted database work from the failed transaction block that still
needs client ROLLBACK. The renderer preserves the core commands exactly. Its test permits an
independent optional variation to recreate setup while keeping setup out of the core review.

Evidence:

- [Full-catalog outcomes](lessons-1-2-3-4-5-6-7-8-9-10-11-12-13-14-15-outcomes.json)
- [Accepted lesson and supporting-client hashes](lessons-1-2-3-4-5-6-7-8-9-10-11-12-13-14-15-source.json)
- [Full-run resource retirement](lessons-1-2-3-4-5-6-7-8-9-10-11-12-13-14-15-cleanup.json)
- Standalone `lessons-11-*` through `lessons-15-*` outcomes, source and cleanup records
- [A-victim probe](lessons-14-victim-a-outcomes.json) and
  [B-victim probe](lessons-14-victim-b-outcomes.json)
- [Catalog refresh and history checks](batch-four-progress.json)
- [Final readiness and cleanup](batch-four-cleanup.json)

The accepted source manifest was rechecked against every current lesson and both supporting Python
files after validation. The first ten complete lesson objects, including revisions and commands, are
identical to the pre-batch catalog. Only generated build output was used for lessons.json.

## Integration, progress and resources

`deno task build postgres-essentials`, `deno task check` and all 37 `deno task test` tests pass.
Route/render tests cover all 15 titles and slugs, exact displayed commands, concepts and diagrams
before setup, language/terminal guidance, explicit completion and the pending lesson-16 boundary.

`refresh.py --apply` first refreshed a SQLite backup and exercised all 45 lesson/review/full views.
It then refreshed the live catalog and repeated the views, preserving all four progress and four
attempt rows. The default next lesson remains 5; no learner completion was recorded. Reference
progress and WAL fingerprints stayed unchanged. Rendering did not write the catalog, and the scratch
backup was removed.

All eight primary validation roots were normally stopped and removed; final path checks found no
remaining essentials author roots. Both agents also retired their labs. The only PostgreSQL cluster
process is the learner's original PID 348739 at /labs/pglab/primary. Its existing clients were
preserved. A read-only readiness query confirms PostgreSQL 16.15, primary mode, and database CREATE
privilege. Final resources are about 16 GB free (33% filesystem usage) and 6.7 GiB available memory.
Small scripts, source/outcome JSON and ignored logs remain; no database image, replica, backup,
archive or progress copy is retained and there is no bulky evidence retention obligation.

All five lessons have 25-minute estimates inside the requested 20–30 minute range. Automated runtime
does not establish learner pacing. Lesson 11 withholds an application response after the service
receives COMMIT; it does not simulate lost PostgreSQL packets or crash recovery. Lesson 12's ledger
row is the specified complete database effect, not a remote-effect exactly-once protocol. Those
boundaries remain explicit in the learner text.
