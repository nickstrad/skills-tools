# Bounded migration and retention acceptance

Primary designed and implemented bounded-online-migration sequentially on2026-09-05, following
concurrent index creation and depending on the earlier durable SKIP LOCKED queue/DDL work.

## Core runtime evidence

`/tmp/pg-migration-core-20260905.log` records the final direct source run on PostgreSQL16.15 in
pivot_primary. Exactly three deliberate errors occurred; each immediately printed its SQLSTATE:
55P03 (DDL lock deadline),22P02 (malformed compatibility input),23514 (premature validation). There
were no unexpected errors or timeouts.

- The blocked ADD COLUMN rolled back with published_columns=0. The retry installed the new column,
  trigger and NOT VALID check in one transaction; same_heap_file=true.
- Legacy id1001 supplied only priority_text='2' and committed priority_int=2. Malformed id1002 was
  rejected atomically. Text is explicitly canonical while the bridge remains installed.
- B held old row1 while11 independently committed backfill statements ran: nine batches of100, one
  of99 and one of0. still_null=1 despite the final empty batch. B independently observed
  committed_backfill_rows=999, proving earlier progress was visible before the migration finished.
- Premature validation failed and convalidated remained false. After B committed, final_filled=1;
  validation and SET NOT NULL succeeded. Final1001 rows, sum2002, consistent=true, attnotnull=true,
  convalidated=true. The compatibility bridge is deliberately retained pending caller rollout.

The valid-check optimization for SET NOT NULL is documented behavior, not inferred from relation
file identity or a tiny elapsed-time difference. Lock budgets remain necessary at the schema step.

## Exact retention variation

`/tmp/pg-retention-hint.ts` extracted the final second hint and ran its full two-session schedule
with the lesson's own setup. `/tmp/pg-retention-hint-20260905.log` has no errors/timeouts.

While B held eligible id1, bounded25-row batches removed199 rows with ids<=200 and then returned
empty results. still_eligible=1. Releasing B allowed final_removed=1; the result was800 rows,
first_id=201, retained_expected_range=true. Heap size remained40,960 bytes, reinforcing that logical
retention and physical space reclamation are different observations.

## Integration

Build now has95 lessons, with all backward prerequisites valid and seven reading stops. The first
seven built objects remain identical to baseline. Copied progress refresh preserves every original
lesson ID, attempts and progress, retains the seven completions and selects lesson8. Real learner
progress is unchanged. Source/guide type, lint and formatting checks pass;30 existing engine,
validator and coaching tests pass. Current mapping includes the new lesson and the earlier
consolidations/reordering. Remaining observability edits are still required to finish chunk3.
