# Inspect the current cgroup v2 accounting domain

slug: inspect-cgroup-v2
category: resource-boundaries
difficulty: intermediate
tags: cgroups, resource-limits, procfs
prerequisites: map-mounts-and-devices, limit-open-files
safety: read-only
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Resolve this shell's cgroup v2 membership from /proc/self/cgroup and its cgroup2 mount, then print controller and current-limit files. The read-only view connects process identity to hierarchical accounting without creating or modifying a group.

## Syntax breakdown
### In plain terms

This read-only lesson finds the cgroup v2 directory that accounts for this shell and reads its controller files. A cgroup is a hierarchical group of processes for shared accounting and optional control; it is not the same boundary as an rlimit on one process.

### What you are learning

- /proc/self/cgroup names the shell's membership relative to a cgroup filesystem mount.
- cgroup.current files report changing shared usage; cgroup.max files report a configured ceiling or max.
- Inspecting a controller does not establish that the controller is delegated or enforced for a child group.

### Piece by piece

- **findmnt -t cgroup2 -n -o TARGET** (a mount query)
  - What it is: findmnt lists mounted filesystems; **-t** filters to cgroup2, **-n** removes headings, and **-o TARGET** prints the mount path.
  - What it does here: it locates the root used to resolve the relative cgroup path.
  - What it gives us: cgroup2_mount should be a directory, not an assumed fixed path.
- **awk -F: '$1=="0"{print $3}' /proc/self/cgroup** (membership parsing)
  - What it is: awk splits each procfs row at colons; unified cgroup v2 uses hierarchy 0 and field three is the relative path.
  - What it does here: it constructs current from mountpoint plus rel.
  - What it gives us: self_cgroup identifies the accounting domain containing this shell.
- **stat -fc %T** (a filesystem-type query)
  - What it is: stat **-f** reads filesystem metadata and **-c %T** prints its type.
  - What it does here: it checks the resolved directory.
  - What it gives us: cgroup2fs supports the interpretation of the following control files.
- **cgroup.controllers**, **memory.current**, **memory.max**, **pids.current**, **pids.max** (cgroup files)
  - What they are: controllers lists available controller names; current files are observed usage and max files are configured limits.
  - What they do here: they print values only when the resolved files are readable.
  - What they give us: cgroup_view=observed is evidence of a readable view, not evidence that this lesson changed any policy.

## Run
```sh
mountpoint=$(findmnt -t cgroup2 -n -o TARGET 2>/dev/null)
rel=$(awk -F: '$1=="0"{print $3}' /proc/self/cgroup)
current=$mountpoint$rel
if [ -z "$rel" ]; then current=$mountpoint; fi
printf 'cgroup2_mount=%s\n' "$mountpoint"
printf 'self_cgroup=%s\n' "$rel"
printf 'filesystem_type=%s\n' "$(stat -fc %T "$current" 2>/dev/null || printf unavailable)"
if [ -d "$current" ] && [ -r "$current/cgroup.controllers" ]; then
  printf 'controllers=%s\n' "$(cat "$current/cgroup.controllers")"
  printf 'memory_current=%s\n' "$(cat "$current/memory.current" 2>/dev/null || printf unavailable)"
  printf 'memory_max=%s\n' "$(cat "$current/memory.max" 2>/dev/null || printf unavailable)"
  printf 'pids_current=%s\n' "$(cat "$current/pids.current" 2>/dev/null || printf unavailable)"
  printf 'pids_max=%s\n' "$(cat "$current/pids.max" 2>/dev/null || printf unavailable)"
  printf 'cgroup_view=observed\n'
else
  printf 'cgroup_view=unavailable\n'
fi
printf 'cleanup=done\n'
```

## Expected result
cgroup2_mount, self_cgroup, and filesystem_type are printed; on the baseline VM filesystem_type is cgroup2fs and cgroup_view=observed with controller/current/max values. A host without delegated cgroup v2 may print cgroup_view=unavailable without mutation.

## Systems lens
Cgroups form a hierarchy of accounting and control domains. A process can be diagnosed by both its own procfs identity and the group whose controllers impose shared budgets.

## Optional variation
**Predict:** Which value should change when another process in the same cgroup allocates memory: memory.current or memory.max?

**Inspect and explain:** Explain why self_cgroup is needed before treating a memory.current value as evidence about this shell's resource domain.

**Vary:** Rerun the complete lesson and insert wc -l "$current/cgroup.procs" immediately after the pids_max printf line, inside the readable-cgroup branch. This counts process membership records, while pids.current accounts tasks including threads.

**Hint:** Do not write controller files for this variation; visibility and delegation are separate questions.

**Apply:** A service has a generous per-process RLIMIT_NOFILE but still cannot fork. Which cgroup pids values and UID-scoped values would you compare?
