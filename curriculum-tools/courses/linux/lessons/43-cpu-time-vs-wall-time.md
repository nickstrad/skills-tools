# Distinguish CPU time from elapsed time

slug: cpu-time-vs-wall-time
category: cpu-and-scheduling
difficulty: beginner
tags: scheduling, processes, shell
prerequisites: foreground-and-background
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 10
revision: 2

## Overview
Run a bounded CPU loop and an equal-duration sleep under GNU time. Their wall durations are similar, but only the loop consumes substantial user CPU, separating elapsed waiting from processor execution.

## Syntax breakdown
### In plain terms

Two actions take similar elapsed time: one sleeps and one consumes CPU. Their time records show why latency and processor demand are separate measurements.

### What you are learning

- Wall time includes waiting; user CPU time counts execution.
- Bounded work avoids turning a measurement lesson into host load.

### Piece by piece

- **/usr/bin/time -f** (external timer and format flag): **-f** emits selected user and elapsed fields; the absolute path avoids Bash's time keyword.
- **time.monotonic** (Python clock): bounds the busy loop near 0.8 seconds without a wall-clock adjustment.
- **sleep 0.8** (blocking action): waits for elapsed time without intentional CPU work.
- **awk** (field reader): extracts labelled values and checks the relationship rather than an exact duration.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
A=$LAB/cpu-time-$UID
B=$LAB/sleep-time-$UID
trap 'rm -f "$A" "$B"' EXIT
/usr/bin/time -f 'user=%U wall=%e' -o "$A" python3 -c 'import time; end=time.monotonic()+0.8; n=0
while time.monotonic()<end: n+=1'
/usr/bin/time -f 'user=%U wall=%e' -o "$B" sleep 0.8
cu=$(awk '{print $1}' "$A" | cut -d= -f2)
cw=$(awk '{print $2}' "$A" | cut -d= -f2)
su=$(awk '{print $1}' "$B" | cut -d= -f2)
sw=$(awk '{print $2}' "$B" | cut -d= -f2)
printf 'cpu_user_s=%s cpu_wall_s=%s\n' "$cu" "$cw"
printf 'sleep_user_s=%s sleep_wall_s=%s\n' "$su" "$sw"
if awk -v a="$cu" -v b="$su" 'BEGIN{exit !(a>b+0.05)}'; then printf 'cpu_time_higher_for_loop=yes\n'; else printf 'cpu_time_higher_for_loop=no\n'; fi
if [ -s "$A" ] && [ -s "$B" ]; then printf 'wall_measurements=recorded\n'; else printf 'wall_measurements=missing\n'; fi
rm -f "$A" "$B"
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
cpu_time_higher_for_loop=yes and wall_measurements=recorded. Both wall measurements are near the bounded 0.8-second action, while CPU user time for sleep is near zero; exact values vary.

## Systems lens
Wall time includes runnable, blocked, and sleeping intervals; CPU time counts time actually executing on a processor. Queueing systems, latency budgets, and capacity plans need both views.

## Optional variation
**Predict:** For a 0.2-second sleep, which time field changes materially?

**Inspect and explain:** Run **/usr/bin/time -f 'user=%U wall=%e' sleep 0.2** and explain why a wall delay is not CPU saturation evidence.

**Vary:** Use exactly 0.2 seconds.

**Hint:** Use external **/usr/bin/time**, not the shell keyword.

**Apply:** Name both measurements to collect before scaling a latency-bound service.
