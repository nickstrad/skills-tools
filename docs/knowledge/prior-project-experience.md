# Prior project experience and coursework selection

2026-09-04. Use Nick's own repositories as evidence for omitting familiar introductions and choosing
deeper experiments. This is a source review for curriculum selection, not a runtime validation or
an assignment to reproduce either project.

## What happened

Nick supplied [quickspin](https://github.com/nickstrad/quickspin) and
[task-orchestrator](https://github.com/nickstrad/task-orchestrator), then clarified that he is
nickstrad and wants redundant coursework removed rather than the projects copied. He also reported
KCNA, roughly seven years shipping on Kubernetes, and Docker familiarity. The canonical summary is
in [learner-profile.md](../learner-profile.md).

Read-only clones of the default branches were reviewed on 2026-09-04:

| Repository | Reviewed commit | Scope |
| --- | --- | --- |
| quickspin | `215de4c448addd290858a8c2639562a6a7634238` | README, runtime/store interfaces, SQLite implementation, reconciler and test cases, selected open plans. |
| task-orchestrator | `f03c534fe633f8e2a145feed81ce4503e1f19d62` | README, manager/worker and store code, queue and scheduler implementations, concurrency notes and selected tests. |

No code in either repository was changed or executed. Existing tests were inspected, not reported
as passing. Future agents should use these pinned sources for this review and check current source
before making implementation-specific claims.

## Why it matters

### quickspin: more experience than a container usage course assumes

The inspected code includes a Docker runtime abstraction, an HTTP/CLI control plane, a SQLite
store, and a reconciler joining stored sandbox records with observed runtime objects. SQLite state
transitions use state/version predicates and write events in the same transaction. The reconciler
handles missing containers, orphans, expiry, and incomplete write-back; tests include idempotent
passes and stale-state cases. These are concrete encounters with lifecycle and reconciliation,
not just running an image from the CLI.

Sources: [reconciler](https://github.com/nickstrad/quickspin/blob/215de4c448addd290858a8c2639562a6a7634238/internal/reconciler/reconciler.go),
[SQLite store](https://github.com/nickstrad/quickspin/blob/215de4c448addd290858a8c2639562a6a7634238/internal/store/sqlite/sqlite.go),
[reconciler tests](https://github.com/nickstrad/quickspin/blob/215de4c448addd290858a8c2639562a6a7634238/internal/reconciler/reconciler_test.go).

The open PostgreSQL-store and Firecracker plans are evidence of interests and intended work,
not implemented backends. Do not assume the learner has already learned their internals. Plans
also contain broad product claims that are not curriculum facts; independently verify any needed
technical guarantee. Source takes precedence over an older README when describing implemented work.

Sources: [PostgreSQL plan](https://github.com/nickstrad/quickspin/blob/215de4c448addd290858a8c2639562a6a7634238/docs/plans/open/09-postgres-store.mdx),
[Firecracker plan](https://github.com/nickstrad/quickspin/blob/215de4c448addd290858a8c2639562a6a7634238/docs/plans/open/26-firecracker-backend.mdx).

### task-orchestrator: scheduling and concurrency are already familiar territory

The code has manager/worker HTTP communication, Docker task execution, task-state handling,
health/restart loops, round-robin and marginal-cost scheduling, and an optional bbolt store.
Scoring fans out to candidate workers and excludes failed candidates from the scored results.
Tests cover partial failure, stale reports, concurrent state updates, and dispatch behavior.
That supports compressing elementary scheduler, queue, API, and reconciliation introductions.

Sources: [manager](https://github.com/nickstrad/task-orchestrator/blob/f03c534fe633f8e2a145feed81ce4503e1f19d62/internal/manager/manager.go),
[scheduler](https://github.com/nickstrad/task-orchestrator/blob/f03c534fe633f8e2a145feed81ce4503e1f19d62/internal/scheduler/marginalcost.go),
[persistent store](https://github.com/nickstrad/task-orchestrator/blob/f03c534fe633f8e2a145feed81ce4503e1f19d62/internal/store/persistent_store.go),
[concurrency notes](https://github.com/nickstrad/task-orchestrator/blob/f03c534fe633f8e2a145feed81ce4503e1f19d62/docs/concurrency-and-state.md).

Persistence, in-memory queues, assignment bookkeeping, and network effects are separate boundaries
in this code. The presence of a persistent store or mutex does not by itself establish crash
recovery, distributed ownership, or multi-resource atomicity. Those remain useful coursework
questions without turning this review into an unsolicited bug-fixing exercise. Likewise, bbolt
experience is not evidence of running etcd consensus, despite the dependency's organization name.

## How to apply

| Coursework | Adjustment | What can still earn its place |
| --- | --- | --- |
| General Docker course | Remove the required 30–45-lesson introduction; use selected internals workshops. | Copy-up and mount behavior, PID 1/descendant lifetime, enforcement under pressure, runtime boundaries. |
| Kubernetes introduction | Skip routine deployment and vocabulary instruction; allow Kubernetes in labs immediately. | Controller races, API/watch behavior, scheduling/admission, kubelet/runtime, networking/storage, recovery. |
| Basic worker/scheduler/sandbox build | Omit as a required integration deliverable. | A supplied small workload testing an unfamiliar cross-system invariant or performance boundary. |
| Generic reconciliation, idempotency, and concurrency primers | Brief recap or contrast where needed. | Unknown outcomes, retries across independent commits, stale ownership, lost notifications, crash recovery. |
| Linux foundations | Shorten familiar shell and process introductions through coaching; do not delete kernel depth by assumption. | Memory/cache distinctions, descriptor lifetime, scheduling, cgroups, namespaces, and packet evidence. |
| PostgreSQL and SQLite internals | Retain depth; application use of a store does not cover its physical behavior. | Pages, journals/WAL, isolation, locking, reclamation, durability, and query execution. |
| Object storage and DuckDB | Retain; reviewed implementations do not establish these mechanisms are already familiar. | Publication and reconstruction protocols; analytical execution, Parquet layout, memory and spill. |
| etcd and NATS | Retain distinct coordination and delivery mechanisms; compress familiar vocabulary. | Quorum/partitions, revisions/watches, broker acknowledgment/replay, external effects and backpressure. |
| Valkey, Kafka, Git internals | Keep their prior bounded or optional role; do not add more implementations just because Nick writes Go. | Tool-specific memory, replication, partitioned-log, or content-addressed storage contrasts. |

Ask for a prediction or explanation when selecting a lesson, not a new certification exercise.
Familiar topics can be recapped or passed over in conversation without marking progress. Keep
worked examples accessible. New lessons should remain CLI-based and locally runnable.

Do not import the repositories, mandate their roadmaps, add their full dependency lists to the
curriculum, or require implementing them again. Their purpose here is to improve the estimate of
what Nick already knows. Actual course refactors still require their own bounded design and
validation; this review changes roadmap guidance only.
