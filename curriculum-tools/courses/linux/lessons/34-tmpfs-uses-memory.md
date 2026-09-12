# Observe a bounded tmpfs backed by memory

slug: tmpfs-uses-memory
category: mounts-and-storage-paths
difficulty: intermediate
tags: mounts, storage, filesystem
prerequisites: map-mounts-and-devices
safety: privileged
run-in: shell
sessions: 1
min-version: 5.1
minutes: 15
revision: 3

## Overview
On the dedicated disposable VM, mount a uniquely named 32-megabyte tmpfs below the lab and write eight megabytes into it. findmnt identifies the memory-backed filesystem while df measures its quota; free provides a noisy host-memory observation.

## Syntax breakdown
### In plain terms

This mounts one small tmpfs only below the lab, writes eight MiB, then removes the mount. The mount record and its capacity prove the filesystem boundary; the host-wide memory number is context and cannot attribute those bytes to this process.

### What you are learning

- tmpfs provides file semantics backed by memory with a mount-specific size limit.
- Privileged experiments need exact object names, cleanup, and honest unavailable branches.

### Piece by piece

- **as_root** (shell helper): runs directly as UID 0 or uses **sudo -n**, whose **-n** forbids an interactive password prompt. It confines privileged commands to explicit arguments.
- **mount -t tmpfs -o size=32m SOURCE MOUNT** (mount command and flags): **-t** selects tmpfs and **-o size=32m** sets its quota. The outer subshell prevents a mount failure from altering the persistent learner shell.
- **dd ... count=8** and **df -B1 -P** (bounded write and accounting): write eight MiB then show the tmpfs byte capacity and used blocks.
- **findmnt -T**, **free -b**, and **umount** (mount evidence, noisy context, cleanup): findmnt identifies tmpfs, free reports global memory context, and umount releases this exact mount.

## Caution
Run only on the dedicated disposable VM with passwordless sudo. The trap unmounts this exact mount and never touches another mount.

## Run
```sh
(
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo -n "$@"; fi; }
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
MOUNT=$LAB/tmpfs-$UID
FILE=$MOUNT/payload.bin
mkdir -p "$MOUNT"
mounted=no
trap 'if [ "$mounted" = yes ]; then as_root umount "$MOUNT" 2>/dev/null || true; fi; rm -f "$FILE"; rmdir "$MOUNT" 2>/dev/null || true' EXIT
if ! as_root mount -t tmpfs -o size=32m "linux-tutor-$UID-tmpfs" "$MOUNT"; then
  printf 'mount_status=unavailable\n'
  exit 0
fi
mounted=yes
as_root dd if=/dev/zero of="$FILE" bs=1048576 count=8 status=none
record=$(findmnt -T "$FILE" -o TARGET,SOURCE,FSTYPE -n)
tmpfs_size=$(df -B1 -P "$MOUNT" | awk 'NR==2{print $2}')
tmpfs_used=$(df -B1 -P "$MOUNT" | awk 'NR==2{print $3}')
memory_available=$(free -b | awk '/^Mem:/{print $7}')
printf 'mount_status=mounted\n'
printf 'findmnt_record=%s\n' "$record"
printf 'tmpfs_size_bytes=%s\n' "$tmpfs_size"
printf 'tmpfs_used_bytes=%s\n' "$tmpfs_used"
printf 'memory_available_bytes=%s\n' "$memory_available"
if printf '%s' "$record" | grep -q 'tmpfs' && [ "$tmpfs_used" -ge 8388608 ] && [ "$tmpfs_size" -ge 33554432 ]; then printf 'tmpfs_memory_backed=yes\n'; else printf 'tmpfs_memory_backed=no\n'; fi
as_root umount "$MOUNT"
mounted=no
rm -f "$FILE"
rmdir "$MOUNT" 2>/dev/null || true
trap - EXIT
printf 'cleanup=unmounted\n'
)
```

## Expected result
On a VM with passwordless sudo, mount_status=mounted, findmnt_record names tmpfs, tmpfs_size_bytes is at least 33554432, tmpfs_used_bytes is at least 8388608, tmpfs_memory_backed=yes, and cleanup=unmounted. The memory_available value varies.

## Systems lens
tmpfs presents filesystem semantics while storing pages in memory and enforcing a filesystem quota. It is useful for scratch state, but its bytes compete with memory rather than a disk volume.

## Optional variation
**Predict:** If the mount limit is 16 MiB and the write is 1 MiB, which df field changes while the mount is live?

**Inspect and explain:** Compare tmpfs_size_bytes and tmpfs_used_bytes. Explain why the host memory_available_bytes sample is not an exact attribution measurement.

**Vary:** Rerun the complete lesson, replacing dd count=8 with count=4 and the used-byte lower bound -ge 8388608 with -ge 4194304. Keep the 32 MiB mount and its cleanup.

**Hint:** Reuse the as_root helper and an EXIT trap before mounting.

**Apply:** Decide whether tmpfs is suitable for a service’s scratch output and name the memory budget evidence you would require.
