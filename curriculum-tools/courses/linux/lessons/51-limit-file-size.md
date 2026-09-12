# Stop a write at an RLIMIT_FSIZE boundary

slug: limit-file-size
category: resource-boundaries
difficulty: intermediate
tags: resource-limits, filesystem, storage
prerequisites: limit-open-files
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Set a one-mebibyte file-size limit in a child and ask dd to write two mebibytes. The resulting signal or nonzero status and final file size show the kernel enforcing a precise per-process write boundary.

## Syntax breakdown
### In plain terms

This lesson gives only the writer a one-MiB file-size budget, then asks it to write two MiB. RLIMIT_FSIZE is a process policy; it differs from a full filesystem because another writer with no such limit may still have space.

### What you are learning

- RLIMIT_FSIZE limits bytes written to a regular file by the affected process.
- SIGXFSZ or another nonzero result is evidence that the kernel stopped this write path.
- File length is separate evidence from command status.

### Piece by piece

- **ulimit -f 1024** (a Bash limit setting)
  - What it is: in normal Bash, **-f** selects maximum file size in 1024-byte blocks, so 1024 is one MiB. POSIXLY_CORRECT can request POSIX-compatible 512-byte units, so final_bytes is the measurement that resolves the active shell's convention.
  - What it does here: it runs only inside the parentheses surrounding dd.
  - What it gives us: the child inherits a bounded writer policy while the parent remains unchanged.
- **dd if=/dev/zero of=FILE bs=2048 count=1024 status=none** (a bounded writer)
  - What it is: dd copies fixed-size blocks; **if** selects zero bytes, **of** names the lab file, **bs** is bytes per block, **count** is blocks, and **status=none** suppresses progress noise.
  - What it does here: it requests two MiB of output.
  - What it gives us: a nonzero write_status and final_bytes at or below the configured ceiling demonstrate enforcement.
- **stat -c %s** (a metadata query)
  - What it is: stat reads file metadata and **-c %s** prints logical length in bytes.
  - What it does here: it measures the resulting file after dd returns.
  - What it gives us: do not infer a precise boundary from a signal alone; read final_bytes.
- **if ( ... ); then** and **trap** (control and cleanup)
  - What they are: the conditional retains an expected nonzero status, while the EXIT trap removes only this lab file.
  - What they do here: they keep the persistent learner shell usable after a limit signal.
  - What they give us: cleanup=done confirms the temporary evidence file was removed.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
F=$LAB/fsize-$UID.bin
rm -f "$F"
trap 'rm -f "$F"' EXIT
if ( ulimit -f 1024; dd if=/dev/zero of="$F" bs=2048 count=1024 status=none ); then write_status=0; else write_status=$?; fi
size=$(stat -c %s "$F" 2>/dev/null || printf 0)
printf 'write_status=%s final_bytes=%s\n' "$write_status" "$size"
if [ "$write_status" -ne 0 ] && [ "$size" -le 1048576 ]; then printf 'file_size_boundary=observed\n'; else printf 'file_size_boundary=unexpected\n'; fi
rm -f "$F"
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
write_status is nonzero, final_bytes is at most 1048576, file_size_boundary=observed, and cleanup=done. Linux commonly reports status 153 for SIGXFSZ, but shell and dd versions may report another nonzero status.

## Systems lens
A resource limit can interrupt a write path at a byte boundary and deliver a signal. This is different from ENOSPC: the limit belongs to the writer, not the filesystem's free blocks.

## Optional variation
**Predict:** Will a second shell that did not enter the parentheses inherit this one-MiB writer budget?

**Inspect and explain:** Explain why final_bytes and write_status together distinguish an enforced writer limit from a successful short write.

**Vary:** Copy the full lesson into a private run and change only **ulimit -f 1024** to **ulimit -f 512**. The existing status, stat, trap, and exact-file cleanup then measure the smaller writer boundary.

**Hint:** Keep the variation in parentheses so its ulimit cannot affect later lessons.

**Apply:** A log writer stops with SIGXFSZ while df shows free blocks. Which owner and limit would you inspect before attempting filesystem cleanup?
