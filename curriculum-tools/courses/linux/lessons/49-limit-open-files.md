# Separate soft and hard descriptor limits

slug: limit-open-files
category: resource-boundaries
difficulty: intermediate
tags: resource-limits, file-descriptors, shell
prerequisites: exhaust-file-descriptors
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 3

## Overview
Lesson 24 hit the descriptor limit; this lesson looks at the limit itself. Inside a subshell, lower the soft RLIMIT_NOFILE, read both values from /proc/self/limits, prove a child inherits them, raise the soft limit back up to the hard ceiling, then lower the hard ceiling and see which direction is irreversible. The parent shell proves its own limits never moved.

## Syntax breakdown
### In plain terms

This experiment distinguishes a soft resource limit, the value the kernel currently enforces, from a hard limit, the ceiling an unprivileged process may not raise. A file descriptor is one numbered handle in a process table; the question is whether changing this shell's limit also changes its children or parent.

### What you are learning

- RLIMIT_NOFILE is a per-process limit inherited across process creation; it is not a host-wide count of open files.
- A subshell is a child Bash process, so changes inside its parentheses disappear when it exits.
- A hard limit is an authority boundary: lowering it is permitted, but raising it again needs the relevant privilege.

### Piece by piece

- **ulimit -Sn** (a Bash builtin and two flags)
  - What it is: ulimit reads or changes a shell resource limit; **-S** selects the soft value and **-n** selects open file descriptors.
  - What it does here: it records the parent value, lowers the child to 40, and tests a later increase.
  - What it gives us: the printed soft number is the value the next descriptor allocation in that shell would face.
- **ulimit -Hn** (the hard-limit form)
  - What it is: **-H** selects the hard ceiling for the same descriptor resource.
  - What it does here: it records the ceiling, lowers it to 60, then asks whether 100 can be restored.
  - What it gives us: a denied restore shows that the irreversible part happened only in the subshell.
- **/proc/self/limits** (a procfs report)
  - What it is: procfs exposes limits of the reading process; its Max open files row has soft and hard columns.
  - What it does here: awk extracts that row after the soft limit changes.
  - What it gives us: proc_limits_row should agree with the ulimit values rather than merely echo the script's intent.
- **bash -c** (a child shell) and **( ... )** (a subshell)
  - What they are: bash -c starts a new Bash; parentheses run commands in a child process.
  - What they do here: the child reports inheritance and the parentheses keep all mutations away from the learner's persistent shell.
  - What they give us: child_inherited_soft and parent_limits_unchanged separate inheritance from parent ownership.
- **if ulimit ...** (a conditional)
  - What it is: Bash tests the command status instead of letting an expected refusal abort the lesson.
  - What it does here: it labels allowed and denied limit changes.
  - What it gives us: read the labeled result with the final soft and hard values; a denial is evidence of the ceiling, not a lesson failure.

## Run
```sh
parent_soft=$(ulimit -Sn)
parent_hard=$(ulimit -Hn)
(
  ulimit -Sn 40
  printf 'subshell_soft=%s subshell_hard=%s\n' "$(ulimit -Sn)" "$(ulimit -Hn)"
  printf 'proc_limits_row=%s\n' "$(awk '/Max open files/{print "soft=" $4 " hard=" $5}' /proc/self/limits)"
  printf 'child_inherited_soft=%s\n' "$(bash -c 'ulimit -Sn')"
  if ulimit -Sn 60 2>/dev/null; then printf 'raise_soft_within_hard=allowed\n'; else printf 'raise_soft_within_hard=denied\n'; fi
  ulimit -Hn 60
  if ulimit -Sn 80 2>/dev/null; then printf 'raise_soft_above_hard=allowed\n'; else printf 'raise_soft_above_hard=denied\n'; fi
  if ulimit -Hn 100 2>/dev/null; then printf 'raise_hard_after_lowering=allowed-privileged\n'; else printf 'raise_hard_after_lowering=denied\n'; fi
  printf 'subshell_final_soft=%s subshell_final_hard=%s\n' "$(ulimit -Sn)" "$(ulimit -Hn)"
)
printf 'parent_soft=%s parent_hard=%s\n' "$parent_soft" "$parent_hard"
if [ "$(ulimit -Sn)" = "$parent_soft" ] && [ "$(ulimit -Hn)" = "$parent_hard" ]; then printf 'parent_limits_unchanged=yes\n'; else printf 'parent_limits_unchanged=no\n'; fi
printf 'cleanup=done\n'
```

## Expected result
subshell_soft=40 next to the unchanged hard value, proc_limits_row=soft=40 hard=<same>, child_inherited_soft=40, raise_soft_within_hard=allowed, raise_soft_above_hard=denied (EINVAL for everyone), raise_hard_after_lowering=denied for an unprivileged user or allowed-privileged when the shell is root (CAP_SYS_RESOURCE), subshell_final_soft=60 with subshell_final_hard=60 (100 as root), parent_limits_unchanged=yes, and cleanup=done.

## Systems lens
A resource limit is a pair: a soft value the process lives under and a hard ceiling it may not exceed. Unprivileged code can tune the soft value freely below the ceiling and can only ever lower the ceiling, which is why supervisors set hard limits before dropping privileges and why a service cannot fix its own RLIMIT_NOFILE at runtime.

## Optional variation
Copy the complete code into a private Bash run and change only **ulimit -Sn 40** to
**ulimit -Sn 32**. Keep the parentheses, later limit changes and parent comparisons unchanged.
The subshell and its child now report32 initially; parent_limits_unchanged remains yes.

The child inherits the smaller soft limit, while the enclosing parentheses keep that mutation
away from the persistent parent. For a service reaching EMFILE, its own /proc/PID/limits row
identifies the enforced boundary; the supervisor's limits help explain inheritance. Filesystem
free space measures a different resource.
