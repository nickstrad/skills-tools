# Turn SIGTERM delivery into child policy

slug: signal-disposition
category: lifecycle-and-signals
difficulty: beginner
tags: signals, processes, shell
prerequisites: wait-and-exit-status
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 3

## Overview
Install a TERM handler in one child, wait for its readiness record, and send SIGTERM. The child converts asynchronous delivery into a durable receipt and a clean exit.

## Syntax breakdown
### In plain terms

A child advertises readiness, receives TERM, writes a receipt, and exits cleanly. The timing is sampled evidence of this shell's handler path, not a universal shutdown deadline.

### What you are learning

- A signal disposition is process policy for asynchronous delivery.
- A foreground Bash wait would delay a trap, so the child waits on a background sleep.

### Piece by piece

- **trap ... TERM** installs the child's handler. It kills its recorded background sleep, writes `term_received`, and exits 0.
- **: > READY_FILE** creates the readiness marker; the fixed **for** loop with **sleep 0.05** bounds the parent's wait.
- **kill -0 PID** probes liveness without delivery. **kill -TERM PID** requests the handler path, and **wait** captures its status.
- The two **date +%s%N** samples calculate `term_handled_ms`; scheduler load can move it, while receipt and exit status prove the chosen policy.

## Run
```sh
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
```

## Expected result
ready=yes, alive_before_term=yes, term_receipt=term_received, term_exit_status=0, term_handled_ms well under 1000, and handler_ran_promptly=yes. The handler chose a clean exit as soon as TERM arrived, killing its own 30-second sleep on the way out; readiness polling is bounded at ten short attempts.

## Systems lens
Signals are asynchronous requests interpreted by a process's disposition. Graceful shutdown is therefore a protocol—readiness, signal, drain, exit—not merely a numeric kill command.

## Optional variation
Rerun with only the readiness poll delay changed to0.02 seconds, retaining its finite attempt
count. Check ready=yes before sending TERM; if readiness is absent, stop the trial and let its
exact-child cleanup run. The shorter polling window can expire under load.

Readiness precedes TERM, the handler writes term_received, and wait returns0 after the child exits.
The background sleep plus wait lets Bash handle TERM without waiting for a foreground sleep to
finish. These markers verify this child's shutdown policy; a worker that drains requests would
also need evidence that its outstanding work completed.
