# Compare foreground and background lifetime

slug: foreground-and-background
category: lifecycle-and-signals
difficulty: beginner
tags: processes, signals, shell
prerequisites: pid-and-parentage
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 10
revision: 2

## Overview
Run equal bounded sleeps in the foreground and background, measuring when the shell returns and when the work completes. The shell is a process supervisor that decides whether to wait immediately.

## Syntax breakdown
### In plain terms

Equal sleeps show two shell supervision choices. The elapsed numbers are samples under current load, while the ordering relationship is the observation to defend.

### What you are learning

- Foreground work blocks the shell before its next command.
- Background work returns control before an explicit join.

### Piece by piece

- **date +%s%N** prints a nanosecond-resolution epoch sample; subtracting two values with **$((...))** yields integer milliseconds. The **-lt** and **-ge** numeric tests compare those integer values; the variation changes the supplied total-time lower bound with its shorter sleep.
- A foreground **sleep 0.25** holds the shell. **sleep 0.25 &** backgrounds a child and **$!** records it.
- **jobs -l** is a Bash job-table view; it is supporting observation, not the PID authority.
- **wait PID** joins the child before measuring total duration. `foreground_ms`, `background_return_ms`, and `background_total_ms` vary with scheduling; the final relation is the check.

## Run
```sh
start_ns=$(date +%s%N)
sleep 0.25
foreground_end_ns=$(date +%s%N)
foreground_ms=$(( (foreground_end_ns - start_ns) / 1000000 ))
background_start_ns=$(date +%s%N)
sleep 0.25 &
background_pid=$!
background_return_ns=$(date +%s%N)
jobs -l
wait "$background_pid"
background_end_ns=$(date +%s%N)
background_return_ms=$(( (background_return_ns - background_start_ns) / 1000000 ))
background_total_ms=$(( (background_end_ns - background_start_ns) / 1000000 ))
printf 'foreground_ms=%s\n' "$foreground_ms"
printf 'background_return_ms=%s\n' "$background_return_ms"
printf 'background_total_ms=%s\n' "$background_total_ms"
if [ "$background_return_ms" -lt "$foreground_ms" ] && [ "$background_total_ms" -ge 200 ]; then printf 'shell_wait_relationship=observed\n'; else printf 'shell_wait_relationship=unexpected\n'; fi
```

## Expected result
foreground_ms is about 250 or more, background_return_ms is much smaller than foreground_ms, background_total_ms is at least 200, and shell_wait_relationship=observed. Exact timing varies with scheduler load; wait ensures the background child is reaped.

## Systems lens
Foreground execution couples the shell's next command to child completion; background execution separates submission from join. This is the basic supervision choice behind worker pools and asynchronous service startup.

## Optional variation
In a full rerun, change both sleeps to 0.10 seconds and change the
`background_total_ms -ge 200` assertion to `-ge 80`. Keep wait after the job listing so the
background child is reaped, and update the lower bound before the assertion executes.

Compare the same relationship at the shorter duration: background return measures submission,
while background total includes waiting for completion. Foreground duration also includes
completion. Scheduling affects the samples. A service launcher needs a separate readiness signal
if it must know when work can be accepted; a returned prompt alone provides no such evidence.
