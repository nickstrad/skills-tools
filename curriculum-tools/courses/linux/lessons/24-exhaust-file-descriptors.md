# Bound descriptor growth with a per-process limit

slug: exhaust-file-descriptors
category: file-descriptors-and-pipes
difficulty: intermediate
tags: file-descriptors, resource-limits, shell
prerequisites: inherited-open-files
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 3

## Overview
Lower the open-file limit only inside a subshell and open descriptors until Bash reports EMFILE. The parent limit remains unchanged, showing that a resource boundary belongs to one process context and its descendants.

## Syntax breakdown
### In plain terms

A subshell lowers only its own soft descriptor limit and opens one file repeatedly until the kernel refuses another open. Leaving the subshell closes those descriptors and preserves the parent limit.

### What you are learning

- RLIMIT_NOFILE is inherited per process and limits descriptor numbers.
- EMFILE exhaustion differs from requesting a descriptor number already outside the limit.

### Piece by piece

- **ulimit -n** reads or sets Bash's soft open-file limit. The surrounding **( ... )** confines the changed limit to the child shell.
- **exec {fd}>>FILE** asks Bash to allocate the lowest free descriptor and store its number in `fd`; the **>>** redirection opens FILE for append.
- The **while** loop counts successful opens until Bash reports `Too many open files` (EMFILE). Redirecting its error captures the diagnostic for the labeled output.
- **ls /proc/$BASHPID/fd | wc -l** lists the subshell Bash descriptor directory rather than ls's own descriptor directory; **wc -l** counts its entries. **sed** extracts the error text; inherited descriptors can change counts.
- The final parent **ulimit -n** comparison proves the boundary did not leak. Subshell exit closes its dynamic descriptors; the trap removes only the lab files.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FILE=$LAB/fd-limit-$UID.log
ERRORS=$LAB/fd-limit-$UID.err
rm -f "$FILE" "$ERRORS"
parent_limit=$(ulimit -n)
trap 'rm -f "$FILE" "$ERRORS"' EXIT
(
  trap 'rm -f "$FILE" "$ERRORS"' EXIT
  ulimit -n 32
  subshell_limit=$(ulimit -n)
  opened=0
  last_fd=
  while exec {fd}>>"$FILE" 2>"$ERRORS"; do
    opened=$((opened + 1))
    last_fd=$fd
  done
  printf 'subshell_limit=%s\n' "$subshell_limit"
  printf 'opened_before_failure=%s\n' "$opened"
  printf 'last_descriptor_opened=%s\n' "$last_fd"
  printf 'open_descriptors_now=%s\n' "$(ls "/proc/$BASHPID/fd" | wc -l)"
  printf 'descriptor_error=%s\n' "$(sed -n '1s/.*: //p' "$ERRORS")"
  if [ -n "$last_fd" ] && [ "$last_fd" -lt "$subshell_limit" ] && grep -q 'Too many open files' "$ERRORS"; then printf 'descriptor_boundary=observed\n'; else printf 'descriptor_boundary=unexpected\n'; fi
)
printf 'parent_limit=%s\n' "$parent_limit"
printf 'parent_limit_unchanged=%s\n' "$(test "$(ulimit -n)" = "$parent_limit" && echo yes || echo no)"
rm -f "$FILE" "$ERRORS"
trap - EXIT
```

## Expected result
subshell_limit=32, opened_before_failure is positive, last_descriptor_opened=31 (the highest number below the limit), opened_before_failure=22 when only the standard streams were inherited (Bash allocates from 10 upward, so 3-9 stay free), open_descriptors_now counts the resulting table, descriptor_error=Too many open files (EMFILE), and descriptor_boundary=observed. parent_limit_unchanged=yes proves the parent soft limit was not changed; the exact count depends on inherited descriptors.

## Systems lens
Descriptor limits cap kernel references held by one process, preventing an FD leak from consuming the whole host. The same per-process boundary protects web servers, proxies, and file watchers.

## Optional variation
Change only `ulimit -n 32` to24 and rerun, leaving the limit change inside `( ... )`.
Compare opened_before_failure and last_descriptor_opened with the original run: the lower limit
allows fewer allocations with the same inherited descriptors, and the last descriptor must be
below24. Exact counts still depend on inherited descriptors.

The expected failure remains EMFILE and parent_limit_unchanged=yes. Subshell exit closes its
allocated references. For a suspected service leak, descriptor growth and the affected process's
limit identify the resource boundary to investigate before choosing a restart policy.
