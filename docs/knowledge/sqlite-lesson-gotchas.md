# SQLite lesson gotchas

`sqlite3` REPL behaviour that broke lessons during the 2026-09-03 SQLite course review (16
findings fixed, commit cd06ded).

## What happened

- `.shell` re-splits and re-quotes its arguments. Backslash escapes and nested double quotes on a
  `.shell` line do not survive. `echo` works; `printf '...\n'` does not.
- The lab ends up in 1024-byte pages after module 2. Any later lesson whose evidence depends on
  page geometry must force `PRAGMA journal_mode=DELETE` (and, where needed, its own page size) in
  its setup, or its counts drift with lesson order.
- SQLite 3.45.1 on this host has `dbstat` but no `sqlite_dbpage`, so `.recover` fails. Lessons
  cannot depend on it.
- Scoped checks were necessary because `deno task check` failed on another course's unformatted
  files at the time (see `repo-tooling.md`).

## Why it matters

Each of these produced evidence that contradicted `expectedResult` only when the whole course ran
in order, which is how a learner experiences it.

## How to apply

Validate with a fresh lab and one sequential full run, not only per-lesson runs. Materially
changed lessons carry `revision: 2`.
