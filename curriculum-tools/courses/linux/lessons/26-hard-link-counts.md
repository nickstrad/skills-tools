# Watch an inode's hard-link count change

slug: hard-link-counts
category: filesystem-objects
difficulty: beginner
tags: filesystem, inodes
prerequisites: paths-and-inodes
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 10
revision: 2

## Overview
Add a second hard-link name to one file, then remove each name in turn. The inode number remains stable while the link count moves from one to two and back, exposing directory entries as references to one object.

## Syntax breakdown
### In plain terms

This gives one inode two names and removes one of them. The link count and surviving bytes show that deleting a pathname does not by itself delete the object.

### What you are learning

- A hard link is another directory entry for the same inode, not a copied file.
- The inode link count records named references; later lessons add open descriptors as another lifetime reference.

### Piece by piece

- **ln** (hard-link command): creates SECONDARY as another directory entry for PRIMARY's inode. It supplies the controlled reference-count change.
- **stat -c %i** and **stat -c %h** (metadata formats): **%i** prints inode number and **%h** prints hard-link count. The 1 to 2 to 1 sequence is the evidence to read.
- **rm** (unlink command): removes only the named directory entry passed to it. Here it removes PRIMARY while leaving SECONDARY.
- **test -e** and **cat** (predicate and reader): verify the removed name fails and the surviving name still yields shared bytes.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
PRIMARY=$LAB/hard-primary-$UID
SECONDARY=$LAB/hard-secondary-$UID
trap 'rm -f "$PRIMARY" "$SECONDARY"' EXIT
printf 'shared-by-names\n' > "$PRIMARY"
inode=$(stat -c %i "$PRIMARY")
count_one=$(stat -c %h "$PRIMARY")
ln "$PRIMARY" "$SECONDARY"
count_two=$(stat -c %h "$PRIMARY")
second_inode=$(stat -c %i "$SECONDARY")
rm "$PRIMARY"
count_after_remove=$(stat -c %h "$SECONDARY")
printf 'inode=%s secondary_inode=%s\n' "$inode" "$second_inode"
printf 'link_counts=%s->%s->%s\n' "$count_one" "$count_two" "$count_after_remove"
printf 'primary_exists=%s secondary_contents=%s\n' "$(test -e "$PRIMARY" && echo yes || echo no)" "$(cat "$SECONDARY")"
if [ "$inode" = "$second_inode" ] && [ "$count_one" -eq 1 ] && [ "$count_two" -eq 2 ] && [ "$count_after_remove" -eq 1 ]; then printf 'hard_link_invariant=observed\n'; else printf 'hard_link_invariant=unexpected\n'; fi
rm -f "$PRIMARY" "$SECONDARY"
trap - EXIT
```

## Expected result
inode and secondary_inode match; link_counts=1->2->1; primary_exists=no; secondary_contents=shared-by-names; and hard_link_invariant=observed.

## Systems lens
An inode remains reachable while at least one directory entry or open reference points to it. Garbage collection of files therefore resembles reference counting: unlink removes one name, not necessarily the object.

## Optional variation
**Predict:** After creating a second hard link, what count should every name report?

**Inspect and explain:** Run this complete bounded example:

```bash
lab=$LINUX_LAB; if [ -z "$lab" ]; then lab=$HOME/linux-systems-lab; fi; mkdir -p "$lab"; a="$lab/hard-vary-$UID"; b="$a.third"; printf x > "$a"; ln "$a" "$b"; stat -c '%i %h %n' "$a" "$b"; rm -f "$a" "$b"
```

Compare inode numbers and link counts for the two names. Explain why removing either name alone would not remove the other.

**Vary:** This creates and removes exactly one extra hard link.

**Hint:** Do not use **cp**; it makes a distinct inode and answers a different question.

**Apply:** Choose whether a service should use a hard link or rename for publishing a replacement file, and defend the reader-visible behavior.
