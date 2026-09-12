# Compare namespace memberships of related processes

slug: inspect-namespace-membership
category: namespaces-and-isolation
difficulty: intermediate
tags: namespaces, isolation, procfs
prerequisites: proc-process-identity
safety: read-only
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Compare namespace links of this shell and an exact child, then ask lsns for the same membership. Shared inode identities make namespace membership observable without changing host state.

## Syntax breakdown
### In plain terms

A namespace is a kernel-selected view used by processes for objects such as mounts, network interfaces, and process IDs. This read-only experiment compares the namespace handles of one shell and its exact child; matching handles establish shared visibility, but they do not grant authority to change that view.

### What you are learning

- /proc/PID/ns exposes links that identify a task's namespace memberships.
- A shared namespace handle means the two tasks use the same view for that namespace type.
- Visibility and permission are different: seeing a namespace does not give capability to create or enter one.

### Piece by piece

- **READY=... bash -c 'touch ...; sleep 2' &** (a recorded child)
  - What it is: an environment assignment supplies the readiness path, bash **-c** runs the child program, touch signals readiness, sleep keeps it inspectable, and ampersand backgrounds it.
  - What it does here: it creates one exact child PID without creating a namespace.
  - What it gives us: child_pid is the only process inspected and later waited for.
- **stat -Lc '%i' /proc/PID/ns/TYPE** (a namespace identity read)
  - What it is: stat **-L** follows the procfs link and **-c %i** prints its inode-style identity.
  - What it does here: it compares parent and child for cgroup, ipc, mnt, net, pid, time, user, and uts when present.
  - What it gives us: matching namespace_TYPE_parent and child values are concrete shared-view evidence.
- **lsns -p PID -o NS,TYPE,PATH** (a namespace listing)
  - What it is: lsns lists namespaces; **-p** scopes to one process and **-o** selects handle, type, and representative path columns.
  - What it does here: tail and sed remove headings and blank lines before wc counts rows.
  - What it gives us: lsns_rows is host-dependent corroboration, not a required fixed number.
- **trap**, **kill**, and **wait** (exact cleanup)
  - What they do here: the EXIT trap kills and reaps only child_pid and removes READY.
  - What they give us: cleanup=done proves no recorded helper remains.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
READY=$LAB/ns-membership-ready-$UID-$$
child_pid=
rm -f "$READY"
trap 'test -n "$child_pid" && kill "$child_pid" 2>/dev/null || true; test -n "$child_pid" && wait "$child_pid" 2>/dev/null || true; rm -f "$READY"' EXIT
READY="$READY" bash -c 'touch "$READY"; sleep 2' &
child_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$READY" ] && break
  sleep .05
done
same_count=0
for ns in cgroup ipc mnt net pid time user uts; do
  parent_id=$(stat -Lc '%i' "/proc/$$/ns/$ns" 2>/dev/null || echo missing)
  child_id=$(stat -Lc '%i' "/proc/$child_pid/ns/$ns" 2>/dev/null || echo missing)
  printf 'namespace_%s_parent=%s child=%s\n' "$ns" "$parent_id" "$child_id"
  [ "$parent_id" = "$child_id" ] && same_count=$((same_count + 1))
done
lsns_rows=$(lsns -p "$child_pid" -o NS,TYPE,PATH 2>/dev/null | tail -n +2 | sed '/^$/d' | wc -l)
printf 'shared_namespace_types=%s\nlsns_rows=%s\n' "$same_count" "$lsns_rows"
if [ "$same_count" -ge 1 ]; then printf 'namespace_membership_observed=yes\n'; else printf 'namespace_membership_observed=no\n'; fi
wait "$child_pid" 2>/dev/null || true
child_pid=
rm -f "$READY"
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
At least one namespace_* parent and child identity matches, shared_namespace_types is at least 1, and namespace_membership_observed=yes. lsns_rows is host-dependent; no namespace is created or modified.

## Systems lens
A namespace is a kernel-selected view used by syscalls. Inode-like handles provide a join key for deciding whether tasks see the same processes, mounts, users, or interfaces.

## Optional variation
Copy the full lesson into a private run and change only the namespace loop list to
**mnt net pid user**. Keep the reads, recorded child and exact cleanup.

Compare the four pairs of stat identities. An ordinary child shares these views with its parent
unless its namespace membership changes; the handles supply the actual evidence. Matching handles
do not grant authority to alter the view. Comparing a service's mount, network and PID handles
with the diagnostic shell's identifies which observations can be made from that shell.
