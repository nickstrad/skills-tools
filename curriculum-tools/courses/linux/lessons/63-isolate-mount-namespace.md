# Mount a private tmpfs visible only inside a namespace

slug: isolate-mount-namespace
category: namespaces-and-isolation
difficulty: advanced
tags: namespaces, isolation, mounts
prerequisites: inspect-namespace-membership
safety: privileged
run-in: shell
sessions: 1
min-version: 5.1
minutes: 16
revision: 3

## Overview
Create a private mount namespace, mount a one-megabyte tmpfs below the lab, and compare findmnt inside and outside. The inner shell unmounts in an EXIT trap, so no mount remains.

## Syntax breakdown
### In plain terms

A mount namespace gives a process tree a private mount topology, the map path lookup uses to select filesystems. This experiment mounts a one-MiB tmpfs only inside that view and compares inside and outside; it is a visibility boundary, not a general permission grant.

### What you are learning

- --mount creates a private mount namespace for the child command.
- tmpfs is a memory-backed filesystem, and size=1M bounds this lesson's allocation.
- findmnt -T resolves the mount serving a target path in the calling process's mount view.

### Piece by piece

- **as_root timeout 6s unshare --mount --fork bash -c** (bounded private topology)
  - What it is: as_root handles authority, timeout limits wall time, **--mount** selects a mount namespace, and **--fork** isolates the child lifecycle.
  - What it does here: the child alone executes mount and writes its observation to OUT.
  - What it gives us: unshare_status=0 is necessary before inside evidence is interpreted.
- **mount -t tmpfs -o size=1M tmpfs MOUNTPOINT** (a bounded mount)
  - What it is: mount **-t tmpfs** selects the filesystem type and **-o size=1M** sets its capacity option.
  - What it does here: it attaches the generated lab directory inside the child view.
  - What it gives us: inside_mount=tmpfs shows that inner lookup selected the private mount.
- **findmnt -n -o FSTYPE -T PATH** (a target mount query)
  - What it is: findmnt **-T** resolves a path, **-n** suppresses headings, and **-o FSTYPE** prints the filesystem type.
  - What it does here: it is executed once inside and once outside.
  - What it gives us: outside_mount_type must differ from tmpfs for a successful private-visibility claim.
- **trap 'umount ...' EXIT**, **rm -rf**, and **status=$?** (cleanup and policy branch)
  - What they do here: unmount removes the inner attachment; outer cleanup removes only generated lab paths; the status idiom preserves a denial.
  - What they give us: cleanup=done is required on either branch, while skipped-or-unexpected is not proof of isolation.

## Caution
Privileged: run only in the disposable VM. The private tmpfs is size-bounded, mounted below LINUX_LAB, and explicitly unmounted before exit.

## Run
```sh
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo -n "$@"; fi; }
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
MOUNTPOINT=$LAB/ns-mount-$UID-$$
OUT=$LAB/ns-mount-result-$UID-$$
rm -rf "$MOUNTPOINT" "$OUT"
mkdir -p "$MOUNTPOINT"
trap 'rm -rf "$MOUNTPOINT" "$OUT"' EXIT
status=0
as_root timeout 6s unshare --mount --fork bash -c "mount -t tmpfs -o size=1M tmpfs '$MOUNTPOINT'; trap \"umount '$MOUNTPOINT' 2>/dev/null || true\" EXIT; printf 'inside_mount=%s\\n' \"\$(findmnt -n -o FSTYPE -T '$MOUNTPOINT')\" > '$OUT'; umount '$MOUNTPOINT'" || status=$?
inside=$(cut -d= -f2 "$OUT" 2>/dev/null)
outside=$(findmnt -n -o FSTYPE -T "$MOUNTPOINT" 2>/dev/null || true)
if [ -z "$outside" ]; then outside=none; fi
printf 'unshare_status=%s\ninside_mount=%s\noutside_mount_type=%s\n' "$status" "$inside" "$outside"
if [ "$status" -ne 0 ]; then
  printf 'mount_namespace_isolated=skipped-host-policy\n'
elif [ "$inside" = tmpfs ] && [ "$outside" != tmpfs ]; then
  printf 'mount_namespace_isolated=yes\n'
else
  printf 'mount_namespace_isolated=unexpected-evidence\n'
fi
rm -rf "$MOUNTPOINT" "$OUT"
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
On a permitted VM, unshare_status=0, inside_mount=tmpfs, outside_mount_type is not tmpfs, and mount_namespace_isolated=yes. A nonzero unshare_status produces skipped-host-policy, which says the mechanism was not tested. unexpected-evidence is a permitted command whose inside/outside evidence did not establish isolation. cleanup=done and an empty mountpoint are mandatory.

## Systems lens
Mount namespaces isolate the VFS topology consulted by path lookup. A mount can be usable to one process tree while absent from another, a core filesystem isolation primitive.

## Optional variation
**Predict:** If the private mount succeeds, which findmnt call should return tmpfs: inner, outer, or both?

**Inspect and explain:** Explain why inside_mount=tmpfs plus outside_mount_type!=tmpfs demonstrates topology visibility, while neither value proves a host permission policy.

**Vary:** Copy the full lesson into a private disposable-VM run and change only **size=1M** to **size=512K**. It keeps the same generated mountpoint and explicit unmount, and changes the allocation ceiling only.

**Hint:** A successful unshare is prerequisite evidence; do not treat skipped-or-unexpected as success.

**Apply:** A service sees a different configuration file than the host shell. Which mount-namespace and path-resolution evidence would you gather before changing the host file?
