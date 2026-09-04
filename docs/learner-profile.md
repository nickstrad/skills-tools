# Learner context for course planning

Updated 2026-09-04 from the learner's own statements, personal site, and résumé. Use this to select depth and avoid repeating
familiar material; it does not mark any lesson complete.

## Experience

- The learner is Nick, GitHub user **nickstrad**. Both **quickspin** and **task-orchestrator** are
  his repositories. He supplied them as evidence of experience, not projects to copy into courses.
- Holds the Linux Foundation's **Kubernetes and Cloud Native Associate (KCNA)** certification.
  See the [official reference and course implications](articles/kcna-reference.md).
- Has been shipping software at work on Kubernetes for roughly **seven years** and is comfortable
  using the platform. There is still substantial Kubernetes depth he wants to learn.
- Is familiar with Docker and works in environments using Docker, containerd, and Kubernetes.
- Has implemented sandbox and orchestration software; the
  [source review](knowledge/prior-project-experience.md) distinguishes observed implementation
  experience from future plans and identifies coursework that can be shortened.
- His résumé reports senior engineering work at Apple since April 2017: Go platform CLI and ACL
  tooling, PostgreSQL quota-schema work, and observability/alerting infrastructure. Earlier work
  at USAA includes Java/JavaScript production applications and ETL. Education: B.S. Computer
  Science with a math minor and M.S. Technology Commercialization.
- His site describes distributed-cache and replicated commit-log learning projects, alongside
  Quickspin/task-orchestrator, plus C++ allocator/tensor work and PostgreSQL/pgvector applications.
  These extend the evidence of prior exposure; the newly reviewed project posts are descriptions,
  some explicitly AI-generated, rather than independently checked implementations.
  See [website and résumé context](knowledge/learner-background-sources.md) for provenance and limits.

## Prior reading

Reported directly by Nick on 2026-09-04:

- Recently read **Operating Systems: Three Easy Pieces (OSTEP)**.
- Recently read **How Linux Works**.
- Has read **Designing Data-Intensive Applications (DDIA)** several times.

Editions and completion of the books' exercises were not specified. Treat these readings as
substantial prior conceptual exposure: begin with concise reminders and concrete observations,
not a mandatory repeat of introductory OS or distributed-systems theory. Ask for deeper explanation
only where it helps the current experiment. Reading does not establish hands-on fluency with every
Linux diagnostic tool or PostgreSQL implementation detail.

## Teaching implications

Assume routine container usage, Kubernetes deployment vocabulary, and ordinary application delivery.
Avoid mandatory introductions to Docker CRUD, basic manifests, elementary manager/worker
architecture, or HTTP-client scaffolding. Check familiarity briefly when needed, then move to the
unfamiliar mechanism. Certification and production tenure do not imply mastery of database storage,
kernel internals, consensus, or every Kubernetes implementation detail.

Continue PostgreSQL now. The early Linux recommendation means targeted observation skills alongside
database work; it is not a requirement to finish the first several Linux modules. The
[optional eight-lesson route](knowledge/linux-database-integration.md#nicks-optional-early-linux-route)
provides a bounded fallback if practical tool gaps appear. Retain PostgreSQL pages/MVCC/WAL/recovery
depth while compressing familiar DDIA-level introductions. The site's stated interest in bridging
theory and implementation reinforces this approach; it does not replace the CLI-first preferences
for this repository with a requirement to build substantial applications.

Keep explanations and supplied commands for new concepts. Use code and project history as context
for choosing what to teach, not as proof the learner can already explain every failure mode. Do not
turn an experience review into a code audit, feature backlog, or assignment to rebuild his projects.

Use Docker Compose or a disposable Kubernetes cluster when helpful from the start. Deep Kubernetes
study should emphasize measured behavior, control-plane internals, scheduling, resource admission,
networking, storage, and failure recovery. Host-init/service-manager coursework is excluded from
this roadmap at the learner's request.

## Preferences

- CLI-based experiments: shell, SQL, APIs, configuration, logs, process/file/network evidence.
  No required GUI, dashboard, or cloud console.
- Prefer easily runnable local services and a bounded lab over managed cloud products.
- Strong interest in applying database principles and object storage to difficult architecture
  problems. Use [saved articles](articles/README.md) as possible motivation.
- Integration exercises should investigate boundaries among known technologies with supplied
  workloads. They should not require substantial new application development or cloning his repos.
- Follow the [roadmap](learning_path.md) for project order and tool defaults; preserve existing
  course material and progress unless a specific refactor is requested.
