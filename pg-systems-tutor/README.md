# PostgreSQL Systems Tutor

`pgtutor` is a local, stateful CLI for working through 100 PostgreSQL systems lessons. It teaches
catalogs, MVCC, vacuum, locks, WAL, replication, storage, planning, observability, and reliability
with SQL you can inspect and run in `psql`.

The tutor does not connect to PostgreSQL or execute lesson SQL. It reads curriculum content from
`data/lessons.json` and records progress in SQLite only when you explicitly ask it to.

## Requirements

- Deno 2

The launcher uses `$DENO_BIN` when set, then a `deno` executable on `PATH`, then
`/root/.deno/bin/deno` when available.

## Start

Initialize the default database and show the first unfinished lesson:

```sh
./bin/pgtutor init
./bin/pgtutor next
```

Initialization is idempotent: it refreshes the curriculum while preserving progress and notes. Use
`--db PATH` with any database-backed command to keep a separate course database.

## Commands

```text
pgtutor init [--db PATH]
pgtutor next [--json] [--db PATH]
pgtutor show NUMBER [--json] [--db PATH]
pgtutor pretty [NUMBER] [--db PATH]
pgtutor done NUMBER [--note TEXT] [--db PATH]
pgtutor undone NUMBER [--db PATH]
pgtutor skip NUMBER [--note TEXT] [--db PATH]
pgtutor note NUMBER TEXT [--db PATH]
pgtutor list [--todo|--done|--all] [--category NAME] [--limit N] [--json] [--db PATH]
pgtutor status [--json] [--db PATH]
pgtutor search TEXT [--json] [--db PATH]
```

Examples:

```sh
./bin/pgtutor show 20 --json
./bin/pgtutor search "replication lag"
./bin/pgtutor list --todo --category wal --limit 10
./bin/pgtutor done 20 --note "Ran on the local PG 17 instance"
./bin/pgtutor status --json
```

`next` returns the lowest-numbered active lesson that is todo or stale. Skipped lessons are not
returned. When curriculum content is revised, a previously completed lesson becomes stale and is
eligible for `next` again. `undone` returns a lesson to todo without deleting its note.

Human-readable lesson output includes the overview, syntax breakdown, any authored caution, and SQL.
`pretty` emits the compact lesson format used by the bundled Codex skill. Use `--json` when stable
structured output is needed.

## Data and safety

The default database is `data/pg-systems-tutor.sqlite`. Lesson display, listing, searching, and
status checks never change progress. `done`, `undone`, `skip`, and `note` are the progress-mutating
commands. `init` creates or refreshes curriculum tables but does not erase progress.

The curriculum is currently read-only SQL, but some catalog and statistics views require elevated
visibility and some queries are version-specific. Check each lesson's `minPgVersion`, `safetyLevel`,
and `caution` fields in JSON output before using it on an important system.

## Development

```sh
deno task check
deno task test
```

The test suite uses isolated temporary SQLite databases and does not modify the default progress
database.

## Codex skill

The ready-to-install skill bundle is in `skill/pg-systems-tutor`. Its instructions use the CLI as
the only curriculum and progress interface, preserve explicit progress semantics, and never infer
SQL execution from displaying a lesson.
