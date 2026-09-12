# Map a pathname to its mount and storage source

slug: map-mounts-and-devices
category: mounts-and-storage-paths
difficulty: beginner
tags: mounts, storage, filesystem
prerequisites: paths-and-inodes
safety: read-only
run-in: shell
sessions: 1
min-version: 5.1
minutes: 10
revision: 2

## Overview
Place one observation file below the learner-owned lab and ask findmnt which mounted filesystem receives its path. Correlate that mount with df and an lsblk inventory without assuming a particular device name or container storage driver.

## Syntax breakdown
### In plain terms

This asks which mounted filesystem receives one service file pathname. It correlates a pathname-to-mount answer with capacity accounting and a block-device inventory without assuming the VM exposes a physical disk.

### What you are learning

- Pathname lookup chooses a mount before it chooses an inode.
- Filesystem capacity and block-device topology are related but can be virtualized separately.

### Piece by piece

- **findmnt -T FILE -o TARGET,SOURCE,FSTYPE -n** (mount resolver and flags): **-T** selects the mount containing FILE, **-o** chooses output columns, and **-n** omits headings. Its target, source, and type form the primary mapping evidence.
- **df -P FILE** (filesystem accounting): **-P** uses portable one-line filesystem output; awk selects device and mounted-on fields. It reports the capacity boundary selected for FILE.
- **lsblk -o NAME,TYPE -n** (block topology): **-o** chooses columns and **-n** suppresses headings. It may be empty or indirect in a container, so it is context, not an assertion.
- **readlink -f** and **awk** (canonicalizer and field selector): canonicalize the observed path and extract explicitly labelled fields without guessing a device name.

## Run
```sh
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
```

## Expected result
findmnt_target, findmnt_source, findmnt_fstype, df_device, and df_mountpoint are nonempty labels for the lab file; lsblk_sample may vary or be empty on a storage-driver-backed VM; mount_mapping=observed.

## Systems lens
Path lookup crosses a mount graph before reaching an inode, while df reports the capacity boundary selected by that graph. lsblk adds physical topology when the source is a block device; containers may expose a virtual source instead.

## Optional variation
Resolve exactly one second pathname below the same lab directory:

```bash
LAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"; f="$LAB/mount-vary-$UID"; : > "$f"; findmnt -T "$f" -o TARGET,SOURCE,FSTYPE -n; rm -f "$f"
```

Compare its mount target with the original: both files in the same directory resolve to the same
mount while the mount layout stays unchanged. findmnt -T starts from the actual pathname; the
example then removes its file. A virtual or overlay source still needs deployment and backing-store
information before that mount can be attributed to a particular physical disk.
