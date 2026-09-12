# See Linux threads as schedulable tasks

slug: threads-under-task
category: processes-and-identity
difficulty: beginner
tags: processes, procfs, scheduling
prerequisites: proc-process-identity
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Create one Python process with three sleeping threads, then compare its process identity with the entries under /proc/PID/task. Linux schedules each thread task even though users often name the group by one PID.

## Syntax breakdown
### In plain terms

One Python process creates three sleeping threads. Linux exposes each schedulable task under the same thread group, so a single process PID can represent several runnable or sleeping tasks.

### What you are learning

- A thread group shares process resources while each thread is a task.
- Thread counts and states are snapshots during the bounded sleep.

### Piece by piece

- **python3 -c** runs the supplied program; **threading.Thread** starts three daemon workers and the final **time.sleep** keeps the process observable.
- **find /proc/PID/task -mindepth 1 -maxdepth 1 -type d** selects only task-ID directories; **wc -l** counts them.
- **awk** reads `Tgid:` from status. **ps -L** lists lightweight-process IDs with PID, LWP, state, and command columns.
- The `at least 4` check permits implementation timing while proving leader plus workers. The trap cleans up the exact Python PID.

## Run
```sh
thread_pid=
python3 -c 'import threading,time; [threading.Thread(target=time.sleep,args=(5,),daemon=True).start() for unused in range(3)]; time.sleep(5)' &
thread_pid=$!
trap 'kill "$thread_pid" 2>/dev/null || true; wait "$thread_pid" 2>/dev/null || true' EXIT
sleep 0.2
thread_count=$(find "/proc/$thread_pid/task" -mindepth 1 -maxdepth 1 -type d | wc -l)
tgid=$(awk '/^Tgid:/{print $2}' "/proc/$thread_pid/status")
printf 'process_pid=%s\n' "$thread_pid"
printf 'tgid=%s\n' "$tgid"
printf 'thread_entry_count=%s\n' "$thread_count"
ps -L -o pid=,lwp=,stat=,comm= -p "$thread_pid"
if [ "$tgid" = "$thread_pid" ] && [ "$thread_count" -ge 4 ]; then printf 'thread_group=one_process_four_tasks_or_more\n'; else printf 'thread_group=unexpected\n'; fi
kill "$thread_pid" 2>/dev/null || true
wait "$thread_pid" 2>/dev/null || true
trap - EXIT
```

## Expected result
tgid equals process_pid, thread_entry_count is at least 4 (the leader plus three workers), ps -L lists those LWP entries, and thread_group=one_process_four_tasks_or_more. Thread IDs and scheduling state vary.

## Systems lens
Linux's schedulable unit is a task, while a thread group supplies shared address space and signal semantics. This distinction matters when CPU, memory, or fault evidence attributes load to one process but many runnable tasks.

## Optional variation
`tgid` should equal `process_pid`, and each `ps -L` LWP value corresponds to a task-directory name under `/proc/PID/task`. The original lower bound of four counts the leader plus three workers.

For a fresh repeat with two workers, make these three matching substitutions in a copy of the Run block before executing it:

```text
range(3)                              -> range(2)
-ge 4                                 -> -ge 3
one_process_four_tasks_or_more        -> one_process_three_tasks_or_more
```

The adjusted result establishes one leader plus at least two workers, then the supplied exact-PID cleanup stops the Python process. When one service PID reports high CPU, use `ps -L` and `/proc/PID/task` to identify the responsible task IDs.
