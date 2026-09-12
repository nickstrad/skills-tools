# Recover image space only after the last holder closes

slug: recover-filesystem-space
category: mounts-and-storage-paths
difficulty: advanced
tags: mounts, storage, file-descriptors
prerequisites: compare-df-and-du, bounded-filesystem-full
safety: privileged
run-in: shell
sessions: 1
min-version: 5.1
minutes: 18
revision: 3

## Overview
Create a fresh bounded ext4 image, hold a 12-megabyte file open, unlink its only name, and compare inner free space before and after the holder exits. The image recovers blocks only when the final open reference is released.

## Syntax breakdown
### In plain terms

This repeats the hidden-space mechanism inside a disposable image so the recovery decision has a tight capacity boundary. Removing the name does not recover its blocks until the child’s recorded descriptor closes.

### What you are learning

- Filesystem free space follows object lifetime, not just pathname lifetime.
- A holder PID and df readings let an operator prove when recovery actually occurred.

### Piece by piece

- **truncate**, **mkfs.ext4 -q -F**, and **mount -o loop** (private filesystem setup): build and attach only the named lab image under the subshell cleanup boundary.
- **dd ... count=12** and **df -B1 -P** (bounded allocation and byte accounting): allocate 12 MiB then sample free bytes before and after unlink.
- **bash -c 'exec 9<...'** and **READY** (exact holder coordination): the child opens descriptor 9 and creates READY only after it holds the file.
- **rm**, **wait**, and **umount** (unlink, final close, teardown): unlink removes the name, wait releases the known holder, and umount detaches the exact image. A free-byte increase after wait is the recovery evidence.

## Caution
This is serial, privileged work on a disposable VM. The trap targets only the holder PID, loop mount, image, and lab directory created by this lesson.

## Run
```sh
(
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo -n "$@"; fi; }
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
IMAGE=$LAB/recover-image-$UID.img
MOUNT=$LAB/recover-mount-$UID
READY=$LAB/recover-ready-$UID
mkdir -p "$MOUNT"
mounted=no
holder_pid=
trap 'test -n "$holder_pid" && kill "$holder_pid" 2>/dev/null || true; test -n "$holder_pid" && wait "$holder_pid" 2>/dev/null || true; if [ "$mounted" = yes ]; then as_root umount "$MOUNT" 2>/dev/null || true; fi; rm -f "$IMAGE" "$READY"; rmdir "$MOUNT" 2>/dev/null || true' EXIT
rm -f "$IMAGE" "$READY"
truncate -s 33554432 "$IMAGE"
mkfs.ext4 -q -F "$IMAGE"
if ! as_root mount -o loop "$IMAGE" "$MOUNT"; then
  printf 'mount_status=unavailable\n'
  exit 0
fi
mounted=yes
as_root dd if=/dev/zero of="$MOUNT/held.bin" bs=1048576 count=12 status=none
free_before=$(df -B1 -P "$MOUNT" | awk 'NR==2{print $4}')
holder_pid=
export READY
bash -c 'exec 9<"$1/held.bin"; : > "$READY"; sleep 2' bash "$MOUNT" &
holder_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$READY" ] && break
  sleep 0.05
done
as_root rm "$MOUNT/held.bin"
free_after_unlink=$(df -B1 -P "$MOUNT" | awk 'NR==2{print $4}')
printf 'mount_status=mounted\n'
printf 'free_before=%s\n' "$free_before"
printf 'free_after_unlink=%s\n' "$free_after_unlink"
printf 'name_exists_after_unlink=%s\n' "$(test -e "$MOUNT/held.bin" && echo yes || echo no)"
wait "$holder_pid"
holder_pid=
free_after_close=$(df -B1 -P "$MOUNT" | awk 'NR==2{print $4}')
printf 'free_after_close=%s\n' "$free_after_close"
if [ ! -e "$MOUNT/held.bin" ] && [ "$free_after_close" -gt "$free_after_unlink" ]; then printf 'space_recovery=after-final-close\n'; else printf 'space_recovery=unexpected\n'; fi
as_root umount "$MOUNT"
mounted=no
rm -f "$IMAGE" "$READY"
rmdir "$MOUNT" 2>/dev/null || true
trap - EXIT
printf 'cleanup=image-and-mount-removed\n'
)
```

## Expected result
On the disposable VM, mount_status=mounted, name_exists_after_unlink=no, free_after_close is greater than free_after_unlink, space_recovery=after-final-close, and cleanup=image-and-mount-removed. Exact free-byte values vary with ext4 metadata.

## Systems lens
Reclamation follows references, not names: deleting the last directory entry is insufficient while an open description remains. The same delayed recovery appears in rotated logs, temporary files, and storage snapshots.

## Optional variation
Rerun the complete lesson, changing only count=12 to count=8. Keep the exact-PID wait and
exact-mount cleanup. Compare free_after_unlink with free_after_close inside the same bounded image.

The held payload is now8MiB, but the release boundary is unchanged: removing the name leaves
the open reference, and final close permits recovery. free_after_close should exceed
free_after_unlink and space_recovery remains after-final-close. Confirming both the owner's exit
and recovered capacity provides stronger recovery evidence than a restart request alone.
