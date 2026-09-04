import { code, type Module } from "../../../src/types.ts";

const explain = (plain: string, learning: string[], pieces: string[]) =>
  `### In plain terms\n\n${plain}\n\n### What you are learning\n\n${
    learning.map((x) => `- ${x}`).join("\n")
  }\n\n### Piece by piece\n\n${pieces.map((x) => `- ${x}`).join("\n")}`;
const challenge = (predict: string, inspect: string, vary: string, hint: string, apply: string) =>
  `**Predict.** ${predict}\n\n**Inspect and explain.** ${inspect}\n\n**Vary.** ${vary}\n\n**Hint.** ${hint}\n\n**Apply.** ${apply}`;

export const PROCESSES: Module = {
  category: "processes-and-identity",
  title: "Connect process identity to the kernel's task model",
  lessons: [
    {
      slug: "pid-and-parentage",
      title: "Read PID and parentage from procfs",
      difficulty: "beginner",
      tags: ["processes", "procfs"],
      prerequisites: ["cleanup-with-traps"],
      safetyLevel: "read-only",
      runIn: "shell",
      estimatedMinutes: 10,
      revision: 2,
      overview:
        code`Spawn one bounded child and correlate the shell's PID, the child's PID, and the child's PPID. The relationship is kernel-maintained process identity, not a convention inferred from a command line.`,
      syntaxBreakdown: explain(
        "A child process has a kernel PID and a parent PID. The experiment reads both identities while the child is still alive, then reaps only that recorded child.",
        [
          "A PID is a namespace-local task identifier.",
          "PPID is a kernel-maintained parent relationship.",
        ],
        [
          "**bash -c** starts a child Bash; **sleep 4** keeps it observable.",
          "**&** backgrounds that child and **$!** captures its PID immediately; **BASHPID** identifies the current shell process.",
          "**awk** reads the `PPid:` field from **/proc/PID/status**. **ps -o pid=,ppid=,stat=,comm= -p PID** prints only the selected process; the empty `=` headings make columns easier to compare.",
          "The equality test produces `parentage_check`; **wait PID** reaps the exact child. PIDs and the sampled state vary.",
        ],
      ),
      code: code`
child_pid=
bash -c 'sleep 4' &
child_pid=$!
shell_pid=$BASHPID
child_ppid=$(awk '/^PPid:/{print $2}' "/proc/$child_pid/status")
printf 'shell_bashpid=%s\n' "$shell_pid"
printf 'child_pid=%s\n' "$child_pid"
printf 'child_ppid=%s\n' "$child_ppid"
ps -o pid=,ppid=,stat=,comm= -p "$child_pid"
if [ "$child_ppid" -eq "$shell_pid" ]; then printf 'parentage_check=direct-child\n'; else printf 'parentage_check=unexpected\n'; fi
wait "$child_pid"
printf 'cleanup=child_reaped\n'
`,
      expectedResult:
        code`child_pid is a live positive PID; child_ppid equals shell_bashpid; ps shows the child in a sleeping state with that PPID; parentage_check=direct-child; and wait finishes with cleanup=child_reaped. PIDs vary per run.`,
      systemsLens:
        code`A PID names a task in a process namespace and PPID records its parent relationship. Supervisors, reapers, and request-to-process correlation all depend on this kernel-maintained identity graph.`,
      challenge: challenge(
        "Before running, which two printed identity values should you compare to test direct parentage?",
        "Compare the PPID in procfs with the ps row and explain why a command name alone is weaker evidence.",
        "Change only the child delay from 4 to 1 second and repeat before it exits.",
        "Keep `$!` immediately after the background command.",
        "State which PID and parent relation you would capture before terminating an unexpected service worker.",
      ),
    },
    {
      slug: "process-tree",
      title: "Observe a controlled process tree",
      difficulty: "beginner",
      tags: ["processes", "procfs"],
      prerequisites: ["pid-and-parentage"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      revision: 2,
      overview:
        code`Create a parent, child, and grandchild that sleep briefly, then inspect their hierarchy with pstree and ps --forest. The tree shows which execution contexts were forked from which ancestors.`,
      syntaxBreakdown: explain(
        "One controlled root creates a child and grandchild. Two process views sample the same short-lived hierarchy before exact cleanup removes the root.",
        [
          "A process tree is ancestry, not merely a list of command names.",
          "Display formatting is sampled evidence and may change as children exit.",
        ],
        [
          "**bash -c** creates each shell; the inner **&** starts the grandchild and **wait** keeps its parent alive.",
          "**$!** records the outer root. **trap ... EXIT** kills and waits for only that PID if the observation fails midway.",
          "**pstree -p PID** prints descendants and annotates each with its PID. **ps --forest** draws indentation from parentage; **-p** selects the root and **--ppid** asks for direct children.",
          "**sleep 0.2** is a bounded observation delay, not a guarantee that every display will retain every short-lived process.",
        ],
      ),
      code: code`
tree_parent=
bash -c 'bash -c "sleep 5" & wait' &
tree_parent=$!
trap 'kill "$tree_parent" 2>/dev/null || true; wait "$tree_parent" 2>/dev/null || true' EXIT
sleep 0.2
printf 'tree_root_pid=%s\n' "$tree_parent"
printf 'pstree_evidence=\n'
pstree -p "$tree_parent"
printf 'ps_forest_evidence=\n'
ps -o pid=,ppid=,stat=,comm= --forest -p "$tree_parent" --ppid "$tree_parent"
kill "$tree_parent" 2>/dev/null || true
wait "$tree_parent" 2>/dev/null || true
trap - EXIT
printf 'cleanup=tree_stopped\n'
`,
      expectedResult:
        code`pstree_evidence contains tree_root_pid and at least one descendant, and ps_forest_evidence lists the root and its child with matching PID/PPID columns. cleanup=tree_stopped follows exact root cleanup; short-lived PIDs and display spacing vary.`,
      systemsLens:
        code`Fork ancestry propagates environment, credentials, and open descriptors while retaining a parent-child lifecycle edge. A service tree is therefore useful evidence when an unexpected worker survives or inherits state.`,
      challenge: challenge(
        "Before running, what hierarchy should each process view reveal before cleanup?",
        "Match a PID in pstree to its PID/PPID ps row and explain the indentation.",
        "Change the inner sleep from 5 to 2 seconds and repeat the bounded snapshot.",
        "Do not add broad process searches; use tree_root_pid.",
        "Choose whether an orphaned-looking worker needs its parent tree, command line, or descriptor evidence next.",
      ),
    },
    {
      slug: "proc-process-identity",
      title: "Correlate ps identity with procfs identity",
      difficulty: "beginner",
      tags: ["processes", "procfs", "troubleshooting"],
      prerequisites: ["pid-and-parentage"],
      safetyLevel: "read-only",
      runIn: "shell",
      estimatedMinutes: 12,
      revision: 2,
      overview:
        code`Start one uniquely argv-labelled process and read its identity through ps, pgrep, and procfs. Correlation by PID is stronger than matching a mutable display name alone.`,
      syntaxBreakdown: explain(
        "The lesson correlates one recorded PID across several procfs and tool views. It shows why a mutable argv label is useful search evidence but is insufficient identity by itself.",
        [
          "argv, comm, executable, and start time are different process attributes.",
          "procfs reports live state; a snapshot can disappear when the child exits.",
        ],
        [
          "**exec -a NAME** changes the child argv[0] before it execs **sleep**. **$!** remains the authoritative recorded PID.",
          "**ps -o pid= -p PID** and **pgrep -P $$ -f PATTERN** are two filters; the latter searches full command lines and is constrained to this shell's child.",
          "**readlink -f /proc/PID/exe** resolves the executable. **awk** extracts `Name:`, `State:`, and field 22 from procfs; field 22 is start-time ticks since boot.",
          "**tr '\\0' ' '** renders NUL-delimited cmdline records. State and ticks are observations, while PID correlation is the check.",
        ],
      ),
      code: code`
proc_identity_pid=
bash -c 'exec -a linux-tutor-proc-identity sleep 5' &
proc_identity_pid=$!
trap 'kill "$proc_identity_pid" 2>/dev/null || true; wait "$proc_identity_pid" 2>/dev/null || true' EXIT
sleep 0.1
printf 'proc_pid=%s\n' "$proc_identity_pid"
printf 'ps_pid=%s\n' "$(ps -o pid= -p "$proc_identity_pid" | tr -d ' ')"
printf 'pgrep_pid=%s\n' "$(pgrep -P "$$" -f 'linux-tutor-proc-identity' | head -n 1)"
printf 'proc_exe=%s\n' "$(readlink -f "/proc/$proc_identity_pid/exe")"
printf 'proc_name=%s\n' "$(awk '/^Name:/{print $2}' "/proc/$proc_identity_pid/status")"
printf 'proc_state=%s\n' "$(awk '/^State:/{print $2}' "/proc/$proc_identity_pid/status")"
printf 'starttime_ticks=%s\n' "$(awk '{print $22}' "/proc/$proc_identity_pid/stat")"
printf 'cmdline='; tr '\0' ' ' < "/proc/$proc_identity_pid/cmdline"; printf '\n'
kill "$proc_identity_pid" 2>/dev/null || true
wait "$proc_identity_pid" 2>/dev/null || true
trap - EXIT
`,
      expectedResult:
        code`proc_pid and ps_pid match; pgrep_pid is the same child PID; proc_exe resolves to the sleep executable; proc_name= sleep (or the distro's equivalent comm); proc_state begins with S; starttime_ticks is numeric; and cmdline contains linux-tutor-proc-identity. The exact tick count varies.`,
      systemsLens:
        code`procfs is a live projection of kernel task state, while ps and pgrep are different readers and filters over that state. Incident tools should correlate stable identifiers and timestamps before trusting names.`,
      challenge: challenge(
        "Before running, which PID relationships should identify one live child across the three views?",
        "Explain why proc_name can be sleep while cmdline contains the chosen argv label.",
        "In a full rerun, change both the `exec -a` label and the matching pgrep pattern to linux-tutor-proc-variation, then inspect cmdline.",
        "Keep the pgrep parent filter so an unrelated process cannot win; its pattern must match the changed argv label.",
        "Describe the identity tuple you would record before escalating a process incident.",
      ),
    },
    {
      slug: "command-line-and-environment",
      title: "Distinguish argv from the environment",
      difficulty: "beginner",
      tags: ["processes", "procfs"],
      prerequisites: ["proc-process-identity"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 10,
      revision: 2,
      overview:
        code`Launch a child with a lab-only environment token and inspect its NUL-delimited command line and environment separately. Both are inherited byte vectors, but they answer different debugging questions.`,
      syntaxBreakdown: explain(
        "The child receives both an argument vector and environment vector. Each is NUL-delimited in procfs, but they carry different kinds of data and should not be used as interchangeable identity.",
        [
          "argv selects a program and its arguments.",
          "Environment values are inherited configuration and can contain secrets.",
        ],
        [
          "**env NAME=VALUE bash -c** adds one variable only for the child command. **$!** records its PID.",
          "**/proc/PID/cmdline** and **environ** contain NUL, not newline, separators; **tr '\\0'** makes records printable.",
          "**grep '^LINUX_TUTOR_TOKEN='** selects the exact environment key, while the cmdline check looks for the executable name.",
          "The trap uses recorded PID cleanup. Do not copy real secrets into this experiment; the printed token is lab-only.",
        ],
      ),
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
TOKEN=linux-tutor-token-$UID
export TOKEN
env LINUX_TUTOR_TOKEN="$TOKEN" bash -c 'sleep 5' &
argv_env_pid=$!
trap 'kill "$argv_env_pid" 2>/dev/null || true; wait "$argv_env_pid" 2>/dev/null || true' EXIT
sleep 0.1
printf 'process_pid=%s\n' "$argv_env_pid"
printf 'cmdline='; tr '\0' ' ' < "/proc/$argv_env_pid/cmdline"; printf '\n'
printf 'environment_token=%s\n' "$(tr '\0' '\n' < "/proc/$argv_env_pid/environ" | grep '^LINUX_TUTOR_TOKEN=')"
if tr '\0' '\n' < "/proc/$argv_env_pid/cmdline" | grep -q 'sleep'; then printf 'argv_contains_program=yes\n'; else printf 'argv_contains_program=no\n'; fi
kill "$argv_env_pid" 2>/dev/null || true
wait "$argv_env_pid" 2>/dev/null || true
trap - EXIT
`,
      expectedResult:
        code`cmdline contains sleep, environment_token=LINUX_TUTOR_TOKEN=linux-tutor-token-<UID>, and argv_contains_program=yes. process_pid varies. Bash may optimize the final sleep and replace its own command line; that is why the experiment checks the observable argv rather than requiring a shell wrapper.`,
      systemsLens:
        code`argv selects how a program interprets its arguments; environ carries inherited configuration and secrets. Treating either as process identity causes misleading diagnoses and accidental credential exposure.`,
      challenge: challenge(
        "Before running, where do you predict the lab token and executable name will appear?",
        "Identify the NUL conversion and explain why printing production environ is risky.",
        "Replace only the lab token suffix with `variation-$UID` and re-run.",
        "Use the existing LINUX_TUTOR_TOKEN name, never a credential.",
        "Decide which safe process attributes belong in an incident ticket and which should be redacted.",
      ),
    },
    {
      slug: "process-states",
      title: "Observe sleeping and stopped process states",
      difficulty: "beginner",
      tags: ["processes", "procfs", "signals"],
      prerequisites: ["proc-process-identity"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      revision: 2,
      overview:
        code`Observe one child while it sleeps, stop it with SIGSTOP, and continue it with SIGCONT. The state letter explains why a task is not currently executing.`,
      syntaxBreakdown: explain(
        "A sleep child is sampled, stopped, and continued. The state letters show an observable transition; they do not promise how a busy process would be scheduled at every instant.",
        [
          "SIGSTOP makes a task stopped until continued.",
          "ps state is a sampled kernel-state summary.",
        ],
        [
          "**sleep 5 &** creates a bounded child and **$!** records it for cleanup.",
          "**ps -o stat= -p PID** requests the compact state field only; **tr -d ' '** removes padding and **cut -c1** keeps its primary letter.",
          "**kill -STOP PID** cannot be caught by the child; **kill -CONT PID** makes a stopped task runnable again.",
          "The equality test expects S, T, S for this sleeping child. The trap kills and waits only the recorded PID.",
        ],
      ),
      code: code`
state_pid=
sleep 5 &
state_pid=$!
trap 'kill "$state_pid" 2>/dev/null || true; wait "$state_pid" 2>/dev/null || true' EXIT
sleep 0.1
state_before=$(ps -o stat= -p "$state_pid" | tr -d ' ' | cut -c1)
kill -STOP "$state_pid"
sleep 0.1
state_stopped=$(ps -o stat= -p "$state_pid" | tr -d ' ' | cut -c1)
kill -CONT "$state_pid"
sleep 0.1
state_after=$(ps -o stat= -p "$state_pid" | tr -d ' ' | cut -c1)
printf 'state_before=%s\n' "$state_before"
printf 'state_after_stop=%s\n' "$state_stopped"
printf 'state_after_continue=%s\n' "$state_after"
if [ "$state_stopped" = T ] && [ "$state_before" = S ] && [ "$state_after" = S ]; then printf 'state_transition=observed\n'; else printf 'state_transition=unexpected\n'; fi
kill "$state_pid" 2>/dev/null || true
wait "$state_pid" 2>/dev/null || true
trap - EXIT
`,
      expectedResult:
        code`state_before=S, state_after_stop=T, state_after_continue=S, and state_transition=observed. A plus suffix may appear in raw ps output when a process is in the foreground process group; the first state letter is the invariant.`,
      systemsLens:
        code`Task state records whether a process is sleeping, stopped, runnable, or exiting. A scheduler view without state transitions cannot distinguish a slow computation from a deliberately paused or blocked task.`,
      challenge: challenge(
        "Before running, which first state letters do you predict before STOP, after STOP, and after CONT?",
        "Explain which command caused the only guaranteed transition and which lines are snapshots.",
        "Use `sleep 2` instead of `sleep 5` while retaining the two 0.1-second observation delays.",
        "Inspect only the first stat character as the code does.",
        "State what additional evidence would distinguish an I/O-blocked task from a deliberately stopped one.",
      ),
    },
    {
      slug: "threads-under-task",
      title: "See Linux threads as schedulable tasks",
      difficulty: "beginner",
      tags: ["processes", "procfs", "scheduling"],
      prerequisites: ["proc-process-identity"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      revision: 2,
      overview:
        code`Create one Python process with three sleeping threads, then compare its process identity with the entries under /proc/PID/task. Linux schedules each thread task even though users often name the group by one PID.`,
      syntaxBreakdown: explain(
        "One Python process creates three sleeping threads. Linux exposes each schedulable task under the same thread group, so a single process PID can represent several runnable or sleeping tasks.",
        [
          "A thread group shares process resources while each thread is a task.",
          "Thread counts and states are snapshots during the bounded sleep.",
        ],
        [
          "**python3 -c** runs the supplied program; **threading.Thread** starts three daemon workers and the final **time.sleep** keeps the process observable.",
          "**find /proc/PID/task -mindepth 1 -maxdepth 1 -type d** selects only task-ID directories; **wc -l** counts them.",
          "**awk** reads `Tgid:` from status. **ps -L** lists lightweight-process IDs with PID, LWP, state, and command columns.",
          "The `at least 4` check permits implementation timing while proving leader plus workers. The trap cleans up the exact Python PID.",
        ],
      ),
      code: code`
thread_pid=
python3 -c 'import threading,time; [threading.Thread(target=time.sleep,args=(5,),daemon=True).start() for unused in range(3)]; time.sleep(5)' &
thread_pid=$!
trap 'kill "$thread_pid" 2>/dev/null || true; wait "$thread_pid" 2>/dev/null || true' EXIT
sleep 0.2
thread_count=$(find "/proc/$thread_pid/task" -mindepth 1 -maxdepth 1 -type d | wc -l)
tgid=$(awk '/^Tgid:/{print $2}' "/proc/$thread_pid/status")
printf 'process_pid=%s\n' "$thread_pid"
printf 'tgid=%s\n' "$tgid"
printf 'thread_entry_count=%s\n' "$thread_count"
ps -L -o pid=,lwp=,stat=,comm= -p "$thread_pid"
if [ "$tgid" = "$thread_pid" ] && [ "$thread_count" -ge 4 ]; then printf 'thread_group=one_process_four_tasks_or_more\n'; else printf 'thread_group=unexpected\n'; fi
kill "$thread_pid" 2>/dev/null || true
wait "$thread_pid" 2>/dev/null || true
trap - EXIT
`,
      expectedResult:
        code`tgid equals process_pid, thread_entry_count is at least 4 (the leader plus three workers), ps -L lists those LWP entries, and thread_group=one_process_four_tasks_or_more. Thread IDs and scheduling state vary.`,
      systemsLens:
        code`Linux's schedulable unit is a task, while a thread group supplies shared address space and signal semantics. This distinction matters when CPU, memory, or fault evidence attributes load to one process but many runnable tasks.`,
      challenge: challenge(
        "Before running, what relationship and minimum task count do you predict for the thread group?",
        "Compare a ps LWP value with a task-directory name and explain the shared TGID.",
        "In a full rerun, change `range(3)` to `range(2)`, change the assertion's `-ge 4` to `-ge 3`, and change the printed label one_process_four_tasks_or_more to one_process_three_tasks_or_more before running it.",
        "The thread count is the `range(3)` expression in the compact Python program; update the matching lower bound before the cleanup runs.",
        "When a service reports one PID but high CPU, state how you would find the responsible task IDs.",
      ),
    },
  ],
};
