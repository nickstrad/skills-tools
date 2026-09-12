# Keep reading an unlinked file through an open descriptor

slug: deleted-open-file
category: filesystem-objects
difficulty: intermediate
tags: filesystem, inodes, file-descriptors, procfs
prerequisites: inherited-open-files, hard-link-counts
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 14
revision: 2

## Overview
Let a child hold a file open, unlink its only pathname, and inspect the child's descriptor through /proc. The bytes remain readable and the link is marked deleted until the final open reference closes.

## Syntax breakdown
### In plain terms

This removes a file’s only pathname while a child still has it open. The child’s descriptor remains a live handle, so bytes can be read through procfs and the kernel labels that handle deleted.

### What you are learning

- unlink removes a directory entry; it does not revoke already-open file descriptions.
- Procfs exposes the descriptor-to-object relationship behind hidden disk use.

### Piece by piece

- **exec 9< FILE** (shell descriptor operation): opens FILE for reading on descriptor 9 in the child shell. That specific handle survives later unlink.
- **rm FILE** (unlink command): removes the directory entry only. It supplies the visible-name transition.
- **readlink /proc/PID/fd/9** (procfs inspection): resolves the holder's descriptor link and exposes the **(deleted)** annotation for the nameless object.
- **cat /proc/PID/fd/9**, **wait**, and **trap** (reader, join, cleanup): cat reads through the held descriptor; wait reaps that exact child; trap protects the same PID on failures.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FILE=$LAB/deleted-open-$UID.log
READY=$LAB/deleted-open-ready-$UID
printf 'still-readable\n' > "$FILE"
rm -f "$READY"
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
fd_link=$(readlink "/proc/$holder_pid/fd/9")
fd_contents=$(cat "/proc/$holder_pid/fd/9")
printf 'path_exists_after_unlink=%s\n' "$(test -e "$FILE" && echo yes || echo no)"
printf 'fd_link=%s\n' "$fd_link"
printf 'fd_contents=%s\n' "$fd_contents"
if printf '%s' "$fd_link" | grep -q '(deleted)' && [ "$fd_contents" = still-readable ]; then printf 'unlink_kept_open_reference=yes\n'; else printf 'unlink_kept_open_reference=no\n'; fi
wait "$holder_pid"
holder_pid=
rm -f "$FILE" "$READY"
trap - EXIT
```

## Expected result
path_exists_after_unlink=no, fd_link contains (deleted), fd_contents=still-readable, and unlink_kept_open_reference=yes. The pathname disappears immediately, while the inode is reclaimed only after the holder exits.

## Systems lens
unlink removes a directory reference; an open-file description remains valid independently. This explains deleted log files consuming space, graceful rotation, and why closing the final descriptor is part of reclamation.

## Optional variation
Hold one descriptor open while replacing its unlinked pathname with a new file:

```bash
( lab=$LINUX_LAB; if [ -z "$lab" ]; then lab=$HOME/linux-systems-lab; fi; mkdir -p "$lab"; f="$lab/deleted-vary-$UID"; printf old > "$f"; exec 9< "$f"; rm "$f"; printf replacement > "$f"; printf 'fd='; cat /proc/$BASHPID/fd/9; printf ' path='; cat "$f"; exec 9<&-; rm -f "$f" )
```

The output is fd=old followed by path=replacement. Descriptor9 still reaches the old object,
while a new pathname lookup reaches the replacement. BASHPID identifies the actual subshell
holding9; $$ would retain the outer shell PID. The example closes9 and removes the replacement.
For a deleted log, identifying the holder PID and its deleted descriptor ties filesystem use to
the process that can release the reference.
