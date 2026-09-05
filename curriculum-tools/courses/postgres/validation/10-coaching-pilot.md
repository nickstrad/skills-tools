# Four-lesson coaching pilot validation

Validated 2026-09-05. Scope: coaching for lessons 9–12 and a conversational review boundary before
lesson 13. Other guides retain their earlier rendering. The 92-lesson catalog, canonical core/setup
SQL and learner completion records are unchanged. Guide overlays require no catalog migration.

## Verification method

Two Luna/high agents drafted disjoint storage and MVCC guide files. The primary reviewed their work,
returned specific UX/correctness issues for correction, edited the final prose, implemented the
renderer, and independently executed the rendered SQL. An additional read-only integration review
found no navigation/progress defects. Agent reports alone were not acceptance evidence.

A SQLite backup of learner progress was initialized through the supported CLI in an owned temporary
root. The validator selected that catalog's lessons, extracted SQL fences from the actual run and
vary views, then executed core and variation in persistent psql sessions through the shared
validation harness. Each run used ON_ERROR_STOP=1; output was checked for errors and compared with
the intended observations, not just the harness's timeout count.

The private PostgreSQL 16 cluster used a unique socket directory and port 5547, 128 MB shared
buffers, and pageinspect, pg_buffercache and pg_prewarm. It did not listen on TCP or use the learner
cluster. One cluster sufficed, with no replica, archive or backup images. Peak allocation was
budgeted below 250 MB against approximately 17 GB free; the cluster and copied catalog were removed
immediately after execution. Later edits only changed prose or phase boundaries; executable SQL and
session order were checked unchanged against those executed commands.

## Observations

| Lesson                | Core evidence                                                                                                                                                                                                                                                                | Optional variation evidence                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 9 — TOAST             | Both bodies had 100,000 characters, stored sizes 1,156 versus 100,000 bytes. Label read: 2 shared hits; body length: 16. Label update preserved 51 visible chunks and 106,496 allocated bytes; body replacement kept 51 visible chunks but grew allocation to 212,992 bytes. | Disabling compression and reassigning row 1 yielded 100,000 stored bytes and 102 total visible chunks.                                         |
| 10 — Buffer cache     | First scan: 2,048 hits + 1,216 reads over 3,264 pages; repeat: 3,264 hits. Six st_events buffers stayed resident: dirty 0, then all six dirty after update, then dirty 0 after checkpoint.                                                                                   | Both scans already had 384 hits and zero reads; pg_prewarm reported 384 blocks. The guide explicitly accepts this already-cached outcome.      |
| 11 — Transaction IDs  | Blank/NULL xid before writes; A obtained 747 with a matching transactionid lock, B obtained 748; later ordinary read stayed xid-less, forcing obtained 749.                                                                                                                  | Inside one transaction, checking returned NULL and forcing returned 750; COMMIT ended it.                                                      |
| 12 — Snapshot anatomy | B xid 753 appeared in 753:755:753 while open; Carol remained 100. After B committed the list was empty and Carol was 110.                                                                                                                                                    | A's repeatable-read snapshot stayed 755:755: and Carol stayed 110 across B's committed increment. After A committed, the fresh result was 120. |

Absolute IDs, cache counters, page allocation and sample timing are run-specific. The output proves
these controlled contrasts, not production performance or a guaranteed contiguous ID sequence.

## Automated and learner-environment checks

- Build: 92 lessons, no generated-catalog diff.
- Full engine check: format, lint and type checks passed; explicit checks cover the coaching files.
- Full test suite: **34 passed**, including four new pilot tests and five existing coach tests.
- Tests check exact four-lesson scope, executable SQL/session preservation, missing/ambiguous phase
  rejection, quoted --db navigation, direct variation commands, core reading locators, early reveal
  order, batch-review routing, and byte-for-byte unchanged temporary progress across every view.
- Actual learner views: lesson 9 start, lesson 11 start, lesson 12 apply and lesson 13 start
  rendered correctly without refreshing the learner catalog.
- Learner progress SHA256 remains
  `395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6`.

## Cleanup and limits

The private cluster was stopped normally and its data/socket directories deleted. Temporary
catalogs, SQL transcripts and controllers were removed after the primary inspected their outputs;
this concise report is the retained acceptance evidence. No outstanding bulky evidence or author
PostgreSQL process remains. The learner's original `/labs/pglab/primary` responds on port 5440, and
free space remains approximately 17 GB.

The learner has not yet tried the revised batch. Its lesson estimates and teaching effectiveness
remain provisional; the visible review after lesson 12 is the acceptance point for those questions.
