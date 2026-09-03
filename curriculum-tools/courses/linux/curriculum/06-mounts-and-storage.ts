import { code, type Module } from "../../../src/types.ts";

export const MOUNTS: Module = {
  category: "mounts-and-storage-paths",
  title: "Relate pathname mounts to allocation and reclamation",
  lessons: [
    {
      slug: "map-mounts-and-devices",
      title: "Map a pathname to its mount and storage source",
      difficulty: "beginner",
      tags: ["mounts", "storage", "filesystem"],
      prerequisites: ["paths-and-inodes"],
      safetyLevel: "read-only",
      runIn: "shell",
      estimatedMinutes: 10,
      overview:
        code`Place one observation file below the learner-owned lab and ask findmnt which mounted filesystem receives its path. Correlate that mount with df and an lsblk inventory without assuming a particular device name or container storage driver.`,
      syntaxBreakdown:
        code`findmnt -T resolves the mount containing a path; df -P reports filesystem capacity; lsblk lists block-device topology; awk selects labeled fields; readlink -f canonicalizes the observed path.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FILE=$LAB/mount-map-$UID.txt
printf 'mount-observation\n' > "$FILE"
mount_record=$(findmnt -T "$FILE" -o TARGET,SOURCE,FSTYPE -n)
mount_target=$(printf '%s\n' "$mount_record" | awk '{print $1}')
mount_source=$(printf '%s\n' "$mount_record" | awk '{print $2}')
mount_type=$(printf '%s\n' "$mount_record" | awk '{print $3}')
df_device=$(df -P "$FILE" | awk 'NR==2{print $1}')
df_mount=$(df -P "$FILE" | awk 'NR==2{print $6}')
block_devices=$(lsblk -o NAME,TYPE -n 2>/dev/null | head -3 | tr '\n' ';')
printf 'path=%s\n' "$(readlink -f "$FILE")"
printf 'findmnt_target=%s\n' "$mount_target"
printf 'findmnt_source=%s\n' "$mount_source"
printf 'findmnt_fstype=%s\n' "$mount_type"
printf 'df_device=%s\n' "$df_device"
printf 'df_mountpoint=%s\n' "$df_mount"
printf 'lsblk_sample=%s\n' "$block_devices"
if [ -n "$mount_target" ] && [ -n "$mount_source" ] && [ -n "$mount_type" ] && [ -n "$df_device" ]; then printf 'mount_mapping=observed\n'; else printf 'mount_mapping=unexpected\n'; fi
rm -f "$FILE"
`,
      expectedResult:
        code`findmnt_target, findmnt_source, findmnt_fstype, df_device, and df_mountpoint are nonempty labels for the lab file; lsblk_sample may vary or be empty on a storage-driver-backed VM; mount_mapping=observed.`,
      systemsLens:
        code`Path lookup crosses a mount graph before reaching an inode, while df reports the capacity boundary selected by that graph. lsblk adds physical topology when the source is a block device; containers may expose a virtual source instead.`,
    },
    {
      slug: "compare-df-and-du",
      title: "Contrast named usage with allocated filesystem space",
      difficulty: "intermediate",
      tags: ["storage", "filesystem", "file-descriptors"],
      prerequisites: ["deleted-open-file", "map-mounts-and-devices"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 16,
      overview:
        code`Allocate a bounded 16-megabyte file, hold it open in a child, and unlink its name. du can no longer find the file, but df still counts its blocks until the child closes the descriptor.`,
      syntaxBreakdown:
        code`dd writes fixed blocks; df -B1 reports free bytes for the filesystem; du -B1 reports reachable named data; readlink shows the deleted descriptor; wait joins the holder.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FILE=$LAB/df-du-$UID.bin
READY=$LAB/df-du-ready-$UID
rm -f "$FILE" "$READY"
dd if=/dev/zero of="$FILE" bs=1048576 count=16 status=none
free_before=$(df -B1 -P "$LAB" | awk 'NR==2{print $4}')
named_before=$(du -B1 -s "$LAB" | awk '{print $1}')
holder_pid=
trap 'test -n "$holder_pid" && kill "$holder_pid" 2>/dev/null || true; test -n "$holder_pid" && wait "$holder_pid" 2>/dev/null || true; rm -f "$FILE" "$READY"' EXIT
export FILE READY
bash -c 'exec 9<"$FILE"; : > "$READY"; sleep 2' &
holder_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$READY" ] && break
  sleep 0.05
done
rm "$FILE"
free_after_unlink=$(df -B1 -P "$LAB" | awk 'NR==2{print $4}')
named_after=$(du -B1 -s "$LAB" | awk '{print $1}')
fd_link=$(readlink "/proc/$holder_pid/fd/9")
printf 'named_before_bytes=%s\n' "$named_before"
printf 'named_after_unlink_bytes=%s\n' "$named_after"
printf 'free_before=%s free_after_unlink=%s\n' "$free_before" "$free_after_unlink"
printf 'open_fd_deleted=%s\n' "$(printf '%s' "$fd_link" | grep -q '(deleted)' && echo yes || echo no)"
if [ "$named_after" -lt "$named_before" ] && [ "$free_after_unlink" -le "$free_before" ] && printf '%s' "$fd_link" | grep -q '(deleted)'; then printf 'df_du_diverge=observed\n'; else printf 'df_du_diverge=unexpected\n'; fi
wait "$holder_pid"
holder_pid=
free_after_close=$(df -B1 -P "$LAB" | awk 'NR==2{print $4}')
printf 'free_after_close=%s\n' "$free_after_close"
if [ "$free_after_close" -gt "$free_after_unlink" ]; then printf 'space_recovered_after_close=yes\n'; else printf 'space_recovered_after_close=no\n'; fi
rm -f "$FILE" "$READY"
trap - EXIT
`,
      expectedResult:
        code`named_after_unlink_bytes is lower than named_before_bytes, free_after_unlink is no greater than free_before, open_fd_deleted=yes, df_du_diverge=observed, and free_after_close is greater than free_after_unlink with space_recovered_after_close=yes. Exact df values vary with filesystem metadata.`,
      systemsLens:
        code`du answers how much data is reachable through names; df answers how many blocks the filesystem has free. An unlinked open file sits in the gap, a common cause of disk-full incidents.`,
    },
    {
      slug: "sparse-file-allocation",
      title: "Separate logical size from physical allocation",
      difficulty: "beginner",
      tags: ["storage", "filesystem"],
      prerequisites: ["map-mounts-and-devices"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      overview:
        code`Create two files with the same 32-megabyte logical size: one by seeking over a hole and one by writing every byte. stat and du reveal that logical offsets and allocated blocks are different measurements.`,
      syntaxBreakdown:
        code`truncate sets logical length without allocating every block; dd writes real zero blocks; stat -c %s and %b report bytes and 512-byte blocks; du --apparent-size reports logical size.`,
      code: code`
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
`,
      expectedResult:
        code`logical_sizes=33554432,33554432 and apparent_sizes=33554432,33554432, while allocated_blocks has a smaller sparse value first; sparse_allocation=observed. Filesystem block accounting and minimum allocation units may vary, but the sparse file uses fewer blocks.`,
      systemsLens:
        code`A file's logical address space can contain holes that have no physical blocks. VM images, database files, and checkpoint formats exploit this distinction to reserve offsets without immediately consuming storage.`,
    },
    {
      slug: "tmpfs-uses-memory",
      title: "Observe a bounded tmpfs backed by memory",
      difficulty: "intermediate",
      tags: ["mounts", "storage", "filesystem"],
      prerequisites: ["map-mounts-and-devices"],
      safetyLevel: "privileged",
      runIn: "shell",
      estimatedMinutes: 15,
      overview:
        code`On the dedicated disposable VM, mount a uniquely named 32-megabyte tmpfs below the lab and write eight megabytes into it. findmnt identifies the memory-backed filesystem while df measures its quota; free provides a noisy host-memory observation.`,
      syntaxBreakdown:
        code`sudo -n mount -t tmpfs creates a bounded memory-backed mount without prompting; findmnt -T resolves it; df -B1 reports the tmpfs capacity; sudo -n umount releases the exact mount.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
MOUNT=$LAB/tmpfs-$UID
FILE=$MOUNT/payload.bin
mkdir -p "$MOUNT"
mounted=no
trap 'if [ "$mounted" = yes ]; then sudo -n umount "$MOUNT" 2>/dev/null || true; fi; rm -f "$FILE"; rmdir "$MOUNT" 2>/dev/null || true' EXIT
if ! sudo -n mount -t tmpfs -o size=32m "linux-tutor-$UID-tmpfs" "$MOUNT"; then
  printf 'mount_status=unavailable\n'
  exit 1
fi
mounted=yes
sudo -n dd if=/dev/zero of="$FILE" bs=1048576 count=8 status=none
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
sudo -n umount "$MOUNT"
mounted=no
rm -f "$FILE"
rmdir "$MOUNT" 2>/dev/null || true
trap - EXIT
printf 'cleanup=unmounted\n'
`,
      expectedResult:
        code`On a VM with passwordless sudo, mount_status=mounted, findmnt_record names tmpfs, tmpfs_size_bytes is at least 33554432, tmpfs_used_bytes is at least 8388608, tmpfs_memory_backed=yes, and cleanup=unmounted. The memory_available value varies.`,
      systemsLens:
        code`tmpfs presents filesystem semantics while storing pages in memory and enforcing a filesystem quota. It is useful for scratch state, but its bytes compete with memory rather than a disk volume.`,
      caution:
        code`Run only on the dedicated disposable VM with passwordless sudo. The trap unmounts this exact mount and never touches another mount.`,
    },
    {
      slug: "bounded-filesystem-full",
      title: "Contain ENOSPC inside a small filesystem",
      difficulty: "intermediate",
      tags: ["mounts", "storage", "filesystem"],
      prerequisites: ["map-mounts-and-devices"],
      safetyLevel: "privileged",
      runIn: "shell",
      estimatedMinutes: 18,
      overview:
        code`On the disposable VM, format a uniquely named 32-megabyte image, loop-mount it below the lab, and write a bounded stream until the filesystem returns ENOSPC. The host remains available because the capacity boundary is the mounted image.`,
      syntaxBreakdown:
        code`truncate creates a fixed image; mkfs.ext4 formats it; sudo -n mount -o loop attaches one loop mount; dd captures its nonzero full-disk result; df reports the inner filesystem.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
IMAGE=$LAB/full-image-$UID.img
MOUNT=$LAB/full-mount-$UID
ERROR=$LAB/full-error-$UID
mkdir -p "$MOUNT"
mounted=no
trap 'if [ "$mounted" = yes ]; then sudo -n umount "$MOUNT" 2>/dev/null || true; fi; rm -f "$IMAGE" "$ERROR"; rmdir "$MOUNT" 2>/dev/null || true' EXIT
rm -f "$IMAGE" "$ERROR"
truncate -s 33554432 "$IMAGE"
mkfs.ext4 -q -F "$IMAGE"
if ! sudo -n mount -o loop "$IMAGE" "$MOUNT"; then
  printf 'mount_status=unavailable\n'
  exit 1
fi
mounted=yes
set +e
sudo -n dd if=/dev/zero of="$MOUNT/fill.bin" bs=1048576 count=64 status=none 2>"$ERROR"
fill_status=$?
set -e
inner_free=$(df -B1 -P "$MOUNT" | awk 'NR==2{print $4}')
printf 'mount_status=mounted\n'
printf 'fill_status=%s\n' "$fill_status"
printf 'inner_free_bytes=%s\n' "$inner_free"
printf 'enospc_text=%s\n' "$(grep -qi 'no space left on device' "$ERROR" && echo present || echo absent)"
if [ "$fill_status" -ne 0 ] && grep -qi 'no space left on device' "$ERROR" && [ "$inner_free" -lt 1048576 ]; then printf 'bounded_enospc=observed\n'; else printf 'bounded_enospc=unexpected\n'; fi
sudo -n umount "$MOUNT"
mounted=no
rm -f "$IMAGE" "$ERROR"
rmdir "$MOUNT" 2>/dev/null || true
trap - EXIT
printf 'cleanup=image-and-mount-removed\n'
`,
      expectedResult:
        code`On the disposable VM, mount_status=mounted, fill_status is nonzero, enospc_text=present, inner_free_bytes is below one MiB, bounded_enospc=observed, and cleanup=image-and-mount-removed. The exact free count depends on ext4 metadata and reserved blocks.`,
      systemsLens:
        code`ENOSPC is a failure at a particular filesystem boundary, not necessarily a host-wide disk failure. Volume quotas and container layers use the same containment idea to localize capacity incidents.`,
      caution:
        code`This lesson formats and loop-mounts only the uniquely named lab image. Run it serially on the disposable VM; never substitute a real block device or mount point.`,
    },
    {
      slug: "recover-filesystem-space",
      title: "Recover image space only after the last holder closes",
      difficulty: "advanced",
      tags: ["mounts", "storage", "file-descriptors"],
      prerequisites: ["compare-df-and-du", "bounded-filesystem-full"],
      safetyLevel: "privileged",
      runIn: "shell",
      estimatedMinutes: 18,
      overview:
        code`Create a fresh bounded ext4 image, hold a 12-megabyte file open, unlink its only name, and compare inner free space before and after the holder exits. The image recovers blocks only when the final open reference is released.`,
      syntaxBreakdown:
        code`A loop mount gives the image a private capacity boundary; exec 9< holds the file; rm removes its name; df -B1 measures free bytes; wait closes the holder; sudo -n umount releases the exact mount.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
IMAGE=$LAB/recover-image-$UID.img
MOUNT=$LAB/recover-mount-$UID
READY=$LAB/recover-ready-$UID
mkdir -p "$MOUNT"
mounted=no
holder_pid=
trap 'test -n "$holder_pid" && kill "$holder_pid" 2>/dev/null || true; test -n "$holder_pid" && wait "$holder_pid" 2>/dev/null || true; if [ "$mounted" = yes ]; then sudo -n umount "$MOUNT" 2>/dev/null || true; fi; rm -f "$IMAGE" "$READY"; rmdir "$MOUNT" 2>/dev/null || true' EXIT
rm -f "$IMAGE" "$READY"
truncate -s 33554432 "$IMAGE"
mkfs.ext4 -q -F "$IMAGE"
if ! sudo -n mount -o loop "$IMAGE" "$MOUNT"; then
  printf 'mount_status=unavailable\n'
  exit 1
fi
mounted=yes
sudo -n dd if=/dev/zero of="$MOUNT/held.bin" bs=1048576 count=12 status=none
free_before=$(df -B1 -P "$MOUNT" | awk 'NR==2{print $4}')
holder_pid=
export READY
bash -c 'exec 9<"$1/held.bin"; : > "$READY"; sleep 2' bash "$MOUNT" &
holder_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$READY" ] && break
  sleep 0.05
done
sudo -n rm "$MOUNT/held.bin"
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
sudo -n umount "$MOUNT"
mounted=no
rm -f "$IMAGE" "$READY"
rmdir "$MOUNT" 2>/dev/null || true
trap - EXIT
printf 'cleanup=image-and-mount-removed\n'
`,
      expectedResult:
        code`On the disposable VM, mount_status=mounted, name_exists_after_unlink=no, free_after_close is greater than free_after_unlink, space_recovery=after-final-close, and cleanup=image-and-mount-removed. Exact free-byte values vary with ext4 metadata.`,
      systemsLens:
        code`Reclamation follows references, not names: deleting the last directory entry is insufficient while an open description remains. The same delayed recovery appears in rotated logs, temporary files, and storage snapshots.`,
      caution:
        code`This is serial, privileged work on a disposable VM. The trap targets only the holder PID, loop mount, image, and lab directory created by this lesson.`,
    },
  ],
};
