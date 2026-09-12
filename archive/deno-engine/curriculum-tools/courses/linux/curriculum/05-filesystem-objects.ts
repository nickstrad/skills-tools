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
      revision: 2,
      overview:
        code`Create a file, record its device and inode, rename its directory entry, and read it through the new name. The stable inode and bytes show that a path name is a lookup handle, not the file's identity.`,
      syntaxBreakdown: code`### In plain terms

This asks whether a rename changes a file object or only the name used to reach it. The evidence is the device-and-inode pair before and after the move, plus bytes read through the new name; that distinction matters when a service publishes or rotates files.

### What you are learning

- A directory entry maps a pathname to an inode. A rename changes that entry without making a new inode.
- Device and inode together identify an object within a mounted filesystem.

### Piece by piece

- **mkdir -p** (shell command): creates the lab directory when absent, keeping every pathname inside the learner-owned boundary.
- **stat -c '%d %i %s'** (metadata reader): **-c** selects fields; **%d**, **%i**, and **%s** are device, inode, and byte size. It records identity before and after the move; matching fields prove the object stayed the same.
- **mv** (rename command): asks the filesystem to change a directory entry. Here it supplies the name transition under examination.
- **test -e** and **cat** (predicate and reader): test verifies the old name no longer resolves and cat verifies bytes through the new one. Together they distinguish lookup visibility from identity.`,
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
      challenge:
        '**Predict:** If a second hard link exists before a rename, will its device-and-inode pair change?\n\n**Inspect and explain:** Run this complete bounded example:\n\n```bash\nlab=$LINUX_LAB; if [ -z "$lab" ]; then lab=$HOME/linux-systems-lab; fi; mkdir -p "$lab"; a="$lab/rename-vary-$UID"; b="$a.peer"; c="$a.new"; printf x > "$a"; ln "$a" "$b"; mv "$a" "$c"; stat -c \'%d:%i %h %n\' "$b" "$c"; rm -f "$b" "$c"\n```\n\nCompare both device-and-inode pairs and link counts after the rename. Which name changed, and which object remained?\n\n**Vary:** This one rename is the bounded variation.\n\n**Hint:** Keep all three paths below one lab directory; a cross-filesystem **mv** can copy instead of using one rename.\n\n**Apply:** For a service publishing a completed configuration file, state which evidence proves visibility and which evidence would still be needed for crash durability.',
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
      revision: 2,
      overview:
        code`Add a second hard-link name to one file, then remove each name in turn. The inode number remains stable while the link count moves from one to two and back, exposing directory entries as references to one object.`,
      syntaxBreakdown: code`### In plain terms

This gives one inode two names and removes one of them. The link count and surviving bytes show that deleting a pathname does not by itself delete the object.

### What you are learning

- A hard link is another directory entry for the same inode, not a copied file.
- The inode link count records named references; later lessons add open descriptors as another lifetime reference.

### Piece by piece

- **ln** (hard-link command): creates SECONDARY as another directory entry for PRIMARY's inode. It supplies the controlled reference-count change.
- **stat -c %i** and **stat -c %h** (metadata formats): **%i** prints inode number and **%h** prints hard-link count. The 1 to 2 to 1 sequence is the evidence to read.
- **rm** (unlink command): removes only the named directory entry passed to it. Here it removes PRIMARY while leaving SECONDARY.
- **test -e** and **cat** (predicate and reader): verify the removed name fails and the surviving name still yields shared bytes.`,
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
      challenge:
        '**Predict:** After creating a second hard link, what count should every name report?\n\n**Inspect and explain:** Run this complete bounded example:\n\n```bash\nlab=$LINUX_LAB; if [ -z "$lab" ]; then lab=$HOME/linux-systems-lab; fi; mkdir -p "$lab"; a="$lab/hard-vary-$UID"; b="$a.third"; printf x > "$a"; ln "$a" "$b"; stat -c \'%i %h %n\' "$a" "$b"; rm -f "$a" "$b"\n```\n\nCompare inode numbers and link counts for the two names. Explain why removing either name alone would not remove the other.\n\n**Vary:** This creates and removes exactly one extra hard link.\n\n**Hint:** Do not use **cp**; it makes a distinct inode and answers a different question.\n\n**Apply:** Choose whether a service should use a hard link or rename for publishing a replacement file, and defend the reader-visible behavior.',
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
      revision: 2,
      overview:
        code`Create a relative symbolic link and a broken one, then compare lstat, stat, and readlink -f. A symlink stores another path and can therefore resolve to a target inode—or fail when the target name disappears.`,
      syntaxBreakdown: code`### In plain terms

This compares path text stored in a symlink with the inode reached through that path. A valid relative link resolves to the target; a deliberately broken link remains a symlink but cannot complete lookup.

### What you are learning

- A symbolic link stores path text and is resolved during pathname lookup.
- Metadata tools can inspect the link itself or follow it to a target; those are different questions.

### Piece by piece

- **ln -s** (link command and flag): **-s** selects a symbolic, path-bearing link. It creates one relative link and one missing-target link.
- **stat -c %F** and **stat -L -c %F** (metadata reader and dereference flag): **%F** prints object type; **-L** follows a link. The first reports symbolic link and the second reports regular file for the valid path.
- **readlink** and **readlink -f** (link reader and canonicalize flag): readlink prints stored text; **-f** follows components to an absolute path, but permits the last component to be missing. A printed canonical path is not proof that its target exists; the following stat -L checks that.
- **stat -L** on BROKEN (followed lookup): it is expected to fail, providing the failed-resolution evidence.`,
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
      challenge:
        '**Predict:** If a target is renamed after a relative link is created, does the link still resolve?\n\n**Inspect and explain:** Run this complete bounded example:\n\n```bash\nlab=$LINUX_LAB; if [ -z "$lab" ]; then lab=$HOME/linux-systems-lab; fi; mkdir -p "$lab"; a="$lab/symlink-vary-$UID"; l="$a.link"; printf x > "$a"; ln -s "$(basename "$a")" "$l"; mv "$a" "$a.moved"; printf \'stored=%s resolved=\' "$(readlink "$l")"; readlink -f "$l"; if stat -L "$l" >/dev/null 2>&1; then printf \'target_exists=yes\\n\'; else printf \'target_exists=no\\n\'; fi; rm -f "$l" "$a.moved"\n```\n\nExplain why readlink -f can print an absolute path while stat -L reports that the target is absent.\n\n**Vary:** This moves one target once within the lab.\n\n**Hint:** readlink -f may print a path whose final component is absent; stat -L supplies the actual existence check.\n\n**Apply:** For a symlink naming the current release, explain how you would publish a replacement pointer atomically and verify that its target exists.',
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
      revision: 2,
      overview:
        code`Create two files under different umasks, inspect their resulting mode bits, then add execute permission to one file. The experiment separates the creation-time policy from the inode permission bits later checked by the kernel.`,
      syntaxBreakdown: code`### In plain terms

This separates a process creation default from the mode stored on an existing inode. Two files begin with different masks, then one receives an explicit execute bit, showing which decision applies at creation and which applies later.

### What you are learning

- umask removes permissions from requested creation modes for one process.
- chmod changes existing inode mode bits; it does not alter a past creation mask.

### Piece by piece

- **umask 077** and **umask 022** (shell creation policy): these masks clear group and other permissions from a new regular file. old_umask is recorded and restored.
- **: > FILE** (shell no-op and redirection): colon succeeds with no output and the redirection creates a file with normal requested mode 0666, then umask removes bits.
- **stat -c %a** (mode reader): **%a** prints the resulting octal permission bits; 600 and 644 are the concrete readings.
- **chmod u+x** and **test -x** (mode editor and predicate): add owner execute after creation and verify it, proving this is a later inode change.`,
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
      challenge:
        '**Predict:** What mode will a new regular file have under **umask 027**?\n\n**Inspect and explain:** Run this complete bounded example:\n\n```bash\nLAB=$LINUX_LAB; if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi; mkdir -p "$LAB"; ( umask 027; : > "$LAB/umask-vary-$UID"; stat -c \'%a %n\' "$LAB/umask-vary-$UID"; rm -f "$LAB/umask-vary-$UID" )\n```\n\nExplain the resulting mode using the creation mask, and why the file has no execute bit.\n\n**Vary:** Use that one subshell so the learner’s shell mask cannot change.\n\n**Hint:** Regular-file creation starts from 666, so no execute bits appear before chmod.\n\n**Apply:** Choose a creation mask for a service writing secrets and explain when explicit chmod remains appropriate.',
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
      revision: 2,
      overview:
        code`Have a reader repeatedly open one pathname while a writer replaces it with complete alpha and omega files. The reader should observe whole values only, demonstrating same-filesystem rename as an atomic namespace operation.`,
      syntaxBreakdown: code`### In plain terms

This publishes complete alpha and omega files repeatedly while another process opens one fixed pathname. Readers should obtain an old complete object or a new complete object, not a partly written stream. It establishes visibility atomicity, not crash durability.

### What you are learning

- Same-filesystem rename is an atomic pathname update when it succeeds.
- Visibility atomicity and durable storage ordering require different evidence.

### Piece by piece

- **printf > TEMP** and **mv -f TEMP TARGET** (writer and forced replacement): printf prepares one complete source file; mv requests rename and **-f** suppresses overwrite prompting. The reader only observes TARGET.
- **IFS= read -r value < TARGET** (shell reader): empty **IFS** preserves whitespace and **-r** prevents backslash interpretation. Every iteration opens TARGET afresh and samples one line.
- **case** (classifier): accepts only complete alpha or omega records. An empty read is also invalid: successful replacement does not introduce a missing-destination gap.
- **wait** and **trap** (join and cleanup): wait joins the recorded reader PID and trap kills only that PID and removes exact lab files on an early exit.`,
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
      *) printf 'invalid=<%s>\n' "$value" > "$BAD"; break ;;
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
printf 'reader_sample_limit=3000 writer_swaps=400\n'
if [ ! -s "$BAD" ]; then printf 'atomicity=preserved\n'; else printf 'atomicity=violated\n'; fi
rm -f "$TARGET" "$TEMP" "$BAD"
trap - EXIT
`,
      expectedResult:
        code`invalid_observation=none and atomicity=preserved; the reader sees only complete alpha or omega records (an empty or partial record is rejected). reader_sample_limit=3000 and writer_swaps=400 are bounded workload labels.`,
      systemsLens:
        code`Rename changes a directory's pointer in one namespace operation, allowing readers to choose an old complete object or a new complete object. Release artifacts and configuration rollouts use this commit-like boundary.`,
      challenge:
        '**Predict:** If a writer overwrites one pathname directly with two writes, what new observation becomes possible?\n\n**Inspect and explain:** Run this complete bounded example:\n\n```bash\nlab=$LINUX_LAB; if [ -z "$lab" ]; then lab=$HOME/linux-systems-lab; fi; mkdir -p "$lab"; f="$lab/direct-vary-$UID"; for n in $(seq 1 10); do printf left > "$f"; printf \'during=\'; cat "$f"; printf \'\\n\'; printf right >> "$f"; done; printf \'final=\'; cat "$f"; rm -f "$f"\n```\n\nCompare each during value with the final value. Explain which incomplete content direct publication exposed.\n\n**Vary:** The loop makes exactly ten direct publications.\n\n**Hint:** Keep TEMP and TARGET on the same mount for the main rename experiment.\n\n**Apply:** State the extra fsync and directory-durability evidence a deployment tool would need before claiming a published file survives power loss.',
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
      revision: 2,
      overview:
        code`Let a child hold a file open, unlink its only pathname, and inspect the child's descriptor through /proc. The bytes remain readable and the link is marked deleted until the final open reference closes.`,
      syntaxBreakdown: code`### In plain terms

This removes a file’s only pathname while a child still has it open. The child’s descriptor remains a live handle, so bytes can be read through procfs and the kernel labels that handle deleted.

### What you are learning

- unlink removes a directory entry; it does not revoke already-open file descriptions.
- Procfs exposes the descriptor-to-object relationship behind hidden disk use.

### Piece by piece

- **exec 9< FILE** (shell descriptor operation): opens FILE for reading on descriptor 9 in the child shell. That specific handle survives later unlink.
- **rm FILE** (unlink command): removes the directory entry only. It supplies the visible-name transition.
- **readlink /proc/PID/fd/9** (procfs inspection): resolves the holder's descriptor link and exposes the **(deleted)** annotation for the nameless object.
- **cat /proc/PID/fd/9**, **wait**, and **trap** (reader, join, cleanup): cat reads through the held descriptor; wait reaps that exact child; trap protects the same PID on failures.`,
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
      challenge:
        '**Predict:** Does creating a replacement at an unlinked pathname change an already-open descriptor’s bytes?\n\n**Inspect and explain:** Run this complete bounded example:\n\n```bash\n( lab=$LINUX_LAB; if [ -z "$lab" ]; then lab=$HOME/linux-systems-lab; fi; mkdir -p "$lab"; f="$lab/deleted-vary-$UID"; printf old > "$f"; exec 9< "$f"; rm "$f"; printf replacement > "$f"; printf \'fd=\'; cat /proc/$BASHPID/fd/9; printf \' path=\'; cat "$f"; exec 9<&-; rm -f "$f" )\n```\n\nExplain why the held descriptor and the replacement pathname return different bytes.\n\n**Vary:** This has one held descriptor and one replacement file.\n\n**Hint:** BASHPID identifies the actual subshell holding descriptor 9; $$ would retain the outer shell PID.\n\n**Apply:** Name the process and filesystem evidence you would use before restarting a service to reclaim a deleted log’s blocks.',
    },
  ],
};
