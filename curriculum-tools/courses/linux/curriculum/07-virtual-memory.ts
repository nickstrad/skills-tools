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
      revision: 2,
      overview:
        code`Start a bounded helper that maps one lab file and one anonymous region, then inspect its live mapping table. Matching the file path in pmap and /proc/PID/maps turns an abstract address space into named virtual regions without changing the host filesystem.`,
      syntaxBreakdown: code`### In plain terms

One helper maps both a lab file and anonymous memory, then stays alive for inspection. The experiment turns an address space into named virtual regions without assuming that every virtual byte is resident.

### What you are learning

- Virtual mappings have backing and permissions independent of their addresses.
- Procfs and pmap give complementary process-local evidence.

### Piece by piece

- **truncate -s 4096** (length setter): makes the one-page file the helper can map without allocating a larger workload.
- **python3 -c mmap.mmap** (mapping helper): **os.open** obtains a read descriptor, **mmap** maps the file, and **mmap(-1, 1048576)** reserves anonymous memory. READY is created only after both mappings exist.
- **grep -F FILE /proc/PID/maps** (procfs evidence): **-F** matches the literal pathname and counts the file-backed mapping lines.
- **pmap -x PID** and **awk** (map summary and selector): **-x** includes extended size and RSS columns; awk counts anonymous read/write regions. The values identify regions, not a global memory total.
- **wait** and **trap** (lifetime control): inspect the exact child while alive, then reap it and remove only its lab files.`,
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
      challenge:
        "**Predict:** Does doubling the anonymous mapping make the file mapping line disappear?\n\n**Inspect and explain:** Identify the file mapping and the anonymous mapping evidence before the helper exits.\n\n**Vary:** Rerun the complete lesson, changing only anon_map=mmap.mmap(-1, 1048576) to anon_map=mmap.mmap(-1, 2*1048576). Keep the original mapping observations and exact-PID cleanup.\n\n**Hint:** Start a new helper and retain its exact PID; procfs disappears after exit.\n\n**Apply:** Choose whether pmap or /proc/PID/maps better answers a report of unexpected file-backed mappings, and explain why.",
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
      revision: 2,
      overview:
        code`Reserve a 128 MiB anonymous mapping but touch only 8 MiB of its pages. Comparing VmSize with VmRSS shows that address-space reservation and physical residency are different kernel accounting questions.`,
      syntaxBreakdown: code`### In plain terms

The helper reserves 128 MiB but writes only an 8 MiB page-by-page prefix. VmSize and VmRSS answer different questions: addressable range versus pages resident now.

### What you are learning

- Anonymous mappings reserve virtual addresses before all pages need RAM.
- First writes fault pages in; VmRSS includes interpreter overhead as well as the controlled region.

### Piece by piece

- **mmap.mmap(-1, size)** (anonymous mapping): **-1** asks for anonymous backing and size reserves 128 MiB of address space.
- **memoryview** and **range(..., 4096)** (page toucher): writes one byte at every 4096-byte page in only the first 8 MiB, causing bounded demand allocation.
- **/proc/PID/status** and **awk** (kernel accounting): **VmSize** and **VmRSS** are kB fields selected by name. Compare the relationship, not an exact Python total.
- **READY**, **wait**, and **trap** (coordination and cleanup): ensure the map exists before reading it and protect the recorded child PID.`,
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
      challenge:
        "**Predict:** If the helper touches 16 MiB instead of 8 MiB, which counter should rise while VSZ remains broadly similar?\n\n**Inspect and explain:** Compare the reserved virtual size and resident pages, without treating interpreter overhead as part of the requested buffer.\n\n**Vary:** Rerun the complete lesson with touched=8*1024*1024 changed to touched=16*1024*1024. Keep the 128 MiB reservation and compare the resulting VSZ and RSS.\n\n**Hint:** Read both fields before the helper exits.\n\n**Apply:** Explain why a large VSZ alone is insufficient evidence for choosing a memory limit.",
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
      revision: 2,
      overview:
        code`Have a helper touch each page of a 16 MiB anonymous mapping once, then touch the same pages again. Reading the process fault counters around each phase reveals the lazy connection between virtual addresses and resident pages.`,
      syntaxBreakdown: code`### In plain terms

The same 16 MiB anonymous pages are written twice. Process fault counters around each phase show that the first access establishes page backing while the warmed second access needs fewer such faults.

### What you are learning

- Minor and major fault counters are process evidence, not direct latency measurements.
- Coordination files make two internal phases observable without a timing race.

### Piece by piece

- **/proc/PID/stat** fields **10** and **12** (process counters): field 10 is minor faults and field 12 major faults. awk extracts snapshots before and after each phase.
- **READY**, **PHASE1**, **DONE1**, **PHASE2**, and **DONE2** (marker files): the parent only triggers a phase after the helper reports readiness and waits for its completion marker.
- **region[offset]=value** in **range(..., 4096)** (page touch): writes one byte per assumed base page across 16 MiB; it is bounded and repeats the same offsets.
- **awk -v a=... -v b=...** (delta arithmetic): splits snapshots and subtracts the minor counter, so the evidence is a before/after relationship.
- **trap** and **wait** (exact cleanup): terminate and reap only the recorded helper on an early exit.`,
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
      challenge:
        "**Predict:** If the second phase writes a different byte to the same offsets, should it recreate the first phase’s minor-fault delta?\n\n**Inspect and explain:** Explain why a different byte value in the second phase does not require first-touch allocation again.\n\n**Vary:** Rerun the complete lesson, changing only the second-phase region[offset]=2 to region[offset]=3. Keep both gates and the same page range.\n\n**Hint:** Use the DONE markers before sampling /proc/PID/stat.\n\n**Apply:** State what additional evidence would be needed before blaming a service latency spike on major faults.",
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
      revision: 2,
      overview:
        code`Read an eight-MiB file through the page cache and ask the kernel which of its pages are resident before and after the reads. Compare direct per-file evidence with elapsed time and host-wide Cached counters. The experiment prepares clean file pages before requesting advisory eviction, but never assumes the request makes the first read cold.`,
      syntaxBreakdown: code`### In plain terms

This asks the kernel directly which pages of one eight-MiB file mapping are resident before and after reads. Timings and global Cached remain context only: the per-file mincore vector is the evidence, and an advisory cache hint is never proof of a cold device read.

### What you are learning

- File page residency is a per-mapping snapshot and can change after it is sampled.
- Global cache counters and read timings cannot attribute a cache state to one process or file.

### Piece by piece

- **os.fsync(fd)** completes pending writes for this file before the advisory discard request. Newly written dirty pages can otherwise remain cached because DONTNEED is not a writeback operation.
- **mmap.ACCESS_COPY** creates a private writable mapping so ctypes can obtain a buffer address; the probe does not write through it. **os.sysconf("SC_PAGESIZE")** gives the real page size, and the rounded-up vector length allocates one byte per page. **ctypes.c_void_p** and **ctypes.c_size_t** pass the address and byte length to mincore; a nonzero result raises the recorded errno.

- **dd ... count=8** (bounded file creator): creates exactly eight MiB under the lab. Writing may already populate cache, which is why the lesson does not infer a cold first read.
- **os.posix_fadvise(..., POSIX_FADV_DONTNEED)** (advisory hint): asks the kernel to discard cached file pages when practical. It is labelled requested, not guaranteed.
- **mmap.mmap** and **ctypes.CDLL(None).mincore** (mapped residency probe): create a private writable view without modifying it, obtain its page-aligned address, and ask mincore for one byte per page. Bit 0 means that mapped page is resident at that instant.
- **/usr/bin/time -f '%e'** (elapsed-time formatter): records seconds for each dd read. It is intentionally not used as cache-causality proof.
- **/proc/meminfo Cached** (global context): prints a host-wide counter that can move for unrelated work; compare it only as context.`,
      code: code`
(
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FILE=$LAB/cache-warm-$UID.bin
FIRST=$LAB/cache-first-$UID.time
SECOND=$LAB/cache-second-$UID.time
RESIDENCY=$LAB/cache-residency-$UID
trap 'rm -f "$FILE" "$FIRST" "$SECOND" "$RESIDENCY"' EXIT
dd if=/dev/zero of="$FILE" bs=1M count=8 status=none
size=$(stat -c %s "$FILE")
cached_before=$(awk '/^Cached:/{print $2}' /proc/meminfo)
export FILE RESIDENCY
python3 -c 'import ctypes, mmap, os
path=os.environ["FILE"]; size=os.path.getsize(path); page=os.sysconf("SC_PAGESIZE")
fd=os.open(path, os.O_RDONLY)
os.fsync(fd)
advisory="unavailable"
try:
    os.posix_fadvise(fd, 0, size, os.POSIX_FADV_DONTNEED); advisory="requested"
except (AttributeError, OSError): pass
view=mmap.mmap(fd, size, access=mmap.ACCESS_COPY)
vec=(ctypes.c_ubyte*((size+page-1)//page))()
libc=ctypes.CDLL(None, use_errno=True); address=ctypes.addressof(ctypes.c_char.from_buffer(view))
if libc.mincore(ctypes.c_void_p(address), ctypes.c_size_t(size), vec) != 0: raise OSError(ctypes.get_errno(), "mincore")
before=sum(v & 1 for v in vec)
view.close(); os.close(fd)
open(os.environ["RESIDENCY"], "w").write("advisory_drop=%s\nresident_pages_before=%s\npage_count=%s\n" % (advisory, before, len(vec)))' || exit 1
/usr/bin/time -f '%e' -o "$FIRST" dd if="$FILE" of=/dev/null bs=1M status=none
cached_after_first=$(awk '/^Cached:/{print $2}' /proc/meminfo)
/usr/bin/time -f '%e' -o "$SECOND" dd if="$FILE" of=/dev/null bs=1M status=none
cached_after_second=$(awk '/^Cached:/{print $2}' /proc/meminfo)
python3 -c 'import ctypes, mmap, os
path=os.environ["FILE"]; size=os.path.getsize(path); page=os.sysconf("SC_PAGESIZE"); fd=os.open(path, os.O_RDONLY); view=mmap.mmap(fd, size, access=mmap.ACCESS_COPY); vec=(ctypes.c_ubyte*((size+page-1)//page))(); libc=ctypes.CDLL(None, use_errno=True); address=ctypes.addressof(ctypes.c_char.from_buffer(view));
if libc.mincore(ctypes.c_void_p(address), ctypes.c_size_t(size), vec) != 0: raise OSError(ctypes.get_errno(), "mincore")
after=sum(v & 1 for v in vec); view.close(); os.close(fd); open(os.environ["RESIDENCY"], "a").write("resident_pages_after=%s\n" % after)' || exit 1
page_count=$(awk -F= '$1=="page_count"{print $2}' "$RESIDENCY")
resident_before=$(awk -F= '$1=="resident_pages_before"{print $2}' "$RESIDENCY")
resident_after=$(awk -F= '$1=="resident_pages_after"{print $2}' "$RESIDENCY")
printf 'file_bytes=%s\n' "$size"
cat "$RESIDENCY"
printf 'cached_kb_before=%s\n' "$cached_before"
printf 'cached_kb_after_first=%s\n' "$cached_after_first"
printf 'cached_kb_after_second=%s\n' "$cached_after_second"
printf 'first_elapsed_s=%s\n' "$(cat "$FIRST")"
printf 'second_elapsed_s=%s\n' "$(cat "$SECOND")"
if [ "$size" -eq 8388608 ] && [ "$resident_before" -ge 0 ] && [ "$resident_before" -le "$page_count" ] && [ "$resident_after" -ge 0 ] && [ "$resident_after" -le "$page_count" ] && [ -s "$FIRST" ] && [ -s "$SECOND" ]; then
  printf 'file_residency=measured-snapshots\n'
else
  printf 'file_residency=unexpected\n'
  exit 1
fi
rm -f "$FILE" "$FIRST" "$SECOND" "$RESIDENCY"
trap - EXIT
printf 'cleanup=done\n'
)
`,
      expectedResult:
        code`file_bytes=8388608 and page_count=2048 on a host with 4 KiB pages. advisory_drop=requested means the hint was issued, not that eviction was guaranteed; unavailable labels an unsupported hint. Both resident-page snapshots are between zero and page_count, and file_residency=measured-snapshots follows those checks and the two completed reads. A quiet lab commonly shows zero resident pages before and all pages afterward. Pages may remain cached before the first read or be reclaimed between measurements; timings and global Cached are context, not cold-device-read proof.`,
      systemsLens:
        code`The page cache is a file-page residency layer whose state must be measured at the right scope. Per-file residency is stronger evidence than a global counter or timing, but it remains a snapshot; production diagnosis also needs workload and device evidence.`,
      challenge:
        "**Predict:** After a second bounded read, can resident_pages_after be lower than resident_pages_before on an active host?\n\n**Inspect and explain:** Compare page_count and the two resident-page snapshots. Explain why neither advisory discard nor elapsed time proves a cold device read.\n\n**Vary:** Rerun the complete lesson, changing the file creation count=8 to count=1 and its byte-size assertion -eq 8388608 to -eq 1048576. Keep both residency probes and both reads; the page count is derived automatically.\n\n**Hint:** Use the system page size to derive the vector length; do not assume all hosts use 4 KiB pages.\n\n**Apply:** Decide what evidence, beyond per-file residency, is needed to attribute a slow service read to storage.",
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
      revision: 3,
      overview:
        code`Create one uniquely named child cgroup with a 96 MiB memory ceiling, move a helper into it, and grow only 64 MiB of anonymous memory. Reading memory.current, memory.events, and vmstat makes accounting and reclaim feedback visible while the host remains outside the budget.`,
      syntaxBreakdown: code`### In plain terms

This puts only one 64 MiB helper in a fresh child cgroup with a 96 MiB maximum and a 48 MiB high threshold. It reads scoped usage and event counters to show throttling/reclaim feedback while recording an unavailable branch when delegation is absent.

### What you are learning

- memory.high is a pressure threshold; memory.max is a hard cgroup ceiling.
- Cgroup counters are scoped evidence, while vmstat remains host-wide context.

### Piece by piece

- **findmnt -t cgroup2 -o TARGET** (controller locator): selects the cgroup v2 mount; failure or an unwritable root is reported as unavailable before any group exists.
- **as_root** and **cg_write** (privileged helpers): sudo **-n** avoids prompts; cg_write sends one exact value through root-owned **tee**. The helper never broadens the target path.
- **memory.max**, **memory.high**, **memory.swap.max**, and **cgroup.procs** (cgroup files): set hard, high, and swap boundaries then move only child_pid. The values are bytes.
- **memory.current**, **memory.events**, and **vmstat 1 2** (evidence): current is scoped usage, events supplies high and oom counts, and the final vmstat sample is host context only.
- **cgroup.kill**, **rmdir**, and the trap (cleanup): target only the created child group after the recorded helper is reaped.`,
      code: code`
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
`,
      expectedResult:
        code`A dedicated cgroup is created when the VM permits it; memory_max=100663296, memory_current is below that value, memory_high_after is greater than memory_high_before, oom_events=0, bounded_reclaim_observation=high-event-within-max, a vmstat sample is printed, and cleanup=cgroup-removed. If cgroup delegation is unavailable the bounded code prints cgroup_setup=unavailable and changes nothing.`,
      systemsLens:
        code`Memory pressure is feedback from a hierarchy: usage, reclaim, and event counters are scoped to a resource domain. Cgroups let an operator distinguish one workload's budget from the host's unrelated memory consumers.`,
      caution:
        code`Run only on the disposable VM. The trap removes this exact child cgroup and kills only the helper PID; never run this lesson after manually placing another process in the named cgroup.`,
      challenge:
        "**Predict:** If memory.high is lowered while memory.max and allocation stay fixed, which event counter can record stronger pressure feedback?\n\n**Inspect and explain:** Use the high event delta and memory.max to distinguish pressure feedback from OOM containment.\n\n**Vary:** Rerun the complete disposable-cgroup lesson, changing only the memory.high write from 50331648 to 41943040 (48 to 40 MiB). Keep the 64 MiB allocation and 96 MiB maximum. Compare high events without requiring a fixed count.\n\n**Hint:** Treat cgroup_setup=unavailable as an untested mechanism, not success.\n\n**Apply:** Choose a high threshold and hard max for a service, naming the scoped event and useful service signal you would review.",
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
      revision: 3,
      overview:
        code`Give one uniquely named child cgroup a 64 MiB memory ceiling and let an exact helper attempt a bounded 128 MiB allocation. The helper may be killed by the cgroup OOM policy, while the parent remains alive to read the group's oom_kill counter and prove failure was localized.`,
      syntaxBreakdown: code`### In plain terms

One helper attempts 128 MiB inside a new cgroup capped at 64 MiB, while its parent stays outside to observe the result. A changed **oom_kill** counter and a living parent establish the intended local failure boundary; lack of cgroup delegation is reported as untested.

### What you are learning

- memory.max bounds a cgroup and may trigger a local OOM kill when allocation cannot proceed.
- A counter plus a surviving outside supervisor is stronger evidence than a signal status alone.

### Piece by piece

- **memory.max** and **memory.swap.max** (cgroup limits): write byte limits only to the fresh child cgroup; zero swap avoids moving this small test to swap.
- **cgroup.procs** (membership file): receives the exact child PID after READY, so the parent never joins the constrained group.
- **bytearray(128*1024*1024)** and page writes (bounded demand): asks for twice the max and touches pages; RESULT exists only if allocation completed unexpectedly.
- **wait**, **memory.events oom_kill**, and **child_status** (failure evidence): wait reports child termination, events counts the cgroup OOM kill, and parent_alive confirms the observer remained outside.
- **cgroup.kill**, **rmdir**, and trap (cleanup): remove only the exact test group and files.`,
      code: code`
(
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo -n "$@"; fi; }
cg_write() { printf '%s' "$2" | as_root tee "$1" >/dev/null; }
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
  test -f "$CG/cgroup.kill" && cg_write "$CG/cgroup.kill" 1 2>/dev/null || true
  test -d "$CG" && as_root rmdir "$CG" 2>/dev/null || true
  rm -f "$RESULT" "$READY" "$GO"
}
trap cleanup_oom EXIT
mountpoint=$(findmnt -t cgroup2 -n -o TARGET 2>/dev/null)
if [ -z "$mountpoint" ] || ! as_root test -w "$mountpoint"; then printf 'cgroup_setup=unavailable\n'; exit 0; fi
CG=$mountpoint/linux-tutor-$UID-$BASHPID-$RANDOM
if ! as_root mkdir "$CG" 2>/dev/null; then printf 'cgroup_setup=unavailable\n'; exit 0; fi
cg_write "$CG/memory.max" 67108864
cg_write "$CG/memory.swap.max" 0 2>/dev/null || true
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
if ! cg_write "$CG/cgroup.procs" "$child_pid" 2>/dev/null; then printf 'cgroup_move=unavailable\n'; exit 0; fi
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
      challenge:
        "**Predict:** Would a 96 MiB allocation fit inside a 64 MiB maximum, even though it is smaller than the original attempt?\n\n**Inspect and explain:** Join the OOM event increment, child wait status and surviving parent; a signal status alone is insufficient.\n\n**Vary:** Rerun the complete disposable-cgroup lesson, changing bytearray(128*1024*1024) to bytearray(96*1024*1024). It still exceeds the 64 MiB maximum; retain the OOM event assertion and outside supervisor.\n\n**Hint:** Never reuse a cgroup that might contain another process.\n\n**Apply:** State why a supervisor needs both cgroup OOM evidence and a request-level recovery check before declaring containment successful.",
    },
  ],
};
