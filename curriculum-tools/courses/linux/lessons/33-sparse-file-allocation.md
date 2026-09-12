# Separate logical size from physical allocation

slug: sparse-file-allocation
category: mounts-and-storage-paths
difficulty: beginner
tags: storage, filesystem
prerequisites: map-mounts-and-devices
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Create two files with the same 32-megabyte logical size: one by seeking over a hole and one by writing every byte. stat and du reveal that logical offsets and allocated blocks are different measurements.

## Syntax breakdown
### In plain terms

Two files advertise the same logical length, but only one writes each byte. This makes sparse-file reservation visible: offsets can exist without consuming an equal number of filesystem blocks.

### What you are learning

- Logical file length and allocated blocks are separate metadata values.
- A sparse hole reads as zeros but need not consume a physical block.

### Piece by piece

- **truncate -s 33554432** (length setter and size flag): **-s** sets a 32 MiB logical length without writing each byte. It creates the sparse candidate.
- **dd if=/dev/zero of=FILE bs=1048576 count=32 status=none** (allocated writer): writes 32 one-MiB zero blocks, making the control file consume blocks.
- **stat -c %s** and **stat -c %b** (metadata formats): **%s** is logical bytes and **%b** is allocated 512-byte blocks. The equal size but unequal block fields are the evidence.
- **du --apparent-size -B1** (logical usage reader): **--apparent-size** uses file length and **-B1** prints bytes, confirming both advertised sizes match.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
SPARSE=$LAB/sparse-$UID.bin
ALLOCATED=$LAB/allocated-$UID.bin
trap 'rm -f "$SPARSE" "$ALLOCATED"' EXIT
truncate -s 33554432 "$SPARSE"
dd if=/dev/zero of="$ALLOCATED" bs=1048576 count=32 status=none
sparse_size=$(stat -c %s "$SPARSE")
allocated_size=$(stat -c %s "$ALLOCATED")
sparse_blocks=$(stat -c %b "$SPARSE")
allocated_blocks=$(stat -c %b "$ALLOCATED")
sparse_apparent=$(du --apparent-size -B1 "$SPARSE" | awk '{print $1}')
allocated_apparent=$(du --apparent-size -B1 "$ALLOCATED" | awk '{print $1}')
printf 'logical_sizes=%s,%s\n' "$sparse_size" "$allocated_size"
printf 'allocated_blocks=%s,%s\n' "$sparse_blocks" "$allocated_blocks"
printf 'apparent_sizes=%s,%s\n' "$sparse_apparent" "$allocated_apparent"
if [ "$sparse_size" -eq 33554432 ] && [ "$allocated_size" -eq 33554432 ] && [ "$sparse_blocks" -lt "$allocated_blocks" ] && [ "$sparse_apparent" -eq "$allocated_apparent" ]; then printf 'sparse_allocation=observed\n'; else printf 'sparse_allocation=unexpected\n'; fi
rm -f "$SPARSE" "$ALLOCATED"
trap - EXIT
```

## Expected result
logical_sizes=33554432,33554432 and apparent_sizes=33554432,33554432, while allocated_blocks has a smaller sparse value first; sparse_allocation=observed. Filesystem block accounting and minimum allocation units may vary, but the sparse file uses fewer blocks.

## Systems lens
A file's logical address space can contain holes that have no physical blocks. VM images, database files, and checkpoint formats exploit this distinction to reserve offsets without immediately consuming storage.

## Optional variation
Write exactly one byte at the final offset of a sparse4MiB file:

```bash
LAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"; f="$LAB/sparse-vary-$UID"; truncate -s 4194304 "$f"; printf x | dd of="$f" bs=1 seek=4194303 conv=notrunc status=none; stat -c '%s %b' "$f"; rm -f "$f"
```

Logical size remains4,194,304 bytes. Multiply the reported block count by512 to compare allocated
bytes with that length: the final write allocates storage while the preceding hole needs much
less than a full4MiB allocation on this filesystem. conv=notrunc keeps dd from shortening the
file, and the example removes it afterward. Apparent size alone therefore does not measure a
deployment's disk consumption.
