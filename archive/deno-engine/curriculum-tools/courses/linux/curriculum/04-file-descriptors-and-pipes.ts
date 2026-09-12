import { code, type Module } from "../../../src/types.ts";

const explain = (plain: string, learning: string[], pieces: string[]) =>
  `### In plain terms\n\n${plain}\n\n### What you are learning\n\n${
    learning.map((x) => `- ${x}`).join("\n")
  }\n\n### Piece by piece\n\n${pieces.map((x) => `- ${x}`).join("\n")}`;
const challenge = (predict: string, inspect: string, vary: string, hint: string, apply: string) =>
  `**Predict.** ${predict}\n\n**Inspect and explain.** ${inspect}\n\n**Vary.** ${vary}\n\n**Hint.** ${hint}\n\n**Apply.** ${apply}`;

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
      revision: 2,
      overview:
        code`Give a short-lived child a regular file for each standard stream and inspect its descriptor table while it is alive. The /proc links make the convention of descriptors 0, 1, and 2 concrete and show that redirection changes references, not stream names.`,
      syntaxBreakdown: explain(
        "A short-lived child opens three lab files as descriptors 0, 1, and 2. procfs makes the descriptor-table targets observable while the child is alive.",
        [
          "Standard streams are descriptor-number conventions.",
          "Redirection changes descriptor targets for one process.",
        ],
        [
          "**printf ... > INPUT** writes the child input file. **exec 0<**, **1>**, and **2>** inside **bash -c** open the three files as stdin, stdout, and stderr.",
          "**: > READY** creates a readiness marker after redirection; the bounded **for** loop with **sleep 0.05** avoids inspecting before setup completes.",
          "**readlink /proc/PID/fd/N** resolves each descriptor link. `fd0_target`, `fd1_target`, and `fd2_target` should equal the UID-qualified lab paths.",
          "The EXIT trap uses recorded **child_pid** with **kill** and **wait**, then removes only the four named files.",
        ],
      ),
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
      challenge: challenge(
        "Before running, which lab-file targets do you predict for descriptors 0, 1, and 2?",
        "Explain why the readlink targets are stronger evidence than assuming a child inherited the terminal.",
        "Change only the input text from input to variation and verify that the descriptor targets do not change.",
        "Keep the READY marker before reading procfs.",
        "Choose where a service should send diagnostics if its normal output is consumed by another process.",
      ),
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
      revision: 2,
      overview:
        code`Send a command's stdout and stderr to separate files, then run it with stderr duplicated onto stdout. Comparing the resulting bytes shows that 2>&1 copies a descriptor-table reference at the point where the redirections are evaluated.`,
      syntaxBreakdown: explain(
        "The first command wires output and diagnostics to different files. The second copies the current stdout descriptor into stderr, so both records reach one file in redirection order.",
        [
          "Descriptor duplication copies a table reference at evaluation time.",
          "Byte comparison distinguishes separate streams from their content.",
        ],
        [
          "**> FILE** redirects descriptor 1 and **2> FILE** redirects descriptor 2. **printf ... >&2** explicitly writes the second record to stderr.",
          "**2>&1** duplicates descriptor 1 into descriptor 2 after `> BOTH` has selected BOTH as stdout, so both writes use the same target.",
          "**cat** prints the captured bytes in labeled output. **cmp -s** compares files silently and controls the distinct-stream branch with its status.",
          "The trap and final **rm -f** remove only the three UID-qualified files; `cleanup=done` confirms it.",
        ],
      ),
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
      challenge:
        "**Predict.** Before running, how should the separate captures differ from the duplicated capture?\n\n**Inspect and explain.** Explain why placing 2>&1 before the stdout-to-BOTH redirection would route stderr differently.\n\n**Vary.** Rerun the full block, replacing every stdout-line with normal-line and every stderr-line with diagnostic-line, including the combined-byte expectation.\n\n**Hint.** Keep the redirection order adjacent to the command.\n\n**Apply.** State how you would preserve diagnostics separately while collecting normal service output.",
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
      revision: 2,
      overview:
        code`Open descriptor 9 in the parent, fork a child that writes through that descriptor, and inspect both /proc links before the child exits. Both processes refer to the same open-file description and therefore the same inode.`,
      syntaxBreakdown: explain(
        "The parent opens descriptor 9 once, then a child inherits it and writes through it. Both descriptor-table entries resolve to the same pathname while the child is alive.",
        [
          "Fork inherits descriptor references.",
          "A descriptor is an open reference, distinct from reopening a pathname.",
        ],
        [
          "**exec 9>>FILE** opens FILE for append in the current Bash and keeps descriptor 9 open. **>&9** sends the child's printf through that inherited descriptor.",
          "The child writes READY before its bounded sleep; the polling loop ensures **readlink /proc/PID/fd/9** runs while both references exist.",
          "The two **readlink** calls expose the parent and child targets, and **cat** reads the resulting line.",
          "**exec 9>&-** closes only descriptor 9 in the parent. The trap waits for the exact child, closes 9, and removes named lab files.",
        ],
      ),
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
      challenge: challenge(
        "Before running, what relationship should the parent and child FD 9 links have, and what content should the file show?",
        "Explain why the child can write through 9 without opening FILE itself.",
        "Change only `child-line` to `child-variation` and inspect the resulting content.",
        "Do not close descriptor 9 before the child reaches READY.",
        "Describe how inherited logging descriptors can accidentally keep a rotated file or socket alive.",
      ),
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
      revision: 2,
      overview:
        code`Start a producer writing a bounded eight-megabyte stream to a FIFO with no draining consumer. Its write side blocks when the kernel pipe buffer fills; starting a consumer releases the producer and lets the exact byte count complete.`,
      syntaxBreakdown: explain(
        "The producer has an open FIFO endpoint because descriptor 7 keeps both ends open. It blocks when the finite buffer fills because there is no draining consumer yet; starting the consumer releases that backpressure.",
        [
          "A pipe buffer is finite and creates flow control.",
          "A process state and elapsed delay are samples; completed byte count is the decisive completion evidence.",
        ],
        [
          "**mkfifo** creates the named pipe. **exec 7<> FIFO** opens both endpoints in this shell so producer opening does not block; descriptor 7 does not drain bytes.",
          "**BLOCK_BYTES=65536** and **BLOCK_COUNT=128** name the supplied block shape; **$((BLOCK_BYTES * BLOCK_COUNT))** calculates the expected total so a variation changes one value. **dd if=/dev/zero of=FIFO bs=... count=...** writes that many fixed-size blocks. The **status=none** flag suppresses dd's progress text so only lesson labels remain. After **sleep 0.15**, **ps -o stat=** samples the producer; S or D supports `producer_blocked=yes` on this host.",
          "The consumer **dd** uses the same block values. Its **iflag=fullblock** flag makes it read whole requested blocks despite short pipe reads, and its **status=none** flag keeps its own progress messages out of the evidence; it then writes the drain file.",
          "**wait** joins producer and consumer. **wc -c < DRAIN** compares the completed byte count with EXPECTED_BYTES; this proves progress after draining, unlike a state snapshot.",
          "The trap kills/waits recorded PIDs, closes descriptor 7, and removes only FIFO and drain files.",
        ],
      ),
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FIFO=$LAB/backpressure-$UID.fifo
DRAIN=$LAB/backpressure-$UID.bin
BLOCK_BYTES=65536
BLOCK_COUNT=128
EXPECTED_BYTES=$((BLOCK_BYTES * BLOCK_COUNT))
rm -f "$FIFO" "$DRAIN"
mkfifo "$FIFO"
exec 7<>"$FIFO"
producer_pid=
consumer_pid=
trap 'test -n "$producer_pid" && kill "$producer_pid" 2>/dev/null || true; test -n "$consumer_pid" && kill "$consumer_pid" 2>/dev/null || true; test -n "$producer_pid" && wait "$producer_pid" 2>/dev/null || true; test -n "$consumer_pid" && wait "$consumer_pid" 2>/dev/null || true; exec 7>&-; rm -f "$FIFO" "$DRAIN"' EXIT
dd if=/dev/zero of="$FIFO" bs="$BLOCK_BYTES" count="$BLOCK_COUNT" status=none &
producer_pid=$!
sleep 0.15
producer_state=$(ps -o stat= -p "$producer_pid" 2>/dev/null | tr -d ' ' | cut -c1)
if [ "$producer_state" = S ] || [ "$producer_state" = D ]; then producer_blocked=yes; else producer_blocked=no; fi
printf 'producer_pid=%s\n' "$producer_pid"
printf 'producer_state=%s\n' "$producer_state"
printf 'producer_blocked=%s\n' "$producer_blocked"
dd if="$FIFO" of="$DRAIN" bs="$BLOCK_BYTES" count="$BLOCK_COUNT" iflag=fullblock status=none &
consumer_pid=$!
wait "$producer_pid"
producer_status=$?
wait "$consumer_pid"
consumer_status=$?
exec 7>&-
printf 'producer_status=%s consumer_status=%s\n' "$producer_status" "$consumer_status"
printf 'produced_bytes=%s\n' "$(wc -c < "$DRAIN")"
if [ "$producer_status" -eq 0 ] && [ "$consumer_status" -eq 0 ] && [ "$(wc -c < "$DRAIN")" -eq "$EXPECTED_BYTES" ]; then printf 'backpressure_released=yes\n'; else printf 'backpressure_released=no\n'; fi
rm -f "$FIFO" "$DRAIN"
producer_pid=
consumer_pid=
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`producer_blocked=yes while the FIFO has no draining consumer, then both statuses are 0, produced_bytes=8388608, and backpressure_released=yes after the consumer starts. Descriptor 7 already holds FIFO endpoints open, so this demonstrates finite-buffer blocking rather than writer-open blocking. The producer state may be S or D depending on kernel accounting.`,
      systemsLens:
        code`A pipe is a bounded kernel buffer, not an infinite queue. When producer throughput exceeds consumer throughput, blocking is the built-in feedback signal used by shells, RPC streams, and worker pipelines.`,
      challenge: challenge(
        "Before running, what state, completion statuses, and byte relationship would demonstrate backpressure and later release?",
        "Explain why descriptor 7 means the observation is buffer pressure, not absence of a reader endpoint.",
        "In a full rerun, change only `BLOCK_COUNT=128` to `BLOCK_COUNT=64`; EXPECTED_BYTES and both dd count arguments then follow that one value.",
        "Keep the shared BLOCK_COUNT and iflag=fullblock; the arithmetic assignment updates the assertion before cleanup.",
        "For a streaming service, name the queue-size and consumer-progress evidence needed before blaming a blocked producer.",
      ),
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
      revision: 2,
      overview:
        code`Use two writer descriptors in Session B and one reader descriptor in Session A. A receives the message after the first writer closes, but its next read reaches EOF only when the final writer closes, separating endpoint lifetime from the earlier rendezvous lesson.`,
      syntaxBreakdown: explain(
        "This two-session experiment follows one FIFO through message delivery and end-of-file. Session B deliberately keeps a second writer open after sending the message, so Session A's second read cannot finish until that final writer closes.",
        [
          "EOF on a FIFO reader means every writer endpoint has closed.",
          "A file marker provides bounded coordination between the two sessions without changing FIFO data.",
        ],
        [
          "Session A uses **mkfifo** and **stat -c %F** to create and verify the path. **exec 8< FIFO** opens a persistent reader; it blocks until B opens a writer.",
          "**read -r message <&8** consumes B's newline-terminated record. **: > FIRST_READ** records that this first read completed, then the second **read** waits for either more data or EOF.",
          "Session B opens **exec 9> FIFO** and **exec 10> FIFO** as two writer descriptors. It writes through 9 and closes only 9; descriptor 10 remains the final writer.",
          "The fixed poll for FIRST_READ proves A consumed the record before B closes 10. **exec 10>&-** closes the final writer, letting A's second read return nonzero at EOF.",
          "The `eof_status=0; read ... || eof_status=$?` sequence preserves expected EOF without terminating a shell that uses errexit. Both sessions use the fixed UID-qualified paths and bounded loops.",
        ],
      ),
      code: code`
# Session A (blocks until B opens a writer; later blocks until B closes final writer)
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FIFO=$LAB/fifo-coordination-$UID.fifo
FIRST_READ=$LAB/fifo-first-read-$UID.ready
rm -f "$FIFO" "$FIRST_READ"
mkfifo "$FIFO"
trap '{ exec 8<&-; } 2>/dev/null || true; rm -f "$FIFO" "$FIRST_READ"' EXIT
printf 'fifo_type=%s\n' "$(stat -c %F "$FIFO")"
printf 'session_a=waiting_for_writer\n'
exec 8< "$FIFO"
read -r message <&8
printf 'session_a_received=%s\n' "$message"
: > "$FIRST_READ"
printf 'session_a=waiting_for_final_writer_close\n'
trailing=
eof_status=0
read -r trailing <&8 || eof_status=$?
printf 'session_a_eof_status=%s\n' "$eof_status"
if [ "$eof_status" -ne 0 ] && [ -z "$trailing" ]; then printf 'eof_after_final_writer=yes\n'; else printf 'eof_after_final_writer=no\n'; fi
exec 8<&-
rm -f "$FIFO" "$FIRST_READ"
trap - EXIT
printf 'session_a_cleanup=done\n'

# Session B
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
FIFO=$LAB/fifo-coordination-$UID.fifo
FIRST_READ=$LAB/fifo-first-read-$UID.ready
trap '{ exec 9>&-; } 2>/dev/null || true; { exec 10>&-; } 2>/dev/null || true' EXIT
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  [ -p "$FIFO" ] && break
  sleep 0.05
done
printf 'session_b_fifo=%s\n' "$(test -p "$FIFO" && echo present || echo absent)"
[ -p "$FIFO" ]
exec 9> "$FIFO"
exec 10> "$FIFO"
printf 'fifo-message-from-B\n' >&9
exec 9>&-
printf 'session_b=first_writer_closed_final_writer_open\n'
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  [ -e "$FIRST_READ" ] && break
  sleep 0.05
done
printf 'session_b_first_read_seen=%s\n' "$(test -e "$FIRST_READ" && echo yes || echo no)"
[ -e "$FIRST_READ" ]
exec 10>&-
trap - EXIT
printf 'session_b=final_writer_closed\n'
`,
      expectedResult:
        code`Session A prints fifo_type=fifo and waits for a writer. Session B reports session_b_fifo=present, session_b=first_writer_closed_final_writer_open, then session_b_first_read_seen=yes before session_b=final_writer_closed. A receives fifo-message-from-B, waits for final writer close, then reports session_a_eof_status=1 and eof_after_final_writer=yes before cleanup. The two A waits intentionally block until the corresponding B endpoint action.`,
      systemsLens:
        code`A FIFO combines a filesystem name with a kernel pipe, so opening and reading it creates a rendezvous between unrelated processes. Reader EOF is an endpoint-lifetime fact: it occurs after the final writer reference closes, which queue consumers and handoff scripts must distinguish from an idle producer.`,
      caution:
        code`Run the labelled Session A step first. It intentionally blocks while opening the reader and again while the final writer remains open; both sessions must use the same LINUX_LAB.`,
      challenge: challenge(
        "Before running, how should the message, first-writer close, final-writer close, and reader EOF be ordered?",
        "Use the A and B labels to explain the causal order from first writer close through final writer close and EOF.",
        "Keep both writers but change the message to fifo-variation-from-B; predict that EOF evidence remains unchanged.",
        "Do not close descriptor 10 before session_b_first_read_seen=yes.",
        "For a queue consumer, state which endpoint-ownership evidence you need before interpreting a blocked read as no more producers.",
      ),
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
      revision: 3,
      overview:
        code`Lower the open-file limit only inside a subshell and open descriptors until Bash reports EMFILE. The parent limit remains unchanged, showing that a resource boundary belongs to one process context and its descendants.`,
      syntaxBreakdown: explain(
        "A subshell lowers only its own soft descriptor limit and opens one file repeatedly until the kernel refuses another open. Leaving the subshell closes those descriptors and preserves the parent limit.",
        [
          "RLIMIT_NOFILE is inherited per process and limits descriptor numbers.",
          "EMFILE exhaustion differs from requesting a descriptor number already outside the limit.",
        ],
        [
          "**ulimit -n** reads or sets Bash's soft open-file limit. The surrounding **( ... )** confines the changed limit to the child shell.",
          "**exec {fd}>>FILE** asks Bash to allocate the lowest free descriptor and store its number in `fd`; the **>>** redirection opens FILE for append.",
          "The **while** loop counts successful opens until Bash reports `Too many open files` (EMFILE). Redirecting its error captures the diagnostic for the labeled output.",
          "**ls /proc/$BASHPID/fd | wc -l** lists the subshell Bash descriptor directory rather than ls's own descriptor directory; **wc -l** counts its entries. **sed** extracts the error text; inherited descriptors can change counts.",
          "The final parent **ulimit -n** comparison proves the boundary did not leak. Subshell exit closes its dynamic descriptors; the trap removes only the lab files.",
        ],
      ),
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
  last_fd=
  while exec {fd}>>"$FILE" 2>"$ERRORS"; do
    opened=$((opened + 1))
    last_fd=$fd
  done
  printf 'subshell_limit=%s\n' "$subshell_limit"
  printf 'opened_before_failure=%s\n' "$opened"
  printf 'last_descriptor_opened=%s\n' "$last_fd"
  printf 'open_descriptors_now=%s\n' "$(ls "/proc/$BASHPID/fd" | wc -l)"
  printf 'descriptor_error=%s\n' "$(sed -n '1s/.*: //p' "$ERRORS")"
  if [ -n "$last_fd" ] && [ "$last_fd" -lt "$subshell_limit" ] && grep -q 'Too many open files' "$ERRORS"; then printf 'descriptor_boundary=observed\n'; else printf 'descriptor_boundary=unexpected\n'; fi
)
printf 'parent_limit=%s\n' "$parent_limit"
printf 'parent_limit_unchanged=%s\n' "$(test "$(ulimit -n)" = "$parent_limit" && echo yes || echo no)"
rm -f "$FILE" "$ERRORS"
trap - EXIT
`,
      expectedResult:
        code`subshell_limit=32, opened_before_failure is positive, last_descriptor_opened=31 (the highest number below the limit), opened_before_failure=22 when only the standard streams were inherited (Bash allocates from 10 upward, so 3-9 stay free), open_descriptors_now counts the resulting table, descriptor_error=Too many open files (EMFILE), and descriptor_boundary=observed. parent_limit_unchanged=yes proves the parent soft limit was not changed; the exact count depends on inherited descriptors.`,
      systemsLens:
        code`Descriptor limits cap kernel references held by one process, preventing an FD leak from consuming the whole host. The same per-process boundary protects web servers, proxies, and file watchers.`,
      challenge: challenge(
        "Before running, what evidence would distinguish subshell descriptor exhaustion from a changed parent limit?",
        "Explain why last_descriptor_opened must be below the subshell limit and why open count can vary.",
        "Change only `ulimit -n 32` to 24 in the subshell and predict an earlier failure.",
        "Leave the limit change inside `( ... )`.",
        "Choose the metric and safe restart boundary you would use for a service suspected of leaking descriptors.",
      ),
    },
  ],
};
