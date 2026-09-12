# Compare symbolic-link lookup with inode lookup

slug: symlink-resolution
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
Create a relative symbolic link and a broken one, then compare lstat, stat, and readlink -f. A symlink stores another path and can therefore resolve to a target inode—or fail when the target name disappears.

## Syntax breakdown
### In plain terms

This compares path text stored in a symlink with the inode reached through that path. A valid relative link resolves to the target; a deliberately broken link remains a symlink but cannot complete lookup.

### What you are learning

- A symbolic link stores path text and is resolved during pathname lookup.
- Metadata tools can inspect the link itself or follow it to a target; those are different questions.

### Piece by piece

- **ln -s** (link command and flag): **-s** selects a symbolic, path-bearing link. It creates one relative link and one missing-target link.
- **stat -c %F** and **stat -L -c %F** (metadata reader and dereference flag): **%F** prints object type; **-L** follows a link. The first reports symbolic link and the second reports regular file for the valid path.
- **readlink** and **readlink -f** (link reader and canonicalize flag): readlink prints stored text; **-f** follows components to an absolute path, but permits the last component to be missing. A printed canonical path is not proof that its target exists; the following stat -L checks that.
- **stat -L** on BROKEN (followed lookup): it is expected to fail, providing the failed-resolution evidence.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
TARGET=$LAB/symlink-target-$UID.txt
LINK=$LAB/symlink-link-$UID
BROKEN=$LAB/symlink-broken-$UID
ERROR=$LAB/symlink-error-$UID
trap 'rm -f "$TARGET" "$LINK" "$BROKEN" "$ERROR"' EXIT
printf 'target-by-path\n' > "$TARGET"
ln -s "$(basename "$TARGET")" "$LINK"
ln -s missing-target-$UID "$BROKEN"
printf 'link_type=%s\n' "$(stat -c %F "$LINK")"
printf 'target_type=%s\n' "$(stat -L -c %F "$LINK")"
printf 'link_text=%s\n' "$(readlink "$LINK")"
printf 'resolved_target=%s\n' "$(readlink -f "$LINK")"
printf 'target_inode=%s link_followed_inode=%s\n' "$(stat -c %i "$TARGET")" "$(stat -L -c %i "$LINK")"
if stat -L -c %i "$BROKEN" > /dev/null 2>"$ERROR"; then broken_stat=unexpected-success; else broken_stat=failed; fi
printf 'broken_lstat_type=%s\n' "$(stat -c %F "$BROKEN")"
printf 'broken_stat=%s\n' "$broken_stat"
if [ "$(stat -c %F "$LINK")" = "symbolic link" ] && [ "$(stat -L -c %F "$LINK")" = "regular file" ] && [ "$(readlink -f "$LINK")" = "$TARGET" ] && [ "$broken_stat" = failed ]; then printf 'symlink_lookup=observed\n'; else printf 'symlink_lookup=unexpected\n'; fi
rm -f "$TARGET" "$LINK" "$BROKEN" "$ERROR"
trap - EXIT
```

## Expected result
link_type=symbolic link, link_text is the target basename, resolved_target is the absolute target path, target_inode equals link_followed_inode, broken_lstat_type=symbolic link, broken_stat=failed, and symlink_lookup=observed.

## Systems lens
Unlike a hard link, a symlink is a path-bearing inode interpreted during lookup. Relative links are relocatable within a tree, while broken links demonstrate that the target name is not embedded data.

## Optional variation
**Predict:** If a target is renamed after a relative link is created, does the link still resolve?

**Inspect and explain:** Run this complete bounded example:

```bash
lab=$LINUX_LAB; if [ -z "$lab" ]; then lab=$HOME/linux-systems-lab; fi; mkdir -p "$lab"; a="$lab/symlink-vary-$UID"; l="$a.link"; printf x > "$a"; ln -s "$(basename "$a")" "$l"; mv "$a" "$a.moved"; printf 'stored=%s resolved=' "$(readlink "$l")"; readlink -f "$l"; if stat -L "$l" >/dev/null 2>&1; then printf 'target_exists=yes\n'; else printf 'target_exists=no\n'; fi; rm -f "$l" "$a.moved"
```

Explain why readlink -f can print an absolute path while stat -L reports that the target is absent.

**Vary:** This moves one target once within the lab.

**Hint:** readlink -f may print a path whose final component is absent; stat -L supplies the actual existence check.

**Apply:** For a symlink naming the current release, explain how you would publish a replacement pointer atomically and verify that its target exists.
