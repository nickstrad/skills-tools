# Build a disposable lab cluster you fully control

slug: build-lab-cluster
category: lab-setup
difficulty: beginner
tags: lab, process-model, configuration
safety: privileged
run-in: shell
sessions: 1
min-version: 16
minutes: 15
revision: 2

## Overview
Every later lesson crashes, promotes, corrupts, or reconfigures a PostgreSQL node on purpose, so
you need a cluster that is yours to break. Create one with initdb under $PGLAB on port 5440 with the
settings the curriculum relies on (logical WAL, checksums, archiving, prepared transactions,
commit timestamps, I/O timing, pg_stat_statements, verbose logging).

## Syntax breakdown
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
  (wal_level, shared_preload_libraries); the optional variation shows how to distinguish them.

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
    version string is also what the course's minVersion refers to.

## Caution
This is a throwaway cluster: never point PGLAB at a directory that already holds
data you care about, and if port 5440 is taken on your machine, choose another and use it in every
lesson.


### Small-disk archive check

The lab's archived WAL is intentionally never deleted by PostgreSQL, so check it periodically:

    df -h "$PGLAB"
    du -sh "$PGLAB/archive"

Only prune after you have a base backup you can restore from, and only when no standby or other
recovery process still needs older WAL. A replication slot can also make **$PGLAB/primary/pg_wal**
grow, although it does not by itself make an archived copy safe to delete. In this course, the
backup created by module 08 is **$PGLAB/backup1**. Preview the files that would be removed, using
that backup's START WAL file as the cutoff:

    start_file=$(sed -n 's/^START WAL LOCATION:.*(file \([^)]*\)).*/\1/p' "$PGLAB/backup1/backup_label")
    pg_archivecleanup -n "$PGLAB/archive" "$start_file"

If **start_file** is empty, stop: the backup label was not found. If the preview names only WAL
files older than the backup (and you have checked standbys or other restore consumers), perform the
cleanup and measure the result:

    pg_archivecleanup "$PGLAB/archive" "$start_file"
    du -sh "$PGLAB/archive"

The **-n** preview is the safety check; **pg_archivecleanup** keeps the cutoff file and newer files.
Never run it against **$PGLAB/primary/pg_wal**, and do not guess a cutoff when **backup1** does not
exist. Keep a separate, tested backup if the archive is part of your real recovery plan.

## Run
```sh
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
psql -h /tmp -p 5440 -U postgres lab -c 'select version()'
```

## Expected result
initdb prints the files it created, pg_ctl says "server started", and psql prints the PostgreSQL
16.x version string. $PGLAB/primary/postgresql.conf ends with the lab block; $PGLAB/primary/log/
holds the server log.

## Systems lens
A PostgreSQL node is a process tree over one directory: pages in base/, the write-ahead log in
pg_wal/, transaction status in pg_xact/, and control metadata in global/pg_control. Owning all of
it lets you treat the database like any other stateful service you might operate: something you
can kill, copy, replay, and replicate rather than a black box behind a connection string.

## Optional variation
Read $PGLAB/primary/postgresql.conf from the top and note which settings need a restart
(context = postmaster) versus a reload: select name, context from pg_settings where name in
('wal_level','shared_buffers','archive_mode','log_min_duration_statement').
