# Learner context for course planning

Updated through 2026-09-14 from the learner's own statements, personal site, and résumé. Use this
to select depth and avoid repeating familiar material; it does not mark any lesson complete.

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

- DuckDB CLI practice (2026-09-14): Nick explicitly says he is brand new to DuckDB and wants
  muscle memory with its CLI. Keep recurring environment variables, fixtures and cleanup in
  helpers, but show the actual `duck` invocation that executes the SQL he edits. Explain the
  database argument, input files or `-c`, flags and connection lifetime. Supply an existing
  editable starter and say what to change. `duck` may select the pinned CLI/settings;
  `duck_run` hides the execution step he wants to practice. This refines the setup-helper
  preference below and applies to authored lessons 1–5 and future DuckDB lessons.
- Inactive course resources (2026-09-14): Nick is currently working on DuckDB, not PostgreSQL
  Essentials. Leave no PostgreSQL instance unrelated to an active DuckDB lesson running,
  including the separate default instance. Disable automatic startup; Nick will request a
  restart if he returns to PostgreSQL. Check dependencies against DuckDB and keep recorded
  lesson progress. Current
  service/data disposition is in [the lab note](knowledge/postgres-lab.md).
- All-course lab workflow (2026-09-14): Nick generalized the setup-helper preference to every
  course: simple setup script, focused work on the lesson topic, easy cleanup. Helpers should
  prepare editable starters too; learners should not recreate recurring shell scaffolding.
  Keep the target mechanism and learner decisions visible. Apply this to new and revised lessons;
  [the shared norm](knowledge/learner-work.md#simple-lab-lifecycle) owns the details.
- DuckDB setup helpers (2026-09-14): move repeated setup that does not teach DuckDB into
  runnable helpers, including course/lab environment variables, fixture lifecycle and file
  fingerprints. Nick explicitly requested this for lessons 2–5 to spend lesson time on DuckDB.
  Apply the same rule when authoring later DuckDB lessons; keep mechanism-relevant SQL,
  source inspection and the learner's query decisions visible in the lesson.
- DuckDB course scope (2026-09-14): Nick wants a very practical course for building data flows
  and understanding how to use DuckDB at a high level. Focus on reading files, cleaning and
  combining data, producing outputs, and repeatable pipelines. Explain internals only when they
  help a practical choice or troubleshooting step. This supersedes the earlier roadmap and
  prior-project notes' emphasis on analytical execution, parallelism, memory, and spill.
  Include practical SQLite-file and PostgreSQL integration in the core: Nick uses PostgreSQL
  frequently and has existing SQLite/DuckDB attempts he wants to improve. Teach connecting,
  inspecting source data, handling type differences, extracting/joining data, and writing
  checked results. Specific difficulties in his attempts are not yet known; familiarity is
  not assumed mastery or permission to modify his existing databases.
  Nick also explicitly connects this interest to distributed systems and AI systems that improve
  over time. [DuckDB research](../duckdbresearch.md) explores evaluation, feedback analysis,
  retrieval experiments, and shared datasets as possible applications; those specific designs
  are proposals, not additional course requirements or claims about his current projects.
  The [Practical DuckDB draft](../future-courses/duckdb/course.md) is proposed; the preference
  correction does not approve its lesson count or authorize implementation.
- Concise course flow (2026-09-12): Nick studies alongside parenting and a full-time job and
  reports that current PostgreSQL Essentials lessons take roughly ten minutes. Future courses
  should have a small, fixed, mechanism-driven route agreed in Markdown before implementation.
  Each lesson should put all required explanation before the experiment, then include complete
  commands, expected evidence, interpretation, and cleanup. External reading and deeper variations
  are optional; there is no mandatory homework, study checkpoint, separate review view, typed
  response, or implicit completion. Use `<course CLI> route` to see completed, available, and
  planned entries and `<course CLI> <number> lesson|done` to study or explicitly complete authored
  work. A plan-only route is viewable before implementation but never creates progress. Implement
  agreed plans in small batches rather than constructing a full course at planning time. See
  [`future-courses/`](../future-courses/) and its
  [template](../future-courses/TEMPLATE.md).
- Course-design sign-off (2026-09-12): create `course.md` upfront as a persistent working draft, then
  update research, rationale, feedback, decisions, and open questions as discussion continues.
  Explain the scope, length, grouping, sequence, and lesson boundaries. Explicitly ask Nick for
  suggestions, revise, and obtain his approval of the final outline before implementing. Drafting
  does not need approval; a request to research or plan does not authorize building lessons.
- Terminal diagrams (2026-09-12): treat ASCII/ANSI terminal art as a first-class pre-experiment
  teaching aid. Lean toward a diagram when state transitions, process or connection ownership,
  timelines, page/tree layouts, contention, or log/checkpoint flow benefit from one. Label it and
  connect it briefly to the evidence the learner will see. It must remain clear as plain text;
  colour is only an optional enhancement.
- Course lesson scripts (2026-09-12 current policy): use Go for new course tooling, supplied
  clients and fixtures, including PostgreSQL; native tool commands remain the experiment language.
  The earlier 2026-09-08 Deno/node-postgres preference reflected Nick's work project and is
  historical context, superseded by the Go tutor migration. Existing native lab fixtures are
  outside that migration's language-port scope.
- PostgreSQL route decision (2026-09-06, retained as history): **40 further essentials lessons
  originally estimated at 20–30 minutes**,
  following the eight completed reference lessons. Nick explicitly chose smaller meaningful chunks
  over 24 longer lessons, requested the full sequence in advance, and rejected using old lessons
  solely to test UX. The fixed
  [route and outcomes](../curriculum-tools/courses/postgres-essentials/PLAN.md) governs subsequent
  work. Lessons 1–31 are now authored; 32–40 remain planned. `tutor postgres-essentials` serves this course with
  course-scoped progress in the shared database. The original 92-lesson course remains reference material.
  This history explains the fixed route; it does not preserve the retired two-view presentation.
  The current `lesson` output now includes interpretation, with required explanation and any useful
  terminal diagram before commands. The old estimate remains in course history, while Nick's reported pace is roughly ten
  minutes.
- PostgreSQL coaching clarification (2026-09-05): lessons 1–7 were completed with the old
  non-pgcoach flow; only lesson 8 was completed with the old pgcoach flow, with ChatGPT help.
  Learning happens outside work alongside marriage and children. Show realistic core lesson estimates and a simple time cap; keep optional depth
  separate. The tutor lesson plus the experiment terminal(s) should usually provide all needed context, with
  ChatGPT/readings available for deeper exploration. Introduce concepts before asking about them,
  explain each step's purpose, and connect the results back to a quick mental guess. Practice and
  reflection are the outcome: no required notes, written answers, `-n` note phrases,
  answer-submission commands or pause/resume system. Personal note-taking is the learner's choice.
  Prefer revising a small batch and trying it before preparing the next batch. The assistant can
  record design decisions; the learner need not write reports.
  See the
  [coaching flow review](../archive/course-history/postgres/designs/08-coach-flow-navigation.md).
- CLI-based experiments: shell, SQL, APIs, configuration, logs, process/file/network evidence.
  No required GUI, dashboard, or cloud console.
- Prefer easily runnable local services and a bounded lab over managed cloud products.
- Strong interest in applying database principles and object storage to difficult architecture
  problems. Use [saved articles](articles/README.md) as possible motivation.
- Integration exercises should investigate boundaries among known technologies with supplied
  workloads. They should not require substantial new application development or cloning his repos.
- Follow the learning roadmap (`tutor roadmap`) for project order and tool defaults; preserve existing
  course material and progress unless a specific refactor is requested.

On 2026-09-12 Nick retired the bundled PostgreSQL Internals material and book-driven course
authoring. Reading is a separate activity; course lessons must supply their own context and do not
show reading assignments, citation maps or study checkpoints. Original experiment data is retained
for reuse; the obsolete pgtutor CLI is retired.
