# SQLite as a second systems course

Design and validation boundaries established on 2026-09-04 for SQLite after PostgreSQL.

## What happened

The course review applied `curriculum-tools/docs/learning_path.md`: learn shared concepts deeply
once, then use the second engine to expose a different mechanism or ownership boundary. Adding
more generic transaction, indexing, or outbox examples did not by itself advance that objective.
The useful gaps were connection policy, error scope, foreground maintenance, independent commit
histories, restored identities, and deployment decisions supported by actual evidence.

Several plausible-looking implementations did not demonstrate their stated mechanism:

- Comparing `FULL` with automatic checkpoints against `NORMAL` without them changed two variables.
- Setting a PRAGMA in a setup CLI and benchmarking a new CLI silently lost connection policy.
- A failed `BEGIN` followed by an `INSERT` could perform unintended autocommit work.
- A marker printed before observation queries could make a shell read an incomplete evidence file.
- Flattening Session A/B into one connection destroyed snapshot and lock experiments.
- A same-file outbox example did not demonstrate independent sender and receiver commits.
- Comparing `data_version` from newly opened connections did not test cache invalidation.

## Why it matters

An experiment must exclude the alternative explanation for its output. A correct SQLite fact in
the prose cannot rescue code that measures something else. In a second course, every retained
overlap should earn its place through a concrete SQLite difference or a new application decision.

## How to apply

- Preserve sound page, journal, locking and recovery experiments. Improve their interpretation
  without silently changing behavior or marking editorial work as a new lesson revision.
- Keep per-connection settings in the connection doing the work. Contrast durable WAL mode with
  `synchronous`, `foreign_keys`, busy timeout and automatic-checkpoint policy.
- Explain retry scope explicitly: statement ABORT, savepoint rollback, full rollback, busy writer
  admission, retryable busy COMMIT, and stale WAL snapshot are different situations.
- Compare checkpoint thresholds within one durability policy, then policies at one threshold.
  Keep connections alive when inspecting WAL; last-close cleanup can erase the evidence.
- Separate instrumented observer latency from engine time. Use equal row counts and settings,
  persistent workers, an unpaced workload, live WAL samples, and separate success/busy/error counts.
  A mixed busy/success percentile is not successful-commit p95 or a production capacity limit.
- Use independent files/processes for delivery, with receiver effect plus receipt in one receiver
  transaction and sender acknowledgment in a later sender transaction. Kill only the owned sender
  after a receiver-commit marker to test the lost-ack window. Independent files still share a host.
- Treat an operation ID as binding an immutable payload, not merely as a duplicate key. Test
  changed-payload reuse, origin sequence gaps, equal-clock conflicts, tombstone retention, and
  restoring an origin whose peer remembers later operations. A local WAL is not a replication log.
- Teach `ATTACH` precisely: coordinated attached rollback-mode files can have cross-file atomicity
  under SQLite's documented conditions; independent connections do not gain that coordination, and
  WAL does not provide an all-files crash-atomic commit. A clean commit is not a power-cut test.
- Compare `data_version` only on the same open connection. It is an invalidation hint, not a global
  sequence, changed-row list or replica cursor.
- For external-content FTS5, test old-row misses, rebuild, trigger maintenance and rollback.
  `integrity-check` with rank 1 compares the index against external content; ordinary
  `PRAGMA integrity_check` alone does not establish semantic search completeness.
- Label file-batch SQL as trusted lab transport, not an untrusted production wire protocol.
  Preserve explicit assumptions about identity uniqueness, monotonic logical clocks and history
  retention. Do not imply that deterministic last-writer-wins preserves every application's intent.

Primary references: [transactions](https://sqlite.org/lang_transaction.html),
[WAL](https://sqlite.org/wal.html), [ATTACH](https://sqlite.org/lang_attach.html),
[PRAGMAs](https://sqlite.org/pragma.html), and [FTS5](https://sqlite.org/fts5.html).
