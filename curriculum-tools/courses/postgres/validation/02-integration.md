# Concurrent client integration

2026-09-04, PostgreSQL16.15, private pivot_primary database on port5540. Chunk2 builds94 lessons:
original optimistic-concurrency-with-version-columns moves into isolation and unknown-commit-outcome
is new. The seven reading stops remain; the retry stop was restored to the live helper.

## Primary evidence

`tools/validate.ts postgres --from 21 --to 37 --timeout 90000` completed the sequence with no
timeouts. It selected17 lessons, of which16 execute in psql and the shell retry is explicitly
skipped by this harness. The actual RETRY.code was separately executed by primary and the isolation
agent; see02-primary-protocols.md. Raw combined log: /tmp/pg-concurrency-final.log.

All SQL errors in that log are deliberate: division by zero/failed transaction;40001 for stale
snapshot/SSI;22023 for changed request payload;22003 for insufficient funds;40P01 deadlock; lock
timeout/NOWAIT; and competing uniqueness rejection. Primary inspected outputs against each lesson,
rather than accepting the harness completion count as correctness evidence.

- Unknown outcome: the committed-hidden response replays result90 once; the rolled-back-hidden
  response recovers to83. Concurrent same-key calls return80, with B observed waiting on A's
  transaction. Changed payload and failed debit leave no new effects. The old request still returns
  its original90 while the current balance is83. Final balances83/80,3 receipts,total debit37; all
  conservation/completion checks true. Repeated setup also succeeded.
- Request variation: amount15 produces account1=78,3 receipts,total42. Using a new identity debits
  again: account1=63,4 receipts,total57. The exact rendered hint was separately executed, with
  original_result85/current_balance78 and three final true checks.
- Optimistic editing: B's stale save returned zero rows. Its explicit reread/append merge retained
  both edit markers at version3. With A rolling back, B's original save succeeded at version2; the
  variation stops before an unnecessary second merge.
- Deadlock cleanup: the ordinary run chose A; local detector-delay variation chose B. The actual
  victim rolled back in each run using its captured psql ERROR flag, and both final rows belonged to
  the committed survivor. Neither cleanup path relies on a fixed victim.
- DDL variation: first metadata-only ADD COLUMN timed out55P03 while A remained open; retry after
  release succeeded with populated=5, and bounded_trial was removed. A later reader can wait briefly
  or arrive outside the queue interval; bounded waiting does not mean no waiting.
- Statement deadline: pg_sleep(1) under100ms statement_timeout produced57014 and settings reset.
- Advisory session loss: A reacquired key42 before the test; B observed false, terminated only the
  identified dedicated A session, acquired true and unlocked. No unrelated backend was targeted.
- Durable claims: takeover/stale generation, competing unavailable claim, rollback/retry and
  duplicate database completion retain the previously validated state invariants.

Raw additional evidence: /tmp/pg-concurrency-primary.log, /tmp/pg-concurrency-variations.log,
/tmp/pg-optimistic-primary.log, /tmp/pg-pivot-request.log and /tmp/pg-request-exact-hint.log.

## Review and preservation

Primary removed the commented retired retry implementation, restored its live reading checkpoint,
corrected metadata-only DDL/timeout/FIFO overclaims, supplied victim-independent cleanup, and
removed the unsupported xmin/freezing advice from optimistic editing. That lesson now distinguishes
a version conflict from the application's merge policy. Full source and coaching wording were
reviewed.

The hidden-response fixture suppresses displayed psql output; it does not claim a real network
failure or driver-disconnect test. Receipt/effect atomicity is tested in one database with retained
receipts and cooperative callers. External effects and loss of acknowledged history remain separate
later experiments.

30 engine/coaching tests passed; scoped lint/typecheck passed. Copied progress refresh preserves all
existing IDs, notes, attempts and progress rows, keeps first7 current/done, and selects lesson8. The
real learner database hash and first7 built objects remain unchanged. lesson-map.md records current
ordinals, new/moved identities and all seven reading stops.
