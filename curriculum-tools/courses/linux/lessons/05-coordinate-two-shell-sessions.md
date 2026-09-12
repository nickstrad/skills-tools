# Coordinate two shell sessions through a FIFO

slug: coordinate-two-shell-sessions
category: lab-and-shell-discipline
difficulty: beginner
tags: lab, shell, pipes
prerequisites: build-disposable-linux-lab
safety: writes-data
run-in: shell
sessions: 2
min-version: 5.1
minutes: 12
revision: 2

## Overview
Use two persistent Bash sessions to make a named pipe rendezvous. Session A blocks in read until Session B writes, making the ordering between independent processes visible rather than implied by a script's line order.

## Syntax breakdown
### In plain terms

Two persistent shells share a named pipe. The first read blocks until the other shell writes a newline, making their ordering observable instead of assuming that adjacent script lines ran in sequence.

### What you are learning

- A FIFO is a pipe with a pathname that independent processes can open.
- A bounded readiness poll prevents Session B from racing FIFO creation.

### Piece by piece

- **mkfifo** creates the named pipe at the UID-qualified lab path; **rm -f** first removes only a stale object with that exact name.
- **trap ... EXIT** registers cleanup for Session A even if its later read is interrupted.
- **test -p** verifies that the path is a FIFO; `fifo_ready=yes` and Session B's `session_b_fifo_present=yes` are coordination evidence.
- **read -r token < FIFO** opens the FIFO for reading and waits for a newline. The **-r** flag preserves backslashes in the token.
- Session B's fixed 20-attempt loop uses **sleep 0.05** to bound waiting. **printf ... > FIFO** opens a writer, sends one newline-terminated record, and allows A to print `session_a_received`.
- The shared UID-derived `run_id` identifies the same lab run; it is not a globally unique transaction ID.

## Caution
The Session A step intentionally blocks until Session B runs. The validator and the learner must execute the labelled steps in order.

## Run
```sh
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
```

## Expected result
Session A prints fifo_ready=yes and then waits. Session B observes session_b_fifo_present=yes, writes the token, and prints session_b=unblocked; A resumes with session_a_received=linux-tutor-<UID>. Both sessions use the same run_id, and session_a_cleanup=done leaves no FIFO.

## Systems lens
A FIFO is a kernel pipe with a pathname. Opening and reading it establishes a happens-before edge between processes, the same kind of explicit rendezvous used by workers, queues, and readiness protocols.

## Optional variation
**Predict.** Before running, what ordering should the waiting label, B's write, and A's received-token label have?

**Inspect and explain.** Use the two labels to describe the happens-before edge: FIFO creation, writer record, reader return.

**Vary.** Change only B's payload to `linux-tutor-<UID>-again`, keeping its newline and the same fixed FIFO path.

**Hint.** Start Session A first and replace `<UID>` with `$UID` in the supplied printf.

**Apply.** Name the readiness signal and the timeout you would add if these shells were a service producer and consumer.
