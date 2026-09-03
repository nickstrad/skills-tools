import { code, type Module } from "../../../src/types.ts";

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
      overview:
        code`Spawn one bounded child and correlate the shell's PID, the child's PID, and the child's PPID. The relationship is kernel-maintained process identity, not a convention inferred from a command line.`,
      syntaxBreakdown:
        code`BASHPID identifies the current Bash process; $! expands to the newest background PID; /proc/PID/status exposes PPid; ps prints a process table row; wait reaps the child.`,
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
      overview:
        code`Create a parent, child, and grandchild that sleep briefly, then inspect their hierarchy with pstree and ps --forest. The tree shows which execution contexts were forked from which ancestors.`,
      syntaxBreakdown:
        code`bash -c runs a child shell; wait keeps a parent alive for its child; pstree -p annotates ancestry with PIDs; ps --forest renders the same relationship from procfs.`,
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
      overview:
        code`Start one uniquely argv-labelled process and read its identity through ps, pgrep, and procfs. Correlation by PID is stronger than matching a mutable display name alone.`,
      syntaxBreakdown:
        code`exec -a changes argv[0] for a child; pgrep -f searches the full command line; readlink resolves /proc/PID/exe; awk extracts Name and State fields; /proc/PID/stat field 22 is a start-time tick count.`,
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
      overview:
        code`Launch a child with a lab-only environment token and inspect its NUL-delimited command line and environment separately. Both are inherited byte vectors, but they answer different debugging questions.`,
      syntaxBreakdown:
        code`env adds one variable for a child; /proc/PID/cmdline and environ contain NUL-separated records; tr converts NULs to visible separators; grep selects one exact environment key.`,
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
      overview:
        code`Observe one child while it sleeps, stop it with SIGSTOP, and continue it with SIGCONT. The state letter explains why a task is not currently executing.`,
      syntaxBreakdown:
        code`ps -o stat reads the compact task state; kill -STOP suspends a task unconditionally; kill -CONT makes it runnable again; cut extracts the state letter.`,
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
      overview:
        code`Create one Python process with three sleeping threads, then compare its process identity with the entries under /proc/PID/task. Linux schedules each thread task even though users often name the group by one PID.`,
      syntaxBreakdown:
        code`threading.Thread creates native Python threads; daemon threads do not keep Python alive; /proc/PID/task contains one directory per thread ID; ps -L lists lightweight processes in a thread group; wc -l counts entries.`,
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
    },
  ],
};
