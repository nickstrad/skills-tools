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
      revision: 2,
      overview:
        code`Place one observation file below the learner-owned lab and ask findmnt which mounted filesystem receives its path. Correlate that mount with df and an lsblk inventory without assuming a particular device name or container storage driver.`,
      syntaxBreakdown: code`### In plain terms

This asks which mounted filesystem receives one service file pathname. It correlates a pathname-to-mount answer with capacity accounting and a block-device inventory without assuming the VM exposes a physical disk.

### What you are learning

- Pathname lookup chooses a mount before it chooses an inode.
- Filesystem capacity and block-device topology are related but can be virtualized separately.

### Piece by piece

- **findmnt -T FILE -o TARGET,SOURCE,FSTYPE -n** (mount resolver and flags): **-T** selects the mount containing FILE, **-o** chooses output columns, and **-n** omits headings. Its target, source, and type form the primary mapping evidence.
- **df -P FILE** (filesystem accounting): **-P** uses portable one-line filesystem output; awk selects device and mounted-on fields. It reports the capacity boundary selected for FILE.
- **lsblk -o NAME,TYPE -n** (block topology): **-o** chooses columns and **-n** suppresses headings. It may be empty or indirect in a container, so it is context, not an assertion.
- **readlink -f** and **awk** (canonicalizer and field selector): canonicalize the observed path and extract explicitly labelled fields without guessing a device name.`,
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
      challenge:
        '**Predict:** Will a second file under the same lab directory resolve to the same findmnt target?\n\n**Inspect and explain:** Run this complete bounded example:\n\n```bash\nLAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"; f="$LAB/mount-vary-$UID"; : > "$f"; findmnt -T "$f" -o TARGET,SOURCE,FSTYPE -n; rm -f "$f"\n```\n\nCompare this mount target with the original lesson’s target. Explain what mapping the pathname supplies and what remains unknown about physical storage.\n\n**Vary:** Inspect exactly one second pathname below the lab.\n\n**Hint:** Use **findmnt -T** on the pathname, not a guessed device.\n\n**Apply:** When df names an overlay source, state what additional service deployment information you need before attributing a full filesystem to a physical disk.',
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
      revision: 2,
      overview:
        code`Allocate a bounded 16-megabyte file, hold it open in a child, and unlink its name. du can no longer find the file, but df still counts its blocks until the child closes the descriptor.`,
      syntaxBreakdown: code`### In plain terms

This makes a file both unlinked and still open. The directory and descriptor observations are scoped to our file; host df differences are noisy context. **du** loses the name while **df** keeps charging its blocks until the holder closes, so the learner can diagnose hidden space instead of treating either tool as wrong.

### What you are learning

- du measures named reachable data; df measures free blocks in a filesystem.
- An open descriptor can retain allocation after the last directory entry disappears.

### Piece by piece

- **dd if=/dev/zero of=FILE bs=1048576 count=16 status=none** (bounded writer and flags): reads zeros, writes FILE, uses one-MiB blocks, writes 16 blocks, and suppresses progress. It creates a bounded 16 MiB accounting change.
- **df -B1 -P** and **du -B1 -s** (block and name accounting): **-B1** reports bytes, **-P** stabilizes df layout, and **-s** summarizes the lab. Compare free blocks with named bytes.
- **exec 9< FILE** in **bash -c** (descriptor holder): keeps one read descriptor open in the child; READY makes the parent wait for that fact.
- **readlink /proc/PID/fd/9** and **wait** (holder evidence and join): show the deleted handle and release it before measuring recovered blocks.`,
      code: code`
(
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
[ -e "$READY" ] || exit 1
rm "$FILE"
free_after_unlink=$(df -B1 -P "$LAB" | awk 'NR==2{print $4}')
named_after=$(du -B1 -s "$LAB" | awk '{print $1}')
fd_link=$(readlink "/proc/$holder_pid/fd/9")
printf 'named_before_bytes=%s\n' "$named_before"
printf 'named_after_unlink_bytes=%s\n' "$named_after"
printf 'free_before=%s free_after_unlink=%s\n' "$free_before" "$free_after_unlink"
printf 'open_fd_deleted=%s\n' "$(printf '%s' "$fd_link" | grep -q '(deleted)' && echo yes || echo no)"
if [ "$named_after" -lt "$named_before" ] && printf '%s' "$fd_link" | grep -q '(deleted)'; then printf 'df_du_diverge=observed\n'; else printf 'df_du_diverge=unexpected\n'; exit 1; fi
wait "$holder_pid"
[ ! -d "/proc/$holder_pid" ] || exit 1
printf 'holder_after_close=absent\n'
holder_pid=
free_after_close=$(df -B1 -P "$LAB" | awk 'NR==2{print $4}')
printf 'free_after_close=%s\n' "$free_after_close"
if [ "$free_after_close" -gt "$free_after_unlink" ]; then printf 'host_free_space_sample=increased\n'; else printf 'host_free_space_sample=not-increased\n'; fi
rm -f "$FILE" "$READY"
trap - EXIT
)
`,
      expectedResult:
        code`named_after_unlink_bytes is lower than named_before_bytes, open_fd_deleted=yes and df_du_diverge=observed. holder_after_close=absent verifies that the exact owner exited. The three df values are filesystem-wide samples; host_free_space_sample can be increased or not-increased because unrelated allocation and delayed accounting can mask this file’s release. Use the bounded-filesystem recovery experiment to isolate the reclaimed-capacity relationship.`,
      systemsLens:
        code`du answers how much data is reachable through names; df answers how many blocks the filesystem has free. An unlinked open file sits in the gap, a common cause of disk-full incidents.`,
      challenge:
        '**Predict:** If the final descriptor closes before unlink, can this lab file still account for deleted-but-open storage?\n\n**Inspect and explain:** Run this complete bounded example:\n\n```bash\n( LAB=$LINUX_LAB\nif [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi\nmkdir -p "$LAB"\nf="$LAB/du-vary-$UID"\ntrap \'exec 9<&-; rm -f "$f"\' EXIT\ndd if=/dev/zero of="$f" bs=1M count=1 status=none\nexec 9< "$f"\nstat -Lc \'held_size=%s held_blocks=%b\' /proc/$BASHPID/fd/9\nexec 9<&-\n[ ! -e /proc/$BASHPID/fd/9 ] || exit 1\nprintf \'holder_closed_before_unlink=yes\\n\'\nrm "$f"\n[ ! -e "$f" ] || exit 1\nprintf \'named_file_after_unlink=absent\\n\'\ndf -B1 -P "$LAB"\n)\n```\n\nExplain which two observations rule out this file as a deleted-but-open owner. The final df sample includes other files and host activity; it cannot prove an exact one-MiB reclamation.\n\n**Vary:** Keep the substitute at one MiB.\n\n**Hint:** A deleted pathname is not enough; inspect a live fd before calling space hidden.\n\n**Apply:** Give the two commands and one process identifier you would collect before deciding to restart a log-writing service.',
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
      revision: 2,
      overview:
        code`Create two files with the same 32-megabyte logical size: one by seeking over a hole and one by writing every byte. stat and du reveal that logical offsets and allocated blocks are different measurements.`,
      syntaxBreakdown: code`### In plain terms

Two files advertise the same logical length, but only one writes each byte. This makes sparse-file reservation visible: offsets can exist without consuming an equal number of filesystem blocks.

### What you are learning

- Logical file length and allocated blocks are separate metadata values.
- A sparse hole reads as zeros but need not consume a physical block.

### Piece by piece

- **truncate -s 33554432** (length setter and size flag): **-s** sets a 32 MiB logical length without writing each byte. It creates the sparse candidate.
- **dd if=/dev/zero of=FILE bs=1048576 count=32 status=none** (allocated writer): writes 32 one-MiB zero blocks, making the control file consume blocks.
- **stat -c %s** and **stat -c %b** (metadata formats): **%s** is logical bytes and **%b** is allocated 512-byte blocks. The equal size but unequal block fields are the evidence.
- **du --apparent-size -B1** (logical usage reader): **--apparent-size** uses file length and **-B1** prints bytes, confirming both advertised sizes match.`,
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
      challenge:
        '**Predict:** What happens to allocated blocks if one byte is written at the end of a sparse 4 MiB file?\n\n**Inspect and explain:** Run this complete bounded example:\n\n```bash\nLAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"; f="$LAB/sparse-vary-$UID"; truncate -s 4194304 "$f"; printf x | dd of="$f" bs=1 seek=4194303 conv=notrunc status=none; stat -c \'%s %b\' "$f"; rm -f "$f"\n```\n\nConvert the allocated-block count to bytes and compare it with logical size. Explain the hole between the beginning and the final written byte.\n\n**Vary:** Write exactly one byte at one chosen offset.\n\n**Hint:** **conv=notrunc** prevents dd from shortening the logical file.\n\n**Apply:** State why a deployment’s apparent-size report cannot alone predict its actual disk consumption.',
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
      revision: 3,
      overview:
        code`On the dedicated disposable VM, mount a uniquely named 32-megabyte tmpfs below the lab and write eight megabytes into it. findmnt identifies the memory-backed filesystem while df measures its quota; free provides a noisy host-memory observation.`,
      syntaxBreakdown: code`### In plain terms

This mounts one small tmpfs only below the lab, writes eight MiB, then removes the mount. The mount record and its capacity prove the filesystem boundary; the host-wide memory number is context and cannot attribute those bytes to this process.

### What you are learning

- tmpfs provides file semantics backed by memory with a mount-specific size limit.
- Privileged experiments need exact object names, cleanup, and honest unavailable branches.

### Piece by piece

- **as_root** (shell helper): runs directly as UID 0 or uses **sudo -n**, whose **-n** forbids an interactive password prompt. It confines privileged commands to explicit arguments.
- **mount -t tmpfs -o size=32m SOURCE MOUNT** (mount command and flags): **-t** selects tmpfs and **-o size=32m** sets its quota. The outer subshell prevents a mount failure from altering the persistent learner shell.
- **dd ... count=8** and **df -B1 -P** (bounded write and accounting): write eight MiB then show the tmpfs byte capacity and used blocks.
- **findmnt -T**, **free -b**, and **umount** (mount evidence, noisy context, cleanup): findmnt identifies tmpfs, free reports global memory context, and umount releases this exact mount.`,
      code: code`
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
`,
      expectedResult:
        code`On a VM with passwordless sudo, mount_status=mounted, findmnt_record names tmpfs, tmpfs_size_bytes is at least 33554432, tmpfs_used_bytes is at least 8388608, tmpfs_memory_backed=yes, and cleanup=unmounted. The memory_available value varies.`,
      systemsLens:
        code`tmpfs presents filesystem semantics while storing pages in memory and enforcing a filesystem quota. It is useful for scratch state, but its bytes compete with memory rather than a disk volume.`,
      caution:
        code`Run only on the dedicated disposable VM with passwordless sudo. The trap unmounts this exact mount and never touches another mount.`,
      challenge:
        "**Predict:** If the mount limit is 16 MiB and the write is 1 MiB, which df field changes while the mount is live?\n\n**Inspect and explain:** Compare tmpfs_size_bytes and tmpfs_used_bytes. Explain why the host memory_available_bytes sample is not an exact attribution measurement.\n\n**Vary:** Rerun the complete lesson, replacing dd count=8 with count=4 and the used-byte lower bound -ge 8388608 with -ge 4194304. Keep the 32 MiB mount and its cleanup.\n\n**Hint:** Reuse the as_root helper and an EXIT trap before mounting.\n\n**Apply:** Decide whether tmpfs is suitable for a service’s scratch output and name the memory budget evidence you would require.",
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
      revision: 3,
      overview:
        code`On the disposable VM, format a uniquely named 32-megabyte image, loop-mount it below the lab, and write a bounded stream until the filesystem returns ENOSPC. The host remains available because the capacity boundary is the mounted image.`,
      syntaxBreakdown: code`### In plain terms

This creates and fills a disposable 32 MiB ext4 image, so ENOSPC happens at a small known filesystem boundary. The host remains outside that boundary; a nonzero dd status plus the exact error text are the failure evidence.

### What you are learning

- ENOSPC is scoped to a filesystem, not automatically to the host.
- An expected nonzero command must be captured without leaking shell error policy.

### Piece by piece

- **truncate -s 33554432** and **mkfs.ext4 -q -F** (image creation and format flags): truncate fixes image length; **-q** reduces formatter output and **-F** permits formatting this regular-file image. Never substitute a real device.
- **mount -o loop IMAGE MOUNT** (loop mount): **-o loop** asks mount to attach the image through a loop device. as_root limits this privileged operation to the exact paths.
- **dd ... count=64 ... || fill_status=$?** (overfill and status capture): the 64 MiB request exceeds capacity; the OR branch records its expected nonzero exit without changing global errexit.
- **df -B1 -P**, **grep -qi**, and **umount** (accounting, error check, cleanup): read inner free bytes, check ENOSPC text case-insensitively, then detach only the created mount.`,
      code: code`
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
`,
      expectedResult:
        code`On the disposable VM, mount_status=mounted, fill_status is nonzero, enospc_text=present, inner_free_bytes is below one MiB, bounded_enospc=observed, and cleanup=image-and-mount-removed. The exact free count depends on ext4 metadata and reserved blocks.`,
      systemsLens:
        code`ENOSPC is a failure at a particular filesystem boundary, not necessarily a host-wide disk failure. Volume quotas and container layers use the same containment idea to localize capacity incidents.`,
      caution:
        code`This lesson formats and loop-mounts only the uniquely named lab image. Run it serially on the disposable VM; never substitute a real block device or mount point.`,
      challenge:
        "**Predict:** If a bounded write attempt still exceeds the image capacity, should reducing that attempt from 64 to 48 MiB remove ENOSPC?\n\n**Inspect and explain:** Use fill_status, enospc_text and inner_free_bytes to identify the bounded failure domain.\n\n**Vary:** Rerun the complete lesson, changing only the bounded dd attempt from count=64 to count=48. It still exceeds the 32 MiB image; inspect the actual ENOSPC result and exact unmount.\n\n**Hint:** Keep the image and mount path under **$LAB** and retain the same cleanup trap.\n\n**Apply:** Explain how you would distinguish an application ENOSPC from an exhausted host volume.",
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
      revision: 3,
      overview:
        code`Create a fresh bounded ext4 image, hold a 12-megabyte file open, unlink its only name, and compare inner free space before and after the holder exits. The image recovers blocks only when the final open reference is released.`,
      syntaxBreakdown: code`### In plain terms

This repeats the hidden-space mechanism inside a disposable image so the recovery decision has a tight capacity boundary. Removing the name does not recover its blocks until the child’s recorded descriptor closes.

### What you are learning

- Filesystem free space follows object lifetime, not just pathname lifetime.
- A holder PID and df readings let an operator prove when recovery actually occurred.

### Piece by piece

- **truncate**, **mkfs.ext4 -q -F**, and **mount -o loop** (private filesystem setup): build and attach only the named lab image under the subshell cleanup boundary.
- **dd ... count=12** and **df -B1 -P** (bounded allocation and byte accounting): allocate 12 MiB then sample free bytes before and after unlink.
- **bash -c 'exec 9<...'** and **READY** (exact holder coordination): the child opens descriptor 9 and creates READY only after it holds the file.
- **rm**, **wait**, and **umount** (unlink, final close, teardown): unlink removes the name, wait releases the known holder, and umount detaches the exact image. A free-byte increase after wait is the recovery evidence.`,
      code: code`
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
`,
      expectedResult:
        code`On the disposable VM, mount_status=mounted, name_exists_after_unlink=no, free_after_close is greater than free_after_unlink, space_recovery=after-final-close, and cleanup=image-and-mount-removed. Exact free-byte values vary with ext4 metadata.`,
      systemsLens:
        code`Reclamation follows references, not names: deleting the last directory entry is insufficient while an open description remains. The same delayed recovery appears in rotated logs, temporary files, and storage snapshots.`,
      caution:
        code`This is serial, privileged work on a disposable VM. The trap targets only the holder PID, loop mount, image, and lab directory created by this lesson.`,
      challenge:
        "**Predict:** With an eight-MiB held file, at which point can its blocks become reclaimable?\n\n**Inspect and explain:** Compare free_after_unlink with free_after_close and explain why the live descriptor delays recovery.\n\n**Vary:** Rerun the complete lesson, changing only count=12 to count=8. Compare the free-space recovery after the final close within the same bounded image.\n\n**Hint:** Use the same exact-PID wait and exact-mount cleanup as the main experiment.\n\n**Apply:** State the evidence threshold for declaring hidden-space recovery complete after a service restart.",
    },
  ],
};
