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
