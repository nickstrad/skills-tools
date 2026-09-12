# Virtualize process identity with a PID namespace

slug: isolate-pid-namespace
category: namespaces-and-isolation
difficulty: advanced
tags: namespaces, isolation, processes
prerequisites: inspect-namespace-membership
safety: privileged
run-in: shell
sessions: 1
min-version: 5.1
minutes: 14
revision: 3

## Overview
Ask unshare to create a private PID namespace and proc view, then compare inner PID 1 and the inner pid namespace handle with the outer shell's. If the disposable VM policy disallows it, record the bounded skip instead of weakening host isolation.

## Syntax breakdown
### In plain terms

A PID namespace gives processes a different numbering and ancestry view. The command attempts a short-lived private PID view and a proc mount for that view; a host policy denial is an untested mechanism, not proof that PID isolation occurred.

### What you are learning

- PID namespace membership changes process-number visibility, so an inner process can be PID 1 while retaining a distinct outer PID.
- --mount-proc is needed so the inner /proc reports the PID namespace's process view.
- Authority to create a namespace depends on capabilities and host policy, separate from being able to inspect namespace handles.

### Piece by piece

- **as_root** and **sudo -n** (a privilege wrapper)
  - What they are: as_root executes directly as root or invokes sudo **-n**, which refuses a password prompt.
  - What they do here: they attempt only the timeout-bounded unshare command.
  - What they give us: a denied privilege path returns a captured status instead of hanging.
- **timeout 5s unshare --pid --fork --mount-proc bash -c ...** (a private process view)
  - What it is: timeout bounds wall time; unshare creates namespaces; **--pid** selects PID numbering, **--fork** starts a child so it enters the new PID namespace, and **--mount-proc** mounts proc for that view.
  - What it does here: the inner shell prints its PID and pid namespace handle, then sleeps briefly.
  - What it gives us: inner_pid=1 plus a distinct inner_ns and outer_ns is successful isolation evidence.
- **readlink /proc/self/ns/pid** (a membership handle)
  - What it is: readlink displays the PID namespace link for the process reading it.
  - What it does here: both outer and inner shells print their own handle.
  - What it gives us: compare the handles; an inner PID of 1 alone does not explain which view was used.
- **status=0; COMMAND || status=$?** and **grep** (failure classification)
  - What they are: this idiom preserves a nonzero command status; grep checks for the exact inner PID line.
  - What they do here: they separate successful evidence from a policy or setup failure.
  - What they give us: skipped-host-policy records that isolation was not observed and must not be cited as success.

## Caution
Run only on the dedicated disposable VM. The command is bounded and creates no persistent process; never replace it with a host-wide process kill.

## Run
```sh
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo -n "$@"; fi; }
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
OUT=$LAB/pid-namespace-$UID-$$.out
trap 'rm -f "$OUT"' EXIT
outer_pid=$$
status=0
as_root timeout 5s unshare --pid --fork --mount-proc bash -c 'printf "inner_pid=%s\n" "$$"; printf "inner_ns=%s\n" "$(readlink /proc/self/ns/pid)"; sleep .2' >"$OUT" 2>&1 || status=$?
printf 'outer_pid=%s\nouter_ns=%s\nunshare_status=%s\n' "$outer_pid" "$(readlink /proc/self/ns/pid)" "$status"
if [ "$status" -eq 0 ] && grep -q '^inner_pid=1$' "$OUT"; then
  printf 'inner_pid=1\n'
  printf 'inner_ns=%s\n' "$(sed -n 's/^inner_ns=//p' "$OUT")"
  printf 'pid_namespace_isolated=yes\n'
else
  printf 'pid_namespace_isolated=skipped-host-policy\nskip_reason=%s\n' "$(head -n 1 "$OUT" | cut -c1-120)"
fi
rm -f "$OUT"
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
On a permitted VM, unshare_status=0, inner_pid=1, inner_ns is a pid:[...] handle different from outer_ns, and pid_namespace_isolated=yes while outer_pid differs. On a restricted host, pid_namespace_isolated=skipped-host-policy is valid and cleanup=done must appear.

## Systems lens
PID namespaces virtualize task identity and ancestry. A process can be PID 1 inside while having an unrelated outer PID, the basis for process isolation and container init behavior.

## Optional variation
**Predict:** If the command is permitted, which number will the inner shell print for itself and why is the outer shell's PID unrelated?

**Inspect and explain:** Compare outer_ns and inner_ns. Explain why a policy skip cannot support a claim about PID 1 behavior.

**Vary:** Rerun the complete lesson, changing only the inner sleep .2 to sleep .1. Keep --mount-proc, the timeout and the PID/namespace checks; a shorter lifetime does not change the identity mapping.

**Hint:** Keep the timeout and do not target host processes from inside the experiment.

**Apply:** A diagnostic shows PID 1 in a service shell. Which namespace-handle and outer-PID evidence would you request before treating it as the host init process?
