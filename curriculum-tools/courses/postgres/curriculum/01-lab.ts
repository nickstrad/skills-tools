import { code, type Module } from "../../../src/types.ts";
import { ARCHIVE_PRUNING_REMINDER } from "./archive-reminder.ts";

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
      reading: code`
PostgreSQL 14 Internals, Chapter 1 "Introduction" (sections "Data Organization" and "Processes and Memory")`,
      readingNotes: code`
Chapter 1 describes, on paper, exactly what initdb lays down here: a cluster as one directory
holding several databases, each database as a set of files under base/, and the fixed set of
server processes that pg_ctl starts (the postmaster and its background workers). The book names
the directories and files; this lesson creates them, so after running it you can open
$PGLAB/primary and match every name in the chapter's "Data Organization" section to a real
folder.

What the book adds that the lesson does not: the chapter also explains the client-server
protocol and how shared memory is split between processes, which nothing in this lesson touches
yet (the process-model lesson in this module and the buffer-cache lesson in module 02 pick those
up). What the lesson adds: the configuration block and the archive directory are course
conveniences the book does not discuss. Read the chapter after the lab is up, with a terminal
open in $PGLAB/primary.`,
      syntaxBreakdown: code`
### In plain terms
A PostgreSQL "cluster" is not a group of machines; it is one directory on disk plus one set of
processes that serve every database inside that directory. This lesson builds a brand-new,
private cluster in a folder you own, so that later lessons can crash it, corrupt it, and copy it
without touching any real installation. You will run one program that creates the directory,
append a block of settings that the rest of the course depends on, start the server, and create
the single database ("lab") that every later experiment uses. Nothing here is a trick; the point
is that you end up owning every file and every process, which is what makes the experiments safe.

### What you are learning
- A cluster is a directory plus a server process. Everything PostgreSQL knows lives under one
  data directory ($PGLAB/primary here): table files, the write-ahead log, transaction status,
  and configuration. One "postmaster" process owns that directory and spawns the others.
- Configuration is a text file read at start. Settings appended to postgresql.conf later in the
  file override earlier ones, which is why the course appends a labelled block instead of editing
  lines in place.
- The server listens on a port and a socket file. Port 5440 keeps the lab away from a default
  install on 5432; the socket directory /tmp lets local clients connect without a password.
- Some settings can only be set before the server first starts (checksums) or need a restart
  (wal_level, shared_preload_libraries); the challenge shows you how to tell which is which.

### Piece by piece
- **sudo -iu postgres** (shell command, mentioned in the comment)
  - What it is: switch to the "postgres" operating-system user and start a login shell as them.
  - What it does here: PostgreSQL refuses to run its server as root, so every server-side command
    in this course runs as an ordinary OS user; on Debian/Ubuntu the packaged one is "postgres".
  - What it gives us: a user whose home directory can hold the lab ($HOME/pglab) and who may run
    initdb and pg_ctl.
- **export PATH=/usr/lib/postgresql/16/bin:$PATH** (shell variable)
  - What it is: puts the PostgreSQL 16 server programs first on the command search path.
  - What it does here: Debian and Ubuntu install several versions side by side under
    /usr/lib/postgresql/<version>/bin and do not put the server tools on PATH; without this line
    "initdb" and "pg_ctl" are not found. pg_config --bindir prints the right directory if yours
    differs.
  - What it gives us: initdb, pg_ctl, createdb, psql, pg_waldump and the other tools the course
    calls by bare name.
- **export PGLAB=$HOME/pglab** (shell variable)
  - What it is: an environment variable naming the lab's root folder.
  - What it does here: every later lesson refers to $PGLAB instead of a hard-coded path, so the
    whole lab can be moved or deleted by changing one variable. It must be set in every terminal
    you open (lesson 2 shows the .bashrc line).
  - What it gives us: $PGLAB/primary for the data directory, $PGLAB/archive for saved WAL,
    $PGLAB/primary.log for the startup log.
- **mkdir -p "$PGLAB/archive"** (shell command)
  - What it is: create the folder where finished write-ahead-log files will be copied.
  - What it does here: the archive_command below copies into this folder; if it does not exist the
    copy fails and PostgreSQL keeps retrying and complaining in the log.
  - What it gives us: the archive that modules 07, 08, 09 and 15 read back.
- **initdb -D "$PGLAB/primary" -U postgres --auth-local=trust --auth-host=scram-sha-256 --data-checksums** (shell program plus flags)
  - What it is: the program that creates an empty cluster: the directory tree, the system catalogs
    (the tables PostgreSQL keeps about your tables), a first "postgres" database and a default
    configuration file. It never starts a server.
  - What it does here, flag by flag:
    - -D "$PGLAB/primary" is the data directory to create; it must not exist yet or must be empty.
    - -U postgres names the database superuser created inside the cluster (a database role, not the
      OS user, even though the names match).
    - --auth-local=trust means connections over the local socket file need no password; fine for a
      throwaway lab, never for anything reachable by others.
    - --auth-host=scram-sha-256 means any TCP connection must present a password using the modern
      SCRAM scheme, so nothing on the network can walk in.
    - --data-checksums makes every 8 KB data page carry a checksum so damaged pages are detected on
      read. It can only be chosen at initdb time (or later with the cluster stopped), and module 15
      relies on it to detect corruption you inject on purpose.
  - What it gives us: $PGLAB/primary containing base/ (databases), pg_wal/ (the log), pg_xact/
    (transaction status), global/ (cluster-wide catalogs), postgresql.conf and pg_hba.conf.
- **cat >> "$PGLAB/primary/postgresql.conf" <<EOF ... EOF** (shell "here document")
  - What it is: appends the lines between <<EOF and EOF to the end of the configuration file.
  - What it does here: adds the lab's settings after the defaults; PostgreSQL takes the last
    occurrence of a setting in the file, so appending is a safe way to override without editing.
  - What it gives us: a clearly labelled block you can find and change later.
  - The settings in that block, one at a time:
    - port = 5440 and listen_addresses = 'localhost': the TCP port and interface to listen on. 5440
      avoids colliding with a default PostgreSQL on 5432. If 5440 is already taken on your machine,
      pick another and use it in every lesson.
    - unix_socket_directories = '/tmp': where the local socket file goes, so clients can connect
      with -h /tmp without a password (this is the "local" connection --auth-local=trust applies to).
    - cluster_name = 'lab-primary': a label shown in process listings and logs, so you can tell
      this server from the standby you build in module 09.
    - shared_buffers = 128MB: the size of the shared memory cache that holds data pages. Small on
      purpose so cache effects are visible on a small machine (module 02).
    - wal_level = logical: how much detail goes into the write-ahead log. "logical" is the richest
      level and is required for logical replication and change-data-capture (module 10); it also
      covers everything physical replication needs (module 09).
    - max_prepared_transactions = 10: allows two-phase commit ("prepared" transactions), which is
      off by default; module 14 uses it.
    - archive_mode = on and archive_command = 'test ! -f ... && cp %p ...': once a 16 MB WAL
      segment file is complete, run this shell command to copy it (%p = path of the segment, %f =
      its file name) into $PGLAB/archive, skipping files already there. Point-in-time recovery
      (module 08) replays these copies.
    - track_io_timing = on: record how long reads and writes take, so EXPLAIN (ANALYZE, BUFFERS)
      and pg_stat_io can show I/O time (modules 02, 11, 13).
    - track_commit_timestamp = on: remember when each transaction committed, which module 08 uses
      to pick a recovery target time.
    - shared_preload_libraries = 'pg_stat_statements': load the query-statistics extension into
      every server process at startup; it cannot be loaded later without a restart. Module 11 reads
      it.
    - logging_collector = on, log_directory = 'log', log_filename = 'postgresql.log': capture the
      server's log into one file, $PGLAB/primary/log/postgresql.log, instead of the terminal.
    - log_line_prefix = '%m [%p] %u@%d ': start every log line with the timestamp (%m), the process
      id (%p), and the user and database (%u@%d), so you can match log lines to sessions.
    - log_checkpoints = on and log_lock_waits = on: write a log line for every checkpoint (module
      08) and for every lock wait longer than one second (modules 06, 13).
    - log_min_duration_statement = 500: log the text of any statement slower than 500 ms.
- **pg_ctl -D "$PGLAB/primary" -l "$PGLAB/primary.log" start** (shell program plus flags)
  - What it is: the control program for a server: start, stop, restart, reload, promote, status.
  - What it does here: -D says which data directory to serve; -l names the file that receives
    anything the server prints before its own log file is open; "start" launches the postmaster in
    the background and waits until it accepts connections.
  - What it gives us: a running server and the line "server started". If it says "could not start
    server", read $PGLAB/primary.log; the usual causes are a port in use or a missing archive
    folder.
- **createdb -h /tmp -p 5440 -U postgres lab** (shell program plus flags)
  - What it is: a command-line wrapper around the SQL statement CREATE DATABASE.
  - What it does here: -h /tmp connects through the socket directory (not the network), -p 5440 is
    the port from the config, -U postgres is the superuser initdb created, and "lab" is the name of
    the new database.
  - What it gives us: the one database every later lesson connects to; all their tables live here.
- **psql -h /tmp -p 5440 -U postgres lab -c 'select version()'** (shell program plus flags)
  - What it is: the interactive SQL client; -c runs one command and exits instead of opening a
    prompt.
  - What it does here: connects with the same host, port and user as createdb and asks the server
    to report its version.
  - What it gives us: proof that a client can reach the server and that it is PostgreSQL 16; the
    version string is also what the course's minVersion refers to.`,
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
      caution: code`This is a throwaway cluster: never point PGLAB at a directory that already holds
data you care about, and if port 5440 is taken on your machine, choose another and use it in every
lesson.

${ARCHIVE_PRUNING_REMINDER}`,
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
      reading: code`
PostgreSQL 14 Internals: not covered by the book. Closest background: Chapter 1 "Introduction".`,
      syntaxBreakdown: code`
### In plain terms

This lesson gives you a repeatable way to talk to the disposable server and inspect what each
connection is doing. You will make psql show elapsed time and its server-process ID, save a query
result for reuse, run a short live monitor, and prove that psql can call the shell. A backend is the
server process handling one client connection; being able to identify it is essential when later
lessons investigate locks, waits, and concurrent sessions.

### What you are learning

- Connection defaults: environment variables save the host, port, user, and database for every psql
  invocation in a terminal.
- Session identity: a backend PID is the operating-system identifier that lets you connect client
  output to rows in PostgreSQL's activity view.
- psql as a small experiment harness: timing, variables, shell escapes, and bounded repetition turn
  one query into evidence you can compare or watch.

### Piece by piece

- **export PGLAB=$HOME/pglab PGHOST=/tmp PGPORT=5440 PGUSER=postgres PGDATABASE=lab** (shell environment assignments)
  - What it is: variables inherited by programs started from this terminal.
  - What it does here: tells psql to use the lab's Unix-socket directory, port, database role, and
    database without repeating connection flags. **PGLAB** is also used by the shell check later.
  - What it gives us: every new psql in this terminal reaches the intended lab; if a value is wrong,
    psql may connect to another server or report that the socket is unavailable.
- **export PATH=/usr/lib/postgresql/16/bin:$PATH** (shell environment assignment)
  - What it is: a search-path setting for executable programs.
  - What it does here: makes the PostgreSQL client tools available by name; adjust the directory if
    your installation is elsewhere.
  - What it gives us: the psql command used for the experiment and the same version of tools used by
    the lab setup.
- **\\timing on** (psql backslash command)
  - What it is: a psql display option, not SQL sent to the server.
  - What it does here: prints the time PostgreSQL took for each statement.
  - What it gives us: a **Time:** line after a query, useful for comparing work; it is not a promise of
    stable wall-clock timing.
- **\\x auto** (psql expanded-display command)
  - What it is: automatic expanded output mode.
  - What it does here: switches wide rows to one field per line when that is easier to read, and
    returns to normal columns when rows fit.
  - What it gives us: readable catalog rows without changing query results.
- **\\set PROMPT1 '%n@%/ pid=%p %R%# '** (psql prompt assignment)
  - What it is: a prompt template. %n is the user, %/ the database, and %p the backend PID;
    %R%# preserves psql's prompt markers.
  - What it does here: puts the current connection's PID visibly in the prompt.
  - What it gives us: a quick way to avoid confusing Session A and Session B; the PID also appears
    in pg_stat_activity.
- **pg_backend_pid()** (SQL function)
  - What it is: a function returning the server process ID for the current connection.
  - What it does here: labels this session in the first query and supplies the value saved by the
    second query.
  - What it gives us: the **my_pid** number to match against catalog views.
- **current_setting('cluster_name')** (SQL function)
  - What it is: a function that reads a named PostgreSQL configuration setting.
  - What it does here: confirms the connection belongs to the lab-primary cluster.
  - What it gives us: the configured cluster label beside the PID.
- **\\gset** (psql result-to-variable command)
  - What it is: a psql command that stores the one returned row as variables named after its
    columns.
  - What it does here: stores **my_pid** so later SQL can use **:my_pid** without copying a number.
  - What it gives us: a psql variable; this expects exactly one row, and the command should be last
    on that query line.
- **\\echo my backend is :my_pid** (psql output command)
  - What it is: psql's local print command; :my_pid is substituted before printing.
  - What it does here: shows that the saved variable contains the PID.
  - What it gives us: a human-readable confirmation, not a new server query.
- **pg_stat_activity** (system view)
  - What it is: one row describing each server process, including client backends and background
    workers.
  - What it does here: filters to this session with pid = :my_pid.
  - What it gives us: **pid**, **backend_type**, and **state**; a client row normally says **client backend**
    and is **active** while its query is executing.
- **\\! echo "shell sees PGLAB=$PGLAB"** (psql shell escape)
  - What it is: a psql command that runs the rest of the line in the operating system shell.
  - What it does here: prints the inherited PGLAB value without leaving psql.
  - What it gives us: proof that shell environment and psql session setup agree; it does not query
    PostgreSQL.
- **\\watch i=1 c=3** (psql repetition command; flags)
  - What it is: reruns the immediately preceding query on a schedule.
  - What it does here: **i=1** waits one second between runs, and **c=3** stops after three runs.
    Without c=3, Ctrl-C is needed to stop it.
  - What it gives us: three timestamp rows from select now(), demonstrating a bounded monitor.
`,
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
      reading: code`
PostgreSQL 14 Internals, Chapter 3 "Pages and Tuples" (section "Page Structure"); Chapter 6 "Vacuum and Autovacuum" (section "Vacuum"); Chapter 9 "Buffer Cache" (sections "Cache Hits", "Cache Warming")`,
      readingNotes: code`
The book uses the same families of internals that these extensions expose: page structure in
Chapter 3, vacuum's cleanup and visibility information in Chapter 6, and cache contents in
Chapter 9. This lesson only installs the inspection tools; the later storage lessons make the
book's structures visible. Read the cited sections after installation, when you can immediately
try their page, vacuum, and cache vocabulary against the lab.

The book does not cover every extension here: **pg_freespacemap**, **pg_walinspect**, **pg_stat_statements**,
**amcheck**, and the connection helpers are course tooling rather than book examples. PostgreSQL 16
also has views and output details newer than the PostgreSQL 14 examples in the book, but the
underlying page, vacuum, and cache mechanisms are the same.`,
      syntaxBreakdown: code`
### In plain terms

PostgreSQL keeps useful internals behind optional packages called extensions. This lesson enables
the small inspection tools used later, then compares what is installed with what the server can
provide. Extensions are installed in the current database, so running this in lab does not make
the functions automatically available in another database.

### What you are learning

- An extension is a packaged set of SQL objects and, sometimes, server code that adds a capability
  without changing the core server.
- Inspection depth: page, tuple, cache, vacuum, WAL, and query-statistics extensions expose
  different layers of the same database.
- Availability versus installation: pg_available_extensions describes files on the server, while
  \\dx shows what this database has enabled.

### Piece by piece

- **CREATE EXTENSION IF NOT EXISTS NAME** (DDL statement)
  - What it is: an SQL command that runs an extension's install script in the current database.
  - What it does here: creates each named extension only if it is not already installed, so the
    setup can be rerun safely. pageinspect reads pages and tuples; pg_buffercache reads shared
    buffers; pgstattuple measures live and dead tuple space; pg_visibility inspects visibility;
    pg_walinspect reads WAL; pg_freespacemap reads free-space data; pg_prewarm warms cache
    pages; pgrowlocks inspects row locks; amcheck checks index structure; pg_stat_statements
    aggregates query statistics; dblink and postgres_fdw provide connection/foreign-table
    helpers.
  - What it gives us: functions and views for later experiments. pg_stat_statements additionally
    needs the lab's shared_preload_libraries setting at server start; the setup already configured
    that requirement.
- **\\dx** (psql extension-list command)
  - What it is: a psql command that asks the server for extensions installed in this database.
  - What it does here: lists the twelve requested extensions plus the built-in plpgsql language.
  - What it gives us: the installed name and version; absence means later functions from that
    extension will not resolve.
- **pg_available_extensions** (system view)
  - What it is: a view of extension control files available to the server installation.
  - What it does here: filters to four names and orders them alphabetically.
  - What it gives us: name identifies the package and installed is true when installed_version is
    not null. test_decoding should be available but false because it is an output plugin for logical
    decoding, not an extension installed with CREATE EXTENSION.
`,
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
      reading: code`
PostgreSQL 14 Internals, Chapter 1 "Introduction" (sections "Processes and Memory", "Clients and the Client-Server Protocol"); Chapter 15 "Locks on Memory Structures" (section "Monitoring Waits")`,
      readingNotes: code`
Chapter 1 supplies the process and client/server model behind this inventory: a postmaster accepts
connections and PostgreSQL creates a backend process for each client, while auxiliary processes
handle shared work. The lesson observes the live process list and settings; Chapter 15 adds the
wait-event vocabulary used to interpret idle or blocked processes. Read Chapter 1 first for the
model, run this survey, then use Chapter 15 when a later lesson needs wait details.

The book explains the architecture rather than exhausting max_connections or measuring process
cost. The exact background-process list and backend_type labels can vary with PostgreSQL version
and enabled features, so treat names as a live inventory rather than a fixed count.`,
      syntaxBreakdown: code`
### In plain terms

The server is a small process tree. One postmaster owns the cluster and accepts connections; each
client gets a backend, while checkpointer, WAL, vacuum, archiving, and other workers perform shared
maintenance. You will compare PostgreSQL's view of that tree with the operating system's process
list and then inspect the settings that limit how many workers can exist.

### What you are learning

- Process-per-connection: a client connection consumes a distinct backend process and its memory.
- Auxiliary roles: background processes move work out of the client request, such as flushing WAL,
  writing checkpoints, vacuuming, or archiving completed WAL files.
- Wait events and capacity settings: a process can be alive but idle or waiting, and configuration
  limits bound how many connections and workers the node can run.

### Piece by piece

- **pg_stat_activity** (system view)
  - What it is: a live row per server process, not merely per human client.
  - What it does here: lists all processes and sorts them by backend_type and PID.
  - What it gives us: pid for correlation, backend_type for the process role, state for active/idle
    status, and wait_event_type/wait_event for what an idle or blocked process is
    waiting on. The list should include your client and common roles such as checkpointer,
    background writer, WAL writer, autovacuum launcher, archiver, and logical replication launcher;
    optional workers may differ by version and activity.
- **\\! ps -o pid,ppid,etime,cmd --ppid $(head -1 $PGLAB/primary/postmaster.pid)** (psql shell escape plus shell commands/flags)
  - What it is: head -1 reads the first line of postmaster.pid, which stores the postmaster's PID;
    ps displays processes; **-o** chooses columns and **--ppid** filters children of that PID.
  - What it does here: asks the operating system for the processes directly spawned by PostgreSQL's
    postmaster. **pid** is the child ID, **ppid** is its parent, **etime** is elapsed time, and **cmd** is
    the command line.
  - What it gives us: a process list that should correspond to the PostgreSQL view, with every listed
    child showing the postmaster PID as its parent. The command substitution supplies the PID from
    the lab file; if the server is stopped, the file or child list will be unavailable.
- **pg_settings** (system view)
  - What it is: a view exposing the active configuration and metadata for every setting.
  - What it does here: selects the worker and connection limits relevant to the process inventory.
  - What it gives us: **name** and **setting** for **max_connections**, **max_worker_processes**,
    **autovacuum_max_workers**, **max_wal_senders**, and **max_parallel_workers**; these are ceilings, not
    necessarily the number currently running.
`,
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
