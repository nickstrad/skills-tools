# Localize an OOM kill to one cgroup

slug: bounded-oom-kill
category: virtual-memory
difficulty: advanced
tags: virtual-memory, cgroups, troubleshooting
prerequisites: reclaim-under-pressure
safety: dangerous
run-in: shell
sessions: 1
min-version: 5.1
minutes: 16
revision: 3

## Overview
Give one uniquely named child cgroup a 64 MiB memory ceiling and let an exact helper attempt a bounded 128 MiB allocation. The helper may be killed by the cgroup OOM policy, while the parent remains alive to read the group's oom_kill counter and prove failure was localized.

## Syntax breakdown
### In plain terms

One helper attempts 128 MiB inside a new cgroup capped at 64 MiB, while its parent stays outside to observe the result. A changed **oom_kill** counter and a living parent establish the intended local failure boundary; lack of cgroup delegation is reported as untested.

### What you are learning

- memory.max bounds a cgroup and may trigger a local OOM kill when allocation cannot proceed.
- A counter plus a surviving outside supervisor is stronger evidence than a signal status alone.

### Piece by piece

- **memory.max** and **memory.swap.max** (cgroup limits): write byte limits only to the fresh child cgroup; zero swap avoids moving this small test to swap.
- **cgroup.procs** (membership file): receives the exact child PID after READY, so the parent never joins the constrained group.
- **bytearray(128*1024*1024)** and page writes (bounded demand): asks for twice the max and touches pages; RESULT exists only if allocation completed unexpectedly.
- **wait**, **memory.events oom_kill**, and **child_status** (failure evidence): wait reports child termination, events counts the cgroup OOM kill, and parent_alive confirms the observer remained outside.
- **cgroup.kill**, **rmdir**, and trap (cleanup): remove only the exact test group and files.

## Caution
Dangerous by design: run only on a disposable VM with this exact cgroup code and cleanup trap. The allocation is capped at 128 MiB and the parent is never moved into the cgroup.

## Run
```sh
(
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo -n "$@"; fi; }
cg_write() { printf '%s' "$2" | as_root tee "$1" >/dev/null; }
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
CG=
RESULT=$LAB/oom-result-$UID
READY=$LAB/oom-ready-$UID
GO=$LAB/oom-go-$UID
rm -f "$RESULT" "$READY" "$GO"
child_pid=
cleanup_oom() {
  test -n "$child_pid" && kill "$child_pid" 2>/dev/null || true
  test -n "$child_pid" && wait "$child_pid" 2>/dev/null || true
  test -f "$CG/cgroup.kill" && cg_write "$CG/cgroup.kill" 1 2>/dev/null || true
  test -d "$CG" && as_root rmdir "$CG" 2>/dev/null || true
  rm -f "$RESULT" "$READY" "$GO"
}
trap cleanup_oom EXIT
mountpoint=$(findmnt -t cgroup2 -n -o TARGET 2>/dev/null)
if [ -z "$mountpoint" ] || ! as_root test -w "$mountpoint"; then printf 'cgroup_setup=unavailable\n'; exit 0; fi
CG=$mountpoint/linux-tutor-$UID-$BASHPID-$RANDOM
if ! as_root mkdir "$CG" 2>/dev/null; then printf 'cgroup_setup=unavailable\n'; exit 0; fi
cg_write "$CG/memory.max" 67108864
cg_write "$CG/memory.swap.max" 0 2>/dev/null || true
before=$(awk '$1=="oom_kill"{print $2}' "$CG/memory.events")
export RESULT READY GO
python3 -c 'import os, time; open(os.environ["READY"], "w").close();
while not os.path.exists(os.environ["GO"]): time.sleep(0.01)
data=bytearray(128*1024*1024); [data.__setitem__(offset, 1) for offset in range(0, len(data), 4096)]; open(os.environ["RESULT"], "w").write("allocation_completed=unexpected\n")' &
child_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  [ -e "$READY" ] && break
  sleep 0.05
done
if ! cg_write "$CG/cgroup.procs" "$child_pid" 2>/dev/null; then printf 'cgroup_move=unavailable\n'; exit 0; fi
touch "$GO"
if wait "$child_pid"; then child_status=0; else child_status=$?; fi
child_pid=
after=$(awk '$1=="oom_kill"{print $2}' "$CG/memory.events")
printf 'child_status=%s\n' "$child_status"
printf 'oom_kill_before=%s\n' "$before"
printf 'oom_kill_after=%s\n' "$after"
printf 'parent_alive=yes\n'
if [ "$after" -gt "$before" ] && [ ! -e "$RESULT" ]; then printf 'oom_kill_increment=yes\n'; else printf 'oom_kill_increment=no\n'; fi
cleanup_oom
trap - EXIT
printf 'cleanup=cgroup-removed\n'
)
```

## Expected result
On a delegated cgroup v2 VM, oom_kill_after is greater than oom_kill_before, the allocation result file is absent, parent_alive=yes, oom_kill_increment=yes, and cleanup=cgroup-removed; child_status is commonly 137 but may vary by signal reporting. If delegation is unavailable the lesson prints cgroup_setup=unavailable and leaves no resource behind.

## Systems lens
An OOM policy can terminate a member of a resource domain rather than taking down every process on the host. The event counter and surviving supervisor are the operational evidence that the failure boundary worked.

## Optional variation
**Predict:** Would a 96 MiB allocation fit inside a 64 MiB maximum, even though it is smaller than the original attempt?

**Inspect and explain:** Join the OOM event increment, child wait status and surviving parent; a signal status alone is insufficient.

**Vary:** Rerun the complete disposable-cgroup lesson, changing bytearray(128*1024*1024) to bytearray(96*1024*1024). It still exceeds the 64 MiB maximum; retain the OOM event assertion and outside supervisor.

**Hint:** Never reuse a cgroup that might contain another process.

**Apply:** State why a supervisor needs both cgroup OOM evidence and a request-level recovery check before declaring containment successful.
