# Isolation validation

Validated on 2026-09-04 against the coordinated private pivot_visibility database. No global
settings or benchmark changes were made.

## Static evidence

- /root/.deno/bin/deno fmt courses/postgres/curriculum/05-isolation.ts
  courses/postgres/guides/05-isolation.ts
- /root/.deno/bin/deno check courses/postgres/curriculum/05-isolation.ts
  courses/postgres/guides/05-isolation.ts
- /root/.deno/bin/deno lint courses/postgres/curriculum/05-isolation.ts
  courses/postgres/guides/05-isolation.ts
- /root/.deno/bin/deno task build postgres

All completed in /tmp/pg-pivot-isolation-work.

## Core two-session evidence

The six retained tool lessons completed in sequence with timeout 90000:

- atomic-abort printed 90/110 inside the transaction, then 100/100 after rollback; division by zero
  was followed by the expected failed-transaction error and SQLSTATE 25P02.
- read-committed-sees-each-statement printed read committed, then 100 before and 600 after B's
  committed increment inside the same A transaction.
- lost-update-under-read-committed ended at after_naive = 90, after_atomic_update = 80, and
  after_for_update = 80. B printed that it woke and read 90 in the locking case.
- repeatable-read-blocks-then-fails printed 40001, the expected failed-transaction error, and 105
  after rollback.
- write-skew let both commits succeed and ended with on_call_after = 0, which violates the
  at-least-one invariant.
- serializable-ssi showed four SIReadLock rows, then B failed at COMMIT with 40001 and the
  read/write-dependencies detail. The final roster retained bob on call and on_call_after = 1.

Expected ERROR lines were reviewed against lesson text; no unexpected errors or timeout occurred.
Raw harness evidence: /tmp/pg-pivot-isolation-core.log.

## Row-lock variation

The fresh Read Committed variation locked real iso_oncall rows in ordered doctor order. The observer
reported b_lock_wait_observed=1 while B waited for A. A counted 2 and turned alice off call; after A
committed, B read alice false, bob true, carol false and on_call_after_wait = 1, then committed
without turning bob off. Raw evidence: /tmp/pg-isolation-variation-a.log and
/tmp/pg-isolation-variation-b.log.

## Retry helper

The harness skips shell-mode lessons, so RETRY.code was extracted and run directly with the same
private database. Attempt 1 printed ERROR 40001 and status 3. Attempt 2 printed 95 and status 0; the
script asserted balance_and_effect_count=95|1 and reported one aborted attempt, a fresh successful
transaction, and one committed effect. Raw evidence: /tmp/pg-pivot-isolation-retry-manual.log.
