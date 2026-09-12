# Validation harness

Updated 2026-09-12 for the Go CLI.

Use `tutor <course> validate` to drive the course's configured REPL (psql, duckdb, sqlite3, or a
shell) with one persistent process per lesson session. It feeds each lesson's Setup and Run blocks
in order, so multi-session experiments such as lock waits, serialization failures, and deadlocks
keep their terminal boundaries.

## What happened

- A completed harness step means commands returned before the timeout. It does not prove that an
  SQL value, filesystem state, or diagnostic line matches the lesson's Expected result.
- The harness merges the process environment, course `repl.env`, and command options in that order;
  course configuration therefore wins over an unqualified `PGPORT` or similar variable.
- `--isolated` gives each lesson a private evidence directory, exports `SQLITE_LAB` and
  `TUTOR_SQLITE_DB` for SQLite, and supplies a shell fallback for shell lessons. It removes the
  directory after validation unless `--keep` is supplied. It does not create a private PostgreSQL
  server.
- Two-session lessons use labelled `-- Session A` / `-- Session B` blocks. A header containing
  `(blocks until A commits)` is sent without waiting; the next session can release it.
- The configured `echo` marker is appended after each step and filtered from captured output. A
  shell course can opt into persistent Bash sessions; shell validation also records the preceding
  command's exit status, so a failed assertion is not hidden by a successful marker.
- Keep bounded commands such as `\watch i=1 c=3`; an unbounded watch never reaches its marker. The
  default step timeout is 30 seconds and can be changed with `--timeout MS`.

## Why it matters

A green count is not a semantic pass. Linux lesson 46 once completed while printing
`priority_difference=unexpected`; SQLite checks also exposed false results when two sessions were
flattened into one sqlite3 stream. Read every session's evidence and classify intentional errors.

## How to apply

Run a range or selected lessons against an owned private endpoint:

```sh
tutor --root /path/to/private-checkout postgres validate --from 5 --to 13
tutor --root /path/to/private-checkout postgres validate write-skew serializable-ssi
tutor --root /path/to/private-checkout sqlite validate --isolated --keep 34
```

Use the course's `repl.env` for a private PostgreSQL socket, port, role, and database. Never use
port 5440 or `/labs/pglab` for validation. Search the saved output for `unexpected`, `missing`,
`partial`, `not-observed`, `unavailable`, `skipped`, `Traceback`, and `error`, then compare each hit
with the lesson's expected intentional failures. Keep only named evidence and remove owned labs,
copied progress databases, and temporary processes after the acceptance check.

Parallel validation runs need separate lab directories and database files. SQLite crash, backup,
and benchmark lessons may intentionally retain named evidence; remove it only after its acceptance
check. A Linux course's global kernel-object lessons need unique names and cleanup traps.

`tutor <course> progress verify --db /path/to/tutor.sqlite` treats the source database as
read-only, then makes its own temporary byte copy for the refresh check. It refuses a positive-size WAL or
journal beside the source, snapshots all-course progress and attempts, snapshots the named course's
stable lesson identities, seeds only that course in the copy, and confirms the source bytes remain
unchanged. Refresh is allowed to update the named course's lesson content and prerequisites; other
courses' lesson content and prerequisites are compared unchanged by their stored IDs. A JSON report
gives the source hash and preservation booleans; it never writes the real database.

The structural boundary is `tutor <course> check`; it validates Markdown lessons against the
canonical plan. Real-tool validation is separate and must report observed evidence, not only an
exit status.
