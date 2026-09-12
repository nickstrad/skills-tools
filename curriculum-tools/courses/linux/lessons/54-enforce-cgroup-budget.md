# Enforce bounded pids and memory in one cgroup

slug: enforce-cgroup-budget
category: resource-boundaries
difficulty: advanced
tags: cgroups, resource-limits, processes
prerequisites: inspect-cgroup-v2
safety: privileged
run-in: shell
sessions: 1
min-version: 5.1
minutes: 18
revision: 3

## Overview
Create a uniquely named cgroup with pids.max=8 and memory.max=64 MiB, move one Python helper into it, and let that helper attempt 16 forks. The helper counts the forks the kernel refused with EAGAIN, and the group's pids.events counter records the same rejections, while the parent stays outside the group.

## Syntax breakdown
### In plain terms

This experiment asks a cgroup controller to budget a group of processes, then moves one helper into that group before it forks. The evidence is both the helper's EAGAIN count and the cgroup event counter; unlike RLIMIT_NPROC, the accounting follows membership in this generated group.

### What you are learning

- pids.max limits the number of tasks in a cgroup subtree, while pids.events reports controller rejections.
- memory.max is a separate shared budget configured here but not used as proof of a memory event.
- A writable cgroup mount or controller delegation is host policy; unavailable setup is not successful enforcement.

### Piece by piece

- **as_root** and **sudo -n** (a privilege wrapper)
  - What they are: as_root runs directly as UID 0 or uses noninteractive sudo; **-n** prevents a hidden password prompt.
  - What they do here: they perform only the generated cgroup operations.
  - What they give us: a denial becomes cgroup_setup=unavailable instead of hanging the shell.
- **cg_write FILE VALUE** and **tee** (a privileged file write)
  - What they are: the helper pipes exactly one value to tee because shell redirection itself would remain unprivileged.
  - What they do here: they set pids.max, memory.max, and cgroup.procs.
  - What they give us: each write has an exact cgroup-file target.
- **linux-tutor-UID-PID-RANDOM** (a generated cgroup name)
  - What it is: a unique child directory under the discovered cgroup2 mount.
  - What it does here: it prevents the cleanup trap from matching another user's resource domain.
  - What it gives us: cleanup_budget can remove only the empty exact group it created.
- **pids.max**, **cgroup.procs**, and **pids.events** (controller files)
  - What they are: max configures the task ceiling, procs accepts a PID for membership, and events counts rejected attempts.
  - What they do here: the helper enters before its 16 bounded forks.
  - What they give us: pids_max_events is controller evidence that complements fork_failures; do not demand a fixed count because existing membership and kernel details vary.
- **os.fork**, **BlockingIOError**, **os.waitpid**, and **trap** (bounded workload and cleanup)
  - What they are: Python creates and reaps exact children; the Bash trap terminates the recorded helper and removes generated lab files.
  - What they do here: no more than 16 children sleep for one second.
  - What they give us: cgroup_enforcement=observed requires a refusal and a nonzero event count, while unavailable or not-observed must remain clearly labeled.

## Caution
Run only on a disposable VM. The trap owns this exact cgroup and helper; do not place any unrelated process under the generated linux-tutor name.

## Run
```sh
(
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo -n "$@"; fi; }
cg_write() { printf '%s' "$2" | as_root tee "$1" >/dev/null; }
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
CG=
R=$LAB/cgroup-budget-$UID
READY=$LAB/cgroup-budget-ready-$UID
GO=$LAB/cgroup-budget-go-$UID
rm -f "$R" "$READY" "$GO"
p=
cleanup_budget() {
  test -n "$p" && kill "$p" 2>/dev/null || true
  test -n "$p" && wait "$p" 2>/dev/null || true
  test -f "$CG/cgroup.kill" && cg_write "$CG/cgroup.kill" 1 2>/dev/null || true
  test -d "$CG" && as_root rmdir "$CG" 2>/dev/null || true
  rm -f "$R" "$READY" "$GO"
}
trap cleanup_budget EXIT
mountpoint=$(findmnt -t cgroup2 -n -o TARGET 2>/dev/null)
if [ -z "$mountpoint" ] || ! as_root test -w "$mountpoint"; then printf 'cgroup_setup=unavailable\n'; exit 0; fi
CG=$mountpoint/linux-tutor-$UID-$BASHPID-$RANDOM
if ! as_root mkdir "$CG" 2>/dev/null; then printf 'cgroup_setup=unavailable\n'; exit 0; fi
cg_write "$CG/pids.max" 8 2>/dev/null || true
cg_write "$CG/memory.max" 67108864 2>/dev/null || true
export R READY GO
python3 -c 'import os, time
open(os.environ["READY"], "w").close()
while not os.path.exists(os.environ["GO"]):
    time.sleep(0.01)
children = []
failures = 0
for attempt in range(16):
    try:
        pid = os.fork()
    except BlockingIOError:
        failures += 1
        continue
    if pid == 0:
        time.sleep(1)
        os._exit(0)
    children.append(pid)
for pid in children:
    os.waitpid(pid, 0)
open(os.environ["R"], "w").write("created=%d fork_failures=%d\n" % (len(children), failures))' &
p=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$READY" ] && break
  sleep 0.05
done
if ! cg_write "$CG/cgroup.procs" "$p" 2>/dev/null; then printf 'cgroup_move=unavailable\n'; exit 0; fi
touch "$GO"
wait "$p" 2>/dev/null || true
p=
pids_max=$(cat "$CG/pids.max")
events=$(awk '$1=="max"{print $2}' "$CG/pids.events" 2>/dev/null || printf 0)
cat "$R" 2>/dev/null || printf 'created=unknown fork_failures=unknown\n'
failures=$(sed -n 's/.*fork_failures=\([0-9]*\).*/\1/p' "$R" 2>/dev/null)
printf 'pids_max=%s pids_max_events=%s\n' "$pids_max" "$events"
if [ -n "$failures" ] && [ "$failures" -gt 0 ] && [ "$events" -gt 0 ]; then printf 'cgroup_enforcement=observed\n'; else printf 'cgroup_enforcement=not-observed\n'; fi
cleanup_budget
trap - EXIT
printf 'cleanup=cgroup-removed\n'
)
```

## Expected result
On a writable cgroup v2 VM, created=7 fork_failures=9 (the helper itself holds one of the 8 slots), pids_max=8, pids_max_events equal to fork_failures, cgroup_enforcement=observed, and cleanup=cgroup-removed. If delegation or a controller is unavailable, the lesson reports cgroup_setup=unavailable or not-observed and removes only its exact group.

## Systems lens
Cgroup controllers enforce budgets over a set of processes, not over a pathname. The hierarchy lets a supervisor cap fan-out and memory together, then attribute rejected work to the group event counters.

## Optional variation
**Predict:** If a second helper joined the same generated cgroup, would pids.max be shared or duplicated?

**Inspect and explain:** Explain why pids.events is stronger evidence than a printed fork failure alone, and why neither proves a memory budget was exercised.

**Vary:** With the same disposable-VM permission, copy the full lesson into a private run and change only the **pids.max** write from 8 to 4. Keep the 16-attempt helper and its existing pids.events read before cleanup; the generated group and child bound stay unchanged.

**Hint:** First establish cgroup_setup=available. A policy skip is not a reason to claim an event counter increment.

**Apply:** Choose a limit for a service that must contain a fan-out bug shared by several workers. Explain why cgroup pids.max, RLIMIT_NPROC, or RLIMIT_NOFILE matches the ownership you need.
