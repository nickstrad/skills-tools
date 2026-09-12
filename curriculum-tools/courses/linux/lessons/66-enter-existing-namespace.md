# Enter an existing private mount namespace by exact PID

slug: enter-existing-namespace
category: namespaces-and-isolation
difficulty: advanced
tags: namespaces, isolation, mounts, troubleshooting
prerequisites: isolate-mount-namespace
safety: privileged
run-in: shell
sessions: 1
min-version: 5.1
minutes: 17
revision: 3

## Overview
Hold a private mount namespace with a uniquely recorded PID, use nsenter to inspect its tmpfs, and prove the host shell cannot see its private file. The holder waits for a release file and has an EXIT trap that unmounts before exit.

## Syntax breakdown
### In plain terms

This lesson holds a private mount namespace long enough for a diagnostic command to enter it by an exact recorded PID. Entering a namespace changes the command's view for that invocation; it does not transfer ownership of the holder or make a policy skip evidence of namespace entry.

### What you are learning

- nsenter joins a selected namespace of a target process for one command.
- A readiness file and release file coordinate a bounded holder without broad process matching.
- Private mount visibility is established by comparing the same path inside and outside, then proving teardown.

### Piece by piece

- **as_root timeout 6s unshare --mount --fork bash -c** (the holder)
  - What it is: as_root handles authority; timeout bounds lifetime; **--mount** selects a mount namespace; **--fork** starts the isolated child.
  - What it does here: the holder writes its own PID, mounts a one-MiB tmpfs, writes private-token, signals READY, and waits for DONE.
  - What it gives us: PIDFILE is the exact namespace owner to inspect, never a name-based process search.
- **trap 'umount ...' EXIT** and **while [ ! -e DONE ]** (lifetime control)
  - What they are: the inner trap unmounts on exit; the loop waits for the release file in short sleeps.
  - What they do here: they keep the private view present only during the inspection interval.
  - What they give us: DONE followed by wait gives the holder a clean release path.
- **nsenter -t PID -m -- COMMAND** (namespace entry)
  - What it is: nsenter targets PID with **-t**, **-m** selects its mount namespace, and **--** ends nsenter options before the inspected command.
  - What it does here: it runs findmnt and test inside the holder's mount view.
  - What it gives us: nsenter_mount_type=tmpfs and private_file_inside=yes are entry evidence for the exact target.
- **findmnt -n -o FSTYPE -T PATH** and **test -f** (inside/outside comparison)
  - What they are: findmnt resolves a target filesystem; test **-f** checks for a regular private token file.
  - What they do here: the commands inspect the same paths inside and from the host shell.
  - What they give us: private_file_outside=no distinguishes mount-view visibility from mere file creation.
- **wait**, **mount_after_release**, and cleanup (teardown proof)
  - What they do here: release and reap the recorded holder, then query the target path from outside.
  - What they give us: mount_after_release=0 and cleanup=done show the temporary view was removed.

## Caution
Privileged. The holder PID is recorded and released through a file rather than a signal; tmpfs is one megabyte below LINUX_LAB and removed by both traps.

## Run
```sh
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo -n "$@"; fi; }
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
RUN_ID=$$
MOUNTPOINT=$LAB/enter-mount-$UID-$RUN_ID
READY=$LAB/enter-ready-$UID-$RUN_ID
DONE=$LAB/enter-done-$UID-$RUN_ID
PIDFILE=$LAB/enter-pid-$UID-$RUN_ID
PRIVATE=$MOUNTPOINT/private-token
holder_pid=
target_pid=
rm -rf "$MOUNTPOINT" "$READY" "$DONE" "$PIDFILE"
mkdir -p "$MOUNTPOINT"
trap 'touch "$DONE"; test -n "$holder_pid" && wait "$holder_pid" 2>/dev/null || true; rm -rf "$MOUNTPOINT" "$READY" "$DONE" "$PIDFILE"' EXIT
as_root timeout 6s unshare --mount --fork bash -c "printf '%s' \"\$\$\" > '$PIDFILE'; mount -t tmpfs -o size=1M tmpfs '$MOUNTPOINT'; printf private-token > '$PRIVATE'; : > '$READY'; trap \"umount '$MOUNTPOINT' 2>/dev/null || true\" EXIT; while [ ! -e '$DONE' ]; do sleep .05; done" &
holder_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  [ -e "$READY" ] && [ -s "$PIDFILE" ] && break
  sleep .05
done
target_pid=$(cat "$PIDFILE" 2>/dev/null || true)
if [ -e "$READY" ] && [ -n "$target_pid" ]; then
  private_fs=$(as_root nsenter -t "$target_pid" -m -- findmnt -n -o FSTYPE -T "$MOUNTPOINT" 2>/dev/null || true)
  private_file=$(as_root nsenter -t "$target_pid" -m -- test -f "$PRIVATE" && echo yes || echo no)
  host_file=$(test -f "$PRIVATE" && echo yes || echo no)
  printf 'holder_pid=%s\ntarget_pid=%s\nnsenter_mount_type=%s\nprivate_file_inside=%s\nprivate_file_outside=%s\n' "$holder_pid" "$target_pid" "$private_fs" "$private_file" "$host_file"
  if [ "$private_fs" = tmpfs ] && [ "$private_file" = yes ] && [ "$host_file" = no ]; then printf 'namespace_entry_observed=yes\n'; else printf 'namespace_entry_observed=partial\n'; fi
else
  printf 'namespace_entry_observed=skipped-host-policy\n'
fi
touch "$DONE"
wait "$holder_pid" 2>/dev/null || true
holder_pid=
printf 'mount_after_release=%s\n' "$(findmnt -n -o FSTYPE -T "$MOUNTPOINT" 2>/dev/null | grep -c tmpfs)"
rm -rf "$MOUNTPOINT" "$READY" "$DONE" "$PIDFILE"
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
On a permitted VM, nsenter_mount_type=tmpfs, private_file_inside=yes, private_file_outside=no, namespace_entry_observed=yes, and mount_after_release=0 once the release file lets the holder exit and its trap unmounts. Denied creation is skipped-host-policy; cleanup=done and no mountpoint remain.

## Systems lens
Namespace handles let diagnostics join another process's view. This is how an operator inspects an isolated service while retaining exact ownership and cleanup boundaries.

## Optional variation
Rerun the complete lesson, changing only printf private-token > to printf private-token-vary >
in the inner helper. Keep the pathname, namespace checks, DONE release marker and cleanup.
Use target_pid from the holder's PIDFILE for entry, then release through DONE and wait for that
recorded holder.

Token contents do not determine mount visibility: after successful setup the file exists inside
and is absent outside. Entry evidence is separate from teardown; mount_after_release=0 and
cleanup verify release. The exact target, selected namespace type and inside/outside observations
also define the scope of a service diagnostic.
