# SQLite author source map

Updated: 2026-09-12. This inventory supports experiment design and technical verification.
It assigns no learner reading, reading time or progression stops. Teach all essential context in
`lesson`; keep the [proposed route](../../../future-courses/sqlite/course.md) canonical.
Source details and version caveats are in [research-notes.md](research-notes.md).

| Reference lessons | Technical source sections | What they explain |
| --- | --- | --- |
| 8–13 | [File format](https://sqlite.org/fileformat.html): pages, freelist, B-tree pages, overflow, and table/index representation | Physical storage and locators |
| 14–19 | [Atomic commit](https://sqlite.org/atomiccommit.html): reserved lock, journal creation/sync, main-file write/sync, commit and hot-journal recovery | Ordered rollback protocol |
| 20–25 | [Isolation](https://sqlite.org/isolation.html); [locking](https://sqlite.org/lockingv3.html), §§2–5 | Transactions, reader/writer coordination and rollback lock states |
| 26–31 | [WAL](https://sqlite.org/wal.html), §§1–3 and §9 | End marks, concurrency, checkpoint work and reuse |
| 32–37 | [Backup API](https://sqlite.org/backup.html), §§1, 1.1, 3.1; [corruption boundaries](https://sqlite.org/howtocorrupt.html), §§1.2–1.4 | Coordinated snapshots and sidecar pairing |
| 38–41 | [Query planning](https://sqlite.org/queryplanner.html), §§1.1–1.3, 1.6–1.7, 2–4 | Lookup, covering, locality and sorting |

Rollback locking/atomic-commit documentation does not describe WAL. Ignore obsolete historical
page-size and large-transaction examples; validate current runtime behavior and required features.
Keep process-crash evidence distinct from power-loss guarantees. Source/version details live in
research-notes.md rather than a duplicated reading policy.
