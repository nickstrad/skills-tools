# Observability implementation contract

Primary sequential design, 2026-09-05. Preserve the five existing slugs at revision4 and the
accepted capacity lesson unchanged. These are diagnosis and measurement exercises after the
mechanism lessons, not a second tour of monitoring views. No learner progress writes.

1. **Wait diagnosis:** three owned clients; a registered holder and waiter plus observer. Capture
   repeated state/wait/blocker/transaction-age evidence after bounded readiness checks. Compare a
   blocked writer with an active timer. Vary whether the lock holder is idle or executing a timer; a
   timer can still retain a lock. NULL wait events do not establish CPU execution; sample shares
   describe observed occupancy, not request latency. Assert the final committed balance.
2. **I/O attribution:** bounded large/small heap workloads; separate load and scan intervals,
   preserve backend/object/context dimensions and nonapplicable NULLs. Explicitly publish this
   backend's counters and discard observation caches, retain reset epochs. Compare EXPLAIN BUFFERS
   with cluster-wide deltas; restore session settings. No cache-eviction CHECKPOINT claim or device
   I/O inference. Vary only relation size, retain equal query semantics and verify row/byte answers.
3. **Deadline cleanup:** supplied bounded client driver owns a transaction-holding psql process.
   Observe its lock/state, stop sending commands, wait for actual backend disappearance, inspect
   rollback and reconnect. Compare statement timeout in an explicit transaction: 57014, failed
   transaction, ROLLBACK, same backend. Variation changes transaction scope to autocommit and tests
   whether an earlier write survives. No generic claim that idle transactions pin every dead tuple.
4. **Index decisions:** own table with primary/unique constraints and optional query index. Capture
   scoped deltas around explicit sequential and selective workloads without resets; inspect actual
   plans and constraint metadata. A zero-scan unique index still rejects duplicate identity.
   Variation adds a previously absent query, compares the unchanged answer/work before and after a
   reversible transaction-local index removal, then rolls back. Avoid fixed scan counts unless
   execution actually establishes them; zero usage is limited to the measured window.
5. **Log correlation:** capture current stderr log filename and byte offset before an owned event.
   Bounded appended-range reads and collector polling correlate backend PID with lock wait,
   acquisition and statement outcome. Guard rotation/truncation/oversized intervals. Retain
   continuation lines. Change only COMMIT to ROLLBACK in the variation to demonstrate why a logged
   successful UPDATE is not proof of a committed business result. Session settings restored.

Every lesson gets a specific guide and runnable exact hint2. Execute each core and rendered hint
against the private port5540 lab; classify intentional SQL errors separately from harness timeouts.
Review wording against actual evidence and official PostgreSQL16 documentation. Build95 lessons,
verify first7 objects and copied progress (allow legitimate learner progress since the checkpoint),
run relevant integration checks, record durable findings and acceptance, commit/push explicit paths
with handoff. Finish this section before designing durability/recovery.
