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
      revision: 3,
      overview:
        code`Lesson 24 hit the descriptor limit; this lesson looks at the limit itself. Inside a subshell, lower the soft RLIMIT_NOFILE, read both values from /proc/self/limits, prove a child inherits them, raise the soft limit back up to the hard ceiling, then lower the hard ceiling and see which direction is irreversible. The parent shell proves its own limits never moved.`,
      syntaxBreakdown: code`### In plain terms

This experiment distinguishes a soft resource limit, the value the kernel currently enforces, from a hard limit, the ceiling an unprivileged process may not raise. A file descriptor is one numbered handle in a process table; the question is whether changing this shell's limit also changes its children or parent.

### What you are learning

- RLIMIT_NOFILE is a per-process limit inherited across process creation; it is not a host-wide count of open files.
- A subshell is a child Bash process, so changes inside its parentheses disappear when it exits.
- A hard limit is an authority boundary: lowering it is permitted, but raising it again needs the relevant privilege.

### Piece by piece

- **ulimit -Sn** (a Bash builtin and two flags)
  - What it is: ulimit reads or changes a shell resource limit; **-S** selects the soft value and **-n** selects open file descriptors.
  - What it does here: it records the parent value, lowers the child to 40, and tests a later increase.
  - What it gives us: the printed soft number is the value the next descriptor allocation in that shell would face.
- **ulimit -Hn** (the hard-limit form)
  - What it is: **-H** selects the hard ceiling for the same descriptor resource.
  - What it does here: it records the ceiling, lowers it to 60, then asks whether 100 can be restored.
  - What it gives us: a denied restore shows that the irreversible part happened only in the subshell.
- **/proc/self/limits** (a procfs report)
  - What it is: procfs exposes limits of the reading process; its Max open files row has soft and hard columns.
  - What it does here: awk extracts that row after the soft limit changes.
  - What it gives us: proc_limits_row should agree with the ulimit values rather than merely echo the script's intent.
- **bash -c** (a child shell) and **( ... )** (a subshell)
  - What they are: bash -c starts a new Bash; parentheses run commands in a child process.
  - What they do here: the child reports inheritance and the parentheses keep all mutations away from the learner's persistent shell.
  - What they give us: child_inherited_soft and parent_limits_unchanged separate inheritance from parent ownership.
- **if ulimit ...** (a conditional)
  - What it is: Bash tests the command status instead of letting an expected refusal abort the lesson.
  - What it does here: it labels allowed and denied limit changes.
  - What it gives us: read the labeled result with the final soft and hard values; a denial is evidence of the ceiling, not a lesson failure.`,
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
      challenge:
        code`**Predict:** Before running it, decide whether a child shell will print 40 or the original soft limit.

**Inspect and explain:** Explain why parent_limits_unchanged=yes proves process scope, while child_inherited_soft proves inheritance.

**Vary:** Copy this lesson's code into a private Bash run and change only **ulimit -Sn 40** to **ulimit -Sn 32**. The same child-inheritance and parent-unchanged checks then exercise the smaller soft limit and the subshell still exits without changing the parent.

**Hint:** The parentheses, not the numeric value, provide the cleanup boundary.

**Apply:** A service repeatedly reaches EMFILE after its supervisor starts it. Which evidence would you collect first: the service's /proc/PID/limits row, the supervisor's limit, or a filesystem free-space value? Defend the choice from the ownership boundary.`,
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
      revision: 3,
      overview:
        code`RLIMIT_NPROC counts every process owned by one real user ID, so it is only observable for an unprivileged identity. Run a bounded probe as the nobody user when passwordless sudo allows it (or as yourself otherwise), set the limit a few processes above that user's current count, attempt 16 forks, and count how many the kernel refuses with EAGAIN. Root is exempt, and the lesson labels that case instead of pretending.`,
      syntaxBreakdown: code`### In plain terms

RLIMIT_NPROC is unusual because the kernel accounts processes for a real user ID, not just for one shell. This bounded probe chooses an unprivileged identity where possible, sets a small limit in that probe, and separates a refused fork from a successful child that was later reaped.

### What you are learning

- Per-real-UID accounting can include processes created by other shells of the same identity.
- Root may be exempt from this resource limit, so a root result is a policy observation rather than proof of enforcement.
- Reaping a child removes the parent's waitable record and is required cleanup after a successful fork.

### Piece by piece

- **id nobody** and **sudo -n -u nobody** (identity probes and switch)
  - What they are: id checks whether the account exists; sudo **-n** refuses to prompt and **-u** selects that account.
  - What they do here: they prefer nobody only when a noninteractive switch is allowed.
  - What they give us: probe_user states whose real UID the result belongs to.
- **ps -u USER --no-headers -o pid** (a process listing)
  - What it is: ps filters by user; **--no-headers** removes the column title and **-o pid** prints only identifiers.
  - What it does here: it counts existing processes before choosing a limit.
  - What it gives us: existing_processes makes clear that the configured limit is not a shell-local quota.
- **resource.setrlimit** and **RLIMIT_NPROC** (Python resource API)
  - What they are: setrlimit changes a limit of the Python probe; RLIMIT_NPROC names the process-count resource.
  - What they do here: they set both soft and hard values to the bounded computed limit.
  - What they give us: the limit applies only to fork attempts under that real UID.
- **os.fork**, **BlockingIOError**, and **os.waitpid** (process lifecycle calls)
  - What they are: fork duplicates a process, BlockingIOError represents EAGAIN, and waitpid reaps an exact child.
  - What they do here: at most 16 forks are attempted and each created child sleeps briefly then exits.
  - What they give us: created plus fork_failures must total 16; cleanup is not inferred from an error message.
- **expected_policy** (a labeled interpretation)
  - What it is: the script records the execution identity before judging the result.
  - What it does here: it labels root exemption separately from an unprivileged enforcement observation.
  - What it gives us: enforcement=not-observed under root does not establish that the configured limit is ineffective for a service account.`,
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
      challenge:
        code`**Predict:** If another shell already owns processes for probe_user, will the probe start at zero usage? State why.

**Inspect and explain:** Use existing_processes and created to explain why the limit is tied to a real UID rather than a single parent PID.

**Vary:** Copy the full probe into a private run and change only **limit=$((existing + 6))** to **limit=$((existing + 4))**. It still attempts exactly 16 forks and reaps every created child, so it exercises the same real-UID accounting under a smaller headroom.

**Hint:** A process limit can be inherited by a process, while its accounting population can be wider than that process tree.

**Apply:** A multi-worker service fails to fork only after another service account deployment. What UID-scoped evidence and cgroup evidence would you collect before changing either limit?`,
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
      revision: 2,
      overview:
        code`Set a one-mebibyte file-size limit in a child and ask dd to write two mebibytes. The resulting signal or nonzero status and final file size show the kernel enforcing a precise per-process write boundary.`,
      syntaxBreakdown: code`### In plain terms

This lesson gives only the writer a one-MiB file-size budget, then asks it to write two MiB. RLIMIT_FSIZE is a process policy; it differs from a full filesystem because another writer with no such limit may still have space.

### What you are learning

- RLIMIT_FSIZE limits bytes written to a regular file by the affected process.
- SIGXFSZ or another nonzero result is evidence that the kernel stopped this write path.
- File length is separate evidence from command status.

### Piece by piece

- **ulimit -f 1024** (a Bash limit setting)
  - What it is: in normal Bash, **-f** selects maximum file size in 1024-byte blocks, so 1024 is one MiB. POSIXLY_CORRECT can request POSIX-compatible 512-byte units, so final_bytes is the measurement that resolves the active shell's convention.
  - What it does here: it runs only inside the parentheses surrounding dd.
  - What it gives us: the child inherits a bounded writer policy while the parent remains unchanged.
- **dd if=/dev/zero of=FILE bs=2048 count=1024 status=none** (a bounded writer)
  - What it is: dd copies fixed-size blocks; **if** selects zero bytes, **of** names the lab file, **bs** is bytes per block, **count** is blocks, and **status=none** suppresses progress noise.
  - What it does here: it requests two MiB of output.
  - What it gives us: a nonzero write_status and final_bytes at or below the configured ceiling demonstrate enforcement.
- **stat -c %s** (a metadata query)
  - What it is: stat reads file metadata and **-c %s** prints logical length in bytes.
  - What it does here: it measures the resulting file after dd returns.
  - What it gives us: do not infer a precise boundary from a signal alone; read final_bytes.
- **if ( ... ); then** and **trap** (control and cleanup)
  - What they are: the conditional retains an expected nonzero status, while the EXIT trap removes only this lab file.
  - What they do here: they keep the persistent learner shell usable after a limit signal.
  - What they give us: cleanup=done confirms the temporary evidence file was removed.`,
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
      challenge:
        code`**Predict:** Will a second shell that did not enter the parentheses inherit this one-MiB writer budget?

**Inspect and explain:** Explain why final_bytes and write_status together distinguish an enforced writer limit from a successful short write.

**Vary:** Copy the full lesson into a private run and change only **ulimit -f 1024** to **ulimit -f 512**. The existing status, stat, trap, and exact-file cleanup then measure the smaller writer boundary.

**Hint:** Keep the variation in parentheses so its ulimit cannot affect later lessons.

**Apply:** A log writer stops with SIGXFSZ while df shows free blocks. Which owner and limit would you inspect before attempting filesystem cleanup?`,
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
      revision: 2,
      overview:
        code`Give one CPU-bound child a one-second CPU limit and watch it with a five-second wall-time watchdog. Capturing its exact wait status demonstrates that accounted processor time can trigger asynchronous policy before wall time expires.`,
      syntaxBreakdown: code`### In plain terms

The child in this experiment consumes CPU in a tight loop but has a one-second CPU-time budget. CPU time counts scheduled execution, whereas the watchdog counts elapsed waiting time, so the two measurements answer different operational questions.

### What you are learning

- RLIMIT_CPU applies to CPU seconds consumed by one process, not to its wall-clock lifetime.
- A wait status records normal exit or signal-derived termination for an exact child.
- A watchdog must bound the experiment without becoming evidence that the resource limit fired.

### Piece by piece

- **bash -c 'ulimit -t 1; while :; do :; done'** (a bounded-policy child)
  - What it is: bash **-c** executes the quoted program; **-t** selects CPU seconds; the colon is a shell builtin that makes the loop CPU-bound.
  - What it does here: it creates one exact child whose limit is one CPU second.
  - What it gives us: only that child can receive the limit's signal.
- **&** and **$!** (background control)
  - What they are: ampersand backgrounds the child and $! records its PID.
  - What they do here: they allow the parent to observe the child without guessing its identity.
  - What they give us: the trap and wait target only p.
- **kill -0 PID** (a liveness probe)
  - What it is: signal zero performs permission and existence checking without delivering a signal.
  - What it does here: it drives a 50-iteration, 0.1-second watchdog loop.
  - What it gives us: watchdog_timeout=yes means the fallback kill occurred, so it cannot prove CPU-limit enforcement.
- **wait PID** and **status** (completion evidence)
  - What they are: wait joins an exact child and returns its shell status; an if captures nonzero safely.
  - What they do here: they record the termination after the process disappears.
  - What they give us: cpu_limit_triggered=yes requires nonzero status and no watchdog fallback, while the numeric status can vary.`,
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
      challenge:
        code`**Predict:** On a busy host, which can grow faster for this child: elapsed wall time or CPU time?

**Inspect and explain:** Explain why watchdog_timeout=no is necessary before interpreting cpu_limit_status as limit evidence.

**Vary:** Copy the full lesson into a private run and change only the child setting **ulimit -t 1** to **ulimit -t 2**, while changing the watchdog bound from 50 to 60 ticks. It remains bounded at six seconds and uses the same exact-PID wait evidence.

**Hint:** The child's CPU limit lives inside bash -c; timeout counts elapsed time outside it.

**Apply:** A service has low CPU usage but long request latency. Would RLIMIT_CPU alone explain it? Name the scheduler or I/O evidence you would obtain.`,
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
      revision: 2,
      overview:
        code`Resolve this shell's cgroup v2 membership from /proc/self/cgroup and its cgroup2 mount, then print controller and current-limit files. The read-only view connects process identity to hierarchical accounting without creating or modifying a group.`,
      syntaxBreakdown: code`### In plain terms

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
  - What they give us: cgroup_view=observed is evidence of a readable view, not evidence that this lesson changed any policy.`,
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
      challenge:
        '**Predict:** Which value should change when another process in the same cgroup allocates memory: memory.current or memory.max?\n\n**Inspect and explain:** Explain why self_cgroup is needed before treating a memory.current value as evidence about this shell\'s resource domain.\n\n**Vary:** Rerun the complete lesson and insert wc -l "$current/cgroup.procs" immediately after the pids_max printf line, inside the readable-cgroup branch. This counts process membership records, while pids.current accounts tasks including threads.\n\n**Hint:** Do not write controller files for this variation; visibility and delegation are separate questions.\n\n**Apply:** A service has a generous per-process RLIMIT_NOFILE but still cannot fork. Which cgroup pids values and UID-scoped values would you compare?',
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
      revision: 3,
      overview:
        code`Create a uniquely named cgroup with pids.max=8 and memory.max=64 MiB, move one Python helper into it, and let that helper attempt 16 forks. The helper counts the forks the kernel refused with EAGAIN, and the group's pids.events counter records the same rejections, while the parent stays outside the group.`,
      syntaxBreakdown: code`### In plain terms

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
  - What they give us: cgroup_enforcement=observed requires a refusal and a nonzero event count, while unavailable or not-observed must remain clearly labeled.`,
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
      challenge:
        code`**Predict:** If a second helper joined the same generated cgroup, would pids.max be shared or duplicated?

**Inspect and explain:** Explain why pids.events is stronger evidence than a printed fork failure alone, and why neither proves a memory budget was exercised.

**Vary:** With the same disposable-VM permission, copy the full lesson into a private run and change only the **pids.max** write from 8 to 4. Keep the 16-attempt helper and its existing pids.events read before cleanup; the generated group and child bound stay unchanged.

**Hint:** First establish cgroup_setup=available. A policy skip is not a reason to claim an event counter increment.

**Apply:** Choose a limit for a service that must contain a fan-out bug shared by several workers. Explain why cgroup pids.max, RLIMIT_NPROC, or RLIMIT_NOFILE matches the ownership you need.`,
    },
  ],
};
