# Received WAL is not yet visible data

slug: received-is-not-replayed
category: replication
difficulty: intermediate
tags: replication, wal, lsn, replay, freshness
prerequisites: build-a-standby
safety: privileged
run-in: shell
sessions: 1
min-version: 16
minutes: 12
revision: 1

## Overview
A standby can receive WAL while its queries still show older data. Inspect a fixture with replay
paused, locate the stopped stage, and construct the SQL action that makes the committed row visible.
The primary and receiver continue running throughout; reconnecting a reader does not itself apply
the received log.

## Syntax breakdown
### Mechanism map

```text
primary COMMIT id=2 -> flushed WAL -> receiver: received through marker
                                             |
                                             X replay paused before marker
                                             |
                                     fresh SELECT: id=2 absent

resume replay -> replay through marker -> fresh SELECT: id=2 present
```

An **LSN** is a byte position in the WAL stream. **pg_last_wal_receive_lsn()** reports the last
position received and synced by streaming replication; **pg_last_wal_replay_lsn()** reports applied
progress. They measure different stages. The controller captures a primary flush position after
the commit response, so replay through that position covers this commit; it is a conservative
post-commit bound, not an extracted commit-record LSN.

### Your task — about three minutes
Replace the action in Run with a psql call that resumes replay on **REPLICA**, using the syntax
below. Diagnose from the supplied evidence: the receiver is streaming and has reached the marker,
the replay position has not, and pause state is **paused**. The supplied query only inspects recovery
mode; it leaves the stalled stage unchanged. Choose the recovery-control function that addresses
the observed cause, and execute it through the supplied replica connection.

- **psql "$REPLICA" -X -v ON_ERROR_STOP=1 -c "SQL"** connects to the private standby, ignores psql
  startup files, stops on unexpected SQL errors and executes one SQL command.
- **SELECT pg_is_in_recovery()** inspects the role; it does not advance replay.
- **SELECT pg_wal_replay_resume()** releases a replay pause while retaining standby recovery mode.
  **pg_promote()** would end standby recovery and create a writable primary; it is outside this task.

Keep outer single quotes around **--action** so **REPLICA** expands in the fixture's shell, and
double-quote the connection variable and SQL inside it. Allow three minutes for the change and
two for debugging; the complete lesson fits twelve minutes. A worked command is below if needed.

### Supplied controls and evidence
- **go run ... --lesson 31** creates a primary and a streaming standby using the preceding
  lesson's **pg_basebackup -X stream -R** setup. It uses a new private tree on every invocation.
- **pg_wal_replay_pause()** requests a pause; the controller polls
  **pg_get_wal_replay_pause_state()** until it is actually **paused** before committing the marker
  row on the primary. No fixed sleep is used as proof of a pause or of receipt.
- The fixture waits until receive LSN is at least the marker, then prints raw receive/replay LSNs,
  receiver status, and the four labelled fields below. **>= 'LSN'::pg_lsn** compares WAL positions
  in PostgreSQL's native LSN type, not as text. The controller substitutes its measured marker.
- After your action, it polls fresh connections for replay through the marker and the actual row.
  **pg_wal_replay_resume()** returning alone is not evidence that apply has caught up. The
  observation deadline is eight seconds; the one-row workload is deliberately tiny.
- Normal durability settings remain on. Commands and connections have deadlines; root's server
  commands run as the postgres OS account. Cleanup stops the standby even if still paused, then
  the primary, verifies stopped state, and removes both data directories and retained WAL.

## Caution
Use one shell with Go and PostgreSQL 16. Pausing apply can accumulate received WAL; this fixture
commits only one small row while paused. Budget 500 MB, leave 2 GiB free, and meet the controller's
3 GiB startup check. Use only its supplied connection variables. Ctrl-C triggers teardown; verify
`cleanup=owned_tree_removed removed=true`. A reported retained path needs inspection before rerun.

## Setup
```sh
cd /root/Software/skills-tools/curriculum-tools
```

## Run
```sh
# Replace the inspection SQL with the action that releases the observed pause.
go run ./courses/postgres-essentials/lab/recovery --lesson 31 \
  --action 'psql "$REPLICA" -X -v ON_ERROR_STOP=1 -c "SELECT pg_is_in_recovery()"'
```

## Expected result
Before your action, the columns are
`pause_state,received_through_marker,replayed_through_marker,visible_marker_rows` and the value is
`paused|t|f|0`. The receiver is **streaming**. Raw LSNs vary but the receive position is ahead of
replay. The starter prints true for recovery mode, then reaches the bounded replay deadline and
exits with STOP after cleanup: inspecting the role did not unpause apply.

### Worked completion

```sh
go run ./courses/postgres-essentials/lab/recovery --lesson 31 \
  --action 'psql "$REPLICA" -X -v ON_ERROR_STOP=1 -c "SELECT pg_wal_replay_resume()"'
```

After resume and the bounded catch-up wait, the same evidence becomes `not paused|t|t|1`.
The committed marker row is now visible to a fresh reader. Both successful and starter runs end
with `cleanup=owned_tree_removed removed=true`; no manual replay resume is needed after teardown.

## Systems lens
Transport progress does not imply applied state. A streaming connection and received WAL can both
look healthy while replica reads remain stale. This controlled failure identifies apply as the
stopped stage; in another incident transport or a long-lived reader snapshot could be the cause.
Fresh queries here exclude snapshot reuse. The next lesson will turn replay-position evidence into
a bounded read-your-writes decision; this experiment only demonstrates why the receive position
alone cannot provide that guarantee.
