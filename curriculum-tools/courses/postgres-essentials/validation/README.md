# First three essentials lessons: acceptance evidence

The log and artifact files below predate the Go CLI and retain their original command spellings as
historical evidence.

This is the historical first-batch record. Lessons 1–6 are now available; see
[second-batch acceptance](batch-two.md) for the current checks and cleanup.

Validated 2026-09-06 on local PostgreSQL 16.15. These are lessons 1–3 of the fixed 40-lesson route,
not reference lessons 9–12. The full plan is in `../PLAN.md`; 4–40 are not yet authored.

## Actual PostgreSQL results

Each experiment ran with the exact built setup/code in two persistent psql sessions through the
repository validator, on a private cluster with a unique socket. All steps returned and no
unexpected ERROR/FATAL output occurred. Results were read against the authored expectations.

| Lesson | Measured evidence                                                                                                                                                                             | Accepted log                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1      | Writer sees 120; other reader sees 100 before commit and 120 afterward. Aborted private value is 999; the other reader still sees 120 after rollback.                                         | `first-three.log`, lesson 1                   |
| 2      | RC reads 100 then 120 within one transaction. RR reads 100 then 100; the post-COMMIT fresh read sees 120.                                                                                     | `first-three.log`, lesson 2                   |
| 3      | Old reader sees 1,000 rows while fresh reader sees 0. First vacuum leaves 1,000 dead versions. After the old reader commits, dead count falls to 0 and free space rises from 4.71% to 99.61%. | `lessons-3.log` and `lessons-3-outcomes.json` |

The initial third experiment used VERBOSE vacuum output. It was removed because the physical counts
already show the phenomenon and the extra catalog/WAL output distracts from this lesson's scope. The
final third lesson was rerun separately and its counts, advertised snapshot horizon and free-space
increase are asserted by `validate.py`. The original log's third section remains historical
evidence, not the final rendered command sequence. Lessons 1–2 were unchanged.

The controller checks that no pe_visibility/pe_snapshot/pe_history table remains after the run.
Reference progress remained SHA256
`395120677c76babdd5cfeab3e5fc3089f3e457e0a42d6907a79cddce369a9ac6` throughout validation.

## Navigation and learner readiness

The new catalog contains exactly three available lessons, all initially todo. Route tests verify
that their slugs/titles exactly match the first three of 40 entries, that concepts/diagrams precede
setup, and that all copyable SQL blocks reassemble to the original setup/code with session labels.
They verify default selection, explicit completion, unchanged progress during views, database-path
quoting, unavailable-lesson boundaries and original reference access through the launcher.

`pgcoach` opens essentials; `pgcoach --reference` retains original navigation. New completion is
`pgcoach NUMBER done`. The first feedback point is essentials 3, with 37 entries still planned;
finishing the available batch does not complete the whole course. Installed skill routing was
updated through its existing repository symlink.

The full repository check passed (format, lint and type checks); the full test suite passed 37
tests. After navigation refinements, the affected coaching tests were rerun. CLI smoke checks cover
the initialized live essentials catalog without marking progress complete.

## Resource cleanup and limits

Two private `/tmp/pg-essentials-validation-*` roots were allocated in sequence and removed after
normal server shutdown. Neither used the learner data directory for writes. Peak budget was less
than 200 MB; no replica, backup, archive or retained database image was created. `cleanup.json`
records final retirement and free space (about 16 GB). Only small scripts/logs/reports remain. The
learner `/labs/pglab/primary` server responded to read-only identity checks before validation and
the final readiness check; learner data and reference progress were preserved.

The experiments reproduce behavior, not learning-time measurements. The 20–30 minute estimates
include explanations, terminal setup, reflection and cleanup but still require learner feedback.
Exact free percentages and transaction IDs vary. Another old transaction can also hold a cleanup
horizon; the lesson teaches that limit rather than promising vacuum will always reclaim everything.

Source checks used the existing research notes and PostgreSQL 16 documentation for
[isolation](https://www.postgresql.org/docs/16/transaction-iso.html),
[pgstattuple](https://www.postgresql.org/docs/16/pgstattuple.html) and
[VACUUM](https://www.postgresql.org/docs/16/sql-vacuum.html).
