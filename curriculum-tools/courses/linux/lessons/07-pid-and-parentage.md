# Read PID and parentage from procfs

slug: pid-and-parentage
category: processes-and-identity
difficulty: beginner
tags: processes, procfs
prerequisites: cleanup-with-traps
safety: read-only
run-in: shell
sessions: 1
min-version: 5.1
minutes: 10
revision: 2

## Overview
Spawn one bounded child and correlate the shell's PID, the child's PID, and the child's PPID. The relationship is kernel-maintained process identity, not a convention inferred from a command line.

## Syntax breakdown
### In plain terms

A child process has a kernel PID and a parent PID. The experiment reads both identities while the child is still alive, then reaps only that recorded child.

### What you are learning

- A PID is a namespace-local task identifier.
- PPID is a kernel-maintained parent relationship.

### Piece by piece

- **bash -c** starts a child Bash; **sleep 4** keeps it observable.
- **&** backgrounds that child and **$!** captures its PID immediately; **BASHPID** identifies the current shell process.
- **awk** reads the `PPid:` field from **/proc/PID/status**. **ps -o pid=,ppid=,stat=,comm= -p PID** prints only the selected process; the empty `=` headings make columns easier to compare.
- The equality test produces `parentage_check`; **wait PID** reaps the exact child. PIDs and the sampled state vary.

## Run
```sh
child_pid=
bash -c 'sleep 4' &
child_pid=$!
shell_pid=$BASHPID
child_ppid=$(awk '/^PPid:/{print $2}' "/proc/$child_pid/status")
printf 'shell_bashpid=%s\n' "$shell_pid"
printf 'child_pid=%s\n' "$child_pid"
printf 'child_ppid=%s\n' "$child_ppid"
ps -o pid=,ppid=,stat=,comm= -p "$child_pid"
if [ "$child_ppid" -eq "$shell_pid" ]; then printf 'parentage_check=direct-child\n'; else printf 'parentage_check=unexpected\n'; fi
wait "$child_pid"
printf 'cleanup=child_reaped\n'
```

## Expected result
child_pid is a live positive PID; child_ppid equals shell_bashpid; ps shows the child in a sleeping state with that PPID; parentage_check=direct-child; and wait finishes with cleanup=child_reaped. PIDs vary per run.

## Systems lens
A PID names a task in a process namespace and PPID records its parent relationship. Supervisors, reapers, and request-to-process correlation all depend on this kernel-maintained identity graph.

## Optional variation
**Predict.** Before running, which two printed identity values should you compare to test direct parentage?

**Inspect and explain.** Compare the PPID in procfs with the ps row and explain why a command name alone is weaker evidence.

**Vary.** Change only the child delay from 4 to 1 second and repeat before it exits.

**Hint.** Keep `$!` immediately after the background command.

**Apply.** State which PID and parent relation you would capture before terminating an unexpected service worker.
