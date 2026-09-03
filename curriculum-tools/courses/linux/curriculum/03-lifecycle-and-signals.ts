import { code, type Module } from "../../../src/types.ts";

export const LIFECYCLE: Module = {
  category: "lifecycle-and-signals",
  title: "Control process lifetime, exit, and signal delivery",
  lessons: [
    {
      slug: "foreground-and-background",
      title: "Compare foreground and background lifetime",
      difficulty: "beginner",
      tags: ["processes", "signals", "shell"],
      prerequisites: ["pid-and-parentage"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 10,
      overview:
        code`Run equal bounded sleeps in the foreground and background, measuring when the shell returns and when the work completes. The shell is a process supervisor that decides whether to wait immediately.`,
      syntaxBreakdown:
        code`An ampersand starts asynchronous work; $! records its PID; jobs lists shell jobs; date +%s%N supplies nanosecond timestamps; wait joins a child and returns its completion status.`,
      code: code`
start_ns=$(date +%s%N)
sleep 0.25
foreground_end_ns=$(date +%s%N)
foreground_ms=$(( (foreground_end_ns - start_ns) / 1000000 ))
background_start_ns=$(date +%s%N)
sleep 0.25 &
background_pid=$!
background_return_ns=$(date +%s%N)
jobs -l
wait "$background_pid"
background_end_ns=$(date +%s%N)
background_return_ms=$(( (background_return_ns - background_start_ns) / 1000000 ))
background_total_ms=$(( (background_end_ns - background_start_ns) / 1000000 ))
printf 'foreground_ms=%s\n' "$foreground_ms"
printf 'background_return_ms=%s\n' "$background_return_ms"
printf 'background_total_ms=%s\n' "$background_total_ms"
if [ "$background_return_ms" -lt "$foreground_ms" ] && [ "$background_total_ms" -ge 200 ]; then printf 'shell_wait_relationship=observed\n'; else printf 'shell_wait_relationship=unexpected\n'; fi
`,
      expectedResult:
        code`foreground_ms is about 250 or more, background_return_ms is much smaller than foreground_ms, background_total_ms is at least 200, and shell_wait_relationship=observed. Exact timing varies with scheduler load; wait ensures the background child is reaped.`,
      systemsLens:
        code`Foreground execution couples the shell's next command to child completion; background execution separates submission from join. This is the basic supervision choice behind worker pools and asynchronous service startup.`,
    },
    {
      slug: "wait-and-exit-status",
      title: "Carry completion information through wait",
      difficulty: "beginner",
      tags: ["processes", "signals", "shell"],
      prerequisites: ["foreground-and-background"],
      safetyLevel: "read-only",
      runIn: "shell",
      estimatedMinutes: 8,
      overview:
        code`Launch one child that exits successfully and one that exits with status 7, then capture both wait results. Exit status is a compact completion message from child to parent.`,
      syntaxBreakdown:
        code`bash -c runs an explicit child command; exit selects its status; wait joins a specific PID; $? is the status of the immediately preceding command, so capture it before another command runs.`,
      code: code`
bash -c 'exit 0' &
success_pid=$!
bash -c 'exit 7' &
failure_pid=$!
wait "$success_pid"
success_status=$?
wait "$failure_pid"
failure_status=$?
printf 'success_pid=%s success_status=%s\n' "$success_pid" "$success_status"
printf 'failure_pid=%s failure_status=%s\n' "$failure_pid" "$failure_status"
if [ "$success_status" -eq 0 ] && [ "$failure_status" -eq 7 ]; then printf 'exit_channel=preserved\n'; else printf 'exit_channel=unexpected\n'; fi
`,
      expectedResult:
        code`success_status=0 and failure_status=7, with exit_channel=preserved. Child PIDs vary. The nonzero wait is intentionally captured, so it is evidence rather than an accidental validator failure.`,
      systemsLens:
        code`A wait status is an intentionally lossy result channel: it records success, application failure, or signal termination for the parent. Supervisors use this channel to choose retry, alert, or shutdown policy.`,
    },
    {
      slug: "pipelines-are-processes",
      title: "Expose pipeline members and PIPESTATUS",
      difficulty: "beginner",
      tags: ["processes", "pipes", "shell"],
      prerequisites: ["wait-and-exit-status"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      overview:
        code`Run a two-process pipeline whose left member fails after recording its PID. Inspect both member PIDs and Bash's PIPESTATUS vector to show that a pipeline is concurrent process composition, not one command.`,
      syntaxBreakdown:
        code`A pipe connects stdout to stdin; pipefail makes the pipeline status reflect failure; PIPESTATUS records each member status; declare -p prints the array without overwriting it; export passes lab filenames to pipeline children.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
LEFT_PID_FILE=$LAB/pipeline-left-$UID.pid
RIGHT_PID_FILE=$LAB/pipeline-right-$UID.pid
PIPE_OUTPUT=$LAB/pipeline-output-$UID.txt
trap 'rm -f "$LEFT_PID_FILE" "$RIGHT_PID_FILE" "$PIPE_OUTPUT"' EXIT
export LEFT_PID_FILE RIGHT_PID_FILE PIPE_OUTPUT
set -o pipefail
bash -c 'printf "%s\n" "$BASHPID" > "$LEFT_PID_FILE"; printf "left-output\n"; exit 7' |
  bash -c 'printf "%s\n" "$BASHPID" > "$RIGHT_PID_FILE"; cat > "$PIPE_OUTPUT"'
pipeline_vector=$(declare -p PIPESTATUS)
pipeline_status=$(printf '%s\n' "$pipeline_vector" | sed -n 's/.*\[0\]="\([^"]*\)".*/\1/p')
set +o pipefail
left_pid=$(cat "$LEFT_PID_FILE")
right_pid=$(cat "$RIGHT_PID_FILE")
printf 'left_pid=%s right_pid=%s\n' "$left_pid" "$right_pid"
printf 'pipeline_status=%s\n' "$pipeline_status"
printf 'pipeline_vector=%s\n' "$pipeline_vector"
printf 'pipeline_output=%s\n' "$(cat "$PIPE_OUTPUT")"
if printf '%s' "$pipeline_vector" | grep -q '7' && printf '%s' "$pipeline_vector" | grep -q '0'; then printf 'pipeline_members=failed-left-successful-right\n'; else printf 'pipeline_members=unexpected\n'; fi
rm -f "$LEFT_PID_FILE" "$RIGHT_PID_FILE" "$PIPE_OUTPUT"
trap - EXIT
`,
      expectedResult:
        code`left_pid and right_pid are distinct positive PIDs; pipeline_output=left-output; pipeline_status is nonzero because pipefail sees the left exit 7; pipeline_vector contains one 7 and one 0; and pipeline_members=failed-left-successful-right. The array's exact formatting is Bash-version dependent.`,
      systemsLens:
        code`Pipelines form a process graph joined by kernel pipes. A supervisor that reports only the final reader's status can hide an upstream failure, just as a distributed pipeline can hide a failed producer behind a healthy sink.`,
    },
    {
      slug: "signal-disposition",
      title: "Turn SIGTERM delivery into child policy",
      difficulty: "beginner",
      tags: ["signals", "processes", "shell"],
      prerequisites: ["wait-and-exit-status"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      overview:
        code`Install a TERM handler in one child, wait for its readiness record, and send SIGTERM. The child converts asynchronous delivery into a durable receipt and a clean exit.`,
      syntaxBreakdown:
        code`trap installs a signal disposition; kill -0 probes existence without delivering a signal; kill -TERM requests graceful handling; wait captures the resulting exit status; a polling loop bounds readiness.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
READY_FILE=$LAB/signal-ready-$UID
TERM_FILE=$LAB/signal-term-$UID
rm -f "$READY_FILE" "$TERM_FILE"
trap 'test -n "$signal_pid" && kill "$signal_pid" 2>/dev/null || true; test -n "$signal_pid" && wait "$signal_pid" 2>/dev/null || true; rm -f "$READY_FILE" "$TERM_FILE"' EXIT
export READY_FILE TERM_FILE
bash -c 'trap "printf '\''%s\n'\'' term_received > \"$TERM_FILE\"; exit 0" TERM; : > "$READY_FILE"; sleep 5' &
signal_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$READY_FILE" ] && break
  sleep 0.05
done
printf 'ready=%s\n' "$(test -e "$READY_FILE" && echo yes || echo no)"
if kill -0 "$signal_pid" 2>/dev/null; then printf 'alive_before_term=yes\n'; else printf 'alive_before_term=no\n'; fi
kill -TERM "$signal_pid"
wait "$signal_pid"
signal_status=$?
printf 'term_receipt=%s\n' "$(cat "$TERM_FILE")"
printf 'term_exit_status=%s\n' "$signal_status"
rm -f "$READY_FILE" "$TERM_FILE"
trap - EXIT
`,
      expectedResult:
        code`ready=yes, alive_before_term=yes, term_receipt=term_received, and term_exit_status=0. The handler chose a clean exit after receiving TERM; readiness polling is bounded at ten short attempts.`,
      systemsLens:
        code`Signals are asynchronous requests interpreted by a process's disposition. Graceful shutdown is therefore a protocol—readiness, signal, drain, exit—not merely a numeric kill command.`,
    },
    {
      slug: "graceful-and-forced-stop",
      title: "Compare graceful TERM with forced KILL",
      difficulty: "beginner",
      tags: ["signals", "processes"],
      prerequisites: ["signal-disposition"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 10,
      overview:
        code`Give one child a TERM handler and send KILL to another identical sleeper. Their wait statuses expose the difference between cooperative cleanup and kernel-enforced termination.`,
      syntaxBreakdown:
        code`SIGTERM is catchable; SIGKILL cannot be caught or delayed; wait returns 128 plus the terminating signal number for a signalled child; trap ensures exact-PID fallback cleanup.`,
      code: code`
graceful_pid=
forced_pid=
bash -c 'trap "exit 0" TERM; sleep 5' &
graceful_pid=$!
sleep 5 &
forced_pid=$!
trap 'kill "$graceful_pid" "$forced_pid" 2>/dev/null || true; wait "$graceful_pid" "$forced_pid" 2>/dev/null || true' EXIT
sleep 0.1
kill -TERM "$graceful_pid"
kill -KILL "$forced_pid"
wait "$graceful_pid"
graceful_status=$?
wait "$forced_pid"
forced_status=$?
printf 'graceful_status=%s\n' "$graceful_status"
printf 'forced_status=%s\n' "$forced_status"
if [ "$graceful_status" -eq 0 ] && [ "$forced_status" -eq 137 ]; then printf 'stop_modes=cooperative-versus-kernel\n'; else printf 'stop_modes=observed-statuses-vary\n'; fi
trap - EXIT
`,
      expectedResult:
        code`graceful_status=0 and forced_status=137 (128+SIGKILL), producing stop_modes=cooperative-versus-kernel. If a shell reports a platform-specific signalled status, the labels still identify which exact child received each signal.`,
      systemsLens:
        code`TERM leaves policy to the application; KILL removes that policy and ends the task in the kernel. Operators need both paths: graceful draining for correctness and forced bounds for stuck processes.`,
    },
    {
      slug: "zombies-and-orphans",
      title: "Distinguish zombie retention from orphan reparenting",
      difficulty: "intermediate",
      tags: ["processes", "procfs", "signals"],
      prerequisites: ["wait-and-exit-status"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 18,
      overview:
        code`Use a bounded Python parent that leaves one exited child unreaped briefly and lets another child outlive it. Observe a Z state before wait, then compare the orphan's parent PID before and after reparenting.`,
      syntaxBreakdown:
        code`fork creates children; os._exit ends a child without Python cleanup; ps stat exposes Z; os.waitpid reaps a zombie; os.getppid reports the current parent; polling avoids an unbounded race.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
PID_FILE=$LAB/zombie-pids-$UID
REPORT_FILE=$LAB/orphan-report-$UID
rm -f "$PID_FILE" "$REPORT_FILE"
python3 -c 'import os,time,sys; p,r=sys.argv[1:]; z=os.fork(); z == 0 and os._exit(0); o=os.fork(); o == 0 and (open(r,"w").write("before_ppid="+str(os.getppid())+"\n"), time.sleep(.6), open(r,"a").write("after_ppid="+str(os.getppid())+"\n"), time.sleep(.2), os._exit(0)); open(p,"w").write(str(os.getpid())+" "+str(z)+" "+str(o)+"\n"); time.sleep(.25); os.waitpid(z,0); time.sleep(.1)' "$PID_FILE" "$REPORT_FILE" &
python_parent=$!
orphan_pid=
trap 'kill "$python_parent" 2>/dev/null || true; test -n "$orphan_pid" && kill "$orphan_pid" 2>/dev/null || true; wait "$python_parent" "$orphan_pid" 2>/dev/null || true; rm -f "$PID_FILE" "$REPORT_FILE"' EXIT
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  [ -s "$PID_FILE" ] && break
  sleep 0.05
done
read python_record_pid zombie_pid orphan_pid < "$PID_FILE"
zombie_state=$(ps -o stat= -p "$zombie_pid" 2>/dev/null | tr -d ' ' | cut -c1)
printf 'zombie_pid=%s\n' "$zombie_pid"
printf 'zombie_state=%s\n' "$zombie_state"
printf 'orphan_pid=%s\n' "$orphan_pid"
wait "$python_parent"
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  grep -q '^after_ppid=' "$REPORT_FILE" 2>/dev/null && break
  sleep 0.05
done
before_ppid=$(awk -F= '/^before_ppid=/{print $2}' "$REPORT_FILE")
after_ppid=$(awk -F= '/^after_ppid=/{print $2}' "$REPORT_FILE")
printf 'orphan_before_ppid=%s\n' "$before_ppid"
printf 'orphan_after_ppid=%s\n' "$after_ppid"
if [ "$zombie_state" = Z ] && [ "$before_ppid" != "$after_ppid" ]; then printf 'lifecycle_distinction=observed\n'; else printf 'lifecycle_distinction=check_timing_or_subreaper\n'; fi
rm -f "$PID_FILE" "$REPORT_FILE"
trap - EXIT
`,
      expectedResult:
        code`zombie_state=Z while the Python parent delays wait; orphan_before_ppid equals python_record_pid; after the parent exits, orphan_after_ppid differs (commonly 1, or a VM subreaper); and lifecycle_distinction=observed. Exact PIDs and the reaper PID vary.`,
      systemsLens:
        code`Exit and reaping are separate lifecycle events: a zombie retains a small status record until its parent waits, while an orphan is reparented so it can eventually be reaped. Both are failure modes for supervisors that neglect lifecycle ownership.`,
      caution:
        code`This experiment uses only two exact children and waits for bounded completion. Never generalize it into host-wide process cleanup.`,
    },
  ],
};
