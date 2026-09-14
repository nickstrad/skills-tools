# Practical DuckDB connector and validation findings

Verified 2026-09-14 on DuckDB 1.5.5, PostgreSQL 16.15 and the installed sqlite3 client.
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
`duck`/`duck_run`, save file fingerprints where applicable, and arrange cleanup.
`duck_run` reads the learner's query and supplied connection/staging SQL in the same connection;
only lesson 2 persists its local DuckDB database. Numbered SQL templates live in `lab/`.
Use `duck_check_source` for the read-only file check and `duck_cleanup` to finish. Source the helper
in Bash; executing it in a child process cannot configure the learner's shell. It resolves its
own location, leaves cwd/options alone, refuses to replace a selected lab, and preserves existing
EXIT handlers. With a pre-existing EXIT trap, explicit cleanup is required. Keep attachment,
conversion, catalog inspection and learner-written query logic visible in lesson explanations
and SQL even when a helper performs the repetitive invocation. The all-course contract is in
[the learner-work norm](learner-work.md#simple-lab-lifecycle).

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
