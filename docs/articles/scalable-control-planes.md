# On building scalable control planes

Source: [On building scalable control planes](https://www.allthingsdistributed.com/2026/08/on-building-scalable-control-planes.html),
guest article by Zak van der Merwe, introduced by Werner Vogels on All Things Distributed,
published 2026-08-04. Added and reviewed 2026-09-04.

## Why the learner saved it

Nick asked for this article to be researched and linked beside overlapping projects so it can
guide course design. No more specific personal reaction was supplied. Treat its relevance as a
teaching input, not a request to adopt AWS services or rebuild his own orchestration projects.

## Source takeaways

The author connects control-plane growth to database limits: read replicas affect freshness,
writes concentrate load, and sharding changes routing and failure boundaries. He emphasizes
keeping running workloads independent of control-plane availability (static stability), discusses
self-hosting dependencies, and presents Aurora DSQL as a response to operational problems he
encountered. These are the author's account and product claims, not guarantees verified by this
repository. [Source article](https://www.allthingsdistributed.com/2026/08/on-building-scalable-control-planes.html).

## Connections and possible local experiments

These are our proposed exercises. They remain unimplemented and should be bounded, CLI-based,
and built with supplied workloads rather than a new platform.

| Project | Question worth investigating locally |
| --- | --- |
| PostgreSQL | Pause replay in a disposable replica; compare API-visible versions. Measure a write bottleneck separately from read load. State the freshness contract. |
| SQLite | Measure the concurrency envelope of a local control store. Explain which deployment needs justify another engine using evidence rather than a blanket scale claim. |
| Kubernetes | Make a disposable lab's management API unavailable while measuring an already running workload. Separately test new scheduling and identify which dependencies block it. |
| etcd | Isolate one member, then lose quorum; distinguish existing workload behavior from coordination progress and eventual recovery. |
| Worker integration | Inject a timeout between recording intent and performing an external action. Reconcile by operation identity and report what the API may safely acknowledge. |
| Firecracker | Separate guest execution from host management-path availability. Scope the test to process/API failure and state what it cannot establish about host loss. |

Relevant portions to revisit: “What is a control plane anyway?”, “Living inside the control plane”,
“Self-hosting”, and “Taking off the rose-tinted glasses”. Use these as optional bounded references
after relevant experiments, not a new mandatory reading checkpoint.

## Limits and open questions

Do not add DSQL, EC2, or a cloud account to the course merely because the article uses them.
PostgreSQL and DSQL are not interchangeable implementations. Verify any feature-specific claim
against the target tool before teaching it. A local fault injection demonstrates that particular
dependency boundary, not multi-zone resilience or production scale. Self-hosting also needs a
separate explanation of bootstrap and recovery dependencies; citing the article is not a proof
that a proposed design resolves them.
