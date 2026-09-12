# Observe credential remapping in a user namespace

slug: map-user-namespace
category: namespaces-and-isolation
difficulty: advanced
tags: namespaces, isolation, processes
prerequisites: inspect-namespace-membership
safety: privileged
run-in: shell
sessions: 1
min-version: 5.1
minutes: 13
revision: 3

## Overview
Use map-root-user mode to compare outer and inner UIDs and uid_map. The experiment demonstrates credential translation rather than changing the host account, with a clear skip if disabled. This is the one namespace lesson that deliberately runs without sudo: user namespaces exist so that unprivileged processes can do this.

## Syntax breakdown
### In plain terms

A user namespace translates credentials between an inner and outer view. Inner UID 0 means root in that namespace's mapping; it does not make the process host root or automatically authorize host operations.

### What you are learning

- --user selects a user namespace and --map-root-user maps the caller to inner UID 0 when policy permits.
- uid_map is the evidence for translation; an inner UID label alone is incomplete.
- Unprivileged namespace creation can be disabled by host policy, which leaves the mechanism untested.

### Piece by piece

- **timeout 5s unshare --user --map-root-user bash -c** (a bounded credential view)
  - What it is: timeout bounds elapsed time; **--user** creates a user namespace; **--map-root-user** asks unshare to map the calling user to inner zero; bash **-c** prints inner evidence.
  - What it does here: it runs without sudo specifically to test permitted unprivileged user namespaces.
  - What it gives us: unshare_status distinguishes an actual mapping from policy denial.
- **id -u** (a UID query)
  - What it is: id **-u** prints the effective numeric user ID in the calling namespace.
  - What it does here: outer_uid is collected before unshare and inner_uid inside it.
  - What it gives us: inner_uid=0 is expected only with uid_map evidence.
- **/proc/self/uid_map** and **tr '\\n' ';'** (mapping evidence)
  - What they are: uid_map contains inner-ID, outer-ID, and length ranges; tr makes its rows printable on one label.
  - What they do here: the inner command exports uid_map_seen to the parent result.
  - What they give us: the mapping beginning at outer_uid shows translation rather than a host account change.
- **status=0; COMMAND || status=$?** and **skip_reason** (policy classification)
  - What they do here: preserve an unshare error and print only its first bounded line.
  - What they give us: skipped-host-policy names missing authority; it does not prove either security or successful isolation.

## Caution
Use only the disposable VM and retain the skip branch. Do not grant extra host capabilities or write outside the lab.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
OUT=$LAB/user-namespace-$UID-$$.out
trap 'rm -f "$OUT"' EXIT
outer_uid=$(id -u)
status=0
timeout 5s unshare --user --map-root-user bash -c 'printf "inner_uid=%s\n" "$(id -u)"; printf "uid_map="; tr "\\n" ";" < /proc/self/uid_map' >"$OUT" 2>&1 || status=$?
printf 'outer_uid=%s\nunshare_status=%s\n' "$outer_uid" "$status"
if [ "$status" -eq 0 ] && grep -q 'inner_uid=0' "$OUT"; then
  printf 'inner_uid=0\nuid_map_seen=%s\nuser_namespace_remapped=yes\n' "$(grep -o 'uid_map=.*' "$OUT" | head -n 1)"
else
  printf 'user_namespace_remapped=skipped-host-policy\nskip_reason=%s\n' "$(head -n 1 "$OUT" | cut -c1-120)"
fi
rm -f "$OUT"
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
On a VM allowing user namespaces, unshare_status=0, inner_uid=0, uid_map_seen contains a mapping beginning at outer_uid, and user_namespace_remapped=yes. A policy denial is a valid skipped-host-policy result; no host UID changes.

## Systems lens
User namespaces give a process a translated credential view. Namespace root is not automatically host root; capability checks use the mapped user namespace context.

## Optional variation
**Predict:** If inner_uid=0 appears, is the outer account now host root? Explain using uid_map.

**Inspect and explain:** Read uid_map_seen as inner range, outer range, and length. Explain what mapping evidence is absent on a policy skip.

**Vary:** In a complete rerun, replace every id -u with id -g, outer_uid with outer_gid, inner_uid with inner_gid, and uid_map with gid_map. Keep --map-root-user. Compare the resulting group mapping with the original user mapping.

**Hint:** id -g reports the effective group ID; gid_map describes its mapping. User and group numbers have meaning only with the namespace mapping that interprets them.

**Apply:** A process reports UID 0 inside a sandbox. What mapping and capability-context evidence would you need before authorizing a host-level action?
