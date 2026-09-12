# Separate and then duplicate stdout and stderr

slug: redirect-and-duplicate-fds
category: file-descriptors-and-pipes
difficulty: beginner
tags: file-descriptors, shell, pipes
prerequisites: standard-stream-fds
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 10
revision: 2

## Overview
Send a command's stdout and stderr to separate files, then run it with stderr duplicated onto stdout. Comparing the resulting bytes shows that 2>&1 copies a descriptor-table reference at the point where the redirections are evaluated.

## Syntax breakdown
### In plain terms

The first command wires output and diagnostics to different files. The second copies the current stdout descriptor into stderr, so both records reach one file in redirection order.

### What you are learning

- Descriptor duplication copies a table reference at evaluation time.
- Byte comparison distinguishes separate streams from their content.

### Piece by piece

- **> FILE** redirects descriptor 1 and **2> FILE** redirects descriptor 2. **printf ... >&2** explicitly writes the second record to stderr.
- **2>&1** duplicates descriptor 1 into descriptor 2 after `> BOTH` has selected BOTH as stdout, so both writes use the same target.
- **cat** prints the captured bytes in labeled output. **cmp -s** compares files silently and controls the distinct-stream branch with its status.
- The trap and final **rm -f** remove only the three UID-qualified files; `cleanup=done` confirms it.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
OUT=$LAB/redirect-out-$UID.txt
ERR=$LAB/redirect-err-$UID.txt
BOTH=$LAB/redirect-both-$UID.txt
trap 'rm -f "$OUT" "$ERR" "$BOTH"' EXIT
bash -c 'printf stdout-line; printf stderr-line >&2' > "$OUT" 2> "$ERR"
bash -c 'printf stdout-line; printf stderr-line >&2' > "$BOTH" 2>&1
printf 'separate_stdout=%s\n' "$(cat "$OUT")"
printf 'separate_stderr=%s\n' "$(cat "$ERR")"
printf 'duplicated_bytes=%s\n' "$(cat "$BOTH")"
if cmp -s "$OUT" "$ERR"; then printf 'separate_streams=unexpectedly_equal\n'; else printf 'separate_streams=distinct\n'; fi
if [ "$(cat "$BOTH")" = "stdout-linestderr-line" ]; then printf 'duplicate_result=combined\n'; else printf 'duplicate_result=unexpected\n'; fi
rm -f "$OUT" "$ERR" "$BOTH"
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
separate_stdout=stdout-line and separate_stderr=stderr-line, while duplicated_bytes=stdout-linestderr-line and duplicate_result=combined. separate_streams=distinct proves the first invocation kept separate descriptor targets.

## Systems lens
Redirection mutates entries in a process-local table. Descriptor duplication is therefore a wiring operation, much like attaching a service's output to two collectors or joining an adapter to an existing stream.

## Optional variation
Rerun the full block, replacing every stdout-line with normal-line and every stderr-line with
diagnostic-line, including the combined-byte expectation. Keep the redirection order unchanged.
The separate files now contain the new individual records, and duplicated_bytes becomes
normal-linediagnostic-line; both comparison labels retain their successful results.

The second command redirects stdout to BOTH before duplicating it into stderr. Reversing that
order would copy the earlier stdout target into stderr. The first command's separate targets
demonstrate how a service can preserve diagnostics independently of its normal output.
