# Compare blocking and preemption counters

slug: observe-context-switches
category: cpu-and-scheduling
difficulty: intermediate
tags: scheduling, procfs, processes
prerequisites: cpu-time-vs-wall-time
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Keep a sleeper and a bounded CPU loop alive together, then read each task's voluntary and nonvoluntary context-switch counters. The counters show that blocking and scheduler preemption are observable consequences of different execution paths.

## Syntax breakdown
### In plain terms

A sleeper and a busy helper remain alive long enough to inspect process counters. They demonstrate possible blocking and scheduler handoffs, though one sample cannot assign every switch cause.

### What you are learning

- Voluntary switches commonly accompany blocking.
- Nonvoluntary switches depend on competition and available CPUs.

### Piece by piece

- **sleep 1** and the monotonic Python loop: create one blocking and one runnable task for bounded intervals.
- **/proc/PID/status**: awk selects voluntary_ctxt_switches and nonvoluntary_ctxt_switches by name for each exact PID.
- **kill**, **wait**, and **trap**: target, reap, and protect only the two recorded helpers.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
s=
c=
trap 'test -n "$s" && kill "$s" 2>/dev/null || true; test -n "$c" && kill "$c" 2>/dev/null || true; test -n "$s" && wait "$s" 2>/dev/null || true; test -n "$c" && wait "$c" 2>/dev/null || true' EXIT
sleep 1 &
s=$!
python3 -c 'import time; end=time.monotonic()+0.8
while time.monotonic()<end: pass' &
c=$!
sleep 0.15
sv=$(awk '/^voluntary_ctxt_switches:/{print $2}' /proc/$s/status)
sn=$(awk '/^nonvoluntary_ctxt_switches:/{print $2}' /proc/$s/status)
cv=$(awk '/^voluntary_ctxt_switches:/{print $2}' /proc/$c/status)
cn=$(awk '/^nonvoluntary_ctxt_switches:/{print $2}' /proc/$c/status)
printf 'sleeper_voluntary=%s sleeper_nonvoluntary=%s\n' "$sv" "$sn"
printf 'cpu_voluntary=%s cpu_nonvoluntary=%s\n' "$cv" "$cn"
if [ -n "$sv" ] && [ -n "$sn" ] && [ -n "$cv" ] && [ -n "$cn" ]; then printf 'switch_counters_present=yes\n'; else printf 'switch_counters_present=no\n'; fi
wait "$s" "$c" 2>/dev/null || true
s=
c=
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
All four labeled counters are nonempty, switch_counters_present=yes, and cleanup=done. The sleeper normally accumulates voluntary switches; CPU nonvoluntary counts depend on CPU availability and kernel scheduling.

## Systems lens
A context switch records a change of the running task. Voluntary switches commonly accompany sleep or blocking I/O, while nonvoluntary switches reflect scheduler decisions such as time-slice expiry or competition.

## Optional variation
**Predict:** If the busy helper is replaced with sleep, which comparison becomes less informative?

**Inspect and explain:** Compare each process’s two counters and state what a single snapshot cannot tell you about switch rates.

**Vary:** Rerun the complete lesson, replacing the entire background python3 busy-loop command with sleep 0.8 &. Keep the following PID assignment and both counter observations.

**Hint:** Counters are process-local snapshots and may start nonzero.

**Apply:** State what workload and CPU-placement evidence is needed before acting on a switch counter.
