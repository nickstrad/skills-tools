# Practical DuckDB: Data Flows and Improving AI Systems

Status: partly implemented; two batches validated. Updated: 2026-09-16.
Course ID: `duckdb`. Implementation: lessons 1–10 authored and validated; 11–32 and optional projects planned.
Outline revision: 8. Final-outline sign-off: 2026-09-16 via approval of the three observability lesson swaps and project revision.

## Goal and scope

Use DuckDB to connect existing data, build dependable transformations, investigate distributed
work, and measure changes to AI systems. Build on the eight practical uses in
[duckdbresearch.md](../../duckdbresearch.md), adding interactive CLI configuration, file
ownership, Quack client/server access, connection secrets, and Prometheus/OpenTelemetry
investigations as Nick approved on 2026-09-16. Five optional practice projects follow all core lessons.

Assume basic SQL, shell, and application-development knowledge. Nick uses PostgreSQL frequently
and has SQLite/DuckDB attempts he wants to improve. Teach connector setup, source qualification,
type conversion, and unfamiliar SQL explicitly. Prior experience does not establish the causes
of problems in his existing attempts. No previous course completion is required.

Nick works in an observability organization whose offering includes a Prometheus-compliant
wire-protocol API and substantial OpenTelemetry work (2026-09-16). Use that domain familiarity
to motivate DuckDB practice, without assuming which endpoints or authentication his product
exposes. The Prometheus lesson targets the query HTTP API; it does not exercise remote-write
ingestion or certify compatibility with his work service. Use supplied local services and
synthetic telemetry, with no workplace data or credentials required.

Nick clarified on 2026-09-14 that he is brand new to DuckDB and wants CLI muscle memory.
Keep environment/fixture setup and cleanup in helpers, while showing the `duck` invocation,
database target, SQL input and flags. Learners edit a supplied starter and run it themselves;
explain what each call does and retains. Apply this to the first five lessons and later batches.

On 2026-09-16 Nick requested sustained interactive CLI practice with persisted data. Lessons
6 and 13 use SQL and dot commands entered at the DuckDB prompt, including closing and reopening
the database. Their supplied task prompts and syntax examples replace the edited-script Run
workflow; fixture preparation and cleanup still use helpers. Preserve their view/table freshness
and consumer-side export checks. Later lessons may use scripts when repeatable execution is
the point, as in lesson 15. Settings at 7, secrets at 20, and observability at 22–24 also use
interactive commands, with a second terminal for the live OTLP sender in 24.

The follow-up requests two alternatives: **Setup - manual** exposes the target software's
native preparation and inspection; **Setup - script** bypasses that work once familiar. Both
keep lab folders, fixtures, variables and cleanup in helpers and share the same visible Run.
This is now the common approach for authoring/revising lessons across courses, first applied here.

Start with small application records, then use supplied synthetic worker events, AI run results,
grades, Prometheus series, and OTLP traces/logs. Give each lesson its own complete starting
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

Revision 6 repurposes revision 5 lessons 11 and 12 as interactive CLI lessons, retaining their
core concepts and stable slugs. The persistence/view-versus-table lesson moves to 6, immediately
after the first CSV lesson; former lessons 6–10 move to 7–11. Interactive export remains at 12.
The route still has 32 lessons, including worker-delay lesson 22 and the file-ownership/Quack
sequence at 17–19. Each interactive lesson targets 10–15 minutes with 3–5 minutes of learner work.

Revision 7 replaces revision 6 lesson 22 (worker-delay analysis) and 25 (AI-feedback analysis)
with settings at 7, immediately after interactive persistence, and secrets at 20, immediately
after the first Quack lesson. The remaining lessons retain their slugs and relative order.
File ownership moves to 18, Quack access to 19, and remote/local computation to 21. Core count
remains 32, with five optional projects. Settings and reusable credentials add DuckDB-specific
practice across workflows; the removed topics were specialized analysis applications. Projects
use the retained concepts without requiring the retired delay or feedback investigations.

Revision 8 replaces revision 7 lessons 26 (evaluation splits), 28 (retrieval relevance), and
29 (answer support) with three observability lessons at 22–24, immediately after Quack.
Worker investigations move to 25–26, AI comparisons to 27–28, and reproducible dataset identity
to 29. The latter retains its stable slug and uses source/query/window provenance without
depending on the removed split lesson. P4 becomes an observability investigation. The core
remains 32 lessons with five optional projects; retained lessons keep their stable slugs.

One-time setup is provisionally 15–20 minutes through supplied commands: a pinned DuckDB CLI,
matching SQLite/PostgreSQL extensions, native sqlite3/psql clients, small fixtures, and an owned
PostgreSQL instance separate from `/labs/pglab`. A supplied HTTP fixture and matching httpfs
extension are needed only for lesson 31. Lessons 19–21 also require a matching pinned Quack
extension and two local DuckDB CLI processes; lesson 20 supplies disposable credentials and
an isolated secret directory. Lessons 22–24 require compatible pinned `prometheus` and `otlp`
community extensions, a supplied local Prometheus instance with bounded fixtures for 22,
small OTLP exports for 23, and a native OTLP/HTTP listener plus supplied sender payloads for 24.
Quack and observability setup time and resource use must be measured during implementation;
the original 15–20 minute estimate does not establish the expanded setup cost. No tools or
labs are created during planning.

## Categories and their sequence

| Category | Lessons | Why it comes here |
| --- | --- | --- |
| PostgreSQL analytical companion | 1–2 | Begin with a familiar source and an immediately useful local extract. |
| Combining, retaining, and configuring data work | 3–11 | Learn SQLite and file boundaries, persist work and inspect settings interactively, then join sources with known types and keys. |
| Repeatable data preparation and delivery | 12–17 | Deduplicate, inspect and export interactively, then build checked outputs and safe reruns. |
| File ownership, Quack, and connection secrets | 18–21 | Establish direct-file access rules, then practice remote writes, credential reuse, and remote computation. |
| Observability with Prometheus and OpenTelemetry | 22–24 | Query metrics, correlate telemetry exports, and receive live OTLP data after learning process and connection boundaries. |
| Distributed-system investigations | 25–26 | Apply identifiers and joins to retries and missing work. |
| AI evaluation and usage analysis | 27–28 | Compare versions using complete populations and attributable measurements. |
| Reproducible dataset identity | 29 | Identify the source data and query needed to reproduce an investigation or evaluation. |
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
- **Interactive persistence before larger flows:** lesson 6 opens a named DuckDB file, stores
  selected data, compares a view with a stored query result after a source change, and verifies
  both survive a fresh CLI session. Lesson 13 builds on that navigation to refine a query and
  export/reopen its results. Keep database persistence distinct from writing terminal output;
  explain that `.open` switches connections rather than saving an in-memory database to a file.
  [CLI overview](https://duckdb.org/docs/current/clients/cli/overview), reviewed 2026-09-16,
  and [COPY](https://duckdb.org/docs/current/sql/statements/copy).
- **Inspect settings and verify their effect:** lesson 7 distinguishes metadata-returning
  pragmas from configuration changes through `SET`, inspects effective values, and observes
  null ordering before and after a change. Explicit query ordering, reset, and a fresh CLI
  process expose different sources of behavior. Inspect resource settings without claiming
  that more threads guarantee a speedup or that `memory_limit` caps total process memory.
  [Pragmas](https://duckdb.org/docs/current/configuration/pragmas), reviewed 2026-09-16.
- **Credential lifetime after basic remote access:** lesson 20 uses a supplied local Quack
  server to practice scoped temporary and persistent secrets, a fresh client, and explicit
  removal. The secret store is separate from the opened database and stores persistent
  secrets unencrypted. Use an owned directory and lab-only tokens; scope matching is client
  credential selection, not server-side authorization.
  [Secrets Manager](https://duckdb.org/docs/current/configuration/secrets_manager), reviewed
  2026-09-16, and [Quack authentication](https://duckdb.org/docs/current/quack/overview#authentication).
- **One transformation decision per lesson:** types, nested rows, schema combination,
  deduplication, joins, and grouping affect different correctness conditions. File readers and
  COPY provide the practical mechanics; setup is supplied so the learner works on data meaning.
  [CSV](https://duckdb.org/docs/current/data/csv/overview),
  [JSON](https://duckdb.org/docs/current/data/json/loading_json),
  [schema combination](https://duckdb.org/docs/current/data/multiple_files/combining_schemas),
  [COPY](https://duckdb.org/docs/current/sql/statements/copy).
- **File ownership before remote access:** distinguish separate database files, shared read-only
  access, and a single process owning read-write access to a native DuckDB file. Lesson 18
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
- **Observability as DuckDB practice:** `prometheus` provides PromQL query/discovery functions;
  `otlp` provides telemetry file readers and a native ingestion endpoint. These are community
  extensions, with exact APIs and schemas to be checked against pinned artifacts. The documented
  Prometheus client lacks authentication/custom headers and SQL-to-PromQL pushdown; bound the
  source query explicitly and use a local fixture. The OTLP community page and upstream docs
  differ on schemas and transport support, so begin with file readers and OTLP/HTTP, without
  assuming upstream gRPC features exist in the installed release.
  [Prometheus listing](https://duckdb.org/community_extensions/extensions/prometheus),
  [Prometheus limitations](https://github.com/botan/duckdb-prometheus#limitations),
  [OTLP listing](https://duckdb.org/community_extensions/extensions/otlp),
  [OTLP upstream](https://github.com/smithclay/duckdb-otlp), reviewed 2026-09-16.
- **Accepted telemetry and committed data are separate observations:** lesson 24 checks the
  extension's buffered acceptance, explicit flush/stop, and reopened data. This teaches the
  documented extension behavior, not a universal OTLP acknowledgment guarantee. Successful
  normal reopen does not prove power-loss durability or exactly-once ingestion.
  [OTLP live-ingest reference](https://smithclay.github.io/duckdb-otlp/reference/serve/).
- **Dataset identity before sharing:** record source and transformation provenance before consuming
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

Lessons 1–10 are authored; remaining rows are planned. The category table above groups this
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
| 6 | Build and reopen a persistent database in the CLI / `organize-sql-stages` | At the interactive prompt, store a chosen CSV subset in a named database, create a view and a stored result over it, change a source row, then exit/reopen and inspect the differing results. | Persisted views retain a query; stored tables retain rows until explicitly changed or rebuilt. |
| 7 | Inspect, change, and reset DuckDB settings / `inspect-change-reset-settings` | Inspect metadata with pragmas and values with `duckdb_settings()`/`current_setting()`; change `default_null_order`, make a query's null ordering explicit, reset, and compare a fresh CLI process. | Configuration can change unchanged SQL; explicit query choices and inspected effective values make behavior understandable. |
| 8 | Make messy input types explicit / `clean-input-types` | Choose types and a conversion rule for identifiers, amounts, and one malformed value; inspect accepted and rejected rows. | Inference is a starting point for a data contract. |
| 9 | Turn nested JSON into rows / `flatten-json-records` | Adapt extraction of a tool-event array while retaining run IDs; reconcile expanded event counts. | Decide what one output row means before joining or aggregating. |
| 10 | Combine batches as schemas change / `combine-file-batches` | Read two file versions by column name, retain provenance, and handle a missing field; verify rows and nulls. | Schema evolution needs an explicit policy. |
| 11 | Join SQLite, PostgreSQL, and file data / `join-reference-data` | Complete a join across a PostgreSQL extract, SQLite reference rows, and a CSV lookup; detect a duplicate reference key and verify unmatched keys. | Cross-source joins need compatible types and known key cardinality. |
| 12 | Keep one authoritative record / `deduplicate-records` | Complete a window ordering rule with a stable tie-breaker; verify the winning record for each key. | Deduplication requires identity and a deterministic winner. |
| 13 | Explore saved data and export a result interactively / `export-and-reopen` | Open a supplied database, inspect its schema, refine a query and correct a specified row at the prompt; export CSV with `.once` and Parquet with `COPY`, then reopen and compare types and totals. | Saving database changes and exporting query results are separate actions; verify delivery from the consumer side. |
| 14 | Stop bad data before delivery / `validate-before-delivery` | Complete one uniqueness or completeness check in a supplied stage; verify bad input blocks delivery. | SQL success alone does not establish data quality. |
| 15 | Run the flow as a repeatable job / `run-a-sql-job` | Adapt a supplied CLI invocation to a batch and output path; introduce one known SQL error and verify job failure. | Make inputs, outputs, and failure behavior explicit. |
| 16 | Rerun a batch without double counting / `replace-a-daily-batch` | Complete transactional replacement of a known complete source day; rerun and verify identical results with other days preserved. | A clear replacement boundary makes retries repeatable. |
| 17 | Send a checked result back to PostgreSQL / `write-postgres-result` | Complete a column mapping into an owned reporting table using a supplied replacement pattern; rerun and verify keys and totals in psql. | Local transformation and destination commit are separate responsibilities. |
| 18 | Understand who owns a DuckDB database file / `understand-duckdb-file-ownership` | Keep A open read-write and observe B's direct open fail, including read-only; close A and query from both read-only, then arrange the connections to permit a write and verify its stored result. | Direct access to one native file supports one read-write process or multiple read-only processes; server-mediated access uses a different boundary. |
| 19 | Serve a DuckDB database and change it from another terminal / `serve-duckdb-with-quack` | Start a Quack listener in terminal A and authenticate/attach from a separate DuckDB CLI in B; complete a qualified remote update and observe it from A before and after commit, then try rollback. | The serving process owns the database; remote writes have transaction boundaries. |
| 20 | Create, scope, and reuse a connection secret / `manage-connection-secrets` | Create a scoped temporary Quack secret and attach; inspect metadata and restart the client, then create a persistent secret in an isolated store, restart/reconnect, and remove it. | Credential lifetime and storage are separate from the database file; a scope selects credentials for an endpoint. |
| 21 | Combine local data with a remote DuckDB result / `combine-local-and-remote-duckdb` | With worker events on A and a local lookup on B, construct an aggregation inside `remote.query(...)`, join its result to B's lookup, and reconcile supplied totals. | A DuckDB client can compute locally while explicitly sending selected work to the server. |
| 22 | Query a Prometheus API and retain an investigation locally / `query-prometheus-investigation` | At the CLI, complete a bounded `prometheus_scan` expression/window/step, preserve series labels, join a local service-owner table, and save/reopen the result in DuckDB. | PromQL controls remote selection and evaluation; SQL enriches the returned result, which can be retained for investigation. |
| 23 | Investigate OpenTelemetry traces and logs with SQL / `investigate-otlp-traces-logs` | Inspect supplied OTLP exports through `read_otlp_traces` and `read_otlp_logs`; identify a failing operation, correlate its logs by trace/span IDs, and persist a bounded evidence set. | Typed telemetry readers support investigation, while correct correlation keys prevent unrelated logs from multiplying across spans. |
| 24 | Receive live OTLP data and verify what persisted / `receive-persist-otlp` | Start `otlp_serve` on an owned database in A, send a small supplied OTLP/HTTP payload from B, inspect acceptance/commit counters, flush and stop, then reopen and reconcile record identities/counts. | This extension buffers accepted telemetry before commit; explicit flush/stop and reopened records establish the observed persistence boundary. |
| 25 | Separate logical work from retries / `identify-worker-attempts` | Choose keys that remove duplicate event deliveries while retaining distinct attempts; reconcile logical tasks and attempts. | A retry is different from a duplicate copy of an event. |
| 26 | Find work that never produced a result / `find-missing-worker-results` | Join accepted jobs with terminal attempts and published results using a supplied observation cutoff; identify pending and missing outcomes. | Successful rows cannot establish the completeness of the whole workload. |
| 27 | Compare AI versions on the same tasks / `compare-ai-versions` | Construct a same-task baseline/candidate comparison including failed and missing trials; identify one regression category. | An easier or incomplete task population can mimic improvement. |
| 28 | Compare quality with usage fairly / `compare-quality-and-usage` | Aggregate multiple grades to the intended run grain before joining token/latency records; verify totals and compare verified outcomes with usage. | A many-to-many join can invent cost or apparent success. |
| 29 | Identify a reproducible dataset version / `version-evaluation-dataset` | Complete a manifest of source versions, extraction query/time bounds, and transformation version; reproduce a supplied result from those identified inputs. | Reproduction needs more than a filename or a timestamp. |
| 30 | Lay out Parquet for downstream queries / `partition-parquet-output` | Choose a useful date partition key; query one partition and inspect selected files and results. | Dataset layout should match consumer selection. |
| 31 | Query files where they live / `query-remote-parquet` | Adapt a Parquet query to a supplied local HTTP endpoint, narrow columns/rows, and verify its answer and request evidence. | Remote analytical reads can be selective; measure work rather than assuming a speedup. |
| 32 | Deliver an identified, complete dataset / `deliver-a-validated-batch` | Complete a supplied reader's choice of accepted manifest, check expected file identities, and reject a missing-input candidate while preserving the previous result. | Candidate files and a published complete dataset are different states. |

### Interactive CLI lesson boundaries

Lessons 6 and 13 each supply an independent small fixture, a clear task, concise syntax
examples, expected evidence, and cleanup. Keep work at a live DuckDB prompt: no SQL piped in,
`-c` command, `.read` file, or finished script substitutes for the learner's core experiment.
Label shell commands versus DuckDB SQL and dot commands. Explain semicolon-terminated SQL,
single-line dot commands without semicolons, and the named database path before starting.
Use a small set of navigation tools such as `.help`, `.tables`, and `DESCRIBE`; avoid a tour
of every CLI option. Both setup choices prepare fixtures without doing the learner's work.

In 6, supply a clean CSV and short statement templates. The learner chooses a bounded subset
to store in a base table, then expresses the same simple selection as a view and a stored
result table. Change one base-table row to expose freshness: the view reflects the change,
while the earlier stored result does not refresh automatically. Exit and reopen the named
database to verify persisted rows and the view definition through their results. The learner
chooses which representation fits a supplied freshness requirement. Keep this to a small
predicate and one row change so persistence and freshness fit within 15 minutes. Use a view
over the internal base table to avoid external-file dependencies obscuring the result.

Explain the default in-memory session versus a named persistent database, and that `.open`
closes the current database rather than copying its contents. Committed database changes
persist; leaving an explicit transaction uncommitted is not a save workflow. Detailed
transaction and file-ownership experiments belong to later lessons.

In 13, supply a persistent database with cleaned rows and a small report fixture. The learner
inspects columns and sample rows, refines one selection, and makes one bounded correction
before exporting. Teach `.mode csv`, headers, `.once`, and restoring terminal display for
the CSV output; use SQL `COPY` for Parquet. Reopen the database and read back both exports to
check the correction, intended row set, totals, and types. Explain CSV type inference versus
Parquet's stored types. Provide expected counts and an identifier whose interpretation makes
the type comparison useful. Keep the task bounded; no additional reporting pipeline is built.

### Settings and secrets lesson boundaries

Lessons 7 and 20 each target 10–15 minutes, including 3–5 minutes of learner work at the
interactive CLI. Supply independent fixtures, syntax examples, observable success criteria,
both setup choices where useful, and cleanup. Helpers must not make the setting or secret
choices that constitute the learner task.

In 7, supply a tiny table with distinct values and one null. Use `PRAGMA database_list` and
`PRAGMA table_info` for metadata, then inspect selected rows from `duckdb_settings()` and
read a value through `current_setting()`. Teach `SET` and `RESET` alongside pragmas rather
than treating all pragmas as interchangeable configuration assignments. The learner changes
`default_null_order`, compares the same `ORDER BY` query, and adds explicit `NULLS FIRST`
or `NULLS LAST` to meet a supplied output requirement under either default. Reset the setting
and restart the CLI to inspect the new process's effective value. Account for course wrapper
and startup configuration; do not describe reset as restoring an arbitrary previous value
or runtime settings as saved in the database file. Inspect `threads` and `memory_limit`
without changing the course's resource caps; explain that the latter is not a total process
memory ceiling. Resource tuning and profiling remain optional depth, with no timing claim.

In 20, supply a local Quack server, a disposable token, and an owned empty secret directory.
The learner constructs the endpoint scope and chooses temporary versus persistent lifetime
to satisfy a reconnect requirement. Use `CREATE SECRET`, a fresh attachment without an
explicit token override, and redacted metadata from `duckdb_secrets()`. Restart the client
to establish that the temporary secret is absent, then use `CREATE PERSISTENT SECRET` and
restart/reconnect successfully with the same secret directory configured again. Explain that
`secret_directory` itself must be reapplied in each new process. Show that the store is outside
the database file and that persistent secrets are unencrypted; use lab credentials only and
leave the learner's normal secret store untouched. End with `DROP PERSISTENT SECRET` and
verify removal through metadata and a fresh client. Existing authenticated connections are
not evidence of credential removal, so disconnect before checking fresh authentication.

Keep the server alive across client restarts and supply its process management so the lesson
focuses on secrets. An optional bounded variation uses `which_secret()` and overlapping scopes
to inspect longest-prefix selection; validate this with the pinned Quack extension before
publishing. Cloud credential chains, remote deployments, and authorization policy are outside
the core. Cleanup removes only the owned secret store, fixtures, and server.

### File-ownership and Quack lesson boundaries

Lesson 18 targets 10–15 minutes including a 3–5 minute learner task. Supply one disposable
native DuckDB file on local disk, two labelled terminal sessions, the CLI access-mode syntax,
expected lock-error evidence, and cleanup. Keep the first connection alive while testing the
second; show both unsuccessful read-write and read-only opens against A's read-write ownership.
After closing A, show both processes reading with explicit read-only access. The learner then
chooses which connections to close and how to reopen for a write, verifies the stored change,
and closes both sessions. Check the actual lock failure and data result during authoring.

Explain the distinction between processes and connections before commands. Separate files
represent independent databases. Multiple connections inside one owning process can perform
concurrent work; they are not the two independent CLI processes in this experiment. Bridge to
19 by showing how Quack clients reach the owning server rather than opening its file directly.
Supply file preparation and cleanup through the usual helpers while keeping open/close and
access-mode choices visible. Do not add network filesystems, DuckLake deployment, or a second
conflicting-transaction experiment to this core lesson.

Each of lessons 19 and 21 targets 10–15 minutes including context, setup, 3–5 minutes of learner
work, evidence, and cleanup. Supply an independent fixture for each, local ports, authentication
details, connection syntax, and deterministic terminal ordering. Keep both DuckDB processes
alive throughout the experiment. Show the CLI invocation, `quack_serve`, attachment, query,
and stop commands explicitly; helpers prepare files and fixtures and clean owned processes.
Retain the common script/manual setup choices without hiding the mechanism being taught.

In 19, A opens the owned database file and serves it; B opens its own DuckDB session and
accesses A through Quack. The learner completes the remote table qualification and update.
Use fresh observation statements in A around B's commit/rollback so an unrelated long-lived
snapshot does not obscure the experiment. Confirm visible row values, not just command success.
In 21, supply the connection plumbing and reserve the aggregation and local join for the learner.
Use explicit remote SQL and reconciled totals as evidence; do not infer a speedup or claim that
every operation in an arbitrary attached-catalog query executes remotely.

An optional variation in 21 lets B serve its own local table on a second port and A attach to
B, demonstrating that either process can take the client or server role. Keep the objects
distinct and the query path finite. This is remote access, not replication or automatic
distributed coordination. The variation adds no core lesson or third required terminal.

### Observability lesson boundaries

Each of lessons 22–24 targets 10–15 minutes with 3–5 minutes of meaningful learner work.
Supply independent, small synthetic fixtures, simple setup/cleanup, syntax examples, and exact
expected evidence. Teach unfamiliar extension SQL while relying on Nick's stated observability
background for context. Keep inspection and query construction at the interactive CLI; helpers
prepare services and data without choosing the learner's query, correlation, or persistence
check. Use compatible pinned community extension artifacts and verify actual column names/types.

In 22, prepare a local Prometheus instance with deterministic series and a known query window,
plus a local service-owner lookup with unique keys. The learner chooses the PromQL selection,
fixed bounds and evaluation step, preserves series identity, joins the ownership data, and
materializes the answer in a named DuckDB file. Reopen and reconcile the intended series,
timestamps, and totals against supplied evidence. Explain that range-query output consists of
evaluations at the requested step, which is different from a scrape interval; avoid interpreting
the number of returned points as the number of original observations. Select a simple gauge or
`up` fixture so counter/rate semantics do not become a second lesson. Demonstrate the remote/local
query boundary without a benchmark. The query API is the scope, not a remote-write sender or
receiver. Use a bounded unauthenticated local endpoint; do not imply the extension can consume
DuckDB secrets or inject tenant/auth headers that its documented client does not support.

In 23, supply small trace and log exports with known IDs, one failing operation, multiple spans
in a trace, and a log without a usable span ID. Inspect the output of `read_otlp_traces` and
`read_otlp_logs` before constructing a bounded correlation on both trace and span IDs. Retain
unmatched evidence separately rather than attaching it to an arbitrary span. The learner fixes
a trace-only join that would multiply logs and saves the selected evidence locally. Validate
identities and match counts, not just a plausible error summary. Pin the schema and explain
timestamp/duration units as actually returned; community examples and upstream schemas differ.

In 24, A opens a disposable persistent database and starts `otlp_serve`; B sends a small
supplied OTLP/HTTP payload using visible HTTP commands with a lab-only token. Reserve the
learner's task for reconciling expected IDs/counts with committed rows and choosing an explicit
flush before inspection. Observe the response and available server counters, use `otlp_flush`,
then `otlp_stop` before closing A and reopening the file to verify stored records. Automatic
background commits can race observations: do not require buffered rows to remain invisible for
an assumed number of seconds. Validate deterministic ordering or a supported bounded flush
interval during authoring. Explain that the extension's accepted response precedes its commit
guarantee; do not treat this as a blanket statement about all OTLP receivers. Use normal stop
and reopen, with no crash, backpressure, or throughput test added to the core. No Collector
deployment, gRPC/OTAP transport, or lakehouse setup is required. Retire only owned listeners/files.

## Optional project practice — after the lessons

The five projects follow all 32 core lessons. They integrate already-taught ideas and introduce
no new required concepts. Each has a supplied starter, finite data, cleanup, a useful learner
implementation/diagnostic decision, and evidence to check. No mandatory written report or
answer submission. The estimates below cover the whole project, not one ten-minute lesson.

| Order | Project / stable slug | Uses lessons | Practice and evidence | Suggested sessions |
| --- | --- | --- | --- | --- |
| P1 | Compare two AI versions / `practice-ai-version-comparison` | 13–16, 27–28 | Build a same-task report from supplied run, grade, and usage data. Account for missing trials, expose a regression, and verify denominators and totals. | 3 × 10–15 min: assemble, compare, verify. |
| P2 | Repair a SQLite-to-DuckDB flow / `practice-sqlite-flow-repair` | 3–6, 8, 11–16 | Diagnose one supplied catalog/type failure, repair the transformation, and export a checked dataset with every source row accounted for. | 2–3 × 15 min: diagnose, repair, verify as needed. |
| P3 | Reconcile two worker outputs / `practice-worker-reconciliation` | 12, 14, 25–26, 32 | Complete retry deduplication and a completeness decision in a supplied two-worker flow. Reconcile sums/counts against a known single-worker answer; reject a missing shard. | 3–4 × 10–15 min: inspect, reconcile, inject omission, verify. |
| P4 | Preserve and investigate an observability incident / `practice-observability-investigation` | 13–14, 22–24, 29 | Use a bounded Prometheus result to select a service/time window, correlate the supplied OTLP traces and logs, receive a small additional log batch, and persist/reopen identified evidence with a manifest. Verify series/record identities and avoid join multiplication. | 3 × 10–15 min: scope, correlate, persist/verify. |
| P5 | Publish a repeatable evaluation batch / `practice-evaluation-publication` | 14–17, 29–32 | Complete the acceptance decision around supplied immutable-file and PostgreSQL metadata operations. Interrupt after output creation, retry, and prove no duplicate acceptance or publication of an incomplete batch. | 3–4 × 10–15 min: inspect, complete, interrupt/retry, verify. |

These are separate optional project plans, not numbered core lessons or a separate review
stage. Their practice ordering is explicit here; the plan-only tutor route lists the 32 core
lessons. Implementation of a selected project must use the shared lesson interface for its
short authored parts, with an agreed placement after the core; do not create a project-specific
renderer or completion system during planning.

P4 supplies services, payloads, and evidence expectations. Metrics select an investigation
window; trace/span IDs establish log-to-span matches. A shared service label or overlapping
timestamp alone does not prove that a metric and a span describe the same request or its cause.
Keep the deliverable to saved tables/exports and a supplied manifest template, with no dashboard,
incident platform, workplace endpoint, or new telemetry protocol required.

## Visual teaching plan

Use this evolving terminal-readable flow before the relevant experiment commands:

```text
PostgreSQL + SQLite + CSV/JSON
               |
               v
     DuckDB: clean -> join -> validate
               |
               +--> inspect settings -> change -> observe -> reset / restart
               |
               +--> file ownership -> Quack server A <-> DuckDB client B + local lookup
               |                                            |
               |                                  scoped connection secrets
               |
               +--> Prometheus query API -> bounded metrics -> saved investigation
               |
               +--> OTLP files -> trace/log correlation -> saved evidence
               |
               +--> OTLP/HTTP sender -> buffer -> flush / stop -> reopen records
               |
               +--> worker attempts -> missing work
               |
               +--> AI runs + grades + usage -> compare versions
               |                                      |
               |                                      v
               |                              identified evaluation data
               v
     identified Parquet batch -> accepted manifest -> downstream reader
```

Use attachment/extraction maps in 1–4, a session/file and view/stored-result map in 6, and a
setting/query/reset timeline in 7. Use before/after rows and join-grain diagrams in 5 and 8–12,
database/output-file maps in 13, validation evidence in 14, a batch-replacement diagram in
16–17, and a two-process file-access map in 18. Show server ownership and execution in 19
and 21, with a client/secret-store/restart map in 20. Show PromQL-to-SQL execution in 22,
trace/span/log identity in 23, and a sender/buffer/commit/reopen timeline in 24. Use
task/attempt/event timelines in 25–26, matched trial and grader maps in 27–28, source/query
provenance in 29, and partition plus candidate/accepted-state diagrams in 30–32.
Place each before setup and connect its labels to evidence. Plain Markdown/ASCII remains sufficient.

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
Quack, concurrency, CLI, pragmas, Secrets Manager, Prometheus, and OTLP sources were reviewed
on 2026-09-16 for these route revisions; the new labs have not been run.

- Use synthetic application/worker/AI/telemetry records with supplied ground-truth outcomes. The exact
  schemas and implementation details can be settled in their batches without growing scope.
- Before authoring 6 and 13, validate the actual interactive CLI workflow, exit/reopen evidence,
  view versus stored-result freshness, CSV/Parquet round trips, both setup choices, and cleanup
  against the pinned runtime. A successful scripted equivalent alone does not validate the
  promised prompt interaction. These remain planned lessons.
- Before authoring 7, verify settings inspection, observable null-order changes, explicit query
  ordering, reset, and fresh-process behavior with the actual wrapper/startup configuration.
- Before authoring 18, verify direct-open failures, simultaneous read-only access, and ownership
  handoff on the pinned DuckDB CLI with separate live processes and a disposable local file.
  This route revision does not execute the experiment or change authored availability.
- Before authoring 19–21, pin a compatible Quack extension for DuckDB 1.5.5 and verify the
  documented API, remote transaction visibility, explicit remote aggregation/local join, both
  setup choices, and cleanup. The route change does not install or validate Quack.
- For 20, additionally validate temporary-secret loss, scoped lookup, persistent-secret reload
  with the isolated directory reapplied, authentication on fresh connections, and removal.
  Confirm no explicit token or unrelated secret masks a failed lookup; preserve normal secrets.
- Before authoring 22–24, verify compatible `prometheus` and `otlp` community artifacts on
  DuckDB 1.5.5, schema/units, supported function signatures, and native OTLP/HTTP availability.
  Do not silently substitute a newer upstream or unsigned build for a missing published feature.
  Validate bounded Prometheus results against the local source, wrong-key OTLP correlations,
  buffering/flush/stop and reopened records, both setup paths, resource use, and cleanup. The
  source review is not runtime validation or a claim about the learner's workplace API.
- The causes of Nick's existing SQLite/DuckDB difficulties remain unknown. Catalog and type
  failures are proposed useful cases, not diagnoses of his actual data.
- Keep live model calls, training, online vector serving, and DuckLake deployment optional and
  outside this route. Source-side query load, local refresh, and ownership need concise context.
- P5 studies a specific publication boundary with supplied operations; it does not establish
  cross-system atomicity, cloud durability, or independent-host fault tolerance.
- Before project implementation, agree the short parts and their numbered placement after the
  core. Optionality does not invent a new progress stage or mark any learner work complete.

## Learner feedback and final sign-off

- 2026-09-16: stated that his observability organization offers a Prometheus-compliant API
  and does substantial OpenTelemetry work, then approved the proposed three observability
  lessons and optional project change. Revision 8 replaces revision 7 lessons 26, 28, and 29
  with Prometheus querying, OTLP file investigation, and live OTLP ingestion at 22–24 after
  Quack. Reproducible dataset identity remains at 29; P4 becomes an observability investigation.
  Retains 32 core lessons and five optional projects, with later references updated. This
  signs off the route; extension installation and runnable lesson authoring remain future work.
- 2026-09-16: approved replacing revision 6 lessons 22 (worker delay) and 25 (AI feedback) with
  settings/pragmas and Secrets Manager practice. Revision 7 places them at 7 and 20, updates
  numbering and project dependencies, and removes feedback reconciliation from P1. The route
  remains 32 core lessons and five optional projects. Earlier interactive CLI changes remain
  approved, with export now at 13. This signs off the outline; no new labs are authored here.
- 2026-09-16: approved repurposing revision 5 lessons 11 and 12 for interactive CLI work after
  clarifying that view/table freshness and export/reopen checks should be retained. Revision 6
  moves the persistence lesson to 6 and keeps interactive export at 12; former lessons 6–10
  become 7–11, with existing slugs retained. The route stays at 32 lessons and five optional
  projects, with lesson 22 retained. This approves the outline, not a runnable lesson batch.
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
