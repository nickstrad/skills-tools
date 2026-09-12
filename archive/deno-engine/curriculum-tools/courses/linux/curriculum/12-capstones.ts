import { code, type Module } from "../../../src/types.ts";

export const CAPSTONES: Module = {
  category: "troubleshooting-capstones",
  title: "Correlate kernel evidence during bounded incidents",
  lessons: [
    {
      slug: "triage-cpu-saturation",
      title: "Triage bounded CPU saturation",
      difficulty: "advanced",
      tags: ["troubleshooting", "scheduling", "processes"],
      prerequisites: ["change-scheduling-priority", "pin-cpu-affinity"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 16,
      revision: 2,
      overview:
        code`Two workers compete for one allowed CPU while host load may include unrelated activity. Decide which measurements establish local contention and which would be needed before claiming the whole machine needs more capacity. The supplied experiment lets you correlate placement, execution and exact process cleanup.`,
      syntaxBreakdown: code`### In plain terms

A slow task can compete for its allowed CPU even when the machine has idle CPUs elsewhere. Compare evidence tied to the two worker PIDs with host-wide measurements before choosing an intervention.

### What you are learning

- CPU affinity is a set of processors on which a task may run; two runnable tasks restricted to one CPU must share it.
- CPU ticks account actual execution. A positive interval delta is stronger evidence of work than a nonempty ps row.
- Host load includes other tasks and cannot by itself attribute this incident to these workers.

### Piece by piece

- **Lab paths and shell control.** LINUX_LAB selects the directory; the HOME fallback is used only when it is empty. **mkdir -p** creates it idempotently. UID and the shell PID ($$) distinguish this run's names. Quoted expansions keep paths intact. **printf** prints labeled values; **$(...)** captures output, and **$((...))** performs integer arithmetic.
- **Ownership and cleanup.** **&** starts a child and **$!** records its exact PID. **trap ... EXIT** installs cleanup before the child starts. **kill** requests termination and **wait** reaps that child; **|| true** tolerates an already exited child during cleanup. **rm -f** removes only named lab files, and **trap - EXIT** clears the handler after explicit cleanup. Readiness loops use **test/[ ]**, **break**, and **sleep** to wait for observed state within a fixed bound; an assertion failure exits the experiment's subshell, not your terminal.
- **: > "$PIDS"** creates or empties the run-specific PID record; the colon is Bash’s successful no-op.
- **python3 -c** runs the supplied helper. **os.sched_getaffinity(0)** reads this process's permitted CPUs; **min** chooses a valid CPU even in a restricted container. **taskset -c "$cpu"** restricts each child to that CPU. The Python worker uses **time.monotonic** for a six-second wall-time bound.
- **python3 - "$PIDS"** reads a program from the quoted PROBE here-document and the PID file from its first argument. **rsplit(')',1)** skips the parenthesized process name safely. The following fields 11 and 12 are user and system ticks; the helper subtracts two samples one second apart and asserts each worker executed. It prints affinity again to verify placement.
- **ps -o pid=,stat=,psr=,pcpu=,time=** selects PID, state, last processor, lifetime CPU percentage and accumulated CPU time; equals signs suppress headings. **-p** selects only our comma-separated PIDs. **tr** converts newlines to commas and **sed 's/,$//'** removes the final comma.
- **taskset -pc PID** in the hint queries (**-p**) an existing PID and formats its affinity as a CPU list (**-c**); **head -n 1** selects the first PID record.
- **cat /proc/loadavg** prints smoothed load and the instantaneous runnable/total count. **vmstat 1 2** takes two samples one second apart: the first includes averages since boot, while the second interval's **r**, **us**, **sy**, and **id** describe runnable tasks and host CPU use. Neither view isolates our CPU.
- **test -d /proc/PID** checks whether a recorded process still has a procfs directory after wait. The remaining count must be zero; this proves worker cleanup, not restored performance of an unrelated application.`,
      code: code`
(
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
PIDS=$LAB/cpu-pids-$UID-$$
worker_pids=
trap 'for p in $worker_pids; do kill "$p" 2>/dev/null || true; wait "$p" 2>/dev/null || true; done; rm -f "$PIDS"' EXIT
: > "$PIDS"
cpu=$(python3 -c 'import os; print(min(os.sched_getaffinity(0)))')
for n in 1 2; do
  taskset -c "$cpu" python3 -c 'import time
end=time.monotonic()+6
while time.monotonic()<end: pass' &
  worker_pids="$worker_pids $!"
  printf '%s\n' "$!" >> "$PIDS"
done
printf 'workers_started=2\nselected_cpu=%s\n' "$cpu"
python3 - "$PIDS" <<'PROBE'
import os,sys,time
pids=[int(p) for p in open(sys.argv[1])]
def ticks(pid):
    fields=open('/proc/%d/stat'%pid).read().rsplit(')',1)[1].split()
    return int(fields[11])+int(fields[12])
before=[ticks(p) for p in pids]
time.sleep(1)
after=[ticks(p) for p in pids]
for p,a,b in zip(pids,before,after):
    print('worker_pid=%d cpu_ticks_delta=%d allowed_cpus=%s'%(p,b-a,sorted(os.sched_getaffinity(p))))
assert all(b>a for a,b in zip(before,after)), 'workers did not accumulate CPU time'
print('local_cpu_demand=observed')
PROBE
[ "$?" -eq 0 ] || exit 1
ps -o pid=,stat=,psr=,pcpu=,time= -p $(tr '\n' ',' < "$PIDS" | sed 's/,$//')
printf 'host_loadavg=%s\n' "$(cat /proc/loadavg)"
vmstat 1 2
for p in $worker_pids; do kill "$p" 2>/dev/null || true; done
for p in $worker_pids; do wait "$p" 2>/dev/null || true; done
remaining=0
for p in $worker_pids; do [ ! -d "/proc/$p" ] || remaining=$((remaining+1)); done
printf 'workers_after_stop=%s\n' "$remaining"
[ "$remaining" -eq 0 ] || exit 1
worker_pids=
rm -f "$PIDS"
trap - EXIT
printf 'cleanup=done\n'
)
`,
      challenge:
        code`**Predict:** If both tasks are runnable on one CPU, can either receive a full CPU-second during the same one-second interval? Explain what unrelated host load would change.

**Inspect and explain:** Identify the two PID-specific observations that support local competition. Explain why a high host load value alone does not identify an owner.

**Vary:** Rerun with **for n in 1** instead of **for n in 1 2** and change the descriptive workers_started label to 1. Keep the selected CPU and six-second bound. Compare the worker's tick delta; do not require a fixed ratio.

**Hint:** The runnable command **taskset -pc "$(head -n 1 "$PIDS")"** inspects the first recorded live PID. Use it before the stop loop; the tick probe is the worked measurement.

**Apply:** A service is pinned to one busy CPU while other allowed CPUs are idle. Defend either relaxing affinity or adding capacity, naming a request-latency measurement you would collect before and after.`,
      expectedResult:
        code`workers_started=2 and one selected_cpu are printed. Each worker reports that same singleton allowed_cpus set and a positive cpu_ticks_delta; local_cpu_demand=observed follows those assertions. The tasks share one CPU, but their tick ratio, sampled states, host load and vmstat vary. workers_after_stop=0 proves both workers exited. This bounded run does not establish sustained host-wide saturation.`,
      systemsLens:
        code`Capacity is constrained by the resources a workload may actually use. Join ownership, placement and interval execution before attributing a symptom to global load or choosing a capacity change.`,
    },
    {
      slug: "triage-memory-growth",
      title: "Triage bounded anonymous memory growth",
      difficulty: "advanced",
      tags: ["troubleshooting", "virtual-memory", "resource-limits"],
      prerequisites: ["compare-rss-and-vsz", "inspect-cgroup-v2"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 17,
      revision: 2,
      overview:
        code`A helper's memory footprint changes while host memory counters are noisy. Choose evidence that can attribute growth to this process, then compare two controlled allocation phases. Use the result to separate a local allocation trend from a claim about host pressure.`,
      syntaxBreakdown: code`### In plain terms

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
- The post-wait **test ! -d /proc/PID** proves the owner exited. Released process ownership is observed; a fixed drop in host usage is not promised.`,
      code: code`
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
`,
      challenge:
        code`**Predict:** Which of RSS, virtual size, host available memory and cgroup usage can establish ownership of this growth by itself?

**Inspect and explain:** Explain why the GO gate matters to attribution and why this one growth interval does not establish an unbounded memory leak.

**Vary:** Replace **for step in range(3)** with **for step in range(1)** and rerun. The helper now holds 32 MiB at the end; compare the RSS delta rather than the host total.

**Hint:** Before cleanup, **awk '/VmRSS:|VmSize:/{print}' "/proc/$memory_pid/status"** prints both process fields. The supplied before/after probe is the worked solution.

**Apply:** A worker shares a cgroup with a cache process. Choose measurements needed before lowering the worker's budget, and state how you would distinguish retained application memory from a bounded cache.`,
      expectedResult:
        code`The helper holds 16 MiB before the gate and 64 MiB after it. rss_after_kib exceeds rss_before_kib, rss_growth_kib is positive, and memory_growth_correlated=yes. A typical delta is near 48 MiB, but RSS, pmap, host available memory and cgroup charges vary. cgroup_memory_current=unavailable explicitly marks a view limitation. memory_owner_after_stop=absent verifies the exact helper exited.`,
      systemsLens:
        code`Attribution requires a resource owner, a controlled interval and an accounting boundary. Correlating process growth with group and host totals is useful; equating those totals loses the causal information.`,
    },
    {
      slug: "triage-fd-leak",
      title: "Triage a bounded file-descriptor leak",
      difficulty: "advanced",
      tags: ["troubleshooting", "file-descriptors", "procfs"],
      prerequisites: ["inherited-open-files", "limit-open-files"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 15,
      revision: 2,
      overview:
        code`A worker keeps more file handles after another batch of work. Measure the change and identify which paths remain open before choosing a limit increase or a lifecycle fix. The bounded reproduction retains at most 48 lab files.`,
      syntaxBreakdown: code`### In plain terms

A large descriptor count might be a legitimate working set. A second work batch that leaves another known set open provides stronger evidence of retention. Join the count to paths to identify the owner and resource kind.

### What you are learning

- A descriptor is a process-local reference to an open kernel object; retaining a Python file object keeps its descriptor live.
- A before/after delta separates this batch's retained handles from standard streams and inherited descriptors.
- lsof lists mappings and other references as well as numbered descriptors, so its total row count is not a descriptor count.

### Piece by piece

- **Lab paths and shell control.** LINUX_LAB selects the directory; the HOME fallback is used only when it is empty. **mkdir -p** creates it idempotently. UID and the shell PID ($$) distinguish this run's names. Quoted expansions keep paths intact. **printf** prints labeled values; **$(...)** captures output, and **$((...))** performs integer arithmetic.
- **Ownership and cleanup.** **&** starts a child and **$!** records its exact PID. **trap ... EXIT** installs cleanup before the child starts. **kill** requests termination and **wait** reaps that child; **|| true** tolerates an already exited child during cleanup. **rm -f** removes only named lab files, and **trap - EXIT** clears the handler after explicit cleanup. Readiness loops use **test/[ ]**, **break**, and **sleep** to wait for observed state within a fixed bound; an assertion failure exits the experiment's subshell, not your terminal.
- **PREFIX** names exactly 48 possible lab files. **READY**, **GO**, and **DONE** separate the initial twelve opens from the additional thirty-six. **seq 1 100**, **test -e**, and **sleep .02** bound readiness, and **touch "$GO"** releases the second batch after the baseline count.
- **python3 -u -c** starts unbuffered inline Python. **open(...,"w")** creates each file, and **files.append** retains its live file object. The exclusive upper bounds in **range(1,13)** and **range(13,49)** create twelve and thirty-six files respectively. The helper's monotonic deadline bounds waiting for GO; the final sleep bounds observation time.
- **find /proc/PID/fd -mindepth 1 -maxdepth 1** prints only that directory's immediate descriptor entries, and **wc -l** counts them. Sampling after each gate avoids counting temporary coordination-file handles. The difference should be exactly 36 even if the initial count includes extra inherited descriptors.
- **lsof -nP -p "$leak_pid"** selects this PID, suppresses hostname lookup with **-n**, and keeps ports numeric with **-P**. **grep -F "$PREFIX-"** retains literal run-specific file paths; **wc -l** counts those file rows, rather than counting every lsof reference.
- **ls -l /proc/PID/fd** in the hint lists descriptor links in long format, so their targets are visible.
- **test -eq** asserts the growth and matching path counts. After exact termination and wait, **test ! -d /proc/PID/fd** confirms that descriptor table no longer exists. The cleanup loop removes only the 48 named files.`,
      code: code`
(
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
PREFIX=$LAB/fd-leak-$UID-$$
READY=$PREFIX.ready
GO=$PREFIX.go
DONE=$PREFIX.done
leak_pid=
trap 'test -n "$leak_pid" && kill "$leak_pid" 2>/dev/null || true; test -n "$leak_pid" && wait "$leak_pid" 2>/dev/null || true; for n in $(seq 1 48); do rm -f "$PREFIX-$n"; done; rm -f "$READY" "$GO" "$DONE"' EXIT
rm -f "$READY" "$GO" "$DONE"
PREFIX="$PREFIX" READY="$READY" GO="$GO" DONE="$DONE" python3 -u -c 'import os,time
files=[]
for n in range(1,13): files.append(open(os.environ["PREFIX"]+"-%d"%n,"w"))
open(os.environ["READY"],"w").close()
deadline=time.monotonic()+10
while not os.path.exists(os.environ["GO"]):
 if time.monotonic()>deadline: raise SystemExit("descriptor gate timed out")
 time.sleep(.02)
for n in range(13,49): files.append(open(os.environ["PREFIX"]+"-%d"%n,"w"))
open(os.environ["DONE"],"w").close()
time.sleep(20)' &
leak_pid=$!
for attempt in $(seq 1 100); do [ -e "$READY" ] && break; sleep .02; done
[ -e "$READY" ] || exit 1
before=$(find "/proc/$leak_pid/fd" -mindepth 1 -maxdepth 1 | wc -l)
touch "$GO"
for attempt in $(seq 1 100); do [ -e "$DONE" ] && break; sleep .02; done
[ -e "$DONE" ] || exit 1
after=$(find "/proc/$leak_pid/fd" -mindepth 1 -maxdepth 1 | wc -l)
path_count=$(lsof -nP -p "$leak_pid" | grep -F "$PREFIX-" | wc -l)
printf 'leak_pid=%s\nfd_before=%s\nfd_after=%s\nfd_growth=%s\nretained_lab_paths=%s\n' "$leak_pid" "$before" "$after" "$((after-before))" "$path_count"
[ "$((after-before))" -eq 36 ] && [ "$path_count" -eq 48 ] || exit 1
printf 'fd_leak_correlated=yes\n'
kill "$leak_pid"
wait "$leak_pid" 2>/dev/null || true
[ ! -d "/proc/$leak_pid/fd" ] || exit 1
printf 'fd_table_after_stop=absent\n'
leak_pid=
for n in $(seq 1 48); do rm -f "$PREFIX-$n"; done
rm -f "$READY" "$GO" "$DONE"
trap - EXIT
printf 'cleanup=done\n'
)
`,
      challenge:
        code`**Predict:** Does the initial descriptor count have to equal twelve? Name the references that can add a fixed offset.

**Inspect and explain:** Which output proves growth, which identifies the paths, and why is the unfiltered lsof row count unsuitable?

**Vary:** Close the first batch just before READY by inserting **for f in files: f.close()** on its own Python line. Rerun with the final retained_lab_paths expectation changed from 48 to 36. The growth remains 36; the closed first batch no longer contributes live descriptors.

**Hint:** Before cleanup, run **ls -l "/proc/$leak_pid/fd"** to inspect links. The gate-controlled counts supply the worked comparison.

**Apply:** A long-running worker grows by 36 descriptors per batch. Estimate how many further batches its measured soft limit permits, and explain why raising the limit delays failure without correcting ownership.`,
      expectedResult:
        code`fd_after - fd_before is exactly 36, retained_lab_paths=48 and fd_leak_correlated=yes. Common descriptor counts are 15 then 51, but inherited descriptors can add a fixed offset. fd_table_after_stop=absent verifies release by process exit. Two controlled batches prove retention in this reproduction, not the future slope or cause of an arbitrary production leak.`,
      systemsLens:
        code`Resource exhaustion depends on ownership, retention and the budget. A causal experiment changes one work batch and measures what remains afterward; a lifecycle fix must release references at the intended boundary.`,
    },
    {
      slug: "triage-deleted-file-space",
      title: "Reconcile hidden disk space held by a deleted file",
      difficulty: "advanced",
      tags: ["troubleshooting", "filesystem", "storage"],
      prerequisites: ["compare-df-and-du", "deleted-open-file"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 16,
      revision: 2,
      overview:
        code`A log pathname has disappeared, yet an open resource still owns its allocated blocks. Choose evidence that distinguishes visible directory contents from live file ownership, then verify the exact holder releases its reference. Host free-space changes are context, not a precise accounting experiment.`,
      syntaxBreakdown: code`### In plain terms

Removing a name does not necessarily release a file's storage. Diagnose the difference between what a directory walk can find and what an existing descriptor still holds before deleting more paths.

### What you are learning

- An unlinked file can remain open with its data and allocated blocks intact.
- du walks reachable names, while df reports free blocks for an entire mounted filesystem.
- Releasing the exact last holder makes blocks reclaimable; concurrent writes can hide that change in a host-wide sample.

### Piece by piece

- **Lab paths and shell control.** LINUX_LAB selects the directory; the HOME fallback is used only when it is empty. **mkdir -p** creates it idempotently. UID and the shell PID ($$) distinguish this run's names. Quoted expansions keep paths intact. **printf** prints labeled values; **$(...)** captures output, and **$((...))** performs integer arithmetic.
- **Ownership and cleanup.** **&** starts a child and **$!** records its exact PID. **trap ... EXIT** installs cleanup before the child starts. **kill** requests termination and **wait** reaps that child; **|| true** tolerates an already exited child during cleanup. **rm -f** removes only named lab files, and **trap - EXIT** clears the handler after explicit cleanup. Readiness loops use **test/[ ]**, **break**, and **sleep** to wait for observed state within a fixed bound; an assertion failure exits the experiment's subshell, not your terminal.
- **dd if=/dev/zero of="$FILE" bs=1M count=16 status=none** writes sixteen one-MiB zero blocks into the named lab file. **if** and **of** select input and output; **bs** and **count** bound allocation, and **status=none** suppresses routine statistics.
- **df -k "$LAB"** reports filesystem capacity in KiB. **awk 'NR==2{print $4}'** reads the available-space column in the first data row. **du -sk "$LAB"** summarizes named files in KiB; **-s** requests the total and **-k** chooses units. Its decrease after unlink describes lost pathname visibility.
- **python3 -u -c** opens the file in binary read mode, writes READY only after open succeeds, and holds the descriptor for at most twenty seconds. **test -s** checks the published descriptor record; **sleep .05** spaces ten bounded attempts. A failed readiness assertion ends the subshell with cleanup.
- **rm "$FILE"** unlinks that name while the helper still has its file object. **lsof -nP -a -p "$holder_pid" +L1** intersects the PID filter and the link-count-below-one filter using **-a**. **-n** and **-P** suppress name conversion. **grep -F** matches the literal path and the deleted marker; **|| true** permits an empty diagnostic result, which the following assertion rejects.
- **cat "$READY"** retrieves the descriptor number published by the helper. **stat -Lc %b /proc/PID/fd/FD** follows (**-L**) that exact file descriptor and formats (**-c**) its allocated 512-byte block count (**%b**). This is direct object evidence after the pathname is gone.
- **ls -l /proc/PID/fd** in the hint shows the descriptor links and their targets in long format.
- **test ! -d /proc/PID/fd** after wait verifies descriptor ownership ended. The final df sample can move in either direction under other workloads; it is not asserted to increase by exactly sixteen MiB.`,
      code: code`
(
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
RUN_ID=$$
FILE=$LAB/deleted-log-$UID-$RUN_ID.log
READY=$LAB/deleted-ready-$UID-$RUN_ID
holder_pid=
rm -f "$FILE" "$READY"
trap 'test -n "$holder_pid" && kill "$holder_pid" 2>/dev/null || true; test -n "$holder_pid" && wait "$holder_pid" 2>/dev/null || true; rm -f "$FILE" "$READY"' EXIT
dd if=/dev/zero of="$FILE" bs=1M count=16 status=none
df_before=$(df -k "$LAB" | awk 'NR==2{print $4}')
du_before=$(du -sk "$LAB" | awk '{print $1}')
FILE="$FILE" READY="$READY" python3 -u -c 'import os,time
f=open(os.environ["FILE"],"rb"); open(os.environ["READY"],"w").write(str(f.fileno())); time.sleep(20)' &
holder_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -s "$READY" ] && break
  sleep .05
done
[ -s "$READY" ] || exit 1
rm "$FILE"
du_after=$(du -sk "$LAB" | awk '{print $1}')
deleted_line=$(lsof -nP -a -p "$holder_pid" +L1 2>/dev/null | grep -F "$FILE" | grep -F '(deleted)' || true)
printf 'holder_pid=%s\nallocated_kib_before=%s\ndf_available_kib_before=%s\ndu_visible_after_unlink_kib=%s\ndeleted_open_seen=%s\n' "$holder_pid" "$((du_before - du_after))" "$df_before" "$du_after" "$(test -n "$deleted_line" && echo yes || echo no)"
if [ -n "$deleted_line" ]; then printf 'hidden_space_incident=observed\n'; else printf 'hidden_space_incident=partial\n'; fi
held_fd=$(cat "$READY")
held_blocks=$(stat -Lc %b "/proc/$holder_pid/fd/$held_fd")
printf 'held_file_blocks=%s\n' "$held_blocks"
[ "$held_blocks" -gt 0 ] && [ -n "$deleted_line" ] || exit 1
kill "$holder_pid" 2>/dev/null || true
wait "$holder_pid" 2>/dev/null || true
[ ! -d "/proc/$holder_pid/fd" ] || exit 1
printf 'holder_after_stop=absent\ndf_available_kib_after_close=%s\n' "$(df -k "$LAB" | awk 'NR==2{print $4}')"
holder_pid=
rm -f "$FILE" "$READY"
trap - EXIT
printf 'cleanup=done\n'
)
`,
      challenge:
        code`**Predict:** Which observation can still identify the file after its last directory entry is removed?

**Inspect and explain:** Match the exact PID, deleted pathname and allocated block count. Explain why deleting unrelated named files would not release this holder's reference.

**Vary:** Change **count=16** to **count=8** and rerun. Compare held_file_blocks and the du difference; preserve the warning that host df deltas include other activity.

**Hint:** Before stopping the holder, **ls -l "/proc/$holder_pid/fd"** shows its deleted link. The lsof intersection in the supplied experiment is the worked ownership query.

**Apply:** A service retains yesterday's rotated log. Choose a graceful close/reopen or restart procedure and a postcondition that proves the old reference ended without claiming all host free-space changes came from this file.`,
      expectedResult:
        code`allocated_kib_before is positive on a block-allocating filesystem, deleted_open_seen=yes, and held_file_blocks is positive even though the pathname is absent. hidden_space_incident=observed attributes the hidden file to the recorded PID. holder_after_stop=absent verifies its references ended. df_available_kib_after_close is a noisy filesystem-wide sample; use the earlier bounded-filesystem lesson to isolate reclaimed capacity.`,
      systemsLens:
        code`Names, open references and block allocation have different lifetimes. Diagnosis connects them through an exact owner; recovery must end the reference that holds the resource, rather than merely alter its name.`,
    },
    {
      slug: "triage-port-collision",
      title: "Diagnose and clear a loopback port collision",
      difficulty: "advanced",
      tags: ["troubleshooting", "sockets", "tcp"],
      prerequisites: ["map-port-to-process"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 15,
      revision: 3,
      overview:
        code`A replacement listener cannot bind its requested loopback endpoint. Choose evidence that identifies the current owner before intervening, then verify the endpoint becomes reusable. A successful bind proves endpoint availability; the final capstone will also test useful service.`,
      syntaxBreakdown: code`### In plain terms

An address-in-use error describes a resource conflict, not which process should be stopped. Join the endpoint to its exact owner and validate the intended remedy before treating the error as resolved.

### What you are learning

- A listening socket owns a local address/port combination in its network namespace.
- Intersecting PID and endpoint selectors avoids mistaking another process for the owner.
- Rebinding proves that the original conflict cleared; it does not prove an application accepts and answers requests.

### Piece by piece

- **Lab paths and shell control.** LINUX_LAB selects the directory; the HOME fallback is used only when it is empty. **mkdir -p** creates it idempotently. UID and the shell PID ($$) distinguish this run's names. Quoted expansions keep paths intact. **printf** prints labeled values; **$(...)** captures output, and **$((...))** performs integer arithmetic.
- **Ownership and cleanup.** **&** starts a child and **$!** records its exact PID. **trap ... EXIT** installs cleanup before the child starts. **kill** requests termination and **wait** reaps that child; **|| true** tolerates an already exited child during cleanup. **rm -f** removes only named lab files, and **trap - EXIT** clears the handler after explicit cleanup. Readiness loops use **test/[ ]**, **break**, and **sleep** to wait for observed state within a fixed bound; an assertion failure exits the experiment's subshell, not your terminal.
- **python3 -u -c** launches inline Python with unbuffered output. **socket.socket()** defaults to an IPv4 TCP socket; **bind(("127.0.0.1",0))** asks for a loopback ephemeral port. **listen(1)** starts listening, **getsockname()[1]** retrieves the assigned port, and the helper publishes it to META before a bounded twenty-second sleep.
- **test -s "$META"** requires a nonempty port file; ten **sleep .05** retries wait for readiness. **cat** reads the published port; the shell assertion prevents an empty value from reaching the probe.
- The second Python **bind** attempts the same endpoint. **except OSError** records the numeric errno and text; **finally: s.close()** closes the attempt's socket. On Linux, EADDRINUSE is errno 98. **head -n 1** selects the first result line. **grep -q** tests the result without printing it, and the escaped alternative matches either errno or message.
- **ss -ltnp** asks for listening (**-l**) TCP (**-t**) sockets, numeric addresses (**-n**) and process information (**-p**). **grep -E** matches the exact port followed by whitespace or end of line, avoiding a port-prefix match.
- **lsof -nP -a -p "$owner_pid" -iTCP:"$port" -sTCP:LISTEN** intersects (**-a**) the PID, TCP port and LISTEN filters. **-nP** disables host and port name lookup. **tail -n +2** drops the heading. Permissions can restrict process attribution.
- **ss -ltnp "sport = :$port"** in the hint uses ss’s own source-port filter to select the same listener.
- **kill** and **wait** terminate only the recorded owner. A fresh Python socket then attempts the original endpoint; **rebind=success** is printed only after bind succeeds. A final assertion requires both the original collision and the successful rebind.`,
      code: code`
(
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
RUN_ID=$$
META=$LAB/collision-meta-$UID-$RUN_ID
owner_pid=
rm -f "$META"
trap 'test -n "$owner_pid" && kill "$owner_pid" 2>/dev/null || true; test -n "$owner_pid" && wait "$owner_pid" 2>/dev/null || true; rm -f "$META"' EXIT
META="$META" python3 -u -c 'import os,socket,time
s=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(1); open(os.environ["META"],"w").write(str(s.getsockname()[1])); time.sleep(20)' &
owner_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -s "$META" ] && break
  sleep .05
done
[ -s "$META" ] || exit 1
port=$(cat "$META" 2>/dev/null || true)
collision=$(python3 -c 'import socket,sys
s=socket.socket()
try: s.bind(("127.0.0.1",int(sys.argv[1]))); print("unexpected-bind")
except OSError as e: print("error="+str(e.errno)); print("text="+str(e))
finally: s.close()' "$port" 2>&1)
printf 'collision_port=%s\nsecond_bind_result=%s\neaddrinuse_seen=%s\n' "$port" "$(printf '%s\n' "$collision" | head -n 1)" "$(printf '%s\n' "$collision" | grep -q 'error=98\|Address already in use' && echo yes || echo no)"
ss_owner=$(ss -ltnp 2>/dev/null | grep -E ":$port([[:space:]]|$)" || true)
lsof_owner=$(lsof -nP -a -p "$owner_pid" -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 || true)
printf 'ss_owner_seen=%s\nlsof_owner_seen=%s\n' "$(test -n "$ss_owner" && echo yes || echo no)" "$(test -n "$lsof_owner" && echo yes || echo no)"
kill "$owner_pid" 2>/dev/null || true
wait "$owner_pid" 2>/dev/null || true
owner_pid=
rebind=$(python3 -c 'import socket,sys
s=socket.socket(); s.bind(("127.0.0.1",int(sys.argv[1]))); print("rebind=success"); s.close()' "$port" 2>&1 || true)
printf '%s\n' "$rebind"
if printf '%s\n' "$collision" | grep -q 'error=98\|Address already in use' && printf '%s\n' "$rebind" | grep -q 'rebind=success'; then printf 'port_collision_remediated=yes\n'; else printf 'port_collision_remediated=partial\n'; fi
printf '%s\n' "$collision" | grep -q 'error=98' || exit 1
printf '%s\n' "$rebind" | grep -q 'rebind=success' || exit 1
rm -f "$META"
trap - EXIT
printf 'cleanup=done\n'
)
`,
      challenge:
        code`**Predict:** Would seeing LISTEN prove the replacement application can bind the endpoint? Would a successful bind prove the application answers requests?

**Inspect and explain:** Identify the evidence linking the conflicting port to one PID, and explain why a broad process-name kill is unjustified.

**Vary:** Replace the first **s.listen(1)** with **s.listen(4)** and rerun. Predict whether a larger admission queue changes exclusive ownership of this endpoint.

**Hint:** Before termination, run **ss -ltnp "sport = :$port"** to narrow the socket view. The lsof command in the worked experiment independently joins the exact owner and endpoint.

**Apply:** A deployment reports address already in use. State the evidence needed to distinguish an old instance from an unrelated service before selecting shutdown, a different port or a configuration correction.`,
      expectedResult:
        code`The second bind reports error=98 and eaddrinuse_seen=yes. ss_owner_seen=yes and normally lsof_owner_seen=yes identify the listener; permissions may limit those views. After the recorded owner is stopped and reaped, rebind=success and port_collision_remediated=yes prove the conflict cleared. No request/response availability claim is made.`,
      systemsLens:
        code`A resource error becomes actionable when identity maps to an owner. Port collision response follows the same observe, join, remediate, and verify pattern as leaked files or mounts.`,
    },
    {
      slug: "capstone-service-outage",
      title: "Diagnose and recover a multi-symptom lab service",
      difficulty: "advanced",
      tags: ["troubleshooting", "sockets", "file-descriptors", "processes", "filesystem"],
      prerequisites: [
        "process-states",
        "signal-disposition",
        "triage-cpu-saturation",
        "triage-memory-growth",
        "triage-fd-leak",
        "triage-deleted-file-space",
        "triage-port-collision",
      ],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 30,
      revision: 2,
      overview:
        code`A loopback service still has a listening socket, but a bounded health request receives no answer. Its process also holds a deleted log and several open files. Decide which observation explains the outage, which observations describe retained resources, and what evidence would prove availability recovered.`,
      syntaxBreakdown: code`### In plain terms

A live process and a listening socket do not guarantee useful work. This incident distinguishes a stalled request path from retained resources, then tests recovery with a real response before shutting the service down.

### What you are learning

- Process state, endpoint ownership and request results describe different layers of availability.
- A stopped process keeps its descriptors and listening socket; the kernel can complete connection setup while userspace cannot answer.
- Open files and a deleted log are ownership evidence, but their presence alone does not explain the request timeout.
- Recovery means the expected reply arrives again; teardown means the exact process and its resources are released.

### Piece by piece

- **Lab paths and shell control.** LINUX_LAB selects the directory; the HOME fallback is used only when it is empty. **mkdir -p** creates it idempotently. UID and the shell PID ($$) distinguish this run's names. Quoted expansions keep paths intact. **printf** prints labeled values; **$(...)** captures output, and **$((...))** performs integer arithmetic.
- **Ownership and cleanup.** **&** starts a child and **$!** records its exact PID. **trap ... EXIT** installs cleanup before the child starts. **kill** requests termination and **wait** reaps that child; **|| true** tolerates an already exited child during cleanup. **rm -f** removes only named lab files, and **trap - EXIT** clears the handler after explicit cleanup. Readiness loops use **test/[ ]**, **break**, and **sleep** to wait for observed state within a fixed bound; an assertion failure exits the experiment's subshell, not your terminal.
- **BASE**, **META** and **LOG** name run-specific resources. **cleanup_service** is a shell function; **kill -CONT** first resumes a stopped helper so **kill -TERM** can run its handler. It then waits and removes the twelve exact file names with **seq 1 12**. The fifteen-second watchdog bounds a stopped service; it too has a recorded PID and cleanup.
- The supplied **python3 -u -c** helper installs a **signal.SIGTERM** handler that sets **stop**. Twelve file objects remain in **handles**; a one-MiB log is flushed and unlinked while its descriptor remains open. **socket.bind** selects an ephemeral loopback port, **listen(4)** enables a small queue, and **settimeout(.1)** lets the accept loop check shutdown. The monotonic twenty-second deadline bounds normal execution.
- **with open(META,"w")** closes the port record before readiness is observed. **test -s** waits for nonempty metadata. Each accepted connection has a **.2-second timeout**; **readline(64)** bounds the request line and handles TCP short reads. **sendall** sends all response bytes. A ping line receives an ok:ping line; other requests receive bad-request. **finally** closes sockets and files and removes the twelve names.
- **probe_service** runs the quoted PROBE here-document using **python3 - "$port"**. **socket.create_connection(...,timeout=.3)** bounds connection and response waiting. It sends ping, reads at most 64 bytes, compares the complete reply, and distinguishes healthy, timeout, wrong-response and socket-error. A connected socket alone is insufficient.
- **kill -STOP** injects a reversible stop; **ps -o stat= -p PID**, **tr -d ' '** and **cut -c1** isolate its state letter. A bounded loop requires **T** before probing. In the investigation view, **ps -o pid=,stat=,pcpu=,time=** shows identity, state, lifetime CPU fraction and accumulated CPU time.
- **ss -ltnp "sport = :$port"** filters the listening TCP endpoint by source port and requests numeric addresses and owner information. **find /proc/PID/fd -mindepth 1 -maxdepth 1 | wc -l** counts that task's descriptors. **lsof -nP -a -p PID +L1** intersects the exact PID and zero-link files, and **grep -F "$LOG"** selects this deleted log.
- **kill -CONT** is the worked intervention. A second real ping must receive the correct reply from the same endpoint. Only afterward does **kill -TERM** request graceful shutdown; **wait** supplies its exit status. **ss -H -ltn** suppresses headings for the empty-listener check. Exact file absence, an absent process and zero status independently verify teardown.`,
      code: code`
(
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
BASE=$LAB/capstone-$UID-$$
META=$BASE.port
LOG=$BASE.log
service_pid=
cleanup_service() {
  if [ -n "$service_pid" ]; then
    kill -CONT "$service_pid" 2>/dev/null || true
    kill -TERM "$service_pid" 2>/dev/null || true
    wait "$service_pid" 2>/dev/null || true
  fi
  for n in $(seq 1 12); do rm -f "$BASE.fd-$n"; done
  rm -f "$META" "$LOG"
}
trap cleanup_service EXIT
rm -f "$META" "$LOG"
BASE="$BASE" META="$META" LOG="$LOG" python3 -u -c 'import os,signal,socket,time
stop=False
def halt(sig,frame):
 global stop
 stop=True
signal.signal(signal.SIGTERM,halt)
handles=[open(os.environ["BASE"]+".fd-%d"%n,"w") for n in range(1,13)]
log=open(os.environ["LOG"],"w+")
log.write("x"*1048576); log.flush(); os.unlink(os.environ["LOG"])
s=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(4); s.settimeout(.1)
with open(os.environ["META"],"w") as meta: meta.write(str(s.getsockname()[1]))
deadline=time.monotonic()+20
try:
 while not stop and time.monotonic()<deadline:
  try: c,_=s.accept()
  except socket.timeout: continue
  with c:
   c.settimeout(.2)
   try:
    request=c.makefile("rb").readline(64)
    c.sendall(b"ok:ping\n" if request==b"ping\n" else b"bad-request\n")
   except OSError: pass
finally:
 s.close(); log.close()
 for f in handles: f.close(); os.unlink(f.name)' &
service_pid=$!
# A watchdog also resumes a stopped task before requesting shutdown.
# The EXIT trap terminates only PIDs started by this experiment.
watchdog_pid=
python3 - "$service_pid" <<'WATCHDOG' &
import os,signal,sys,time
time.sleep(15)
try:
    os.kill(int(sys.argv[1]),signal.SIGCONT)
    os.kill(int(sys.argv[1]),signal.SIGTERM)
except ProcessLookupError:
    pass
WATCHDOG
watchdog_pid=$!
trap 'kill "$watchdog_pid" 2>/dev/null || true; wait "$watchdog_pid" 2>/dev/null || true; cleanup_service' EXIT
for attempt in $(seq 1 100); do [ -s "$META" ] && break; sleep .02; done
[ -s "$META" ] || exit 1
port=$(cat "$META")
probe_service() {
  python3 - "$port" <<'PROBE'
import socket,sys
try:
    with socket.create_connection(('127.0.0.1',int(sys.argv[1])),timeout=.3) as c:
        c.sendall(b'ping\n')
        reply=c.makefile('rb').readline(64)
        print('healthy' if reply==b'ok:ping\n' else 'wrong-response')
except TimeoutError:
    print('timeout')
except OSError as e:
    print('socket-error:%s'%e.errno)
PROBE
}
baseline=$(probe_service)
printf 'baseline_response=%s\n' "$baseline"
[ "$baseline" = healthy ] || exit 1
# Controlled fault injection. In guided mode, make a hypothesis from the symptom first.
kill -STOP "$service_pid"
for attempt in $(seq 1 100); do
  state=$(ps -o stat= -p "$service_pid" | tr -d ' ' | cut -c1)
  [ "$state" = T ] && break
  sleep .01
done
[ "$state" = T ] || exit 1
failed=$(probe_service)
printf 'incident_response=%s\nservice_pid=%s\nport=%s\n' "$failed" "$service_pid" "$port"
# Investigation: choose your evidence before running the worked observations below.
ps -o pid=,stat=,pcpu=,time= -p "$service_pid"
listener=$(ss -ltnp "sport = :$port")
printf '%s\n' "$listener"
fd_count=$(find "/proc/$service_pid/fd" -mindepth 1 -maxdepth 1 | wc -l)
deleted=$(lsof -nP -a -p "$service_pid" +L1 | grep -F "$LOG" || true)
printf 'service_state=%s\nretained_fd_count=%s\ndeleted_log_seen=%s\n' "$state" "$fd_count" "$(test -n "$deleted" && echo yes || echo no)"
[ "$failed" = timeout ] && [ "$fd_count" -ge 16 ] && [ -n "$deleted" ] || exit 1
printf '%s\n' "$listener" | grep -q LISTEN || exit 1
# Intervention and availability proof, without destroying the process or endpoint.
kill -CONT "$service_pid"
recovered=$(probe_service)
printf 'recovered_response=%s\n' "$recovered"
[ "$recovered" = healthy ] || exit 1
printf 'service_available_again=yes\n'
# Teardown is a separate postcondition from availability.
kill -TERM "$service_pid"
service_status=0
wait "$service_pid" || service_status=$?
[ "$service_status" -eq 0 ] && [ ! -d "/proc/$service_pid" ] || exit 1
service_pid=
kill "$watchdog_pid" 2>/dev/null || true
wait "$watchdog_pid" 2>/dev/null || true
remaining_files=0
for n in $(seq 1 12); do [ ! -e "$BASE.fd-$n" ] || remaining_files=$((remaining_files+1)); done
remaining_listener=$(ss -H -ltn "sport = :$port")
printf 'graceful_exit_status=%s\nremaining_service_files=%s\nremaining_listener=%s\n' "$service_status" "$remaining_files" "$(test -n "$remaining_listener" && echo yes || echo no)"
[ "$remaining_files" -eq 0 ] && [ -z "$remaining_listener" ] || exit 1
cleanup_service
trap - EXIT
printf 'cleanup=verified\n'
)
`,
      challenge:
        code`**Incident brief:** A local health probe times out even though the endpoint appears to be listening. The process has multiple descriptors and a deleted log. Before reading the worked injection or expected result, give two competing explanations and choose three observations that can distinguish them.

**Inspect and explain:** Use the exact PID and port printed by the experiment. Explain which evidence is causal for the missing response and which only establishes resource ownership. Do not assume every unusual observation is a fault.

**Hint 1:** Compare process state with endpoint state and the actual reply. **Hint 2 (runnable):** During investigation run **ps -o pid,stat,time -p "$service_pid"**, **ss -ltnp "sport = :$port"**, and **lsof -nP -a -p "$service_pid" +L1**. **Worked intervention:** Continue with the supplied intervention section when you want the answer.

**Vary:** Rerun with **range(1,13)** changed to **range(1,7)** in the helper and the minimum descriptor assertion changed from 16 to 10. Keep the cleanup loops unchanged. Does reducing the fixed file set restore responses while the task is stopped?

**Apply:** Submit a short incident record: two hypotheses, three measured observations, the least disruptive justified intervention, a successful response, exact cleanup evidence and one limit of the experiment. Explain what load and crash-recovery tests would still be needed before making a production capacity or durability claim.`,
      expectedResult:
        code`baseline_response=healthy establishes useful service. During the incident, incident_response=timeout, service_state=T, a LISTEN row, retained_fd_count at least 16, and deleted_log_seen=yes coexist. These distinguish a stopped request handler from missing endpoint ownership; the descriptor count is a fixed working set, not evidence of a growing leak. After the intervention, recovered_response=healthy and service_available_again=yes prove a correct response at the same endpoint. After separate teardown, graceful_exit_status=0, remaining_service_files=0, remaining_listener=no and cleanup=verified prove release. This is a reversible process-stop incident, not a crash-durability or sustained-load benchmark.`,
      systemsLens:
        code`Availability is an end-to-end property: retained kernel objects and connection setup are weaker evidence than a correct application response. Separate causal diagnosis, service recovery and resource teardown so one success cannot stand in for the others.`,
      caution:
        code`Use only this experiment's exact PID and loopback port. The service holds twelve tiny files and a one-MiB deleted log. The watchdog resumes and terminates its recorded process after fifteen seconds; the normal helper deadline is twenty seconds. Run the supplied sections promptly, or restart the full bounded experiment for more investigation time. Never send signals to a PID selected only by a matching process name.`,
    },
  ],
};
