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
