# Reconcile hidden disk space held by a deleted file

slug: triage-deleted-file-space
category: troubleshooting-capstones
difficulty: advanced
tags: troubleshooting, filesystem, storage
prerequisites: compare-df-and-du, deleted-open-file
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 16
revision: 2

## Overview
A log pathname has disappeared, yet an open resource still owns its allocated blocks. Join the deleted pathname, allocated blocks and exact holder to distinguish visible directory contents from live file ownership, then verify that holder releases its reference. Host free-space changes are context, not a precise accounting experiment.

## Syntax breakdown
### In plain terms

Removing a name does not necessarily release a file's storage. Diagnose the difference between what a directory walk can find and what an existing descriptor still holds before deleting more paths.

### What you are learning

- An unlinked file can remain open with its data and allocated blocks intact.
- du walks reachable names, while df reports free blocks for an entire mounted filesystem.
- Releasing the exact last holder makes blocks reclaimable; concurrent writes can hide that change in a host-wide sample.

### Piece by piece

- **Lab paths and shell control.** LINUX_LAB selects the directory; the HOME fallback is used only when it is empty. **mkdir -p** creates it idempotently. UID and the shell PID ($$) distinguish this run's names. Quoted expansions keep paths intact. **printf** prints labeled values; **$(...)** captures output, and **$((...))** performs integer arithmetic.
- **Ownership and cleanup.** **&** starts a child and **$!** records its exact PID. **trap ... EXIT** installs cleanup before the child starts. **kill** requests termination and **wait** reaps that child; **|| true** tolerates an already exited child during cleanup. **rm -f** removes only named lab files, and **trap - EXIT** clears the handler after explicit cleanup. Readiness loops use **test/[ ]**, **break**, and **sleep** to wait for observed state within a fixed bound; an assertion failure exits the experiment's subshell, not your terminal.
- **dd if=/dev/zero of="$FILE" bs=1M count=16 status=none** writes sixteen one-MiB zero blocks into the named lab file. **if** and **of** select input and output; **bs** and **count** bound allocation, and **status=none** suppresses routine statistics.
- **df -k "$LAB"** reports filesystem capacity in KiB. **awk 'NR==2{print $4}'** reads the available-space column in the first data row. **du -sk "$LAB"** summarizes named files in KiB; **-s** requests the total and **-k** chooses units. Its decrease after unlink describes lost pathname visibility.
- **python3 -u -c** opens the file in binary read mode, writes READY only after open succeeds, and holds the descriptor for at most twenty seconds. **test -s** checks the published descriptor record; **sleep .05** spaces ten bounded attempts. A failed readiness assertion ends the subshell with cleanup.
- **rm "$FILE"** unlinks that name while the helper still has its file object. **lsof -nP -a -p "$holder_pid" +L1** intersects the PID filter and the link-count-below-one filter using **-a**. **-n** and **-P** suppress name conversion. **grep -F** matches the literal path and the deleted marker; **|| true** permits an empty diagnostic result, which the following assertion rejects.
- **cat "$READY"** retrieves the descriptor number published by the helper. **stat -Lc %b /proc/PID/fd/FD** follows (**-L**) that exact file descriptor and formats (**-c**) its allocated 512-byte block count (**%b**). This is direct object evidence after the pathname is gone.
- **ls -l /proc/PID/fd** in the variation shows the descriptor links and their targets in long format.
- **test ! -d /proc/PID/fd** after wait verifies descriptor ownership ended. The final df sample can move in either direction under other workloads; it is not asserted to increase by exactly sixteen MiB.

## Run
```sh
(
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
RUN_ID=$$
FILE=$LAB/deleted-log-$UID-$RUN_ID.log
READY=$LAB/deleted-ready-$UID-$RUN_ID
holder_pid=
rm -f "$FILE" "$READY"
trap 'test -n "$holder_pid" && kill "$holder_pid" 2>/dev/null || true; test -n "$holder_pid" && wait "$holder_pid" 2>/dev/null || true; rm -f "$FILE" "$READY"' EXIT
dd if=/dev/zero of="$FILE" bs=1M count=16 status=none
df_before=$(df -k "$LAB" | awk 'NR==2{print $4}')
du_before=$(du -sk "$LAB" | awk '{print $1}')
FILE="$FILE" READY="$READY" python3 -u -c 'import os,time
f=open(os.environ["FILE"],"rb"); open(os.environ["READY"],"w").write(str(f.fileno())); time.sleep(20)' &
holder_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -s "$READY" ] && break
  sleep .05
done
[ -s "$READY" ] || exit 1
rm "$FILE"
du_after=$(du -sk "$LAB" | awk '{print $1}')
deleted_line=$(lsof -nP -a -p "$holder_pid" +L1 2>/dev/null | grep -F "$FILE" | grep -F '(deleted)' || true)
printf 'holder_pid=%s\nallocated_kib_before=%s\ndf_available_kib_before=%s\ndu_visible_after_unlink_kib=%s\ndeleted_open_seen=%s\n' "$holder_pid" "$((du_before - du_after))" "$df_before" "$du_after" "$(test -n "$deleted_line" && echo yes || echo no)"
if [ -n "$deleted_line" ]; then printf 'hidden_space_incident=observed\n'; else printf 'hidden_space_incident=partial\n'; fi
held_fd=$(cat "$READY")
held_blocks=$(stat -Lc %b "/proc/$holder_pid/fd/$held_fd")
printf 'held_file_blocks=%s\n' "$held_blocks"
[ "$held_blocks" -gt 0 ] && [ -n "$deleted_line" ] || exit 1
kill "$holder_pid" 2>/dev/null || true
wait "$holder_pid" 2>/dev/null || true
[ ! -d "/proc/$holder_pid/fd" ] || exit 1
printf 'holder_after_stop=absent\ndf_available_kib_after_close=%s\n' "$(df -k "$LAB" | awk 'NR==2{print $4}')"
holder_pid=
rm -f "$FILE" "$READY"
trap - EXIT
printf 'cleanup=done\n'
)
```

## Expected result
allocated_kib_before is positive on a block-allocating filesystem, deleted_open_seen=yes, and held_file_blocks is positive even though the pathname is absent. hidden_space_incident=observed attributes the hidden file to the recorded PID. holder_after_stop=absent verifies its references ended. df_available_kib_after_close is a noisy filesystem-wide sample; use the earlier bounded-filesystem lesson to isolate reclaimed capacity.

## Systems lens
Names, open references and block allocation have different lifetimes. Diagnosis connects them through an exact owner; recovery must end the reference that holds the resource, rather than merely alter its name.

## Optional variation
Change **count=16** to **count=8** and rerun. Before stopping the holder,
**ls -l "/proc/$holder_pid/fd"** shows its deleted link. Keep the exact-PID wait and cleanup.

Compare held_file_blocks and the du difference for the smaller8MiB file. The lsof intersection
still connects the deleted object to its owner; removing unrelated names would leave that
reference intact. holder_after_stop=absent verifies release. A graceful close/reopen or restart
of a real log writer likewise needs evidence that the old reference ended, while host df deltas
can include unrelated allocation.
