# Backup and missing-history acceptance

Primary acceptance, 2026-09-05. Current 61 base-backup is revision 4. The self-contained shell
experiment creates an owned source, a pristine verified backup and two independent restore copies.
The core crosses actual restore and missing-required-WAL startup boundaries; the variation
additionally repairs missing history through a private archive restore command.

## Final live evidence

Core: /tmp/pg-backup-core.log, /tmp/pg-owned-3bvqeum4. Variation: /tmp/pg-backup-variation.log,
/tmp/pg-owned-z8l8itbu. Drivers: /tmp/pg-backup-validate.ts and /tmp/pg-backup-{core,variation}.sh.
Each owned directory retains pristine backup, label/manifest, verbose basebackup log, verification
logs, separate successful/failed/repaired recovery logs and JSON assertions.

The backup manifest range is 0/A00028–0/A00100 on timeline 1 in both samples; backup_label names
required segment 00000001000000000000000A. SHA-256 hashes are recorded separately per run. Intact
pg_verifybackup passes before restore and again at the end.

Source jobs and receipts both total 2,001,000 before backup. After a later committed update, both
source totals are 2,001,100; the source then stops before either restore begins. Independent
restores return 2,000 jobs and 2,000 matching receipts, IDs 1–2,000, both totals 2,001,000, every
amount=id, exact request identities and done states. Real duplicate job, duplicate receipt-job,
missing foreign-key and negative-amount attempts are rejected by expected SQLSTATE classes inside
subtransactions. Full outcomes remain correct afterward. Fresh logs show actual completed backup
recovery, redo and readiness.

Removing the required starting segment from a separate copy makes pg_verifybackup fail WAL parsing
with "could not find any WAL file" (it was the sole ordinary segment). Actual pg_ctl startup returns
1 with the specific FATAL "could not locate required checkpoint record". No ready message or live
PID remains. Core failure was bounded at 230.85ms in this sample. The label remains present and
identical; no metadata removal masks the missing-history failure.

The variation copies the byte-identical required segment from the pristine backup to a local
archive, sets restore_command and recovery.signal, and actually retrieves that segment. Fresh repair
logs prove archive retrieval and completed backup recovery; all domain/constraint checks pass with
the source still stopped. The observed repaired timeline is 2; this is archive recovery, not a
PITR-target experiment. PITR must still prove its chosen before/after branches.

All final source, good-copy and repaired-copy servers stopped. The prototype and failed integration
runs also stopped their owned servers. Failed acceptance trials exposed two useful boundaries:
verifier must run before restore-specific configuration edits, and a no-WAL-file failure need not
print the missing filename. The first repair also exposed read-only readiness before recovery
completion; start_target now polls pg_is_in_recovery=false before write probes.

## Integration

Exact copied-catalog hint2: /tmp/pg-backup-rendered-base-backup.md and
/tmp/pg-backup-exact-base-backup.log. It creates another actual backup, repeats independent restore
and classified missing-WAL failure, then retrieves the segment and verifies repair.

Thirty tests and full repository check pass (/tmp/pg-backup-tests.log and /tmp/pg-backup-check.log).
Isolated build changes only base-backup; 94 lessons, seven reading stops, original first seven and
accepted capacity remain intact. Fresh copied catalog
/tmp/pg-observe-progress-30dq9u5t/progress.sqlite preserves IDs, progress and attempts. Learner hash
at audit is unchanged: 395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6.

Scoped builder: /tmp/pg-backup-scoped-build.py. Next: actual named-target PITR branches, then
timeline-history consolidation only after replacement coverage is executed and audited. The
remaining refactor, including replication, durable protocols and incidents, is unfinished.
