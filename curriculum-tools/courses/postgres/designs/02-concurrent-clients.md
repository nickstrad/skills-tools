# Chunk 2: concurrent clients and durable ownership

Primary design, 2026-09-04. Implement after chunk1 integration. Existing changed lessons revision4;
new lessons revision1. Preserve slugs and completed first7. Agents receive exact subsets below.

## Isolation subset: curriculum/05-isolation.ts and guides/05-isolation.ts

Keep atomic-abort as a concise failed-transaction-state experiment; remove repeated raw dead-tuple
inspection now taught in commit-visibility-and-clog. Keep RC statement snapshots, point back to
simultaneous versions for RR instead of a second full identical round. Keep lost-update race with
atomic SQL and pessimistic fix, integrate optimistic version comparison from old88 as a distinct
stage here or immediately afterward using its surviving slug. Primary decides final placement.

Keep repeatable-read conflict, write skew and SSI with explicit invariant (at least ONE doctor on
call). Fix conflicting prose that says at least two can remain while either of two leaves. SSI
preserves safety of committed outcomes; retry supplies eventual service completion. Replace
aggregate FOR SHARE challenge with ordered SELECT of actual doctor rows FOR UPDATE in a fresh READ
COMMITTED transaction followed by counting/decision, with two-session schedule. Do not claim locking
existing rows protects absent overlapping bookings.

`retry-loop-and-idempotency` is primary-owned via new client-protocol.ts. It uses an actual shell
client loop: first attempt receives controlled40001, whole transaction reruns with a fresh snapshot,
external attempt evidence survives, bounded attempts and only classified retryable errors retried.
Do not write a DO block containing BEGIN to pretend it starts a new SQL transaction. A new
`unknown-commit-outcome` lesson will contrast a known abort with withheld commit response, using
idempotent request/effect transaction. Label withheld-response simulation precisely.

Author specific coaching for each retained lesson. Every race supplies full core code; vary changes
one condition. Hint2 provides runnable help and setup/reset requirements. Define output checks and
which actor commits/rolls back. Validate all retained core and variation SQL on scratch DB.

## Locking subset: curriculum/06-locking.ts and guides/06-locking.ts

Preserve row locks, wait graph, deadlock, lock-timeout/NOWAIT, queued DDL and uniqueness mechanisms.
Integrate basic wait-event inspection from79 into these, no generic snapshot-only view lesson.
Clarify compatible requests and lock queues rather than claiming universal FIFO. Deadlock victim is
not predetermined unless lab guarantees it; explicitly rollback the failed transaction.
NOWAIT/lock_timeout/statement_timeout are distinct, no promise1ms necessarily times out a fast
query.

Queued DDL: reproduce blocking, then repeat with bounded lock_timeout. Readers may briefly wait;
metadata-only ADD COLUMN still takes ACCESS EXCLUSIVE. A later migration lesson will combine bounded
backfill/validation and concurrent index build; don't implement it here.

Advisory locks are session/transaction mutual exclusion, no expiry/lease claim. Expose reentrancy
and release scope, no implication it fences an external resource. Unique check-versus-insert race
stays; connect invariant enforcement to idempotent requests. Partial unique extension from78 may be
integrated in performance chunk, no duplicate lease implementation here.

`skip-locked-work-queue` is primary-owned in worker-protocol.ts. State machine pending→running→done,
atomic short claim UPDATE with SKIP LOCKED RETURNING captured id/token, work outside transaction,
logical-expiry fixture to trigger takeover without a timing gamble, incremented generation,
completion conditional on matching generation/status. Race claim and race takeover; rollback and
retry evidence. Test stale completion UPDATE0 after takeover, not just two different selected IDs.
External business effects remain deferred to outbox/receiver lessons.

Deadline synthesis incorporates old82 and95 later near workload capacity. Keep original slugs until
primary has moved/replaced dependencies. No shared settings, mass connection killing or learner DB.

## Primary protocol responsibilities

Define reusable SQL request application: request identity plus immutable payload, new receipt and
business effect in one transaction, repeat returns stored result, different payload rejected,
concurrent same-key calls serialize. Retention is explicit; deleted receipts cannot promise replay.
Deliberately test the old one-statement CTE insert-or-read race before showing separate-statement
lookup. No generic retry of every SQL error and no equation of known40001 with uncertain delivery.

Define durable claims as ownership of a row generation; define external resource fencing separately.
Validate the protected resource's token-check interface including omitted-token attempts. Establish
the new fence before claiming protection against a paused old owner. A counter alone is not a
complete timed lease and token state on independent primaries is not global authority.
