import { code, type Module } from "../../../src/types.ts";

export const LAB: Module = {
  category: "lab-and-shell-discipline",
  title: "Build a disposable lab and make observations reproducible",
  lessons: [
    {
      slug: "build-disposable-linux-lab",
      title: "Build a disposable Linux lab you can safely own",
      difficulty: "beginner",
      tags: ["lab", "shell"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 10,
      revision: 2,
      overview:
        code`Create the bounded directory that every later experiment owns, then label the Bash, kernel, and OS versions used for the observation. A named failure domain makes cleanup and reproduction possible on a disposable VM.`,
      syntaxBreakdown:
        code`The LINUX_LAB environment variable selects the lab root; mkdir -p is idempotent; export LC_ALL=C pins collation and message text for every later observation; readlink -f canonicalizes a path; bash --version, uname, and /etc/os-release identify the execution layers.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
export LC_ALL=C
printf 'lab_path=%s\n' "$(readlink -f "$LAB")"
printf 'lab_writable=%s\n' "$(test -w "$LAB" && echo yes || echo no)"
printf 'bash_version=%s\n' "$(bash --version | sed -n '1p')"
printf 'kernel_release=%s\n' "$(uname -r)"
printf 'os_name=%s\n' "$(awk -F= '/^PRETTY_NAME=/{gsub(/"/, "", $2); print $2}' /etc/os-release)"
printf 'locale=%s\n' "$LC_ALL"
`,
      expectedResult:
        code`The output contains an absolute lab_path ending in linux-systems-lab (unless LINUX_LAB was supplied), lab_writable=yes, a Bash 5.1-or-newer version line, a Linux kernel release, an OS name, and locale=C. Only the selected lab directory is created. Run export LC_ALL=C in every terminal you open for this course; the lessons assume it.`,
      systemsLens:
        code`A reproducible experiment starts by naming its failure domain and recording the independent kernel and userspace versions. This is the same discipline used for a service's scratch volume, deployment image, and incident timeline.`,
      caution:
        code`Use a new directory or a dedicated VM-owned LINUX_LAB. Do not point it at a home directory containing unrelated files.`,
    },
    {
      slug: "identify-kernel-and-userspace",
      title: "Separate the running kernel from userspace",
      difficulty: "beginner",
      tags: ["lab", "shell", "procfs"],
      prerequisites: ["build-disposable-linux-lab"],
      safetyLevel: "read-only",
      runIn: "shell",
      estimatedMinutes: 8,
      overview:
        code`Compare the release reported by uname with the distribution metadata and with /proc/version. The comparison makes visible that a userspace image can change independently of the kernel providing its system calls.`,
      syntaxBreakdown:
        code`uname -r reads the running kernel release; /proc/version is a kernel-generated procfs view; /etc/os-release describes the userspace distribution; readlink resolves the executable backing the current shell.`,
      code: code`
printf 'kernel_uname=%s\n' "$(uname -r)"
printf 'proc_version_prefix=%s\n' "$(cut -d' ' -f1-3 /proc/version)"
printf 'userspace_id=%s\n' "$(awk -F= '/^ID=/{gsub(/"/, "", $2); print $2}' /etc/os-release)"
printf 'readlink_self_exe=%s\n' "$(readlink -f /proc/self/exe)"
printf 'shell_exe=%s\n' "$(readlink -f /proc/$$/exe)"
if grep -q "$(uname -r)" /proc/version; then printf 'kernel_release_consistent=yes\n'; else printf 'kernel_release_consistent=no\n'; fi
`,
      expectedResult:
        code`kernel_uname is the current Linux release and kernel_release_consistent=yes. proc_version_prefix begins with Linux and includes the kernel build identity; userspace_id identifies the distribution; shell_exe resolves to a Bash binary.`,
      systemsLens:
        code`The kernel is the syscall provider and procfs publisher, while /etc/os-release belongs to the filesystem image. Containers commonly change userspace while sharing the host kernel, so these identities must be recorded separately.`,
    },
    {
      slug: "inventory-required-commands",
      title: "Inventory the commands the curriculum needs",
      difficulty: "beginner",
      tags: ["lab", "shell", "troubleshooting"],
      prerequisites: ["build-disposable-linux-lab"],
      safetyLevel: "read-only",
      runIn: "shell",
      estimatedMinutes: 8,
      revision: 2,
      overview:
        code`Probe the command surface before an incident exercise starts. The list is every external program the 72 lessons invoke, plus two tools probed by absolute path because command -v cannot see them the same way: /usr/bin/time (the bash keyword time would answer instead) and mkfs.ext4 (which lives in /usr/sbin, sometimes off an unprivileged PATH). A zero-missing inventory distinguishes a missing capability from a kernel or application failure.`,
      syntaxBreakdown:
        code`A for loop walks the sorted command names; command -v resolves an executable or builtin without running it; test -x checks an absolute path directly; type -t reports whether a name is still a bash builtin or has been shadowed by a function or alias; arithmetic increments counters; printf gives machine-readable labels.`,
      code: code`
missing=0
required_command_count=0
for command_name in awk basename bash cat chmod cmp cut date dd df du env find findmnt free grep head id ionice ip ln locale ls lsblk lsns lsof mkdir mkfifo mount mv nice nproc nsenter pgrep pmap ps pstree python3 readlink rm rmdir sed seq sleep sort ss stat sudo tail taskset tee timeout touch tr truncate umount uname unshare vmstat wc; do
  required_command_count=$((required_command_count + 1))
  if command -v "$command_name" >/dev/null 2>&1; then
    printf 'command=%s status=present\n' "$command_name"
  else
    printf 'command=%s status=missing\n' "$command_name"
    missing=$((missing + 1))
  fi
done
for tool_path in /usr/bin/time /usr/sbin/mkfs.ext4; do
  required_command_count=$((required_command_count + 1))
  if [ -x "$tool_path" ]; then
    printf 'command=%s status=present\n' "$tool_path"
  else
    printf 'command=%s status=missing\n' "$tool_path"
    missing=$((missing + 1))
  fi
done
shadowed=0
for builtin_name in command echo exec exit export jobs kill printf read set test trap true ulimit umask wait; do
  if [ "$(type -t "$builtin_name")" != builtin ]; then
    printf 'builtin=%s status=shadowed-by-%s\n' "$builtin_name" "$(type -t "$builtin_name" || echo nothing)"
    shadowed=$((shadowed + 1))
  fi
done
printf 'required_command_count=%s\n' "$required_command_count"
printf 'missing_command_count=%s\n' "$missing"
printf 'shadowed_builtin_count=%s\n' "$shadowed"
if [ "$missing" -eq 0 ] && [ "$shadowed" -eq 0 ]; then printf 'inventory_ok=yes\n'; else printf 'inventory_ok=no\n'; fi
`,
      expectedResult:
        code`Every command= line prints status=present, no builtin= line appears, required_command_count=62, missing_command_count=0, shadowed_builtin_count=0, and inventory_ok=yes on the prepared Ubuntu VM. If a tool is absent, its name is explicit rather than being mistaken for a later lesson failure; /usr/bin/time needs the time package and mkfs.ext4 needs e2fsprogs.`,
      systemsLens:
        code`Capability discovery is an observability prerequisite: the same symptom can mean a missing binary, a permission boundary, or a kernel feature. Operators first establish which measurement tools are actually available.`,
    },
    {
      slug: "normalize-shell-observations",
      title: "Normalize locale-sensitive shell observations",
      difficulty: "beginner",
      tags: ["lab", "shell"],
      prerequisites: ["build-disposable-linux-lab"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 8,
      overview:
        code`Create a tiny observation input, show the active locale and ordering, then run the same observation under LC_ALL=C. Stable labels prevent a locale or timezone difference from looking like a systems regression.`,
      syntaxBreakdown:
        code`locale reports the active locale; sort orders lines according to the selected collation; date +%s prints an epoch timestamp; printf writes exact labels to a lab file.`,
      setup: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
ORDER_FILE=$LAB/locale-order.txt
printf 'b\nA\na\nB\n' > "$ORDER_FILE"
if [ -z "$LC_ALL" ]; then printf 'active_locale=unset\n'; else printf 'active_locale=%s\n' "$LC_ALL"; fi
printf 'active_charmap=%s\n' "$(locale charmap)"
printf 'raw_order='; sort "$ORDER_FILE" | tr '\n' ','; printf '\n'
printf 'stable_locale=C\n'
printf 'stable_order='; LC_ALL=C sort "$ORDER_FILE" | tr '\n' ','; printf '\n'
printf 'epoch_seconds=%s\n' "$(LC_ALL=C date +%s)"
rm -f "$ORDER_FILE"
printf 'cleanup=order_file_absent:%s\n' "$(test ! -e "$ORDER_FILE" && echo yes || echo no)"
`,
      expectedResult:
        code`active_locale is C when LC_ALL was exported as lesson 1 asks (unset otherwise), stable_locale=C, and stable_order is A,B,a,b,. epoch_seconds is a changing numeric timestamp, while the locale and ordering labels are stable. cleanup=order_file_absent:yes proves the only artifact was removed.`,
      systemsLens:
        code`Measurements are part of the experiment's control plane. LC_ALL=C fixes collation and diagnostics so diffs represent kernel behavior rather than a machine's language configuration.`,
    },
    {
      slug: "coordinate-two-shell-sessions",
      title: "Coordinate two shell sessions through a FIFO",
      difficulty: "beginner",
      tags: ["lab", "shell", "pipes"],
      prerequisites: ["build-disposable-linux-lab"],
      safetyLevel: "writes-data",
      runIn: "shell",
      sessions: 2,
      estimatedMinutes: 12,
      overview:
        code`Use two persistent Bash sessions to make a named pipe rendezvous. Session A blocks in read until Session B writes, making the ordering between independent processes visible rather than implied by a script's line order.`,
      syntaxBreakdown:
        code`mkfifo creates a filesystem-named pipe; read -r waits for one newline-delimited record; test -p checks the object type; trap registers exact cleanup; rm removes only the lab FIFO.`,
      code: code`
# Session A (blocks until B writes)
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FIFO=$LAB/session-coordinate-$UID.fifo
rm -f "$FIFO"
mkfifo "$FIFO"
trap 'rm -f "$FIFO"' EXIT
printf 'run_id=linux-tutor-%s\n' "$UID"
printf 'fifo_ready=%s\n' "$(test -p "$FIFO" && echo yes || echo no)"
printf 'session_a=waiting\n'
read -r token < "$FIFO"
printf 'session_a_received=%s\n' "$token"
rm -f "$FIFO"
trap - EXIT
printf 'session_a_cleanup=done\n'

# Session B
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
FIFO=$LAB/session-coordinate-$UID.fifo
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  [ -p "$FIFO" ] && break
  sleep 0.05
done
printf 'session_b_fifo_present=%s\n' "$(test -p "$FIFO" && echo yes || echo no)"
[ -p "$FIFO" ]
printf 'linux-tutor-%s\n' "$UID" > "$FIFO"
printf 'session_b=unblocked\n'
`,
      expectedResult:
        code`Session A prints fifo_ready=yes and then waits. Session B observes session_b_fifo_present=yes, writes the token, and prints session_b=unblocked; A resumes with session_a_received=linux-tutor-<UID>. Both sessions use the same run_id, and session_a_cleanup=done leaves no FIFO.`,
      systemsLens:
        code`A FIFO is a kernel pipe with a pathname. Opening and reading it establishes a happens-before edge between processes, the same kind of explicit rendezvous used by workers, queues, and readiness protocols.`,
      caution:
        code`The Session A step intentionally blocks until Session B runs. The validator and the learner must execute the labelled steps in order.`,
    },
    {
      slug: "cleanup-with-traps",
      title: "Make cleanup part of the experiment with traps",
      difficulty: "beginner",
      tags: ["lab", "shell", "processes"],
      prerequisites: ["coordinate-two-shell-sessions"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 10,
      revision: 2,
      overview:
        code`Start one uniquely identified child and one lab record inside a subshell, then leave the subshell normally. Its EXIT trap kills and reaps the exact child and removes the record, proving that cleanup runs at the boundary where resources were acquired.`,
      syntaxBreakdown:
        code`trap attaches cleanup to EXIT; sleep creates a bounded child; kill sends a signal to one recorded PID and kill -0 probes a PID without signalling it; wait reaps that child; test -e checks the resulting filesystem state. The parent keeps its own record of the PID so it can verify the trap's work after the file the trap owns is gone.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
PID_FILE=$LAB/trap-child-$UID.pid
RECORD=$LAB/trap-record-$UID.pid
rm -f "$PID_FILE" "$RECORD"
(
  trap_child_pid=
  trap 'kill "$trap_child_pid" 2>/dev/null || true; wait "$trap_child_pid" 2>/dev/null || true; rm -f "$PID_FILE"' EXIT
  sleep 30 & trap_child_pid=$!
  printf '%s\n' "$trap_child_pid" > "$PID_FILE"
  printf '%s\n' "$trap_child_pid" > "$RECORD"
  printf 'inside_child_pid=%s\n' "$trap_child_pid"
  printf 'inside_child_alive=%s\n' "$(kill -0 "$trap_child_pid" 2>/dev/null && echo yes || echo no)"
  printf 'inside_pid_file=%s\n' "$(test -e "$PID_FILE" && echo present || echo absent)"
)
recorded_pid=$(cat "$RECORD")
printf 'recorded_pid=%s\n' "$recorded_pid"
if kill -0 "$recorded_pid" 2>/dev/null; then child_after_subshell=alive; else child_after_subshell=gone; fi
printf 'child_after_subshell=%s\n' "$child_after_subshell"
printf 'pid_file_after_subshell=%s\n' "$(test ! -e "$PID_FILE" && echo absent || echo present)"
rm -f "$RECORD"
printf 'cleanup=record_removed\n'
`,
      expectedResult:
        code`inside_child_alive=yes and inside_pid_file=present identify one live sleep child. After the subshell exits, recorded_pid equals inside_child_pid, child_after_subshell=gone (the trap killed and reaped that exact PID), pid_file_after_subshell=absent, and cleanup=record_removed. No unrelated process is signalled.`,
      systemsLens:
        code`Resource ownership is a control-flow property: the process that acquires a child and a file should register their release immediately. This is the shell analogue of finally blocks, lease expiry, and service shutdown hooks.`,
    },
  ],
};
