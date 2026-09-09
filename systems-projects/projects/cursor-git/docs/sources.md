# Source notes for the Cursor Git project

Reviewed 2026-09-09. Start with the existing
[learner interest and article note](../../../../docs/articles/cursor-git-at-any-scale.md).
The selected topic is approved for planning; neither the lesson sequence nor lab results are approved.

## Primary write-up: attributed claims

[Git at any scale](https://cursor.com/blog/git-at-any-scale#continuity), Vicent Martí,
Cursor, 2026-08-18; sections Continuity, Consensus, Replication, Compaction and WAL as truth.

Cursor describes a WAL in object storage as durable truth and local Git repositories as derived
caches. Uploading a push does not publish it: a prepared local reference transaction and a
conditional update of a separate WAL index determine visibility. Atomic CAS orders competing
publishers. Repository identity drives placement through rendezvous hashing; placement improves
efficiency without defining the authority. Notifications prompt replication, while conditional
index reads determine whether a serving copy needs catch-up. Missing local repositories can be
materialized from the WAL. A primary can publish compacted packs that replicas download rather
than independently repack. The article reports production consistency and scalability; this local
project neither measures nor establishes those claims.

## APIs checked for the proposal

| Primary reference and locator | Documented behavior relevant to design | Authoring check still required |
| --- | --- | --- |
| [SeaweedFS conditional operations](https://github.com/seaweedfs/seaweedfs/wiki/S3-Conditional-Operations), Supported Conditional Headers, HTTP Status Codes, Atomicity and concurrency | Documents atomic conditional writes, create-if-absent, ETag-based updates, and conditional GET responses. | Pin a release/configuration; race independent clients against one ETag and confirm exactly one success, a failed stale retry, and changed/unchanged conditional reads. |
| [SeaweedFS quick start](https://github.com/seaweedfs/seaweedfs#quick-start) | Describes a local single-binary object-store launch. | Verify flags, listener bindings, actual allocation and cleanup in the installed release. |
| [AWS conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html), prevent overwrites based on ETag | Defines If-Match publication against the observed object ETag and failed-precondition handling. | Use as the intended API contract, not evidence that another S3 implementation passes it. |
| [Git update-ref](https://git-scm.com/docs/git-update-ref), DESCRIPTION and start/prepare/commit | Checks expected old object IDs; supports prepared ref transactions. Individual ref changes are atomic, but concurrent readers can observe a subset of a multi-ref transaction. | Test the installed Git 2.43.0 subset; protect reads/replay locally and do not infer snapshot reads from multi-ref update success. |

## Our local approximation

The route proposes a tiny full-history JSON index and immutable operation records/packs. That format,
stable operation-ID reconciliation, deterministic crash hooks and explicit applied markers are
teaching choices, not claims about Cursor's private implementation. The operation log is an
application WAL, distinct from PostgreSQL WAL and Git pack encoding.

Use index history rather than bucket listing to discover accepted operations. Validate expected
branch tips again after losing index CAS; changing only the ETag would conceal application conflicts.
Keep readers behind an explicit guard, since raw Git access can bypass the promised freshness.
Core retains all history and uses a bounded workload, so compaction/GC cannot invalidate retry
deduplication or reconstruction during these experiments.

## Questions to close before lesson publication

- Exact SeaweedFS release and conditional-write/read behavior, including persistence across its
  normal restart. Concurrent-writer validation is necessary even though current docs claim support.
- Prepared-reference transaction behavior around a successful shared publication and failed local
  commit: shared publication stays authoritative; repair the local cache through replay.
- Stable operation identity tied to unchanged content; reject reuse for a different operation.
  Use unique immutable keys and verify fetched payload checksums.
- Replay crash boundaries before/after pack import, ref update and applied-position persistence.
  With one serial replayer and one branch, old/new ref comparisons can distinguish retry from
  divergence. Do not generalize that shortcut to arbitrary multi-ref transactions or later states.
- Read/apply locking, index check timeouts and the exact read consistency statement under concurrent
  publication. Reading a captured current prefix is compatible with a later overlapping write.
- Dependency download time, storage preallocation, total lesson time and resource cleanup.

These are implementation acceptance checks for future batches. No experiment has run in this
roadmap task; structural validation is recorded separately.
