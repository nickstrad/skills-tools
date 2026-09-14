# Practical DuckDB: Data Flows and Improving AI Systems

Status: agreed; first batch authored, validation in progress. Updated: 2026-09-14.
Course ID: `duckdb`. Implementation: lessons 1–5 authored; 6–32 and optional projects planned.
Outline revision: 3. Final-outline sign-off: 2026-09-14 via request to implement its first five lessons.

## Goal and scope

Use DuckDB to connect existing data, build dependable transformations, investigate distributed
work, and measure changes to AI systems. Organize the course around the eight practical uses
in [duckdbresearch.md](../../duckdbresearch.md), with five optional practice projects after
all core lessons, as Nick requested on 2026-09-14.

Assume basic SQL, shell, and application-development knowledge. Nick uses PostgreSQL frequently
and has SQLite/DuckDB attempts he wants to improve. Teach connector setup, source qualification,
type conversion, and unfamiliar SQL explicitly. Prior experience does not establish the causes
of problems in his existing attempts. No previous course completion is required.

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

The route grows from 21 to 32 lessons because the chosen categories add distinct investigations:
worker retries/completeness, AI comparisons and feedback, dataset selection/splits, retrieval,
and memory evaluation. Preserve existing slugs when their questions remain. The standalone
query-work lesson is absorbed into bounded extraction and remote-file selection; the original
end-to-end handoff becomes the shared-dataset lesson and final optional project. These are
revisions to an unimplemented outline, with no learner history to transfer.

One-time setup is provisionally 15–20 minutes through supplied commands: a pinned DuckDB CLI,
matching SQLite/PostgreSQL extensions, native sqlite3/psql clients, small fixtures, and an owned
PostgreSQL instance separate from `/labs/pglab`. A supplied HTTP fixture and matching httpfs
extension are needed only for lesson 31. No tools or labs are created during planning.

## Eight categories and their sequence

| Category | Lessons | Why it comes here |
| --- | --- | --- |
| PostgreSQL analytical companion | 1–2 | Begin with a familiar source and an immediately useful local extract. |
| Combining scattered data | 3–9 | Learn SQLite and file boundaries, then join sources with known types and keys. |
| Repeatable data preparation | 10–17 | Turn one-off exploration into clean stages, checked outputs, and safe reruns. |
| Distributed-system investigations | 18–20 | Apply identifiers, joins, and timestamps to retries, missing work, and delay. |
| AI evaluation and feedback analysis | 21–23 | Compare versions using complete populations and attributable measurements. |
| Evaluation and training dataset preparation | 24–26 | Turn observed failures into curated, separated, reproducible example sets. |
| Retrieval and memory experiments | 27–29 | Use that evaluation discipline to assess retrieved evidence and candidate memories. |
| Shared analytical datasets | 30–32 | Lay out, query, and deliver identified datasets that other workers can consume. |

## Research and breakdown rationale

The [research note](../../duckdbresearch.md) preserves the primary-source review, architecture
ideas, and limits. The outline applies it as follows:

- **Connections before combinations:** SQLite and PostgreSQL attachments expose source data;
  they do not silently convert it into a local DuckDB copy. Source qualification, SQLite value
  conversion, and local extraction each produce a different observable problem. Start with
  read-only sources and reserve writable PostgreSQL output for lesson 17.
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
- **Preparation before diagnosis:** the worker and AI modules reuse clean tables and ordinary
  SQL. Their new ideas are record identity, completeness, comparison populations, and evidence.
  They need separate lessons because a query can run successfully while answering the wrong
  question. Task, trial, and grader distinctions are supported by
  [agent-evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents);
  our specific datasets and exercises are teaching proposals.
- **Evaluation before retrieval experiments:** first establish valid comparisons, then measure
  relevance, answer support, and the effect of memory separately. Supply fixed embeddings and
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
| 12 | Produce a useful daily report / `build-daily-report` | Build a daily run-count and failure-count report at a specified grain; reconcile it with the input. | Grouping and time boundaries define the meaning of a report. |
| 13 | Write outputs another tool can use / `export-and-reopen` | Export a report as CSV and cleaned rows as Parquet, then reopen and compare types and totals. | Check delivery from the consumer side. |
| 14 | Stop bad data before delivery / `validate-before-delivery` | Complete one uniqueness or completeness check in a supplied stage; verify bad input blocks delivery. | SQL success alone does not establish data quality. |
| 15 | Run the flow as a repeatable job / `run-a-sql-job` | Adapt a supplied CLI invocation to a batch and output path; introduce one known SQL error and verify job failure. | Make inputs, outputs, and failure behavior explicit. |
| 16 | Rerun a batch without double counting / `replace-a-daily-batch` | Complete transactional replacement of a known complete source day; rerun and verify identical results with other days preserved. | A clear replacement boundary makes retries repeatable. |
| 17 | Send a checked result back to PostgreSQL / `write-postgres-result` | Complete a column mapping into an owned reporting table using a supplied replacement pattern; rerun and verify keys and totals in psql. | Local transformation and destination commit are separate responsibilities. |
| 18 | Separate logical work from retries / `identify-worker-attempts` | Choose keys that remove duplicate event deliveries while retaining distinct attempts; reconcile logical tasks and attempts. | A retry is different from a duplicate copy of an event. |
| 19 | Find work that never produced a result / `find-missing-worker-results` | Join accepted jobs with terminal attempts and published results using a supplied observation cutoff; identify pending and missing outcomes. | Successful rows cannot establish the completeness of the whole workload. |
| 20 | Locate delay in a worker flow / `locate-worker-delay` | Separate queue and execution time from supplied compatible timestamps; identify the stage responsible for a changed latency distribution. | Attribute delay to a stage; cross-host timestamps alone do not prove causality. |
| 21 | Compare AI versions on the same tasks / `compare-ai-versions` | Construct a same-task baseline/candidate comparison including failed and missing trials; identify one regression category. | An easier or incomplete task population can mimic improvement. |
| 22 | Compare quality with usage fairly / `compare-quality-and-usage` | Aggregate multiple grades to the intended run grain before joining token/latency records; verify totals and compare verified outcomes with usage. | A many-to-many join can invent cost or apparent success. |
| 23 | Connect user feedback to measured outcomes / `reconcile-ai-feedback` | Join delayed corrections to runs and automated grades; separate disagreement, explicit negative feedback, and missing feedback. | Feedback is attributable evidence, not automatically a ground-truth label. |
| 24 | Turn reviewed failures into useful examples / `curate-learning-examples` | Complete selection rules using supplied review labels; preserve raw examples and provenance while excluding unreviewed or duplicate candidates. | A curated dataset has explicit inclusion criteria. |
| 25 | Keep evaluation examples separate / `separate-evaluation-data` | Repair a split that places related examples on both sides by assigning whole source groups; verify no forbidden overlap remains. | Leakage can make a weak change look effective. |
| 26 | Identify a reproducible dataset version / `version-evaluation-dataset` | Complete a manifest of source versions, transformation version, and split identity; reproduce a supplied result from those identified inputs. | Reproduction needs more than a filename or a timestamp. |
| 27 | Measure whether retrieval finds useful evidence / `measure-retrieval-relevance` | Compare supplied retrieval configurations against fixed relevance labels; compute hit-at-k by query, including empty results. | Evaluate retrieved evidence on a fixed question set. |
| 28 | Separate retrieval success from answer success / `trace-answer-support` | Join retrieved document versions, answers, and supplied support/correctness labels; isolate a case where relevant retrieval still produced a bad answer. | Retrieval quality and answer quality are separate measurements. |
| 29 | Test whether a memory policy helps / `evaluate-memory-policy` | Compare matched runs with and without candidate memories; retain memory provenance and identify one helped and one harmed task. | Remembering more is not evidence of improving. |
| 30 | Lay out Parquet for downstream queries / `partition-parquet-output` | Choose a useful date partition key; query one partition and inspect selected files and results. | Dataset layout should match consumer selection. |
| 31 | Query files where they live / `query-remote-parquet` | Adapt a Parquet query to a supplied local HTTP endpoint, narrow columns/rows, and verify its answer and request evidence. | Remote analytical reads can be selective; measure work rather than assuming a speedup. |
| 32 | Deliver an identified, complete dataset / `deliver-a-validated-batch` | Complete a supplied reader's choice of accepted manifest, check expected file identities, and reject a missing-input candidate while preserving the previous result. | Candidate files and a published complete dataset are different states. |

## Optional project practice — after the lessons

The five projects follow all 32 core lessons. They integrate already-taught ideas and introduce
no new required concepts. Each has a supplied starter, finite data, cleanup, a useful learner
implementation/diagnostic decision, and evidence to check. No mandatory written report or
answer submission. The estimates below cover the whole project, not one ten-minute lesson.

| Order | Project / stable slug | Uses lessons | Practice and evidence | Suggested sessions |
| --- | --- | --- | --- | --- |
| P1 | Compare two AI versions / `practice-ai-version-comparison` | 12–16, 21–23 | Build a same-task report from supplied run, grade, feedback, and usage data. Account for missing trials, expose a regression, and verify denominators and totals. | 3 × 10–15 min: assemble, compare, verify. |
| P2 | Repair a SQLite-to-DuckDB flow / `practice-sqlite-flow-repair` | 3–6, 9–16 | Diagnose one supplied catalog/type failure, repair the transformation, and export a checked dataset with every source row accounted for. | 2–3 × 15 min: diagnose, repair, verify as needed. |
| P3 | Reconcile two worker outputs / `practice-worker-reconciliation` | 10, 14, 18–20, 32 | Complete retry deduplication and a completeness decision in a supplied two-worker flow. Reconcile sums/counts against a known single-worker answer; reject a missing shard. | 3–4 × 10–15 min: inspect, reconcile, inject omission, verify. |
| P4 | Improve a retrieval configuration / `practice-retrieval-comparison` | 21, 24–29 | Compare two supplied retrieval-result sets and answer labels. Choose one consequential configuration change from supplied variants, identify tradeoffs, and rerun the fixed comparison. | 3 × 10–15 min: baseline, change, verify. |
| P5 | Publish a repeatable evaluation batch / `practice-evaluation-publication` | 14–17, 26, 30–32 | Complete the acceptance decision around supplied immutable-file and PostgreSQL metadata operations. Interrupt after output creation, retry, and prove no duplicate acceptance or publication of an incomplete batch. | 3–4 × 10–15 min: inspect, complete, interrupt/retry, verify. |

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
               +--> worker attempts -> missing work / delay
               |
               +--> AI runs + grades + feedback -> compare versions
               |                                      |
               |                                      v
               |                              curated evaluation data
               |                                      |
               |                                      v
               |                              retrieval / memory tests
               v
     identified Parquet batch -> accepted manifest -> downstream reader
```

Use attachment/extraction maps in 1–4, before/after rows and join-grain diagrams in 5–14,
a batch-replacement diagram in 16–17, task/attempt/event timelines in 18–20, matched trial
and grader maps in 21–23, provenance and split diagrams in 24–26, retrieval/answer/memory
maps in 27–29, and partition plus candidate/accepted-state diagrams in 30–32. Place each
before setup and connect its labels to evidence. Plain Markdown/ASCII remains sufficient.

## Delivery and implementation boundary

Show the planned route with `tutor duckdb route`. Once lessons exist, use
`tutor duckdb <n> lesson|done` through the shared tutor. A lesson contains explanation, the
bounded learner task, commands, expected evidence, interpretation, and cleanup. Only explicit
progress operations change progress. There is no required quiz, homework, external reading,
review, or submission stage.

The 2026-09-14 implementation request authorizes lessons 1–5 of this revision. The user selected
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

- Use synthetic application/worker/AI records with supplied ground-truth outcomes. The exact
  schemas and implementation details can be settled in their batches without growing scope.
- The causes of Nick's existing SQLite/DuckDB difficulties remain unknown. Catalog and type
  failures are proposed useful cases, not diagnoses of his actual data.
- Keep live model calls, training, online vector serving, and DuckLake deployment optional and
  outside this route. Source-side query load, local refresh, and ownership need concise context.
- P5 studies a specific publication boundary with supplied operations; it does not establish
  cross-system atomicity, cloud durability, or independent-host fault tolerance.
- Before project implementation, agree the short parts and their numbered placement after the
  core. Optionality does not invent a new progress stage or mark any learner work complete.

## Learner feedback and final sign-off

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
