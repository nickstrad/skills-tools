# ZippyDB: a general purpose key-value store

Source: [How we built a general purpose key value store for Facebook with ZippyDB](https://engineering.fb.com/2021/08/06/core-infra/zippydb/)
— Sarang Masti, Meta Engineering, published 2021-08-06.
Added and source reviewed: 2026-09-05.

Status: agent-selected reference, added at the learner's request to evaluate it for future
lessons. Proposed experiments below are unimplemented and unvalidated.

Companion note: [ZGateway](zgateway-zippydb-proxy.md) covers the 2026 proxy layer in front of
this system.

## Why the learner saved it

Nick asked for this article and its ZGateway follow-up to be read, analyzed, and recorded here
if they can benefit future lessons. He did not state a specific reaction to the content, so no
preference should be attributed to him beyond the request itself. It plausibly extends his
recorded interest in how familiar database principles reappear in another architecture
(see [Cursor: Git at any scale](cursor-git-at-any-scale.md)), but that connection is our
inference.

## Source takeaways

The following is the author's account, not behavior verified in this repository.

- **Layering.** ZippyDB pairs a replication and distribution layer ("Data Shuttle") with RocksDB
  as the per-replica storage engine, so teams stop rebuilding consistency, failover, and
  capacity handling separately. Deployed since 2013.
- **Placement.** Deployment units are *tiers* spanning regions, with a shared multitenant
  "wildcard" tier plus dedicated tiers. Data is split into physical shards (p-shards) of roughly
  50–100 GB; applications address logical *μ-shards* instead, so shards can be remapped without
  client changes. Mapping is either compact (static) or Akkio-managed (dynamic region placement).
- **Replication.** Multi-Paxos across quorum members, organized into epochs. A lease-holding
  primary per epoch assigns monotonically increasing sequence numbers, giving a total order.
  Non-voting *followers* replicate asynchronously to serve low-latency in-region reads while the
  quorum stays small. ShardManager detects failure and promotes a new primary at a higher epoch.
- **Consistency options are per read.** *Eventual* is described as bounded staleness, with lag
  tracked by heartbeats; *read-your-writes* has the client cache the sequence number of its own
  write and demand a replica at-or-after it; *strong (linearizable)* routes to the primary and
  relies on lease ownership to exclude a second primary.
- **Durability options are per write.** The default acknowledges after the write reaches a
  majority of Paxos logs and the primary; *fast-acknowledge* returns once the primary enqueues
  it, trading durability for latency.
- **Transactions.** Optimistic concurrency control, serializable on a shard, with no lower
  isolation levels offered. The client reads a snapshot (possibly from a secondary), builds a
  write set, and sends read and write sets to the primary, which checks for conflicts against a
  recent per-epoch write history; a transaction spanning an epoch change is rejected. Conditional
  writes (`key_present`, `key_not_present`, `value_matches_or_key_not_present`) are compiled into
  the same server-side mechanism.
- **Other surface.** get/put/delete with batch forms, prefix iteration, range delete, and TTL
  implemented via RocksDB compaction. Optional caching tiers and a pub-sub mutation stream exist
  alongside the core API.
- **Stated future work.** Storage/compute disaggregation, membership management, in-band failure
  detection inside Data Shuttle, and richer distributed transactions.

## Connections and possible local experiments

Our teaching proposals. Each should use disposable owned clusters, tiny datasets, and supplied
commands; none require a distributed key-value store to be installed.

| Course or topic | Question worth investigating locally | Bounded experiment and evidence |
| --- | --- | --- |
| PostgreSQL replication (`09-replication`, `replica-readiness`, `replay-lag`) | What does a system promise when it offers three read levels instead of one? | Serve the same query from primary, a lagging replica, and a replica gated on a recorded LSN. Compare the values returned and the wait incurred. Name which ZippyDB level each PostgreSQL setup resembles and where the analogy stops. |
| Write acknowledgment (`sync-acknowledgement`, `07-wal`) | What has actually become durable at the moment the client sees success? | Vary `synchronous_commit` across `on`, `remote_write`, and `off` on an owned cluster, then crash the primary mid-load. Record what survives at each setting and map it to default versus fast-acknowledge writes. |
| Isolation and OCC (`05-isolation`, `optimistic-protocol`) | Who detects the conflict, and what does the loser do next? | Reproduce a serialization failure between two clients, inspect the error, and retry the whole transaction. Contrast PostgreSQL's server-side SSI with a client-composed read/write set checked at a primary. |
| Conditional writes and idempotency (`idempotency-protocol`, `request-protocol`) | Can a precondition replace a transaction for a single-key update? | Express `key_not_present` and `value_matches` as PostgreSQL statements (`INSERT ... ON CONFLICT DO NOTHING`, `UPDATE ... WHERE version = $1`), then race two clients and inspect the row count each observed. |
| Failover and fencing (`failover-workload`, `failback-workload`, `resource-fencing`) | How does a promotion prevent the old leader from still being believed? | Promote a standby, then let the demoted node keep serving. Show what a timeline divergence looks like and compare it with rejecting work carrying a stale epoch. |
| Retention and expiry (roadmap: Valkey; PostgreSQL `04-vacuum`) | When is expired data actually gone rather than merely invisible? | Set a short TTL in a Valkey lab and separately delete rows in PostgreSQL; measure when space is reclaimed versus when reads stop returning the value. |
| Coordination (roadmap stage 8: etcd) | What does a quorum-replicated log give that a single node cannot? | Run the bounded three-member etcd lab, use a compare-and-swap transaction, then isolate a member and lose quorum. Distinguish read availability from committed progress. |
| Partitioning and routing (roadmap: Kafka branch, object storage) | Why introduce a logical shard between the key and the storage unit? | Move a logical partition's data between two owned backends while a client keeps using the same logical name through a mapping file. Inspect what the client had to know. |

Use the [learning roadmap](../learning_path.md) to place any adopted idea. These belong as
motivation for existing lessons or a later cross-project exercise; none justify a new
distributed key-value store course.

## Limits and open questions

- The article is a design description with no reproducible benchmark. Treat every mechanism as
  the author's claim until a local experiment establishes the narrower version we teach.
- PostgreSQL is a single-primary relational system; ZippyDB is a Paxos-replicated key-value
  store. Timeline IDs are not Paxos epochs, `synchronous_commit` levels are not quorum
  configuration, and SSI is not client-side OCC. Any lesson using this article must state the
  difference rather than imply equivalence.
- "Eventual" here means bounded staleness with heartbeat-tracked lag. Do not teach it as an
  unbounded weak read, and do not claim PostgreSQL's asynchronous replicas offer the same bound
  without measuring one.
- μ-shards, Akkio placement, and tier structure have no direct local analogue. A mapping-file
  experiment demonstrates indirection, not dynamic geographic placement or resharding at scale.
- Several details are only sketched in the article: the size of the primary's recent write
  history, lease durations, and how heartbeat lag bounds are chosen. Reopen the source, or say
  the number is unknown, before quoting one in a lesson.
- A multi-process lab on one host exposes protocol and ordering failures. It cannot establish
  cross-region availability, durability, or the operational claims made about a fleet.
