import { code, type Module } from "../../../src/types.ts";

export const LIMITS: Module = {
  category: "resource-boundaries",
  title: "Impose per-process and cgroup resource budgets",
  lessons: [
    {
      slug: "limit-open-files",
      title: "Apply an open-file limit to one subshell",
      difficulty: "intermediate",
      tags: ["resource-limits", "file-descriptors", "shell"],
      prerequisites: ["exhaust-file-descriptors"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      overview:
        code`Lower RLIMIT_NOFILE only inside a subshell, inspect its limits file, and open descriptors until Bash reaches the boundary. The parent then proves its own limit was not changed.`,
      syntaxBreakdown:
        code`ulimit -n sets the soft descriptor limit; /proc/self/limits reports the effective bound; dynamic exec opens numbered descriptors; wait is unnecessary because the bounded subshell closes them at exit.`,
      code: code`
LAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"; F=$LAB/rlimit-fd-$UID; E=$LAB/rlimit-fd-$UID.err; rm -f "$F" "$E"; parent=$(ulimit -n); trap 'rm -f "$F" "$E"' EXIT
(
  trap 'rm -f "$F" "$E"' EXIT; ulimit -n 32; configured=$(awk '/Max open files/{print $4}' /proc/self/limits); opened=0; failed=
  for fd in $(seq 10 80); do if eval "exec $fd>>\"$F\"" 2>>"$E"; then opened=$((opened+1)); else failed=$fd; break; fi; done
  printf 'subshell_limit=%s opened_before_failure=%s failed_fd=%s\n' "$configured" "$opened" "$failed"; if [ -n "$failed" ]; then printf 'descriptor_error=too_many_open_files\n'; printf 'descriptor_boundary=observed\n'; else printf 'descriptor_boundary=unexpected\n'; fi
)
printf 'parent_limit=%s parent_limit_unchanged=%s\n' "$parent" "$(test "$(ulimit -n)" = "$parent" && echo yes || echo no)"; rm -f "$F" "$E"; trap - EXIT; printf 'cleanup=done\n'
`,
      expectedResult:
        code`subshell_limit=32, a failed descriptor number and descriptor_error=too_many_open_files evidence produce descriptor_boundary=observed, parent_limit_unchanged=yes, and cleanup=done. Exact opened count depends on inherited descriptors.`,
      systemsLens:
        code`RLIMIT_NOFILE bounds kernel descriptor references in one process and its descendants. It is a local guardrail for leaks and fan-out, distinct from a filesystem's total capacity.`,
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
      overview:
        code`Set RLIMIT_NPROC to 16 in a subshell and attempt no more than 16 short child processes. The result records whether this VM enforces the identity-scoped limit, including the important case where root or the kernel configuration makes it non-observable.`,
      syntaxBreakdown:
        code`ulimit -u reads and sets process count; background sleep creates bounded children; exact PID lists enable cleanup; ps reports the parent identity without host-wide killing.`,
      code: code`
LAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"; result=$LAB/nproc-$UID; rm -f "$result"; trap 'rm -f "$result"' EXIT
(
  pids=; trap 'for p in $pids; do kill "$p" 2>/dev/null || true; done; for p in $pids; do wait "$p" 2>/dev/null || true; done' EXIT; ulimit -u 16; limit=$(ulimit -u); created=0; failures=0
  for i in $(seq 1 16); do if sleep 1 & then pids="$pids $!"; created=$((created+1)); else failures=$((failures+1)); fi; done
  printf 'nproc_limit=%s created=%s fork_failures=%s\n' "$limit" "$created" "$failures" > "$result"; if [ "$failures" -gt 0 ]; then printf 'enforcement=observed\n' >> "$result"; else printf 'enforcement=not-observed\n' >> "$result"; fi
)
cat "$result"; printf 'cleanup=done\n'; rm -f "$result"; trap - EXIT
`,
      expectedResult:
        code`nproc_limit=16 and created plus fork_failures are each bounded by 16. enforcement=observed is valid when the identity limit rejects a fork; enforcement=not-observed is expected for root or VMs that do not enforce this limit. cleanup=done proves exact children were reaped.`,
      systemsLens:
        code`RLIMIT_NPROC is identity-scoped rather than a universal process count. The same configured value can behave differently for privileged and unprivileged identities, which is why diagnosis must record both policy and execution identity.`,
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
LAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"; F=$LAB/fsize-$UID.bin; rm -f "$F"; trap 'rm -f "$F"' EXIT
if ( ulimit -f 1024; dd if=/dev/zero of="$F" bs=2048 count=1024 status=none ); then write_status=0; else write_status=$?; fi
size=$(stat -c %s "$F" 2>/dev/null || printf 0); printf 'write_status=%s final_bytes=%s\n' "$write_status" "$size"
if [ "$write_status" -ne 0 ] && [ "$size" -le 1048576 ]; then printf 'file_size_boundary=observed\n'; else printf 'file_size_boundary=unexpected\n'; fi
rm -f "$F"; trap - EXIT; printf 'cleanup=done\n'
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
LAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"; p=; timed_out=no
trap 'test -n "$p" && kill "$p" 2>/dev/null || true; test -n "$p" && wait "$p" 2>/dev/null || true' EXIT
bash -c 'ulimit -t 1; while :; do :; done' & p=$!; ticks=0
while kill -0 "$p" 2>/dev/null; do sleep 0.1; ticks=$((ticks+1)); if [ "$ticks" -ge 50 ]; then kill "$p" 2>/dev/null || true; timed_out=yes; break; fi; done
if wait "$p"; then status=0; else status=$?; fi; p=; printf 'cpu_limit_status=%s watchdog_timeout=%s\n' "$status" "$timed_out"; if [ "$status" -ne 0 ] && [ "$timed_out" = no ]; then printf 'cpu_limit_triggered=yes\n'; else printf 'cpu_limit_triggered=no\n'; fi; trap - EXIT; printf 'cleanup=done\n'
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
LAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mountpoint=$(findmnt -t cgroup2 -n -o TARGET 2>/dev/null); rel=$(awk -F: '$1=="0"{print $3}' /proc/self/cgroup); current=$mountpoint$rel; if [ -z "$rel" ]; then current=$mountpoint; fi
printf 'cgroup2_mount=%s\n' "$mountpoint"; printf 'self_cgroup=%s\n' "$rel"; printf 'filesystem_type=%s\n' "$(stat -fc %T "$current" 2>/dev/null || printf unavailable)"
if [ -d "$current" ] && [ -r "$current/cgroup.controllers" ]; then printf 'controllers=%s\n' "$(cat "$current/cgroup.controllers")"; printf 'memory_current=%s\n' "$(cat "$current/memory.current" 2>/dev/null || printf unavailable)"; printf 'memory_max=%s\n' "$(cat "$current/memory.max" 2>/dev/null || printf unavailable)"; printf 'pids_current=%s\n' "$(cat "$current/pids.current" 2>/dev/null || printf unavailable)"; printf 'pids_max=%s\n' "$(cat "$current/pids.max" 2>/dev/null || printf unavailable)"; printf 'cgroup_view=observed\n'; else printf 'cgroup_view=unavailable\n'; fi
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
      overview:
        code`Create a uniquely named cgroup with pids.max=8 and memory.max=64 MiB, move one helper into it, and make that helper attempt at most 16 child sleeps. Reading the helper's result and pids.events demonstrates controller enforcement while the parent stays outside the group.`,
      syntaxBreakdown:
        code`mkdir creates the exact child cgroup; pids.max and memory.max set bounded controllers; cgroup.procs moves one PID; pids.events records rejected forks; trap kills the helper and removes the empty group.`,
      code: code`
(
LAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"; CG=; R=$LAB/cgroup-budget-$UID; READY=$LAB/cgroup-budget-ready-$UID; GO=$LAB/cgroup-budget-go-$UID; rm -f "$R" "$READY" "$GO"; p=
cleanup_budget() { test -n "$p" && kill "$p" 2>/dev/null || true; test -n "$p" && wait "$p" 2>/dev/null || true; test -f "$CG/cgroup.kill" && printf 1 > "$CG/cgroup.kill" 2>/dev/null || true; test -d "$CG" && rmdir "$CG" 2>/dev/null || true; rm -f "$R" "$READY" "$GO"; }
trap cleanup_budget EXIT; mountpoint=$(findmnt -t cgroup2 -n -o TARGET 2>/dev/null); if [ -z "$mountpoint" ] || [ ! -w "$mountpoint" ]; then printf 'cgroup_setup=unavailable\n'; exit 0; fi; CG=$mountpoint/linux-tutor-$UID-$BASHPID-$RANDOM; if ! mkdir "$CG" 2>/dev/null; then printf 'cgroup_setup=unavailable\n'; exit 0; fi
printf 8 > "$CG/pids.max" 2>/dev/null || true; printf 67108864 > "$CG/memory.max" 2>/dev/null || true; export R READY GO
bash -c 'touch "$READY"; while [ ! -e "$GO" ]; do sleep 0.01; done; pids=; created=0; failed=0; for i in $(seq 1 16); do if sleep 1 & then pids="$pids $!"; created=$((created+1)); else failed=$((failed+1)); fi; done; printf "created=%s fork_failures=%s\n" "$created" "$failed" > "$R"; for child in $pids; do wait "$child"; done' & p=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do [ -e "$READY" ] && break; sleep 0.05; done; if ! printf '%s\n' "$p" > "$CG/cgroup.procs" 2>/dev/null; then printf 'cgroup_move=unavailable\n'; exit 0; fi; touch "$GO"; wait "$p" 2>/dev/null || true; p=; events=$(awk '$1=="max"{print $2}' "$CG/pids.events" 2>/dev/null || printf 0); cat "$R" 2>/dev/null || printf 'created=unknown fork_failures=unknown\n'; printf 'pids_max_events=%s\n' "$events"; if [ "$events" -gt 0 ]; then printf 'cgroup_enforcement=observed\n'; else printf 'cgroup_enforcement=not-observed\n'; fi; cleanup_budget; trap - EXIT; printf 'cleanup=cgroup-removed\n'
)
`,
      expectedResult:
        code`On a writable cgroup v2 VM, the helper reports bounded created/fork_failures, pids_max_events is nonzero when pids.max rejects a fork, cgroup_enforcement=observed, and cleanup=cgroup-removed. If delegation or a controller is unavailable, the lesson reports cgroup_setup=unavailable or not-observed and removes only its exact group.`,
      systemsLens:
        code`Cgroup controllers enforce budgets over a set of processes, not over a pathname. The hierarchy lets a supervisor cap fan-out and memory together, then attribute rejected work to the group event counters.`,
      caution:
        code`Run only on a disposable VM. The trap owns this exact cgroup and helper; do not place any unrelated process under the generated linux-tutor name.`,
    },
  ],
};
