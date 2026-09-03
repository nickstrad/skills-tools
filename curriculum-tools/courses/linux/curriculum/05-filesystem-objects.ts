import { code, type Module } from "../../../src/types.ts";

export const FILESYSTEM: Module = {
  category: "filesystem-objects",
  title: "Follow names, inodes, links, and atomic namespace changes",
  lessons: [
    {
      slug: "paths-and-inodes",
      title: "Follow a file through a rename",
      difficulty: "beginner",
      tags: ["filesystem", "inodes", "shell"],
      prerequisites: ["build-disposable-linux-lab"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 10,
      overview:
        code`Create a file, record its device and inode, rename its directory entry, and read it through the new name. The stable inode and bytes show that a path name is a lookup handle, not the file's identity.`,
      syntaxBreakdown:
        code`stat -c prints selected inode fields; mv changes a directory entry; cat reads file contents; test -e checks name existence; cmp compares exact metadata strings.`,
      code: code`
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
`,
      expectedResult:
        code`before_device_inode_size and after_device_inode_size contain identical device, inode, and size fields; old_name_exists=no; new_contents=inode-payload; and rename_preserved_inode=yes.`,
      systemsLens:
        code`Directories map names to inode records. Rename on one filesystem changes those namespace references atomically while the inode and file data remain in place, the basis for safe deployment swaps.`,
    },
    {
      slug: "hard-link-counts",
      title: "Watch an inode's hard-link count change",
      difficulty: "beginner",
      tags: ["filesystem", "inodes"],
      prerequisites: ["paths-and-inodes"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 10,
      overview:
        code`Add a second hard-link name to one file, then remove each name in turn. The inode number remains stable while the link count moves from one to two and back, exposing directory entries as references to one object.`,
      syntaxBreakdown:
        code`ln creates a hard link; stat -c %i and %h print inode and link count; rm removes exactly one name; test -e checks whether a pathname remains.`,
      code: code`
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
`,
      expectedResult:
        code`inode and secondary_inode match; link_counts=1->2->1; primary_exists=no; secondary_contents=shared-by-names; and hard_link_invariant=observed.`,
      systemsLens:
        code`An inode remains reachable while at least one directory entry or open reference points to it. Garbage collection of files therefore resembles reference counting: unlink removes one name, not necessarily the object.`,
    },
    {
      slug: "symlink-resolution",
      title: "Compare symbolic-link lookup with inode lookup",
      difficulty: "beginner",
      tags: ["filesystem", "inodes"],
      prerequisites: ["paths-and-inodes"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 10,
      overview:
        code`Create a relative symbolic link and a broken one, then compare lstat, stat, and readlink -f. A symlink stores another path and can therefore resolve to a target inode—or fail when the target name disappears.`,
      syntaxBreakdown:
        code`ln -s creates a symbolic link; stat follows a link by default; stat -c %F reports the object type; lstat is requested with stat -L disabled; readlink prints or canonicalizes link text.`,
      code: code`
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
`,
      expectedResult:
        code`link_type=symbolic link, link_text is the target basename, resolved_target is the absolute target path, target_inode equals link_followed_inode, broken_lstat_type=symbolic link, broken_stat=failed, and symlink_lookup=observed.`,
      systemsLens:
        code`Unlike a hard link, a symlink is a path-bearing inode interpreted during lookup. Relative links are relocatable within a tree, while broken links demonstrate that the target name is not embedded data.`,
    },
    {
      slug: "permissions-and-umask",
      title: "Separate creation policy from inode mode",
      difficulty: "beginner",
      tags: ["filesystem", "inodes", "shell"],
      prerequisites: ["paths-and-inodes"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      overview:
        code`Create two files under different umasks, inspect their resulting mode bits, then add execute permission to one file. The experiment separates the creation-time policy from the inode permission bits later checked by the kernel.`,
      syntaxBreakdown:
        code`umask prints or sets the process creation mask; a shell redirection creates a regular file with requested mode 0666; stat -c %a reports octal mode; chmod changes mode; test -x checks execute permission.`,
      code: code`
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
`,
      expectedResult:
        code`private_mode=600 and shared_mode=644 from requested 0666 masked by 077 and 022; private_execute_after_chmod=yes; and creation_policy=umask_then_chmod.`,
      systemsLens:
        code`The umask is a process-local default applied at creation, while permissions live on the inode and can be changed afterward. This two-stage policy is a simple form of least privilege and inherited configuration.`,
    },
    {
      slug: "atomic-rename",
      title: "Observe a pathname switch without partial files",
      difficulty: "intermediate",
      tags: ["filesystem", "inodes", "processes"],
      prerequisites: ["paths-and-inodes"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 14,
      overview:
        code`Have a reader repeatedly open one pathname while a writer replaces it with complete alpha and omega files. The reader should observe whole values only, demonstrating same-filesystem rename as an atomic namespace operation.`,
      syntaxBreakdown:
        code`mv -f atomically changes a directory entry; read opens and consumes one complete record without spawning a process; a background loop creates concurrent reads; case classifies observations; wait joins the reader; trap kills only the recorded reader and removes lab files.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
TARGET=$LAB/atomic-current-$UID
TEMP=$LAB/atomic-temp-$UID
BAD=$LAB/atomic-bad-$UID
printf 'alpha\n' > "$TARGET"
rm -f "$BAD"
reader_pid=
trap 'test -n "$reader_pid" && kill "$reader_pid" 2>/dev/null || true; test -n "$reader_pid" && wait "$reader_pid" 2>/dev/null || true; rm -f "$TARGET" "$TEMP" "$BAD"' EXIT
( for iteration in $(seq 1 3000); do
    value=
    IFS= read -r value < "$TARGET" || true
    case "$value" in
      alpha|omega) ;;
      "") ;;
      *) printf '%s\n' "$value" > "$BAD"; break ;;
    esac
  done ) &
reader_pid=$!
for iteration in $(seq 1 200); do
  printf 'omega\n' > "$TEMP"
  mv -f "$TEMP" "$TARGET"
  printf 'alpha\n' > "$TEMP"
  mv -f "$TEMP" "$TARGET"
done
wait "$reader_pid"
reader_pid=
if [ -s "$BAD" ]; then printf 'invalid_observation=%s\n' "$(cat "$BAD")"; else printf 'invalid_observation=none\n'; fi
printf 'reader_samples=3000 writer_swaps=400\n'
if [ ! -s "$BAD" ]; then printf 'atomicity=preserved\n'; else printf 'atomicity=violated\n'; fi
rm -f "$TARGET" "$TEMP" "$BAD"
trap - EXIT
`,
      expectedResult:
        code`invalid_observation=none and atomicity=preserved; the reader sees only complete alpha or omega records (an empty read is tolerated if the writer is between names). reader_samples=3000 and writer_swaps=400 are bounded workload labels.`,
      systemsLens:
        code`Rename changes a directory's pointer in one namespace operation, allowing readers to choose an old complete object or a new complete object. Release artifacts and configuration rollouts use this commit-like boundary.`,
    },
    {
      slug: "deleted-open-file",
      title: "Keep reading an unlinked file through an open descriptor",
      difficulty: "intermediate",
      tags: ["filesystem", "inodes", "file-descriptors", "procfs"],
      prerequisites: ["inherited-open-files", "hard-link-counts"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 14,
      overview:
        code`Let a child hold a file open, unlink its only pathname, and inspect the child's descriptor through /proc. The bytes remain readable and the link is marked deleted until the final open reference closes.`,
      syntaxBreakdown:
        code`exec 9< opens a read descriptor; rm unlinks the directory entry; readlink /proc/PID/fd/9 exposes the deleted marker; cat follows the still-live descriptor; wait reaps the holder.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
FILE=$LAB/deleted-open-$UID.log
READY=$LAB/deleted-open-ready-$UID
printf 'still-readable\n' > "$FILE"
rm -f "$READY"
holder_pid=
trap 'test -n "$holder_pid" && kill "$holder_pid" 2>/dev/null || true; test -n "$holder_pid" && wait "$holder_pid" 2>/dev/null || true; rm -f "$FILE" "$READY"' EXIT
export FILE READY
bash -c 'exec 9<"$FILE"; : > "$READY"; sleep 2' &
holder_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$READY" ] && break
  sleep 0.05
done
rm "$FILE"
fd_link=$(readlink "/proc/$holder_pid/fd/9")
fd_contents=$(cat "/proc/$holder_pid/fd/9")
printf 'path_exists_after_unlink=%s\n' "$(test -e "$FILE" && echo yes || echo no)"
printf 'fd_link=%s\n' "$fd_link"
printf 'fd_contents=%s\n' "$fd_contents"
if printf '%s' "$fd_link" | grep -q '(deleted)' && [ "$fd_contents" = still-readable ]; then printf 'unlink_kept_open_reference=yes\n'; else printf 'unlink_kept_open_reference=no\n'; fi
wait "$holder_pid"
holder_pid=
rm -f "$FILE" "$READY"
trap - EXIT
`,
      expectedResult:
        code`path_exists_after_unlink=no, fd_link contains (deleted), fd_contents=still-readable, and unlink_kept_open_reference=yes. The pathname disappears immediately, while the inode is reclaimed only after the holder exits.`,
      systemsLens:
        code`unlink removes a directory reference; an open-file description remains valid independently. This explains deleted log files consuming space, graceful rotation, and why closing the final descriptor is part of reclamation.`,
    },
  ],
};
