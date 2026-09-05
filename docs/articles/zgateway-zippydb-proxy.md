# ZGateway: putting a proxy in front of ZippyDB

Source: [ZGateway: Learnings from Putting a Proxy in Front of ZippyDB](https://engineering.fb.com/2026/09/03/core-infra/zgateway-proxy-zippydb-meta/)
— Rittik Banik and Yunhao Cao, Meta Engineering, published 2026-09-03.
Added and source reviewed: 2026-09-05.

Status: agent-selected reference, added at the learner's request to evaluate it for future
lessons. Proposed experiments below are unimplemented and unvalidated.

Companion note: [ZippyDB](zippydb-key-value-store.md) describes the store this proxy fronts;
read it first for shards, epochs, and consistency levels.

## Why the learner saved it

Nick asked for this article and the 2021 ZippyDB article to be read, analyzed, and recorded
here if they can benefit future lessons. He stated no reaction to the content, so record no
preference beyond the request. Its relevance to the roadmap's networking, proxy, and capacity
topics is our judgement.

## Source takeaways

The following is the authors' account and Meta's reported numbers, not results verified here.

- **The problem is fan-in, not throughput.** Direct client-to-server access formed a
  many-to-many mesh: a typical client held tens of thousands of outbound connections, and
  database hosts accepted comparable inbound counts, mostly idle but each costing memory, CPU,
  and file descriptors. Every new client cohort degraded server performance, and reconnection
  storms could exhaust file descriptors and OOM hosts. The authors cite a routing bug that made
  every client open one connection per shard, causing cascading host reboots.
- **ZGateway is a stateless regional proxy tier** discovered through ServiceRouter, running
  Meta's existing thick C++ client as its engine (one internal client per use case). Reported:
  >1 billion operations per second, ~40% of ZippyDB traffic (projected past 60%), at about 6%
  computational overhead for an average use case.
- **Scaling behavior, not the one-time win, is the stated point.** Direct fan-in grows linearly
  with the client population; behind the proxy it is approximately regions × shards-per-host,
  independent of both fleet sizes. Their model gives ~97–98% fewer per-host connections and
  roughly 19× fewer total persistent connections.
- **Batching and coalescing.** A per-host shared batcher groups requests by use case and
  physical shard into one backend RPC. This amortizes per-RPC overhead, stretches rate limits,
  and collapses a hot key's simultaneous callers into a single backend read. Safety comes from
  idle eviction of batch entries past a TTL and an in-flight cap that rejects new executions when
  the backend slows.
- **Admission control.** Discriminant Load Shedding maps each request to a per-tenant bucket
  keyed by use case and split by priority, draining buckets round-robin. In a controlled overload
  above 90% CPU across ~1,350 active buckets, they report 6 buckets shedding while the remaining
  ~1,344 completed 99.9% of requests with no rejections, at roughly 8% CPU cost.
- **Load balancing.** A control-plane balancer reads recent per-host CPU on a fixed cadence,
  normalizes the tier average to 1.0, and nudges each host's weight against its load; the
  described next step classifies tier states (drift, task churn, bimodal load, hot outliers,
  regional skew) and applies a matching policy. Hosts range from ~26 to ~126 cores, so untreated
  hot outliers turn into error spikes and service-mesh throttling.
- **Caching with live invalidation.** Hot reads are served from an in-process cache; a miss takes
  a per-key fill lock so a thundering herd becomes one backend fetch. A change-data-capture
  stream of write and checkpoint events invalidates or refills entries.
- **Cross-region resilience.** Global routing, mega-regions grouping nearby regions, and rings
  declaring backup relationships and proportions, with a failover trigger tuned to fire before a
  region tips into overload.
- **Transactions.** Sharing one transaction-state implementation with the internal client
  removed a parallel code path and keeps the proxy aligned with server-side changes.
- **Migration.** Client-side configuration flags scoped per service and shard prefix: a
  percentage ramp, a region filter to bound blast radius, and a global kill switch. No client
  code changes were required.
- **Stated future work.** Agent-tuned control loops, co-locating parts of the gateway beside
  server hosts, and splitting the proxy into cooperating processes for fault isolation.

## Connections and possible local experiments

Our teaching proposals. All are small, local, and observable with tools the roadmap already
selects; none require Meta-scale infrastructure or a distributed key-value store.

| Course or topic | Question worth investigating locally | Bounded experiment and evidence |
| --- | --- | --- |
| PostgreSQL connections (`client-protocol`, `13-observability`) | What does one idle connection actually cost the server? | Open connections in steps against an owned cluster and record backend process count, RSS, and open file descriptors per step. Then compare the same client load through a local pooler. Report the measured curve, not a scale claim. |
| Capacity and overload (`capacity-workload`, `15-incidents`) | What happens at the connection limit versus at the CPU limit? | Drive an owned cluster past `max_connections` and separately past its CPU budget. Compare the error the client sees, latency for already-admitted work, and recovery time. |
| Admission control and fairness (`14-patterns`, roadmap: nginx/nftables stage) | Does one noisy tenant have to degrade the others? | Run two workloads through one pooler or an nginx front end, apply a per-tenant limit to only one, and measure both latency distributions with and without the limit. Evidence is the second tenant's success rate. |
| Caching and invalidation (`10-logical`, `logical-decoding`, `slot-delivery`) | How does a cache learn that its entry is stale? | Build a tiny cache fed by a logical decoding stream, update rows, and measure the window between commit and invalidation. Then stop the consumer and show the stale reads the design permits. |
| Thundering herd (roadmap: Valkey; `06-locking`) | What collapses N simultaneous misses into one backend read? | Fire concurrent readers at a cold key with and without a single-flight fill lock; count backend queries in each case. |
| Batching (`02-storage`, `wait-observation`) | Where does batching stop paying? | Compare single-row round trips, multi-row statements, and one large batch for the same total work; record round trips, wait events, and latency for the last request in a batch. Name the tail-latency cost. |
| Proxy overhead (roadmap stage 4: networking, nginx) | What does an extra hop cost, and is it worth it? | Measure p50/p99 for a fixed workload direct and through a local proxy. Compare the added milliseconds against the connection reduction observed in the first row. The article's ~6% is their number, not a target to reproduce. |
| Safe rollout (`14-patterns`, `15-incidents`) | How do you route 5% of traffic and get it back instantly? | Move a fraction of a supplied workload to a new path via configuration only, verify both paths under load, then exercise the kill switch and time the rollback. |
| Failover policy (`failover-workload`, roadmap stage 8: etcd) | Should failover trigger on failure or before overload? | Degrade one owned backend gradually and compare a health-check-based switch with a utilization-based one. Record the requests lost in each. |

Use the [learning roadmap](../learning_path.md) to place any adopted idea. Several of these fit
the existing networking and capacity stages better than a new course; the connection-cost and
cache-invalidation experiments attach directly to lessons that already exist.

## Limits and open questions

- Every number here is Meta's, measured on their fleet: 1B ops/s, ~6% overhead, 19×, 97–98%,
  99.9%. Cite them as reported figures. A local lab cannot reproduce or refute them, and a
  lesson must not present them as expected results for a laptop-scale proxy.
- The fan-in reduction is derived from a probabilistic model in the article, not from a
  before/after production measurement presented to the reader. Distinguish the model from the
  outcome when teaching it.
- PostgreSQL's process-per-connection backend and ZippyDB's connection model impose different
  per-connection costs. Connection-pooling lessons transfer in shape; the measured cost must come
  from the actual tool under test.
- A proxy is not free: it adds a hop, a failure domain, and its own capacity limit. Any lesson
  built on this article should measure the added latency and ask what happens when the proxy
  itself is the thing that is down or overloaded — the article's multi-process plan exists for
  that reason.
- Cross-region routing, mega-regions, and rings cannot be demonstrated on one host. Do not claim
  a local failover experiment establishes regional resilience.
- The 2026 publication date means no independent write-ups or corrections are available yet.
  Details left unspecified — batch TTLs, in-flight cap values, balancer cadence, cache sizing —
  should be marked unknown rather than invented.
