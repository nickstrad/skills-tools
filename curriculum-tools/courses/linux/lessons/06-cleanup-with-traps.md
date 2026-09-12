# Make cleanup part of the experiment with traps

slug: cleanup-with-traps
category: lab-and-shell-discipline
difficulty: beginner
tags: lab, shell, processes
prerequisites: coordinate-two-shell-sessions
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 10
revision: 3

## Overview
Start one uniquely identified child and one lab record inside a subshell, then leave the subshell normally. Its EXIT trap kills and reaps the exact child and removes the record, proving that cleanup runs at the boundary where resources were acquired.

## Syntax breakdown
### In plain terms

The subshell acquires one child and one file, registers their release immediately, then exits normally. The parent retains a second record so it can verify cleanup after the trap has removed its owned PID file.

### What you are learning

- An EXIT trap is cleanup attached to a control-flow boundary.
- Killing a known PID and reaping it are separate operations.

### Piece by piece

- **( ... )** starts a subshell, so its trap and child ownership end at the closing parenthesis.
- **trap COMMAND EXIT** schedules the exact recorded PID for **kill**, **wait**, and **rm -f** when that subshell exits. `2>/dev/null || true` makes an already-exited child harmless without changing the parent shell's error state.
- **sleep 30 &** creates a bounded background child and **$!** records its PID; the printed inside labels prove the trap has a concrete target.
- **kill -0 PID** probes whether that PID exists without delivering a signal. **test -e** reports whether the named PID file exists.
- After the subshell exits, **cat** reads the parent's record and the `child_after_subshell` and file labels test the cleanup result. The exact PID varies.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
PID_FILE=$LAB/trap-child-$UID.pid
RECORD=$LAB/trap-record-$UID.pid
rm -f "$PID_FILE" "$RECORD"
(
  trap_child_pid=
  trap 'kill "$trap_child_pid" 2>/dev/null || true; wait "$trap_child_pid" 2>/dev/null || true; rm -f "$PID_FILE"' EXIT
  sleep 30 & trap_child_pid=$!
  printf '%s\n' "$trap_child_pid" > "$PID_FILE"
  printf '%s\n' "$trap_child_pid" > "$RECORD"
  printf 'inside_child_pid=%s\n' "$trap_child_pid"
  printf 'inside_child_alive=%s\n' "$(kill -0 "$trap_child_pid" 2>/dev/null && echo yes || echo no)"
  printf 'inside_pid_file=%s\n' "$(test -e "$PID_FILE" && echo present || echo absent)"
)
recorded_pid=$(cat "$RECORD")
printf 'recorded_pid=%s\n' "$recorded_pid"
if kill -0 "$recorded_pid" 2>/dev/null; then child_after_subshell=alive; else child_after_subshell=gone; fi
printf 'child_after_subshell=%s\n' "$child_after_subshell"
printf 'pid_file_after_subshell=%s\n' "$(test ! -e "$PID_FILE" && echo absent || echo present)"
rm -f "$RECORD"
printf 'cleanup=record_removed\n'
```

## Expected result
inside_child_alive=yes and inside_pid_file=present identify one live sleep child. After the subshell exits, recorded_pid equals inside_child_pid, child_after_subshell=gone (the trap killed and reaped that exact PID), pid_file_after_subshell=absent, and cleanup=record_removed. No unrelated process is signalled.

## Systems lens
Resource ownership is a control-flow property: the process that acquires a child and a file should register their release immediately. This is the shell analogue of finally blocks, lease expiry, and service shutdown hooks.

## Optional variation
**Predict.** Before running, which post-subshell labels should demonstrate cleanup while retaining evidence of the former child?

**Inspect and explain.** Explain why `kill -0` is evidence about the recorded PID at this instant, not a guarantee against later PID reuse.

**Vary.** In a full rerun, change the child to `sleep 1` and insert `sleep 1.2` after the inside-file observation but before the subshell closes; then inspect the same cleanup labels.

**Hint.** The inserted delay lets the child end naturally before the EXIT trap reaps it. Keep the exact-PID trap; do not replace it with pkill or killall.

**Apply.** For a worker that owns a temporary file and a child process, state the acquisition order and the matching cleanup actions you would register.
