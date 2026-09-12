# Warm a bounded file through the page cache

slug: warm-the-page-cache
category: virtual-memory
difficulty: intermediate
tags: page-cache, virtual-memory, storage
prerequisites: observe-page-faults
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 10
revision: 2

## Overview
Read an eight-MiB file through the page cache and ask the kernel which of its pages are resident before and after the reads. Compare direct per-file evidence with elapsed time and host-wide Cached counters. The experiment prepares clean file pages before requesting advisory eviction, but never assumes the request makes the first read cold.

## Syntax breakdown
### In plain terms

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
- **/proc/meminfo Cached** (global context): prints a host-wide counter that can move for unrelated work; compare it only as context.

## Run
```sh
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
```

## Expected result
file_bytes=8388608 and page_count=2048 on a host with 4 KiB pages. advisory_drop=requested means the hint was issued, not that eviction was guaranteed; unavailable labels an unsupported hint. Both resident-page snapshots are between zero and page_count, and file_residency=measured-snapshots follows those checks and the two completed reads. A quiet lab commonly shows zero resident pages before and all pages afterward. Pages may remain cached before the first read or be reclaimed between measurements; timings and global Cached are context, not cold-device-read proof.

## Systems lens
The page cache is a file-page residency layer whose state must be measured at the right scope. Per-file residency is stronger evidence than a global counter or timing, but it remains a snapshot; production diagnosis also needs workload and device evidence.

## Optional variation
**Predict:** After a second bounded read, can resident_pages_after be lower than resident_pages_before on an active host?

**Inspect and explain:** Compare page_count and the two resident-page snapshots. Explain why neither advisory discard nor elapsed time proves a cold device read.

**Vary:** Rerun the complete lesson, changing the file creation count=8 to count=1 and its byte-size assertion -eq 8388608 to -eq 1048576. Keep both residency probes and both reads; the page count is derived automatically.

**Hint:** Use the system page size to derive the vector length; do not assume all hosts use 4 KiB pages.

**Apply:** Decide what evidence, beyond per-file residency, is needed to attribute a slow service read to storage.
