import { code, type Module } from "../../../src/types.ts";

export const FILE_DESCRIPTORS: Module = {
  category: "file-descriptors-and-pipes",
  title: "Follow descriptors through redirection, inheritance, and backpressure",
  lessons: [
    {
      slug: "standard-stream-fds",
      title: "Resolve the three conventional standard streams",
      difficulty: "beginner",
      tags: ["file-descriptors", "procfs", "shell"],
      prerequisites: ["command-line-and-environment"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 10,
      overview:
        code`Give a short-lived child a regular file for each standard stream and inspect its descriptor table while it is alive. The /proc links make the convention of descriptors 0, 1, and 2 concrete and show that redirection changes references, not stream names.`,
      syntaxBreakdown:
        code`The redirection operators < and > open files for a child; readlink resolves a /proc/PID/fd link; kill and wait perform exact-PID cleanup; a polling loop bounds the readiness race.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
INPUT=$LAB/stdin-$UID.txt
OUT=$LAB/stdout-$UID.txt
ERR=$LAB/stderr-$UID.txt
READY=$LAB/std-ready-$UID
printf 'input\n' > "$INPUT"
rm -f "$OUT" "$ERR" "$READY"
export INPUT OUT ERR READY
child_pid=
trap 'test -n "$child_pid" && kill "$child_pid" 2>/dev/null || true; test -n "$child_pid" && wait "$child_pid" 2>/dev/null || true; rm -f "$INPUT" "$OUT" "$ERR" "$READY"' EXIT
bash -c 'exec 0<"$INPUT"; exec 1>"$OUT"; exec 2>"$ERR"; : > "$READY"; sleep 2' &
child_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$READY" ] && break
  sleep 0.05
done
stdin_target=$(readlink "/proc/$child_pid/fd/0")
stdout_target=$(readlink "/proc/$child_pid/fd/1")
stderr_target=$(readlink "/proc/$child_pid/fd/2")
printf 'child_pid=%s\n' "$child_pid"
printf 'fd0_target=%s\n' "$stdin_target"
printf 'fd1_target=%s\n' "$stdout_target"
printf 'fd2_target=%s\n' "$stderr_target"
if [ "$stdin_target" = "$INPUT" ] && [ "$stdout_target" = "$OUT" ] && [ "$stderr_target" = "$ERR" ]; then printf 'standard_streams=redirected\n'; else printf 'standard_streams=unexpected\n'; fi
wait "$child_pid"
child_pid=
rm -f "$INPUT" "$OUT" "$ERR" "$READY"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`fd0_target, fd1_target, and fd2_target point to the three uniquely named lab files, standard_streams=redirected, and cleanup=done. The child PID and absolute lab path vary.`,
      systemsLens:
        code`A process starts with a descriptor table whose first three entries conventionally carry input, output, and diagnostics. The same indirection underlies logging redirection, service supervisors, and container stdio plumbing.`,
    },
    {
      slug: "redirect-and-duplicate-fds",
      title: "Separate and then duplicate stdout and stderr",
      difficulty: "beginner",
      tags: ["file-descriptors", "shell", "pipes"],
      prerequisites: ["standard-stream-fds"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 10,
      overview:
        code`Send a command's stdout and stderr to separate files, then run it with stderr duplicated onto stdout. Comparing the resulting bytes shows that 2>&1 copies a descriptor-table reference at the point where the redirections are evaluated.`,
      syntaxBreakdown:
        code`A command's > redirection selects stdout; 2> selects stderr; 2>&1 duplicates descriptor 1 into descriptor 2; cmp compares byte-for-byte files; cat displays the captured records.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
OUT=$LAB/redirect-out-$UID.txt
ERR=$LAB/redirect-err-$UID.txt
BOTH=$LAB/redirect-both-$UID.txt
trap 'rm -f "$OUT" "$ERR" "$BOTH"' EXIT
bash -c 'printf stdout-line; printf stderr-line >&2' > "$OUT" 2> "$ERR"
bash -c 'printf stdout-line; printf stderr-line >&2' > "$BOTH" 2>&1
printf 'separate_stdout=%s\n' "$(cat "$OUT")"
printf 'separate_stderr=%s\n' "$(cat "$ERR")"
printf 'duplicated_bytes=%s\n' "$(cat "$BOTH")"
if cmp -s "$OUT" "$ERR"; then printf 'separate_streams=unexpectedly_equal\n'; else printf 'separate_streams=distinct\n'; fi
if [ "$(cat "$BOTH")" = "stdout-linestderr-line" ]; then printf 'duplicate_result=combined\n'; else printf 'duplicate_result=unexpected\n'; fi
rm -f "$OUT" "$ERR" "$BOTH"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`separate_stdout=stdout-line and separate_stderr=stderr-line, while duplicated_bytes=stdout-linestderr-line and duplicate_result=combined. separate_streams=distinct proves the first invocation kept separate descriptor targets.`,
      systemsLens:
        code`Redirection mutates entries in a process-local table. Descriptor duplication is therefore a wiring operation, much like attaching a service's output to two collectors or joining an adapter to an existing stream.`,
    },
    {
      slug: "inherited-open-files",
      title: "Observe an inherited open-file reference",
      difficulty: "intermediate",
      tags: ["file-descriptors", "processes", "procfs"],
      prerequisites: ["redirect-and-duplicate-fds"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      overview:
        code`Open descriptor 9 in the parent, fork a child that writes through that descriptor, and inspect both /proc links before the child exits. Both processes refer to the same open-file description and therefore the same inode.`,
      syntaxBreakdown:
        code`exec 9>> opens a persistent shell descriptor; >&9 writes through it; readlink /proc/PID/fd/9 resolves each process's descriptor; wait joins the child.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FILE=$LAB/inherited-$UID.log
READY=$LAB/inherited-ready-$UID
rm -f "$FILE" "$READY"
exec 9>>"$FILE"
child_pid=
trap 'test -n "$child_pid" && kill "$child_pid" 2>/dev/null || true; test -n "$child_pid" && wait "$child_pid" 2>/dev/null || true; exec 9>&-; rm -f "$FILE" "$READY"' EXIT
export FILE READY
bash -c 'printf child-line >&9; : > "$READY"; sleep 2' &
child_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$READY" ] && break
  sleep 0.05
done
parent_target=$(readlink "/proc/$$/fd/9")
child_target=$(readlink "/proc/$child_pid/fd/9")
printf 'parent_fd9=%s\n' "$parent_target"
printf 'child_fd9=%s\n' "$child_target"
printf 'file_contents=%s\n' "$(cat "$FILE")"
if [ "$parent_target" = "$child_target" ] && [ "$parent_target" = "$FILE" ]; then printf 'open_file_reference=shared\n'; else printf 'open_file_reference=unexpected\n'; fi
wait "$child_pid"
child_pid=
exec 9>&-
rm -f "$FILE" "$READY"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`parent_fd9 and child_fd9 resolve to the same inherited log path, file_contents=child-line, and open_file_reference=shared. The two PIDs and path are run-specific.`,
      systemsLens:
        code`Fork copies descriptor references, while the kernel open-file description carries the underlying file and offset. This is why workers can share a log, pipe, or socket without reopening it by pathname.`,
    },
    {
      slug: "pipe-buffer-backpressure",
      title: "Turn a finite FIFO buffer into backpressure",
      difficulty: "intermediate",
      tags: ["pipes", "processes", "file-descriptors"],
      prerequisites: ["standard-stream-fds"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 14,
      overview:
        code`Start a producer writing a bounded eight-megabyte stream to a FIFO with no reader. Its write side blocks when the kernel pipe buffer fills; starting a consumer releases the producer and lets the exact byte count complete.`,
      syntaxBreakdown:
        code`mkfifo creates a named pipe; exec 7<> keeps both FIFO endpoints open without draining bytes; dd emits fixed-size blocks; ps -o stat observes a task state; wc -c counts bytes; wait joins both producer and consumer; trap removes exact lab resources.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FIFO=$LAB/backpressure-$UID.fifo
DRAIN=$LAB/backpressure-$UID.bin
rm -f "$FIFO" "$DRAIN"
mkfifo "$FIFO"
exec 7<>"$FIFO"
producer_pid=
consumer_pid=
trap 'test -n "$producer_pid" && kill "$producer_pid" 2>/dev/null || true; test -n "$consumer_pid" && kill "$consumer_pid" 2>/dev/null || true; test -n "$producer_pid" && wait "$producer_pid" 2>/dev/null || true; test -n "$consumer_pid" && wait "$consumer_pid" 2>/dev/null || true; exec 7>&-; rm -f "$FIFO" "$DRAIN"' EXIT
dd if=/dev/zero of="$FIFO" bs=65536 count=128 status=none &
producer_pid=$!
sleep 0.15
producer_state=$(ps -o stat= -p "$producer_pid" 2>/dev/null | tr -d ' ' | cut -c1)
if [ "$producer_state" = S ] || [ "$producer_state" = D ]; then producer_blocked=yes; else producer_blocked=no; fi
printf 'producer_pid=%s\n' "$producer_pid"
printf 'producer_state=%s\n' "$producer_state"
printf 'producer_blocked=%s\n' "$producer_blocked"
dd if="$FIFO" of="$DRAIN" bs=65536 count=128 status=none &
consumer_pid=$!
wait "$producer_pid"
producer_status=$?
wait "$consumer_pid"
consumer_status=$?
exec 7>&-
printf 'producer_status=%s consumer_status=%s\n' "$producer_status" "$consumer_status"
printf 'produced_bytes=%s\n' "$(wc -c < "$DRAIN")"
if [ "$producer_status" -eq 0 ] && [ "$consumer_status" -eq 0 ] && [ "$(wc -c < "$DRAIN")" -eq 8388608 ]; then printf 'backpressure_released=yes\n'; else printf 'backpressure_released=no\n'; fi
rm -f "$FIFO" "$DRAIN"
producer_pid=
consumer_pid=
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`producer_blocked=yes while the FIFO has no reader, then both statuses are 0, produced_bytes=8388608, and backpressure_released=yes after the consumer starts. The producer state may be S or D depending on kernel accounting.`,
      systemsLens:
        code`A pipe is a bounded kernel buffer, not an infinite queue. When producer throughput exceeds consumer throughput, blocking is the built-in feedback signal used by shells, RPC streams, and worker pipelines.`,
    },
    {
      slug: "fifo-process-coordination",
      title: "Coordinate independent shells through a named pipe",
      difficulty: "intermediate",
      tags: ["pipes", "processes", "file-descriptors"],
      prerequisites: ["coordinate-two-shell-sessions"],
      safetyLevel: "writes-data",
      runIn: "shell",
      sessions: 2,
      estimatedMinutes: 12,
      overview:
        code`Make Session A wait in a FIFO read and let Session B discover the FIFO and write one labeled message. The pathname makes a byte-stream rendezvous visible to two otherwise independent persistent shells.`,
      syntaxBreakdown:
        code`mkfifo creates the coordination object; stat -c %F identifies its file type; read -r blocks for a line; printf writes one record; the EXIT trap and explicit rm bound cleanup.`,
      code: code`
# Session A (blocks until B writes)
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FIFO=$LAB/fifo-coordination-$UID.fifo
rm -f "$FIFO"
mkfifo "$FIFO"
trap 'rm -f "$FIFO"' EXIT
printf 'fifo_type=%s\n' "$(stat -c %F "$FIFO")"
printf 'session_a=waiting\n'
read -r message < "$FIFO"
printf 'session_a_received=%s\n' "$message"
rm -f "$FIFO"
trap - EXIT
printf 'session_a_cleanup=done\n'

# Session B
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
FIFO=$LAB/fifo-coordination-$UID.fifo
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  [ -p "$FIFO" ] && break
  sleep 0.05
done
printf 'session_b_fifo=%s\n' "$(test -p "$FIFO" && echo present || echo absent)"
[ -p "$FIFO" ]
printf 'fifo-message-from-B\n' > "$FIFO"
printf 'session_b=sent\n'
`,
      expectedResult:
        code`Session A prints fifo_type=fifo and session_a=waiting; Session B prints session_b_fifo=present and session_b=sent; A then prints session_a_received=fifo-message-from-B and session_a_cleanup=done. The A step intentionally blocks until B runs.`,
      systemsLens:
        code`A FIFO combines a filesystem name with a kernel pipe, so opening and reading it creates a durable rendezvous between unrelated processes. Queue consumers, handoff scripts, and readiness gates use the same ordering edge.`,
      caution:
        code`Run the labelled Session A step first. It is intentionally blocked until Session B writes one newline, and both sessions must use the same LINUX_LAB.`,
    },
    {
      slug: "exhaust-file-descriptors",
      title: "Bound descriptor growth with a per-process limit",
      difficulty: "intermediate",
      tags: ["file-descriptors", "resource-limits", "shell"],
      prerequisites: ["inherited-open-files"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      overview:
        code`Lower the open-file limit only inside a subshell and open descriptors until Bash reports EMFILE. The parent limit remains unchanged, showing that a resource boundary belongs to one process context and its descendants.`,
      syntaxBreakdown:
        code`ulimit -n reads or sets the soft descriptor limit; eval constructs a bounded exec redirection; an if statement captures the expected nonzero open attempt; the subshell exit closes all descriptors.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FILE=$LAB/fd-limit-$UID.log
ERRORS=$LAB/fd-limit-$UID.err
rm -f "$FILE" "$ERRORS"
parent_limit=$(ulimit -n)
trap 'rm -f "$FILE" "$ERRORS"' EXIT
(
  trap 'rm -f "$FILE" "$ERRORS"' EXIT
  ulimit -n 32
  subshell_limit=$(ulimit -n)
  opened=0
  failed_fd=
  for fd in $(seq 10 80); do
    if eval "exec $fd>>\"$FILE\"" 2>>"$ERRORS"; then
      opened=$((opened + 1))
    else
      failed_fd=$fd
      break
    fi
  done
  printf 'subshell_limit=%s\n' "$subshell_limit"
  printf 'opened_before_failure=%s\n' "$opened"
  printf 'failed_fd=%s\n' "$failed_fd"
  if [ -n "$failed_fd" ]; then printf 'descriptor_error=too-many-open-files\n'; printf 'descriptor_boundary=observed\n'; else printf 'descriptor_boundary=unexpected\n'; fi
)
printf 'parent_limit=%s\n' "$parent_limit"
printf 'parent_limit_unchanged=%s\n' "$(test "$(ulimit -n)" = "$parent_limit" && echo yes || echo no)"
rm -f "$FILE" "$ERRORS"
trap - EXIT
`,
      expectedResult:
        code`subshell_limit=32, opened_before_failure is positive, failed_fd is reported, and descriptor_boundary=observed. parent_limit_unchanged=yes proves the parent soft limit was not changed; the exact first failing descriptor depends on inherited descriptors.`,
      systemsLens:
        code`Descriptor limits cap kernel references held by one process, preventing an FD leak from consuming the whole host. The same per-process boundary protects web servers, proxies, and file watchers.`,
    },
  ],
};
