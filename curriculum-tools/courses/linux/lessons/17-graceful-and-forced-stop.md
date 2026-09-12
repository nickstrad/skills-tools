# Compare graceful TERM with forced KILL

slug: graceful-and-forced-stop
category: lifecycle-and-signals
difficulty: beginner
tags: signals, processes
prerequisites: signal-disposition
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 10
revision: 3

## Overview
Give one child a TERM handler and send KILL to another identical sleeper. Their wait statuses expose the difference between cooperative cleanup and kernel-enforced termination.

## Syntax breakdown
### In plain terms

Two recorded children receive different termination requests. One handles TERM and exits by policy; KILL ends the other in the kernel before it can run cleanup.

### What you are learning

- SIGTERM is catchable and cooperative.
- SIGKILL is uncatchable; signalled wait status is shell-reported evidence.

### Piece by piece

- The graceful **bash -c** starts a background sleep, installs **trap ... TERM**, then **wait**s so its handler can run promptly.
- The second **sleep 30 &** has no handler. **$!** records each PID and the EXIT trap has exact-PID forced fallback cleanup.
- **kill -TERM** requests policy while **kill -KILL** ends the selected process. Each **wait** returns a status captured immediately.
- `both_stopped_ms` is a timing sample; 137 commonly means 128 plus SIGKILL 9, but the labeled statuses identify the causal branch.

## Run
```sh
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
```

## Expected result
graceful_status=0 and forced_status=137 (128+SIGKILL), producing stop_modes=cooperative-versus-kernel, with both_stopped_ms well under 1000 even though both children were sleeping for 30 seconds. If a shell reports a platform-specific signalled status, the labels still identify which exact child received each signal.

## Systems lens
TERM leaves policy to the application; KILL removes that policy and ends the task in the kernel. Operators need both paths: graceful draining for correctness and forced bounds for stuck processes.

## Optional variation
**Predict.** Before running, what completion statuses do you predict for the TERM-handling child and the KILLed child?

**Inspect and explain.** Explain why a short elapsed sample does not prove that arbitrary TERM handlers are fast.

**Vary.** Change only the graceful child sleep to 5 seconds and repeat the same signal sequence.

**Hint.** Keep both recorded PIDs and the exact cleanup trap.

**Apply.** Specify the escalation deadline and evidence you would require before replacing TERM with KILL in production.
