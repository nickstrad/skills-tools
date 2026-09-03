import { code, type Module } from "../../../src/types.ts";

export const LAB: Module = {
  category: "lab-setup",
  title: "Own a whole node: build a disposable lab cluster",
  lessons: [
    {
      slug: "build-lab-cluster",
      tags: ["lab", "process-model", "configuration"],
      title: "Build a disposable lab cluster you fully control",
      difficulty: "beginner",
      safetyLevel: "privileged",
      runIn: "shell",
      estimatedMinutes: 15,
      overview: code`
Every later lesson crashes, promotes, corrupts, or reconfigures a PostgreSQL node on purpose, so
you need a cluster that is yours to break. Create one with initdb under $PGLAB on port 5440 with the
settings the curriculum relies on (logical WAL, checksums, archiving, prepared transactions,
commit timestamps, I/O timing, pg_stat_statements, verbose logging).`,
      syntaxBreakdown: code`
initdb creates a data directory (one cluster = one postmaster = one data directory + WAL).
--data-checksums enables page checksums, --auth-local=trust makes socket connections passwordless
for the lab. pg_ctl start/stop drives the postmaster; -l names its startup log. createdb makes the
database the rest of the course uses.`,
      code: code`
# Run as a NON-root OS user (on Debian/Ubuntu: sudo -iu postgres). Never point PGLAB at an existing data directory.
export PATH=/usr/lib/postgresql/16/bin:$PATH     # adjust to: $(pg_config --bindir)
export PGLAB=$HOME/pglab
mkdir -p "$PGLAB/archive"
initdb -D "$PGLAB/primary" -U postgres --auth-local=trust --auth-host=scram-sha-256 --data-checksums

cat >> "$PGLAB/primary/postgresql.conf" <<EOF
# ---- pgtutor lab (appended; later settings win) ----
port = 5440
listen_addresses = 'localhost'
unix_socket_directories = '/tmp'
cluster_name = 'lab-primary'
shared_buffers = 128MB
wal_level = logical
max_prepared_transactions = 10
archive_mode = on
archive_command = 'test ! -f "$PGLAB/archive/%f" && cp %p "$PGLAB/archive/%f"'
track_io_timing = on
track_commit_timestamp = on
shared_preload_libraries = 'pg_stat_statements'
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql.log'
log_line_prefix = '%m [%p] %u@%d '
log_checkpoints = on
log_lock_waits = on
log_min_duration_statement = 500
EOF

pg_ctl -D "$PGLAB/primary" -l "$PGLAB/primary.log" start
createdb -h /tmp -p 5440 -U postgres lab
psql -h /tmp -p 5440 -U postgres lab -c 'select version()'`,
      expectedResult: code`
initdb prints the files it created, pg_ctl says "server started", and psql prints the PostgreSQL
16.x version string. $PGLAB/primary/postgresql.conf ends with the lab block; $PGLAB/primary/log/
holds the server log.`,
      systemsLens: code`
A PostgreSQL node is a process tree over one directory: pages in base/, the write-ahead log in
pg_wal/, transaction status in pg_xact/, and control metadata in global/pg_control. Owning all of
it lets you treat the database like any other stateful service you might operate: something you
can kill, copy, replay, and replicate rather than a black box behind a connection string.`,
      caution: code`
This is a throwaway cluster. If port 5440 is taken, change it consistently in every lesson.`,
      challenge: code`
Read $PGLAB/primary/postgresql.conf from the top and note which settings need a restart
(context = postmaster) versus a reload: select name, context from pg_settings where name in
('wal_level','shared_buffers','archive_mode','log_min_duration_statement').`,
    },
    {
      slug: "shell-and-psql-toolkit",
      tags: ["lab", "psql"],
      title: "Set up the shell and psql habits the course depends on",
      difficulty: "beginner",
      safetyLevel: "read-only",
      runIn: "tool",
      estimatedMinutes: 10,
      prerequisites: ["build-lab-cluster"],
      overview: code`
Most experiments need two terminals (Session A and Session B) talking to the same lab, each
showing its backend PID so you can find it in pg_stat_activity, plus \timing, \gset and \watch to
turn queries into measurements.`,
      syntaxBreakdown: code`
PG* environment variables set psql's default connection. \timing prints elapsed time; \x auto
flips wide rows vertical; the PROMPT1 %p token shows the backend PID. \gset stores a query's
single row into psql variables (:name, :'name' quoted); \watch N re-runs the last query every N
seconds. \! runs a shell command from inside psql.`,
      code: code`
-- In EVERY terminal you open for this course (put it in ~/.bashrc):
--   export PGLAB=$HOME/pglab PGHOST=/tmp PGPORT=5440 PGUSER=postgres PGDATABASE=lab
--   export PATH=/usr/lib/postgresql/16/bin:$PATH
-- Then start psql and run:
\timing on
\x auto
\set PROMPT1 '%n@%/ pid=%p %R%# '
select pg_backend_pid() as my_pid, current_setting('cluster_name') as cluster;
select pg_backend_pid() as my_pid \gset
\echo my backend is :my_pid
select pid, backend_type, state from pg_stat_activity where pid = :my_pid;
\! echo "shell sees PGLAB=$PGLAB"
select now() \watch i=1 c=3
-- (\watch i=1 repeats every second; c=3 stops after three runs. Without c=, press Ctrl-C.)`,
      expectedResult: code`
The prompt shows your database and PID; the pg_stat_activity row for :my_pid says
backend_type = client backend, state = active (it is running the query). \watch prints a new
timestamp every second, three times.`,
      systemsLens: code`
Each psql session is one backend process with its own PID, transaction state, and locks. Cross
referencing PIDs between sessions is how you will read wait-for graphs and lock queues, exactly
as you would correlate request IDs across services.`,
      challenge: code`
Open a second terminal (Session B) and confirm you can see Session A's PID from it:
select pid, application_name, state from pg_stat_activity where backend_type = 'client backend';`,
    },
    {
      slug: "install-lab-extensions",
      tags: ["lab", "extensions"],
      title: "Install the introspection extensions the experiments use",
      difficulty: "beginner",
      safetyLevel: "ddl",
      runIn: "tool",
      estimatedMinutes: 5,
      prerequisites: ["shell-and-psql-toolkit"],
      overview: code`
Contrib extensions expose internals that the core catalog hides: raw pages, the buffer cache,
tuple-level bloat, the visibility map, WAL records, and query statistics.`,
      syntaxBreakdown: code`
CREATE EXTENSION runs the extension's install script in the current database; pg_stat_statements
also needs shared_preload_libraries (already set in the lab config). \dx lists installed extensions
and pg_available_extensions shows what the binaries ship.`,
      code: code`
create extension if not exists pageinspect;
create extension if not exists pg_buffercache;
create extension if not exists pgstattuple;
create extension if not exists pg_visibility;
create extension if not exists pg_walinspect;
create extension if not exists pg_freespacemap;
create extension if not exists pg_prewarm;
create extension if not exists pgrowlocks;
create extension if not exists amcheck;
create extension if not exists pg_stat_statements;
create extension if not exists dblink;
create extension if not exists postgres_fdw;
\dx
select name, installed_version is not null as installed
from pg_available_extensions
where name in ('pageinspect','pg_walinspect','test_decoding','pg_stat_statements')
order by name;`,
      expectedResult: code`
\dx lists twelve extensions plus plpgsql. test_decoding shows installed = false: it is an output
plugin used by replication slots, not something you CREATE EXTENSION.`,
      systemsLens: code`
These are the equivalent of debug endpoints and heap dumps for a storage engine. The course
prefers looking at the real bytes (pages, WAL records) over trusting summaries, because the
summaries are what you already get from monitoring.`,
    },
    {
      slug: "process-model",
      tags: ["process-model", "background-processes", "connections"],
      title: "Map the process model: postmaster, backends, and background workers",
      difficulty: "beginner",
      safetyLevel: "read-only",
      runIn: "mixed",
      estimatedMinutes: 10,
      prerequisites: ["shell-and-psql-toolkit"],
      overview: code`
See that every connection is an OS process forked by the postmaster, and that durability and
cleanup are delegated to a fixed set of auxiliary processes.`,
      syntaxBreakdown: code`
pg_stat_activity has one row per process, not just per client; backend_type names the role.
postmaster.pid stores the postmaster's PID on its first line. ps --ppid lists its children.`,
      code: code`
select pid, backend_type, state, wait_event_type, wait_event
from pg_stat_activity
order by backend_type, pid;
\! ps -o pid,ppid,etime,cmd --ppid $(head -1 $PGLAB/primary/postmaster.pid)
select name, setting from pg_settings
where name in ('max_connections','max_worker_processes','autovacuum_max_workers',
               'max_wal_senders','max_parallel_workers');`,
      expectedResult: code`
You see checkpointer, background writer, walwriter, autovacuum launcher, logical replication
launcher, archiver, and your own client backend. ps shows the same processes as children of the
postmaster, each with a descriptive command line. Idle auxiliary processes wait on named latches
(wait_event_type = Activity).`,
      systemsLens: code`
Process-per-connection means memory and scheduler cost scale with connections, which is why
connection poolers exist and why max_connections is a capacity limit rather than a tunable.
The auxiliary processes are the durability pipeline: backends append WAL, walwriter flushes it,
checkpointer bounds recovery time, and the archiver ships segments off-box.`,
      challenge: code`
Open a second psql (Session B), rerun the ps command, and find its new process. Then quit B and
watch the process disappear: PostgreSQL has no thread pool to hide this cost.`,
    },
  ],
};
