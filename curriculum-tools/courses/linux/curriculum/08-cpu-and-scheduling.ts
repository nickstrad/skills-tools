import { code, type Module } from "../../../src/types.ts";

export const CPU: Module = {
  category: "cpu-and-scheduling",
  title: "Measure runnable work and influence scheduler choices",
  lessons: [
    {
      slug: "cpu-time-vs-wall-time",
      title: "Distinguish CPU time from elapsed time",
      difficulty: "beginner",
      tags: ["scheduling", "processes", "shell"],
      prerequisites: ["foreground-and-background"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 10,
      overview:
        code`Run a bounded CPU loop and an equal-duration sleep under GNU time. Their wall durations are similar, but only the loop consumes substantial user CPU, separating elapsed waiting from processor execution.`,
      syntaxBreakdown:
        code`/usr/bin/time records user CPU and elapsed seconds; Python time.monotonic bounds a loop; sleep waits without runnable work; awk compares decimal measurements.`,
      code: code`
LAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"
A=$LAB/cpu-time-$UID; B=$LAB/sleep-time-$UID; trap 'rm -f "$A" "$B"' EXIT
/usr/bin/time -f 'user=%U wall=%e' -o "$A" python3 -c 'import time; end=time.monotonic()+0.8; n=0
while time.monotonic()<end: n+=1'
/usr/bin/time -f 'user=%U wall=%e' -o "$B" sleep 0.8
cu=$(awk '{print $1}' "$A" | cut -d= -f2); cw=$(awk '{print $2}' "$A" | cut -d= -f2); su=$(awk '{print $1}' "$B" | cut -d= -f2); sw=$(awk '{print $2}' "$B" | cut -d= -f2)
printf 'cpu_user_s=%s cpu_wall_s=%s\n' "$cu" "$cw"; printf 'sleep_user_s=%s sleep_wall_s=%s\n' "$su" "$sw"
if awk -v a="$cu" -v b="$su" 'BEGIN{exit !(a>b+0.05)}'; then printf 'cpu_time_higher_for_loop=yes\n'; else printf 'cpu_time_higher_for_loop=no\n'; fi
if [ -s "$A" ] && [ -s "$B" ]; then printf 'wall_measurements=recorded\n'; else printf 'wall_measurements=missing\n'; fi
rm -f "$A" "$B"; trap - EXIT; printf 'cleanup=done\n'
`,
      expectedResult:
        code`cpu_time_higher_for_loop=yes and wall_measurements=recorded. Both wall measurements are near the bounded 0.8-second action, while CPU user time for sleep is near zero; exact values vary.`,
      systemsLens:
        code`Wall time includes runnable, blocked, and sleeping intervals; CPU time counts time actually executing on a processor. Queueing systems, latency budgets, and capacity plans need both views.`,
    },
    {
      slug: "load-average-runnable-work",
      title: "Make runnable work visible in load average",
      difficulty: "intermediate",
      tags: ["scheduling", "processes", "procfs"],
      prerequisites: ["cpu-time-vs-wall-time"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 14,
      overview:
        code`Start at most four short CPU workers, release them together, and sample /proc/loadavg while they are busy. The instantaneous runnable count is evidence of scheduler demand; smoothed averages are intentionally not treated as immediate counters.`,
      syntaxBreakdown:
        code`nproc bounds worker count; marker files coordinate readiness and release; /proc/loadavg field four exposes runnable tasks; Python performs a bounded monotonic loop; exact PIDs are waited.`,
      code: code`
LAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"
RUN=$LAB/load-run-$UID; RD=$LAB/load-ready-$UID; rm -f "$RUN"; rm -rf "$RD"; mkdir -p "$RD"; pids=
cleanup_load() { for p in $pids; do kill "$p" 2>/dev/null || true; done; for p in $pids; do wait "$p" 2>/dev/null || true; done; rm -f "$RUN"; rm -rf "$RD"; }
trap cleanup_load EXIT; workers=$(nproc); if [ "$workers" -gt 4 ]; then workers=4; fi; export RUN RD
for w in $(seq 1 "$workers"); do WORKER=$w; export WORKER; python3 -c 'import os,time; open(os.path.join(os.environ["RD"],"ready-"+os.environ["WORKER"]),"w").close();
while not os.path.exists(os.environ["RUN"]): time.sleep(0.01)
end=time.monotonic()+0.9
while time.monotonic()<end: pass' & pids="$pids $!"; done
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do ready=$(find "$RD" -type f -name 'ready-*' 2>/dev/null | wc -l); [ "$ready" -eq "$workers" ] && break; sleep 0.05; done
before=$(awk '{print $4}' /proc/loadavg | cut -d/ -f1); touch "$RUN"; sleep 0.1; during=$(awk '{print $4}' /proc/loadavg | cut -d/ -f1)
printf 'workers_started=%s runnable_before=%s runnable_during=%s\n' "$workers" "$before" "$during"
if [ "$workers" -ge 1 ] && [ "$during" -ge 1 ]; then printf 'runnable_work=observed\n'; else printf 'runnable_work=unexpected\n'; fi
for p in $pids; do wait "$p" 2>/dev/null || true; done; pids=; printf 'cleanup=done\n'
`,
      expectedResult:
        code`workers_started is between 1 and 4, runnable_during is at least 1, runnable_work=observed, and cleanup=done. runnable_before and load averages vary with other host activity.`,
      systemsLens:
        code`Load average tracks runnable and uninterruptible demand over time, not a direct CPU-percentage reading. A small workload can increase queueing pressure even when aggregate utilization is hard to interpret across many CPUs.`,
    },
    {
      slug: "observe-context-switches",
      title: "Compare blocking and preemption counters",
      difficulty: "intermediate",
      tags: ["scheduling", "procfs", "processes"],
      prerequisites: ["cpu-time-vs-wall-time"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      overview:
        code`Keep a sleeper and a bounded CPU loop alive together, then read each task's voluntary and nonvoluntary context-switch counters. The counters show that blocking and scheduler preemption are observable consequences of different execution paths.`,
      syntaxBreakdown:
        code`/proc/PID/status exposes voluntary_ctxt_switches and nonvoluntary_ctxt_switches; kill and wait provide exact cleanup; Python's monotonic loop remains bounded.`,
      code: code`
LAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"; s=; c=
trap 'test -n "$s" && kill "$s" 2>/dev/null || true; test -n "$c" && kill "$c" 2>/dev/null || true; test -n "$s" && wait "$s" 2>/dev/null || true; test -n "$c" && wait "$c" 2>/dev/null || true' EXIT
sleep 1 & s=$!; python3 -c 'import time; end=time.monotonic()+0.8
while time.monotonic()<end: pass' & c=$!; sleep 0.15
sv=$(awk '/^voluntary_ctxt_switches:/{print $2}' /proc/$s/status); sn=$(awk '/^nonvoluntary_ctxt_switches:/{print $2}' /proc/$s/status); cv=$(awk '/^voluntary_ctxt_switches:/{print $2}' /proc/$c/status); cn=$(awk '/^nonvoluntary_ctxt_switches:/{print $2}' /proc/$c/status)
printf 'sleeper_voluntary=%s sleeper_nonvoluntary=%s\n' "$sv" "$sn"; printf 'cpu_voluntary=%s cpu_nonvoluntary=%s\n' "$cv" "$cn"
if [ -n "$sv" ] && [ -n "$sn" ] && [ -n "$cv" ] && [ -n "$cn" ]; then printf 'switch_counters_present=yes\n'; else printf 'switch_counters_present=no\n'; fi
wait "$s" "$c" 2>/dev/null || true; s=; c=; trap - EXIT; printf 'cleanup=done\n'
`,
      expectedResult:
        code`All four labeled counters are nonempty, switch_counters_present=yes, and cleanup=done. The sleeper normally accumulates voluntary switches; CPU nonvoluntary counts depend on CPU availability and kernel scheduling.`,
      systemsLens:
        code`A context switch records a change of the running task. Voluntary switches commonly accompany sleep or blocking I/O, while nonvoluntary switches reflect scheduler decisions such as time-slice expiry or competition.`,
    },
    {
      slug: "change-scheduling-priority",
      title: "Compare workers with different nice values",
      difficulty: "intermediate",
      tags: ["scheduling", "processes"],
      prerequisites: ["load-average-runnable-work"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 15,
      overview:
        code`Run two equal CPU workers on one allowed CPU, one at nice 0 and one at nice 10. Verify scheduler-visible priorities and compare work counts as a noisy demonstration of weighted fair sharing, not a fixed ratio.`,
      syntaxBreakdown:
        code`nice -n sets inherited niceness; taskset -c constrains one CPU; ps -o ni reads priority; Python records bounded loop iterations to lab files.`,
      code: code`
LAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"; CPU=$(awk -F: '/Cpus_allowed_list/{print $2}' /proc/$$/status | tr -d '[:space:]' | cut -d, -f1 | cut -d- -f1)
FAST=$LAB/nice-fast-$UID; SLOW=$LAB/nice-slow-$UID; R1=$LAB/nice-r1-$UID; R2=$LAB/nice-r2-$UID; rm -f "$FAST" "$SLOW" "$R1" "$R2"; f=; s=
trap 'test -n "$f" && kill "$f" 2>/dev/null || true; test -n "$s" && kill "$s" 2>/dev/null || true; test -n "$f" && wait "$f" 2>/dev/null || true; test -n "$s" && wait "$s" 2>/dev/null || true; rm -f "$FAST" "$SLOW" "$R1" "$R2"' EXIT; export FAST SLOW R1 R2
taskset -c "$CPU" nice -n 0 python3 -c 'import os,time; open(os.environ["R1"],"w").close(); end=time.monotonic()+0.9; n=0
while time.monotonic()<end: n+=1
open(os.environ["FAST"],"w").write(str(n))' & f=$!
taskset -c "$CPU" nice -n 10 python3 -c 'import os,time; open(os.environ["R2"],"w").close(); end=time.monotonic()+0.9; n=0
while time.monotonic()<end: n+=1
open(os.environ["SLOW"],"w").write(str(n))' & s=$!
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do [ -e "$R1" ] && [ -e "$R2" ] && break; sleep 0.05; done; n0=$(ps -o ni= -p "$f" 2>/dev/null | tr -d ' '); n10=$(ps -o ni= -p "$s" 2>/dev/null | tr -d ' '); wait "$f" "$s" 2>/dev/null || true; f=; s=
printf 'cpu=%s nice0_observed=%s nice10_observed=%s\n' "$CPU" "$n0" "$n10"; printf 'nice0_work=%s nice10_work=%s\n' "$(cat "$FAST" 2>/dev/null || printf 0)" "$(cat "$SLOW" 2>/dev/null || printf 0)"
if [ "$n0" = 0 ] && [ "$n10" = 10 ]; then printf 'priority_difference=10\n'; else printf 'priority_difference=unexpected\n'; fi; printf 'both_workers_completed=yes\n'; rm -f "$FAST" "$SLOW" "$R1" "$R2"; trap - EXIT; printf 'cleanup=done\n'
`,
      expectedResult:
        code`nice0_observed=0, nice10_observed=10, priority_difference=10, both_workers_completed=yes, and cleanup=done. Work counts are positive but their ratio varies with host scheduling.`,
      systemsLens:
        code`Niceness changes a task's weight in fair scheduling; it does not reserve a CPU or guarantee a ratio. This distinction matters when translating service priority into latency and throughput expectations.`,
    },
    {
      slug: "pin-cpu-affinity",
      title: "Constrain a helper to one allowed CPU",
      difficulty: "intermediate",
      tags: ["scheduling", "processes", "procfs"],
      prerequisites: ["load-average-runnable-work"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      overview:
        code`Choose the first CPU allowed to this shell, pin a bounded helper there, and inspect its kernel affinity list and current processor. Affinity narrows placement without changing the helper's code or host-wide scheduler policy.`,
      syntaxBreakdown:
        code`Cpus_allowed_list in /proc/PID/status reports a mask; taskset -pc changes one exact PID; ps -o psr samples the current processor; a readiness file bounds the race.`,
      code: code`
LAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"; CPU=$(awk -F: '/Cpus_allowed_list/{print $2}' /proc/$$/status | tr -d '[:space:]' | cut -d, -f1 | cut -d- -f1); R=$LAB/affinity-r-$UID; rm -f "$R"; p=
trap 'test -n "$p" && kill "$p" 2>/dev/null || true; test -n "$p" && wait "$p" 2>/dev/null || true; rm -f "$R"' EXIT; export R; python3 -c 'import os,time; open(os.environ["R"],"w").close(); end=time.monotonic()+0.8
while time.monotonic()<end: pass' & p=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do [ -e "$R" ] && break; sleep 0.05; done; taskset -pc "$CPU" "$p" >/dev/null; allowed=$(awk -F: '/Cpus_allowed_list/{print $2}' /proc/$p/status | tr -d '[:space:]'); psr=$(ps -o psr= -p "$p" 2>/dev/null | tr -d ' '); printf 'chosen_cpu=%s allowed_list=%s observed_cpu=%s\n' "$CPU" "$allowed" "$psr"; if [ "$allowed" = "$CPU" ]; then printf 'affinity_constrained=yes\n'; else printf 'affinity_constrained=no\n'; fi; wait "$p" 2>/dev/null || true; p=; rm -f "$R"; trap - EXIT; printf 'cleanup=done\n'
`,
      expectedResult:
        code`allowed_list equals chosen_cpu, affinity_constrained=yes, and cleanup=done. observed_cpu is a sample and may be blank if the short helper exits between reads; it cannot be outside the allowed list while running.`,
      systemsLens:
        code`CPU affinity restricts one task's scheduler placement set. Pinning can improve cache locality or isolate noisy work, but it can also create a smaller bottleneck when the set is too narrow.`,
    },
    {
      slug: "set-io-priority",
      title: "Inspect I/O priority separately from CPU priority",
      difficulty: "intermediate",
      tags: ["scheduling", "storage", "resource-limits"],
      prerequisites: ["cpu-time-vs-wall-time"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      overview:
        code`Make a bounded reader hold a lab-file read while its I/O class is set to idle, then query it with ionice. Comparing that class with the shell's class demonstrates that I/O scheduling is a separate axis from CPU niceness.`,
      syntaxBreakdown:
        code`ionice -c 3 assigns idle I/O class; ionice -p queries one exact PID; a bounded Python read keeps the target alive; trap waits and removes the lab file.`,
      code: code`
LAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"; F=$LAB/io-priority-$UID.bin; R=$LAB/io-priority-r-$UID; rm -f "$F" "$R"; dd if=/dev/zero of="$F" bs=1M count=4 status=none; p=
trap 'test -n "$p" && kill "$p" 2>/dev/null || true; test -n "$p" && wait "$p" 2>/dev/null || true; rm -f "$F" "$R"' EXIT; export F R; python3 -c 'import os,time; open(os.environ["F"],"rb").read(); open(os.environ["R"],"w").close(); time.sleep(1)' & p=$!; for attempt in 1 2 3 4 5 6 7 8 9 10; do [ -e "$R" ] && break; sleep 0.05; done
if ionice -c 3 -p "$p" 2>/dev/null; then change=applied; else change=not-applied; fi; worker=$(ionice -p "$p" 2>/dev/null); shell=$(ionice -p $$ 2>/dev/null); printf 'io_change=%s worker_ionice=%s shell_ionice=%s\n' "$change" "$worker" "$shell"; if printf '%s\n' "$worker" | grep -qi idle; then printf 'io_class=idle\n'; else printf 'io_class=other\n'; fi; wait "$p" 2>/dev/null || true; p=; rm -f "$F" "$R"; trap - EXIT; printf 'cleanup=done\n'
`,
      expectedResult:
        code`io_change=applied, worker_ionice contains idle, io_class=idle, and cleanup=done. The shell's class may be none or best-effort and is printed only for comparison.`,
      systemsLens:
        code`CPU scheduling weight and block-device I/O class affect different queues. A process can be CPU-favored yet I/O-deprioritized, so incident diagnosis must inspect both dimensions.`,
    },
  ],
};
