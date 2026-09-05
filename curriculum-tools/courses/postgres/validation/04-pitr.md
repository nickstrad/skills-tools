# PITR and timeline consolidation acceptance

Primary acceptance, 2026-09-05. Current 62 point-in-time-recovery is revision 4. The actual
named-target experiment replaces its old timestamp-paste workflow and incorporates the executed
ancestry/segment/branch coverage of timeline-history. The latter is retired only after both source
orders and the exact rendered later-target-first variation ran successfully.

## Live evidence

Core: /tmp/pg-pitr-core.log, /tmp/pg-owned-wp_nnpgm. Source variation: /tmp/pg-pitr-variation.log,
/tmp/pg-owned-d_0tl_r1. Driver: /tmp/pg-pitr-validate.ts; extracted scripts
/tmp/pg-pitr-{core,variation}.sh. Both runs retain a pristine verified backup, original archive
files and two stopped restored histories. Both original parent segments (00000001...09 and ...0A in
these samples) were checked against source SHA-256 hashes before restoration and remained unchanged
afterward.

The backup precedes job completion. Subsequent transactions complete jobs 1–10 with receipts, create
before_cleanup, delete jobs/receipts 1–5 in one committed transaction, create after_cleanup, and add
job999 after both targets. The actual source ends with jobs6–20 plus999, five receipts, receipt
amount40 and zero orphans. Restores are forced to fetch actual archived WAL by removing ordinary WAL
segments only from fresh copies, preserving the backup and its label/manifest.

| Target         | Jobs / receipts   | Receipt total | Core timeline | Reversed-order timeline |
| -------------- | ----------------- | ------------: | ------------: | ----------------------: |
| before_cleanup | IDs1–20 / IDs1–10 |            55 |             2 |                       3 |
| after_cleanup  | IDs6–20 / IDs6–10 |            40 |             3 |                       2 |

Every per-ID amount, queued/done state and request identity is checked. Neither branch contains
job999. Each writes its own committed recovery_branch marker; both copies and source remain running
during independent final comparisons. Source stays on timeline1 with no marker and unchanged
post-cleanup data. All three servers then stop, retaining original and divergent history.

In both source runs the decoded before point has start0/A11FB0, end0/A12030; after point has
start0/A12478, end0/A124E0. The matching history file's sole ancestry row is parent1 with exactly
the selected record's end LSN and named-point reason. New branch segment prefixes match the
allocated timeline and archived bytes match local bytes. Fresh logs require the named PITR target,
actual restore-point stop, archive retrieval, completed backup recovery, promotion and readiness.

The first trial caught pg_create_restore_point returning the record end, not its start. The final
driver brackets insertion and decodes the actual RESTORE_POINT record before comparing its end with
ancestry. First trial /tmp/pg-owned-urz5e312 stopped cleanly. Read-only recovery readiness is also
insufficient; the final driver waits for pg_is_in_recovery=false before writes.

## Integration and coverage

Exact copied-catalog hint2: /tmp/pg-pitr-rendered-point-in-time-recovery.md and
/tmp/pg-pitr-exact-point-in-time-recovery.log. It repeats both actual restores in reversed order.
Thirty tests and full repository check pass (/tmp/pg-pitr-tests.log and /tmp/pg-pitr-check.log).

The 93-lesson build removes only timeline-history. Apart from its prerequisite replacements,
point-in-time-recovery is the only materially changed surviving lesson. Promotion and postmortem now
depend on the actual PITR lesson. Scoped builder normalizes ordinal shifts and the explicit retired
prerequisite replacement before checking every other field, preserving first seven and accepted
capacity. Seven reading stops remain. lesson-map.md records retirement without completion transfer;
the canonical book reading map keeps original numbering and documents the consolidation.

Fresh copied catalog /tmp/pg-observe-progress-ypfk8jc3/progress.sqlite preserves every original ID,
progress and attempt row and marks timeline-history inactive. Learner hash during audit:
395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6. Builders:
/tmp/pg-pitr-scoped-build.py, /tmp/pg-pitr-progress.py, /tmp/refresh-pg-map.py.

Chunk 4's remaining checkpoint/restore contracts are now executed and accepted across
04-checkpoint-anatomy.md, 04-recovery-cost.md, 04-wal-pressure.md, 04-backup-restore.md and this
report; prior WAL subsection reports remain authoritative. The complete remaining refactor is not
finished: replication/change processing, durable protocols, incidents and final audit remain.
