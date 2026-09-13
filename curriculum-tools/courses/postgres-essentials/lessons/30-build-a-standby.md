# Build and verify a streaming standby

slug: build-a-standby
category: replication
difficulty: intermediate
tags: replication, backups, standby, streaming
prerequisites: targeted-recovery
safety: privileged
run-in: shell
sessions: 1
min-version: 16
minutes: 15
revision: 1

## Overview
A physical copy becomes a streaming standby when it starts in recovery mode and connects back to
the primary for new WAL. Construct the backup command that supplies those startup instructions,
then verify the standby can expose a write committed after the backup finished. Existing copied
rows alone would not establish streaming replication.

## Syntax breakdown
### Mechanism map

```text
primary files + required WAL -- pg_basebackup --> new destination
                                                   |
                    -R writes standby.signal + primary_conninfo
                                                   |
primary WAL sender -------- live WAL stream ------> standby receiver -> replay -> SELECT

id=2 is committed after the backup: seeing it requires more than the copied baseline.
```

**standby.signal** asks PostgreSQL to remain in recovery as a standby. **primary_conninfo** tells
its WAL receiver how to connect to the source. The source's WAL sender transmits log records;
the standby replays them to update its own files. Queries use snapshots of the replayed state.
This fixture supplies connection permissions and private sockets so the task stays focused on
turning a backup into a standby.

### Your task — about four minutes
Replace the no-op in Run with a **pg_basebackup** command. Combine the options below to copy
**PRIMARY** into **DEST**, include required WAL, and write the standby configuration. The
controller supplies those variables inside your action shell. It starts the destination for you
after checking **standby.signal** exists. Do not run initdb or pg_ctl yourself.

| Option | Purpose |
| --- | --- |
| -d "$PRIMARY" | Explicit connection string to this invocation's private source |
| -D "$DEST" | Newly allocated, initially absent destination data directory |
| -X stream | Stream required WAL alongside the base backup |
| -R | Create standby.signal and record source connection settings |
| --checkpoint=fast | Request the backup's initial checkpoint promptly |

**-X stream** describes WAL collection during backup; **-R** supplies the instructions for
continuous standby operation afterward. Both are needed for this task. Enclose the complete action
in single quotes so the private variables expand inside the controller, and double-quote each
variable inside it. Spend four minutes constructing/debugging it; the worked completion below is
available without a separate answer stage. The full core fits fifteen minutes.

### Observations and supplied work
- **go run ... --lesson 30 --action '...'** allocates the primary and executes your command as the
  fixture owner. **:** is a harmless shell no-op. No existing cluster endpoint is accepted.
- The controller gives the copied server its own socket and disables its archiving while preserving
  the connection settings written by **-R**. **pg_is_in_recovery()=true** distinguishes the standby
  from a separately writable restored primary.
- **pg_stat_wal_receiver.status='streaming'** proves a live receiving connection. The controller
  waits for that state, then commits **id=2, after backup** on the primary and polls a fresh standby
  query for that row, with an eight-second deadline. Copied baseline **id=1** is insufficient proof.
- The private source uses **wal_level=replica**, allows WAL senders, and retains a small WAL window
  with **wal_keep_size=16MB**. No persistent replication slot is created. This tiny bounded workload
  cannot demonstrate retention during a long outage.
- Go supplies PostgreSQL 16 initialization and process control, explicit local connections, and
  normal durability settings. Root switches server commands to the postgres OS account. Cleanup
  stops the standby and then primary with a fast, waited shutdown and removes both directories.

## Caution
Use one shell with Go and PostgreSQL 16. Budget 500 MB temporary disk and leave 2 GiB free; the
controller requires 3 GiB before allocating. Commands receive private paths, but the action shell
is ordinary shell execution: use only the supplied variables and command boundary. Never substitute
the learner cluster. Ctrl-C triggers cleanup; verify the removal record before another invocation.
These two servers share one host and disk, so they do not provide independent-host availability.

## Setup
```sh
cd /root/Software/skills-tools/curriculum-tools
```

## Run
```sh
# Construct the base backup command with the standby startup instructions.
go run ./courses/postgres-essentials/lab/recovery --lesson 30 --action ':'
```

## Expected result
The starter creates no destination and ends with `standby.signal absent` after cleanup. A backup
command that omits **-R** also lacks that file; the controller refuses to start it as a standby.

### Worked completion

```sh
go run ./courses/postgres-essentials/lab/recovery --lesson 30 \
  --action 'pg_basebackup -d "$PRIMARY" -D "$DEST" -X stream -R --checkpoint=fast'
```

Expect `standby_signal=true in_recovery=true receiver=streaming post_backup_marker_visible=true`.
The fresh standby history contains `1|baseline` and `2|after backup`. This checks recovery mode,
the transport connection and actual replayed data. The invocation finishes with
`cleanup=owned_tree_removed removed=true`; both server trees are gone.

## Systems lens
Replica setup and replica freshness are separate properties. This run proves the new server
streamed and replayed one post-backup commit within a bounded wait. It does not promise every
future read will include a preceding primary write: the stream or replay can lag independently.
The next lesson separates those progress stages. A standby is also not an older recovery point;
it will normally replay unwanted committed changes as readily as wanted ones.
