# Make runnable work visible in load average

slug: load-average-runnable-work
category: cpu-and-scheduling
difficulty: intermediate
tags: scheduling, processes, procfs
prerequisites: cpu-time-vs-wall-time
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 14
revision: 2

## Overview
Start at most four short CPU workers, release them together, and sample /proc/loadavg while they are busy. The instantaneous runnable count is evidence of scheduler demand; smoothed averages are intentionally not treated as immediate counters.

## Syntax breakdown
### In plain terms

Several short workers wait at one gate and become runnable together. Loadavg field four gives an instantaneous runnable/total count; smoothed load and other host work are not attributed to these workers.

### What you are learning

- Runnable count is demand evidence, not CPU utilization.
- Marker files make a bounded concurrent release observable.

### Piece by piece

- **nproc** and the cap at 4: choose no more than four workers regardless of host size.
- **READY directory** and **RUN file**: each helper writes a marker then waits for RUN, avoiding a startup sample.
- **/proc/loadavg field 4**: awk takes the runnable side before the slash; it is host-wide snapshot evidence.
- **time.monotonic()+0.9** and **wait**: bound every busy loop and reap every recorded PID.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
RUN=$LAB/load-run-$UID
RD=$LAB/load-ready-$UID
rm -f "$RUN"
rm -rf "$RD"
mkdir -p "$RD"
pids=
cleanup_load() {
  for p in $pids; do kill "$p" 2>/dev/null || true; done
  for p in $pids; do wait "$p" 2>/dev/null || true; done
  rm -f "$RUN"
  rm -rf "$RD"
}
trap cleanup_load EXIT
workers=$(nproc)
if [ "$workers" -gt 4 ]; then workers=4; fi
export RUN RD
for w in $(seq 1 "$workers"); do
  WORKER=$w
  export WORKER
  python3 -c 'import os,time; open(os.path.join(os.environ["RD"],"ready-"+os.environ["WORKER"]),"w").close();
while not os.path.exists(os.environ["RUN"]): time.sleep(0.01)
end=time.monotonic()+0.9
while time.monotonic()<end: pass' &
  pids="$pids $!"
done
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  ready=$(find "$RD" -type f -name 'ready-*' 2>/dev/null | wc -l)
  [ "$ready" -eq "$workers" ] && break
  sleep 0.05
done
before=$(awk '{print $4}' /proc/loadavg | cut -d/ -f1)
touch "$RUN"
sleep 0.1
during=$(awk '{print $4}' /proc/loadavg | cut -d/ -f1)
printf 'workers_started=%s runnable_before=%s runnable_during=%s\n' "$workers" "$before" "$during"
if [ "$workers" -ge 1 ] && [ "$during" -ge 1 ]; then printf 'runnable_work=observed\n'; else printf 'runnable_work=unexpected\n'; fi
for p in $pids; do wait "$p" 2>/dev/null || true; done
pids=
printf 'cleanup=done\n'
```

## Expected result
workers_started is between 1 and 4, runnable_during is at least 1, runnable_work=observed, and cleanup=done. runnable_before and load averages vary with other host activity.

## Systems lens
Load average tracks runnable and uninterruptible demand over time, not a direct CPU-percentage reading. A small workload can increase queueing pressure even when aggregate utilization is hard to interpret across many CPUs.

## Optional variation
**Predict:** With one worker instead of four, must runnable_during equal one?

**Inspect and explain:** Compare the runnable count with the worker count and account for unrelated host work.

**Vary:** Rerun the complete lesson, replacing if [ "$workers" -gt 4 ]; then workers=4; fi with if [ "$workers" -gt 1 ]; then workers=1; fi. Keep readiness gates and exact-PID cleanup.

**Hint:** The slash-separated field is runnable over total tasks.

**Apply:** Explain why load alone cannot identify a CPU-incident process.
