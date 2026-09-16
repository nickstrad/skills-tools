# Practical DuckDB connector and validation findings

Verified through 2026-09-16 on DuckDB 1.5.5, PostgreSQL 16.15 and the installed sqlite3 client.
Read this before extending the practical course or reusing its fixture helpers.

## What happened

The first batch exercises real PostgreSQL and SQLite attachments, local extraction and CSV reads.
DuckDB's information_schema.tables lists remote system objects too: restrict a teaching inventory
to the schemas at issue or a five-row fixture can produce a long irrelevant listing.
The catalog alias in DuckDB is separate from the PostgreSQL database name. Source SQL passed to
postgres_query uses PostgreSQL's schema.table naming, without the DuckDB catalog alias.

A SQLite INTEGER-affinity column stored '2300' as integer but retained 'oops' as text. The normal
DuckDB scan failed on oops. LOAD sqlite followed by SET sqlite_all_varchar=true **before ATTACH**
let the scanner expose those values as text. An outer TRY_CAST alone cannot repair a scan that
fails earlier. The course stages raw values, then applies conversion and a separate nonnegative
domain rule, retaining accepted and rejected rows. This is not an arbitrary money-text parser:
BIGINT casts can round fractional numeric strings, so future fixtures need their own contract.

## Why it matters

Successful SQL can still query a decoy table or copy too broad a population. Native client
reconciliation, IDs, column inspection and accepted/rejected counts expose different errors.
Saved extracts remain unchanged after a source insert until explicit refresh. That result does
not measure source execution cost or establish cross-source snapshot consistency.

The CLIs have different presentation defaults: native sqlite3 CSV uses CRLF here, DuckDB uses LF
and prints NULL literally, and the shared validator prefixes session output with `[A]`. Normalize
presentation before comparing evidence; do not weaken the row/type/domain checks to accept an
exit code alone. Generic validation executes the untouched starter query files, so a 5/5 completed
count is not proof that a learner has solved the tasks.

## How to apply

Repeated shell preparation belongs in reusable helpers, leaving DuckDB decisions and observations
in the lesson. Lessons 1–5 source `lab/session.sh N` to select a fresh owned fixture, create
editable SQL starters, print initial source evidence, export the session variables, define
the pinned `duck` wrapper, save file fingerprints where applicable, and arrange cleanup.
The Run blocks expose the CLI invocation for repeated practice: lessons 1–4 pipe `session.sql`
then `query.sql` into one `duck` process; lesson 5 redirects `query.sql` directly with `<`.
Only lesson 2 names a persistent `local.duckdb`; other lessons explicitly select `:memory:`.
The files execute in order in one connection, so attachment/raw-stage state exists when the
learner's query runs. `-bail` stops on SQL errors and `-csv` prints CSV; lesson 2 also uses
`-c` for a local query that does not refresh its stored batch. Numbered SQL templates live in
`lab/` and setup creates populated starters to edit. `duck_run` remains a compatibility helper
but is not the taught execution path. Setup prints the same explicit command as the lesson.
Use `duck_check_source` for the read-only file check and `duck_cleanup` to finish. Source the helper
in Bash; executing it in a child process cannot configure the learner's shell. It resolves its
own location, leaves cwd/options alone, refuses to replace a selected lab, and preserves existing
EXIT handlers. With a pre-existing EXIT trap, explicit cleanup is required. Keep attachment,
conversion, catalog inspection and learner-written query logic visible in lesson explanations
and SQL. The learner explicitly requested CLI muscle memory while keeping recurring setup
hidden; the course's wrapper handles version/settings only. The all-course contract is in
[the learner-work norm](learner-work.md#simple-lab-lifecycle).

Each lesson now offers **Setup - script** and **Setup - manual**. Script performs the DuckDB
preparation/inspection. Manual uses `source .../session.sh N manual` for infrastructure only,
then exposes LOAD/ATTACH, catalog queries (1/3), the source count check (2), scanner error and
text setting/raw stage (4), or CSV DESCRIBE (5) as executable CLI calls. Both feed the same Run.
Their inspection connections close, so Run repeats connection/staging SQL from session.sql in
its own process. The wrapper still selects extension location, installation policy and resource
caps. Temporary directories, fixture servers, shell variables and cleanup remain supplied.

The generic lesson Setup field can contain two Markdown subsections, `### Setup - script`
and `### Setup - manual`, without a progress schema change. Parser/writer/renderer preserve
them; generic validation extracts only the script code. The DuckDB driver additionally executes
both choices with each starter, answer and wrong choice (30 independent trials). Manual lesson 4
intentionally returns an SQL error before its corrected call; the driver mirrors interactive
Bash and checks exactly one expected error instead of aborting that setup at the deliberate failure.
This shared authoring convention is recorded in [learner-work](learner-work.md#simple-lab-lifecycle).

The tutor displays stored catalog content, not live Markdown. A helper refactor can be present
in source while the learner still sees old exports and heredocs. For an authorized rollout,
test `tutor duckdb init --db ABSOLUTE_COPY_PATH`, compare recorded progress/attempts, then refresh
the live catalog and check all rendered Setup/Run blocks. Author validation alone stays isolated.
Pure scaffolding refactors retain revisions when learner tasks and evidence are unchanged.

Use [the course README](../../curriculum-tools/courses/duckdb/README.md) and
[batch acceptance](../../curriculum-tools/courses/duckdb/validation/batch-one.md).
The pinned runtime lives under the ignored curriculum-tools/.cache/duckdb-1.5.5 directory;
invoke lab/duckdb.sh so its extension directory and resource caps are applied. Installer hashes
pin the CLI and both official extension builds. A later binary under the same version URL causes
a deliberate hash failure and needs review, not an unchecked fallback download.

Fixtures use marked mktemp directories, a private Unix socket and reader role, and normal server
shutdown before deletion. A sandbox chown/socket refusal is an execution-permission boundary,
not a DuckDB or PostgreSQL defect. Author rendering/progress tests use explicit absolute --db
paths: bin/tutor changes its working directory to curriculum-tools. DuckDB must first be adopted
on a **copy** before its progress verify command can check that new course; never initialize the
real learner database as an authoring side effect.

The persistent `pglab.service` and default `16/main` instance were intentionally stopped and
disabled on 2026-09-14; the default cluster has manual startup configured. DuckDB
needs PostgreSQL 16 binaries and the postgres OS account, not either standing PostgreSQL service
on ports 5440/5432. A fresh DuckDB PostgreSQL fixture returned its five source orders with
Essentials stopped, then cleaned up successfully. Do not start Essentials to make DuckDB ready.
Only keep PostgreSQL running for an active DuckDB fixture; clean it up after use.
See [the lab lifecycle note](postgres-lab.md) for the separate persistent clusters.

Primary references: [PostgreSQL attachment](https://duckdb.org/docs/current/core_extensions/postgres/overview),
[source-side SQL](https://duckdb.org/docs/current/core_extensions/postgres/functions),
[SQLite types](https://duckdb.org/docs/current/core_extensions/sqlite),
[CSV reading](https://duckdb.org/docs/current/data/csv/overview).
Those pages can evolve; the observed first-batch evidence uses the pinned 1.5.5 runtime.

## Persistence, settings and file transformations (lessons 6–10)

The session helper now accepts 1–10. Lessons 6–7 use labelled live CLI transcripts and named
database files; setup does not supply a query.sql task. In 6 the learner creates the base table
and compares persisted view/table freshness. In 7 script setup creates the tiny table, while
manual exposes that same native preparation; the setting changes remain learner work. Quit the
CLI before reopening or cleanup. A shell variable in SQL is not automatically expanded: the
interactive CSV path must be replaced with the printed owned path.

The [second-batch driver](../../curriculum-tools/courses/duckdb/validation/batchtwo/main.go)
translates only interactive prompt boundaries into separate CLI processes in an author-only
catalog. Generic Bash validation cannot interpret a mixed Bash/DuckDB transcript directly.
Both interactive lessons additionally passed real PTY checks. One virtual terminal did not
answer background-color probes; `-dark-mode` avoided the five-second presentation delay.
Do not change SQL or weaken outcome checks to accommodate a terminal capability problem.

Pinned observations useful for later batches:

- `default_null_order` is GLOBAL in the running instance; NULLS_FIRST changes implicit sorting,
  explicit query null placement overrides it, RESET returns NULLS_LAST, and a fresh wrapper
  process also uses NULLS_LAST. GLOBAL does not mean a property saved into the database file.
  The wrapper's 256 MB memory_limit displays as 244.1 MiB; it is not total process RSS.
- CSV inference already retains this fixture's leading-zero IDs as VARCHAR. An explicit BIGINT
  cast would discard zeros. Do not manufacture an inference failure from the general warning
  that numeric-looking identifiers need a text contract. Decimal amount conversion plus a
  separate nonnegative rule preserves 19.75 while rejecting malformed/missing/negative values.
- Unnesting 2/0/1 events from three parent runs produces three event rows. The unchanged total
  hides a change of grain: assert parent/event pairs and empty-list behavior, not count alone.
- Reading a v1-first CSV glob without union_by_name can succeed while omitting the v2-only
  region field. The later projection raises a missing-column Binder Error. With name union,
  retain original NULLs and filename alongside display labels; correct totals cannot detect
  fabricated labels. These results depend on this fixture/reader, not every schema mismatch.

See [second-batch acceptance](../../curriculum-tools/courses/duckdb/validation/batch-two.md)
for both setup paths, wrong choices, reruns, progress preservation and cleanup. Current primary
references: [CLI](https://duckdb.org/docs/current/clients/cli/overview),
[settings/pragmas](https://duckdb.org/docs/current/configuration/pragmas),
[JSON loading](https://duckdb.org/docs/current/data/json/loading_json), and
[schema combination](https://duckdb.org/docs/current/data/multiple_files/combining_schemas).
