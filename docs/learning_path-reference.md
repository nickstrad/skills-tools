# Learning path reference notes

The concise [learning path](learning_path.md) is authoritative for topic order and the current
Go follow-up menu. These supporting notes retain detailed research, software choices and design
constraints from the earlier roadmap. Topic numbers below identify the reference catalog, not
a second learning sequence. Historical source checks retain their original dates.

The [44-lesson Linux v2 outline](../future-courses/linux-v2/course.md) is now proposed alongside the
existing Linux reference course. The current short-session teaching contract and project/tool
choices discussed with Nick take precedence over older broad workload examples below.

## Local labs and software choices

Prefer a Linux machine or VM with local binaries, private data directories, and explicit ports.
A remotely accessed Linux VM is still a suitable local-services lab: exercises should not require
managed cloud databases, cloud object storage, billing configuration, or provider provisioning.
Use the learner's existing Docker Compose and Kubernetes familiarity to make labs repeatable.
Keep kernel experiments on a suitable Linux host rather than assuming every container exposes
the needed facilities. Use kind when a disposable local cluster is useful; a simple binary or
Compose setup is sufficient when Kubernetes would add no explanatory value.

| Role | Default software | Scope boundary |
| --- | --- | --- |
| Transactional and analytical storage | PostgreSQL, SQLite, DuckDB CLIs | Keep the distinct architectures; use the same small workloads for comparisons. |
| In-memory shared state | Valkey server + valkey-cli | One implementation for the Redis/Valkey slot; Redis is an optional later comparison. |
| Object storage | SeaweedFS local S3 endpoint, initially weed mini | Learn the object API and publication protocols; defer SeaweedFS's other subsystems. |
| Messaging | NATS server + NATS CLI, including JetStream | One messaging foundation; make delivery and external effects explicit. |
| Coordination | etcd + etcdctl | Start with one member, then a bounded three-member local lab with separate state and ports. |
| Service lifecycle and packaging | Docker + Compose; Kubernetes when useful | Assume routine usage; investigate process lifecycle, isolation, and application readiness. |
| Network investigation | iproute2, nftables, ss, tcpdump, curl, dig, OpenSSL | Add a small nginx reverse-proxy exercise; do not create a second broad administration course. |
| Measurement | Supplied bounded load driver, native counters, strace, fio, perf | Reuse tools across courses; bpftrace is a later optional workshop. |
| Orchestration and deeper study | Kubernetes with kind + kubectl | Usable from the outset; teach unfamiliar internals and failure behavior rather than deployment basics. |
| Sandbox branch | Firecracker | Requires a Linux environment with usable KVM; verify before scheduling the branch. |
| Partitioned-log branch | Apache Kafka local lab | Use one implementation; Redpanda is an optional contrast, not another mandatory course. |

These are curriculum defaults, not an instruction to install every service up front. Pin versions
or image digests when authoring runnable labs and test the exact capabilities an experiment needs.
Keep the service count, dataset, runtime, and failure scope bounded. Multiple processes or
containers on one host can expose protocol failures; they do not establish independent-machine
availability or cloud durability. Keep provider-specific behavior as an optional comparison only
when it answers a concrete question that the local lab cannot.

Selection references checked 2026-09-04: [Valkey quick start](https://valkey.io/topics/quickstart/),
[SeaweedFS quick start](https://github.com/seaweedfs/seaweedfs#quick-start),
[nginx proxy introduction](https://nginx.org/en/docs/beginners_guide.html),
[kind](https://kind.sigs.k8s.io/), and [Kafka local quickstart](https://kafka.apache.org/quickstart/).
The object-storage and Firecracker sections below record the important selection constraints.

## The lesson pattern

Each lesson is one complete, concise unit:

```text
short mechanism explanation
  ↓
labelled terminal diagram when useful
  ↓
setup + commands that cause the behavior
  ↓
expected evidence + how to inspect it
  ↓
interpretation + limits
  ↓
cleanup
```

The diagram belongs before commands when it clarifies state transitions, ownership, timelines,
page/tree layouts, contention, or log/checkpoint flow. It needs labels and a prose connection to the
evidence; plain text must carry the meaning and ANSI colour is optional. The lesson itself provides
all required context. External reading and deeper variations are optional.

## Bound the route before implementation

Nick completes current PostgreSQL Essentials lessons in roughly ten minutes while studying around
parenting and a full-time job. Prefer a fixed, short route whose lessons each expose one meaningful
mechanism or decision. Do not copy a reference course's size, split a coherent experiment merely to
inflate the count, or build a broad survey around a tool with one narrow contribution.

A future-course plan records only the scope, assumed knowledge, ordered lesson titles, mechanism and
outcome of each lesson, decisive evidence, major safety boundaries, and final capability. It does
not require finished syntax, application scaffolding, module stubs, lab allocation, or validation
infrastructure. Once the direction is agreed, implement and validate a small batch at a time.

Supply complete commands and definitions for unfamiliar mechanisms even late in a route. Optional
predictions and variations may deepen the experiment, but they are not separate learner stages.
Application scaffolding earns a place only when it exposes a boundary the CLI cannot. The shared
interface is `tutor <course> <number> lesson|done`, with `tutor <course> lesson` for the next
unfinished lesson. `tutor <course> route` labels completed, available, and planned entries and can
display a valid plan-only route without creating progress. There is no mandatory review, pause,
checkpoint, homework, or answer submission; only explicit `done` records completion. Detailed
authoring and presentation rules live in
[`curriculum-tools/docs/AUTHORING.md`](../curriculum-tools/docs/AUTHORING.md).

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

### 1. PostgreSQL — essentials route with a deep reference

**Current direction, 2026-09-12:** PostgreSQL Essentials retains its fixed 40-lesson route and has
26 authored lessons. Its original 20–30 minute labels were author estimates; Nick reports roughly
ten minutes per current lesson. The
[route and intended outcomes](../curriculum-tools/courses/postgres-essentials/PLAN.md) remains the
scope contract, and the original 92-lesson course remains optional reference material.

`pgcoach` opens Essentials by default. `pgcoach NUMBER lesson` now contains the concepts, useful
terminal diagram, commands, expected evidence, interpretation, and cleanup in one output; only
`pgcoach NUMBER done` records completion. Older `review`, `full`, and `start` spellings are hidden
compatibility aliases for `lesson`, not separate stages.

Possible architecture reference: [On building scalable control planes](articles/scalable-control-planes.md)
connects this project's replication, freshness, write-capacity, and recovery questions to service
behavior. Use it to motivate selected experiments, without adding a managed database dependency.

Progression:

```text
SQL → schemas and catalogs → processes and connections → pages → indexes
→ MVCC → transactions → locking → WAL → query planning → vacuum
→ checkpoints → replication → performance
```

### 2. SQLite — concise contrasting route

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

The [control-plane article note](articles/scalable-control-planes.md) can motivate a measured
deployment-boundary decision. Application experience with SQLite does not replace this course's
pager, journal, locking, and recovery evidence.

The proposed implementation is the fixed 32-lesson
[`future-courses/sqlite/course.md`](../future-courses/sqlite/course.md) route. The existing
54-lesson SQLite course remains validated reference material and is not silently rewritten or used
to transfer progress. The future plan itself does not authorize scaffolding or a full build.

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

Keep DuckDB compact and high-signal. Its primary job is to
teach columnar storage, vectorized and pipelined execution, blocking operators,
memory-bounded algorithms, spilling, scan parallelism, and Parquet layout and
pushdown. Avoid re-teaching shared concepts such as basic SQL, transaction
vocabulary, query-plan terminology, and generic durability principles from first
principles when earlier courses have already established them. This is not a
reason to omit DuckDB internals: use comparative experiments to teach DuckDB's
own storage, concurrency, MVCC, WAL, checkpoint, and index behavior where its
embedded analytical architecture produces a different mechanism, trade-off, or
observable result.

Under this rule, PostgreSQL supplies the deepest treatment of transactional storage, while SQLite
provides the second implementation needed to separate the general principles from PostgreSQL's
design. DuckDB needs only a small bounded set of transaction, concurrency, WAL, checkpoint,
recovery, and index contrasts—enough to expose its architectural boundary, not another ground-up
sequence. Spend most of its route on distinctive OLAP execution, storage, memory, parallelism, and
file-layout behavior.

### 4. Valkey

Use an in-memory data-structure server to understand fast, reusable state and
when it is a better primitive than a relational database.

Use Valkey as the default implementation, with Redis only as an optional comparison. Build a
bounded standard project around data structures, memory overhead, expiration, eviction, cache
invalidation, stampedes, atomic operations, pipelines, rate limiting, persistence, and replication
failure. End with a measured decision about which state may be cached, lost, or reconstructed.

Queues, streams, and distributed locks can provide focused contrasts. Put the deepest delivery
semantics sequence in NATS and coordination in etcd. Avoid three ground-up treatments of the same
application protocol; retain a Valkey experiment when its mechanism or failure boundary differs.

### 5. Object storage — local S3-compatible lab

Study object storage as a fundamental systems primitive. Default to SeaweedFS's local S3 endpoint;
its documented `weed mini` command starts the lab from one binary. Restrict the project to object
storage rather than touring the surrounding filesystem, catalog, or cluster features.
[SeaweedFS quick start](https://github.com/seaweedfs/seaweedfs#quick-start).

MinIO was the learner's example of the desired local experience. Its community repository was
archived on 2026-04-25 and states that it is no longer maintained, so it is not the default for a
new course. Reassess software at implementation time rather than building the curriculum around
an unmaintained dependency. [MinIO repository](https://github.com/minio/minio).

Start with `PUT` and `GET`, buckets and keys, metadata, range requests, multipart uploads,
checksums, retries, and immutable payloads. Then investigate publication through a manifest,
conditional updates, and the database/object-store commit boundary. Add versioning, lifecycle,
and retention experiments only after verifying support in the pinned backend. API compatibility
does not by itself establish the consistency, conditional-write, or durability guarantees a
protocol needs. Keep AWS-specific identity, storage classes, and operations optional.

Develop intuition for architectures such as:

```text
compute → local cache → object storage

PostgreSQL metadata ──→ locally stored objects
```

Object storage is neither a filesystem nor a relational database. Focus on why
modern systems separate compute, metadata, and durable bulk storage.

The learner's [Cursor article note](articles/cursor-git-at-any-scale.md) is a motivating reference
for connecting database principles to another domain. Use its questions to inspire small local
experiments; a Git hosting implementation is not a prerequisite for understanding object storage.

## Track 2: Linux and performance

Linux internals remain worthwhile within bounded routes. The four diagnostic tools below are focused workshops, introduced when a
workload needs them and reused thereafter. Do not make four long standalone courses compulsory.
Every workshop should end with a diagnosis or measured decision about a familiar workload.

### 6. Linux systems CLI

Treat Linux as the substrate underneath the other tools, not merely as an administration course.
Select bounded routes around mechanisms the learner has not already established through reading or
production experience.

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
Valkey.

### 10. bpftrace

Move from process-level observation to dynamic Linux and kernel observability.
Progress through syscalls, kernel functions, scheduling, block I/O, TCP, latency
distributions, and process behavior.

The conceptual progression is:

```text
strace → perf → bpftrace
```

Use bpftrace to investigate the databases and services introduced earlier. Keep it optional until
an investigation benefits from its visibility. Verify tracing and performance-counter access on
the lab host; a denied capability is an untested mechanism, not a successful experiment.

### Measurement discipline across projects

Teach measurement alongside workloads, beginning with databases and revisiting it for services.
Use a supplied bounded load driver and native counters before adding more infrastructure. Distinguish
offered load, completed work, errors, queue depth, and latency distributions; count timeouts and
retries rather than hiding them inside a successful-request percentile. Explain when a client that
waits for each response reduces offered load as the service slows and masks overload.

Control one meaningful variable, record workload and resource budgets, separate warm-up from
measurement, and compare instrumented with uninstrumented runs where tracing may change behavior.
Introduce a small metrics collection and correlation exercise within a synthesis project. A large
dashboard, tracing, or monitoring platform is not required. The final evidence should identify a
bottleneck, a bounded intervention, and whether useful throughput or latency actually improved.

## Track 3: Isolation and agent infrastructure

### 11. Docker — focused internals workshops

The learner is familiar with Docker and has implemented Docker-backed software. Use focused
internals workshops. Assume routine build/run/exec/logs,
container CRUD, API-client wiring, and basic lifecycle concepts. Provide a brief reminder when an
experiment needs one; do not infer completion of existing lessons from this experience.

Use a focused set of selected internals experiments instead: image and writable-layer accounting,
OverlayFS copy-up, mount propagation, namespace composition, PID 1 and descendant cleanup, cgroup
throttling/OOM evidence, and network policy boundaries. Choose only mechanisms the learner cannot
yet explain from evidence. Basic limit-setting or an API call succeeding is not enough to show
what the kernel enforces under contention or failure.

Include a small containerd/OCI runtime investigation when it clarifies the distinction between
an image, runtime task, process, and Pod sandbox. It is an optional bridge to Kubernetes/runtime
internals, not a new mandatory course in another container CLI. Connect the measurements to Linux
directly; keep unseen details fully explained even when commands look familiar.

Entry-point reference: [KCNA and prior experience](articles/kcna-reference.md). Use it together with
the source review to avoid repeating container and deployment introductions.

### 12. Networking, including application requests

Use the request path to diagnose gaps: DNS resolution, TCP establishment and closure, HTTP, TLS verification,
connection reuse, timeouts, and retries. Use `dig`, `ss`, `tcpdump`, `curl`, and OpenSSL to distinguish
name-resolution, connection, certificate, and application failures. Add a bounded nginx
reverse-proxy lab with a supplied configuration and local test certificates, covering upstream
failure and timeout propagation without requiring a public domain or cloud certificate service.
Compress familiar application-networking and proxy setup; prioritize actual packet paths,
connection tracking, namespace boundaries, failure injection, and measured timeout behavior.

Use `ip addr`, `ip link`, `ip route`, `ip neigh`, `ip netns`, `ss`, `bridge`,
and `tc` to progress through interfaces, routing, network namespaces, veth
pairs, bridges, TAP devices, NAT, and traffic shaping.

Eventually construct networks manually with namespaces and veth pairs. This is
foundational for sandbox infrastructure.

### 13. nftables — part of the networking progression

Use `nft` to explore packet filtering, forwarding, NAT, connection tracking,
workload isolation, and egress policy. Connect these ideas directly to
containers, sandbox networking, and microVM networking.

Teach this immediately after routes and namespace networks, before the Docker networking synthesis.
It belongs in the same learning progression as networking, not a disconnected late firewall course.
Use owned namespaces for failure injection and filtering so experiments do not disrupt host access.

### 14. Firecracker — advanced / later

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

This is the preferred early specialization for sandbox interests once the Linux and networking
prerequisites are comfortable. Kubernetes, Kafka, and the analytical pipeline are not prerequisites.
Firecracker requires access to `/dev/kvm`; check the host before scheduling this work and use a
suitable Linux machine or VM with supported virtualization access.
[Firecracker prerequisites](https://github.com/firecracker-microvm/firecracker/blob/main/docs/getting-started.md).

Optional design connection: the [control-plane article note](articles/scalable-control-planes.md)
suggests distinguishing guest execution from management-path availability in a bounded lab.

### 15. Kubernetes — experienced-user path

Use `kubectl` to study Kubernetes as a distributed control system rather than
primarily as a deployment tool.

Assume routine kubectl, manifests, Pods, Deployments, Services, and shipping applications.
KCNA and roughly seven years of production use make another introductory deployment course
unnecessary. Kubernetes is available as a lab environment immediately; deeper study can proceed
alongside Linux and databases, with prerequisites scoped to the mechanism being investigated.
Use kind for disposable experiments. [kind documentation](https://kind.sigs.k8s.io/).

There is still substantial material worth learning: reconciliation under stale observations,
resource-version conflicts, watch recovery, deletion/finalizers, scheduling and admission versus
live usage, kubelet/runtime boundaries, readiness and termination ordering, CNI packet paths,
storage attachment, and node/control-plane failure. Use a short evidence-based discussion to
select unfamiliar topics rather than presume mastery or repeat basics. Learn etcd before deep
control-plane storage and recovery experiments. A custom manager/worker implementation supplies
useful vocabulary, but does not establish knowledge of Kubernetes's particular mechanisms.

Keep deep optional investigations without a fixed 60–80-lesson prerequisite. Reuse lifecycle and
resource experiments from Linux and Docker as contrasts. Local cluster evidence does not establish
independent-host failure tolerance.

Related references: [KCNA](articles/kcna-reference.md) calibrates the entry point;
[On building scalable control planes](articles/scalable-control-planes.md) supplies optional
questions about ongoing workload availability, management dependencies, and recovery.

## Track 4: Distributed systems

### 16. etcd

Make etcd one of the highest-value CLI-first distributed-systems projects. Use
`etcdctl` to explore KV operations, revisions, watches, transactions, leases,
ephemeral state, cluster membership, leader election, quorum, Raft, and failure
behavior.

Run multiple nodes and deliberately kill nodes, kill leaders, restart members,
and lose quorum. Observe what the CLI reveals about consensus.

Use separate local member directories and ports, then controlled network isolation for partition
experiments. Keep the course focused on coordination and the application's responsibility to
enforce ownership; a lease demonstration alone does not prove an external resource is fenced.

Use the [control-plane article note](articles/scalable-control-planes.md) when comparing unavailable
coordination with the behavior of already-running workloads. Keep the experiment local and bounded.

### 17. NATS

Use the NATS CLI to build a lightweight understanding of messaging. Progress
through pub/sub, subjects, request/reply, queue groups, JetStream, streams,
consumers, persistence, and delivery semantics.

Use NATS server and CLI locally. Make the contrast between transient Core NATS delivery and
JetStream persistence/replay explicit. End with a slow-consumer and lost-ack investigation that
measures backlog, redelivery, and actual receiver effects. [JetStream documentation](https://docs.nats.io/concepts/jetstream).

This is the main messaging foundation. Reuse PostgreSQL's retry and idempotency knowledge when
testing the separate database and broker commits; a broker delivery guarantee does not establish
exactly-once effects in an external database.

### 18. Apache Kafka — optional partitioned-log branch

Introduce this after basic messaging concepts are comfortable. Explore topics,
logs, partitions, offsets, producers, consumers, consumer groups, ordering,
retention, replication, leader/follower behavior, and failures.

The objective is understanding the distributed-log abstraction, not learning
Kafka administration for its own sake.

Choose Apache Kafka as the default local implementation if this branch is taken, following its
[local quickstart](https://kafka.apache.org/quickstart/). Redpanda is an optional implementation
contrast. Do not require both. After NATS, justify the branch through partition-level ordering,
consumer-group redistribution, retention/replay, and replication tradeoffs. Introduce multiple
brokers only when the experiment needs them; keep production administration outside the core.

## Optional, lower-priority project

### Git internals

A focused optional study can use Git as a case study in
immutable and content-addressed storage. Explore:

```text
blob → tree → commit → content hashing → refs → packfiles
→ garbage collection → fetch / push
```

The value is understanding the storage model, not memorizing Git commands.

The [Cursor article note](articles/cursor-git-at-any-scale.md) can motivate a final comparison
between a local storage format and a service architecture. The learner's interest in the article
does not require expanding Git into another deep prerequisite course.

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
- operate Valkey, PostgreSQL, and etcd as local processes or containers;
- kill etcd, NATS, and Kafka nodes and observe recovery;
- use DuckDB to analyze generated logs, metrics, and data;
- store bulk data in the local S3-compatible object store and test publication and recovery.

### Selected cross-system experiments

These are planned synthesis exercises. Run them incrementally with supplied scripts and small
workloads; each new component must expose a boundary worth investigating. The lesson supplies the
needed explanation and commands. Keep the focus on the invariant, measurements, recovery evidence,
and design decision rather than a large application codebase.

The learner already owns scheduler and sandbox projects. These exercises must earn their place
through a new, bounded correctness or performance question. Supply the workload; do not require
rebuilding those projects, importing them into this repo, or replacing the curriculum with their
roadmaps. Basic worker dispatch, container CRUD, and a generic reconciliation demonstration may be
omitted when already familiar. Preserve only the cross-system behavior the learner still needs
to investigate.

| Project | Starting point and extension | Required final evidence |
| --- | --- | --- |
| Worker commit/delivery boundary | Use a supplied PostgreSQL worker with Docker Compose. Optionally use kind to examine Pod termination or rescheduling. Add NATS after messaging foundations to expose independent broker/database commits. | Reconcile an unknown commit, replay delivery without duplicating the specified receiver effect, recover abandoned work after worker death, and bound retries and overload. Record actual useful completions and backlog. |
| Local analytical pipeline | After DuckDB and object storage, export a small relational dataset to Parquet, publish it locally, and query it with DuckDB. | Compare file sizes and layouts; interrupt publication; detect missing objects; prove which dataset version readers see; restore a usable published dataset. Report query work and elapsed time with stated cache conditions. |
| Isolation failure investigation | Use supplied process trees and traffic probes in familiar containers. Select unfamiliar Linux resource/network behavior, then optionally contrast it with Firecracker. No runtime adapter or control-plane implementation is required. | Demonstrate bounded CPU/memory use, permitted and denied traffic, termination of the owned process tree, resource cleanup, and a subsequent successful job. Distinguish a resource limit from an isolation guarantee. |

The analytical pipeline can use the [Cursor article insights](articles/cursor-git-at-any-scale.md)
to motivate a publication or reconstruction question. Treat the local protocol as a separately
specified exercise, not a reproduction of Cursor's production guarantees. Git internals can remain
optional while object storage contributes to a meaningful system.

The [scalable control-plane note](articles/scalable-control-planes.md) can guide the worker
experiment's acknowledgment and management-dependency questions. Select a bounded excerpt only
when it adds to the learner's existing orchestration experience.

For a future database-course revision, the separate
[Linux/database integration proposal](knowledge/linux-database-integration.md) identifies where
Linux observations could enter database lessons and how the existing Linux course would adapt.
It is a proposal, not a current lesson migration or progress policy.

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
