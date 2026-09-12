# Separate creation policy from inode mode

slug: permissions-and-umask
category: filesystem-objects
difficulty: beginner
tags: filesystem, inodes, shell
prerequisites: paths-and-inodes
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Create two files under different umasks, inspect their resulting mode bits, then add execute permission to one file. The experiment separates the creation-time policy from the inode permission bits later checked by the kernel.

## Syntax breakdown
### In plain terms

This separates a process creation default from the mode stored on an existing inode. Two files begin with different masks, then one receives an explicit execute bit, showing which decision applies at creation and which applies later.

### What you are learning

- umask removes permissions from requested creation modes for one process.
- chmod changes existing inode mode bits; it does not alter a past creation mask.

### Piece by piece

- **umask 077** and **umask 022** (shell creation policy): these masks clear group and other permissions from a new regular file. old_umask is recorded and restored.
- **: > FILE** (shell no-op and redirection): colon succeeds with no output and the redirection creates a file with normal requested mode 0666, then umask removes bits.
- **stat -c %a** (mode reader): **%a** prints the resulting octal permission bits; 600 and 644 are the concrete readings.
- **chmod u+x** and **test -x** (mode editor and predicate): add owner execute after creation and verify it, proving this is a later inode change.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
PRIVATE=$LAB/umask-private-$UID
SHARED=$LAB/umask-shared-$UID
old_umask=$(umask)
trap 'umask "$old_umask"; rm -f "$PRIVATE" "$SHARED"' EXIT
umask 077
: > "$PRIVATE"
umask 022
: > "$SHARED"
private_mode=$(stat -c %a "$PRIVATE")
shared_mode=$(stat -c %a "$SHARED")
chmod u+x "$PRIVATE"
printf 'private_mode=%s shared_mode=%s\n' "$private_mode" "$shared_mode"
printf 'private_execute_after_chmod=%s\n' "$(test -x "$PRIVATE" && echo yes || echo no)"
if [ "$private_mode" = 600 ] && [ "$shared_mode" = 644 ] && [ -x "$PRIVATE" ]; then printf 'creation_policy=umask_then_chmod\n'; else printf 'creation_policy=unexpected\n'; fi
rm -f "$PRIVATE" "$SHARED"
umask "$old_umask"
trap - EXIT
```

## Expected result
private_mode=600 and shared_mode=644 from requested 0666 masked by 077 and 022; private_execute_after_chmod=yes; and creation_policy=umask_then_chmod.

## Systems lens
The umask is a process-local default applied at creation, while permissions live on the inode and can be changed afterward. This two-stage policy is a simple form of least privilege and inherited configuration.

## Optional variation
**Predict:** What mode will a new regular file have under **umask 027**?

**Inspect and explain:** Run this complete bounded example:

```bash
LAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"; ( umask 027; : > "$LAB/umask-vary-$UID"; stat -c '%a %n' "$LAB/umask-vary-$UID"; rm -f "$LAB/umask-vary-$UID" )
```

Explain the resulting mode using the creation mask, and why the file has no execute bit.

**Vary:** Use that one subshell so the learner’s shell mask cannot change.

**Hint:** Regular-file creation starts from 666, so no execute bits appear before chmod.

**Apply:** Choose a creation mask for a service writing secrets and explain when explicit chmod remains appropriate.
