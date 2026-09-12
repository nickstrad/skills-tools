# Follow a file through a rename

slug: paths-and-inodes
category: filesystem-objects
difficulty: beginner
tags: filesystem, inodes, shell
prerequisites: build-disposable-linux-lab
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 10
revision: 2

## Overview
Create a file, record its device and inode, rename its directory entry, and read it through the new name. The stable inode and bytes show that a path name is a lookup handle, not the file's identity.

## Syntax breakdown
### In plain terms

This asks whether a rename changes a file object or only the name used to reach it. The evidence is the device-and-inode pair before and after the move, plus bytes read through the new name; that distinction matters when a service publishes or rotates files.

### What you are learning

- A directory entry maps a pathname to an inode. A rename changes that entry without making a new inode.
- Device and inode together identify an object within a mounted filesystem.

### Piece by piece

- **mkdir -p** (shell command): creates the lab directory when absent, keeping every pathname inside the learner-owned boundary.
- **stat -c '%d %i %s'** (metadata reader): **-c** selects fields; **%d**, **%i**, and **%s** are device, inode, and byte size. It records identity before and after the move; matching fields prove the object stayed the same.
- **mv** (rename command): asks the filesystem to change a directory entry. Here it supplies the name transition under examination.
- **test -e** and **cat** (predicate and reader): test verifies the old name no longer resolves and cat verifies bytes through the new one. Together they distinguish lookup visibility from identity.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
OLD=$LAB/path-before-$UID.txt
NEW=$LAB/path-after-$UID.txt
trap 'rm -f "$OLD" "$NEW"' EXIT
printf 'inode-payload\n' > "$OLD"
before=$(stat -c '%d %i %s' "$OLD")
mv "$OLD" "$NEW"
after=$(stat -c '%d %i %s' "$NEW")
printf 'before_device_inode_size=%s\n' "$before"
printf 'after_device_inode_size=%s\n' "$after"
printf 'old_name_exists=%s\n' "$(test -e "$OLD" && echo yes || echo no)"
printf 'new_contents=%s\n' "$(cat "$NEW")"
if [ "$(printf '%s\n' "$before" | awk '{print $1,$2,$3}')" = "$after" ] && [ ! -e "$OLD" ]; then printf 'rename_preserved_inode=yes\n'; else printf 'rename_preserved_inode=no\n'; fi
rm -f "$OLD" "$NEW"
trap - EXIT
```

## Expected result
before_device_inode_size and after_device_inode_size contain identical device, inode, and size fields; old_name_exists=no; new_contents=inode-payload; and rename_preserved_inode=yes.

## Systems lens
Directories map names to inode records. Rename on one filesystem changes those namespace references atomically while the inode and file data remain in place, the basis for safe deployment swaps.

## Optional variation
**Predict:** If a second hard link exists before a rename, will its device-and-inode pair change?

**Inspect and explain:** Run this complete bounded example:

```bash
lab=$LINUX_LAB; if [ -z "$lab" ]; then lab=$HOME/linux-systems-lab; fi; mkdir -p "$lab"; a="$lab/rename-vary-$UID"; b="$a.peer"; c="$a.new"; printf x > "$a"; ln "$a" "$b"; mv "$a" "$c"; stat -c '%d:%i %h %n' "$b" "$c"; rm -f "$b" "$c"
```

Compare both device-and-inode pairs and link counts after the rename. Which name changed, and which object remained?

**Vary:** This one rename is the bounded variation.

**Hint:** Keep all three paths below one lab directory; a cross-filesystem **mv** can copy instead of using one rename.

**Apply:** For a service publishing a completed configuration file, state which evidence proves visibility and which evidence would still be needed for crash durability.
