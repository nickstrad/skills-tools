# Locking validation

Validated 2026-09-04 on PostgreSQL 16.15 in the private `pivot_visibility` database on port 5540.
The root course, learner progress, and port-5440 lab were not used. The private course built 94
lessons and `tools/validate.ts postgres --from 29 --to 36` completed all eight locking lessons.

## Core evidence

- Row locks: `pgrowlocks` reported `(0,1)`, locker xid 1240 and `For Update`; B was active on
  `Lock/transactionid` with an ungranted ShareLock on xid 1240. After A committed, B wrote the row
  and `still_locked = 0`.
- Wait graph: B waited for A on `transactionid`, C waited for B on `tuple`; after A committed, C
  remained blocked on B's transactionid. This is blocker evidence, not an assertion of universal
  FIFO.
- Deadlock: the detector emitted both wait edges and aborted B in this run; B's following ROLLBACK
  succeeded and A committed. The lesson now describes the victim as variable.
- Timeouts: `lock_timeout` produced `canceling statement due to lock timeout`; NOWAIT produced
  `could not obtain lock on row`; SKIP LOCKED returned 1,2,4,5 while the ordinary count remained 5.
- Queued DDL: A held granted AccessShareLock while B had an ungranted AccessExclusiveLock and
  `Lock/relation`; C returned only after A released its transaction and B's ADD COLUMN ran.
- Advisory locks: A's try lock succeeded, B's failed, A reacquired after COMMIT while one advisory
  lock row remained, unlock-all released it, and transaction-scoped lock 99 disappeared at COMMIT.
- Worker protocol: A claimed job 1 generation 1 and B job 2; no row locks remained after claims
  committed. The explicit competing takeover update returned zero rows; B took job 1 at generation
  2; stale completion returned zero rows; the rollback-rival claim returned zero rows; all three
  final result invariants were true.
- Uniqueness: B waited on A's transactionid then received duplicate-key error; the DO NOTHING round
  retained exactly `(1,A)` and `(2,A)`.

## Variations

Every authored variation is bounded and reruns its own setup where it changes persistent state: FOR
SHARE compatibility, ordered deadlock avoidance, fresh-session statement timeout, bounded DDL lock
timeout, advisory reentrancy/unlock, worker rollback claim, and unique-insert-after-rollback. The
worker helper's core separately exercises competing takeover and rollback claims with UPDATE 0. The
short DDL and timeout variations are intentionally diagnostic: a fast command may finish before a
tiny timeout, while the `pg_sleep(1)` statement-timeout variation supplies a deterministic wait.
