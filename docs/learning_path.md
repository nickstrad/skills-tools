# Systems learning path

Updated 2026-09-12. Focus: databases and distributed systems, supported by useful Linux foundations.
Continue PostgreSQL now; bring in Linux observations as needed, then study SQLite. Return for deeper
Linux/container work before progressing through networking, Valkey, DuckDB, object storage, NATS and etcd.

The Go follow-ups are **optional project choices**, not extra course requirements. Pick one after
the relevant topic, using earlier lessons where helpful. Aim for **30–60 minutes in 2–4 short sessions**
with supplied setup: one mechanism, one failure or race, and one result to verify. These are planning
estimates, not tested timings. Setup-heavy branches assume their labs are already ready.

Keep projects to tiny datasets and a few local processes. Extend supplied Go fixtures rather than
building complete platforms. Early projects exercise local boundaries used by distributed systems;
later ones connect services. They do not establish independent-machine fault tolerance.

Discuss the approach and scope before creating a selected project. Use Go for these follow-ups,
including PostgreSQL projects; this does not change the existing pgcoach lesson-script convention.
All projects below are proposals, not claims of authored or validated exercises.

## Main path

Linux is a companion track, not a prerequisite to finish before PostgreSQL. The remaining topics
follow the order below. Docker can package labs from the start; its section is the later internals pass.

### Linux foundations and resource management

**Tool:** Linux CLI tools expose processes, files, memory, sockets and isolation.

**Course / goals:** Study ownership, lifetime, resource budgets and namespace views; learn to connect symptoms to scoped evidence. Use foundations alongside databases and deeper resource work afterward. [44-lesson v2 proposal](../future-courses/linux-v2/course.md).

```text
client -> worker -> files / sockets
            |
         CPU + memory budget
```

**Potential Go follow-ups — choose one:**

- **Bounded fan-out:** cap a supplied Go launcher's concurrency; verify useful progress and complete child cleanup.
- **Pipe backpressure:** pause a Go consumer; observe its producer stall and recover without unbounded buffering.
- **Log handoff:** add reopen support to a supplied Go worker; prove rotation releases the deleted log.

### PostgreSQL

**Tool:** A client/server relational database with MVCC, WAL, indexes and replication.

**Course / goals:** Build depth in transactions, storage, recovery and query behavior; reason about concurrency, retries and durable outcomes. [40-lesson route](../curriculum-tools/courses/postgres-essentials/PLAN.md), with 26 authored.

```text
request -> COMMIT -> reply lost
retry   -> operation ID -> existing result
```

**Potential Go follow-ups — choose one:**

- **Retryable command:** drop a post-commit response; retry with an operation ID and verify one database effect.
- **Reservation race:** let two Go clients compete for one item; enforce and check the inventory invariant.
- **Recoverable claim:** kill a worker after claiming a row; reclaim it and reject results from its stale generation.

### SQLite

**Tool:** An embedded relational database accessed through local files.

**Course / goals:** Contrast PostgreSQL with application-owned transactions, single-writer concurrency, WAL/checkpoints and recovery. [32-lesson Essentials proposal](../future-courses/sqlite/course.md).

**Potential Go follow-ups — choose one:**

- **Durable HTTP outbox:** restart a Go sender after a lost acknowledgment; replay IDs safely to a supplied deduplicating collector.
- **Restartable feed client:** commit each applied update and cursor together; crash between batches and resume.
- **Writer admission:** compare two competing writers with a bounded Go gateway to one local SQLite file.

### Docker / container internals

**Tool:** A container runtime and image workflow built on Linux isolation and resource controls.

**Course / goals:** Connect writable layers, volumes, process lifetime and limits to application behavior. Skip routine Docker usage; investigate unfamiliar internals.

**Potential Go follow-ups — choose one:**

- **Commit during shutdown:** terminate the earlier Go/PostgreSQL service during a request; reconcile the client's uncertain result.
- **State after recreation:** compare a Go service's writable-layer and volume-backed state after container recreation.

### Networking and application requests

**Tool:** Linux networking plus iproute2, ss, tcpdump, curl, dig, OpenSSL and a small nginx fixture.

**Course / goals:** Trace DNS, TCP, TLS and HTTP failures; understand deadlines, retries, connection reuse and packet paths.

**Potential Go follow-ups — choose one:**

- **Deadline relay:** propagate one total deadline through a Go proxy to a delayed upstream; verify cancellation.
- **Retry budget:** inject lost responses into the earlier operation-ID service; bound attempts and count actual effects.
- **Stale pooled connection:** restart an upstream; observe a Go client's connection reuse, errors and bounded recovery.

### nftables

**Tool:** Linux packet filtering, NAT and connection tracking, controlled through nft.

**Course / goals:** Learn stateful policy and directional failure after routes/veth networks; connect rules to actual request outcomes.

**Potential Go follow-ups — choose one:**

- **One-way partition:** block replies between two Go peers in owned namespaces; heal and reconcile uncertain requests.
- **Stateful policy change:** compare an existing Go stream with a new connection after changing filtering rules.

### Valkey

**Tool:** An in-memory data-structure server, used through valkey-cli and Go clients.

**Course / goals:** Study expiration, eviction, atomic operations, caching, persistence and replication; decide what can be lost, rebuilt or safely shared.

**Potential Go follow-ups — choose one:**

- **Cache stampede gate:** coordinate fills across two Go frontends; measure PostgreSQL requests during concurrent misses.
- **Stale-fill race:** delay an old cache fill; use versions to reject its publication after a newer value.
- **Shared rate limit:** enforce one atomic request budget across two Go API processes; verify combined admissions.

### DuckDB

**Tool:** An embedded analytical SQL engine that queries data including Parquet files.

**Course / goals:** Study columnar execution, scans, pushdown, aggregation, parallelism and spilling; explain analytical work and incomplete results.

**Potential Go follow-ups — choose one:**

- **Two-worker aggregate:** query two fixed Parquet shards through Go workers; merge sums/counts and reject incomplete results.
- **Import receipt:** atomically record a batch ID with its imported rows; restart around commit and avoid duplicates.
- **Query admission:** bound concurrent analytical jobs in a Go wrapper; compare completion and spill evidence.

### Object storage

**Tool:** Bucket/key object APIs; the current local lab default is SeaweedFS's S3 endpoint.

**Course / goals:** Study immutable payloads, checksums, retries and manifest publication; separate bulk storage from metadata and rebuildable caches.

```text
Go writer -> immutable objects
          -> publish version in PostgreSQL
Go reader -> published version -> DuckDB
```

**Potential Go follow-ups — choose one:**

- **Manifest publisher:** upload immutable objects, then advance a PostgreSQL version pointer; interrupt publication and check reader visibility.
- **Retryable chunk upload:** reuse content-derived IDs after a lost response; verify checksums and one published manifest.
- **Rebuildable cache:** delete a Go reader's local cache; reconstruct a fixed manifest and verify its dataset with DuckDB.

### NATS / JetStream

**Tool:** Subject-based messaging; JetStream adds persistent streams, consumers and replay.

**Course / goals:** Study acknowledgments, redelivery, competing consumers and backlog; separate message delivery from receiver effects.

```text
publisher -> stream -> worker -> database effect
                         |
                    acknowledgment
```

**Potential Go follow-ups — choose one:**

- **Outbox to inbox:** connect PostgreSQL through Go publishers/consumers; lose acknowledgments and deduplicate receiver effects.
- **Worker crash window:** crash after a database effect but before acknowledgment; verify safe redelivery to another Go consumer.
- **Slow consumer:** pause a Go receiver; bound in-flight work and verify every accepted ID after backlog recovery.

### etcd

**Tool:** A replicated key-value store with revisions, conditional transactions, watches and leases.

**Course / goals:** Study coordination, quorum, stale ownership and watch recovery; require the protected receiver to enforce fencing.

```text
lease -> current owner -> generation token
                             |
                    sink rejects stale writes
```

**Potential Go follow-ups — choose one:**

- **Fenced owner:** on takeover, advance the PostgreSQL sink's accepted generation; resume the stale Go worker and reject its writes.
- **Recoverable watcher:** disconnect a Go watch client; resume by revision or rebuild after compaction and verify convergence.
- **Competing publishers:** race two Go updates against one expected revision; require the loser to reread before retrying.

## Supporting workshops

Pull these into a relevant workload when needed. They are not four additional mandatory courses.

### strace

**Tool:** A CLI tracer for system calls, returned errors and signals.

**Course / goals:** Use during file, connection and sync investigations; connect syscall evidence to application behavior and recognize tracing limits.

**Potential Go follow-ups — choose one:**

- **Find the blocked hop:** trace a Go client/worker pair; distinguish blocked reads from connection errors and prove recovery.
- **File publication:** inspect a Go write/sync/rename sequence; add the missing synchronization call and verify its target.

### fio

**Tool:** A configurable I/O workload generator with throughput and latency reports.

**Course / goals:** Use around database storage questions; compare access patterns, queue depth and synchronization with bounded files and workloads.

**Potential Go follow-ups — choose one:**

- **I/O interference:** use a small Go harness for two bounded fio jobs; vary background concurrency and compare foreground latency.
- **Sync batching:** compare two fio synchronization settings through a Go wrapper; report latency and completed work.

### perf

**Tool:** Linux CPU counters and sampled stack profiling, subject to host permissions.

**Course / goals:** Locate hotspots in familiar workloads; compare useful throughput and latency after one controlled change.

**Potential Go follow-ups — choose one:**

- **Batching tradeoff:** profile Go peers exchanging fixed records; compare CPU cost and latency before and after batching.
- **Hot routing path:** profile a supplied Go router; change one hotspot and repeat the same request load.

### bpftrace

**Tool:** A scripting CLI for dynamic Linux tracing using eBPF probes.

**Course / goals:** Optional after strace/perf; investigate specific kernel events and latency distributions with scoped filters and measured overhead.

**Potential Go follow-ups — choose one:**

- **Locate the tail:** correlate a supplied Go service's delayed requests with workload-filtered syscall or scheduler timing.
- **I/O contention probe:** trace a Go service beside a bounded writer; reduce interference and check useful request progress.

## Optional branches

Choose a branch by interest. Firecracker can follow Linux/networking without Kafka or Kubernetes.
Kubernetes labs can be used earlier; only its deeper control-plane storage work depends on etcd.

### Firecracker

**Tool:** A KVM-based microVM monitor controlled through an API.

**Course / goals:** After Linux isolation, networking and nftables, study guest lifecycle, storage/network boundaries and snapshot behavior using supplied images. Requires usable KVM.

```text
host: process + KVM + network
                |
          guest: Go workload
```

**Potential Go follow-ups — choose one:**

- **Snapshot replay:** restore a prepared microVM running a Go client; verify repeated operation IDs do not repeat sink effects.
- **Aborted-job cleanup:** extend a supplied Go launcher; cancel a guest job, reclaim owned resources and launch again successfully.

### Kubernetes internals

**Tool:** A distributed orchestration/control system exposed through its API and kubectl.

**Course / goals:** Use disposable kind labs for conflicts, watches, reconciliation, readiness and termination. Study etcd before deep control-plane storage/recovery.

**Potential Go follow-ups — choose one:**

- **Conflicting reconcilers:** race two Go updates to one ConfigMap; handle resource-version conflicts without losing intended changes.
- **In-flight termination:** terminate a Pod running the earlier Go operation-ID service; reconcile its outstanding request.
- **Watch interruption:** disconnect a Go client, relist and resume watching; verify convergence to current object state.

### Apache Kafka

**Tool:** A partitioned replicated log with producers, offsets and consumer groups.

**Course / goals:** After NATS, study ordering scope, reassignment, retention and replay; reconcile broker offsets with external effects.

**Potential Go follow-ups — choose one:**

- **Offset/effect crash window:** store an effect and processed offset in PostgreSQL; crash before broker offset commit and deduplicate replay.
- **Per-key ordering:** send a tiny keyed dataset from Go producers to two partitions; verify ordering within each key.
- **Consumer reassignment:** stop one of two Go consumers; verify reassignment and final event-ID coverage.

### Git internals

**Tool:** A content-addressed object store with commit graphs, refs and packfiles.

**Course / goals:** Optional storage case study: separate immutable content from mutable publication and understand replica reconstruction.

**Potential Go follow-ups — choose one:**

- **Competing ref publishers:** race Go wrappers using git update-ref with an expected old ID; verify one publication wins.
- **Lost push acknowledgment:** interrupt acknowledgment between two owned bare repos; inspect the remote ref before retrying.

## Planning and references

Keep lessons near ten minutes, with context and a small terminal diagram before commands, followed
by evidence, interpretation and cleanup. Teach a mechanism deeply once; later tools should add a
meaningful contrast. No mandatory report, homework or separate review stage; only explicit `done`
changes course completion.

PostgreSQL Essentials is partly authored. SQLite Essentials and Linux v2 remain proposals; their
older courses remain available as references. The other topic rows are scope suggestions.
Define and agree a bounded [course plan](../future-courses/README.md) before authoring batches;
discuss lesson-tool alternatives before creating lessons. This menu selects no capstone yet.

Detailed software choices, research, measurement rules and earlier synthesis proposals are preserved
in [Learning path reference notes](learning_path-reference.md). The [learner profile](learner-profile.md)
and [article notes](articles/README.md) explain the background and interests shaping the path.
The [systems project ideas](../systems-projects/docs/project-ideas.md) offer broader inspiration;
the small follow-ups here do not require reproducing those architectures or Nick's own projects.

Primary behavior references for the proposed follow-ups include [SQLite transactions](https://www.sqlite.org/lang_transaction.html)
for atomic local apply/cursor updates, [JetStream](https://docs.nats.io/concepts/jetstream) for
acknowledgment and replay, [etcd guarantees](https://etcd.io/docs/v3.6/learning/api_guarantees/)
for revision/watch behavior, and [git update-ref](https://git-scm.com/docs/git-update-ref) for
conditional ref publication. Verify the chosen APIs, failure points and actual outcomes when a
project is selected; coordination alone does not fence an external sink.
