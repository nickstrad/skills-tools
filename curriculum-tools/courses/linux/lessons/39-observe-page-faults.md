# Compare first-touch and warmed page faults

slug: observe-page-faults
category: virtual-memory
difficulty: intermediate
tags: virtual-memory, procfs, processes
prerequisites: map-process-address-space
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 14
revision: 2

## Overview
Have a helper touch each page of a 16 MiB anonymous mapping once, then touch the same pages again. Reading the process fault counters around each phase reveals the lazy connection between virtual addresses and resident pages.

## Syntax breakdown
### In plain terms

The same 16 MiB anonymous pages are written twice. Process fault counters around each phase show that the first access establishes page backing while the warmed second access needs fewer such faults.

### What you are learning

- Minor and major fault counters are process evidence, not direct latency measurements.
- Coordination files make two internal phases observable without a timing race.

### Piece by piece

- **/proc/PID/stat** fields **10** and **12** (process counters): field 10 is minor faults and field 12 major faults. awk extracts snapshots before and after each phase.
- **READY**, **PHASE1**, **DONE1**, **PHASE2**, and **DONE2** (marker files): the parent only triggers a phase after the helper reports readiness and waits for its completion marker.
- **region[offset]=value** in **range(..., 4096)** (page touch): writes one byte per assumed base page across 16 MiB; it is bounded and repeats the same offsets.
- **awk -v a=... -v b=...** (delta arithmetic): splits snapshots and subtracts the minor counter, so the evidence is a before/after relationship.
- **trap** and **wait** (exact cleanup): terminate and reap only the recorded helper on an early exit.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
READY=$LAB/fault-ready-$UID
PHASE1=$LAB/fault-phase1-$UID
DONE1=$LAB/fault-done1-$UID
PHASE2=$LAB/fault-phase2-$UID
DONE2=$LAB/fault-done2-$UID
rm -f "$READY" "$PHASE1" "$DONE1" "$PHASE2" "$DONE2"
child_pid=
trap 'test -n "$child_pid" && kill "$child_pid" 2>/dev/null || true; test -n "$child_pid" && wait "$child_pid" 2>/dev/null || true; rm -f "$READY" "$PHASE1" "$DONE1" "$PHASE2" "$DONE2"' EXIT
export READY PHASE1 DONE1 PHASE2 DONE2
python3 -c 'import mmap, os, time; region=mmap.mmap(-1, 16*1024*1024); page=4096; open(os.environ["READY"], "w").close();
while not os.path.exists(os.environ["PHASE1"]): time.sleep(0.01)
for offset in range(0, 16*1024*1024, page): region[offset]=1
open(os.environ["DONE1"], "w").close()
while not os.path.exists(os.environ["PHASE2"]): time.sleep(0.01)
for offset in range(0, 16*1024*1024, page): region[offset]=2
open(os.environ["DONE2"], "w").close(); time.sleep(1)' &
child_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  [ -e "$READY" ] && break
  sleep 0.05
done
faults_before=$(awk '{print $10, $12}' "/proc/$child_pid/stat")
printf 'child_pid=%s\n' "$child_pid"
printf 'faults_before=%s\n' "$faults_before"
touch "$PHASE1"
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  [ -e "$DONE1" ] && break
  sleep 0.05
done
faults_after_first=$(awk '{print $10, $12}' "/proc/$child_pid/stat")
touch "$PHASE2"
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  [ -e "$DONE2" ] && break
  sleep 0.05
done
faults_after_second=$(awk '{print $10, $12}' "/proc/$child_pid/stat")
first_minor=$(awk -v a="$faults_before" -v b="$faults_after_first" 'BEGIN{split(a,x," "); split(b,y," "); print y[1]-x[1]}')
second_minor=$(awk -v a="$faults_after_first" -v b="$faults_after_second" 'BEGIN{split(a,x," "); split(b,y," "); print y[1]-x[1]}')
printf 'first_minor_delta=%s\n' "$first_minor"
printf 'second_minor_delta=%s\n' "$second_minor"
if [ -n "$first_minor" ] && [ "$first_minor" -gt 0 ] && [ "$first_minor" -ge "$second_minor" ]; then printf 'first_touch_faults=greater_or_equal\n'; else printf 'first_touch_faults=unexpected\n'; fi
wait "$child_pid"
child_pid=
rm -f "$READY" "$PHASE1" "$DONE1" "$PHASE2" "$DONE2"
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
first_minor_delta is positive, second_minor_delta is zero or much smaller, first_touch_faults=greater_or_equal, and cleanup=done. Major-fault counts and exact minor deltas vary; the first pass must establish residency before the second pass.

## Systems lens
A page fault is the kernel's lazy bridge from a virtual page to a backing page. The first access allocates or maps pages, while later accesses reuse resident translations until reclaim or eviction intervenes.

## Optional variation
Rerun the complete lesson, changing only the second-phase region[offset]=2 to region[offset]=3.
Keep both phase gates, the same page range and the DONE markers before sampling /proc/PID/stat.
Retain the recorded-helper wait and marker cleanup.

The second pass still uses pages established by the first pass. A different byte value does not
itself require first-touch allocation again, so the second minor-fault delta should remain much
smaller. Reclaim can affect actual samples. Attributing a service latency spike to major faults
would additionally need aligned fault deltas, request timing and backing-storage evidence.
