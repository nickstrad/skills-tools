# Compare workers with different nice values

slug: change-scheduling-priority
category: cpu-and-scheduling
difficulty: intermediate
tags: scheduling, processes
prerequisites: load-average-runnable-work
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 15
revision: 3

## Overview
Run two equal CPU workers on one allowed CPU, one with nice increment 0 and one with increment 10 relative to this shell. Verify scheduler-visible priorities and compare work counts as a noisy demonstration of weighted fair sharing, not a fixed ratio.

## Syntax breakdown
### In plain terms

Two equal busy workers share one allowed CPU but receive different nice increments. The assertion is their difference from the inherited shell nice value; work counts are noisy context, never a promised ratio.

### What you are learning

- **nice -n** adds an increment to inherited niceness; it is not an absolute request.
- Affinity creates bounded contention so relative weight is observable.

### Piece by piece

- **Cpus_allowed_list**: select the first CPU the shell may use, never a guessed CPU.
- **taskset -c CPU**: **-c** accepts a CPU list and confines both workers to one allowed CPU.
- **nice -n 0** and **nice -n 10**: **-n** supplies relative increments from the observed shell baseline.
- **ps -o ni= -p PID**: **-o** selects niceness, **=** removes a heading, and **-p** selects the exact worker; the 10-point delta is the evidence.
- **time.monotonic**, result files, **wait**, and **trap**: bound loops, collect counts, and clean only recorded workers.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
CPU=$(awk -F: '/Cpus_allowed_list/{print $2}' /proc/$$/status | tr -d '[:space:]' | cut -d, -f1 | cut -d- -f1)
FAST=$LAB/nice-fast-$UID
SLOW=$LAB/nice-slow-$UID
R1=$LAB/nice-r1-$UID
R2=$LAB/nice-r2-$UID
rm -f "$FAST" "$SLOW" "$R1" "$R2"
f=
s=
trap 'test -n "$f" && kill "$f" 2>/dev/null || true; test -n "$s" && kill "$s" 2>/dev/null || true; test -n "$f" && wait "$f" 2>/dev/null || true; test -n "$s" && wait "$s" 2>/dev/null || true; rm -f "$FAST" "$SLOW" "$R1" "$R2"' EXIT
export FAST SLOW R1 R2
taskset -c "$CPU" nice -n 0 python3 -c 'import os,time; open(os.environ["R1"],"w").close(); end=time.monotonic()+0.9; n=0
while time.monotonic()<end: n+=1
open(os.environ["FAST"],"w").write(str(n))' &
f=$!
taskset -c "$CPU" nice -n 10 python3 -c 'import os,time; open(os.environ["R2"],"w").close(); end=time.monotonic()+0.9; n=0
while time.monotonic()<end: n+=1
open(os.environ["SLOW"],"w").write(str(n))' &
s=$!
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  [ -e "$R1" ] && [ -e "$R2" ] && break
  sleep 0.05
done
n0=$(ps -o ni= -p "$f" 2>/dev/null | tr -d ' ')
n10=$(ps -o ni= -p "$s" 2>/dev/null | tr -d ' ')
shell_nice=$(ps -o ni= -p $$ | tr -d ' ')
wait "$f" "$s" 2>/dev/null || true
f=
s=
printf 'cpu=%s shell_nice=%s nice0_observed=%s nice10_observed=%s\n' "$CPU" "$shell_nice" "$n0" "$n10"
printf 'nice0_work=%s nice10_work=%s\n' "$(cat "$FAST" 2>/dev/null || printf 0)" "$(cat "$SLOW" 2>/dev/null || printf 0)"
if [ "$n0" = "$shell_nice" ] && [ $((n10 - n0)) -eq 10 ]; then printf 'priority_difference=10\n'; else printf 'priority_difference=unexpected\n'; fi
printf 'both_workers_completed=yes\n'
rm -f "$FAST" "$SLOW" "$R1" "$R2"
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
nice0_observed equals shell_nice (0 in a normal interactive shell), nice10_observed is exactly 10 higher, priority_difference=10, both_workers_completed=yes, and cleanup=done. Work counts are positive but their ratio varies with host scheduling.

## Systems lens
Niceness changes a task's weight in fair scheduling; it does not reserve a CPU or guarantee a ratio. This distinction matters when translating service priority into latency and throughput expectations.

## Optional variation
Run **ps -o ni= -p $$; nice -n 1 bash -c 'ps -o ni= -p $$'**, using increment one only.
The first value is the parent baseline; the second is one higher unless the allowed niceness
range caps it. The child exits after reporting its value, leaving the parent unchanged.

Read nice -n as a relative increment. For example, a baseline5 plus increment10 requests15.
Changing scheduling weight alone does not reserve capacity or guarantee interactive latency
against batch work.
