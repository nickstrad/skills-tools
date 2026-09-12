# Inspect I/O priority separately from CPU priority

slug: set-io-priority
category: cpu-and-scheduling
difficulty: intermediate
tags: scheduling, storage, resource-limits
prerequisites: cpu-time-vs-wall-time
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Make a bounded reader hold a lab-file read while its I/O class is set to idle, then query it with ionice. Comparing that class with the shell's class demonstrates that I/O scheduling is a separate axis from CPU niceness.

## Syntax breakdown
### In plain terms

This assigns one live reader the idle I/O class, then queries its class separately from CPU niceness. It proves configured state, not a disk-throughput promise, because cache and the active I/O scheduler vary by host.

### What you are learning

- I/O class and CPU nice are separate scheduling dimensions.
- Querying the target PID is required evidence of an intervention.

### Piece by piece

- **dd ... count=4**: creates a bounded four-MiB lab file for the reader.
- **ionice -c 3 -p PID**: **-c 3** requests idle class and **-p** targets only the recorded PID.
- **ionice -p PID**: prints the worker class; the shell query is comparison context.
- **READY**, **time.sleep(1)**, **wait**, and **trap**: keep the reader alive for inspection then clean exact paths and PID.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
F=$LAB/io-priority-$UID.bin
R=$LAB/io-priority-r-$UID
rm -f "$F" "$R"
dd if=/dev/zero of="$F" bs=1M count=4 status=none
p=
trap 'test -n "$p" && kill "$p" 2>/dev/null || true; test -n "$p" && wait "$p" 2>/dev/null || true; rm -f "$F" "$R"' EXIT
export F R
python3 -c 'import os,time; open(os.environ["F"],"rb").read(); open(os.environ["R"],"w").close(); time.sleep(1)' &
p=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$R" ] && break
  sleep 0.05
done
if ionice -c 3 -p "$p" 2>/dev/null; then change=applied; else change=not-applied; fi
worker=$(ionice -p "$p" 2>/dev/null)
shell=$(ionice -p $$ 2>/dev/null)
printf 'io_change=%s worker_ionice=%s shell_ionice=%s\n' "$change" "$worker" "$shell"
if printf '%s\n' "$worker" | grep -qi idle; then printf 'io_class=idle\n'; else printf 'io_class=other\n'; fi
wait "$p" 2>/dev/null || true
p=
rm -f "$F" "$R"
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
io_change=applied, worker_ionice contains idle, io_class=idle, and cleanup=done. The shell's class may be none or best-effort and is printed only for comparison.

## Systems lens
CPU scheduling weight and block-device I/O class affect different queues. A process can be CPU-favored yet I/O-deprioritized, so incident diagnosis must inspect both dimensions.

## Optional variation
**Predict:** Does idle I/O class change the worker's CPU nice value?

**Inspect and explain:** Explain why the queried I/O class and CPU nice value describe different scheduling policies.

**Vary:** Rerun the complete lesson and insert ps -o ni= -p "$p" immediately after worker=$(ionice ...) captures the changed I/O class. Compare CPU niceness with I/O class before cleanup.

**Hint:** Cached read throughput cannot prove I/O scheduling behavior.

**Apply:** Name one CPU and one I/O measurement for a slow background compaction job.
