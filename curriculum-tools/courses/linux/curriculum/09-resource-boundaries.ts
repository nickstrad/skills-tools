import { code, type Module } from "../../../src/types.ts";

export const LIMITS: Module = {
  category: "resource-boundaries",
  title: "Impose per-process and cgroup resource budgets",
  lessons: [
    {
      slug: "limit-open-files",
      title: "Separate soft and hard descriptor limits",
      difficulty: "intermediate",
      tags: ["resource-limits", "file-descriptors", "shell"],
      prerequisites: ["exhaust-file-descriptors"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      revision: 2,
      overview:
        code`Lesson 24 hit the descriptor limit; this lesson looks at the limit itself. Inside a subshell, lower the soft RLIMIT_NOFILE, read both values from /proc/self/limits, prove a child inherits them, raise the soft limit back up to the hard ceiling, then lower the hard ceiling and see which direction is irreversible. The parent shell proves its own limits never moved.`,
      syntaxBreakdown:
        code`ulimit -Sn and ulimit -Hn read or set the soft and hard open-file limits; /proc/self/limits prints both columns for the reading process; bash -c 'ulimit -Sn' shows what a child inherits; a subshell scopes every change; an if on ulimit captures the kernel's refusal without aborting the shell.`,
      code: code`
parent_soft=$(ulimit -Sn)
parent_hard=$(ulimit -Hn)
(
  ulimit -Sn 40
  printf 'subshell_soft=%s subshell_hard=%s\n' "$(ulimit -Sn)" "$(ulimit -Hn)"
  printf 'proc_limits_row=%s\n' "$(awk '/Max open files/{print "soft=" $4 " hard=" $5}' /proc/self/limits)"
  printf 'child_inherited_soft=%s\n' "$(bash -c 'ulimit -Sn')"
  if ulimit -Sn 60 2>/dev/null; then printf 'raise_soft_within_hard=allowed\n'; else printf 'raise_soft_within_hard=denied\n'; fi
  ulimit -Hn 60
  if ulimit -Sn 80 2>/dev/null; then printf 'raise_soft_above_hard=allowed\n'; else printf 'raise_soft_above_hard=denied\n'; fi
  if ulimit -Hn 100 2>/dev/null; then printf 'raise_hard_after_lowering=allowed-privileged\n'; else printf 'raise_hard_after_lowering=denied\n'; fi
  printf 'subshell_final_soft=%s subshell_final_hard=%s\n' "$(ulimit -Sn)" "$(ulimit -Hn)"
)
printf 'parent_soft=%s parent_hard=%s\n' "$parent_soft" "$parent_hard"
if [ "$(ulimit -Sn)" = "$parent_soft" ] && [ "$(ulimit -Hn)" = "$parent_hard" ]; then printf 'parent_limits_unchanged=yes\n'; else printf 'parent_limits_unchanged=no\n'; fi
printf 'cleanup=done\n'
`,
      expectedResult:
        code`subshell_soft=40 next to the unchanged hard value, proc_limits_row=soft=40 hard=<same>, child_inherited_soft=40, raise_soft_within_hard=allowed, raise_soft_above_hard=denied (EINVAL for everyone), raise_hard_after_lowering=denied for an unprivileged user or allowed-privileged when the shell is root (CAP_SYS_RESOURCE), subshell_final_soft=60 with subshell_final_hard=60 (100 as root), parent_limits_unchanged=yes, and cleanup=done.`,
      systemsLens:
        code`A resource limit is a pair: a soft value the process lives under and a hard ceiling it may not exceed. Unprivileged code can tune the soft value freely below the ceiling and can only ever lower the ceiling, which is why supervisors set hard limits before dropping privileges and why a service cannot fix its own RLIMIT_NOFILE at runtime.`,
    },
    {
      slug: "limit-process-count",
      title: "Probe an identity-scoped process limit",
      difficulty: "intermediate",
      tags: ["resource-limits", "processes", "shell"],
      prerequisites: ["limit-open-files"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 14,
      revision: 2,
      overview:
        code`RLIMIT_NPROC counts every process owned by one real user ID, so it is only observable for an unprivileged identity. Run a bounded probe as the nobody user when passwordless sudo allows it (or as yourself otherwise), set the limit a few processes above that user's current count, attempt 16 forks, and count how many the kernel refuses with EAGAIN. Root is exempt, and the lesson labels that case instead of pretending.`,
      syntaxBreakdown:
        code`ps -u USER counts the identity's live processes; resource.setrlimit lowers RLIMIT_NPROC for the probe only; os.fork raises BlockingIOError (EAGAIN) when the limit is reached; os.waitpid reaps every child that was created; sudo -n -u nobody switches identity without a prompt.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
probe_user=$(id -un)
runner=
if id nobody >/dev/null 2>&1 && sudo -n -u nobody true 2>/dev/null; then
  probe_user=nobody
  runner="sudo -n -u nobody"
fi
existing=$(ps -u "$probe_user" --no-headers -o pid 2>/dev/null | wc -l)
limit=$((existing + 6))
printf 'probe_user=%s existing_processes=%s nproc_limit=%s\n' "$probe_user" "$existing" "$limit"
probe=$($runner python3 -c 'import os, resource, sys, time
limit = int(sys.argv[1])
resource.setrlimit(resource.RLIMIT_NPROC, (limit, limit))
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
print("created=%d fork_failures=%d" % (len(children), failures))' "$limit")
printf '%s\n' "$probe"
created=$(printf '%s\n' "$probe" | sed -n 's/.*created=\([0-9]*\).*/\1/p')
failures=$(printf '%s\n' "$probe" | sed -n 's/.*fork_failures=\([0-9]*\).*/\1/p')
if [ "$probe_user" = root ]; then printf 'expected_policy=root-is-exempt\n'; else printf 'expected_policy=enforced-for-unprivileged-identity\n'; fi
if [ -n "$failures" ] && [ "$failures" -gt 0 ] && [ $((created + failures)) -eq 16 ]; then printf 'enforcement=observed\n'; else printf 'enforcement=not-observed\n'; fi
printf 'cleanup=children_reaped\n'
`,
      expectedResult:
        code`probe_user=nobody on a VM with passwordless sudo (or your own unprivileged user), nproc_limit is that user's existing count plus 6, created is about 5 (the probe itself takes one slot), fork_failures is the rest of the 16 attempts, expected_policy=enforced-for-unprivileged-identity, enforcement=observed, and cleanup=children_reaped. When the probe can only run as root, expected_policy=root-is-exempt and enforcement=not-observed is the correct evidence.`,
      systemsLens:
        code`RLIMIT_NPROC is identity-scoped rather than a universal process count: the kernel compares the whole user's process total against the limit at fork time and exempts privileged identities. The same configured value therefore behaves differently for root and for a service account, which is why diagnosis must record both the policy and the execution identity.`,
    },
    {
      slug: "limit-file-size",
      title: "Stop a write at an RLIMIT_FSIZE boundary",
      difficulty: "intermediate",
      tags: ["resource-limits", "filesystem", "storage"],
      prerequisites: ["limit-open-files"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      overview:
        code`Set a one-mebibyte file-size limit in a child and ask dd to write two mebibytes. The resulting signal or nonzero status and final file size show the kernel enforcing a precise per-process write boundary.`,
      syntaxBreakdown:
        code`ulimit -f uses 512-byte blocks; dd emits a bounded stream; stat reads final bytes; an if statement captures the expected nonzero child status without aborting the persistent shell.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
F=$LAB/fsize-$UID.bin
rm -f "$F"
trap 'rm -f "$F"' EXIT
if ( ulimit -f 1024; dd if=/dev/zero of="$F" bs=2048 count=1024 status=none ); then write_status=0; else write_status=$?; fi
size=$(stat -c %s "$F" 2>/dev/null || printf 0)
printf 'write_status=%s final_bytes=%s\n' "$write_status" "$size"
if [ "$write_status" -ne 0 ] && [ "$size" -le 1048576 ]; then printf 'file_size_boundary=observed\n'; else printf 'file_size_boundary=unexpected\n'; fi
rm -f "$F"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`write_status is nonzero, final_bytes is at most 1048576, file_size_boundary=observed, and cleanup=done. Linux commonly reports status 153 for SIGXFSZ, but shell and dd versions may report another nonzero status.`,
      systemsLens:
        code`A resource limit can interrupt a write path at a byte boundary and deliver a signal. This is different from ENOSPC: the limit belongs to the writer, not the filesystem's free blocks.`,
    },
    {
      slug: "limit-cpu-time",
      title: "Trigger a bounded CPU-time limit",
      difficulty: "intermediate",
      tags: ["resource-limits", "scheduling", "signals"],
      prerequisites: ["limit-open-files"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 14,
      overview:
        code`Give one CPU-bound child a one-second CPU limit and watch it with a five-second wall-time watchdog. Capturing its exact wait status demonstrates that accounted processor time can trigger asynchronous policy before wall time expires.`,
      syntaxBreakdown:
        code`ulimit -t sets CPU seconds; kill -0 probes one exact PID; wait captures signal-derived status; a bounded polling loop is the watchdog and never targets unrelated processes.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
p=
timed_out=no
trap 'test -n "$p" && kill "$p" 2>/dev/null || true; test -n "$p" && wait "$p" 2>/dev/null || true' EXIT
bash -c 'ulimit -t 1; while :; do :; done' &
p=$!
ticks=0
while kill -0 "$p" 2>/dev/null; do
  sleep 0.1
  ticks=$((ticks + 1))
  if [ "$ticks" -ge 50 ]; then
    kill "$p" 2>/dev/null || true
    timed_out=yes
    break
  fi
done
if wait "$p"; then status=0; else status=$?; fi
p=
printf 'cpu_limit_status=%s watchdog_timeout=%s\n' "$status" "$timed_out"
if [ "$status" -ne 0 ] && [ "$timed_out" = no ]; then printf 'cpu_limit_triggered=yes\n'; else printf 'cpu_limit_triggered=no\n'; fi
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`cpu_limit_triggered=yes and cleanup=done within the five-second wall bound. cpu_limit_status is commonly 137 when an unhandled hard limit reaches SIGKILL or 152 for SIGXCPU; watchdog_timeout should be no.`,
      systemsLens:
        code`CPU-time limits use scheduler accounting rather than elapsed wall time. They provide a per-process failure boundary for runaway computation, with signal handling and supervisor policy determining the final status.`,
    },
    {
      slug: "inspect-cgroup-v2",
      title: "Inspect the current cgroup v2 accounting domain",
      difficulty: "intermediate",
      tags: ["cgroups", "resource-limits", "procfs"],
      prerequisites: ["map-mounts-and-devices", "limit-open-files"],
      safetyLevel: "read-only",
      runIn: "shell",
      estimatedMinutes: 12,
      overview:
        code`Resolve this shell's cgroup v2 membership from /proc/self/cgroup and its cgroup2 mount, then print controller and current-limit files. The read-only view connects process identity to hierarchical accounting without creating or modifying a group.`,
      syntaxBreakdown:
        code`findmnt locates the cgroup2 mount; /proc/self/cgroup supplies the relative path; stat -fc identifies cgroup2fs; cgroup.controllers and current/max files expose available policy.`,
      code: code`
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
`,
      expectedResult:
        code`cgroup2_mount, self_cgroup, and filesystem_type are printed; on the baseline VM filesystem_type is cgroup2fs and cgroup_view=observed with controller/current/max values. A host without delegated cgroup v2 may print cgroup_view=unavailable without mutation.`,
      systemsLens:
        code`Cgroups form a hierarchy of accounting and control domains. A process can be diagnosed by both its own procfs identity and the group whose controllers impose shared budgets.`,
    },
    {
      slug: "enforce-cgroup-budget",
      title: "Enforce bounded pids and memory in one cgroup",
      difficulty: "advanced",
      tags: ["cgroups", "resource-limits", "processes"],
      prerequisites: ["inspect-cgroup-v2"],
      safetyLevel: "privileged",
      runIn: "shell",
      estimatedMinutes: 18,
      revision: 2,
      overview:
        code`Create a uniquely named cgroup with pids.max=8 and memory.max=64 MiB, move one Python helper into it, and let that helper attempt 16 forks. The helper counts the forks the kernel refused with EAGAIN, and the group's pids.events counter records the same rejections, while the parent stays outside the group.`,
      syntaxBreakdown:
        code`as_root runs a command directly as root or through sudo -n, and cg_write pipes one value through as_root tee because cgroup files are root-owned; as_root mkdir creates the exact child cgroup; pids.max and memory.max set bounded controllers; cgroup.procs moves one PID; os.fork raises BlockingIOError when pids.max is reached; pids.events records the rejected forks; the trap kills the helper and removes the empty group.`,
      code: code`
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
`,
      expectedResult:
        code`On a writable cgroup v2 VM, created=7 fork_failures=9 (the helper itself holds one of the 8 slots), pids_max=8, pids_max_events equal to fork_failures, cgroup_enforcement=observed, and cleanup=cgroup-removed. If delegation or a controller is unavailable, the lesson reports cgroup_setup=unavailable or not-observed and removes only its exact group.`,
      systemsLens:
        code`Cgroup controllers enforce budgets over a set of processes, not over a pathname. The hierarchy lets a supervisor cap fan-out and memory together, then attribute rejected work to the group event counters.`,
      caution:
        code`Run only on a disposable VM. The trap owns this exact cgroup and helper; do not place any unrelated process under the generated linux-tutor name.`,
    },
  ],
};
