# Website and résumé context for course calibration

2026-09-04. Nick requested this review to help agents understand his existing knowledge and assess
whether Linux work should precede his ongoing PostgreSQL study. The canonical summary is the
[learner profile](../learner-profile.md); this note preserves source attribution for future agents.

## What happened

Nick reported recently reading Operating Systems: Three Easy Pieces and How Linux Works, and
reading Designing Data-Intensive Applications several times. Editions and book-exercise completion
were not supplied. These are direct learner statements, separate from the web evidence below.

Reviewed his [homepage](https://www.nickstrad.me/), [about page](https://www.nickstrad.me/about),
four relevant posts, and the linked
[Nick Stradford Resume.pdf](https://drive.google.com/file/d/1IIUtJncLz_2UmJOmMGZL5OuzuzVVty7N/view).
Drive metadata reported the PDF last modified on 2026-07-30. The résumé text was successfully read
through the Drive connector. Web browsing could not retrieve the site, but a direct HTTPS fetch
succeeded; the public page HTML was parsed for readable content. No new project repositories were
cloned or validated. Reuse this note rather than repeating the scrape for routine course planning.

### Résumé and professional background

The résumé reports senior software engineering at Apple from April 2017 onward, following
software development at USAA from June 2014 to April 2017. Relevant work includes Go CLI expansion
and access-control tooling, PostgreSQL schema changes for a quota service, Grafana/OpenTelemetry
instrumentation, alerting migrations, and Kubernetes tenant workflows. It also reports technical
delivery leadership and cross-team coordination. The about page describes multi-tenant developer
platforms spanning Kubernetes namespaces and international data centers.

This supports familiarity with production platform operations, instrumentation, relational
application work, and engineering tradeoffs. It does not by itself establish PostgreSQL storage
engine expertise or Linux kernel debugging experience. These are self-reported career facts, not
an independent employment verification. Contact details are unnecessary for course planning and
are not reproduced here.

Education listed in both sources: B.S. Computer Science, minor in Mathematics, University of North
Texas; M.S. Technology Commercialization, University of Texas. The résumé also describes AI products
using PostgreSQL/pgvector, asynchronous workflows, and sandbox execution.

### Learning method and additional project exposure

- [From Distributed Systems Theory to Working Projects](https://www.nickstrad.me/blog/distsys-forge-waterfall-projects-are-back),
  2026-08-06: Nick explicitly describes difficulty connecting theory to implementation despite
  multiple projects. He describes studying concepts, personally coding meaningful components, and
  using AI for explanations, simplification, and testing. He reports a distributed key/value-store
  project in Georgia Tech's online program and work on a quota service involving leader election,
  utilization caching, and calls to other services. Do not infer a completed Georgia Tech degree.
- [distributed-cache](https://www.nickstrad.me/blog/distributed-cache), 2026-07-22: the post describes
  a Go cache with LRU/TTL, consistent hashing, HTTP forwarding, and human/AI implementation
  comparisons involving lock sharding and expiry structures. This is useful prior topic exposure;
  it does not establish production cache reliability or independently verified performance.
- [DCL Store](https://www.nickstrad.me/blog/dcl-store), 2026-04-12: the post describes an append-only
  Go log using HashiCorp Raft, Serf, gRPC, segmented storage, and memory-mapped indices. Treat log,
  replication, and mmap vocabulary as likely familiar. Do not promote the post's broad consistency,
  atomicity, or recovery claims into validated guarantees or assume etcd operational expertise.
- [LLM Engine](https://www.nickstrad.me/blog/llm-engine), 2026-04-11: the detailed post describes a
  book-guided C++23 learning project with an arena allocator and tensor views. It supports prior
  exposure to allocation, alignment, ownership, and memory layout. The homepage's broad inference
  engine description does not establish a complete working inference runtime.

The cache, DCL Store, and LLM Engine posts are explicitly labeled AI-generated. Distinguish their
project descriptions from the [pinned source review](prior-project-experience.md) of Quickspin and
task-orchestrator. Read current source only when a future decision needs implementation evidence;
this background review is not a request to audit, fix, or reproduce the projects.

## Why it matters

The combined evidence supports an experienced application/platform engineer with substantial
systems reading and active implementation practice. Introductory shell, Docker, Kubernetes,
HTTP/API scaffolding, and distributed-systems vocabulary should not dominate his learning path.
The useful teaching question is how a familiar concept manifests in a particular implementation
and what observed behavior supports an engineering decision.

Reading and professional exposure are reasons to calibrate depth, not to assume every skill is
mastered. Examples still worth investigating include PostgreSQL tuple visibility and reclamation,
WAL/checkpoint/recovery behavior, descriptor lifetime, cache accounting, and resource enforcement.

## How to apply

Continue PostgreSQL and use the [optional Linux route](linux-database-integration.md#nicks-optional-early-linux-route)
only for relevant practical gaps. Prefer one prediction and observation to repeated theory
lectures. Keep supplied commands and explanations available; do not impose a placement exam.
Retain later Linux resource/isolation work when it adds new measured behavior.

This update records context and a recommendation. It neither authorizes another agent's course
refactor nor changes any lesson, completion, skip, or stored progress. The learner's explicit
instructions for the ongoing PostgreSQL work remain authoritative.
