# Triage bounded anonymous memory growth

slug: triage-memory-growth
category: troubleshooting-capstones
difficulty: advanced
tags: troubleshooting, virtual-memory, resource-limits
prerequisites: compare-rss-and-vsz, inspect-cgroup-v2
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 17
revision: 2

## Overview
A helper's memory footprint changes while host memory counters are noisy. Compare its process-specific readings across two controlled allocation phases to attribute the growth. Use the result to separate a local allocation trend from a claim about host pressure.

## Syntax breakdown
### In plain terms

Memory totals describe different owners and boundaries. A controlled before/after sample tells us whether this helper grew, while host available memory and a shared cgroup counter provide context rather than proof of causation.

### What you are learning

- Resident set size (RSS) describes pages resident for this process; virtual size includes address space that need not be resident.
- A readiness gate establishes that the first measurement precedes the additional allocation.
- A cgroup charge includes other processes and kernel memory in that group; it is not interchangeable with this process's RSS.

### Piece by piece

- **Lab paths and shell control.** LINUX_LAB selects the directory; the HOME fallback is used only when it is empty. **mkdir -p** creates it idempotently. UID and the shell PID ($$) distinguish this run's names. Quoted expansions keep paths intact. **printf** prints labeled values; **$(...)** captures output, and **$((...))** performs integer arithmetic.
- **Ownership and cleanup.** **&** starts a child and **$!** records its exact PID. **trap ... EXIT** installs cleanup before the child starts. **kill** requests termination and **wait** reaps that child; **|| true** tolerates an already exited child during cleanup. **rm -f** removes only named lab files, and **trap - EXIT** clears the handler after explicit cleanup. Readiness loops use **test/[ ]**, **break**, and **sleep** to wait for observed state within a fixed bound; an assertion failure exits the experiment's subshell, not your terminal.
- **READY, GO and DONE** are empty coordination files with different meanings: initial allocation complete, permission to grow, and growth complete. **rm -f** clears stale gates. **seq 1 100** bounds each readiness loop, **test -e** checks existence, and **touch** releases the helper only after the baseline sample.
- **python3 -u -c** runs inline code with unbuffered output. **bytearray** creates zero-initialized buffers; the offset loop writes one byte per 4096-byte step to make the allocation resident. Retaining them in **buf** keeps 16 MiB and then 64 MiB live. The monotonic gate deadline and final twenty-second sleep bound the helper even if the observer fails.
- **awk '/VmRSS:/{print $2}'** reads the RSS number in KiB from the exact PID's status; **VmSize** reads its virtual size. The integer subtraction compares the same field before and after the controlled growth. **test -gt** requires an increase without assuming a machine-specific exact RSS.
- **pmap -x** prints extended mapping accounting; **tail -n 2** retains the totals and final mapping line. RSS in the total provides another process view. **free -b** prints host memory in bytes; the **available** column is an estimate of memory usable without swapping.
- **findmnt -n -t cgroup2 -o TARGET** selects the cgroup v2 mount without headings; **head -n 1** chooses its first row. **awk -F:** extracts the helper's unified membership path from procfs. **test -r** checks the resolved memory.current before reading bytes. A namespace-relative or inaccessible mount may make this unavailable; that does not invalidate the process samples.
- The post-wait **test ! -d /proc/PID** proves the owner exited. Released process ownership is observed; a fixed drop in host usage is not promised.

## Run
```sh
(
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
BASE=$LAB/memory-$UID-$$
READY=$BASE.ready
GO=$BASE.go
DONE=$BASE.done
memory_pid=
trap 'test -n "$memory_pid" && kill "$memory_pid" 2>/dev/null || true; test -n "$memory_pid" && wait "$memory_pid" 2>/dev/null || true; rm -f "$READY" "$GO" "$DONE"' EXIT
rm -f "$READY" "$GO" "$DONE"
READY="$READY" GO="$GO" DONE="$DONE" python3 -u -c 'import os,time
buf=[bytearray(16*1024*1024)]
for offset in range(0,len(buf[0]),4096): buf[0][offset]=1
open(os.environ["READY"],"w").close()
deadline=time.monotonic()+10
while not os.path.exists(os.environ["GO"]):
 if time.monotonic()>deadline: raise SystemExit("growth gate timed out")
 time.sleep(.02)
for step in range(3):
 b=bytearray(16*1024*1024)
 for offset in range(0,len(b),4096): b[offset]=1
 buf.append(b)
open(os.environ["DONE"],"w").close()
time.sleep(20)' &
memory_pid=$!
for attempt in $(seq 1 100); do [ -e "$READY" ] && break; sleep .02; done
[ -e "$READY" ] || exit 1
before=$(awk '/VmRSS:/{print $2}' "/proc/$memory_pid/status")
touch "$GO"
for attempt in $(seq 1 100); do [ -e "$DONE" ] && break; sleep .02; done
[ -e "$DONE" ] || exit 1
after=$(awk '/VmRSS:/{print $2}' "/proc/$memory_pid/status")
vsz=$(awk '/VmSize:/{print $2}' "/proc/$memory_pid/status")
printf 'memory_pid=%s\nrss_before_kib=%s\nrss_after_kib=%s\nrss_growth_kib=%s\nvsz_after_kib=%s\n' "$memory_pid" "$before" "$after" "$((after-before))" "$vsz"
pmap -x "$memory_pid" | tail -n 2
free -b
cgroup_mount=$(findmnt -n -t cgroup2 -o TARGET | head -n 1)
cgroup_rel=$(awk -F: '$1=="0"{print $3}' "/proc/$memory_pid/cgroup")
cgroup_current=$cgroup_mount$cgroup_rel/memory.current
if [ -r "$cgroup_current" ]; then printf 'cgroup_memory_current=%s\n' "$(cat "$cgroup_current")"; else printf 'cgroup_memory_current=unavailable\n'; fi
[ "$after" -gt "$before" ] || exit 1
printf 'memory_growth_correlated=yes\n'
kill "$memory_pid"
wait "$memory_pid" 2>/dev/null || true
[ ! -d "/proc/$memory_pid" ] || exit 1
printf 'memory_owner_after_stop=absent\n'
memory_pid=
rm -f "$READY" "$GO" "$DONE"
trap - EXIT
printf 'cleanup=done\n'
)
```

## Expected result
The helper holds 16 MiB before the gate and 64 MiB after it. rss_after_kib exceeds rss_before_kib, rss_growth_kib is positive, and memory_growth_correlated=yes. A typical delta is near 48 MiB, but RSS, pmap, host available memory and cgroup charges vary. cgroup_memory_current=unavailable explicitly marks a view limitation. memory_owner_after_stop=absent verifies the exact helper exited.

## Systems lens
Attribution requires a resource owner, a controlled interval and an accounting boundary. Correlating process growth with group and host totals is useful; equating those totals loses the causal information.

## Optional variation
Replace **for step in range(3)** with **for step in range(1)** and rerun. Keep the initial16MiB
allocation, READY/GO/DONE coordination and cleanup. Before cleanup,
**awk '/VmRSS:|VmSize:/{print}' "/proc/$memory_pid/status"** prints both process fields.

The helper now holds32MiB at the end. Compare its RSS delta with the original48MiB growth;
exact accounting varies. The baseline before GO and sample after DONE tie the increase to this
controlled allocation, but one bounded interval does not establish an unbounded leak. A shared
cgroup total cannot separate this worker from a cache process without per-owner observations.
