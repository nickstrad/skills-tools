# Validating lessons against a real lab

`tutor <course> validate` exists because structural checks cannot tell you whether an experiment
actually shows what it claims. It drives the course's configured REPL (psql, duckdb, sqlite3...) with
one process per session and feeds each lesson's Setup and Run blocks in order, so multi-session
experiments (lock waits, serialization failures, deadlocks) run as they would in two terminals.

## How it was used for the PostgreSQL course

1. Display lesson 1 with `tutor postgres-legacy 1 lesson --plain`. Use the displayed Setup and Run blocks
   as the starting point for a private lab as the postgres OS user. Before running them, replace
   every learner-specific data directory, socket, port, and database path with lab-owned values and
   point all `PG*` settings at that private endpoint. Never execute learner paths such as
   `/labs/pglab` or the live port 5440 from the displayed commands. This is the supported way to get
   the lab's commands; if the adapted lesson 1 does not produce a working cluster, fix lesson 1.
2. Never run validation against the learner's live `/labs/pglab` cluster or its port 5440. Point the
   harness at an owned private server. The PostgreSQL courses carry their endpoint in
   `course.json` under `repl.env`; for a different endpoint, use a private clone of the course
   configuration (and its linked course files when needed), edit `repl.env`, and run with
   `tutor --root <private-root> postgres validate ...`. The harness currently merges the process
   environment first, then `repl.env`, then command options, so values in `repl.env` override process
   variables. Do not rely on `PGPORT` or another process variable overriding the course config unless
   the command explicitly provides that option.
3. Run a range or specific lessons and read the output:

   ```sh
   tutor --root <private-root> postgres validate --from 5 --to 13
   tutor --root <private-root> postgres validate write-skew serializable-ssi
   ```

   Selectors may be lesson slugs or ordinals. `--timeout MS` changes the per-step timeout from its
   30-second default. `--isolated` creates a temporary per-lesson evidence directory, exports
   `SQLITE_LAB` and `TUTOR_SQLITE_DB` for SQLite lessons, and supplies a shell fallback so shell
   lessons run even when the course's configured REPL is tool mode. It does not create a private
   PostgreSQL server, so PostgreSQL validation still needs the owned endpoint from step 2. The
   command prints `Evidence: <dir>`; the directory is removed after validation unless `--keep` is
   supplied.
4. Compare every session's output with the lesson's Expected result section. The harness detects
   timeouts and shell exit failures, but an SQL error or wrong value can still appear in a completed
   step, so read the output and classify intentional errors. Fix the lesson or expectation until
   the text describes what really happens, run `tutor <course> check`, and validate again.
5. Shell lessons (`run-in: shell`) are skipped for the default tool-mode REPL unless `--isolated`
   supplies the shell fallback described above. A shell-based course can opt in with
   `"repl": { "mode": "shell", "command": ["bash", "--noprofile", "--norc"], ... }`; those
   lessons then run in one persistent Bash process per session. The harness adds a marker containing
   the preceding command's exit status, so a nonzero assertion fails validation. Run privileged
   shell lessons only in the dedicated lab VM.

## Setup choices

Lessons may offer `Setup - script` and `Setup - manual` subsections inside Setup. Generic
validation executes only the script choice, then the shared Run block. Authors must also
validate manual setup against the real tool and the same outcomes/cleanup; the DuckDB Go
driver exercises both choices with starters, worked answers and consequential wrong choices.
Manual instructions may include an explicitly expected failing command (DuckDB lesson 4);
the driver must check that specific error and continue as an interactive learner would.

## Progress refresh verification

`progress verify` checks that refreshing one course's lesson rows preserves learner state:

```sh
tutor postgres-legacy progress verify --db /path/to/tutor.sqlite
```

Before copying, it refuses a positive-size `tutor.sqlite-wal` or `tutor.sqlite-journal` and reports
`Close the learner's progress writer before copying`. It then byte-copies the whole database to a
temporary directory, snapshots `lessons(id,slug,ordinal,active)`, `progress`, and `attempts`, runs
the current lesson seed for only the named course on the copy, and compares the snapshots and lesson
identities. The real database is never opened for writing. The JSON report includes
`before_hash`, row counts, `progress_unchanged`, `attempts_unchanged`, and
`identities_preserved`; temporary evidence is removed when the command ends.

## Conventions the harness relies on

- Step headers: a line starting with `-- Session A` (or `#`/`//` comment prefixes) begins a step for
  that session. Code before the first header belongs to Session A.
- Blocking steps: a header containing `(blocks` (for example
  `-- Session B (blocks until A
  commits)`) is sent without waiting. The next step for another session usually unblocks it.
- Long waits: default step timeout is 30 s (`--timeout MS`). Lessons that use `\watch` must use a
  bounded form (`\watch i=1 c=3`) or the step never finishes.
- Markers: the harness appends the REPL's configured `echo` command with a unique marker after each
  step to detect completion; those lines are filtered from the output. In shell mode it records the
  preceding command's exit status in the marker.

## Adding a course

Add a `repl` block to the course's `course.json` (`command`, `echo` with `{marker}`, `quit`, optional
`env`). SQL REPLs with `.print` (duckdb, sqlite3) and psql's `\echo` both work. The optional `mode`
is `"tool"` (the default) or `"shell"`; shell mode uses persistent Bash sessions and reports each
command's exit status in its marker. Existing database courses should leave the mode unset, which
preserves skipping their shell lessons during ordinary validation. After adding Markdown lessons,
run `tutor <course> check`, then validate them in an owned lab with `tutor <course> validate`.
