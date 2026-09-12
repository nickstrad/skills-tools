# Trigger a bounded CPU-time limit

slug: limit-cpu-time
category: resource-boundaries
difficulty: intermediate
tags: resource-limits, scheduling, signals
prerequisites: limit-open-files
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 14
revision: 2

## Overview
Give one CPU-bound child a one-second CPU limit and watch it with a five-second wall-time watchdog. Capturing its exact wait status demonstrates that accounted processor time can trigger asynchronous policy before wall time expires.

## Syntax breakdown
### In plain terms

The child in this experiment consumes CPU in a tight loop but has a one-second CPU-time budget. CPU time counts scheduled execution, whereas the watchdog counts elapsed waiting time, so the two measurements answer different operational questions.

### What you are learning

- RLIMIT_CPU applies to CPU seconds consumed by one process, not to its wall-clock lifetime.
- A wait status records normal exit or signal-derived termination for an exact child.
- A watchdog must bound the experiment without becoming evidence that the resource limit fired.

### Piece by piece

- **bash -c 'ulimit -t 1; while :; do :; done'** (a bounded-policy child)
  - What it is: bash **-c** executes the quoted program; **-t** selects CPU seconds; the colon is a shell builtin that makes the loop CPU-bound.
  - What it does here: it creates one exact child whose limit is one CPU second.
  - What it gives us: only that child can receive the limit's signal.
- **&** and **$!** (background control)
  - What they are: ampersand backgrounds the child and $! records its PID.
  - What they do here: they allow the parent to observe the child without guessing its identity.
  - What they give us: the trap and wait target only p.
- **kill -0 PID** (a liveness probe)
  - What it is: signal zero performs permission and existence checking without delivering a signal.
  - What it does here: it drives a 50-iteration, 0.1-second watchdog loop.
  - What it gives us: watchdog_timeout=yes means the fallback kill occurred, so it cannot prove CPU-limit enforcement.
- **wait PID** and **status** (completion evidence)
  - What they are: wait joins an exact child and returns its shell status; an if captures nonzero safely.
  - What they do here: they record the termination after the process disappears.
  - What they give us: cpu_limit_triggered=yes requires nonzero status and no watchdog fallback, while the numeric status can vary.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
p=
timed_out=no
trap 'test -n "$p" && kill "$p" 2>/dev/null || true; test -n "$p" && wait "$p" 2>/dev/null || true' EXIT
bash -c 'ulimit -t 1; while :; do :; done' &
p=$!
ticks=0
while kill -0 "$p" 2>/dev/null; do
  sleep 0.1
  ticks=$((ticks + 1))
  if [ "$ticks" -ge 50 ]; then
    kill "$p" 2>/dev/null || true
    timed_out=yes
    break
  fi
done
if wait "$p"; then status=0; else status=$?; fi
p=
printf 'cpu_limit_status=%s watchdog_timeout=%s\n' "$status" "$timed_out"
if [ "$status" -ne 0 ] && [ "$timed_out" = no ]; then printf 'cpu_limit_triggered=yes\n'; else printf 'cpu_limit_triggered=no\n'; fi
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
cpu_limit_triggered=yes and cleanup=done within the five-second wall bound. cpu_limit_status is commonly 137 when an unhandled hard limit reaches SIGKILL or 152 for SIGXCPU; watchdog_timeout should be no.

## Systems lens
CPU-time limits use scheduler accounting rather than elapsed wall time. They provide a per-process failure boundary for runaway computation, with signal handling and supervisor policy determining the final status.

## Optional variation
Copy the full lesson into a private run, changing the child setting **ulimit -t 1** to
**ulimit -t 2** and the watchdog bound from50 to60 ticks. Keep the exact-PID wait and cleanup.
The CPU budget is now2 seconds and the watchdog's nominal elapsed bound is6 seconds.

Check watchdog_timeout=no before treating the nonzero child status as CPU-limit evidence; a
watchdog fallback cannot establish that mechanism. On a busy host elapsed time includes time
the child was not scheduled. A low-CPU, high-latency request therefore also needs scheduler
waiting and I/O evidence beyond RLIMIT_CPU.
