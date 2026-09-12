# SQLite optional source map

Updated 2026-09-12. The former six required reading stops are retired as learner requirements.
All essential context belongs before the experiment in the complete lesson. The shared renderer
keeps existing studyCheckpoint metadata as optional reading; no pause or reading completion is
required. This does not alter the original experiments or learner progress.

The [research notes](research-notes.md) retain primary-source detail. The
[future SQLite course plan](../../../future-courses/sqlite/course.md) owns the proposed concise
route. Old lesson numbers below refer to the 54-lesson reference course, not the future route.

| Reference lessons | Optional source sections | What they explain |
| --- | --- | --- |
| 8–13 | [File format](https://sqlite.org/fileformat.html): pages, freelist, B-tree pages, overflow, and table/index representation | Physical storage and locators |
| 14–19 | [Atomic commit](https://sqlite.org/atomiccommit.html): reserved lock, journal creation/sync, main-file write/sync, commit and hot-journal recovery | Ordered rollback protocol |
| 20–25 | [Isolation](https://sqlite.org/isolation.html); [locking](https://sqlite.org/lockingv3.html), §§2–5 | Transactions, reader/writer coordination and rollback lock states |
| 26–31 | [WAL](https://sqlite.org/wal.html), §§1–3 and §9 | End marks, concurrency, checkpoint work and reuse |
| 32–37 | [Backup API](https://sqlite.org/backup.html), §§1, 1.1, 3.1; [corruption boundaries](https://sqlite.org/howtocorrupt.html), §§1.2–1.4 | Coordinated snapshots and sidecar pairing |
| 38–41 | [Query planning](https://sqlite.org/queryplanner.html), §§1.1–1.3, 1.6–1.7, 2–4 | Lookup, covering, locality and sorting |

These sections formerly carried a combined 95–130 minute mandatory budget. That is historical
sizing, not added homework in the current flow. Authors should extract only the context needed
for each ten-minute experiment and link optional depth.

Rollback locking/atomic-commit documentation does not describe WAL. Ignore obsolete historical
page-size and large-transaction examples; validate current runtime behavior and required features.
Keep process-crash evidence distinct from power-loss guarantees. Source/version details live in
research-notes.md rather than a duplicated reading policy.

No checkpoint-only build or progress refresh is required by this documentation change. Existing
metadata survives for reference; new concise routes should not introduce studyCheckpoint gates.
