# Observe reclaim feedback inside a bounded cgroup

slug: reclaim-under-pressure
category: virtual-memory
difficulty: advanced
tags: virtual-memory, cgroups, resource-limits
prerequisites: compare-rss-and-vsz
safety: privileged
run-in: shell
sessions: 1
min-version: 5.1
minutes: 18
revision: 3

## Overview
Create one uniquely named child cgroup with a 96 MiB memory ceiling, move a helper into it, and grow only 64 MiB of anonymous memory. Reading memory.current, memory.events, and vmstat makes accounting and reclaim feedback visible while the host remains outside the budget.

## Syntax breakdown
### In plain terms

This puts only one 64 MiB helper in a fresh child cgroup with a 96 MiB maximum and a 48 MiB high threshold. It reads scoped usage and event counters to show throttling/reclaim feedback while recording an unavailable branch when delegation is absent.

### What you are learning

- memory.high is a pressure threshold; memory.max is a hard cgroup ceiling.
- Cgroup counters are scoped evidence, while vmstat remains host-wide context.

### Piece by piece

- **findmnt -t cgroup2 -o TARGET** (controller locator): selects the cgroup v2 mount; failure or an unwritable root is reported as unavailable before any group exists.
- **as_root** and **cg_write** (privileged helpers): sudo **-n** avoids prompts; cg_write sends one exact value through root-owned **tee**. The helper never broadens the target path.
- **memory.max**, **memory.high**, **memory.swap.max**, and **cgroup.procs** (cgroup files): set hard, high, and swap boundaries then move only child_pid. The values are bytes.
- **memory.current**, **memory.events**, and **vmstat 1 2** (evidence): current is scoped usage, events supplies high and oom counts, and the final vmstat sample is host context only.
- **cgroup.kill**, **rmdir**, and the trap (cleanup): target only the created child group after the recorded helper is reaped.

## Caution
Run only on the disposable VM. The trap removes this exact child cgroup and kills only the helper PID; never run this lesson after manually placing another process in the named cgroup.

## Run
```sh
(
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo -n "$@"; fi; }
cg_write() { printf '%s' "$2" | as_root tee "$1" >/dev/null; }
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
CG=
READY=$LAB/reclaim-ready-$UID
GO=$LAB/reclaim-go-$UID
rm -f "$READY" "$GO"
child_pid=
cleanup_reclaim() {
  test -n "$child_pid" && kill "$child_pid" 2>/dev/null || true
  test -n "$child_pid" && wait "$child_pid" 2>/dev/null || true
  test -f "$CG/cgroup.kill" && cg_write "$CG/cgroup.kill" 1 2>/dev/null || true
  test -d "$CG" && as_root rmdir "$CG" 2>/dev/null || true
  rm -f "$READY" "$GO"
}
trap cleanup_reclaim EXIT
mountpoint=$(findmnt -t cgroup2 -n -o TARGET 2>/dev/null)
if [ -z "$mountpoint" ] || ! as_root test -w "$mountpoint"; then printf 'cgroup_setup=unavailable\n'; exit 0; fi
CG=$mountpoint/linux-tutor-$UID-$BASHPID-$RANDOM
if ! as_root mkdir "$CG" 2>/dev/null; then printf 'cgroup_setup=unavailable\n'; exit 0; fi
cg_write "$CG/memory.max" 100663296
cg_write "$CG/memory.high" 50331648
cg_write "$CG/memory.swap.max" 0 2>/dev/null || true
high_before=$(awk '$1=="high"{print $2}' "$CG/memory.events")
export READY GO
python3 -c 'import mmap, os, time; open(os.environ["READY"], "w").close();
while not os.path.exists(os.environ["GO"]): time.sleep(0.01)
region=mmap.mmap(-1, 64*1024*1024); view=memoryview(region); [view.__setitem__(offset, 1) for offset in range(0, 64*1024*1024, 4096)]; time.sleep(3)' &
child_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  [ -e "$READY" ] && break
  sleep 0.05
done
if ! cg_write "$CG/cgroup.procs" "$child_pid" 2>/dev/null; then printf 'cgroup_move=unavailable\n'; exit 0; fi
touch "$GO"
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40; do
  current=$(cat "$CG/memory.current")
  [ "$current" -gt 52428800 ] && break
  sleep 0.05
done
current=$(cat "$CG/memory.current")
max=$(cat "$CG/memory.max")
events=$(awk '$1=="oom"{print $2}' "$CG/memory.events")
high_after=$(awk '$1=="high"{print $2}' "$CG/memory.events")
vmstat_line=$(vmstat 1 2 | tail -1)
printf 'cgroup=%s\n' "$CG"
printf 'memory_current=%s\n' "$current"
printf 'memory_max=%s\n' "$max"
printf 'oom_events=%s\n' "$events"
printf 'memory_high_before=%s memory_high_after=%s\n' "$high_before" "$high_after"
printf 'vmstat_sample=%s\n' "$vmstat_line"
if [ "$current" -lt "$max" ] && [ "$events" -eq 0 ] && [ "$high_after" -gt "$high_before" ]; then printf 'bounded_reclaim_observation=high-event-within-max\n'; else printf 'bounded_reclaim_observation=unexpected\n'; fi
kill "$child_pid" 2>/dev/null || true
wait "$child_pid" 2>/dev/null || true
child_pid=
cleanup_reclaim
trap - EXIT
printf 'cleanup=cgroup-removed\n'
)
```

## Expected result
A dedicated cgroup is created when the VM permits it; memory_max=100663296, memory_current is below that value, memory_high_after is greater than memory_high_before, oom_events=0, bounded_reclaim_observation=high-event-within-max, a vmstat sample is printed, and cleanup=cgroup-removed. If cgroup delegation is unavailable the bounded code prints cgroup_setup=unavailable and changes nothing.

## Systems lens
Memory pressure is feedback from a hierarchy: usage, reclaim, and event counters are scoped to a resource domain. Cgroups let an operator distinguish one workload's budget from the host's unrelated memory consumers.

## Optional variation
**Predict:** If memory.high is lowered while memory.max and allocation stay fixed, which event counter can record stronger pressure feedback?

**Inspect and explain:** Use the high event delta and memory.max to distinguish pressure feedback from OOM containment.

**Vary:** Rerun the complete disposable-cgroup lesson, changing only the memory.high write from 50331648 to 41943040 (48 to 40 MiB). Keep the 64 MiB allocation and 96 MiB maximum. Compare high events without requiring a fixed count.

**Hint:** Treat cgroup_setup=unavailable as an untested mechanism, not success.

**Apply:** Choose a high threshold and hard max for a service, naming the scoped event and useful service signal you would review.
