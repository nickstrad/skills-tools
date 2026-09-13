# Recovery can fail when one required segment is missing

slug: recovery-needs-history
category: durability-recovery
difficulty: intermediate
tags: wal, backups, recovery, retention
prerequisites: restore-and-verify
safety: dangerous
run-in: shell
sessions: 1
min-version: 16
minutes: 15
revision: 1

## Overview
A base backup depends on WAL history beginning at its recovery starting point. Remove one required
segment from a disposable archive copy, observe why startup fails, then repair that copy using a
preserved file. Your task is to construct the repair command from the supplied paths and missing
filename. The original archive and primary stay intact.

## Syntax breakdown
### Mechanism map

```text
original archive: [start segment][later segments][target]  kept intact
                         |
backup_label names ------+  required checkpoint/WAL start
                         |
recovery archive copy: [  GAP  ][later segments][target] -> startup fails
                         ^
preserved safe file ------+  learner repairs exactly this segment
                                                        -> recovery reaches target
```

A WAL segment is a file holding part of the ordered log. Having newer segments does not replace an
earlier required record. Here the missing file contains the starting checkpoint named by the
backup, so recovery cannot even reach a consistent starting state. We use a recovery target just
after one useful operation to make the repaired endpoint explicit; lesson 29 explores that choice.

### Your task — about four minutes
Replace the shell no-op **:** in Run with a command that copies the one preserved file into the
recovery archive copy, keeping its original filename. The controller exports these variables only
inside the action shell:

| Variable | Meaning |
| --- | --- |
| SAFE | Directory holding the withheld, intact segment |
| MISSING | Required segment filename read from backup_label and printed before failure |
| ARCHIVE | Disposable recovery archive copy with that file absent |

Use **cp SOURCE DESTINATION** and quote each constructed path. For example, `"$DIR/$NAME"` joins
a directory and filename without splitting spaces. The outer single quotes around **--action**
defer expansion until the controller's shell has set the private variables. No wildcard, filename
guess or deletion is needed. Allow four minutes to construct/debug the command, then use the worked
completion if needed. The whole core, including the expected failed start, fits fifteen minutes.

### Commands and supplied work
- **go run ... --lesson 28 --action '...'** creates the fixture and executes your shell command
  after the controlled startup failure. **:** succeeds without changing anything, so the starter
  demonstrates the unresolved gap and then exits with STOP after cleanup.
- **pg_basebackup -X none** takes the physical backup without bundling WAL; this fixture must
  retrieve its required history from the archive. **archive_command** copies completed segments to
  a private original archive; **pg_switch_wal()** finishes the current segment. The controller waits
  for the completed archive file before making the recovery archive copy.
- **backup_label** records the backup's starting WAL location and filename. The controller
  withholds that exact file only from the archive copy while the recovery server is stopped.
  It retains an intact safe copy and the original archive. It never removes primary **pg_wal**.
- **recovery.signal** requests archive recovery. **restore_command** copies the requested `%f`
  filename from the recovery archive to PostgreSQL's `%p` destination. Missing files make that
  command fail. **pg_ctl -w** reports the failed start; the server log identifies the missing
  checkpoint history. Your action then repairs the input, and the controller retries startup.
- **recovery_target_name='before_bad'** and **recovery_target_action='pause'** stop replay at a
  supplied named log marker, keeping recovery mode active for inspection. The controller queries
  the paused server and checks the repaired segment against the original SHA256 hash.
- The supplied Go controller handles private sockets, postgres OS ownership when root, 1 MB WAL
  segments, bounded commands and normal fast shutdown/removal of both servers, backup and archives.

## Caution
This lesson deliberately makes one owned recovery copy incomplete. Run in one shell with Go and
PostgreSQL 16. Budget 500 MB temporary space and leave 2 GiB free; startup requires 3 GiB.
Never apply the missing-file experiment to a live data directory or shared archive. Ctrl-C cleans
owned resources. Check `cleanup=owned_tree_removed removed=true`; a retained-path warning needs
inspection before another run. The expected startup failure below is not permission to ignore other
server failures.

## Setup
```sh
cd /root/Software/skills-tools/curriculum-tools
```

## Run
```sh
# Replace : with the copy command that repairs the one missing archive file.
go run ./courses/postgres-essentials/lab/recovery --lesson 28 --action ':'
```

## Expected result
Both starter and completion first print `required_start_segment=...` and log a failed attempt to
read that segment, ending in `could not locate required checkpoint record`. The controller checks
the filename and cause and prints `missing_history_failure_verified=true`. Filenames vary.
The starter leaves the gap and stops with `required archive segment is still missing` after cleanup.
The log can also show a missing **00000002.history** or a later segment during archive probing,
including on the successful run. Those probes alone do not establish failure: the decisive first
failure names the required starting segment and checkpoint record. Keep **backup_label** intact.

### Worked completion

```sh
go run ./courses/postgres-essentials/lab/recovery --lesson 28 \
  --action 'cp "$SAFE/$MISSING" "$ARCHIVE/$MISSING"'
```

After that repair, startup reaches `before_bad` and pauses. The recovered operation history is
`1|baseline` and `2|accepted order`. Logs show redo and stopping at the restore point.
Expect `repaired_recovery=true original_archive_unchanged=true`, then
`cleanup=owned_tree_removed removed=true`. The original archive hash check and exact recovered
history provide evidence beyond the second startup command's exit status.

## Systems lens
Retention is a dependency question: which backup, target or replica still needs each part of the
log? “Old” and “not the current WAL file” are insufficient reasons to delete it. The recovery
starting point supplies one concrete obligation here; a shared archive can have several consumers
with different obligations. This failure concerns a required checkpoint segment. Missing history
later in recovery can instead prevent reaching a target or leave a standby waiting; it need not
produce this same startup error. Retire a disposable lab as a whole when its obligations end.
