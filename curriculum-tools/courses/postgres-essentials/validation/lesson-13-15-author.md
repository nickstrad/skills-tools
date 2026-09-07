# Lessons 13–15 author validation

Author prototype observations, 2026-09-07, against an isolated PostgreSQL 16 cluster on a private
Unix socket. The cluster used `shared_buffers=32MB`, no archive and no replica, and was stopped and
removed after the checks.

## Core evidence

- Lesson 13: B exposed `Lock|transactionid`; `pg_blocking_pids` joined `pe_blocker_b` to
  `pe_blocker_a`, whose transaction was active during the diagnostic. After A committed, B completed
  and the independently queried balance was 130.
- Lesson 14: B was the observed victim in this run. Its immediate second-update SQLSTATE was 40P01;
  A's was 00000. Both finish statuses were 00000, and final values were `{10,10}` with a total
  committed increment of 20. The lesson and acceptance contract allow A instead, in which case
  `{1,1}` and total 2 prove B's whole attempt survived.
- Lesson 15: B's immediate SQLSTATE sequence was 55P03, 25P02, 57014, 25P02. Both explicit rollbacks
  succeeded; an independent query returned balance 100.

## Optional variations

- Rolling back lesson 13's holder let B commit alone; final balance was 120.
- Locking lesson 14's rows in the shared order produced a real wait, no deadlock, and `{11,11}`.
- Lesson 15's autocommit sleep failed with 57014 and its immediate next query succeeded with
  SQLSTATE 00000.

Expected error inventory: lesson 13 core/variation none; lesson 14 core exactly one 40P01 at either
labelled second UPDATE and variation none; lesson 15 core exactly 55P03, 25P02, 57014, 25P02 at the
four labelled B steps and variation exactly one 57014 at A's labelled sleep.

## Primary review qualification

The submitted core lesson-14 source did not preserve the prototype's contribution assignment: B's
first update added 10 and A's second added 1. Its claimed final values therefore did not correspond
to the submitted commands. Lesson 13's variation also left terminal switches and transaction endings
in prose. Primary corrected both before acceptance and corrected the implicit-LATERAL explanation.
This report is prototype evidence only; accepted exact-source outcomes and hashes are in the primary
per-lesson and full-catalog JSON records linked from `batch-four.md`.
