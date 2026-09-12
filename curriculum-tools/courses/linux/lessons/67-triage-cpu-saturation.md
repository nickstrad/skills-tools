# Triage bounded CPU saturation

slug: triage-cpu-saturation
category: troubleshooting-capstones
difficulty: advanced
tags: troubleshooting, scheduling, processes
prerequisites: change-scheduling-priority, pin-cpu-affinity
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 16
revision: 2

## Overview
Two workers compete for one allowed CPU while host load may include unrelated activity. Correlate their placement and execution to establish local contention, then compare that evidence with host-wide measurements. The supplied experiment also verifies exact process cleanup.

## Syntax breakdown
### In plain terms

A slow task can compete for its allowed CPU even when the machine has idle CPUs elsewhere. Compare evidence tied to the two worker PIDs with host-wide measurements before choosing an intervention.

### What you are learning

- CPU affinity is a set of processors on which a task may run; two runnable tasks restricted to one CPU must share it.
- CPU ticks account actual execution. A positive interval delta is stronger evidence of work than a nonempty ps row.
- Host load includes other tasks and cannot by itself attribute this incident to these workers.

### Piece by piece

- **Lab paths and shell control.** LINUX_LAB selects the directory; the HOME fallback is used only when it is empty. **mkdir -p** creates it idempotently. UID and the shell PID ($$) distinguish this run's names. Quoted expansions keep paths intact. **printf** prints labeled values; **$(...)** captures output, and **$((...))** performs integer arithmetic.
- **Ownership and cleanup.** **&** starts a child and **$!** records its exact PID. **trap ... EXIT** installs cleanup before the child starts. **kill** requests termination and **wait** reaps that child; **|| true** tolerates an already exited child during cleanup. **rm -f** removes only named lab files, and **trap - EXIT** clears the handler after explicit cleanup. Readiness loops use **test/[ ]**, **break**, and **sleep** to wait for observed state within a fixed bound; an assertion failure exits the experiment's subshell, not your terminal.
- **: > "$PIDS"** creates or empties the run-specific PID record; the colon is Bash’s successful no-op.
- **python3 -c** runs the supplied helper. **os.sched_getaffinity(0)** reads this process's permitted CPUs; **min** chooses a valid CPU even in a restricted container. **taskset -c "$cpu"** restricts each child to that CPU. The Python worker uses **time.monotonic** for a six-second wall-time bound.
- **python3 - "$PIDS"** reads a program from the quoted PROBE here-document and the PID file from its first argument. **rsplit(')',1)** skips the parenthesized process name safely. The following fields 11 and 12 are user and system ticks; the helper subtracts two samples one second apart and asserts each worker executed. It prints affinity again to verify placement.
- **ps -o pid=,stat=,psr=,pcpu=,time=** selects PID, state, last processor, lifetime CPU percentage and accumulated CPU time; equals signs suppress headings. **-p** selects only our comma-separated PIDs. **tr** converts newlines to commas and **sed 's/,$//'** removes the final comma.
- **taskset -pc PID** in the variation queries (**-p**) an existing PID and formats its affinity as a CPU list (**-c**); **head -n 1** selects the first PID record.
- **cat /proc/loadavg** prints smoothed load and the instantaneous runnable/total count. **vmstat 1 2** takes two samples one second apart: the first includes averages since boot, while the second interval's **r**, **us**, **sy**, and **id** describe runnable tasks and host CPU use. Neither view isolates our CPU.
- **test -d /proc/PID** checks whether a recorded process still has a procfs directory after wait. The remaining count must be zero; this proves worker cleanup, not restored performance of an unrelated application.

## Run
```sh
(
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
PIDS=$LAB/cpu-pids-$UID-$$
worker_pids=
trap 'for p in $worker_pids; do kill "$p" 2>/dev/null || true; wait "$p" 2>/dev/null || true; done; rm -f "$PIDS"' EXIT
: > "$PIDS"
cpu=$(python3 -c 'import os; print(min(os.sched_getaffinity(0)))')
for n in 1 2; do
  taskset -c "$cpu" python3 -c 'import time
end=time.monotonic()+6
while time.monotonic()<end: pass' &
  worker_pids="$worker_pids $!"
  printf '%s\n' "$!" >> "$PIDS"
done
printf 'workers_started=2\nselected_cpu=%s\n' "$cpu"
python3 - "$PIDS" <<'PROBE'
import os,sys,time
pids=[int(p) for p in open(sys.argv[1])]
def ticks(pid):
    fields=open('/proc/%d/stat'%pid).read().rsplit(')',1)[1].split()
    return int(fields[11])+int(fields[12])
before=[ticks(p) for p in pids]
time.sleep(1)
after=[ticks(p) for p in pids]
for p,a,b in zip(pids,before,after):
    print('worker_pid=%d cpu_ticks_delta=%d allowed_cpus=%s'%(p,b-a,sorted(os.sched_getaffinity(p))))
assert all(b>a for a,b in zip(before,after)), 'workers did not accumulate CPU time'
print('local_cpu_demand=observed')
PROBE
[ "$?" -eq 0 ] || exit 1
ps -o pid=,stat=,psr=,pcpu=,time= -p $(tr '\n' ',' < "$PIDS" | sed 's/,$//')
printf 'host_loadavg=%s\n' "$(cat /proc/loadavg)"
vmstat 1 2
for p in $worker_pids; do kill "$p" 2>/dev/null || true; done
for p in $worker_pids; do wait "$p" 2>/dev/null || true; done
remaining=0
for p in $worker_pids; do [ ! -d "/proc/$p" ] || remaining=$((remaining+1)); done
printf 'workers_after_stop=%s\n' "$remaining"
[ "$remaining" -eq 0 ] || exit 1
worker_pids=
rm -f "$PIDS"
trap - EXIT
printf 'cleanup=done\n'
)
```

## Expected result
workers_started=2 and one selected_cpu are printed. Each worker reports that same singleton allowed_cpus set and a positive cpu_ticks_delta; local_cpu_demand=observed follows those assertions. The tasks share one CPU, but their tick ratio, sampled states, host load and vmstat vary. workers_after_stop=0 proves both workers exited. This bounded run does not establish sustained host-wide saturation.

## Systems lens
Capacity is constrained by the resources a workload may actually use. Join ownership, placement and interval execution before attributing a symptom to global load or choosing a capacity change.

## Optional variation
Rerun with **for n in 1** instead of **for n in 1 2** and change the descriptive workers_started
label to1. Keep the selected CPU, six-second bound and cleanup. Before the stop loop,
**taskset -pc "$(head -n 1 "$PIDS")"** queries the first recorded live PID's affinity.

Compare its positive tick delta with the two-worker run without requiring a fixed ratio. Both
the allowed CPU set and interval execution belong to the recorded task; host load includes other
work. A service limited to one busy CPU needs request-latency evidence before and after a placement
or capacity change to show whether that change helps.
