# Set up the shell and psql habits the course depends on

slug: shell-and-psql-toolkit
category: lab-setup
difficulty: beginner
tags: lab, psql
prerequisites: build-lab-cluster
safety: read-only
run-in: tool
sessions: 1
min-version: 16
minutes: 10
revision: 2

## Overview
Most experiments need two terminals (Session A and Session B) talking to the same lab, each
showing its backend PID so you can find it in pg_stat_activity, plus \timing, \gset and \watch to
turn queries into measurements.

## Syntax breakdown
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

## Run
```sql
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
-- (\watch i=1 repeats every second; c=3 stops after three runs. Without c=, press Ctrl-C.)
```

## Expected result
The prompt shows your database and PID; the pg_stat_activity row for :my_pid says
backend_type = client backend, state = active (it is running the query). \watch prints a new
timestamp every second, three times.

## Systems lens
Each psql session is one backend process with its own PID, transaction state, and locks. Cross
referencing PIDs between sessions is how you will read wait-for graphs and lock queues, exactly
as you would correlate request IDs across services.

## Optional variation
Open a second terminal (Session B) and confirm you can see Session A's PID from it:
select pid, application_name, state from pg_stat_activity where backend_type = 'client backend';
