# Linux Lab Systems Projects

Tech-company engineering write-ups turned into small, CLI-first distributed-systems labs.

**Provenance:** supplied by Nick in chat on 2026-09-09 as the contents of his Google Drive document.
This Markdown preserves all 15 examples, their architectures, mechanisms, tools, coding suggestions,
experiments, links and scope estimates, with formatting and wording condensed. The original prose
is not a verbatim transcript. No Drive fetch was needed. The claimed 50+ candidate survey and
company architecture descriptions below are from the supplied document, not independently verified
research performed while building systemscoach. Verify the chosen primary sources and software
capabilities before proposing and validating an actual project.

**How to use:** inspiration for an interview, not an approved sequence or a request to build every
project. The user's accompanying instructions govern: minimum worthwhile agenda, 15–25 minute
lessons, approval before lesson batches, CLI-first, Go where essential and Deno second. Evening
estimates below are the document's rough project estimates, not validated lesson counts. Notes,
written answers and the document's one-page postmortem are optional in systemscoach.

## Purpose and selection method

A learning roadmap for a full-time engineer studying systems on the side. Isolate one or two
important mechanisms on one Linux VM where possible, lean heavily on existing CLIs, and use small
Go components only when they make behavior easier to understand. Do not build production clones.

The supplied survey considered 50+ write-ups/architecture families across Cursor, GitHub, Meta,
Uber, Discord, Stripe, Slack, Pinterest, Canva, Cloudflare, Netflix, Dropbox, Shopify, DoorDash,
Airbnb, Spotify, LinkedIn and related engineering publications. Themes included Git storage,
replication, sharding, caching, distributed logs, CDC, streams, migrations, failover, rate limiting,
search indexes, storage disaggregation, workload balancing and online data movement.

Shortlist filters: systems-learning density, local reproducibility, CLI observability, relevance to
data-intensive/distributed applications, bounded side-project scope, and useful progression from
native tools to small Go coordination components.

## Suggested sequence from the document

Treat these as experiments: roughly 2–6 evenings per lab, with deeper Git/WAL as a capstone.

1. Replication-lag backpressure
2. Sharded rate limiter
3. Cache router / consistent hashing
4. Kafka durable ingestion pipeline
5. Sharded relational data router
6. Online shard migration
7. Kafka as WAL for a derived index
8. Git repository replication
9. WAL-first Git storage
10. RAMP-style fractured-read experiment

This is optional inspiration, not a prerequisite chain. Choose based on the interview.

## 1. Cursor — Git at any scale

**Core:** WAL-first architecture, object storage as durable truth, local materialized replicas,
compare-and-swap serialization, replay, cache-like replicas, rendezvous hashing and compaction.
Combines storage, consistency, replication, recovery, caching, hashing and Git internals without
inventing a database. The document ranks it first for depth but recommends it as a capstone.

```text
client git push -> local bare Git repo -> capture pack/ref transaction
                                           |
                                           v
                         append-only WAL directory / MinIO bucket
                           wal/000001.json
                           packs/<hash>.pack
                           index/current (CAS-like update)
                                           |
                                           v replay WAL
                                     replica bare repo
```

**CLI:** git init --bare, cat-file, show-ref, pack-objects, index-pack; sha256sum, jq, flock,
curl, MinIO mc, inotifywait, diff. A local object store stands in for S3.

**Useful Go:** after manual flow, a small WAL writer/replayer and CAS loop. Later rendezvous
hashing over 2–3 local replica directories/containers.

**Experiments:** kill and rebuild a replica solely from the WAL; race writers against the index;
lose a notification and verify durable truth before serving; compact pack entries and replay the
compaction event. **Scope in supplied document:** 4–8 evenings.

Source: https://cursor.com/blog/git-at-any-scale

**Accompanying user interest:** optionally combine local object storage with PostgreSQL, Git and
gRPC/protobuf: application WAL records encoded as protobuf, packfiles in object storage, and local
Git replicas reconstructed/synchronized via CLIs. Supply transport and command scaffolding; learner
work should be central structures/logic. The JSON/path sketch above is the document's toy proposal,
not a claim about Cursor's literal storage layout. PostgreSQL WAL and an application WAL differ.
A local flock must not be presented as distributed CAS. See the existing
[Cursor source notes](../../docs/articles/cursor-git-at-any-scale.md) before choosing the protocol.

## 2. GitHub — Building resilience in Spokes / Stretching Spokes

**Core:** application-level replication versus distributed block storage; quorum replication,
repair, rebalancing and failure handling.

```text
repo primary -- rsync/git --> repo B
             -- rsync/git --> repo C
                       replica manifest
```

**Local:** three bare repositories in separate directories/containers. **CLI:** git, rsync,
sha256sum, diff, flock, tc/netem for latency, iptables for partitions.
**Useful Go:** small coordinator choosing replicas, recording acknowledgements, detecting missing
copies and repairing them; the document suggests 200–400 lines, not implementing Git storage.

**Experiments:** acknowledge after 1/3, 2/3 or 3/3; delay one replica 100 ms; reconstruct a deleted
replica; compare synchronous quorum latency with asynchronous replication. Useful beside Cursor
as a replicated-state design to compare with WAL-first storage.

Sources: https://github.blog/engineering/infrastructure/building-resilience-in-spokes/
and https://github.blog/engineering/infrastructure/stretching-spokes/

## 3. GitHub — Mitigating replication lag with freno

**Core:** downstream-health backpressure and practical feedback control.

```text
bulk writer -> PostgreSQL/MySQL primary -> replica
     ^                                      |
     +---------- throttle <- lag monitor <---+
```

**Local:** primary and streaming replica in containers; generate writes with pgbench/sysbench,
observe lag in SQL, first stop/resume the writer with a shell threshold loop.
**CLI:** psql, pgbench, watch, jq, awk, Docker/Podman, tc.
**Useful Go:** token-bucket/admission controller reporting state and acting on replica lag.

**Experiments:** overload writes; pause replica; compare fixed QPS with feedback limiting;
graph throughput versus lag. **Scope:** 1–2 evenings.

Source: https://github.blog/engineering/infrastructure/mitigating-replication-lag-and-reducing-read-load-with-freno/

## 4. GitHub — Sharded, replicated Redis rate limiter

**Core:** application sharding, primary/replica roles, atomic operations, expiration and stale reads.

```text
requests -- hash(user_id) --> Redis A (primary -> replica)
                         \-> Redis B (primary -> replica)
```

**Local:** 2–4 Valkey/Redis instances on separate ports; counters/TTLs; hash keys to shards;
add replicas; Lua for atomic increment-and-expire.
**CLI:** valkey-cli/redis-cli, redis-benchmark, Bash, jq, watch.
**Useful Go:** small shard selector with visible routing. The document suggests an HTTP proxy;
systemscoach should supply HTTP plumbing or use a CLI if HTTP adds no learning value.

**Experiments:** modulo versus rendezvous hashing; count remapped keys after membership changes;
lagging replica reads; naive GET/SET versus atomic Lua. **Scope:** 2–3 evenings.

Source: https://github.blog/engineering/how-we-scaled-github-api-sharded-replicated-rate-limiter-redis/

## 5. Pinterest — Scaling cache infrastructure with Memcached + Mcrouter

**Core:** distributed caching as a routing problem; individual Memcached nodes have no peer knowledge.

```text
                 mcrouter
                /    |    \
         memcached memcached memcached
```

**Local:** several Memcached processes/containers and mcrouter if convenient; populate/inspect key
placement, remove a node, observe remapping and misses.
**CLI:** memcached, mcrouter, nc, telnet, socat, watch, perf, ss.
**Useful Go:** only the routing layer after the manual observation; rendezvous hashing makes
membership changes tangible.

**Experiments:** modulo versus consistent/rendezvous hashing; hot key; node loss; replicated cache
pools; thundering herd after eviction. **Scope:** 2–3 evenings.

Source: https://medium.com/pinterest-engineering/scaling-cache-infrastructure-at-pinterest-422d6d294ece

## 6. Pinterest — Scalable and reliable data ingestion

**Core:** local durable buffering + distributed log + object storage; at-least-once delivery and
idempotent persistence.

```text
app -> append.log -> shipper -> Kafka -> sink -> MinIO
       local buffer            durable log      objects
```

**Local:** append JSON lines; ship via Vector, Fluent Bit, shell tailer or small program to
Kafka/Redpanda; consumer batches files to object storage.
**CLI:** tail, jq, split, sha256sum, Kafka producer/consumer or rpk, mc, wc, sort, uniq.
**Useful Go:** tailer with offsets, retries and intentional duplicates; compact idempotent batch sink.

**Experiments:** stop Kafka while local appends continue; restart shipper; kill sink after upload
but before offset commit; show duplicates; deterministic object names make retries idempotent.
**Scope:** 3–5 evenings.

Source: https://medium.com/pinterest-engineering/scalable-and-reliable-data-ingestion-at-pinterest-b921c2ee8754

## 7. Pinterest — Manas realtime: Kafka as WAL for a derived index

**Core:** a durable ordered log as transport and recovery history; reproducible derived state is disposable.

```text
writes -> Kafka partition -> indexer -> SQLite / inspectable derived index
                 +---------------- replay ------------------^
```

**Local:** create/update/delete events in one Kafka/Redpanda partition; materialize SQLite or files;
delete index and rebuild from offset zero.
**CLI:** rpk/Kafka CLI, sqlite3, jq, sha256sum, time.
**Useful Go:** explicit event struct, materialization and checkpoint; SQLite keeps storage inspectable.
Badger/Pebble could later contrast LSM-backed state.

**Experiments:** replay, duplicates, delete ordering, checkpoint corruption; multiple partitions
and loss of global order. **Scope:** 2–4 evenings.

Source: https://medium.com/pinterest-engineering/manas-realtime-enabling-changes-to-be-searchable-in-a-blink-of-an-eye-36acc3506843

## 8. Pinterest — Sharding Pinterest's MySQL fleet

**Core:** virtual shards separate logical partitions from physical machines and make movement manageable.

```text
id -> logical shard -> shard map -> physical DB
      32 shards                    3 stores
```

**Local:** multiple PostgreSQL databases/schemas or SQLite files; explicit shard-map file/table.
**CLI:** psql/sqlite3, jq/yq, Bash, GNU parallel.
**Useful Go:** router CLI such as `labdb put <id>`, `get <id>`, `move-shard 7 node-b`.
The routing/control logic is the lesson, not an HTTP API.

**Experiments:** physical-node failure; move a virtual shard; direct hash-to-node versus virtual
shards; awkward cross-shard joins/transactions. **Scope:** 3–4 evenings.

Source: https://medium.com/pinterest-engineering/sharding-pinterest-how-we-scaled-our-mysql-fleet-3f341e96ca6f

## 9. GitHub — Partitioning relational databases to handle scale

**Core:** incremental decomposition; vertical partitioning, read replicas, proxies, cutovers and
later horizontal partitioning instead of reflexively replacing SQL.

```text
client -> proxy/router -> cluster A: users
                       -> cluster B: repos/issues
                       -> cluster C: events
```

**Local:** start with several tables in one PostgreSQL instance; move a domain to a second;
HAProxy/PgBouncer or explicit router; replication-backed cutover.
**CLI:** psql, pg_dump/pg_restore, pgbench, HAProxy/PgBouncer, watch.
**Useful Go:** optional workload/router CLI with visible routing table; keep DB operations in psql.

**Experiments:** virtual partition first; dual-read verification; write freeze/cutover;
cross-database coordination cost. **Scope:** 3–5 evenings.

Source: https://github.blog/engineering/infrastructure/partitioning-githubs-relational-databases-scale/

## 10. Stripe — Zero-downtime DocDB data movement

**Core:** online shard movement: snapshot + change capture + verification + cutover.

```text
clients -> source shard --- change log ---> destination shard
                  +---------- snapshot ----------^
                           verify -> cutover
```

**Local:** two PostgreSQL databases; seed, copy snapshot during writes, capture mutations via change
table or logical decoding, apply, compare counts/checksums, switch routing, deregister source.
**CLI:** psql, pg_dump, COPY, pg_recvlogical/logical replication, sha256sum, jq.
**Useful Go:** migration state machine PREPARE -> SNAPSHOT -> CATCH_UP -> VERIFY -> CUTOVER -> CLEANUP;
keep actual data movement in standard tools.

**Experiments:** crash/retry each state; writes during snapshot; checksum mismatch; rollback before
and after cutover. **Scope:** 4–6 evenings.

Source: https://stripe.com/blog/how-stripes-document-databases-supported-99.999-uptime-with-zero-downtime-data-migrations

## 11. Discord — How Discord stores trillions of messages

**Core:** partition-key choice, hot partitions, LSM read amplification, compaction pressure,
bucketing and migration.

```text
messages -> partition(channel_id, time_bucket) -> Cassandra/ScyllaDB
```

**Local:** one ScyllaDB node initially; channel + time-bucket message table; skewed workloads;
tracing/stats and bucket-size comparison.
**CLI:** cqlsh, nodetool, Scylla tools, stress utilities, watch, iostat.
**Useful Go:** controllable Zipf-like popularity workload; concurrency and workload shape are the lesson.

**Experiments:** huge partition versus time buckets; hot channel; compaction pressure; ascending/
reverse scans; optional PostgreSQL comparison. **Scope:** 3–5 evenings. Heavier optional lab.

Source: https://discord.com/blog/how-discord-stores-trillions-of-messages

## 12. Meta — TAO: graph store over MySQL + cache

**Core:** specialize the API around access patterns while retaining proven storage; cache
consistency, sharding, graph adjacency and read-heavy workloads.

```text
client -> object/association API -> cache -> PostgreSQL
                      +--------- shard key --------^
```

**Local:** objects/associations in PostgreSQL; Valkey/Memcached; only object_get, assoc_add and
assoc_range; compare entire adjacency-list caching with smaller ranges.
**CLI:** psql, valkey-cli/Memcached, pgbench, redis-benchmark, jq.
**Useful Go:** a tiny three-operation API/CLI with explicit cache logging; the abstraction itself matters.

**Experiments:** write-through versus cache-aside; stale cache; celebrity/hot object; object-ID
sharding; whole-list versus granular invalidation. **Scope:** 4–6 evenings.

Source: https://engineering.fb.com/2013/06/25/core-infra/tao-the-power-of-the-graph/

## 13. Meta — LogDevice: distributed log

**Core:** separate sequencing from storage; logs as replication, CDC, state-machine and pipeline primitives.

```text
                 sequencer (assign LSN/order)
                    /        |        \
              storage A  storage B  storage C
                    \        |        /
                          readers
```

**Local:** toy append log, not a LogDevice clone. One sequencer assigns increasing LSNs; replicate
entries to 2/3 directories or processes; merge/replay readers by LSN. Start as directories, then
processes/containers.
**CLI:** nc/socat, split, tail, sort, awk, sha256sum, flock.
**Useful Go:** append, sequence assignment, quorum acknowledgement, read-from-LSN; persistence
stays inspectable as JSON or length-prefixed records.

**Experiments:** slow storage node; quorum writes; missing sequence; sequencer restart; truncate/
corrupt replica and reconstruct from peers. **Scope:** 4–6 evenings.

Source: https://engineering.fb.com/2017/08/31/core-infra/logdevice-a-distributed-data-store-for-logs/

## 14. Cloudflare — Durable Objects / SQLite-backed state

**Core:** one stateful owner per logical entity; serialization inside the entity as a counterpoint
to architectures coordinating each operation across replicas.

```text
clients -> router -- hash(object_id) --> owner A -> SQLite
                                     \-> owner B -> SQLite
```

**Local:** three worker processes, hashed account/room IDs, SQLite per owner, serialized commands.
**CLI:** sqlite3, curl, jq, socat, flock, tmux.
**Useful Go:** supplied router/owner plumbing with core keyed mutex or per-object event loop;
SQLite handles persistence so ownership stays central.

**Experiments:** concurrent increments with/without single ownership; ownership transfer; crash
after commit before reply; retry and request-ID deduplication. **Scope:** 3–5 evenings.

Source family: Cloudflare Durable Objects / SQLite-backed architecture write-ups,
https://blog.cloudflare.com/sqlite-in-durable-objects/

## 15. RAMP transactions — fractured-read / coordination tradeoff

**Core:** multi-key atomic visibility differs from serializable isolation; make anomalies visible.

```text
writer T1 -> x=v1 on shard A
          -> y=v1 on shard B (delayed)
reader    -> A and B: may see x=v1, y=v0
```

**Local:** two SQLite files or PostgreSQL schemas representing independent partitions; update
related records, pause between writes, run readers. Then attach transaction metadata and fetch
missing sibling writes on discovery.
**CLI:** sqlite3/psql, tmux, Bash, sleep, jq.
**Useful Go:** optional concurrent workload and tiny RAMP-style client; begin entirely in shell/SQL.

**Experiments:** partial write; concurrent read; retry; metadata overhead; ordinary PostgreSQL
transaction comparison; what guarantees changed. **Scope:** 2–4 evenings.

Background: academic RAMP Transactions work, not a company blog. The supplied document did not
provide a paper URL. Locate and verify the primary paper before authoring; do not claim a naive
second fetch implements the complete RAMP protocol or serializable isolation.

## What the document would actually build

| Tier | Project | Supplied scope | Main return |
| --- | --- | --- | --- |
| A1 | Replication-lag governor | 1–2 evenings | Feedback, admission/backpressure, lag signals; PostgreSQL + pgbench + shell, then Go |
| A2 | Sharded Valkey rate limiter | 2–3 evenings | Sharding, replication, atomicity, TTLs, hot keys, membership |
| A3 | Kafka/Redpanda -> SQLite index | 2–4 evenings | Durable truth versus derived state; delete/rebuild index |
| A4 | Virtual-shard router | 3–4 evenings | 32 logical shards on 3 stores, movement through indirection |
| B1 | Online shard mover | 4–6 evenings | Snapshot + CDC + catch-up + verification + cutover |
| B2 | Git replica coordinator | 3–5 evenings | Three bare repos, quorum, failure and repair |
| B3 | WAL-first Git mini-system | 4–8 evenings | Object store + Git plumbing + small Go replayer; capstone |

## The six-stage lab template from the supplied document

1. Read architecture: identify durable truth, derived state, serialization, partitioning, failure
   boundaries and recovery.
2. Stand up primitives through CLIs and learn the inspection commands.
3. Manually act out one happy-path request, keeping component state visible in tmux.
4. Predict and break it: scoped process pauses/crashes, latency/partitions, owned file loss and duplicates.
5. Add only the smallest useful Go router, sequencer, coordinator, replayer, workload or state machine.
6. Explain invariant, failure, recovery, 10x-scale difficulty and intentional production omissions.
   The original suggests a one-page postmortem; systemscoach makes writing optional.

These stages can span or combine lessons; they do not require six lessons or a separate coding phase.

## Core VM toolbox (candidate tools, not an installation request)

Baseline: PostgreSQL/psql/pgbench, SQLite, DuckDB, Git, tmux, Docker/Podman, Go.

- jq/yq; ripgrep/fd/watch for state and file inspection.
- socat/netcat for visible network boundaries.
- iproute2/tc netem for latency/loss/bandwidth; scoped nftables/iptables for partitions.
- sysstat (iostat/pidstat), procps, strace, lsof, ss for resource/system-call/network evidence.
- Valkey for rate limiting/caching/sharding.
- Kafka or Redpanda for log experiments (the document suggests Redpanda for convenience).
- MinIO-type local S3-compatible storage for WAL/objects.
- Memcached/mcrouter for cache routing.
- ScyllaDB only for the heavier optional partitioning/LSM experiment.

The repository roadmap has existing software defaults. Reconcile those with the selected project's
needs and user choices, verify versions/capabilities, and install only what that agenda requires.

## What to code and what to supply

Good learner logic: rendezvous-hash routing, WAL writing/replay, replication acknowledgement/repair,
workload shape, log sequencing, CDC application, shard-migration state transitions, admission control.

Supply or avoid: HTTP CRUD plumbing, configuration frameworks, custom storage engines, SQL parsers,
dashboards, authentication, generic RPC frameworks and Kubernetes operators. The core systems
decision should remain visible. Go is first choice for necessary project code, Deno second.

## Broader survey themes preserved from the document

- Cursor: Git WAL/object storage and scaling.
- GitHub: Spokes, freno, Redis limiting, partitioning, MySQL/HA, Git storage/serving.
- Meta: TAO, LogDevice, caches, MySQL scaling and data-center/storage infrastructure.
- Pinterest: MySQL sharding, Memcached/mcrouter, ingestion, Manas, streams and databases.
- Discord: Cassandra-to-ScyllaDB and data services.
- Stripe: online DocDB movement, reliability and migration.
- Cloudflare: Durable Objects, SQLite, D1, R2 and coordination.
- Uber: Schemaless, Docstore, Kafka/streams and storage.
- Netflix: EVCache, Kafka/data pipelines, distributed caching/reliability.
- Dropbox: Magic Pocket, metadata and replication.
- Slack: Vitess/MySQL, databases and Kafka/events.
- Shopify: MySQL/Vitess scaling, Kafka pipelines and shard isolation.
- DoorDash: Kafka/CDC, caching, data platform and migrations.
- Airbnb: Kafka/pipelines, scaling and infrastructure.
- LinkedIn: Kafka, Brooklin/CDC and distributed data.
- Spotify: event delivery, Kafka and data architecture.
- Canva: databases, Kafka and data platforms.

The document excluded many candidates needing a Kubernetes fleet, managed cloud services, enormous
data, proprietary systems, GPUs or extensive application scaffolding. Others repeated mechanisms
that smaller candidates could teach more directly.

## Reusable concepts and stopping rule

Durable truth versus derived state; append-only logs/replay; replication/quorum acknowledgement;
eventual consistency/stale reads; virtual shards; consistent/rendezvous hashing; online migration;
CDC; idempotency/duplicates; backpressure; cache invalidation; single ownership; sequencing;
compaction; hot keys/partitions; failure and recovery.

Repeated mechanisms earn their place when a different setting adds a useful distinction. A lab is
finished when you can explain its invariant, force its important failure, recover, and state its
production tradeoff. Ten small meaningful experiments are more useful for this goal than a polished
application whose scaffolding consumes the evenings.
