# Carry completion information through wait

slug: wait-and-exit-status
category: lifecycle-and-signals
difficulty: beginner
tags: processes, signals, shell
prerequisites: foreground-and-background
safety: read-only
run-in: shell
sessions: 1
min-version: 5.1
minutes: 8
revision: 2

## Overview
Launch one child that exits successfully and one that exits with status 7, then capture both wait results. Exit status is a compact completion message from child to parent.

## Syntax breakdown
### In plain terms

Two children make completion values visible. A nonzero exit is deliberately captured immediately, so it remains evidence instead of becoming an accidental shell failure.

### What you are learning

- Exit status is a small parent-visible completion channel.
- The value of `$?` is overwritten by the next command.

### Piece by piece

- **bash -c 'exit N' &** starts a child with an explicit status and **$!** records its PID.
- **wait PID** both joins the selected child and sets **$?** to its status. The assignment immediately following each wait preserves that value.
- The printed PID/status pairs identify which child supplied 0 and 7. `exit_channel=preserved` compares the two intentional outcomes.

## Run
```sh
bash -c 'exit 0' &
success_pid=$!
bash -c 'exit 7' &
failure_pid=$!
wait "$success_pid"
success_status=$?
wait "$failure_pid"
failure_status=$?
printf 'success_pid=%s success_status=%s\n' "$success_pid" "$success_status"
printf 'failure_pid=%s failure_status=%s\n' "$failure_pid" "$failure_status"
if [ "$success_status" -eq 0 ] && [ "$failure_status" -eq 7 ]; then printf 'exit_channel=preserved\n'; else printf 'exit_channel=unexpected\n'; fi
```

## Expected result
success_status=0 and failure_status=7, with exit_channel=preserved. Child PIDs vary. The nonzero wait is intentionally captured, so it is evidence rather than an accidental validator failure.

## Systems lens
A wait status is an intentionally lossy result channel: it records success, application failure, or signal termination for the parent. Supervisors use this channel to choose retry, alert, or shutdown policy.

## Optional variation
Rerun the full block with exit 7 changed to exit 9 and the failure_status comparison changed
from -eq 7 to -eq 9. Capture `$?` on the next line after each wait; inserting printf there would
replace the child's status with printf's status.

The success child still reports0, the other reports9, and exit_channel=preserved. A supervisor
can use a known application status to select a recovery policy, while retaining signal termination
as a distinct cause instead of treating every nonzero result as the same failure.
