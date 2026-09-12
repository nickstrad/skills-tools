# Resolve the three conventional standard streams

slug: standard-stream-fds
category: file-descriptors-and-pipes
difficulty: beginner
tags: file-descriptors, procfs, shell
prerequisites: command-line-and-environment
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 10
revision: 2

## Overview
Give a short-lived child a regular file for each standard stream and inspect its descriptor table while it is alive. The /proc links make the convention of descriptors 0, 1, and 2 concrete and show that redirection changes references, not stream names.

## Syntax breakdown
### In plain terms

A short-lived child opens three lab files as descriptors 0, 1, and 2. procfs makes the descriptor-table targets observable while the child is alive.

### What you are learning

- Standard streams are descriptor-number conventions.
- Redirection changes descriptor targets for one process.

### Piece by piece

- **printf ... > INPUT** writes the child input file. **exec 0<**, **1>**, and **2>** inside **bash -c** open the three files as stdin, stdout, and stderr.
- **: > READY** creates a readiness marker after redirection; the bounded **for** loop with **sleep 0.05** avoids inspecting before setup completes.
- **readlink /proc/PID/fd/N** resolves each descriptor link. `fd0_target`, `fd1_target`, and `fd2_target` should equal the UID-qualified lab paths.
- The EXIT trap uses recorded **child_pid** with **kill** and **wait**, then removes only the four named files.

## Run
```sh
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
```

## Expected result
fd0_target, fd1_target, and fd2_target point to the three uniquely named lab files, standard_streams=redirected, and cleanup=done. The child PID and absolute lab path vary.

## Systems lens
A process starts with a descriptor table whose first three entries conventionally carry input, output, and diagnostics. The same indirection underlies logging redirection, service supervisors, and container stdio plumbing.

## Optional variation
Change only the input text from input to variation and rerun. Keep the READY marker before reading
procfs, then compare fd0_target, fd1_target and fd2_target. They still name the same three lab
paths: changing a file's content does not rewire the child's descriptor table.

The readlink targets show the actual wiring while the child is alive. Separate stdout and stderr
targets let a service deliver normal output to a consumer while keeping diagnostics separate.
Retain the wait and named-file cleanup.
