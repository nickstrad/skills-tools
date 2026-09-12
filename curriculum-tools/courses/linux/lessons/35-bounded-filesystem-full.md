# Contain ENOSPC inside a small filesystem

slug: bounded-filesystem-full
category: mounts-and-storage-paths
difficulty: intermediate
tags: mounts, storage, filesystem
prerequisites: map-mounts-and-devices
safety: privileged
run-in: shell
sessions: 1
min-version: 5.1
minutes: 18
revision: 3

## Overview
On the disposable VM, format a uniquely named 32-megabyte image, loop-mount it below the lab, and write a bounded stream until the filesystem returns ENOSPC. The host remains available because the capacity boundary is the mounted image.

## Syntax breakdown
### In plain terms

This creates and fills a disposable 32 MiB ext4 image, so ENOSPC happens at a small known filesystem boundary. The host remains outside that boundary; a nonzero dd status plus the exact error text are the failure evidence.

### What you are learning

- ENOSPC is scoped to a filesystem, not automatically to the host.
- An expected nonzero command must be captured without leaking shell error policy.

### Piece by piece

- **truncate -s 33554432** and **mkfs.ext4 -q -F** (image creation and format flags): truncate fixes image length; **-q** reduces formatter output and **-F** permits formatting this regular-file image. Never substitute a real device.
- **mount -o loop IMAGE MOUNT** (loop mount): **-o loop** asks mount to attach the image through a loop device. as_root limits this privileged operation to the exact paths.
- **dd ... count=64 ... || fill_status=$?** (overfill and status capture): the 64 MiB request exceeds capacity; the OR branch records its expected nonzero exit without changing global errexit.
- **df -B1 -P**, **grep -qi**, and **umount** (accounting, error check, cleanup): read inner free bytes, check ENOSPC text case-insensitively, then detach only the created mount.

## Caution
This lesson formats and loop-mounts only the uniquely named lab image. Run it serially on the disposable VM; never substitute a real block device or mount point.

## Run
```sh
(
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo -n "$@"; fi; }
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
IMAGE=$LAB/full-image-$UID.img
MOUNT=$LAB/full-mount-$UID
ERROR=$LAB/full-error-$UID
mkdir -p "$MOUNT"
mounted=no
trap 'if [ "$mounted" = yes ]; then as_root umount "$MOUNT" 2>/dev/null || true; fi; rm -f "$IMAGE" "$ERROR"; rmdir "$MOUNT" 2>/dev/null || true' EXIT
rm -f "$IMAGE" "$ERROR"
truncate -s 33554432 "$IMAGE"
mkfs.ext4 -q -F "$IMAGE"
if ! as_root mount -o loop "$IMAGE" "$MOUNT"; then
  printf 'mount_status=unavailable\n'
  exit 0
fi
mounted=yes
fill_status=0
as_root dd if=/dev/zero of="$MOUNT/fill.bin" bs=1048576 count=64 status=none 2>"$ERROR" || fill_status=$?
inner_free=$(df -B1 -P "$MOUNT" | awk 'NR==2{print $4}')
printf 'mount_status=mounted\n'
printf 'fill_status=%s\n' "$fill_status"
printf 'inner_free_bytes=%s\n' "$inner_free"
printf 'enospc_text=%s\n' "$(grep -qi 'no space left on device' "$ERROR" && echo present || echo absent)"
if [ "$fill_status" -ne 0 ] && grep -qi 'no space left on device' "$ERROR" && [ "$inner_free" -lt 1048576 ]; then printf 'bounded_enospc=observed\n'; else printf 'bounded_enospc=unexpected\n'; fi
as_root umount "$MOUNT"
mounted=no
rm -f "$IMAGE" "$ERROR"
rmdir "$MOUNT" 2>/dev/null || true
trap - EXIT
printf 'cleanup=image-and-mount-removed\n'
)
```

## Expected result
On the disposable VM, mount_status=mounted, fill_status is nonzero, enospc_text=present, inner_free_bytes is below one MiB, bounded_enospc=observed, and cleanup=image-and-mount-removed. The exact free count depends on ext4 metadata and reserved blocks.

## Systems lens
ENOSPC is a failure at a particular filesystem boundary, not necessarily a host-wide disk failure. Volume quotas and container layers use the same containment idea to localize capacity incidents.

## Optional variation
Rerun the complete lesson, changing only the bounded dd attempt from count=64 to count=48.
Keep the image and mount paths under $LAB and retain the same cleanup trap and exact unmount.

The48MiB request still exceeds the32MiB image. Inspect the nonzero fill_status, enospc_text=present
and inner_free_bytes below one MiB before cleanup. These observations locate the failure inside
the mounted image. An application ENOSPC likewise needs its pathname-to-filesystem mapping and
that filesystem's capacity evidence before it can be attributed to a host volume.
