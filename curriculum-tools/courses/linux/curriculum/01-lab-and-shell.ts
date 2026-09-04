import { code, type Module } from "../../../src/types.ts";

const explain = (plain: string, learning: string[], pieces: string[]) =>
  `### In plain terms\n\n${plain}\n\n### What you are learning\n\n${
    learning.map((x) => `- ${x}`).join("\n")
  }\n\n### Piece by piece\n\n${pieces.map((x) => `- ${x}`).join("\n")}`;

const challenge = (
  predict: string,
  inspect: string,
  vary: string,
  hint: string,
  apply: string,
) =>
  `**Predict.** ${predict}\n\n**Inspect and explain.** ${inspect}\n\n**Vary.** ${vary}\n\n**Hint.** ${hint}\n\n**Apply.** ${apply}`;

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
      revision: 3,
      overview:
        code`Create the bounded directory that every later experiment owns, then label the Bash, kernel, and OS versions used for the observation. A named failure domain makes cleanup and reproduction possible on a disposable VM.`,
      syntaxBreakdown: explain(
        "This is preparation, not a kernel-behavior claim. It creates one directory that later commands may change and records enough execution context to compare a rerun with this run.",
        [
          "A lab boundary is a directory the experiment owns.",
          "Kernel, shell, and distribution versions are separate observations.",
        ],
        [
          "**LINUX_LAB** is an environment variable. It selects the lab; the empty-value test falls back to the learner-owned default.",
          "**mkdir -p** is a shell program. The **-p** flag creates missing parents and does not fail when the directory already exists; `lab_writable=yes` means this process can create later artifacts.",
          "**export NAME=VALUE** places a value in this shell's child environment. **export LC_ALL=C** sets the byte-oriented locale for child commands; the challenge uses the same form for LINUX_LAB before a full rerun. The printed `locale=C` is the control value to compare across terminals.",
          "**readlink -f** resolves the lab to an absolute path; `lab_path` identifies the exact failure domain. **rmdir PATH** removes one empty directory only, so the challenge uses it only after the variation lab has no contents.",
          "**bash --version**, **uname -r**, and **awk** over **/etc/os-release** report shell, running-kernel, and userspace labels. Their text is inventory evidence and can vary between hosts.",
        ],
      ),
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
      challenge:
        "**Predict.** Which output should change if you set LINUX_LAB to a new absolute path, and which version labels should stay the same?\n\n**Inspect and explain.** Compare the original run with the variation and confirm that both lab paths are absolute and explain why version strings do not prove behavior is identical.\n\n**Vary.** In the same shell, run export LINUX_LAB=$HOME/linux-systems-lab-variation, then rerun the complete lesson block; after it reports its labels, use rmdir on LINUX_LAB only if the new directory is empty.\n\n**Hint.** The export must precede the multiline lesson block so every command inherits it. Do not reuse a directory holding another experiment.\n\n**Apply.** When filing a service incident, record the kernel release, image identity, and writable scratch path you would preserve.",
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
      revision: 2,
      overview:
        code`Compare the release reported by uname with the distribution metadata and with /proc/version. The comparison makes visible that a userspace image can change independently of the kernel providing its system calls.`,
      syntaxBreakdown: explain(
        "The experiment asks which layer supplied an observation. A container or VM can replace programs and files without replacing the kernel that implements its system calls.",
        [
          "procfs is a kernel-generated filesystem view.",
          "A process executable and distribution metadata belong to userspace.",
        ],
        [
          "**uname -r** asks the running kernel for its release; `kernel_uname` is the value later compared.",
          "**cut -d' ' -f1-3 /proc/version** reads a procfs file and selects its first three space-delimited fields; `proc_version_prefix` should start with Linux.",
          "**awk -F=** reads **/etc/os-release** using `=` as its field separator; `userspace_id` names the installed userspace distribution.",
          "**readlink -f /proc/self/exe** resolves the program for the readlink process, while **/proc/$$/exe** resolves this Bash process. `shell_exe` should identify Bash.",
          "**grep -q** searches quietly; its yes/no label tests whether the kernel release occurs in the kernel-generated version line.",
        ],
      ),
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
      challenge: challenge(
        "Whether changing a userspace package could change userspace_id while leaving kernel_uname unchanged.",
        "Point to the two lines that come from procfs or uname and the one that comes from /etc; explain which is an image fact.",
        "Run `readlink -f /proc/$$/exe` in a second Bash and compare the path only, not an assumed distribution.",
        "The current shell PID is `$$`; do not inspect another user's process.",
        "Choose which identity you would use to decide whether a production symptom belongs to a kernel rollout or an application-image rollout.",
      ),
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
      revision: 3,
      overview:
        code`Probe the command surface before an incident exercise starts. The list is every external program the 72 lessons invoke, plus two tools probed by absolute path because command -v cannot see them the same way: /usr/bin/time (the bash keyword time would answer instead) and mkfs.ext4 (which lives in /usr/sbin, sometimes off an unprivileged PATH). A zero-missing inventory distinguishes a missing capability from a kernel or application failure.`,
      syntaxBreakdown: explain(
        "This is capability preparation. It separates a missing measurement command from a later systems result, and it reports the precise missing name instead of treating the inventory as an internals experiment.",
        [
          "PATH lookup and absolute-path checks answer different availability questions.",
          "Shell builtins can be replaced by functions or aliases in an interactive shell.",
        ],
        [
          "**for command_name in ...; do** iterates each required external command without executing it.",
          "**command -v** is a Bash builtin that resolves a command through PATH; redirecting both streams to **/dev/null** keeps each `status=present` line machine-readable.",
          "**[ -x PATH ]** tests whether the two absolute tool paths are executable, avoiding the Bash `time` keyword and a PATH that lacks **/usr/sbin**.",
          "**type -t** reports a name's Bash classification; `builtin` is healthy here, while `shadowed-by-...` names an altered shell control plane.",
          "**$((...))** performs integer arithmetic. The final counts and `inventory_ok` summarize the individual labeled observations.",
        ],
      ),
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
      challenge: challenge(
        "Whether removing a directory from PATH changes `command -v` results but not the two absolute-path probes.",
        "Find any `status=missing` or `shadowed-by-` line and explain whether it is installation, PATH, or shell-state evidence.",
        "In a subshell, run `PATH=/bin command -v mkfifo || true`; then rerun the full inventory unchanged.",
        "Use a subshell so the course shell retains its PATH.",
        "Before diagnosing a failed service command, list the binary, permission, and kernel-feature checks you would make first.",
      ),
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
      revision: 2,
      overview:
        code`Create a tiny observation input, show the active locale and ordering, then run the same observation under LC_ALL=C. Stable labels prevent a locale or timezone difference from looking like a systems regression.`,
      syntaxBreakdown: explain(
        "The same bytes can sort differently under different locales. This experiment makes a small controlled input, records the active setting, then produces a stable comparison under the C locale.",
        [
          "Locale controls collation and message formatting.",
          "An epoch timestamp is a sampled observation, not a reproducible expected number.",
        ],
        [
          "**printf** writes exactly four newline-delimited records to the lab file; `>` replaces only that experiment file.",
          "**locale charmap** reports the active character encoding, and **sort** orders the records under the active locale; `raw_order` may differ across machines.",
          "**LC_ALL=C sort** sets C only for that command. `stable_order=A,B,a,b,` is the byte-order control observation.",
          "**tr '\\n' ','** makes sorted line endings visible as commas.",
          "**date +%s** prints seconds since the Unix epoch; `epoch_seconds` must change between runs. **rm -f** removes the exact file and the test prints cleanup evidence.",
        ],
      ),
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
      challenge: challenge(
        "Whether `raw_order` equals `stable_order` when the inherited locale is already C.",
        "Compare the two labeled orders and explain why the epoch number is deliberately excluded from a stable assertion.",
        "Run LC_ALL=C sort on ORDER_FILE only while the file exists, then rerun the supplied cleanup.",
        "The code removes ORDER_FILE at the end; add the one command immediately before that rm if exploring manually.",
        "Choose one locale-sensitive field in a production diagnostic and state the fixed representation you would log.",
      ),
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
      revision: 2,
      overview:
        code`Use two persistent Bash sessions to make a named pipe rendezvous. Session A blocks in read until Session B writes, making the ordering between independent processes visible rather than implied by a script's line order.`,
      syntaxBreakdown: explain(
        "Two persistent shells share a named pipe. The first read blocks until the other shell writes a newline, making their ordering observable instead of assuming that adjacent script lines ran in sequence.",
        [
          "A FIFO is a pipe with a pathname that independent processes can open.",
          "A bounded readiness poll prevents Session B from racing FIFO creation.",
        ],
        [
          "**mkfifo** creates the named pipe at the UID-qualified lab path; **rm -f** first removes only a stale object with that exact name.",
          "**trap ... EXIT** registers cleanup for Session A even if its later read is interrupted.",
          "**test -p** verifies that the path is a FIFO; `fifo_ready=yes` and Session B's `session_b_fifo_present=yes` are coordination evidence.",
          "**read -r token < FIFO** opens the FIFO for reading and waits for a newline. The **-r** flag preserves backslashes in the token.",
          "Session B's fixed 20-attempt loop uses **sleep 0.05** to bound waiting. **printf ... > FIFO** opens a writer, sends one newline-terminated record, and allows A to print `session_a_received`.",
          "The shared UID-derived `run_id` identifies the same lab run; it is not a globally unique transaction ID.",
        ],
      ),
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
      challenge: challenge(
        "Before running, what ordering should the waiting label, B's write, and A's received-token label have?",
        "Use the two labels to describe the happens-before edge: FIFO creation, writer record, reader return.",
        "Change only B's payload to `linux-tutor-<UID>-again`, keeping its newline and the same fixed FIFO path.",
        "Start Session A first and replace `<UID>` with `$UID` in the supplied printf.",
        "Name the readiness signal and the timeout you would add if these shells were a service producer and consumer.",
      ),
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
      revision: 3,
      overview:
        code`Start one uniquely identified child and one lab record inside a subshell, then leave the subshell normally. Its EXIT trap kills and reaps the exact child and removes the record, proving that cleanup runs at the boundary where resources were acquired.`,
      syntaxBreakdown: explain(
        "The subshell acquires one child and one file, registers their release immediately, then exits normally. The parent retains a second record so it can verify cleanup after the trap has removed its owned PID file.",
        [
          "An EXIT trap is cleanup attached to a control-flow boundary.",
          "Killing a known PID and reaping it are separate operations.",
        ],
        [
          "**( ... )** starts a subshell, so its trap and child ownership end at the closing parenthesis.",
          "**trap COMMAND EXIT** schedules the exact recorded PID for **kill**, **wait**, and **rm -f** when that subshell exits. `2>/dev/null || true` makes an already-exited child harmless without changing the parent shell's error state.",
          "**sleep 30 &** creates a bounded background child and **$!** records its PID; the printed inside labels prove the trap has a concrete target.",
          "**kill -0 PID** probes whether that PID exists without delivering a signal. **test -e** reports whether the named PID file exists.",
          "After the subshell exits, **cat** reads the parent's record and the `child_after_subshell` and file labels test the cleanup result. The exact PID varies.",
        ],
      ),
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
      challenge: challenge(
        "Before running, which post-subshell labels should demonstrate cleanup while retaining evidence of the former child?",
        "Explain why `kill -0` is evidence about the recorded PID at this instant, not a guarantee against later PID reuse.",
        "In a full rerun, change the child to `sleep 1` and insert `sleep 1.2` after the inside-file observation but before the subshell closes; then inspect the same cleanup labels.",
        "The inserted delay lets the child end naturally before the EXIT trap reaps it. Keep the exact-PID trap; do not replace it with pkill or killall.",
        "For a worker that owns a temporary file and a child process, state the acquisition order and the matching cleanup actions you would register.",
      ),
    },
  ],
};
