# Observe sleeping and stopped process states

slug: process-states
category: processes-and-identity
difficulty: beginner
tags: processes, procfs, signals
prerequisites: proc-process-identity
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Observe one child while it sleeps, stop it with SIGSTOP, and continue it with SIGCONT. The state letter explains why a task is not currently executing.

## Syntax breakdown
### In plain terms

A sleep child is sampled, stopped, and continued. The state letters show an observable transition; they do not promise how a busy process would be scheduled at every instant.

### What you are learning

- SIGSTOP makes a task stopped until continued.
- ps state is a sampled kernel-state summary.

### Piece by piece

- **sleep 5 &** creates a bounded child and **$!** records it for cleanup.
- **ps -o stat= -p PID** requests the compact state field only; **tr -d ' '** removes padding and **cut -c1** keeps its primary letter.
- **kill -STOP PID** cannot be caught by the child; **kill -CONT PID** makes a stopped task runnable again.
- The equality test expects S, T, S for this sleeping child. The trap kills and waits only the recorded PID.

## Run
```sh
state_pid=
sleep 5 &
state_pid=$!
trap 'kill "$state_pid" 2>/dev/null || true; wait "$state_pid" 2>/dev/null || true' EXIT
sleep 0.1
state_before=$(ps -o stat= -p "$state_pid" | tr -d ' ' | cut -c1)
kill -STOP "$state_pid"
sleep 0.1
state_stopped=$(ps -o stat= -p "$state_pid" | tr -d ' ' | cut -c1)
kill -CONT "$state_pid"
sleep 0.1
state_after=$(ps -o stat= -p "$state_pid" | tr -d ' ' | cut -c1)
printf 'state_before=%s\n' "$state_before"
printf 'state_after_stop=%s\n' "$state_stopped"
printf 'state_after_continue=%s\n' "$state_after"
if [ "$state_stopped" = T ] && [ "$state_before" = S ] && [ "$state_after" = S ]; then printf 'state_transition=observed\n'; else printf 'state_transition=unexpected\n'; fi
kill "$state_pid" 2>/dev/null || true
wait "$state_pid" 2>/dev/null || true
trap - EXIT
```

## Expected result
state_before=S, state_after_stop=T, state_after_continue=S, and state_transition=observed. A plus suffix may appear in raw ps output when a process is in the foreground process group; the first state letter is the invariant.

## Systems lens
Task state records whether a process is sleeping, stopped, runnable, or exiting. A scheduler view without state transitions cannot distinguish a slow computation from a deliberately paused or blocked task.

## Optional variation
For this sleeping child, the expected first state letters are `S` before STOP, `T` after STOP, and `S` after CONT. `kill -STOP` causes the guaranteed transition; the `ps` results are snapshots, so the experiment inspects only their first character.

For a shorter repeat, replace the child command with:

```sh
sleep 2 &
```

Retain both 0.1-second observation delays and the exact-PID cleanup. To distinguish an I/O-blocked task from a deliberately stopped one, inspect the process state together with its wait channel or I/O evidence and the signal history.
