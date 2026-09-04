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
      revision: 2,
      overview:
        code`Run a bounded CPU loop and an equal-duration sleep under GNU time. Their wall durations are similar, but only the loop consumes substantial user CPU, separating elapsed waiting from processor execution.`,
      syntaxBreakdown: code`### In plain terms

Two actions take similar elapsed time: one sleeps and one consumes CPU. Their time records show why latency and processor demand are separate measurements.

### What you are learning

- Wall time includes waiting; user CPU time counts execution.
- Bounded work avoids turning a measurement lesson into host load.

### Piece by piece

- **/usr/bin/time -f** (external timer and format flag): **-f** emits selected user and elapsed fields; the absolute path avoids Bash's time keyword.
- **time.monotonic** (Python clock): bounds the busy loop near 0.8 seconds without a wall-clock adjustment.
- **sleep 0.8** (blocking action): waits for elapsed time without intentional CPU work.
- **awk** (field reader): extracts labelled values and checks the relationship rather than an exact duration.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
A=$LAB/cpu-time-$UID
B=$LAB/sleep-time-$UID
trap 'rm -f "$A" "$B"' EXIT
/usr/bin/time -f 'user=%U wall=%e' -o "$A" python3 -c 'import time; end=time.monotonic()+0.8; n=0
while time.monotonic()<end: n+=1'
/usr/bin/time -f 'user=%U wall=%e' -o "$B" sleep 0.8
cu=$(awk '{print $1}' "$A" | cut -d= -f2)
cw=$(awk '{print $2}' "$A" | cut -d= -f2)
su=$(awk '{print $1}' "$B" | cut -d= -f2)
sw=$(awk '{print $2}' "$B" | cut -d= -f2)
printf 'cpu_user_s=%s cpu_wall_s=%s\n' "$cu" "$cw"
printf 'sleep_user_s=%s sleep_wall_s=%s\n' "$su" "$sw"
if awk -v a="$cu" -v b="$su" 'BEGIN{exit !(a>b+0.05)}'; then printf 'cpu_time_higher_for_loop=yes\n'; else printf 'cpu_time_higher_for_loop=no\n'; fi
if [ -s "$A" ] && [ -s "$B" ]; then printf 'wall_measurements=recorded\n'; else printf 'wall_measurements=missing\n'; fi
rm -f "$A" "$B"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`cpu_time_higher_for_loop=yes and wall_measurements=recorded. Both wall measurements are near the bounded 0.8-second action, while CPU user time for sleep is near zero; exact values vary.`,
      systemsLens:
        code`Wall time includes runnable, blocked, and sleeping intervals; CPU time counts time actually executing on a processor. Queueing systems, latency budgets, and capacity plans need both views.`,
      challenge:
        "**Predict:** For a 0.2-second sleep, which time field changes materially?\n\n**Inspect and explain:** Run **/usr/bin/time -f 'user=%U wall=%e' sleep 0.2** and explain why a wall delay is not CPU saturation evidence.\n\n**Vary:** Use exactly 0.2 seconds.\n\n**Hint:** Use external **/usr/bin/time**, not the shell keyword.\n\n**Apply:** Name both measurements to collect before scaling a latency-bound service.",
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
      revision: 2,
      overview:
        code`Start at most four short CPU workers, release them together, and sample /proc/loadavg while they are busy. The instantaneous runnable count is evidence of scheduler demand; smoothed averages are intentionally not treated as immediate counters.`,
      syntaxBreakdown: code`### In plain terms

Several short workers wait at one gate and become runnable together. Loadavg field four gives an instantaneous runnable/total count; smoothed load and other host work are not attributed to these workers.

### What you are learning

- Runnable count is demand evidence, not CPU utilization.
- Marker files make a bounded concurrent release observable.

### Piece by piece

- **nproc** and the cap at 4: choose no more than four workers regardless of host size.
- **READY directory** and **RUN file**: each helper writes a marker then waits for RUN, avoiding a startup sample.
- **/proc/loadavg field 4**: awk takes the runnable side before the slash; it is host-wide snapshot evidence.
- **time.monotonic()+0.9** and **wait**: bound every busy loop and reap every recorded PID.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
RUN=$LAB/load-run-$UID
RD=$LAB/load-ready-$UID
rm -f "$RUN"
rm -rf "$RD"
mkdir -p "$RD"
pids=
cleanup_load() {
  for p in $pids; do kill "$p" 2>/dev/null || true; done
  for p in $pids; do wait "$p" 2>/dev/null || true; done
  rm -f "$RUN"
  rm -rf "$RD"
}
trap cleanup_load EXIT
workers=$(nproc)
if [ "$workers" -gt 4 ]; then workers=4; fi
export RUN RD
for w in $(seq 1 "$workers"); do
  WORKER=$w
  export WORKER
  python3 -c 'import os,time; open(os.path.join(os.environ["RD"],"ready-"+os.environ["WORKER"]),"w").close();
while not os.path.exists(os.environ["RUN"]): time.sleep(0.01)
end=time.monotonic()+0.9
while time.monotonic()<end: pass' &
  pids="$pids $!"
done
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  ready=$(find "$RD" -type f -name 'ready-*' 2>/dev/null | wc -l)
  [ "$ready" -eq "$workers" ] && break
  sleep 0.05
done
before=$(awk '{print $4}' /proc/loadavg | cut -d/ -f1)
touch "$RUN"
sleep 0.1
during=$(awk '{print $4}' /proc/loadavg | cut -d/ -f1)
printf 'workers_started=%s runnable_before=%s runnable_during=%s\n' "$workers" "$before" "$during"
if [ "$workers" -ge 1 ] && [ "$during" -ge 1 ]; then printf 'runnable_work=observed\n'; else printf 'runnable_work=unexpected\n'; fi
for p in $pids; do wait "$p" 2>/dev/null || true; done
pids=
printf 'cleanup=done\n'
`,
      expectedResult:
        code`workers_started is between 1 and 4, runnable_during is at least 1, runnable_work=observed, and cleanup=done. runnable_before and load averages vary with other host activity.`,
      systemsLens:
        code`Load average tracks runnable and uninterruptible demand over time, not a direct CPU-percentage reading. A small workload can increase queueing pressure even when aggregate utilization is hard to interpret across many CPUs.`,
      challenge:
        '**Predict:** With one worker instead of four, must runnable_during equal one?\n\n**Inspect and explain:** Compare the runnable count with the worker count and account for unrelated host work.\n\n**Vary:** Rerun the complete lesson, replacing if [ "$workers" -gt 4 ]; then workers=4; fi with if [ "$workers" -gt 1 ]; then workers=1; fi. Keep readiness gates and exact-PID cleanup.\n\n**Hint:** The slash-separated field is runnable over total tasks.\n\n**Apply:** Explain why load alone cannot identify a CPU-incident process.',
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
      revision: 2,
      overview:
        code`Keep a sleeper and a bounded CPU loop alive together, then read each task's voluntary and nonvoluntary context-switch counters. The counters show that blocking and scheduler preemption are observable consequences of different execution paths.`,
      syntaxBreakdown: code`### In plain terms

A sleeper and a busy helper remain alive long enough to inspect process counters. They demonstrate possible blocking and scheduler handoffs, though one sample cannot assign every switch cause.

### What you are learning

- Voluntary switches commonly accompany blocking.
- Nonvoluntary switches depend on competition and available CPUs.

### Piece by piece

- **sleep 1** and the monotonic Python loop: create one blocking and one runnable task for bounded intervals.
- **/proc/PID/status**: awk selects voluntary_ctxt_switches and nonvoluntary_ctxt_switches by name for each exact PID.
- **kill**, **wait**, and **trap**: target, reap, and protect only the two recorded helpers.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
s=
c=
trap 'test -n "$s" && kill "$s" 2>/dev/null || true; test -n "$c" && kill "$c" 2>/dev/null || true; test -n "$s" && wait "$s" 2>/dev/null || true; test -n "$c" && wait "$c" 2>/dev/null || true' EXIT
sleep 1 &
s=$!
python3 -c 'import time; end=time.monotonic()+0.8
while time.monotonic()<end: pass' &
c=$!
sleep 0.15
sv=$(awk '/^voluntary_ctxt_switches:/{print $2}' /proc/$s/status)
sn=$(awk '/^nonvoluntary_ctxt_switches:/{print $2}' /proc/$s/status)
cv=$(awk '/^voluntary_ctxt_switches:/{print $2}' /proc/$c/status)
cn=$(awk '/^nonvoluntary_ctxt_switches:/{print $2}' /proc/$c/status)
printf 'sleeper_voluntary=%s sleeper_nonvoluntary=%s\n' "$sv" "$sn"
printf 'cpu_voluntary=%s cpu_nonvoluntary=%s\n' "$cv" "$cn"
if [ -n "$sv" ] && [ -n "$sn" ] && [ -n "$cv" ] && [ -n "$cn" ]; then printf 'switch_counters_present=yes\n'; else printf 'switch_counters_present=no\n'; fi
wait "$s" "$c" 2>/dev/null || true
s=
c=
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`All four labeled counters are nonempty, switch_counters_present=yes, and cleanup=done. The sleeper normally accumulates voluntary switches; CPU nonvoluntary counts depend on CPU availability and kernel scheduling.`,
      systemsLens:
        code`A context switch records a change of the running task. Voluntary switches commonly accompany sleep or blocking I/O, while nonvoluntary switches reflect scheduler decisions such as time-slice expiry or competition.`,
      challenge:
        "**Predict:** If the busy helper is replaced with sleep, which comparison becomes less informative?\n\n**Inspect and explain:** Compare each process’s two counters and state what a single snapshot cannot tell you about switch rates.\n\n**Vary:** Rerun the complete lesson, replacing the entire background python3 busy-loop command with sleep 0.8 &. Keep the following PID assignment and both counter observations.\n\n**Hint:** Counters are process-local snapshots and may start nonzero.\n\n**Apply:** State what workload and CPU-placement evidence is needed before acting on a switch counter.",
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
      revision: 3,
      overview:
        code`Run two equal CPU workers on one allowed CPU, one with nice increment 0 and one with increment 10 relative to this shell. Verify scheduler-visible priorities and compare work counts as a noisy demonstration of weighted fair sharing, not a fixed ratio.`,
      syntaxBreakdown: code`### In plain terms

Two equal busy workers share one allowed CPU but receive different nice increments. The assertion is their difference from the inherited shell nice value; work counts are noisy context, never a promised ratio.

### What you are learning

- **nice -n** adds an increment to inherited niceness; it is not an absolute request.
- Affinity creates bounded contention so relative weight is observable.

### Piece by piece

- **Cpus_allowed_list**: select the first CPU the shell may use, never a guessed CPU.
- **taskset -c CPU**: **-c** accepts a CPU list and confines both workers to one allowed CPU.
- **nice -n 0** and **nice -n 10**: **-n** supplies relative increments from the observed shell baseline.
- **ps -o ni= -p PID**: **-o** selects niceness, **=** removes a heading, and **-p** selects the exact worker; the 10-point delta is the evidence.
- **time.monotonic**, result files, **wait**, and **trap**: bound loops, collect counts, and clean only recorded workers.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
CPU=$(awk -F: '/Cpus_allowed_list/{print $2}' /proc/$$/status | tr -d '[:space:]' | cut -d, -f1 | cut -d- -f1)
FAST=$LAB/nice-fast-$UID
SLOW=$LAB/nice-slow-$UID
R1=$LAB/nice-r1-$UID
R2=$LAB/nice-r2-$UID
rm -f "$FAST" "$SLOW" "$R1" "$R2"
f=
s=
trap 'test -n "$f" && kill "$f" 2>/dev/null || true; test -n "$s" && kill "$s" 2>/dev/null || true; test -n "$f" && wait "$f" 2>/dev/null || true; test -n "$s" && wait "$s" 2>/dev/null || true; rm -f "$FAST" "$SLOW" "$R1" "$R2"' EXIT
export FAST SLOW R1 R2
taskset -c "$CPU" nice -n 0 python3 -c 'import os,time; open(os.environ["R1"],"w").close(); end=time.monotonic()+0.9; n=0
while time.monotonic()<end: n+=1
open(os.environ["FAST"],"w").write(str(n))' &
f=$!
taskset -c "$CPU" nice -n 10 python3 -c 'import os,time; open(os.environ["R2"],"w").close(); end=time.monotonic()+0.9; n=0
while time.monotonic()<end: n+=1
open(os.environ["SLOW"],"w").write(str(n))' &
s=$!
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  [ -e "$R1" ] && [ -e "$R2" ] && break
  sleep 0.05
done
n0=$(ps -o ni= -p "$f" 2>/dev/null | tr -d ' ')
n10=$(ps -o ni= -p "$s" 2>/dev/null | tr -d ' ')
shell_nice=$(ps -o ni= -p $$ | tr -d ' ')
wait "$f" "$s" 2>/dev/null || true
f=
s=
printf 'cpu=%s shell_nice=%s nice0_observed=%s nice10_observed=%s\n' "$CPU" "$shell_nice" "$n0" "$n10"
printf 'nice0_work=%s nice10_work=%s\n' "$(cat "$FAST" 2>/dev/null || printf 0)" "$(cat "$SLOW" 2>/dev/null || printf 0)"
if [ "$n0" = "$shell_nice" ] && [ $((n10 - n0)) -eq 10 ]; then printf 'priority_difference=10\n'; else printf 'priority_difference=unexpected\n'; fi
printf 'both_workers_completed=yes\n'
rm -f "$FAST" "$SLOW" "$R1" "$R2"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`nice0_observed equals shell_nice (0 in a normal interactive shell), nice10_observed is exactly 10 higher, priority_difference=10, both_workers_completed=yes, and cleanup=done. Work counts are positive but their ratio varies with host scheduling.`,
      systemsLens:
        code`Niceness changes a task's weight in fair scheduling; it does not reserve a CPU or guarantee a ratio. This distinction matters when translating service priority into latency and throughput expectations.`,
      challenge:
        "**Predict:** If the parent shell has nice 5, what niceness does **nice -n 10** request?\n\n**Inspect and explain:** Run **ps -o ni= -p $$; nice -n 1 bash -c 'ps -o ni= -p $$'** and explain why the second value is relative.\n\n**Vary:** Use increment one only.\n\n**Hint:** Record parent baseline before interpreting worker output.\n\n**Apply:** Decide whether nice alone protects an interactive service from batch work.",
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
      revision: 2,
      overview:
        code`Choose the first CPU allowed to this shell, pin a bounded helper there, and inspect its kernel affinity list and current processor. Affinity narrows placement without changing the helper's code or host-wide scheduler policy.`,
      syntaxBreakdown: code`### In plain terms

The lesson selects an already-allowed CPU and restricts one live helper to it. Its allowed list proves the change; the sampled current CPU is supporting evidence and can disappear when the helper exits.

### What you are learning

- Affinity narrows legal placement for one task.
- Current-CPU sampling is transient; allowed-list state is configuration evidence.

### Piece by piece

- **Cpus_allowed_list**: read the shell’s allowed set then the helper’s changed set by field name.
- **taskset -pc CPU PID**: **-p** targets an existing PID and **-c** uses CPU-list notation; it changes only the recorded helper.
- **ps -o psr= -p PID**: **psr** is a processor sample; blank output means the short helper exited before reading.
- **READY**, **wait**, and **trap**: avoid an affinity race and release only that helper.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
CPU=$(awk -F: '/Cpus_allowed_list/{print $2}' /proc/$$/status | tr -d '[:space:]' | cut -d, -f1 | cut -d- -f1)
R=$LAB/affinity-r-$UID
rm -f "$R"
p=
trap 'test -n "$p" && kill "$p" 2>/dev/null || true; test -n "$p" && wait "$p" 2>/dev/null || true; rm -f "$R"' EXIT
export R
python3 -c 'import os,time; open(os.environ["R"],"w").close(); end=time.monotonic()+0.8
while time.monotonic()<end: pass' &
p=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$R" ] && break
  sleep 0.05
done
taskset -pc "$CPU" "$p" >/dev/null
allowed=$(awk -F: '/Cpus_allowed_list/{print $2}' /proc/$p/status | tr -d '[:space:]')
psr=$(ps -o psr= -p "$p" 2>/dev/null | tr -d ' ')
printf 'chosen_cpu=%s allowed_list=%s observed_cpu=%s\n' "$CPU" "$allowed" "$psr"
if [ "$allowed" = "$CPU" ]; then printf 'affinity_constrained=yes\n'; else printf 'affinity_constrained=no\n'; fi
wait "$p" 2>/dev/null || true
p=
rm -f "$R"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`allowed_list equals chosen_cpu, affinity_constrained=yes, and cleanup=done. observed_cpu is a sample and may be blank if the short helper exits between reads; it cannot be outside the allowed list while running.`,
      systemsLens:
        code`CPU affinity restricts one task's scheduler placement set. Pinning can improve cache locality or isolate noisy work, but it can also create a smaller bottleneck when the set is too narrow.`,
      challenge:
        '**Predict:** If a helper is allowed on two CPUs, can psr still print only one at a time?\n\n**Inspect and explain:** Explain the difference between the allowed CPU set and one observed processor.\n\n**Vary:** Rerun the complete lesson and insert taskset -pc "$p" immediately after the psr assignment, while the helper is alive. Compare this queried affinity with the sampled processor before cleanup.\n\n**Hint:** Never choose a CPU absent from Cpus_allowed_list.\n\n**Apply:** State what latency and queueing evidence to check before pinning production work.',
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
      revision: 2,
      overview:
        code`Make a bounded reader hold a lab-file read while its I/O class is set to idle, then query it with ionice. Comparing that class with the shell's class demonstrates that I/O scheduling is a separate axis from CPU niceness.`,
      syntaxBreakdown: code`### In plain terms

This assigns one live reader the idle I/O class, then queries its class separately from CPU niceness. It proves configured state, not a disk-throughput promise, because cache and the active I/O scheduler vary by host.

### What you are learning

- I/O class and CPU nice are separate scheduling dimensions.
- Querying the target PID is required evidence of an intervention.

### Piece by piece

- **dd ... count=4**: creates a bounded four-MiB lab file for the reader.
- **ionice -c 3 -p PID**: **-c 3** requests idle class and **-p** targets only the recorded PID.
- **ionice -p PID**: prints the worker class; the shell query is comparison context.
- **READY**, **time.sleep(1)**, **wait**, and **trap**: keep the reader alive for inspection then clean exact paths and PID.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
F=$LAB/io-priority-$UID.bin
R=$LAB/io-priority-r-$UID
rm -f "$F" "$R"
dd if=/dev/zero of="$F" bs=1M count=4 status=none
p=
trap 'test -n "$p" && kill "$p" 2>/dev/null || true; test -n "$p" && wait "$p" 2>/dev/null || true; rm -f "$F" "$R"' EXIT
export F R
python3 -c 'import os,time; open(os.environ["F"],"rb").read(); open(os.environ["R"],"w").close(); time.sleep(1)' &
p=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$R" ] && break
  sleep 0.05
done
if ionice -c 3 -p "$p" 2>/dev/null; then change=applied; else change=not-applied; fi
worker=$(ionice -p "$p" 2>/dev/null)
shell=$(ionice -p $$ 2>/dev/null)
printf 'io_change=%s worker_ionice=%s shell_ionice=%s\n' "$change" "$worker" "$shell"
if printf '%s\n' "$worker" | grep -qi idle; then printf 'io_class=idle\n'; else printf 'io_class=other\n'; fi
wait "$p" 2>/dev/null || true
p=
rm -f "$F" "$R"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`io_change=applied, worker_ionice contains idle, io_class=idle, and cleanup=done. The shell's class may be none or best-effort and is printed only for comparison.`,
      systemsLens:
        code`CPU scheduling weight and block-device I/O class affect different queues. A process can be CPU-favored yet I/O-deprioritized, so incident diagnosis must inspect both dimensions.`,
      challenge:
        '**Predict:** Does idle I/O class change the worker\'s CPU nice value?\n\n**Inspect and explain:** Explain why the queried I/O class and CPU nice value describe different scheduling policies.\n\n**Vary:** Rerun the complete lesson and insert ps -o ni= -p "$p" immediately after worker=$(ionice ...) captures the changed I/O class. Compare CPU niceness with I/O class before cleanup.\n\n**Hint:** Cached read throughput cannot prove I/O scheduling behavior.\n\n**Apply:** Name one CPU and one I/O measurement for a slow background compaction job.',
    },
  ],
};
