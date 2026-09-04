# Cursor: Git at any scale

Source: [Git at any scale](https://cursor.com/blog/git-at-any-scale) — Vicent Martí,
Cursor, published 2026-08-18. Added and source reviewed: 2026-09-04.

Status: learner-selected inspiration; proposed exercises below have not been implemented
or validated.

## Why the learner saved it

The learner particularly likes how Cursor uses object storage to solve a complex systems
problem, and sees connections to the PostgreSQL and database principles they are learning.
They want agents to remember this interest when it can help shape lessons. This is a strong
preference for understanding how familiar primitives compose into useful architectures.

They also prefer local services for conceptual labs, mentioning MinIO as an example rather
than requiring AWS S3. Select the implementation when designing a lab and verify its needed
capabilities; no cloud account is implied by this article selection.

## Source takeaways

Cursor describes Continuity as storing pushes in an object-storage WAL, with publication
controlled by a separate index updated through compare-and-swap. Local Git repositories
serve as rebuildable caches. Readers validate freshness against the index; notifications
accelerate catch-up but do not establish correctness. Compacted packs can be reused across
replicas. The design retains local access for Git's expensive graph and packfile traversal.
These are the author's architectural claims, not independently verified results.
[Source: Continuity and its subsections](https://cursor.com/blog/git-at-any-scale#continuity).

## Connections and possible local experiments

These are our teaching proposals, not descriptions of Cursor's implementation. Use tiny
datasets, supplied commands, and owned disposable processes. Start with the smallest
experiment that answers one question.

| Course or topic | Question to connect to existing learning | Possible experiment and evidence |
| --- | --- | --- |
| PostgreSQL WAL, commits, and recovery | What exactly has become durable when the client receives success? | Kill an owned test client around COMMIT; reconnect and reconcile by operation ID. Compare durable outcome with the client's knowledge. |
| Object storage and transaction boundaries | What happens between writing a payload and publishing its metadata? | Upload an immutable test payload, then terminate the publisher before updating a manifest. Inspect the orphan; retry with the same operation ID and check visible results. |
| Optimistic concurrency | How does a losing writer recover without overwriting another writer? | Have two local clients conditionally update the same manifest version. Inspect the conflict, reload state, revalidate the operation, and retry. Assert that no accepted update disappears. |
| Replication and cache invalidation | How can a reader establish the freshness it promises? | Pause a consumer and suppress a wake-up. Require a durable version check before serving; compare returned versions before and after catch-up. |
| Recovery and maintenance | What bounds the work needed to reconstruct state? | Replay a tiny application event log into a fresh SQLite file. Add a snapshot and compare recovery work, then test whether retained history still supports the stated recovery target. |

Use the [learning roadmap](../learning_path.md) to place any adopted experiment. These ideas
can motivate existing lessons or a later cross-project exercise; they do not require a full
Git hosting service or a new deep Git course.

## Limits and open questions

Our interpretation: coordination has been delegated to storage guarantees, not eliminated.
Before building the manifest race, verify the selected backend's conditional-write and read
semantics. S3 API compatibility alone is insufficient evidence.

The database comparisons are analogies: PostgreSQL WAL, Git packs, and an application event
log have different formats and recovery rules. A PostgreSQL checkpoint or VACUUM is not
interchangeable with application-log compaction. Specify what each experiment preserves and
which history it may discard.

A local lab can expose races, stale reads, and process recovery. It cannot establish cloud
durability or independent-host availability. Investigate lost responses, retries, concurrent
publication, and safe reclamation explicitly before making stronger claims about a proposed
protocol. Reopen the article and relevant API documentation when a lesson needs details
beyond this short note.
