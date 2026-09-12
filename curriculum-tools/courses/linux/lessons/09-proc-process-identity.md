# Correlate ps identity with procfs identity

slug: proc-process-identity
category: processes-and-identity
difficulty: beginner
tags: processes, procfs, troubleshooting
prerequisites: pid-and-parentage
safety: read-only
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Start one uniquely argv-labelled process and read its identity through ps, pgrep, and procfs. Correlation by PID is stronger than matching a mutable display name alone.

## Syntax breakdown
### In plain terms

The lesson correlates one recorded PID across several procfs and tool views. It shows why a mutable argv label is useful search evidence but is insufficient identity by itself.

### What you are learning

- argv, comm, executable, and start time are different process attributes.
- procfs reports live state; a snapshot can disappear when the child exits.

### Piece by piece

- **exec -a NAME** changes the child argv[0] before it execs **sleep**. **$!** remains the authoritative recorded PID.
- **ps -o pid= -p PID** and **pgrep -P $$ -f PATTERN** are two filters; the latter searches full command lines and is constrained to this shell's child.
- **readlink -f /proc/PID/exe** resolves the executable. **awk** extracts `Name:`, `State:`, and field 22 from procfs; field 22 is start-time ticks since boot.
- **tr '\0' ' '** renders NUL-delimited cmdline records. State and ticks are observations, while PID correlation is the check.

## Run
```sh
proc_identity_pid=
bash -c 'exec -a linux-tutor-proc-identity sleep 5' &
proc_identity_pid=$!
trap 'kill "$proc_identity_pid" 2>/dev/null || true; wait "$proc_identity_pid" 2>/dev/null || true' EXIT
sleep 0.1
printf 'proc_pid=%s\n' "$proc_identity_pid"
printf 'ps_pid=%s\n' "$(ps -o pid= -p "$proc_identity_pid" | tr -d ' ')"
printf 'pgrep_pid=%s\n' "$(pgrep -P "$$" -f 'linux-tutor-proc-identity' | head -n 1)"
printf 'proc_exe=%s\n' "$(readlink -f "/proc/$proc_identity_pid/exe")"
printf 'proc_name=%s\n' "$(awk '/^Name:/{print $2}' "/proc/$proc_identity_pid/status")"
printf 'proc_state=%s\n' "$(awk '/^State:/{print $2}' "/proc/$proc_identity_pid/status")"
printf 'starttime_ticks=%s\n' "$(awk '{print $22}' "/proc/$proc_identity_pid/stat")"
printf 'cmdline='; tr '\0' ' ' < "/proc/$proc_identity_pid/cmdline"; printf '\n'
kill "$proc_identity_pid" 2>/dev/null || true
wait "$proc_identity_pid" 2>/dev/null || true
trap - EXIT
```

## Expected result
proc_pid and ps_pid match; pgrep_pid is the same child PID; proc_exe resolves to the sleep executable; proc_name= sleep (or the distro's equivalent comm); proc_state begins with S; starttime_ticks is numeric; and cmdline contains linux-tutor-proc-identity. The exact tick count varies.

## Systems lens
procfs is a live projection of kernel task state, while ps and pgrep are different readers and filters over that state. Incident tools should correlate stable identifiers and timestamps before trusting names.

## Optional variation
One live child is identified when `proc_pid`, `ps_pid`, and `pgrep_pid` match. `proc_name` can remain `sleep` because it describes the executable's comm value, while `cmdline` retains the chosen argv label.

For a fresh copy of the complete Run block, replace both occurrences of `linux-tutor-proc-identity` with `linux-tutor-proc-variation`: the `exec -a` label and the `pgrep` pattern. Keep `proc_identity_pid=$!`, its exact-PID trap, the 0.1-second delay, and the existing `printf` that encloses the parent-filtered `pgrep` command.

Keep the parent filter so an unrelated process cannot win, and confirm that `cmdline` contains the new label. Before escalating a process incident, record the PID, start-time ticks, executable, argv, state, and parent relation.
