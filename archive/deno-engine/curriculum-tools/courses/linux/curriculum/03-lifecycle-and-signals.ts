import { code, type Module } from "../../../src/types.ts";

const explain = (plain: string, learning: string[], pieces: string[]) =>
  `### In plain terms\n\n${plain}\n\n### What you are learning\n\n${
    learning.map((x) => `- ${x}`).join("\n")
  }\n\n### Piece by piece\n\n${pieces.map((x) => `- ${x}`).join("\n")}`;
const challenge = (predict: string, inspect: string, vary: string, hint: string, apply: string) =>
  `**Predict.** ${predict}\n\n**Inspect and explain.** ${inspect}\n\n**Vary.** ${vary}\n\n**Hint.** ${hint}\n\n**Apply.** ${apply}`;

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
      revision: 2,
      overview:
        code`Run equal bounded sleeps in the foreground and background, measuring when the shell returns and when the work completes. The shell is a process supervisor that decides whether to wait immediately.`,
      syntaxBreakdown: explain(
        "Equal sleeps show two shell supervision choices. The elapsed numbers are samples under current load, while the ordering relationship is the observation to defend.",
        [
          "Foreground work blocks the shell before its next command.",
          "Background work returns control before an explicit join.",
        ],
        [
          "**date +%s%N** prints a nanosecond-resolution epoch sample; subtracting two values with **$((...))** yields integer milliseconds. The **-lt** and **-ge** numeric tests compare those integer values; the challenge changes the supplied total-time lower bound with its shorter sleep.",
          "A foreground **sleep 0.25** holds the shell. **sleep 0.25 &** backgrounds a child and **$!** records it.",
          "**jobs -l** is a Bash job-table view; it is supporting observation, not the PID authority.",
          "**wait PID** joins the child before measuring total duration. `foreground_ms`, `background_return_ms`, and `background_total_ms` vary with scheduling; the final relation is the check.",
        ],
      ),
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
      challenge: challenge(
        "Before running, how should foreground duration, background return time, and background total time relate?",
        "Explain which timestamp brackets submission and which brackets completion.",
        "In a full rerun, change both sleeps to 0.10 seconds and change the `background_total_ms -ge 200` assertion to `-ge 80` before comparing the same relationship.",
        "Keep wait after the job listing so the background child is reaped; update the lower bound before the assertion executes.",
        "Choose whether a service launcher should wait for readiness, completion, or neither, and name the evidence.",
      ),
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
      revision: 2,
      overview:
        code`Launch one child that exits successfully and one that exits with status 7, then capture both wait results. Exit status is a compact completion message from child to parent.`,
      syntaxBreakdown: explain(
        "Two children make completion values visible. A nonzero exit is deliberately captured immediately, so it remains evidence instead of becoming an accidental shell failure.",
        [
          "Exit status is a small parent-visible completion channel.",
          "The value of `$?` is overwritten by the next command.",
        ],
        [
          "**bash -c 'exit N' &** starts a child with an explicit status and **$!** records its PID.",
          "**wait PID** both joins the selected child and sets **$?** to its status. The assignment immediately following each wait preserves that value.",
          "The printed PID/status pairs identify which child supplied 0 and 7. `exit_channel=preserved` compares the two intentional outcomes.",
        ],
      ),
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
      challenge:
        "**Predict.** Before running, what status should the parent retain from the intentionally nonzero child?\n\n**Inspect and explain.** Point out why inserting printf between wait and the status assignment would destroy the evidence.\n\n**Vary.** Rerun the full block with exit 7 changed to exit 9 and the failure_status comparison changed from -eq 7 to -eq 9.\n\n**Hint.** Capture `$?` on the next line after the wait.\n\n**Apply.** Map status 0, a known application failure, and signal termination to three supervisor actions.",
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
      revision: 3,
      overview:
        code`Run a two-process pipeline whose left member fails after recording its PID. Inspect both member PIDs and Bash's PIPESTATUS vector to show that a pipeline is concurrent process composition, not one command.`,
      syntaxBreakdown: explain(
        "A pipeline has two concurrent processes and several status views. The left side fails after producing a record; pipefail makes that upstream failure visible in the pipeline result.",
        [
          "A pipe connects one process's stdout to another's stdin.",
          "PIPESTATUS is per-member evidence and is overwritten by later commands.",
        ],
        [
          "**|** creates the kernel pipe. The first **bash -c** exits 7, while **cat** succeeds, so the first pipeline's ordinary `$?` is 0.",
          "**set -o pipefail** changes Bash's whole-pipeline status to the rightmost nonzero member; **set +o pipefail** restores the initial policy.",
          "The children write **BASHPID** into exported lab paths. **> /dev/null** discards the first test output; **cat > FILE** captures the second pipeline payload.",
          "`pipeline_status=$? left_status=${PIPESTATUS[0]} right_status=${PIPESTATUS[1]}` must be one assignment line: it retains both pipeline and member results before any command overwrites them.",
        ],
      ),
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
LEFT_PID_FILE=$LAB/pipeline-left-$UID.pid
RIGHT_PID_FILE=$LAB/pipeline-right-$UID.pid
PIPE_OUTPUT=$LAB/pipeline-output-$UID.txt
trap 'rm -f "$LEFT_PID_FILE" "$RIGHT_PID_FILE" "$PIPE_OUTPUT"' EXIT
export LEFT_PID_FILE RIGHT_PID_FILE PIPE_OUTPUT
bash -c 'exit 7' | cat > /dev/null
status_without_pipefail=$?
set -o pipefail
bash -c 'printf "%s\n" "$BASHPID" > "$LEFT_PID_FILE"; printf "left-output\n"; exit 7' |
  bash -c 'printf "%s\n" "$BASHPID" > "$RIGHT_PID_FILE"; cat > "$PIPE_OUTPUT"'
pipeline_status=$? left_status=${"$"}{PIPESTATUS[0]} right_status=${"$"}{PIPESTATUS[1]}
set +o pipefail
left_pid=$(cat "$LEFT_PID_FILE")
right_pid=$(cat "$RIGHT_PID_FILE")
printf 'left_pid=%s right_pid=%s\n' "$left_pid" "$right_pid"
printf 'status_without_pipefail=%s\n' "$status_without_pipefail"
printf 'left_status=%s right_status=%s pipeline_status=%s\n' "$left_status" "$right_status" "$pipeline_status"
printf 'pipeline_output=%s\n' "$(cat "$PIPE_OUTPUT")"
if [ "$left_status" -eq 7 ] && [ "$right_status" -eq 0 ] && [ "$pipeline_status" -eq 7 ] && [ "$status_without_pipefail" -eq 0 ]; then printf 'pipeline_members=failed-left-successful-right\n'; else printf 'pipeline_members=unexpected\n'; fi
rm -f "$LEFT_PID_FILE" "$RIGHT_PID_FILE" "$PIPE_OUTPUT"
trap - EXIT
`,
      expectedResult:
        code`left_pid and right_pid are distinct positive PIDs; pipeline_output=left-output; status_without_pipefail=0 because the last member (cat) succeeded; left_status=7 right_status=0 pipeline_status=7 because pipefail reports the last nonzero member; and pipeline_members=failed-left-successful-right.`,
      systemsLens:
        code`Pipelines form a process graph joined by kernel pipes. A supervisor that reports only the final reader's status can hide an upstream failure, just as a distributed pipeline can hide a failed producer behind a healthy sink.`,
      challenge:
        "**Predict.** Before running, how do you predict the ordinary pipeline status and pipefail status will differ?\n\n**Inspect and explain.** Explain why the output file can contain left-output despite the left member's failure.\n\n**Vary.** Rerun the full block with both exit 7 commands changed to exit 3 and both -eq 7 comparisons changed to -eq 3. Keep the immediate combined status assignment.\n\n**Hint.** Do not insert a command between the pipeline and its combined status assignment.\n\n**Apply.** State which per-stage status a multi-step ingestion service should retain for diagnosis.",
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
      revision: 3,
      overview:
        code`Install a TERM handler in one child, wait for its readiness record, and send SIGTERM. The child converts asynchronous delivery into a durable receipt and a clean exit.`,
      syntaxBreakdown: explain(
        "A child advertises readiness, receives TERM, writes a receipt, and exits cleanly. The timing is sampled evidence of this shell's handler path, not a universal shutdown deadline.",
        [
          "A signal disposition is process policy for asynchronous delivery.",
          "A foreground Bash wait would delay a trap, so the child waits on a background sleep.",
        ],
        [
          "**trap ... TERM** installs the child's handler. It kills its recorded background sleep, writes `term_received`, and exits 0.",
          "**: > READY_FILE** creates the readiness marker; the fixed **for** loop with **sleep 0.05** bounds the parent's wait.",
          "**kill -0 PID** probes liveness without delivery. **kill -TERM PID** requests the handler path, and **wait** captures its status.",
          "The two **date +%s%N** samples calculate `term_handled_ms`; scheduler load can move it, while receipt and exit status prove the chosen policy.",
        ],
      ),
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
READY_FILE=$LAB/signal-ready-$UID
TERM_FILE=$LAB/signal-term-$UID
rm -f "$READY_FILE" "$TERM_FILE"
trap 'test -n "$signal_pid" && kill "$signal_pid" 2>/dev/null || true; test -n "$signal_pid" && wait "$signal_pid" 2>/dev/null || true; rm -f "$READY_FILE" "$TERM_FILE"' EXIT
export READY_FILE TERM_FILE
bash -c 'sleep 30 & trap "kill $! 2>/dev/null; printf '\''%s\n'\'' term_received > \"$TERM_FILE\"; exit 0" TERM; : > "$READY_FILE"; wait' &
signal_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$READY_FILE" ] && break
  sleep 0.05
done
printf 'ready=%s\n' "$(test -e "$READY_FILE" && echo yes || echo no)"
if kill -0 "$signal_pid" 2>/dev/null; then printf 'alive_before_term=yes\n'; else printf 'alive_before_term=no\n'; fi
term_sent_ns=$(date +%s%N)
kill -TERM "$signal_pid"
wait "$signal_pid"
signal_status=$?
term_handled_ms=$(( ($(date +%s%N) - term_sent_ns) / 1000000 ))
printf 'term_receipt=%s\n' "$(cat "$TERM_FILE")"
printf 'term_exit_status=%s\n' "$signal_status"
printf 'term_handled_ms=%s\n' "$term_handled_ms"
if [ "$term_handled_ms" -lt 1000 ]; then printf 'handler_ran_promptly=yes\n'; else printf 'handler_ran_promptly=no\n'; fi
rm -f "$READY_FILE" "$TERM_FILE"
trap - EXIT
`,
      expectedResult:
        code`ready=yes, alive_before_term=yes, term_receipt=term_received, term_exit_status=0, term_handled_ms well under 1000, and handler_ran_promptly=yes. The handler chose a clean exit as soon as TERM arrived, killing its own 30-second sleep on the way out; readiness polling is bounded at ten short attempts.`,
      systemsLens:
        code`Signals are asynchronous requests interpreted by a process's disposition. Graceful shutdown is therefore a protocol—readiness, signal, drain, exit—not merely a numeric kill command.`,
      challenge: challenge(
        "Before running, what ordering should the readiness marker, TERM request, receipt, and wait result have?",
        "Explain why the child uses `sleep 30 & ... wait` instead of foreground sleep.",
        "Change only the readiness poll delay to 0.02 seconds and retain its finite attempt count.",
        "Do not send TERM until READY_FILE exists.",
        "Define the readiness, drain, and exit evidence required for a graceful worker shutdown.",
      ),
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
      revision: 3,
      overview:
        code`Give one child a TERM handler and send KILL to another identical sleeper. Their wait statuses expose the difference between cooperative cleanup and kernel-enforced termination.`,
      syntaxBreakdown: explain(
        "Two recorded children receive different termination requests. One handles TERM and exits by policy; KILL ends the other in the kernel before it can run cleanup.",
        [
          "SIGTERM is catchable and cooperative.",
          "SIGKILL is uncatchable; signalled wait status is shell-reported evidence.",
        ],
        [
          "The graceful **bash -c** starts a background sleep, installs **trap ... TERM**, then **wait**s so its handler can run promptly.",
          "The second **sleep 30 &** has no handler. **$!** records each PID and the EXIT trap has exact-PID forced fallback cleanup.",
          "**kill -TERM** requests policy while **kill -KILL** ends the selected process. Each **wait** returns a status captured immediately.",
          "`both_stopped_ms` is a timing sample; 137 commonly means 128 plus SIGKILL 9, but the labeled statuses identify the causal branch.",
        ],
      ),
      code: code`
graceful_pid=
forced_pid=
bash -c 'sleep 30 & trap "kill $! 2>/dev/null; exit 0" TERM; wait' &
graceful_pid=$!
sleep 30 &
forced_pid=$!
trap 'kill -KILL "$graceful_pid" "$forced_pid" 2>/dev/null || true; wait "$graceful_pid" "$forced_pid" 2>/dev/null || true' EXIT
sleep 0.1
sent_ns=$(date +%s%N)
kill -TERM "$graceful_pid"
kill -KILL "$forced_pid"
wait "$graceful_pid"
graceful_status=$?
wait "$forced_pid"
forced_status=$?
stopped_ms=$(( ($(date +%s%N) - sent_ns) / 1000000 ))
printf 'graceful_status=%s\n' "$graceful_status"
printf 'forced_status=%s\n' "$forced_status"
printf 'both_stopped_ms=%s\n' "$stopped_ms"
if [ "$graceful_status" -eq 0 ] && [ "$forced_status" -eq 137 ]; then printf 'stop_modes=cooperative-versus-kernel\n'; else printf 'stop_modes=observed-statuses-vary\n'; fi
trap - EXIT
`,
      expectedResult:
        code`graceful_status=0 and forced_status=137 (128+SIGKILL), producing stop_modes=cooperative-versus-kernel, with both_stopped_ms well under 1000 even though both children were sleeping for 30 seconds. If a shell reports a platform-specific signalled status, the labels still identify which exact child received each signal.`,
      systemsLens:
        code`TERM leaves policy to the application; KILL removes that policy and ends the task in the kernel. Operators need both paths: graceful draining for correctness and forced bounds for stuck processes.`,
      challenge: challenge(
        "Before running, what completion statuses do you predict for the TERM-handling child and the KILLed child?",
        "Explain why a short elapsed sample does not prove that arbitrary TERM handlers are fast.",
        "Change only the graceful child sleep to 5 seconds and repeat the same signal sequence.",
        "Keep both recorded PIDs and the exact cleanup trap.",
        "Specify the escalation deadline and evidence you would require before replacing TERM with KILL in production.",
      ),
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
      revision: 2,
      overview:
        code`Use a bounded Python parent that leaves one exited child unreaped briefly and lets another child outlive it. Observe a Z state before wait, then compare the orphan's parent PID before and after reparenting.`,
      syntaxBreakdown: explain(
        "A bounded Python parent leaves one exited child unreaped briefly and lets another outlive it. The resulting state samples distinguish a zombie status record from an orphan's new parent relationship.",
        [
          "Exit and reaping are separate lifecycle events.",
          "Orphan reparenting depends on the host's init or configured subreaper.",
        ],
        [
          "**os.fork** creates the zombie and orphan children. **os._exit** ends a child without Python cleanup; **os.waitpid(z,0)** later reaps the zombie.",
          "The Python helper writes its three PIDs and uses **time.sleep** to create bounded observation windows. **$!** records the outer Python parent for exact trap cleanup.",
          "The shell polls fixed attempts for the PID and report files. **ps -o stat=** samples the zombie state; **awk -F=** reads before/after parent IDs.",
          "`zombie_state=Z` and differing orphan PPIDs are observations. The new parent is commonly 1 but may be a subreaper, so the lesson reports a relationship rather than a fixed PID.",
        ],
      ),
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
      challenge: challenge(
        "Before running, which state and parentage changes would distinguish zombie retention from orphan reparenting?",
        "Identify which labels are timing-sensitive snapshots and which record the causal wait/reparent sequence.",
        "Change only the Python zombie delay from .25 to .35 seconds and repeat the same bounded checks.",
        "Leave the PID-file polling and exact-PID trap intact.",
        "Describe how a supervisor should distinguish unreaped children from workers merely reparented during a restart.",
      ),
    },
  ],
};
