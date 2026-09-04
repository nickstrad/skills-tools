# SQLite lesson gotchas

`sqlite3` REPL behaviour that broke lessons during the 2026-09-03 SQLite course review (16 findings
fixed, commit cd06ded).

Updated 2026-09-04 with the second-course integration findings below.

## What happened

- `.shell` re-splits and re-quotes its arguments. Backslash escapes and nested double quotes on a
  `.shell` line do not survive. `echo` works; `printf '...\n'` does not.
- The lab ends up in 1024-byte pages after module 2. Any later lesson whose evidence depends on page
  geometry must force `PRAGMA journal_mode=DELETE` (and, where needed, its own page size) in its
  setup, or its counts drift with lesson order.
- The former SQLite 3.45.1 package on this host had `dbstat` but no `sqlite_dbpage`, so `.recover`
  failed. The source-built 3.53.4 course runtime enables both extensions; recovery lessons still
  detect capabilities rather than assuming every external SQLite build matches it.
- SQLite 3.53's upstream CLI build defaults to strict quoting (`SQLITE_DQS=0`). Lesson 38 had relied
  on double-quoted string literals inside nested shell commands; it now emits standard single-quoted
  SQL strings. Keep the strict build so future lessons reveal this portability bug.
- Install `libreadline-dev` and `zlib1g-dev` before configuring the upstream source. Without them
  the CLI silently builds without line editing/history and compression support.
- Scoped checks were necessary because `deno task check` failed on another course's unformatted
  files at the time (see `repo-tooling.md`).
- FTS5 was absent from an otherwise correct SQLite 3.53.4 build. Enable it explicitly with
  `--enable-fts5` in bootstrap and verify CREATE/MATCH; do not infer configure defaults from the
  version number. Ordinary EXPLAIN does not prove the optional `bytecode()` virtual table exists.
- `pragma_busy_timeout` names its value column `timeout`, not `busy_timeout`. Alias it explicitly
  when combining table-valued PRAGMAs in a connection-policy query.
- The CLI can print `Error near line ...`, not just `Runtime error` or `Error:`. Narrow error
  classifiers missed real errors. Classify the expected failure and verify row/effect invariants;
  use `-bail` when continuing would allow a failed BEGIN to fall through into autocommit writes.
- Recovery row counts depend on page geometry AND extraction boundaries. Range salvage yielded
  2900/3000 rows with 1 KiB pages but 2700/3000 with 4 KiB pages because the damaged leaf affected
  three 100-row chunks. Count failed ranges; do not copy a single run's total into every
  expectation.
- A shell prerequisite that reassigns `TUTOR_SQLITE_DB` can silently change the next lesson's search
  parent if both are concatenated into one shell. Run prerequisite scripts in subshells, contain
  shell options/traps, and preserve only the intended filesystem artifacts between invocations.
- Readiness must be reported AFTER the operation or observation it certifies. A marker before a
  PRAGMA/value query let the parent read an incomplete log even though SQLite eventually printed the
  right answer. Use whole-line marker matching, explicit deadlines and exact owned PIDs.
- `.stats` mixes statement counters and connection/process statistics. Fullscan Steps and Virtual
  Machine Steps support a statement-work comparison; not every byte/cache statistic is scoped to the
  immediately preceding statement. Compare the matching counter and avoid equating cache misses or
  OS read calls with physical device reads.

## Why it matters

Each of these produced evidence that contradicted `expectedResult` only when the whole course ran in
order, which is how a learner experiences it.

## How to apply

Validate with both isolated lessons and a sequential fresh-lab run. Use the course-local
`courses/sqlite/tools/validate-course.ts`, which runs shell lessons as well as real Session A/B
REPLs and retains logs. Review every result: native completion still only detects timeouts. The
2026-09-03 material revisions used 2; the 2026-09-04 rework uses 3 where behavior changed and
preserves earlier effective revisions for editorial-only improvements. Never bump every lesson
merely because its explanation was expanded.
