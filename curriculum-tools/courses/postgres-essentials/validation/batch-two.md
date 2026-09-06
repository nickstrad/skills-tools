# Lessons 4–6 acceptance

Accepted 2026-09-06 on PostgreSQL 16.15. These are the next three entries in the fixed 40-lesson
Essentials route. Lessons 1–3 retain their original source, identities and revisions.

## Results and review

Three Sol/high authors wrote separate drafts. The parent reviewed every command and explanation,
condensed lesson 5's syntax to the first-batch voice, clarified row rechecks and timeout resets,
normalized safe terminal switching, and added lesson 6's conditional-update alternative. Each lesson
was run independently on a fresh private cluster after its final pass and committed separately:
lesson 4 `4c9c427`, lesson 5 `693e2da`, lesson 6 `bf19335`.

| Lesson | Measured result                                                                                                                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4      | Heap size stayed 1,826,816 bytes. Free space was 76,572 bytes loaded, 1,819,680 after vacuum, and 76,572 after refill. Visible rows were 4,000 / 0 / 0 / 4,000; dead versions were 0 / 4,000 / 0 / 0. |
| 5      | Both clients read 100. Stale replacements 110 and 120 left 120; atomic +10 and +20 left 130. B's UPDATE was observed waiting on A's transactionid lock before A committed.                            |
| 6      | Stale decisions produced stock -1 and two accepts. With FOR UPDATE, B waited on A's transactionid lock, then read 0 and declined. Final stock was 0 with one accept.                                  |

The final combined run executed all six exact built lessons and asserted every labelled result, both
waits and table cleanup. No unexpected ERROR/FATAL output occurred. The shared Session and
splitSteps implementation drives the commands; the course-local observer gates A's release on actual
evidence that B is blocked. It does not add catalog queries to the learner's experiment. The
[combined transcript](lessons-1-2-3-4-5-6.log), [outcomes](lessons-1-2-3-4-5-6-outcomes.json) and
[source hashes](lessons-1-2-3-4-5-6-source.json) bind acceptance to the final catalog. Only trailing
output padding was removed from the committed transcript. Individual `lessons-N-*` records preserve
each checkpoint. Author reports distinguish static author checks from parent runtime evidence;
authors 4/5 retired their incomplete setup attempts before initdb.

## Navigation and progress

The repository's full format/lint/type check passed, and all 37 tests passed. Coaching checks cover
all six route identities, diagrams before setup, exact SQL block parity, one/two-session
instructions, review content, explicit completion, lesson 7's unavailable boundary and preserved
reference navigation. Lesson 6 is the next feedback boundary; 34 entries remain planned.

A SQLite backup copy of the learner catalog was refreshed through the supported tutor init CLI. All
18 lesson/review/full views rendered, the next lesson was 4, and all existing progress and attempt
rows were identical. Only then was the live catalog refreshed through the same CLI. Its three
completed lessons and three attempt records were preserved; no completion command was issued. The
live default `pgcoach` now opens lesson 4. See
[catalog/progress acceptance](batch-two-progress.json). The main-file hash alone is insufficient for
a WAL-mode SQLite database; row comparisons establish history preservation across refresh. Reference
progress retains its original SHA256.

## Resources and limits

Every parent private cluster was normally stopped and removed, including the combined run's
`/tmp/pg-essentials-validation-m_qrf8i9`. No backup, replica, archive or restorable image was
retained. The learner's original PID 348739 still serves `/labs/pglab/primary` on port 5440 and
responds to read-only identity queries. About 16 GB disk and 6.8 GiB memory remain available. Small
source, outcome and diagnostic records under this directory are the durable acceptance evidence.

The 20–30 minute estimates need learner timing feedback. Reuse is measured only for the heap main
fork with truncation disabled; it does not establish total filesystem reclamation. Lesson 6's
supplied manual decline demonstrates a decision from the locked value, not an implemented client
branch. A locked row does not establish arbitrary multi-row invariant protection.

Mechanism checks used the canonical book digests and PostgreSQL 16 documentation for
[vacuum reclamation and rewriting](https://www.postgresql.org/docs/16/routine-vacuuming.html),
[Read Committed row rechecking](https://www.postgresql.org/docs/16/transaction-iso.html), and
[row locks](https://www.postgresql.org/docs/16/explicit-locking.html).

Final committed-source check: an archive of `9251b1a`, excluding all unrelated working-tree files,
rebuilt the identical catalog and passed format/lint/types and all 37 tests. The archive extraction
and copied progress were removed. [Final cleanup](batch-two-cleanup.json) records no remaining owned
scratch or PostgreSQL server. The completed root handoff records the delivery boundary.
