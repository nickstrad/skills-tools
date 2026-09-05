# Commit-cost acceptance

Primary sequential implementation,2026-09-05. commit-means-fsync remains current lesson54 at
revision4. This accepts the third WAL lesson, not the rest of chunk4 or the overall goal.

## Runtime evidence

The final supplied core and batch-five variation each completed eight bounded trials against the
private PostgreSQL16.15 port5540 lab. Every trial had exactly400 committed increments, correct
per-client counter shares, the expected log count and zero pgbench-reported failed transactions. The
core had400 latency samples per trial; the variation80. A later exact pgcoach-rendered hint
completed another eight batch-five trials with the same invariants. These final executions verified
9600 useful increments, with no unexpected SQL/process errors or deadlines.

Core evidence: /tmp/pg-commit-core.log, raw /tmp/pg-commit-cost-jfgandx7. The synchronous one-client
trials recorded400 WAL syncs for400 transactions; four-client trials recorded210 and206. Recorded
wal_sync_method was fdatasync. Throughput and tail latency varied between rounds; the lesson does
not make those ratios mandatory or treat cluster counters as exact device calls per request.

Batch-five evidence: /tmp/pg-commit-variation.log, raw /tmp/pg-commit-cost-dmy8zbbt. Every trial
kept 400 increments while using80 transactions. Synchronous one-client trials recorded80 syncs;
four-client trials47 and54. One short asynchronous interval recorded no write/sync delta; this is
not described as proof that its acknowledgement survived a crash. No crash was performed.

Exact rendered hint: /tmp/pg-commit-rendered-commit-means-fsync.md and
/tmp/pg-commit-exact-commit-means-fsync.log, raw /tmp/pg-commit-cost-elg81_oi. Driver:
/tmp/pg-commit-exact.ts and /tmp/pg-commit-exact.sh. Core/variation driver:
/tmp/pg-commit-evidence.ts and /tmp/pg-commit-evidence.sh.

Optional file probe was also executed successfully: /tmp/pg-commit-probe.log, raw
/tmp/pg-fsync-probe-7xpqwf_5/results.txt. It used an owned file on the same /tmp filesystem as this
private lab; fdatasync's one8KB-write sample reported1362.849 operations/second and734µs/op. This
file-path measurement is not a universal transaction-latency floor. The course explains choosing
TMPDIR on the WAL filesystem for a relevant comparison and preserves the full probe output.

## Independent review and integration

A Terra/high agent performed bounded read-only review of the completed driver and design contract,
without authoring or running benchmarks. It found no blocking defect and suggested distinguishing
invalid log records from pgbench's numeric failed-transaction count. Primary implemented that check,
reran the final core/variation, reviewed all output and executed the exact CLI hint.

95 lessons, seven reading stops, first7 and capacity objects unchanged; fresh copied progress
refresh preserves current history and IDs. Full repository format/lint/type checks and all30 tests
pass: /tmp/pg-commit-check.log and /tmp/pg-commit-tests.log. No learner progress writes.

Concurrent storage work requires care: source02, guides02 and the shared experiment-evidence note
are owned elsewhere and remain unstaged. The previously published artifact in54e9ff3 already
contains TOAST revision5 from that concurrent work while its source edit remains uncommitted. A pure
HEAD-source build would revert that already-published lesson to revision4. The scoped builder
/tmp/pg-commit-scoped-build.py therefore copies the current matching storage source into an isolated
snapshot, adds only this subsection's source changes, builds normally, and asserts that only
commit-means-fsync differs from the published artifact. It never edits generated JSON fields. The
output snapshot is /tmp/pg-commit-build-y9afwd2c. Final course integration must verify the storage
owner's source/artifact reconciliation; this report does not accept their unreviewed work.
