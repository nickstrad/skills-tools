# Observe an inherited open-file reference

slug: inherited-open-files
category: file-descriptors-and-pipes
difficulty: intermediate
tags: file-descriptors, processes, procfs
prerequisites: redirect-and-duplicate-fds
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Open descriptor 9 in the parent, fork a child that writes through that descriptor, and inspect both /proc links before the child exits. Both processes refer to the same open-file description and therefore the same inode.

## Syntax breakdown
### In plain terms

The parent opens descriptor 9 once, then a child inherits it and writes through it. Both descriptor-table entries resolve to the same pathname while the child is alive.

### What you are learning

- Fork inherits descriptor references.
- A descriptor is an open reference, distinct from reopening a pathname.

### Piece by piece

- **exec 9>>FILE** opens FILE for append in the current Bash and keeps descriptor 9 open. **>&9** sends the child's printf through that inherited descriptor.
- The child writes READY before its bounded sleep; the polling loop ensures **readlink /proc/PID/fd/9** runs while both references exist.
- The two **readlink** calls expose the parent and child targets, and **cat** reads the resulting line.
- **exec 9>&-** closes only descriptor 9 in the parent. The trap waits for the exact child, closes 9, and removes named lab files.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FILE=$LAB/inherited-$UID.log
READY=$LAB/inherited-ready-$UID
rm -f "$FILE" "$READY"
exec 9>>"$FILE"
child_pid=
trap 'test -n "$child_pid" && kill "$child_pid" 2>/dev/null || true; test -n "$child_pid" && wait "$child_pid" 2>/dev/null || true; exec 9>&-; rm -f "$FILE" "$READY"' EXIT
export FILE READY
bash -c 'printf child-line >&9; : > "$READY"; sleep 2' &
child_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$READY" ] && break
  sleep 0.05
done
parent_target=$(readlink "/proc/$$/fd/9")
child_target=$(readlink "/proc/$child_pid/fd/9")
printf 'parent_fd9=%s\n' "$parent_target"
printf 'child_fd9=%s\n' "$child_target"
printf 'file_contents=%s\n' "$(cat "$FILE")"
if [ "$parent_target" = "$child_target" ] && [ "$parent_target" = "$FILE" ]; then printf 'open_file_reference=shared\n'; else printf 'open_file_reference=unexpected\n'; fi
wait "$child_pid"
child_pid=
exec 9>&-
rm -f "$FILE" "$READY"
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
parent_fd9 and child_fd9 resolve to the same inherited log path, file_contents=child-line, and open_file_reference=shared. The two PIDs and path are run-specific.

## Systems lens
Fork copies descriptor references, while the kernel open-file description carries the underlying file and offset. This is why workers can share a log, pipe, or socket without reopening it by pathname.

## Optional variation
**Predict.** Before running, what relationship should the parent and child FD 9 links have, and what content should the file show?

**Inspect and explain.** Explain why the child can write through 9 without opening FILE itself.

**Vary.** Change only `child-line` to `child-variation` and inspect the resulting content.

**Hint.** Do not close descriptor 9 before the child reaches READY.

**Apply.** Describe how inherited logging descriptors can accidentally keep a rotated file or socket alive.
