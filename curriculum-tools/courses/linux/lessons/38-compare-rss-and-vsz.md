# Separate reserved virtual size from resident memory

slug: compare-rss-and-vsz
category: virtual-memory
difficulty: intermediate
tags: virtual-memory, procfs, page-cache
prerequisites: map-process-address-space
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Reserve a 128 MiB anonymous mapping but touch only 8 MiB of its pages. Comparing VmSize with VmRSS shows that address-space reservation and physical residency are different kernel accounting questions.

## Syntax breakdown
### In plain terms

The helper reserves 128 MiB but writes only an 8 MiB page-by-page prefix. VmSize and VmRSS answer different questions: addressable range versus pages resident now.

### What you are learning

- Anonymous mappings reserve virtual addresses before all pages need RAM.
- First writes fault pages in; VmRSS includes interpreter overhead as well as the controlled region.

### Piece by piece

- **mmap.mmap(-1, size)** (anonymous mapping): **-1** asks for anonymous backing and size reserves 128 MiB of address space.
- **memoryview** and **range(..., 4096)** (page toucher): writes one byte at every 4096-byte page in only the first 8 MiB, causing bounded demand allocation.
- **/proc/PID/status** and **awk** (kernel accounting): **VmSize** and **VmRSS** are kB fields selected by name. Compare the relationship, not an exact Python total.
- **READY**, **wait**, and **trap** (coordination and cleanup): ensure the map exists before reading it and protect the recorded child PID.

## Run
```sh
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
```

## Expected result
vsz_kb is greater than rss_kb and virtual_exceeds_resident=yes. The mapping is capped at 128 MiB and only an 8 MiB subset is intentionally touched; exact totals vary with the interpreter.

## Systems lens
VSZ measures the virtual ranges a process can address, while RSS measures pages currently resident in RAM. Reservations, demand paging, and copy-on-write let services have a large address space without consuming that amount of physical memory immediately.

## Optional variation
**Predict:** If the helper touches 16 MiB instead of 8 MiB, which counter should rise while VSZ remains broadly similar?

**Inspect and explain:** Compare the reserved virtual size and resident pages, without treating interpreter overhead as part of the requested buffer.

**Vary:** Rerun the complete lesson with touched=8*1024*1024 changed to touched=16*1024*1024. Keep the 128 MiB reservation and compare the resulting VSZ and RSS.

**Hint:** Read both fields before the helper exits.

**Apply:** Explain why a large VSZ alone is insufficient evidence for choosing a memory limit.
