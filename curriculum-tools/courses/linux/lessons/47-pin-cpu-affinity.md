# Constrain a helper to one allowed CPU

slug: pin-cpu-affinity
category: cpu-and-scheduling
difficulty: intermediate
tags: scheduling, processes, procfs
prerequisites: load-average-runnable-work
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Choose the first CPU allowed to this shell, pin a bounded helper there, and inspect its kernel affinity list and current processor. Affinity narrows placement without changing the helper's code or host-wide scheduler policy.

## Syntax breakdown
### In plain terms

The lesson selects an already-allowed CPU and restricts one live helper to it. Its allowed list proves the change; the sampled current CPU is supporting evidence and can disappear when the helper exits.

### What you are learning

- Affinity narrows legal placement for one task.
- Current-CPU sampling is transient; allowed-list state is configuration evidence.

### Piece by piece

- **Cpus_allowed_list**: read the shell’s allowed set then the helper’s changed set by field name.
- **taskset -pc CPU PID**: **-p** targets an existing PID and **-c** uses CPU-list notation; it changes only the recorded helper.
- **ps -o psr= -p PID**: **psr** is a processor sample; blank output means the short helper exited before reading.
- **READY**, **wait**, and **trap**: avoid an affinity race and release only that helper.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
CPU=$(awk -F: '/Cpus_allowed_list/{print $2}' /proc/$$/status | tr -d '[:space:]' | cut -d, -f1 | cut -d- -f1)
R=$LAB/affinity-r-$UID
rm -f "$R"
p=
trap 'test -n "$p" && kill "$p" 2>/dev/null || true; test -n "$p" && wait "$p" 2>/dev/null || true; rm -f "$R"' EXIT
export R
python3 -c 'import os,time; open(os.environ["R"],"w").close(); end=time.monotonic()+0.8
while time.monotonic()<end: pass' &
p=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$R" ] && break
  sleep 0.05
done
taskset -pc "$CPU" "$p" >/dev/null
allowed=$(awk -F: '/Cpus_allowed_list/{print $2}' /proc/$p/status | tr -d '[:space:]')
psr=$(ps -o psr= -p "$p" 2>/dev/null | tr -d ' ')
printf 'chosen_cpu=%s allowed_list=%s observed_cpu=%s\n' "$CPU" "$allowed" "$psr"
if [ "$allowed" = "$CPU" ]; then printf 'affinity_constrained=yes\n'; else printf 'affinity_constrained=no\n'; fi
wait "$p" 2>/dev/null || true
p=
rm -f "$R"
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
allowed_list equals chosen_cpu, affinity_constrained=yes, and cleanup=done. observed_cpu is a sample and may be blank if the short helper exits between reads; it cannot be outside the allowed list while running.

## Systems lens
CPU affinity restricts one task's scheduler placement set. Pinning can improve cache locality or isolate noisy work, but it can also create a smaller bottleneck when the set is too narrow.

## Optional variation
**Predict:** If a helper is allowed on two CPUs, can psr still print only one at a time?

**Inspect and explain:** Explain the difference between the allowed CPU set and one observed processor.

**Vary:** Rerun the complete lesson and insert taskset -pc "$p" immediately after the psr assignment, while the helper is alive. Compare this queried affinity with the sampled processor before cleanup.

**Hint:** Never choose a CPU absent from Cpus_allowed_list.

**Apply:** State what latency and queueing evidence to check before pinning production work.
