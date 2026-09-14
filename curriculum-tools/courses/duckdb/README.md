# Practical DuckDB: Data Flows and Improving AI Systems

The [canonical route](PLAN.md) has 32 core lessons and five optional projects. The first five
lessons are authored. Later lessons and projects remain planned; authoring never completes work
in the learner's progress database.

## Start on this droplet

```bash
cd /root/Software/skills-tools
bash curriculum-tools/courses/duckdb/lab/install.sh
bin/tutor duckdb init
bin/tutor duckdb route
bin/tutor duckdb 1 lesson
```

The installer is already run on this VM. It pins **DuckDB 1.5.5**, official CLI release
`d8cdaa33fd`, postgres_scanner `41223e5`, and sqlite_scanner `f79b1db` in the ignored
`curriculum-tools/.cache/duckdb-1.5.5/` directory. Download hashes are checked and both extensions
must load. No machine-wide DuckDB binary or personal startup file is changed. Reinstalling needs
network access; the five lessons then work offline. The wrapper caps DuckDB at two threads and
256 MB memory. Installation and fixture helpers are Bash process/bootstrap glue; the validator
is Go. Native SQL supplies the actual experiments.

Prerequisites already present here: Linux amd64, Bash, curl, gzip, coreutils, Go 1.26+, sqlite3,
psql and PostgreSQL 16 binaries in `/usr/lib/postgresql/16/bin`. Root-run PostgreSQL setup uses
the existing postgres OS account through runuser. The lab helpers also support a normal OS user
with access to the checkout and binaries. These are droplet instructions, not a cross-platform
installer. One-time setup is separate from the lessons' 10–12 minute estimates.

Each complete lesson supplies explanation, a small diagram, setup, an editable query file, the
Run commands, expected evidence, a labelled worked answer and cleanup. Spend the stated 3–5 minutes
on the query task; there is no required submission or review. Use `bin/tutor duckdb 1 done` only
when you choose to record completion. `skip` and `undone` are explicit progress operations too.

## Lab lifecycle

Lessons 1–5 use one sourced setup command. For example, from any directory in Bash:

```bash
source /root/Software/skills-tools/curriculum-tools/courses/duckdb/lab/session.sh 2
```

Use the current lesson number 1–5. Setup creates the fixture and editable `query.sql`, supplies
the connection/staging SQL, prints the lesson's initial source observations, and records file
fingerprints where applicable. It prints the full work-file path and the run/cleanup commands.
`query.sql` already contains starter SQL; edit that file and save it. For lesson 2, run:

```bash
cat "$DUCK_LAB/session.sql" "$DUCK_LAB/query.sql" |
  duck "$DUCK_LAB/local.duckdb" -bail -csv
# Inspect the results and any additional source comparison in the lesson.
duck_cleanup
```

The pipeline sends the supplied `session.sql` followed by your edited `query.sql` to one
DuckDB process. `duck` is a thin wrapper around the pinned DuckDB CLI: it forwards arguments
and supplies version/extension/resource settings. `-bail` stops on SQL errors; `-csv` prints CSV.
Lesson 2 reuses `local.duckdb`; lessons 1, 3 and 4 use the same pipeline with `:memory:` instead.
Lesson 5 needs no attachment, so its command is simply:

```bash
duck :memory: -bail -csv < "$DUCK_LAB/query.sql"
```

Bash's `<` feeds the SQL file to the CLI's standard input. Each invocation rereads saved edits.
In lesson 2, `CREATE OR REPLACE TABLE batch` refreshes the local extract; opening the file with
`duck "$DUCK_LAB/local.duckdb" -bail -csv -c "SELECT * FROM batch;"` only reads the saved table.
The source insert remains an explicit separate step in the lesson's Run block.

Nick is brand new to DuckDB and requested this level of CLI practice on 2026-09-14. Keep
recurring environment variables, fixtures and teardown behind helpers, while retaining the
actual execution command, input and flags in lessons. `duck_run` remains available for existing
sessions, but lessons teach the explicit calls above. Starter and connection/staging SQL stay visible.
Use `duck_check_source` for the unchanged-file check in lessons 3–5.

After a lesson-source update, run `tutor duckdb init` once to refresh the catalog shown by
`tutor duckdb N lesson`. Verify Setup calls `session.sh N` and Run shows the explicit CLI command; modifying Markdown
alone does not refresh the stored catalog. This mechanical refactor retains lesson revisions
and recorded progress because the learning tasks and expected results have not changed.

Repeat cleanup safely, then source again for a fresh attempt. Setup refuses to replace a selected
lab, preserving unfinished query edits. Source in Bash rather than running `bash session.sh`,
because variables and functions must remain in the current shell. The helper leaves cwd and shell
options unchanged. It installs an EXIT cleanup trap when none exists; if your shell already has
one, it retains that handler and asks you to run `duck_cleanup` explicitly.

The shell helpers also expose `DUCK_COURSE`, `DUCK_LAB`, `DUCK_DB`, and the pinned `duck` CLI
for the lesson's specific observation commands. `lab/prepare.sh` copies the numbered SQL
templates; `lab/inspect.sh` prints source evidence and accepts only the intended lesson-4
scanner failure. Neither helper fills in the learner's answer.

Setup creates a uniquely named `/tmp/duckdb-lesson.XXXXXX` directory and prints it as DUCK_LAB.
Lessons 1–2 create one small PostgreSQL cluster, listening only on that directory's Unix socket
at port 55439. Distinct socket paths avoid collisions; no TCP listener is exposed. READ_ONLY
attachments use a SELECT-only database role. Lessons 3–5 use small synthetic files and no server.
Every lesson has a complete starting fixture and can run independently.

The lab neither connects to `/labs/pglab` nor reads the learner's existing SQLite/DuckDB files.
Cleanup verifies the canonical marked path, stops its PostgreSQL server normally, and only then
removes that directory. Run the displayed cleanup before another attempt; an EXIT trap is the
fallback. If a shell is killed before its trap runs, use the printed directory explicitly:

```bash
bash curriculum-tools/courses/duckdb/lab/cleanup.sh /tmp/duckdb-lesson.REPLACE_WITH_PRINTED_SUFFIX
```

Do not guess ownership from a path prefix or remove unknown labs. A failed stop preserves the
directory for diagnosis. The first batch budgets under 500 MiB peak scratch and retains only
133 MiB of installed course tools, not database images.

## Author checks

```bash
bin/tutor duckdb check
cd curriculum-tools
go run ./courses/duckdb/validation
```

The Go driver reads the actual Markdown through the shared parser. It executes each starter,
displayed answer and one consequential wrong choice in fresh fixtures; then checks the shared
validator with the starters and the complete worked sequence. It does not infer semantic success
from a successful shell exit. Only lesson 4 deliberately emits a SQLite scan type mismatch.
The driver uses temporary course/progress state and removes its fixtures. Validation of private
PostgreSQL requires host process/OS-user permissions that the agent sandbox may not provide.

The ordinary `bin/tutor duckdb validate --isolated` runs the editable starters as displayed.
Its completed-step count is harness evidence, not completion of the learner's task. See
[batch acceptance](validation/batch-one.md) for actual results and
[the repository workflow](../../../docs/lesson-batch-workflow.md) for batch requirements.
