# Map a process address space to virtual regions

slug: map-process-address-space
category: virtual-memory
difficulty: intermediate
tags: virtual-memory, procfs, processes
prerequisites: threads-under-task
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 14
revision: 2

## Overview
Start a bounded helper that maps one lab file and one anonymous region, then inspect its live mapping table. Matching the file path in pmap and /proc/PID/maps turns an abstract address space into named virtual regions without changing the host filesystem.

## Syntax breakdown
### In plain terms

One helper maps both a lab file and anonymous memory, then stays alive for inspection. The experiment turns an address space into named virtual regions without assuming that every virtual byte is resident.

### What you are learning

- Virtual mappings have backing and permissions independent of their addresses.
- Procfs and pmap give complementary process-local evidence.

### Piece by piece

- **truncate -s 4096** (length setter): makes the one-page file the helper can map without allocating a larger workload.
- **python3 -c mmap.mmap** (mapping helper): **os.open** obtains a read descriptor, **mmap** maps the file, and **mmap(-1, 1048576)** reserves anonymous memory. READY is created only after both mappings exist.
- **grep -F FILE /proc/PID/maps** (procfs evidence): **-F** matches the literal pathname and counts the file-backed mapping lines.
- **pmap -x PID** and **awk** (map summary and selector): **-x** includes extended size and RSS columns; awk counts anonymous read/write regions. The values identify regions, not a global memory total.
- **wait** and **trap** (lifetime control): inspect the exact child while alive, then reap it and remove only its lab files.

## Run
```sh
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
```

## Expected result
proc_file_mapping_lines is at least 1, pmap_anonymous_rw_regions is at least 1, address_space_regions=observed, and cleanup=done. Addresses, region counts, and the child PID vary by Python and kernel version.

## Systems lens
A process address space is a set of virtual ranges with independent permissions and backing: file pages, anonymous pages, shared libraries, and stacks. The same map-to-backing distinction explains copy-on-write, shared memory, and executable loading.

## Optional variation
Rerun the complete lesson, changing only anon_map=mmap.mmap(-1, 1048576) to
anon_map=mmap.mmap(-1, 2*1048576). Keep the original mapping observations and exact-PID cleanup.
Use the new helper's recorded PID and inspect it before exit, when its procfs entries disappear.

The file-backed mapping remains present alongside anonymous regions; doubling the anonymous
reservation does not remove that file mapping. The counters identify regions, not the new
mapping's resident byte count. The pathname in /proc/PID/maps supplies direct file-mapping
evidence, while pmap provides a broader size and residency summary.
