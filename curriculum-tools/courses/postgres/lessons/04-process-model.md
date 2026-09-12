# Map the process model: postmaster, backends, and background workers

slug: process-model
category: lab-setup
difficulty: beginner
tags: process-model, background-processes, connections
prerequisites: shell-and-psql-toolkit
safety: read-only
run-in: mixed
sessions: 1
min-version: 16
minutes: 10
revision: 2

## Overview
See that every connection is an OS process forked by the postmaster, and that durability and
cleanup are delegated to a fixed set of auxiliary processes.

## Syntax breakdown
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

## Run
```text
select pid, backend_type, state, wait_event_type, wait_event
from pg_stat_activity
order by backend_type, pid;
\! ps -o pid,ppid,etime,cmd --ppid $(head -1 $PGLAB/primary/postmaster.pid)
select name, setting from pg_settings
where name in ('max_connections','max_worker_processes','autovacuum_max_workers',
               'max_wal_senders','max_parallel_workers');
```

## Expected result
You see checkpointer, background writer, walwriter, autovacuum launcher, logical replication
launcher, archiver, and your own client backend. ps shows the same processes as children of the
postmaster, each with a descriptive command line. Idle auxiliary processes wait on named latches
(wait_event_type = Activity).

## Systems lens
Process-per-connection means memory and scheduler cost scale with connections, which is why
connection poolers exist and why max_connections is a capacity limit rather than a tunable.
The auxiliary processes are the durability pipeline: backends append WAL, walwriter flushes it,
checkpointer bounds recovery time, and the archiver ships segments off-box.

## Optional variation
Open a second psql (Session B), rerun the ps command, and find its new process. Then quit B and
watch the process disappear: PostgreSQL has no thread pool to hide this cost.
