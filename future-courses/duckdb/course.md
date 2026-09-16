# Practical DuckDB: Data Flows and Improving AI Systems

Status: partly implemented; first batch validated. Updated: 2026-09-16.
Course ID: `duckdb`. Implementation: lessons 1–5 authored and validated; 6–32 and optional projects planned.
Outline revision: 5. Final-outline sign-off: 2026-09-16 via approval of the file-ownership lesson swap.

## Goal and scope

Use DuckDB to connect existing data, build dependable transformations, investigate distributed
work, and measure changes to AI systems. Build on the eight practical uses in
[duckdbresearch.md](../../duckdbresearch.md), adding file ownership followed by two Quack
client/server lessons as Nick approved on 2026-09-16. Five optional practice projects follow
all core lessons.

Assume basic SQL, shell, and application-development knowledge. Nick uses PostgreSQL frequently
and has SQLite/DuckDB attempts he wants to improve. Teach connector setup, source qualification,
type conversion, and unfamiliar SQL explicitly. Prior experience does not establish the causes
of problems in his existing attempts. No previous course completion is required.

Nick clarified on 2026-09-14 that he is brand new to DuckDB and wants CLI muscle memory.
Keep environment/fixture setup and cleanup in helpers, while showing the `duck` invocation,
database target, SQL input and flags. Learners edit a supplied starter and run it themselves;
explain what each call does and retains. Apply this to the first five lessons and later batches.

The follow-up requests two alternatives: **Setup - manual** exposes the target software's
native preparation and inspection; **Setup - script** bypasses that work once familiar. Both
keep lab folders, fixtures, variables and cleanup in helpers and share the same visible Run.
This is now the common approach for authoring/revising lessons across courses, first applied here.

Start with small application records, then use supplied synthetic worker events, AI run results,
grades, feedback, documents, and retrieval results. Give each lesson its own complete starting
fixture. Explain the record's grain and identifiers before commands. The AI examples need no
paid model calls, live agent, training environment, or user data: the learner analyzes provided
outcomes and makes a consequential query or workflow choice.

Keep internals brief and tied to practical decisions. Engine implementation, pages/WAL/MVCC,
index tuning, cloud setup, model training, online model serving, and building an orchestration
platform are outside the core. DuckLake is optional background for shared datasets, not a
required deployment. Distributed analysis does not establish distributed coordination; an
improvement report does not automatically train or change an AI system.

## Size and pacing

**32 core lessons**, targeting ten minutes each: about **5 hours 20 minutes**, with a
fifteen-minute core ceiling per lesson (eight hours at that ceiling). Each estimate includes
context, setup, 3–5 minutes of meaningful learner work, a small debugging allowance, observation,
interpretation, and cleanup. All times and experiments are proposals pending implementation.

**Five optional practice projects follow lesson 32.** Estimate 30–60 minutes per project,
split into 2–4 short sessions. Doing all five adds 2 hours 30 minutes to five hours; choose
projects by interest rather than treating them as completion requirements. Project setup and
process control are supplied. They are not homework, a review gate, or a request to build an app.

Revision 3 grew the route from 21 to 32 lessons. Revision 4 kept 32 by replacing the planned
"Turn reviewed failures into useful examples" (old 24) and "Test whether a memory policy helps"
(old 29) with two Quack lessons immediately after lesson 17. Their specialized selection and
matched-comparison work overlaps existing lessons; Quack adds process ownership, remote writes,
and explicit remote execution. Retain dataset separation and reproducibility. Existing lessons
keep their stable slugs; only planned rows are removed or renumbered, with no learner history to
transfer. The standalone query-work lesson remains absorbed into bounded extraction and
remote-file selection; the original end-to-end handoff remains the shared-dataset lesson and
final optional project.

Revision 5 replaces "Produce a useful daily report" (revision 4 lesson 12) with "Understand
who owns a DuckDB database file" at 17. Former lessons 13–17 move to 12–16; Quack remains at
18–19 and the total remains 32. File ownership gives the client/server section its motivation.
The export lesson supplies a small report fixture, while grouping practice remains in the
remote aggregation and AI analysis lessons. No separate daily-report exercise is required.

One-time setup is provisionally 15–20 minutes through supplied commands: a pinned DuckDB CLI,
matching SQLite/PostgreSQL extensions, native sqlite3/psql clients, small fixtures, and an owned
PostgreSQL instance separate from `/labs/pglab`. A supplied HTTP fixture and matching httpfs
extension are needed only for lesson 31. Lessons 18–19 also require a matching pinned Quack
extension and two local DuckDB CLI processes. Quack setup time must be measured during their
implementation. No tools or labs are created during planning.

## Categories and their sequence

| Category | Lessons | Why it comes here |
| --- | --- | --- |
| PostgreSQL analytical companion | 1–2 | Begin with a familiar source and an immediately useful local extract. |
| Combining scattered data | 3–9 | Learn SQLite and file boundaries, then join sources with known types and keys. |
| Repeatable data preparation | 10–16 | Turn one-off exploration into clean stages, checked outputs, and safe reruns. |
| File ownership and DuckDB client/server with Quack | 17–19 | Establish direct-file access rules, then use two terminals for remote writes and computation. |
| Distributed-system investigations | 20–22 | Apply identifiers, joins, and timestamps to retries, missing work, and delay. |
| AI evaluation and feedback analysis | 23–25 | Compare versions using complete populations and attributable measurements. |
| Evaluation dataset preparation | 26–27 | Keep supplied examples separated and reproducible. |
| Retrieval experiments | 28–29 | Use that evaluation discipline to assess retrieved evidence and answer support. |
| Shared analytical datasets | 30–32 | Lay out, query, and deliver identified datasets that other workers can consume. |

## Research and breakdown rationale

The [research note](../../duckdbresearch.md) preserves the primary-source review, architecture
ideas, and limits. The outline applies it as follows:

- **Connections before combinations:** SQLite and PostgreSQL attachments expose source data;
  they do not silently convert it into a local DuckDB copy. Source qualification, SQLite value
  conversion, and local extraction each produce a different observable problem. Start with
  read-only sources and reserve writable PostgreSQL output for lesson 16.
  [SQLite extension](https://duckdb.org/docs/current/core_extensions/sqlite),
  [PostgreSQL extension](https://duckdb.org/docs/current/core_extensions/postgres/overview),
  [source-side SQL](https://duckdb.org/docs/current/core_extensions/postgres/functions).
- **One transformation decision per lesson:** types, nested rows, schema combination,
  deduplication, joins, and grouping affect different correctness conditions. File readers and
  COPY provide the practical mechanics; setup is supplied so the learner works on data meaning.
  [CSV](https://duckdb.org/docs/current/data/csv/overview),
  [JSON](https://duckdb.org/docs/current/data/json/loading_json),
  [schema combination](https://duckdb.org/docs/current/data/multiple_files/combining_schemas),
  [COPY](https://duckdb.org/docs/current/sql/statements/copy).
- **File ownership before remote access:** distinguish separate database files, shared read-only
  access, and a single process owning read-write access to a native DuckDB file. Lesson 17
  makes the file-lock boundary visible in two terminals before Quack introduces server-mediated
  access. Explain that multiple connections inside one process are a different concurrency
  boundary; a single owning process can still execute concurrent work. Keep conflicting-row
  updates and retry experiments outside this lesson's core.
  [Concurrency](https://duckdb.org/docs/current/connect/concurrency), reviewed 2026-09-16.
- **Two DuckDB processes before worker analysis:** use the ordinary CLI in both terminals,
  start a listener with `quack_serve`, and attach it from the other process. Separate the
  remote-write/commit experiment from constructing a remote aggregation and local join.
  `remote.query(...)` makes the intended execution location explicit. Quack documents remote
  writes and forwarded transactions; exact visibility, commands, and extension compatibility
  remain to be validated with the pinned course runtime. The documentation reviewed on
  2026-09-16 labels Quack beta.
  [Quack overview](https://duckdb.org/docs/current/quack/overview),
  [remote query example](https://duckdb.org/2026/05/12/quack-remote-protocol),
  [extension status](https://duckdb.org/docs/current/core_extensions/quack).
- **Preparation before diagnosis:** the worker and AI modules reuse clean tables and ordinary
  SQL. Their new ideas are record identity, completeness, comparison populations, and evidence.
  They need separate lessons because a query can run successfully while answering the wrong
  question. Task, trial, and grader distinctions are supported by
  [agent-evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents);
  our specific datasets and exercises are teaching proposals.
- **Evaluation before retrieval experiments:** first establish valid comparisons, then measure
  relevance and answer support separately. Supply fixed embeddings and
  labels for bounded experiments. No model calls or persistent approximate-search index are
  required. [Text analytics](https://duckdb.org/2025/06/13/text-analytics) supplies capability
  context; current [VSS persistence limits](https://duckdb.org/docs/current/core_extensions/vss#persistence)
  are a reason not to require an online vector service for this course.
- **Dataset identity before sharing:** record provenance and split identity before consuming
  remote partitions or distinguishing candidate and accepted outputs. A file manifest does not
  itself create a distributed transaction. Partitioning and remote reads are documented;
  the publication exercise is our bounded application of them.
  [Partition selection](https://duckdb.org/docs/current/data/partitioning/hive_partitioning),
  [HTTP access](https://duckdb.org/docs/current/core_extensions/httpfs/https).

PostgreSQL extraction still loads its source; independently extracted databases do not share
one atomic snapshot. Keep native-file process ownership distinct from remote services or a
DuckLake catalog. Explain these as workflow boundaries, not separate internals units.
[Concurrency](https://duckdb.org/docs/current/connect/concurrency),
[DuckLake configurations](https://ducklake.select/docs/stable/duckdb/usage/connecting).

## Canonical lesson route

Lessons 1–5 are authored; remaining rows are planned. The category table above groups this
single ordered route. Every row reserves a concrete learner choice within the stated attempt
budget; setup, syntax examples, process control, hints, and cleanup are supplied.

Authored tag vocabulary: `duckdb`, `connections`, `data-flows`.

| # | Lesson / stable slug | Cause and observe | Practical insight |
| --- | --- | --- | --- |
| 1 | Query PostgreSQL from DuckDB / `attach-postgres-source` | Use supplied connection details and a read-only attachment; select the correct schema-qualified source and reconcile a bounded result with psql. | Identify which database and table a query actually reads. |
| 2 | Bring a bounded PostgreSQL extract local / `extract-postgres-batch` | Complete a source-side filter and column selection, materialize locally, and observe a new source row appearing only after explicit refresh. | Choose what leaves PostgreSQL and when a local extract becomes stale. |
| 3 | Query an existing SQLite file / `attach-sqlite-file` | Attach a supplied file read-only, identify its catalog/tables, and adapt a query to the correct qualified name; reconcile with sqlite3. | Opening SQLite through DuckDB does not convert its storage format. |
| 4 | Fix a SQLite import that fails on types / `repair-sqlite-types` | Inspect a mixed-type column and complete a staging/conversion rule; verify accepted and rejected records account for the source. | Preserve raw values while making conversions explicit. |
| 5 | Turn a CSV file into an answer / `query-a-file` | Adapt a direct file query to answer a bounded question and verify its count and total. | Use files directly as useful SQL inputs. |
| 6 | Make messy input types explicit / `clean-input-types` | Choose types and a conversion rule for identifiers, amounts, and one malformed value; inspect accepted and rejected rows. | Inference is a starting point for a data contract. |
| 7 | Turn nested JSON into rows / `flatten-json-records` | Adapt extraction of a tool-event array while retaining run IDs; reconcile expanded event counts. | Decide what one output row means before joining or aggregating. |
| 8 | Combine batches as schemas change / `combine-file-batches` | Read two file versions by column name, retain provenance, and handle a missing field; verify rows and nulls. | Schema evolution needs an explicit policy. |
| 9 | Join SQLite, PostgreSQL, and file data / `join-reference-data` | Complete a join across a PostgreSQL extract, SQLite reference rows, and a CSV lookup; detect a duplicate reference key and verify unmatched keys. | Cross-source joins need compatible types and known key cardinality. |
| 10 | Keep one authoritative record / `deduplicate-records` | Complete a window ordering rule with a stable tie-breaker; verify the winning record for each key. | Deduplication requires identity and a deterministic winner. |
| 11 | Organize a flow into SQL stages / `organize-sql-stages` | Choose a view or materialized table for a reusable cleaning stage; change the source and observe freshness. | Views and stored results have different reuse and refresh behavior. |
| 12 | Write outputs another tool can use / `export-and-reopen` | Export a supplied report as CSV and cleaned rows as Parquet, then reopen and compare types and totals. | Check delivery from the consumer side. |
| 13 | Stop bad data before delivery / `validate-before-delivery` | Complete one uniqueness or completeness check in a supplied stage; verify bad input blocks delivery. | SQL success alone does not establish data quality. |
| 14 | Run the flow as a repeatable job / `run-a-sql-job` | Adapt a supplied CLI invocation to a batch and output path; introduce one known SQL error and verify job failure. | Make inputs, outputs, and failure behavior explicit. |
| 15 | Rerun a batch without double counting / `replace-a-daily-batch` | Complete transactional replacement of a known complete source day; rerun and verify identical results with other days preserved. | A clear replacement boundary makes retries repeatable. |
| 16 | Send a checked result back to PostgreSQL / `write-postgres-result` | Complete a column mapping into an owned reporting table using a supplied replacement pattern; rerun and verify keys and totals in psql. | Local transformation and destination commit are separate responsibilities. |
| 17 | Understand who owns a DuckDB database file / `understand-duckdb-file-ownership` | Keep A open read-write and observe B's direct open fail, including read-only; close A and query from both read-only, then arrange the connections to permit a write and verify its stored result. | Direct access to one native file supports one read-write process or multiple read-only processes; server-mediated access uses a different boundary. |
| 18 | Serve a DuckDB database and change it from another terminal / `serve-duckdb-with-quack` | Start a Quack listener in terminal A and authenticate/attach from a separate DuckDB CLI in B; complete a qualified remote update and observe it from A before and after commit, then try rollback. | The serving process owns the database; remote writes have transaction boundaries. |
| 19 | Combine local data with a remote DuckDB result / `combine-local-and-remote-duckdb` | With worker events on A and a local lookup on B, construct an aggregation inside `remote.query(...)`, join its result to B's lookup, and reconcile supplied totals. | A DuckDB client can compute locally while explicitly sending selected work to the server. |
| 20 | Separate logical work from retries / `identify-worker-attempts` | Choose keys that remove duplicate event deliveries while retaining distinct attempts; reconcile logical tasks and attempts. | A retry is different from a duplicate copy of an event. |
| 21 | Find work that never produced a result / `find-missing-worker-results` | Join accepted jobs with terminal attempts and published results using a supplied observation cutoff; identify pending and missing outcomes. | Successful rows cannot establish the completeness of the whole workload. |
| 22 | Locate delay in a worker flow / `locate-worker-delay` | Separate queue and execution time from supplied compatible timestamps; identify the stage responsible for a changed latency distribution. | Attribute delay to a stage; cross-host timestamps alone do not prove causality. |
| 23 | Compare AI versions on the same tasks / `compare-ai-versions` | Construct a same-task baseline/candidate comparison including failed and missing trials; identify one regression category. | An easier or incomplete task population can mimic improvement. |
| 24 | Compare quality with usage fairly / `compare-quality-and-usage` | Aggregate multiple grades to the intended run grain before joining token/latency records; verify totals and compare verified outcomes with usage. | A many-to-many join can invent cost or apparent success. |
| 25 | Connect user feedback to measured outcomes / `reconcile-ai-feedback` | Join delayed corrections to runs and automated grades; separate disagreement, explicit negative feedback, and missing feedback. | Feedback is attributable evidence, not automatically a ground-truth label. |
| 26 | Keep evaluation examples separate / `separate-evaluation-data` | Repair a split that places related examples on both sides by assigning whole source groups; verify no forbidden overlap remains. | Leakage can make a weak change look effective. |
| 27 | Identify a reproducible dataset version / `version-evaluation-dataset` | Complete a manifest of source versions, transformation version, and split identity; reproduce a supplied result from those identified inputs. | Reproduction needs more than a filename or a timestamp. |
| 28 | Measure whether retrieval finds useful evidence / `measure-retrieval-relevance` | Compare supplied retrieval configurations against fixed relevance labels; compute hit-at-k by query, including empty results. | Evaluate retrieved evidence on a fixed question set. |
| 29 | Separate retrieval success from answer success / `trace-answer-support` | Join retrieved document versions, answers, and supplied support/correctness labels; isolate a case where relevant retrieval still produced a bad answer. | Retrieval quality and answer quality are separate measurements. |
| 30 | Lay out Parquet for downstream queries / `partition-parquet-output` | Choose a useful date partition key; query one partition and inspect selected files and results. | Dataset layout should match consumer selection. |
| 31 | Query files where they live / `query-remote-parquet` | Adapt a Parquet query to a supplied local HTTP endpoint, narrow columns/rows, and verify its answer and request evidence. | Remote analytical reads can be selective; measure work rather than assuming a speedup. |
| 32 | Deliver an identified, complete dataset / `deliver-a-validated-batch` | Complete a supplied reader's choice of accepted manifest, check expected file identities, and reject a missing-input candidate while preserving the previous result. | Candidate files and a published complete dataset are different states. |

### File-ownership and Quack lesson boundaries

Lesson 17 targets 10–15 minutes including a 3–5 minute learner task. Supply one disposable
native DuckDB file on local disk, two labelled terminal sessions, the CLI access-mode syntax,
expected lock-error evidence, and cleanup. Keep the first connection alive while testing the
second; show both unsuccessful read-write and read-only opens against A's read-write ownership.
After closing A, show both processes reading with explicit read-only access. The learner then
chooses which connections to close and how to reopen for a write, verifies the stored change,
and closes both sessions. Check the actual lock failure and data result during authoring.

Explain the distinction between processes and connections before commands. Separate files
represent independent databases. Multiple connections inside one owning process can perform
concurrent work; they are not the two independent CLI processes in this experiment. Bridge to
18 by showing how Quack clients reach the owning server rather than opening its file directly.
Supply file preparation and cleanup through the usual helpers while keeping open/close and
access-mode choices visible. Do not add network filesystems, DuckLake deployment, or a second
conflicting-transaction experiment to this core lesson.

Each of lessons 18–19 targets 10–15 minutes including context, setup, 3–5 minutes of learner
work, evidence, and cleanup. Supply an independent fixture for each, local ports, authentication
details, connection syntax, and deterministic terminal ordering. Keep both DuckDB processes
alive throughout the experiment. Show the CLI invocation, `quack_serve`, attachment, query,
and stop commands explicitly; helpers prepare files and fixtures and clean owned processes.
Retain the common script/manual setup choices without hiding the mechanism being taught.

In 18, A opens the owned database file and serves it; B opens its own DuckDB session and
accesses A through Quack. The learner completes the remote table qualification and update.
Use fresh observation statements in A around B's commit/rollback so an unrelated long-lived
snapshot does not obscure the experiment. Confirm visible row values, not just command success.
In 19, supply the connection plumbing and reserve the aggregation and local join for the learner.
Use explicit remote SQL and reconciled totals as evidence; do not infer a speedup or claim that
every operation in an arbitrary attached-catalog query executes remotely.

An optional variation in 19 lets B serve its own local table on a second port and A attach to
B, demonstrating that either process can take the client or server role. Keep the objects
distinct and the query path finite. This is remote access, not replication or automatic
distributed coordination. The variation adds no core lesson or third required terminal.

## Optional project practice — after the lessons

The five projects follow all 32 core lessons. They integrate already-taught ideas and introduce
no new required concepts. Each has a supplied starter, finite data, cleanup, a useful learner
implementation/diagnostic decision, and evidence to check. No mandatory written report or
answer submission. The estimates below cover the whole project, not one ten-minute lesson.

| Order | Project / stable slug | Uses lessons | Practice and evidence | Suggested sessions |
| --- | --- | --- | --- | --- |
| P1 | Compare two AI versions / `practice-ai-version-comparison` | 12–15, 23–25 | Build a same-task report from supplied run, grade, feedback, and usage data. Account for missing trials, expose a regression, and verify denominators and totals. | 3 × 10–15 min: assemble, compare, verify. |
| P2 | Repair a SQLite-to-DuckDB flow / `practice-sqlite-flow-repair` | 3–6, 9–15 | Diagnose one supplied catalog/type failure, repair the transformation, and export a checked dataset with every source row accounted for. | 2–3 × 15 min: diagnose, repair, verify as needed. |
| P3 | Reconcile two worker outputs / `practice-worker-reconciliation` | 10, 13, 20–22, 32 | Complete retry deduplication and a completeness decision in a supplied two-worker flow. Reconcile sums/counts against a known single-worker answer; reject a missing shard. | 3–4 × 10–15 min: inspect, reconcile, inject omission, verify. |
| P4 | Improve a retrieval configuration / `practice-retrieval-comparison` | 23, 26–29 | Compare two supplied retrieval-result sets and answer labels. Choose one consequential configuration change from supplied variants, identify tradeoffs, and rerun the fixed comparison. | 3 × 10–15 min: baseline, change, verify. |
| P5 | Publish a repeatable evaluation batch / `practice-evaluation-publication` | 13–16, 27, 30–32 | Complete the acceptance decision around supplied immutable-file and PostgreSQL metadata operations. Interrupt after output creation, retry, and prove no duplicate acceptance or publication of an incomplete batch. | 3–4 × 10–15 min: inspect, complete, interrupt/retry, verify. |

These are separate optional project plans, not numbered core lessons or a separate review
stage. Their practice ordering is explicit here; the plan-only tutor route lists the 32 core
lessons. Implementation of a selected project must use the shared lesson interface for its
short authored parts, with an agreed placement after the core; do not create a project-specific
renderer or completion system during planning.

## Visual teaching plan

Use this evolving terminal-readable flow before the relevant experiment commands:

```text
PostgreSQL + SQLite + CSV/JSON
               |
               v
     DuckDB: clean -> join -> validate
               |
               +--> file ownership -> Quack server A <-> DuckDB client B + local lookup
               |
               +--> worker attempts -> missing work / delay
               |
               +--> AI runs + grades + feedback -> compare versions
               |                                      |
               |                                      v
               |                              separated, versioned evaluation data
               |                                      |
               |                                      v
               |                              retrieval / answer tests
               v
     identified Parquet batch -> accepted manifest -> downstream reader
```

Use attachment/extraction maps in 1–4, before/after rows and join-grain diagrams in 5–13,
a batch-replacement diagram in 15–16, a two-process file-access map in 17, and two-terminal
server-ownership and execution maps in 18–19,
task/attempt/event timelines in 20–22, matched trial and grader maps in 23–25, provenance
and split diagrams in 26–27, retrieval/answer maps in 28–29, and partition plus
candidate/accepted-state diagrams in 30–32. Place each
before setup and connect its labels to evidence. Plain Markdown/ASCII remains sufficient.

## Delivery and implementation boundary

Show the planned route with `tutor duckdb route`. Once lessons exist, use
`tutor duckdb <n> lesson|done` through the shared tutor. A lesson contains explanation, the
bounded learner task, commands, expected evidence, interpretation, and cleanup. Only explicit
progress operations change progress. There is no required quiz, homework, external reading,
review, or submission stage.

The 2026-09-14 implementation request authorized lessons 1–5, retained in this revision. The user selected
DuckDB 1.5.5 with matching extensions. Runtime setup and validation live in
[the implemented course](../../curriculum-tools/courses/duckdb/README.md).
Lessons 6–32 and optional project parts await later batch requests. Use native SQL and shell for
experiments; new fixture/controller tooling uses Go 1.26 or newer, with shell glue where clearer.

Implementation must pin DuckDB and extension versions and verify both successful outcomes and
relevant wrong choices against real tools. Aim for under 100 MiB ordinary fixture data and
under 500 MiB peak owned scratch, including PostgreSQL and exports, subject to measurement.
Use private paths/ports and serial failure experiments. Preserve `/labs/pglab`, shared learner
progress, legacy backups, and Nick's actual SQLite/DuckDB attempts. Use supplied SQLite files
or a verified SQLite-native backup, not a main-file copy of a live database. Retire owned labs
at each checkpoint and verify learner readiness before finishing a batch.

## Sources and open questions

Primary-source findings are linked above and in [duckdbresearch.md](../../duckdbresearch.md),
reviewed on 2026-09-14. Capabilities are documented; lesson outcomes and timings remain untested.
Quack and concurrency sources were reviewed on 2026-09-16 for these route revisions; the new
labs have not been run.

- Use synthetic application/worker/AI records with supplied ground-truth outcomes. The exact
  schemas and implementation details can be settled in their batches without growing scope.
- Before authoring 17, verify direct-open failures, simultaneous read-only access, and ownership
  handoff on the pinned DuckDB CLI with separate live processes and a disposable local file.
  This route revision does not execute the experiment or change authored availability.
- Before authoring 18–19, pin a compatible Quack extension for DuckDB 1.5.5 and verify the
  documented API, remote transaction visibility, explicit remote aggregation/local join, both
  setup choices, and cleanup. The route change does not install or validate Quack.
- The causes of Nick's existing SQLite/DuckDB difficulties remain unknown. Catalog and type
  failures are proposed useful cases, not diagnoses of his actual data.
- Keep live model calls, training, online vector serving, and DuckLake deployment optional and
  outside this route. Source-side query load, local refresh, and ownership need concise context.
- P5 studies a specific publication boundary with supplied operations; it does not establish
  cross-system atomicity, cloud durability, or independent-host fault tolerance.
- Before project implementation, agree the short parts and their numbered placement after the
  core. Optionality does not invent a new progress stage or mark any learner work complete.

## Learner feedback and final sign-off

- 2026-09-16: approved replacing the daily-report lesson with the proposed file-ownership
  experiment. Revision 5 places it at 17 before Quack, moves revision 4 lessons 13–17 to 12–16,
  and retains 32 core lessons and five optional projects. Updated project references and
  supplied-report setup remove reliance on the retired daily-report lesson. This signs off
  the route change; runnable lessons remain a later implementation batch.
- 2026-09-16: approved replacing revision 3 lessons 24 (reviewed-failure curation) and 29
  (memory-policy evaluation) with the proposed two-terminal Quack lessons. Revision 4 places
  them at 18–19 immediately after PostgreSQL write-back, retains 32 core lessons and five
  optional projects, and updates subsequent numbering and project references. This signs off
  the revised route; the request changes the outline, not authored lesson availability.
- 2026-09-14: requested both named setup choices, then generalized this distinction between
  software practice and lab scaffolding across courses. Adopt both in authored DuckDB lessons 1–5;
  the canonical route and future batch authorization remain unchanged.
- 2026-09-14: requested revising authored lessons 1–5 to expose the CLI invocation in place of
  `duck_run`, retaining simple setup/cleanup and editable starters. Record this level of detail
  in teaching guidance; the route's scope, count and lesson order remain the same.
- 2026-09-14: requested a DuckDB course, then specified practical data flows and high-level use;
  this supersedes the original engine-internals assumption and older roadmap emphasis.
- 2026-09-14: requested SQLite and PostgreSQL integration, citing frequent PostgreSQL use and
  existing SQLite/DuckDB attempts. Revision 2 proposed 21 lessons including those workflows.
- 2026-09-14: added distributed systems and AI systems that improve over time as interests;
  requested findings in `duckdbresearch.md` and said he liked its proposed list.
- 2026-09-14: explicitly requested redoing the course around the recommended eight categories
  and placing project practice at the end. Revision 3 implements that planning direction as
  32 core lessons followed by five optional projects. The earlier list-clarification is resolved.
- 2026-09-14: “do first batch of 5 for duckdb course” authorizes the first five lessons of
  revision 3 and serves as its implementation sign-off. No scope/count/order change was made.
- 2026-09-14: selected DuckDB 1.5.5; explicitly required a live state.md event log, final
  knowledge-store reflection, and deletion of state.md when the batch is complete.
- Implementation request: lessons 1–5 only; no later batch or optional project authorized.
