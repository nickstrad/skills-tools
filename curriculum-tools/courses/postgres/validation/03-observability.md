# Observability acceptance

Primary designed and implemented the five remaining observability lessons sequentially on
2026-09-05. The accepted capacity experiment is unchanged. All five slugs survive at revision4;
current ordinals are65,66,68,69,70, with capacity67.

## Actual PostgreSQL16.15 evidence

Private lab: socket /tmp/postgres-pivot-20260904/socket, port5540, database pivot_primary. No
learner lab operations. Each core and initial source variation ran independently; then all five
exact coaching hints were rendered against copied progress and executed serially in course order.

- **Wait diagnosis:** core has ten idle-in-transaction/ClientRead holder samples and ten
  active/Lock/transactionid writer samples. Every writer sample names the registered holder PID. In
  the variation the holder is active/Timeout/PgSleep while the writer remains blocked on it. The
  timer-only phase has ten active/PgSleep samples with no blockers. Both schedules end with
  balance1000, and both sampling checks are true. No SQL errors or timeouts.
- **I/O scope:** core heap74,473,472 bytes versus a33,554,432-byte quarter cache. Its two scans
  reported18,182 bulkread hits and zero bulkread reads; the answer was100000 rows/70000000 payload
  bytes. The7,454,720-byte variation used normal buffer activity and returned10000/7000000. All
  answer and reset checks were true. Background-writer rows appeared in the cluster delta, making
  the attribution limit visible. No SQL errors; exact counters remain cache/history dependent.
- **Deadlines:** the holder had one locked row and idle-in-transaction state, then actually
  disappeared after its local deadline. The lock count became0 and the uncommitted note reverted to
  original. Its client received the expected idle-timeout FATAL and exited2. A new backend
  connected. Statement cancellation produced57014; the explicit-transaction core then produced
  25P02, recovered via ROLLBACK on the same PID, and left no row99. The autocommit variation's next
  query succeeded00000 and row99 survived. The driver asserted all outcomes and cleaned up its
  unique schema and owned clients. Core: one expected FATAL/two expected SQL errors; variation: one
  expected FATAL/one expected SQL error; no other failures.
- **Index decisions:** the measured core has two sequential scans/20000 visited rows and two
  primary-key scans. Customer and request-key indexes both have zero query scans; catalog contype=u
  identifies the request-key correctness constraint. Its duplicate insert is rejected with23505,
  preserving10000 rows and one request identity. Variation customer7 has100 rows and ID sum495700
  before/after dropping the optional index inside a rolled-back transaction. The indexed plan
  touched102 shared buffers versus193 and9900 filtered rows without that index. The unchanged-answer
  and restored-index checks are true. One expected23505 in the core; no errors in the variation.
- **Log correlation:** core and variation each record the registered writer waiting, the exact
  holder PID in DETAIL, acquisition, and successful UPDATE duration. Both expose writer attempted
  inside B. The core commits and A reads writer attempted; the variation rolls back and A reads
  holder committed. Both final_outcome_ok checks are true. The reader keeps continuation lines and
  only reads a bounded appended interval. Session logging/deadline settings restore to their saved
  values. No SQL errors/timeouts.

A separate guard probe, /tmp/pg-observe-log-guards.sql, used the exact reader helper with
deliberately invalid temporary window metadata. Future offset, oversized interval and mismatched
filename each raised P0001 before any invalid-range read. This tests rejection branches without
truncating or rotating the server log; it is not a full log-rotation recovery test.

The first index run exposed a real psql pitfall: a NULL stats_reset passed through gset unset the
variable, producing a syntax error in the later substitution. Coalescing its text representation
before gset, then nullif at comparison, fixed it. The corrected core and final exact hints passed.
An initial harness attempt lacked sandbox socket access and timed out before any setup; the approved
private-lab runs above supersede it. Harness completion alone was never the acceptance criterion:
raw SQL errors and outcome lines were inspected.

## Reproducible artifacts

- Design: designs/03-observability.md. Source helpers: curriculum/*observation.ts.
- Individual driver: /tmp/pg-observe-validate.ts and /tmp/pg-observe-run.sh.
- Individual logs:
  /tmp/pg-observe-{wait,io,deadline,index-usage,log}-observation-{core,variation}.log.
- Exact CLI driver: /tmp/pg-observe-exact.ts, invoked by /tmp/pg-observe-exact.sh.
- Exact rendered prompts: /tmp/pg-observe-rendered-SLUG.md; runtime logs:
  /tmp/pg-observe-exact-SLUG.log, for each of the five stable slugs.
- Copied-progress check: /tmp/pg-observe-progress.py; copy path recorded in
  /tmp/pg-observe-progress-path. Uses SQLite backup into a scratch file and refreshes only the copy.

## Integration and limits

Build95 lessons; all prerequisites point backward and seven reading stops remain. The first seven
built objects and the full accepted capacity object are identical to their baselines. Copied refresh
preserves all original IDs, attempts and progress. The initial check left learner progress at hash
c7866ba1b78cb7b2aa6c1a2951149cd14c278130f92333c1e5b8dffd063f128f. The learner then completed lesson8
at revision2 concurrently with this work. A fresh copied refresh preserved that completion, every
current attempt/progress row and the original IDs; its source hash stayed
167c9c50091f4b3bb6988b71652e382dd0b02d4f7536d6509f7ad088d2695045 throughout the second check. Author
tools did not refresh the live catalog or write learner progress. The user was informed that pgtutor
init loads revised text and may offer changed lessons again while retaining earlier records.

All30 existing engine/validator/coaching tests pass. Scoped checks and the full repository
format/lint/type check pass. The repository check initially found only pre-existing formatting in
PostgreSQL REWORK-PLAN.md; formatting that owned plan resolved the failure.

This accepts chunk3's remaining observability work. Recovery, replication, durable protocols and
incidents/final integration remain pending. The timer experiments require the learner to prepare and
paste the observer block within the stated window; missed readiness is an error, not a hidden
success. The log reader rejects an invalid interval rather than attempting multi-file rotation
recovery. I/O values and sample proportions are deliberately not described as per-request device
latency. No production workload or independent-host durability claim is made.
