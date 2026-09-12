# Distinguish zombie retention from orphan reparenting

slug: zombies-and-orphans
category: lifecycle-and-signals
difficulty: intermediate
tags: processes, procfs, signals
prerequisites: wait-and-exit-status
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 18
revision: 2

## Overview
Use a bounded Python parent that leaves one exited child unreaped briefly and lets another child outlive it. Observe a Z state before wait, then compare the orphan's parent PID before and after reparenting.

## Syntax breakdown
### In plain terms

A bounded Python parent leaves one exited child unreaped briefly and lets another outlive it. The resulting state samples distinguish a zombie status record from an orphan's new parent relationship.

### What you are learning

- Exit and reaping are separate lifecycle events.
- Orphan reparenting depends on the host's init or configured subreaper.

### Piece by piece

- **os.fork** creates the zombie and orphan children. **os._exit** ends a child without Python cleanup; **os.waitpid(z,0)** later reaps the zombie.
- The Python helper writes its three PIDs and uses **time.sleep** to create bounded observation windows. **$!** records the outer Python parent for exact trap cleanup.
- The shell polls fixed attempts for the PID and report files. **ps -o stat=** samples the zombie state; **awk -F=** reads before/after parent IDs.
- `zombie_state=Z` and differing orphan PPIDs are observations. The new parent is commonly 1 but may be a subreaper, so the lesson reports a relationship rather than a fixed PID.

## Caution
This experiment uses only two exact children and waits for bounded completion. Never generalize it into host-wide process cleanup.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
PID_FILE=$LAB/zombie-pids-$UID
REPORT_FILE=$LAB/orphan-report-$UID
rm -f "$PID_FILE" "$REPORT_FILE"
python3 -c 'import os,time,sys; p,r=sys.argv[1:]; z=os.fork(); z == 0 and os._exit(0); o=os.fork(); o == 0 and (open(r,"w").write("before_ppid="+str(os.getppid())+"\n"), time.sleep(.6), open(r,"a").write("after_ppid="+str(os.getppid())+"\n"), time.sleep(.2), os._exit(0)); open(p,"w").write(str(os.getpid())+" "+str(z)+" "+str(o)+"\n"); time.sleep(.25); os.waitpid(z,0); time.sleep(.1)' "$PID_FILE" "$REPORT_FILE" &
python_parent=$!
orphan_pid=
trap 'kill "$python_parent" 2>/dev/null || true; test -n "$orphan_pid" && kill "$orphan_pid" 2>/dev/null || true; wait "$python_parent" "$orphan_pid" 2>/dev/null || true; rm -f "$PID_FILE" "$REPORT_FILE"' EXIT
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  [ -s "$PID_FILE" ] && break
  sleep 0.05
done
read python_record_pid zombie_pid orphan_pid < "$PID_FILE"
zombie_state=$(ps -o stat= -p "$zombie_pid" 2>/dev/null | tr -d ' ' | cut -c1)
printf 'zombie_pid=%s\n' "$zombie_pid"
printf 'zombie_state=%s\n' "$zombie_state"
printf 'orphan_pid=%s\n' "$orphan_pid"
wait "$python_parent"
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  grep -q '^after_ppid=' "$REPORT_FILE" 2>/dev/null && break
  sleep 0.05
done
before_ppid=$(awk -F= '/^before_ppid=/{print $2}' "$REPORT_FILE")
after_ppid=$(awk -F= '/^after_ppid=/{print $2}' "$REPORT_FILE")
printf 'orphan_before_ppid=%s\n' "$before_ppid"
printf 'orphan_after_ppid=%s\n' "$after_ppid"
if [ "$zombie_state" = Z ] && [ "$before_ppid" != "$after_ppid" ]; then printf 'lifecycle_distinction=observed\n'; else printf 'lifecycle_distinction=check_timing_or_subreaper\n'; fi
rm -f "$PID_FILE" "$REPORT_FILE"
trap - EXIT
```

## Expected result
zombie_state=Z while the Python parent delays wait; orphan_before_ppid equals python_record_pid; after the parent exits, orphan_after_ppid differs (commonly 1, or a VM subreaper); and lifecycle_distinction=observed. Exact PIDs and the reaper PID vary.

## Systems lens
Exit and reaping are separate lifecycle events: a zombie retains a small status record until its parent waits, while an orphan is reparented so it can eventually be reaped. Both are failure modes for supervisors that neglect lifecycle ownership.

## Optional variation
**Predict.** Before running, which state and parentage changes would distinguish zombie retention from orphan reparenting?

**Inspect and explain.** Identify which labels are timing-sensitive snapshots and which record the causal wait/reparent sequence.

**Vary.** Change only the Python zombie delay from .25 to .35 seconds and repeat the same bounded checks.

**Hint.** Leave the PID-file polling and exact-PID trap intact.

**Apply.** Describe how a supervisor should distinguish unreaped children from workers merely reparented during a restart.
