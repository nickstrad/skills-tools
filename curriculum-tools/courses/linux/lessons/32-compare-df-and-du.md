# Contrast named usage with allocated filesystem space

slug: compare-df-and-du
category: mounts-and-storage-paths
difficulty: intermediate
tags: storage, filesystem, file-descriptors
prerequisites: deleted-open-file, map-mounts-and-devices
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 16
revision: 2

## Overview
Allocate a bounded 16-megabyte file, hold it open in a child, and unlink its name. du can no longer find the file, but df still counts its blocks until the child closes the descriptor.

## Syntax breakdown
### In plain terms

This makes a file both unlinked and still open. The directory and descriptor observations are scoped to our file; host df differences are noisy context. **du** loses the name while **df** keeps charging its blocks until the holder closes, so the learner can diagnose hidden space instead of treating either tool as wrong.

### What you are learning

- du measures named reachable data; df measures free blocks in a filesystem.
- An open descriptor can retain allocation after the last directory entry disappears.

### Piece by piece

- **dd if=/dev/zero of=FILE bs=1048576 count=16 status=none** (bounded writer and flags): reads zeros, writes FILE, uses one-MiB blocks, writes 16 blocks, and suppresses progress. It creates a bounded 16 MiB accounting change.
- **df -B1 -P** and **du -B1 -s** (block and name accounting): **-B1** reports bytes, **-P** stabilizes df layout, and **-s** summarizes the lab. Compare free blocks with named bytes.
- **exec 9< FILE** in **bash -c** (descriptor holder): keeps one read descriptor open in the child; READY makes the parent wait for that fact.
- **readlink /proc/PID/fd/9** and **wait** (holder evidence and join): show the deleted handle and release it before measuring recovered blocks.

## Run
```sh
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
```

## Expected result
named_after_unlink_bytes is lower than named_before_bytes, open_fd_deleted=yes and df_du_diverge=observed. holder_after_close=absent verifies that the exact owner exited. The three df values are filesystem-wide samples; host_free_space_sample can be increased or not-increased because unrelated allocation and delayed accounting can mask this file’s release. Use the bounded-filesystem recovery experiment to isolate the reclaimed-capacity relationship.

## Systems lens
du answers how much data is reachable through names; df answers how many blocks the filesystem has free. An unlinked open file sits in the gap, a common cause of disk-full incidents.

## Optional variation
Close the final held descriptor before unlinking this one-MiB file:

```bash
( LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
f="$LAB/du-vary-$UID"
trap 'exec 9<&-; rm -f "$f"' EXIT
dd if=/dev/zero of="$f" bs=1M count=1 status=none
exec 9< "$f"
stat -Lc 'held_size=%s held_blocks=%b' /proc/$BASHPID/fd/9
exec 9<&-
[ ! -e /proc/$BASHPID/fd/9 ] || exit 1
printf 'holder_closed_before_unlink=yes\n'
rm "$f"
[ ! -e "$f" ] || exit 1
printf 'named_file_after_unlink=absent\n'
df -B1 -P "$LAB"
)
```

holder_closed_before_unlink=yes and named_file_after_unlink=absent verify that this fixture has
neither its held descriptor nor its pathname left. It cannot account for deleted-but-open storage.
The final df sample includes other files and host activity and cannot prove exact one-MiB recovery.
Keep the substitute at one MiB. In a service investigation, correlate filesystem accounting with
the actual holder PID and its procfs descriptor; a missing pathname alone does not identify hidden
allocation or justify restarting a process.
