# Triage a bounded file-descriptor leak

slug: triage-fd-leak
category: troubleshooting-capstones
difficulty: advanced
tags: troubleshooting, file-descriptors, procfs
prerequisites: inherited-open-files, limit-open-files
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 15
revision: 2

## Overview
A worker keeps more file handles after another batch of work. Measure the change and identify which paths remain open before choosing a limit increase or a lifecycle fix. The bounded reproduction retains at most 48 lab files.

## Syntax breakdown
### In plain terms

A large descriptor count might be a legitimate working set. A second work batch that leaves another known set open provides stronger evidence of retention. Join the count to paths to identify the owner and resource kind.

### What you are learning

- A descriptor is a process-local reference to an open kernel object; retaining a Python file object keeps its descriptor live.
- A before/after delta separates this batch's retained handles from standard streams and inherited descriptors.
- lsof lists mappings and other references as well as numbered descriptors, so its total row count is not a descriptor count.

### Piece by piece

- **Lab paths and shell control.** LINUX_LAB selects the directory; the HOME fallback is used only when it is empty. **mkdir -p** creates it idempotently. UID and the shell PID ($$) distinguish this run's names. Quoted expansions keep paths intact. **printf** prints labeled values; **$(...)** captures output, and **$((...))** performs integer arithmetic.
- **Ownership and cleanup.** **&** starts a child and **$!** records its exact PID. **trap ... EXIT** installs cleanup before the child starts. **kill** requests termination and **wait** reaps that child; **|| true** tolerates an already exited child during cleanup. **rm -f** removes only named lab files, and **trap - EXIT** clears the handler after explicit cleanup. Readiness loops use **test/[ ]**, **break**, and **sleep** to wait for observed state within a fixed bound; an assertion failure exits the experiment's subshell, not your terminal.
- **PREFIX** names exactly 48 possible lab files. **READY**, **GO**, and **DONE** separate the initial twelve opens from the additional thirty-six. **seq 1 100**, **test -e**, and **sleep .02** bound readiness, and **touch "$GO"** releases the second batch after the baseline count.
- **python3 -u -c** starts unbuffered inline Python. **open(...,"w")** creates each file, and **files.append** retains its live file object. The exclusive upper bounds in **range(1,13)** and **range(13,49)** create twelve and thirty-six files respectively. The helper's monotonic deadline bounds waiting for GO; the final sleep bounds observation time.
- **find /proc/PID/fd -mindepth 1 -maxdepth 1** prints only that directory's immediate descriptor entries, and **wc -l** counts them. Sampling after each gate avoids counting temporary coordination-file handles. The difference should be exactly 36 even if the initial count includes extra inherited descriptors.
- **lsof -nP -p "$leak_pid"** selects this PID, suppresses hostname lookup with **-n**, and keeps ports numeric with **-P**. **grep -F "$PREFIX-"** retains literal run-specific file paths; **wc -l** counts those file rows, rather than counting every lsof reference.
- **ls -l /proc/PID/fd** in the hint lists descriptor links in long format, so their targets are visible.
- **test -eq** asserts the growth and matching path counts. After exact termination and wait, **test ! -d /proc/PID/fd** confirms that descriptor table no longer exists. The cleanup loop removes only the 48 named files.

## Run
```sh
(
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
PREFIX=$LAB/fd-leak-$UID-$$
READY=$PREFIX.ready
GO=$PREFIX.go
DONE=$PREFIX.done
leak_pid=
trap 'test -n "$leak_pid" && kill "$leak_pid" 2>/dev/null || true; test -n "$leak_pid" && wait "$leak_pid" 2>/dev/null || true; for n in $(seq 1 48); do rm -f "$PREFIX-$n"; done; rm -f "$READY" "$GO" "$DONE"' EXIT
rm -f "$READY" "$GO" "$DONE"
PREFIX="$PREFIX" READY="$READY" GO="$GO" DONE="$DONE" python3 -u -c 'import os,time
files=[]
for n in range(1,13): files.append(open(os.environ["PREFIX"]+"-%d"%n,"w"))
open(os.environ["READY"],"w").close()
deadline=time.monotonic()+10
while not os.path.exists(os.environ["GO"]):
 if time.monotonic()>deadline: raise SystemExit("descriptor gate timed out")
 time.sleep(.02)
for n in range(13,49): files.append(open(os.environ["PREFIX"]+"-%d"%n,"w"))
open(os.environ["DONE"],"w").close()
time.sleep(20)' &
leak_pid=$!
for attempt in $(seq 1 100); do [ -e "$READY" ] && break; sleep .02; done
[ -e "$READY" ] || exit 1
before=$(find "/proc/$leak_pid/fd" -mindepth 1 -maxdepth 1 | wc -l)
touch "$GO"
for attempt in $(seq 1 100); do [ -e "$DONE" ] && break; sleep .02; done
[ -e "$DONE" ] || exit 1
after=$(find "/proc/$leak_pid/fd" -mindepth 1 -maxdepth 1 | wc -l)
path_count=$(lsof -nP -p "$leak_pid" | grep -F "$PREFIX-" | wc -l)
printf 'leak_pid=%s\nfd_before=%s\nfd_after=%s\nfd_growth=%s\nretained_lab_paths=%s\n' "$leak_pid" "$before" "$after" "$((after-before))" "$path_count"
[ "$((after-before))" -eq 36 ] && [ "$path_count" -eq 48 ] || exit 1
printf 'fd_leak_correlated=yes\n'
kill "$leak_pid"
wait "$leak_pid" 2>/dev/null || true
[ ! -d "/proc/$leak_pid/fd" ] || exit 1
printf 'fd_table_after_stop=absent\n'
leak_pid=
for n in $(seq 1 48); do rm -f "$PREFIX-$n"; done
rm -f "$READY" "$GO" "$DONE"
trap - EXIT
printf 'cleanup=done\n'
)
```

## Expected result
fd_after - fd_before is exactly 36, retained_lab_paths=48 and fd_leak_correlated=yes. Common descriptor counts are 15 then 51, but inherited descriptors can add a fixed offset. fd_table_after_stop=absent verifies release by process exit. Two controlled batches prove retention in this reproduction, not the future slope or cause of an arbitrary production leak.

## Systems lens
Resource exhaustion depends on ownership, retention and the budget. A causal experiment changes one work batch and measures what remains afterward; a lifecycle fix must release references at the intended boundary.

## Optional variation
**Predict:** Does the initial descriptor count have to equal twelve? Name the references that can add a fixed offset.

**Inspect and explain:** Which output proves growth, which identifies the paths, and why is the unfiltered lsof row count unsuitable?

**Vary:** Close the first batch just before READY by inserting **for f in files: f.close()** on its own Python line. Rerun with the final retained_lab_paths expectation changed from 48 to 36. The growth remains 36; the closed first batch no longer contributes live descriptors.

**Hint:** Before cleanup, run **ls -l "/proc/$leak_pid/fd"** to inspect links. The gate-controlled counts supply the worked comparison.

**Apply:** A long-running worker grows by 36 descriptors per batch. Estimate how many further batches its measured soft limit permits, and explain why raising the limit delays failure without correcting ownership.
