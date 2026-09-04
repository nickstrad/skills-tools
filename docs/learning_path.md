# CLI-First Systems Engineering Learning Projects

This learning path builds practical systems-engineering intuition through small,
observable experiments. Each project uses a CLI as an interface to a systems
primitive—not as a checklist of syntax to memorize.

The collection is aimed at understanding:

- performant and data-intensive applications;
- databases and storage systems;
- distributed systems;
- Linux infrastructure;
- observability and performance engineering; and
- agent and sandbox infrastructure in the spirit of E2B and Daytona.

Most projects should contain roughly 30–100 lessons. Lessons should minimize
application code and prefer commands, SQL, configuration, shell pipelines,
inspection, benchmarking, process manipulation, failure experiments, and
observation of files, processes, and network activity.

## The lesson pattern

Lessons should generally move through this loop:

```text
command
  ↓
observe state
  ↓
manipulate state
  ↓
inspect internals
  ↓
introduce load or failure
  ↓
explain behavior
  ↓
understand the abstraction
```

The goal is not to become an administrator for every tool or to memorize CLI
flags. The goal is to develop a mental model of what each primitive provides,
how it behaves under load, where its boundaries are, and how it composes with
other primitives.

## Depth and overlap rule

Apply "deep once, contrast thereafter" across the entire learning path. Teach a
systems concept from first principles in the project that exposes it most
clearly, then use later projects to reveal different implementations,
operational boundaries, failure modes, or trade-offs. Matching vocabulary is not
automatically redundant: a later experiment earns its place when it produces
materially different evidence and changes the learner's model.

After two substantially different implementations have separated a general
principle from one product's design, further projects should normally assume the
principle and concentrate on what is new. Do not omit a tool's internals merely
because familiar labels such as transactions, logs, indexes, isolation, resource
limits, or health checks reappear; do avoid another ground-up explanation when
the mechanism and lesson outcome add no meaningful contrast.

## Track 1: Databases, data, and storage

### 1. PostgreSQL — deep project

PostgreSQL should remain one of the deepest projects. Use its full client/server
architecture to understand the machinery behind transactions, concurrency,
durability, and performance.

Progression:

```text
SQL → schemas and catalogs → processes and connections → pages → indexes
→ MVCC → transactions → locking → WAL → query planning → vacuum
→ checkpoints → replication → performance
```

### 2. SQLite — deep project

SQLite provides the contrasting embedded-database design space. Explore how a
local, durable database file supports relational workloads without a database
server.

Progression:

```text
SQL → database files → pages → B-trees → indexes → transactions → locking
→ WAL → query planning → virtual tables → FTS → durability
→ concurrency limitations
```

Keep this architectural comparison in view:

| PostgreSQL                       | SQLite              |
| -------------------------------- | ------------------- |
| Client/server database           | Embedded database   |
| Concurrent multi-process service | Local durable state |

SQLite is the deliberate second implementation for transactional storage, so its
file header, pager, B-tree, rollback-journal, single-writer locking, WAL
sidecar, checkpoint, backup, and recovery experiments are useful contrast, not
duplication. When a lesson revisits a general application pattern already taught
with PostgreSQL, it should assume that concept and concentrate on the different
SQLite mechanism or local/offline operating boundary.

### 3. DuckDB

DuckDB introduces analytical database architecture without requiring another
database server or operational environment. It preserves a convenient “download
a binary, open a CLI, query data” workflow while exposing a fundamentally
different workload.

Explore:

```text
analytical SQL → columnar processing → vectorized execution → aggregation
→ large scans → Parquet → CSV → query plans → predicate pushdown
→ projection pushdown → compression → parallel execution
→ memory management → spilling to disk
```

Create millions of rows and compare point lookups, aggregations, `GROUP BY`,
full scans, and filtered scans in SQLite, PostgreSQL, and DuckDB. Inspect the
plans and behavior of each system.

The important distinction is:

```text
OLTP-style, row-oriented architecture  ↔  OLAP-style, analytical architecture
```

Keep DuckDB compact: roughly 30–36 high-signal lessons. Its primary job is to
teach columnar storage, vectorized and pipelined execution, blocking operators,
memory-bounded algorithms, spilling, scan parallelism, and Parquet layout and
pushdown. Avoid re-teaching shared concepts such as basic SQL, transaction
vocabulary, query-plan terminology, and generic durability principles from first
principles when earlier courses have already established them. This is not a
reason to omit DuckDB internals: use comparative experiments to teach DuckDB's
own storage, concurrency, MVCC, WAL, checkpoint, and index behavior where its
embedded analytical architecture produces a different mechanism, trade-off, or
observable result.

Under this rule, PostgreSQL supplies the deepest treatment of transactional
storage, while SQLite provides the second implementation needed to separate the
general principles from PostgreSQL's design. DuckDB therefore needs only about
4–6 focused experiments on transactions, concurrency, WAL, checkpoints,
recovery, and indexes—enough to expose its architectural boundary, not another
ground-up sequence. As a rough allocation, spend 75% of the course on
distinctive OLAP execution, storage, memory, parallelism, and file-layout
behavior; 15% on those transactional and durability contrasts; and 10% on
cross-engine capstones.

### 4. Redis / Valkey

Use an in-memory data-structure server to understand fast, reusable state and
when it is a better primitive than a relational database.

Explore strings, hashes, lists, sets, sorted sets, expiration, caching, queues,
transactions, pipelines, streams, persistence, replication, coordination, and
clustering.

Later experiments should cover cache invalidation, queues, rate limiting,
ephemeral state, distributed locks, and failure behavior.

### 5. S3 / MinIO

Study object storage as a fundamental systems primitive. Use MinIO locally where
useful so experiments remain practical on a Linux droplet.

Explore `PUT` and `GET`, buckets, object metadata, range requests, multipart
uploads, checksums, versioning, lifecycle, immutability, durability, and
large-object handling.

Develop intuition for architectures such as:

```text
compute → local cache → object storage

PostgreSQL metadata ──→ S3 objects
```

Object storage is neither a filesystem nor a relational database. Focus on why
modern systems separate compute, metadata, and durable bulk storage.

## Track 2: Linux and performance

### 6. Linux systems CLI — very deep project

This should be one of the largest projects. Treat Linux as the substrate
underneath the other tools, not merely as an administration course.

Useful interfaces include:

```text
ps  pstree  /proc  lsof  lsns  free  vmstat  iostat  ip  ss
mount  findmnt  ulimit  nice  taskset  kill
```

Progress from processes to virtual memory, file descriptors, files, sockets,
signals, scheduling, filesystems, devices, namespaces, and resource management.

### 7. strace

Expose the boundary between userspace programs and the kernel. Start with:

```sh
strace ls
```

Then trace SQLite, DuckDB, and PostgreSQL workloads:

```sh
strace sqlite3 test.db
strace -e trace=file ...
strace -e trace=network ...
strace -p <postgres-pid>
```

Use the following model when interpreting traces:

```text
application → system calls → Linux kernel → filesystem / VM / network / devices
```

### 8. fio

Build physical intuition for storage performance by comparing sequential and
random reads and writes, block sizes from 4 KiB through 1 MiB, queue depth, and
synchronous versus asynchronous behavior.

Measure IOPS, throughput, latency, and tail latency. Connect the results to
SQLite pages, PostgreSQL’s 8 KiB pages, WAL, database scans, random index
access, checkpoints, and DuckDB analytical scans.

### 9. perf

Learn where CPU time goes: utilization, cycles, instructions, context switches,
cache behavior, profiling, hotspots, and call stacks. Prefer real workloads from
the database projects, and eventually profile PostgreSQL, SQLite, DuckDB, and
Redis.

### 10. bpftrace

Move from process-level observation to dynamic Linux and kernel observability.
Progress through syscalls, kernel functions, scheduling, block I/O, TCP, latency
distributions, and process behavior.

The conceptual progression is:

```text
strace → perf → bpftrace
```

Use bpftrace to investigate the databases and services introduced earlier.

## Track 3: Isolation and agent infrastructure

### 11. Docker

Learn containers while progressively exposing the Linux abstractions Docker
provides. Explore images, layers, containers, processes, volumes, networking,
resource limits, namespaces, and cgroups.

Useful commands include:

```text
docker run     docker ps       docker inspect   docker exec
docker logs    docker stats    docker network  docker volume
docker history
```

Connect Docker’s abstractions back to Linux directly in later lessons.

Make Docker a moderately deep project of roughly 30–45 lessons. Concentrate on
what systemd and Kubernetes do not teach directly: reproducible image builds,
content-addressed layers, registries, container creation, namespace composition,
OverlayFS copy-on-write behavior, local bridge networking, and the lifecycle of
bind mounts, volumes, and ephemeral container state. Resource controls and
restart behavior should point back to Linux and forward to Kubernetes rather
than becoming three separate treatments of the same mechanism.

### 12. Linux networking

Use `ip addr`, `ip link`, `ip route`, `ip neigh`, `ip netns`, `ss`, `bridge`,
and `tc` to progress through interfaces, routing, network namespaces, veth
pairs, bridges, TAP devices, NAT, and traffic shaping.

Eventually construct networks manually with namespaces and veth pairs. This is
foundational for sandbox infrastructure.

### 13. nftables

Use `nft` to explore packet filtering, forwarding, NAT, connection tracking,
workload isolation, and egress policy. Connect these ideas directly to
containers, sandbox networking, and microVM networking.

### 14. systemd

Use `systemctl`, `journalctl`, and `systemd-run` to study service lifecycle,
supervision, dependencies, logging, restart behavior, environment, and resource
controls.

Operate services from the other projects with systemd rather than treating this
as an isolated administration course.

Keep systemd focused at roughly 12–18 experiments. The target is host-level
systems intuition—process supervision, signals, readiness notification,
watchdogs, restart backoff, boot and shutdown ordering, cgroup resource control,
managed state directories, and service hardening—not broad systemd
administration. Prefer breaking and recovering a real stateful service from an
earlier course so the material complements Docker and Kubernetes.

### 15. Firecracker — advanced / later

Do not begin with Firecracker. Build the required foundation first:

```text
Linux processes
  ↓
namespaces
  ↓
cgroups
  ↓
Linux networking
  ↓
TAP / veth
  ↓
nftables
  ↓
Firecracker
```

Then explore microVM lifecycle, kernel and rootfs setup, the API, virtual
devices, networking, storage, snapshots, and fast restoration. The ultimate goal
is to understand the primitives behind fast isolated agent and code sandboxes.

### 16. Kubernetes — later

Use `kubectl` to study Kubernetes as a distributed control system rather than
primarily as a deployment tool.

Progress through pods, desired state, scheduling, health, resources, networking,
storage, controllers, reconciliation, and failure/recovery. Relate each
abstraction back to the Linux and container concepts learned earlier.

Make Kubernetes a later, deep project of roughly 60–80 lessons, after the
learner has practical grounding in Linux processes, namespaces, cgroups, Docker,
Linux networking, nftables, storage, and systemd. Understand etcd's role in the
control plane before going deeply into cluster failure and recovery; completing
the etcd project first is preferable when scheduling permits. Avoid using
Kubernetes to reteach image construction or single-host process supervision. Its
unique focus is multi-node desired-state reconciliation, scheduling and
placement, service discovery, rollout control, persistent-volume orchestration,
policy, controller design, and failures that cross node or control-plane
boundaries.

## Track 4: Distributed systems

### 17. etcd

Make etcd one of the highest-value CLI-first distributed-systems projects. Use
`etcdctl` to explore KV operations, revisions, watches, transactions, leases,
ephemeral state, cluster membership, leader election, quorum, Raft, and failure
behavior.

Run multiple nodes and deliberately kill nodes, kill leaders, restart members,
and lose quorum. Observe what the CLI reveals about consensus.

### 18. NATS

Use the NATS CLI to build a lightweight understanding of messaging. Progress
through pub/sub, subjects, request/reply, queue groups, JetStream, streams,
consumers, persistence, and delivery semantics.

### 19. Kafka / Redpanda

Introduce this after basic messaging concepts are comfortable. Explore topics,
logs, partitions, offsets, producers, consumers, consumer groups, ordering,
retention, replication, leader/follower behavior, and failures.

The objective is understanding the distributed-log abstraction, not learning
Kafka administration for its own sake.

## Optional, lower-priority project

### Git internals

A compact project of roughly 25–40 lessons can use Git as a case study in
immutable and content-addressed storage. Explore:

```text
blob → tree → commit → content hashing → refs → packfiles
→ garbage collection → fetch / push
```

The value is understanding the storage model, not memorizing Git commands.

## Recommended sequence

This is a rough sequence, not a strict dependency graph. Later projects should
increasingly cross-reference and reuse earlier projects.

| Stage                      | Projects                                                  |
| -------------------------- | --------------------------------------------------------- |
| Current                    | PostgreSQL, SQLite                                        |
| Next foundation            | Linux systems CLI, strace, Redis / Valkey, Docker         |
| Performance and data       | Linux networking, fio, DuckDB, S3 / MinIO, perf, bpftrace |
| Distributed systems        | etcd, NATS, Kafka / Redpanda                              |
| Infrastructure composition | nftables, systemd, Kubernetes, Firecracker                |

## Why DuckDB before ClickHouse?

Prefer DuckDB at this stage. It teaches the analytical database abstraction
without introducing unnecessary operational complexity. The resulting
three-database progression is especially useful:

```text
                  PostgreSQL
              client/server OLTP
                       │
                       │
SQLite ────────────────┼──────────────── DuckDB
embedded OLTP-ish                         embedded OLAP
local relational                           analytical engine
```

All three can be explored extensively from a Linux droplet using SQL and CLI
experiments. A particularly valuable exercise is to run the same workload in
SQLite, PostgreSQL, and DuckDB, inspect each system, and explain why the results
differ.

ClickHouse can follow later:

```text
DuckDB
  ↓
understand columnar and OLAP concepts
  ↓
ClickHouse
  ↓
apply those ideas to a server-oriented, large-scale analytical system
```

## Cross-project reuse is required

Later projects should reuse earlier tools whenever that makes an experiment more
explanatory. Examples include:

- trace SQLite, PostgreSQL, and DuckDB with `strace`;
- use `fio` to explain database I/O behavior;
- use `perf` to compare SQLite, DuckDB, and PostgreSQL execution;
- use `bpftrace` to observe database I/O and networking;
- inspect Docker with Linux process and network commands;
- reproduce portions of Docker networking with `ip`, `netns`, and veth;
- use nftables to isolate workloads;
- operate Redis, PostgreSQL, and etcd with systemd;
- kill etcd, NATS, and Kafka nodes and observe recovery;
- use DuckDB to analyze generated logs, metrics, and data;
- store durable bulk data in S3 / MinIO.

The long-term composition is:

```text
Linux
 + processes
 + cgroups
 + namespaces
 + networking
 + nftables
 + storage
 + Firecracker
```

This composition should make agent sandbox infrastructure understandable as a
set of concrete primitives rather than a black box.

## The ultimate learning direction

Every project should move approximately through:

```text
USE
 ↓
INSPECT
 ↓
UNDERSTAND
 ↓
MEASURE
 ↓
STRESS
 ↓
BREAK
 ↓
OBSERVE FAILURE
 ↓
EXPLAIN TRADE-OFFS
 ↓
COMBINE WITH OTHER PRIMITIVES
```

The desired outcome is not “I know a lot of CLI commands.” It is:

> I have a mental toolbox of systems primitives. I understand what each
> primitive provides, approximately how it works, its performance
> characteristics, where its boundaries are, how it fails, and when I would
> compose it with other primitives to design a system.
