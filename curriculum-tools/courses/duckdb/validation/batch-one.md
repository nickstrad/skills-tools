# DuckDB first-batch acceptance — lessons 1–5

Latest: [one-command setup and live catalog rollout](setup-refresh.md) covers the completed
helper refactor for all five lessons. Earlier sections below remain historical evidence.

## Setup-helper revision — 2026-09-14

Lessons 2–5 now use revision 2 and the sourced `lab/session.sh` lifecycle helper. SQL starters,
worked answers and expected data are unchanged. The current results and source manifest below
were regenerated with a full `go run ./courses/duckdb/validation`: all 15 independent trials and
both shared five-lesson sequences passed, including PostgreSQL extraction and SQLite type errors.
Evidence has CRLF and trailing whitespace normalized. `bin/tutor duckdb check` and Bash syntax
checks passed. The initial acceptance record below remains historical context.

Additional real helper checks passed: source-only invocation and lesson-number validation,
execution from /tmp without changing cwd/options, CLI query, preservation of active lab/query
edits on repeated setup, detection of a modified source, sequential fresh fixtures, repeated
explicit cleanup, automatic EXIT cleanup, and preservation of an existing EXIT handler.
Every owned fixture was removed. A helper never silently replaces an existing EXIT handler;
that case requires the displayed explicit cleanup.

Lessons 2–5 rendered with the new commands on a temporary catalog. Copy-based progress
verification preserved 266 identities, 40 progress rows and 41 attempts; done/skip/undone
were smoke-tested only on temporary state (`tutor duckdb undone 3` is the supported undo syntax).
The pre-existing modified learner database was untouched: SHA256
`258edc4cfb93d488e9b716ab7f30cb788e83355b95f0851e0d76e301a8b54eca`, zero-byte WAL.
The learner PostgreSQL endpoint answered SELECT 1 after author validation. Project knowledge
and learner preferences now record the setup-helper boundary; `data/duckdb-course-tools.md`
was updated, reread and reindexed through kb. No skill change was needed: the reusable facts
belong in the existing project/tooling notes.

## Initial acceptance

Accepted 2026-09-14. Implements only the first five lessons of the agreed revision-3
[route](../PLAN.md). Primary agent authored, reviewed and validated; no delegation.
The user selected DuckDB **1.5.5** and required the live state log, final knowledge-store
reflection and log deletion. Later lessons and optional projects remain planned.

## Runtime and scope

- DuckDB v1.5.5 `d8cdaa33fd`; postgres_scanner `41223e5`, sqlite_scanner `f79b1db`.
- PostgreSQL 16.15; sqlite3 3.53.4; Linux amd64. The signed extension files loaded successfully.
- CLI gzip SHA256 from official release metadata:
  `c61f21485e6e41d3a0c28ce9904ea18346309cf427b4cf9479bc3564348dc885`.
- Uncompressed CLI SHA256:
  `3d33b1df037cb049155c393778df7853fafb23e9d49d7c9cacdde4dd67155788`.
- PostgreSQL extension SHA256:
  `b1ced4cfc6311313e117c2afb3eac76508718778dde0716421503c7dbfb5605c`.
- SQLite extension SHA256:
  `693d2bf90779df23ca5ebe0688639b9adfc11c2d55ae3466b33e28be16afaa5e`.

The [installer](../lab/install.sh) pins those downloads. The CLI and extensions occupy 133 MiB
in the ignored course cache; no global DuckDB installation changed. Lessons need no network
after installation. Sources: [official release](https://github.com/duckdb/duckdb/releases/tag/v1.5.5),
[PostgreSQL attachment](https://duckdb.org/docs/current/core_extensions/postgres/overview),
[source SQL](https://duckdb.org/docs/current/core_extensions/postgres/functions),
[SQLite scanner](https://duckdb.org/docs/current/core_extensions/sqlite),
[CSV reader](https://duckdb.org/docs/current/data/csv/overview).

## Observed outcomes

| Lesson | Worked answer | Untouched starter | Consequential wrong choice |
| --- | --- | --- | --- |
| 1 PostgreSQL attachment | IDs 102/104, count 2, 4000 cents; native psql agrees | Decoy public.orders gives 999, count 1, 99900 | Omitting paid status includes pending order 103: 3/4800 |
| 2 Bounded extract | Two projected columns; 2/4000 remains local after source insert; refresh yields IDs 102/104/106 and 3/4600 | Five columns and 5/6900; refresh copies 6/7500 | Missing upper date bound includes September 15: 3/4900 initially, 4/5500 after refresh |
| 3 SQLite attachment | IDs 1/Ada and 3/Sam, native sqlite3 agrees; source hash unchanged | Wrong local catalog and east region yield no rows | Correct region but local catalog yields 999/Decoy |
| 4 SQLite type repair | Raw 5 = accepted 2 + rejected 3; accepted sum 3500; oops/NULL/-50 retained; source hash unchanged | Dummy conversion rejects all 5 | Missing sign check accepts -50: accepted 3/3450 |
| 5 CSV query | IDs 102/104, 2/4000; raw-file reconciliation and unchanged hash | Paid rows across all dates: 4/6100 | Date-only filter includes pending order: 3/4800 |

Each lesson is a complete starting fixture with a bounded 3–5 minute learner task and a displayed
worked answer. Estimated core times are 12/12/10/12/10 minutes including explanation, task,
debugging, inspection and cleanup. Those are author estimates, not measured learner timings.

## Validation method and limitations

[The Go validator](main.go) loads source Markdown through the shared course parser and extracts
the exact Setup, Run, worked SQL and cleanup blocks. It runs every starter, worked completion
and wrong choice independently with real tools and immediate teardown. A second pass uses
`tutor duckdb validate --isolated` on both untouched starters and a temporary course containing
the displayed worked SQL injected between Setup and Run. Both shared runs complete **5/5**.
The worked output is also checked for the listed rows, counts and conversion results.

[results.txt](results.txt) retains the latest accepted output for each labelled trial, with CRLF
normalized and trailing whitespace removed. Repeated earlier trials are compacted away; no
database images or query workspaces are retained. [source-manifest.json](source-manifest.json)
hashes the accepted lesson files, fixture helpers, configuration and Go validator. The validator's
`-from`/`-to` options support bounded independent reruns while retaining previous evidence; the
shared sequence still covers all five lessons. A clean full run uses neither option.

The intentionally unfinished starters execute successfully: the generic completed-step count
does not mean they solve the learner task. Lesson 4 deliberately prints exactly one normal-scan
Mismatch Type Error for oops before using the text scanner. No other SQL error belongs in the
accepted experiment output. Three evidence-comparison issues were corrected during validation:
sqlite3 emits CRLF; DuckDB 1.5.5 CSV prints NULL literally; the shared harness adds `[A]` prefixes.
These were presentation mismatches, not altered expected data. Review also narrowed lesson 1's
catalog inventory to public/sales to avoid flooding the terminal with system objects.

Final boundary checks additionally attempted DELETE through both READ_ONLY attachments. DuckDB
rejected both with an attached-in-read-only-mode error. Native psql DELETE as reader failed with
permission denied. PostgreSQL still had 5 orders and SQLite 4 customers; both owned trees were
then stopped/removed. The helper's startup-failure path also removed partial directories after
sandbox chown refusals. No learner data was used for these checks.

`bin/tutor duckdb check` reports **5 lessons OK**; Bash syntax checks and Go vet of the new
validator pass. No engine logic changed. All five complete lesson outputs rendered through the
shared CLI using an explicit temporary database. Route output shows 1–5 available and 6–32 planned.
Temporary done/skip/undone operations preserved the expected next lesson (2 after undoing its skip).
Installed launcher and both agents' tutor/curriculum-author symlinks passed `tutor install --check`.

These fixtures establish specific query, type and refresh behavior. They do not measure source
query cost, network volume, concurrent SQLite writers, cross-database snapshot atomicity, or a
complete arbitrary monetary-text parsing policy. Timings and installation portability are not
acceptance claims beyond the tested droplet.

## Progress, resources and reflection

The real shared learner database was never initialized/refreshed for DuckDB during authoring.
Its SHA256 before and after is
`161a9d32039fb889c213668d9751f2a3f2ecdb6615e2b45e922400e6d38dc4fe`; its WAL is zero bytes.
Read-only progress verification on a temporary copy preserved 261 existing lesson identities,
39 progress rows and 40 attempts. Adopting DuckDB on another copy added 5 lessons (266 total),
preserved the exact progress/attempt dumps, and passed DuckDB progress verification.

Private PostgreSQL trials peaked at roughly 40 MiB allocated; SQLite/CSV fixtures used tens of
KiB. All fixture clusters were stopped and their trees removed after each trial. No replicas,
backups or bulky evidence were retained. Final host checks found no batch-owned PostgreSQL or
validation process. The learner endpoint `/tmp:5440` still reported
`/labs/pglab/primary`, recovery=false, and answered SELECT successfully. Root has about 142 GiB
free, 2% inodes used, and 6.8 GiB available RAM. The 133 MiB tool cache remains for learner use.
After removing author progress copies, rendered scratch output and download metadata, /tmp
returned to its 9.1 MiB baseline. Zero DuckDB lesson/validation roots remain. All 14 entries in
the accepted runtime source manifest were rechecked successfully before the final commit.

The requested knowledge-store reflection searched for an existing DuckDB entry (no result),
then added and reread **data/duckdb-course-tools.md** through `kb`. It records the verified pinned
runtime location, wrapper, offline behavior, private fixture lifecycle and author progress boundary.
Course-specific findings live in [repository knowledge](../../../../docs/knowledge/duckdb-course.md).
The batch follows [the lesson workflow](../../../../docs/lesson-batch-workflow.md); its transient
root state.md is deleted only after these checks, reflection and final scratch cleanup.
