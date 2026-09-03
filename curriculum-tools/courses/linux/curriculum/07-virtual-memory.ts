import { code, type Module } from "../../../src/types.ts";

export const MEMORY: Module = {
  category: "virtual-memory",
  title: "Relate address spaces, faults, cache, reclaim, and OOM",
  lessons: [
    {
      slug: "map-process-address-space",
      title: "Map a process address space to virtual regions",
      difficulty: "intermediate",
      tags: ["virtual-memory", "procfs", "processes"],
      prerequisites: ["threads-under-task"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 14,
      overview:
        code`Start a bounded helper that maps one lab file and one anonymous region, then inspect its live mapping table. Matching the file path in pmap and /proc/PID/maps turns an abstract address space into named virtual regions without changing the host filesystem.`,
      syntaxBreakdown:
        code`Python mmap creates file-backed and anonymous virtual mappings; pmap -x summarizes a process map; /proc/PID/maps exposes region permissions and paths; readlink and grep correlate the helper with its mappings.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FILE=$LAB/vm-map-$UID.bin
READY=$LAB/vm-map-ready-$UID
rm -f "$FILE" "$READY"
truncate -s 4096 "$FILE"
child_pid=
trap 'test -n "$child_pid" && kill "$child_pid" 2>/dev/null || true; test -n "$child_pid" && wait "$child_pid" 2>/dev/null || true; rm -f "$FILE" "$READY"' EXIT
export FILE READY
python3 -c 'import mmap, os, time; fd=os.open(os.environ["FILE"], os.O_RDONLY); file_map=mmap.mmap(fd, 4096, access=mmap.ACCESS_READ); anon_map=mmap.mmap(-1, 1048576); open(os.environ["READY"], "w").close(); time.sleep(4)' &
child_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  [ -e "$READY" ] && break
  sleep 0.05
done
file_map_seen=$(grep -F "$FILE" "/proc/$child_pid/maps" 2>/dev/null | wc -l)
anon_map_seen=$(pmap -x "$child_pid" 2>/dev/null | awk '$0 ~ / rw--- / && $0 !~ /\/.*\// {n++} END{print n+0}')
printf 'child_pid=%s\n' "$child_pid"
printf 'proc_file_mapping_lines=%s\n' "$file_map_seen"
printf 'pmap_anonymous_rw_regions=%s\n' "$anon_map_seen"
if [ "$file_map_seen" -ge 1 ] && [ "$anon_map_seen" -ge 1 ]; then printf 'address_space_regions=observed\n'; else printf 'address_space_regions=unexpected\n'; fi
wait "$child_pid"
child_pid=
rm -f "$FILE" "$READY"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`proc_file_mapping_lines is at least 1, pmap_anonymous_rw_regions is at least 1, address_space_regions=observed, and cleanup=done. Addresses, region counts, and the child PID vary by Python and kernel version.`,
      systemsLens:
        code`A process address space is a set of virtual ranges with independent permissions and backing: file pages, anonymous pages, shared libraries, and stacks. The same map-to-backing distinction explains copy-on-write, shared memory, and executable loading.`,
    },
    {
      slug: "compare-rss-and-vsz",
      title: "Separate reserved virtual size from resident memory",
      difficulty: "intermediate",
      tags: ["virtual-memory", "procfs", "page-cache"],
      prerequisites: ["map-process-address-space"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      overview:
        code`Reserve a 128 MiB anonymous mapping but touch only 8 MiB of its pages. Comparing VmSize with VmRSS shows that address-space reservation and physical residency are different kernel accounting questions.`,
      syntaxBreakdown:
        code`mmap(-1, size) reserves anonymous virtual space; a byte write every page faults in a bounded resident subset; /proc/PID/status reports VmSize and VmRSS; awk extracts numeric kB values.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
READY=$LAB/vm-rss-ready-$UID
rm -f "$READY"
child_pid=
trap 'test -n "$child_pid" && kill "$child_pid" 2>/dev/null || true; test -n "$child_pid" && wait "$child_pid" 2>/dev/null || true; rm -f "$READY"' EXIT
export READY
python3 -c 'import mmap, os, time; size=128*1024*1024; touched=8*1024*1024; region=mmap.mmap(-1, size); view=memoryview(region); [view.__setitem__(offset, 1) for offset in range(0, touched, 4096)]; open(os.environ["READY"], "w").close(); time.sleep(4)' &
child_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  [ -e "$READY" ] && break
  sleep 0.05
done
vsz_kb=$(awk '/^VmSize:/{print $2}' "/proc/$child_pid/status")
rss_kb=$(awk '/^VmRSS:/{print $2}' "/proc/$child_pid/status")
printf 'child_pid=%s\n' "$child_pid"
printf 'vsz_kb=%s\n' "$vsz_kb"
printf 'rss_kb=%s\n' "$rss_kb"
if [ -n "$vsz_kb" ] && [ -n "$rss_kb" ] && [ "$vsz_kb" -gt "$rss_kb" ]; then printf 'virtual_exceeds_resident=yes\n'; else printf 'virtual_exceeds_resident=no\n'; fi
wait "$child_pid"
child_pid=
rm -f "$READY"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`vsz_kb is greater than rss_kb and virtual_exceeds_resident=yes. The mapping is capped at 128 MiB and only an 8 MiB subset is intentionally touched; exact totals vary with the interpreter.`,
      systemsLens:
        code`VSZ measures the virtual ranges a process can address, while RSS measures pages currently resident in RAM. Reservations, demand paging, and copy-on-write let services have a large address space without consuming that amount of physical memory immediately.`,
    },
    {
      slug: "observe-page-faults",
      title: "Compare first-touch and warmed page faults",
      difficulty: "intermediate",
      tags: ["virtual-memory", "procfs", "processes"],
      prerequisites: ["map-process-address-space"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 14,
      overview:
        code`Have a helper touch each page of a 16 MiB anonymous mapping once, then touch the same pages again. Reading the process fault counters around each phase reveals the lazy connection between virtual addresses and resident pages.`,
      syntaxBreakdown:
        code`/proc/PID/stat fields 10 and 12 are minor and major faults; marker files coordinate bounded phases; Python writes one byte per 4096-byte page; awk computes counter deltas.`,
      code: code`
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
`,
      expectedResult:
        code`first_minor_delta is positive, second_minor_delta is zero or much smaller, first_touch_faults=greater_or_equal, and cleanup=done. Major-fault counts and exact minor deltas vary; the first pass must establish residency before the second pass.`,
      systemsLens:
        code`A page fault is the kernel's lazy bridge from a virtual page to a backing page. The first access allocates or maps pages, while later accesses reuse resident translations until reclaim or eviction intervenes.`,
    },
    {
      slug: "warm-the-page-cache",
      title: "Warm a bounded file through the page cache",
      difficulty: "intermediate",
      tags: ["page-cache", "virtual-memory", "storage"],
      prerequisites: ["observe-page-faults"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 10,
      overview:
        code`Read the same 8 MiB lab file twice and record completion time plus the kernel's Cached counter before and after. The experiment makes page-cache reuse observable while leaving global cache state intact and avoiding drop_caches.`,
      syntaxBreakdown:
        code`dd creates and reads a bounded byte stream; /usr/bin/time -f records elapsed seconds; /proc/meminfo exposes Cached kB; awk extracts labeled counters without asserting noisy timings.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FILE=$LAB/cache-warm-$UID.bin
FIRST=$LAB/cache-first-$UID.time
SECOND=$LAB/cache-second-$UID.time
trap 'rm -f "$FILE" "$FIRST" "$SECOND"' EXIT
dd if=/dev/zero of="$FILE" bs=1M count=8 status=none
size=$(stat -c %s "$FILE")
cached_before=$(awk '/^Cached:/{print $2}' /proc/meminfo)
/usr/bin/time -f '%e' -o "$FIRST" dd if="$FILE" of=/dev/null bs=1M status=none
cached_after_first=$(awk '/^Cached:/{print $2}' /proc/meminfo)
/usr/bin/time -f '%e' -o "$SECOND" dd if="$FILE" of=/dev/null bs=1M status=none
cached_after_second=$(awk '/^Cached:/{print $2}' /proc/meminfo)
printf 'file_bytes=%s\n' "$size"
printf 'cached_kb_before=%s\n' "$cached_before"
printf 'cached_kb_after_first=%s\n' "$cached_after_first"
printf 'cached_kb_after_second=%s\n' "$cached_after_second"
printf 'first_elapsed_s=%s\n' "$(cat "$FIRST")"
printf 'second_elapsed_s=%s\n' "$(cat "$SECOND")"
if [ "$size" -eq 8388608 ] && [ -s "$FIRST" ] && [ -s "$SECOND" ]; then printf 'cache_reads=completed_twice\n'; else printf 'cache_reads=unexpected\n'; fi
rm -f "$FILE" "$FIRST" "$SECOND"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`file_bytes=8388608, cache_reads=completed_twice, and both elapsed measurements plus Cached counters are printed. Times and counters vary; the second read is a completed cache candidate, not a fixed-speed benchmark.`,
      systemsLens:
        code`The page cache lets a pathname's file data be served from memory after storage pages are read. Cache accounting is global and noisy, so production diagnosis uses trends and corroborating I/O evidence rather than one exact timing.`,
    },
    {
      slug: "reclaim-under-pressure",
      title: "Observe reclaim feedback inside a bounded cgroup",
      difficulty: "advanced",
      tags: ["virtual-memory", "cgroups", "resource-limits"],
      prerequisites: ["compare-rss-and-vsz"],
      safetyLevel: "privileged",
      runIn: "shell",
      estimatedMinutes: 18,
      overview:
        code`Create one uniquely named child cgroup with a 96 MiB memory ceiling, move a helper into it, and grow only 64 MiB of anonymous memory. Reading memory.current, memory.events, and vmstat makes accounting and reclaim feedback visible while the host remains outside the budget.`,
      syntaxBreakdown:
        code`findmnt locates cgroup2; memory.max sets one group's bound; cgroup.procs moves an exact PID; memory.current and memory.events report usage and events; vmstat samples system counters.`,
      code: code`
(
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
  test -f "$CG/cgroup.kill" && printf 1 > "$CG/cgroup.kill" 2>/dev/null || true
  test -d "$CG" && rmdir "$CG" 2>/dev/null || true
  rm -f "$READY" "$GO"
}
trap cleanup_reclaim EXIT
mountpoint=$(findmnt -t cgroup2 -n -o TARGET 2>/dev/null)
if [ -z "$mountpoint" ] || [ ! -w "$mountpoint" ]; then printf 'cgroup_setup=unavailable\n'; exit 0; fi
CG=$mountpoint/linux-tutor-$UID-$BASHPID-$RANDOM
if ! mkdir "$CG" 2>/dev/null; then printf 'cgroup_setup=unavailable\n'; exit 0; fi
printf 100663296 > "$CG/memory.max"
printf 50331648 > "$CG/memory.high"
printf 0 > "$CG/memory.swap.max" 2>/dev/null || true
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
if ! printf '%s\n' "$child_pid" > "$CG/cgroup.procs" 2>/dev/null; then printf 'cgroup_move=unavailable\n'; exit 0; fi
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
`,
      expectedResult:
        code`A dedicated cgroup is created when the VM permits it; memory_max=100663296, memory_current is below that value, memory_high_after is greater than memory_high_before, oom_events=0, bounded_reclaim_observation=high-event-within-max, a vmstat sample is printed, and cleanup=cgroup-removed. If cgroup delegation is unavailable the bounded code prints cgroup_setup=unavailable and changes nothing.`,
      systemsLens:
        code`Memory pressure is feedback from a hierarchy: usage, reclaim, and event counters are scoped to a resource domain. Cgroups let an operator distinguish one workload's budget from the host's unrelated memory consumers.`,
      caution:
        code`Run only on the disposable VM. The trap removes this exact child cgroup and kills only the helper PID; never run this lesson after manually placing another process in the named cgroup.`,
    },
    {
      slug: "bounded-oom-kill",
      title: "Localize an OOM kill to one cgroup",
      difficulty: "advanced",
      tags: ["virtual-memory", "cgroups", "troubleshooting"],
      prerequisites: ["reclaim-under-pressure"],
      safetyLevel: "dangerous",
      runIn: "shell",
      estimatedMinutes: 16,
      overview:
        code`Give one uniquely named child cgroup a 64 MiB memory ceiling and let an exact helper attempt a bounded 128 MiB allocation. The helper may be killed by the cgroup OOM policy, while the parent remains alive to read the group's oom_kill counter and prove failure was localized.`,
      syntaxBreakdown:
        code`memory.max establishes the cap; cgroup.procs moves only the helper; memory.events records oom_kill; wait captures the helper's signal-derived status; rmdir removes the empty cgroup after exact cleanup.`,
      code: code`
(
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
CG=
RESULT=$LAB/oom-result-$UID
READY=$LAB/oom-ready-$UID
GO=$LAB/oom-go-$UID
rm -f "$RESULT" "$READY" "$GO"
child_pid=
cleanup_oom() {
  test -n "$child_pid" && kill "$child_pid" 2>/dev/null || true
  test -n "$child_pid" && wait "$child_pid" 2>/dev/null || true
  test -f "$CG/cgroup.kill" && printf 1 > "$CG/cgroup.kill" 2>/dev/null || true
  test -d "$CG" && rmdir "$CG" 2>/dev/null || true
  rm -f "$RESULT" "$READY" "$GO"
}
trap cleanup_oom EXIT
mountpoint=$(findmnt -t cgroup2 -n -o TARGET 2>/dev/null)
if [ -z "$mountpoint" ] || [ ! -w "$mountpoint" ]; then printf 'cgroup_setup=unavailable\n'; exit 0; fi
CG=$mountpoint/linux-tutor-$UID-$BASHPID-$RANDOM
if ! mkdir "$CG" 2>/dev/null; then printf 'cgroup_setup=unavailable\n'; exit 0; fi
printf 67108864 > "$CG/memory.max"
printf 0 > "$CG/memory.swap.max" 2>/dev/null || true
before=$(awk '$1=="oom_kill"{print $2}' "$CG/memory.events")
export RESULT READY GO
python3 -c 'import os, time; open(os.environ["READY"], "w").close();
while not os.path.exists(os.environ["GO"]): time.sleep(0.01)
data=bytearray(128*1024*1024); [data.__setitem__(offset, 1) for offset in range(0, len(data), 4096)]; open(os.environ["RESULT"], "w").write("allocation_completed=unexpected\n")' &
child_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  [ -e "$READY" ] && break
  sleep 0.05
done
if ! printf '%s\n' "$child_pid" > "$CG/cgroup.procs" 2>/dev/null; then printf 'cgroup_move=unavailable\n'; exit 0; fi
touch "$GO"
if wait "$child_pid"; then child_status=0; else child_status=$?; fi
child_pid=
after=$(awk '$1=="oom_kill"{print $2}' "$CG/memory.events")
printf 'child_status=%s\n' "$child_status"
printf 'oom_kill_before=%s\n' "$before"
printf 'oom_kill_after=%s\n' "$after"
printf 'parent_alive=yes\n'
if [ "$after" -gt "$before" ] && [ ! -e "$RESULT" ]; then printf 'oom_kill_increment=yes\n'; else printf 'oom_kill_increment=no\n'; fi
cleanup_oom
trap - EXIT
printf 'cleanup=cgroup-removed\n'
)
`,
      expectedResult:
        code`On a delegated cgroup v2 VM, oom_kill_after is greater than oom_kill_before, the allocation result file is absent, parent_alive=yes, oom_kill_increment=yes, and cleanup=cgroup-removed; child_status is commonly 137 but may vary by signal reporting. If delegation is unavailable the lesson prints cgroup_setup=unavailable and leaves no resource behind.`,
      systemsLens:
        code`An OOM policy can terminate a member of a resource domain rather than taking down every process on the host. The event counter and surviving supervisor are the operational evidence that the failure boundary worked.`,
      caution:
        code`Dangerous by design: run only on a disposable VM with this exact cgroup code and cleanup trap. The allocation is capped at 128 MiB and the parent is never moved into the cgroup.`,
    },
  ],
};
